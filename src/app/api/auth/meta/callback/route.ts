import { NextRequest, NextResponse } from "next/server";
import {
  verifyMetaOAuthState,
  exchangeMetaAuthCode,
  getMetaOAuthRedirectUri,
  fetchGrantedWABAData,
} from "@/lib/whatsapp/meta-oauth";
import { prisma } from "@/lib/prisma";
import { normalizePhoneNumber } from "@/lib/whatsapp/security";
import { WhatsAppConnectionType, WhatsAppConnectionStatus } from "@prisma/client";

/**
 * Meta OAuth / WhatsApp Embedded Signup Callback Route Handler.
 *
 * Production URL:
 * https://bizpilot-nu.vercel.app/api/auth/meta/callback
 *
 * Security Invariants:
 * 1. Validates cryptographic HMAC-SHA256 OAuth state against CSRF attacks.
 * 2. businessId is ALWAYS taken from the verified signed state — never from the browser/query params.
 * 3. Exchanges temporary authorization code for access token exclusively on the server.
 * 4. Fetches WABA ID and phone number IDs server-side and persists them to the correct tenant.
 * 5. Never returns or exposes Meta App Secrets, raw access tokens, or WABA data to the browser.
 * 6. Tenant isolation: verifies the businessId from state belongs to a real business before writing.
 */
export async function GET(request: NextRequest) {
  return handleCallback(request);
}

export async function POST(request: NextRequest) {
  return handleCallback(request);
}

async function handleCallback(request: NextRequest) {
  const url = new URL(request.url);
  const searchParams = url.searchParams;

  // Check for client-side API/JSON preference (e.g. automated tests or fetch clients)
  const isJsonRequest =
    request.headers.get("accept")?.includes("application/json") ||
    searchParams.get("format") === "json";

  // 1. Check for Meta OAuth error responses (e.g. user cancelled or permission denied)
  const error = searchParams.get("error");
  const errorDescription =
    searchParams.get("error_description") ||
    searchParams.get("error_reason") ||
    searchParams.get("error_message");

  if (error) {
    console.warn(`[Meta OAuth Callback] OAuth error from Meta: ${error} - ${errorDescription || "No description"}`);

    if (isJsonRequest) {
      return NextResponse.json(
        {
          success: false,
          error: "meta_oauth_error",
          details: errorDescription || error,
        },
        { status: 400 }
      );
    }

    const redirectUrl = new URL("/settings", request.url);
    redirectUrl.searchParams.set("tab", "whatsapp");
    redirectUrl.searchParams.set("error", "meta_oauth_cancelled");
    redirectUrl.searchParams.set("message", errorDescription || error);
    return NextResponse.redirect(redirectUrl);
  }

  // 2. Extract code and state parameters
  const code = searchParams.get("code");
  const state = searchParams.get("state");

  if (!code || !state) {
    if (isJsonRequest) {
      return NextResponse.json(
        {
          success: false,
          error: "missing_parameters",
          details: "Both 'code' and 'state' query parameters are required for Meta OAuth callback.",
        },
        { status: 400 }
      );
    }

    const redirectUrl = new URL("/settings", request.url);
    redirectUrl.searchParams.set("tab", "whatsapp");
    redirectUrl.searchParams.set("error", "missing_parameters");
    return NextResponse.redirect(redirectUrl);
  }

  // 3. Cryptographic State Validation (CSRF Guard & Tenant Association)
  const stateVerification = verifyMetaOAuthState(state);
  if (!stateVerification.valid || !stateVerification.data) {
    console.error(`[Meta OAuth Callback] CSRF State verification failed: ${stateVerification.error}`);

    if (isJsonRequest) {
      return NextResponse.json(
        {
          success: false,
          error: "invalid_state",
          details: stateVerification.error || "The OAuth state token is invalid, expired, or tampered with.",
        },
        { status: 400 }
      );
    }

    const redirectUrl = new URL("/settings", request.url);
    redirectUrl.searchParams.set("tab", "whatsapp");
    redirectUrl.searchParams.set("error", "invalid_state");
    return NextResponse.redirect(redirectUrl);
  }

  // The businessId from state is cryptographically verified — safe to use server-side
  const { businessId, userId, redirectPath } = stateVerification.data;

  // 4. Server-Side Authorization Code Exchange
  const redirectUri = getMetaOAuthRedirectUri();
  const exchangeResult = await exchangeMetaAuthCode(code, { redirectUri });

  if (!exchangeResult.success || !exchangeResult.accessToken) {
    console.error(`[Meta OAuth Callback] Code exchange failed: ${exchangeResult.error}`);

    if (isJsonRequest) {
      return NextResponse.json(
        {
          success: false,
          error: "token_exchange_failed",
          details: exchangeResult.error || "Failed to exchange authorization code with Meta.",
        },
        { status: 400 }
      );
    }

    const redirectUrl = new URL("/settings", request.url);
    redirectUrl.searchParams.set("tab", "whatsapp");
    redirectUrl.searchParams.set("error", "token_exchange_failed");
    return NextResponse.redirect(redirectUrl);
  }

  const userAccessToken = exchangeResult.accessToken;

  // 5. Fetch the granted WABA data (WABA ID + phone number IDs) from Meta Graph API.
  //    This is the step that bridges the OAuth handshake to the actual WhatsApp Business assets.
  const wabaResult = await fetchGrantedWABAData(userAccessToken);

  let wabaWarning: string | undefined;

  if (!wabaResult.success || !wabaResult.data) {
    // If WABA fetch fails, log the warning but do NOT fail the OAuth flow entirely.
    // The customer completed OAuth — we can surface a UI error and let them retry.
    console.warn(`[Meta OAuth Callback] WABA data fetch failed for business ${businessId}: ${wabaResult.error}`);
    wabaWarning = wabaResult.error || "Could not retrieve WhatsApp Business Account details.";
  } else {
    // 6. Persist the WABA data to the correct tenant's WhatsAppConnection.
    //    Multi-tenancy invariant: businessId comes ONLY from the verified signed state.
    const wabaData = wabaResult.data;
    const firstPhone = wabaData.phoneNumbers[0];

    // Normalize the display phone number to E.164 digits (no '+')
    const normalizedPhone = firstPhone
      ? normalizePhoneNumber(firstPhone.displayPhoneNumber)
      : undefined;

    try {
      // Verify the business actually exists before writing (defence against state forgery)
      const business = await prisma.business.findUnique({ where: { id: businessId } });
      if (!business) {
        console.error(`[Meta OAuth Callback] Business not found for businessId ${businessId} in state`);
        throw new Error("Business not found. The OAuth state may reference a deleted business.");
      }

      // Check if this phone number is already claimed by a different business
      if (normalizedPhone) {
        const phoneConflict = await prisma.whatsAppConnection.findUnique({
          where: { phoneNumber: normalizedPhone },
        });
        if (phoneConflict && phoneConflict.businessId !== businessId) {
          console.error(
            `[Meta OAuth Callback] Phone collision: ${normalizedPhone} already belongs to business ${phoneConflict.businessId}`
          );
          wabaWarning = `Phone number ${firstPhone?.displayPhoneNumber} is already connected to another BizPilot business. Please contact support.`;
          // Do not upsert — skip persisting to avoid cross-tenant overwrite
        }
      }

      if (!wabaWarning) {
        // Upsert the connection — keyed by businessId (one connection per business)
        await prisma.whatsAppConnection.upsert({
          where: { businessId },
          create: {
            businessId,
            userId,
            phoneNumber: normalizedPhone || `waba-${wabaData.wabaId}`,
            connectionType: WhatsAppConnectionType.EMBEDDED_WABA,
            status: WhatsAppConnectionStatus.CONNECTED,
            wabaId: wabaData.wabaId,
            phoneNumberId: firstPhone?.id ?? null,
            metaAccessToken: userAccessToken, // Stored server-side only, never returned to browser
            businessProfileName: firstPhone?.verifiedName ?? wabaData.wabaName ?? null,
            qualityRating: firstPhone?.qualityRating ?? null,
            verified: true,
            // Clear any lingering OTP verification fields
            verificationCodeHash: null,
            verificationExpiresAt: null,
            verificationAttempts: 0,
          },
          update: {
            userId,
            connectionType: WhatsAppConnectionType.EMBEDDED_WABA,
            status: WhatsAppConnectionStatus.CONNECTED,
            wabaId: wabaData.wabaId,
            phoneNumberId: firstPhone?.id ?? null,
            metaAccessToken: userAccessToken,
            businessProfileName: firstPhone?.verifiedName ?? wabaData.wabaName ?? null,
            qualityRating: firstPhone?.qualityRating ?? null,
            verified: true,
            verificationCodeHash: null,
            verificationExpiresAt: null,
            verificationAttempts: 0,
            ...(normalizedPhone ? { phoneNumber: normalizedPhone } : {}),
          },
        });

        console.log(
          `[Meta OAuth Callback] WABA connection saved: businessId=${businessId} wabaId=${wabaData.wabaId} phoneNumberId=${firstPhone?.id ?? "none"}`
        );
      }
    } catch (dbErr: unknown) {
      const dbMsg = dbErr instanceof Error ? dbErr.message : "Database error persisting WABA connection.";
      console.error(`[Meta OAuth Callback] DB write failed: ${dbMsg}`);
      wabaWarning = dbMsg;
    }
  }

  // 7. Successful OAuth Handshake — redirect to settings with result
  //    SECURITY: Access tokens and secrets are NEVER included in the redirect URL or JSON body.
  const targetPath = redirectPath || "/settings?tab=whatsapp";
  const finalRedirect = new URL(targetPath, request.url);
  finalRedirect.searchParams.set("status", wabaWarning ? "oauth_warning" : "oauth_authorized");
  finalRedirect.searchParams.set("businessId", businessId);
  if (wabaWarning) {
    finalRedirect.searchParams.set("message", wabaWarning.slice(0, 200)); // truncate for URL safety
  }

  if (isJsonRequest) {
    return NextResponse.json(
      {
        success: true,
        status: wabaWarning ? "AUTHORIZED_WABA_WARNING" : "AUTHORIZED",
        businessId,
        wabaConnected: !wabaWarning,
        warning: wabaWarning || null,
        redirectUrl: finalRedirect.pathname + finalRedirect.search,
      },
      { status: 200 }
    );
  }

  return NextResponse.redirect(finalRedirect);
}



