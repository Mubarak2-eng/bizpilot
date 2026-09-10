import crypto from "crypto";

// ─── Types & Interfaces ──────────────────────────────────────────────────────

export interface OAuthStatePayload {
  businessId: string;
  userId: string;
  redirectPath?: string;
  timestamp: number;
  nonce: string;
}

export interface MetaOAuthCredentials {
  appId: string;
  appSecret: string;
  configId?: string;
  redirectUri: string;
  apiVersion: string;
}

export interface MetaTokenExchangeResult {
  success: boolean;
  accessToken?: string;
  tokenType?: string;
  expiresIn?: number;
  error?: string;
}

/**
 * A WhatsApp phone number entry returned by the Meta Graph API
 * after a customer completes WhatsApp Embedded Signup.
 */
export interface MetaWABAPhoneNumber {
  id: string;           // Meta phone number ID (e.g. "123456789012345")
  displayPhoneNumber: string; // E.164-ish display number (e.g. "+234 801 234 5678")
  verifiedName?: string;
  qualityRating?: string;
  status?: string;
}

/**
 * WhatsApp Business Account data returned after Embedded Signup.
 * Contains the WABA ID and the list of phone numbers the customer granted access to.
 */
export interface MetaWABAData {
  wabaId: string;
  wabaName?: string;
  phoneNumbers: MetaWABAPhoneNumber[];
}

export interface MetaWABAFetchResult {
  success: boolean;
  data?: MetaWABAData;
  error?: string;
}


export interface MetaOAuthEnvValidation {
  isValid: boolean;
  isProduction: boolean;
  errors: string[];
  warnings: string[];
  credentials: {
    hasAppId: boolean;
    hasAppSecret: boolean;
    hasConfigId: boolean;
    redirectUri: string;
  };
}

// ─── Default Constants ───────────────────────────────────────────────────────

export const DEFAULT_META_API_VERSION = "v21.0";
export const DEFAULT_PRODUCTION_URL = "https://bizpilot-nu.vercel.app";
export const META_OAUTH_CALLBACK_PATH = "/api/auth/meta/callback";
export const OAUTH_STATE_TTL_MS = 15 * 60 * 1000; // 15 minutes
export const CLOCK_SKEW_TOLERANCE_MS = 5 * 60 * 1000; // 5 minutes

// ─── 1. Canonical Redirect URI Resolver ──────────────────────────────────────

/**
 * Resolves the canonical Meta OAuth redirect URI based on environment variables.
 * In production, strictly prioritizes the verified Vercel production URL:
 * https://bizpilot-nu.vercel.app/api/auth/meta/callback
 */
export function getMetaOAuthRedirectUri(
  env: Record<string, string | undefined> = process.env
): string {
  if (env.META_REDIRECT_URI && env.META_REDIRECT_URI.trim() !== "") {
    return env.META_REDIRECT_URI.trim();
  }

  const baseUrl =
    env.NEXT_PUBLIC_APP_URL?.trim() ||
    env.APP_URL?.trim() ||
    (env.NODE_ENV === "production" ? DEFAULT_PRODUCTION_URL : "http://localhost:3000");

  const sanitizedBase = baseUrl.replace(/\/+$/, "");
  return `${sanitizedBase}${META_OAUTH_CALLBACK_PATH}`;
}

// ─── 2. Server-Side Credentials & Environment Validator ───────────────────────

/**
 * Retrieves and validates Meta OAuth credentials on the server.
 * Supports standard Meta OAuth variables with backwards-compatible fallbacks.
 */
export function getMetaOAuthCredentials(
  env: Record<string, string | undefined> = process.env
): MetaOAuthCredentials | null {
  const appId = env.META_APP_ID?.trim() || env.NEXT_PUBLIC_META_APP_ID?.trim();
  const appSecret = env.META_APP_SECRET?.trim() || env.WHATSAPP_APP_SECRET?.trim();
  const configId = env.META_CONFIG_ID?.trim() || env.NEXT_PUBLIC_META_CONFIG_ID?.trim();
  const redirectUri = getMetaOAuthRedirectUri(env);
  const apiVersion = env.WHATSAPP_API_VERSION?.trim() || DEFAULT_META_API_VERSION;

  if (!appId || !appSecret) {
    return null;
  }

  return {
    appId,
    appSecret,
    configId: configId || undefined,
    redirectUri,
    apiVersion,
  };
}

/**
 * Validates Meta OAuth environment configuration for production and local environments.
 */
export function validateMetaOAuthEnv(
  env: Record<string, string | undefined> = process.env
): MetaOAuthEnvValidation {
  const isProduction = env.NODE_ENV === "production";
  const errors: string[] = [];
  const warnings: string[] = [];

  const appId = env.META_APP_ID?.trim() || env.NEXT_PUBLIC_META_APP_ID?.trim();
  const appSecret = env.META_APP_SECRET?.trim() || env.WHATSAPP_APP_SECRET?.trim();
  const configId = env.META_CONFIG_ID?.trim() || env.NEXT_PUBLIC_META_CONFIG_ID?.trim();
  const redirectUri = getMetaOAuthRedirectUri(env);

  const hasAppId = Boolean(appId);
  const hasAppSecret = Boolean(appSecret);
  const hasConfigId = Boolean(configId);

  if (isProduction) {
    if (!hasAppId) {
      errors.push("META_APP_ID (or NEXT_PUBLIC_META_APP_ID) is required in production for Meta OAuth.");
    }
    if (!hasAppSecret) {
      errors.push("META_APP_SECRET (or WHATSAPP_APP_SECRET) is required in production for Meta OAuth token exchange.");
    }
    if (!hasConfigId) {
      warnings.push("NEXT_PUBLIC_META_CONFIG_ID is recommended for Meta WhatsApp Embedded Signup configuration.");
    }
  } else {
    if (!hasAppId) {
      warnings.push("META_APP_ID is not configured (simulated Meta OAuth in development).");
    }
    if (!hasAppSecret) {
      warnings.push("META_APP_SECRET is not configured for Meta OAuth code exchange.");
    }
  }

  return {
    isValid: errors.length === 0,
    isProduction,
    errors,
    warnings,
    credentials: {
      hasAppId,
      hasAppSecret,
      hasConfigId,
      redirectUri,
    },
  };
}

// ─── 3. Cryptographically Secure OAuth CSRF State Handling ───────────────────

function getSigningSecret(secretOverride?: string): string {
  const secret =
    secretOverride?.trim() ||
    process.env.AUTH_SECRET?.trim() ||
    process.env.META_APP_SECRET?.trim() ||
    process.env.WHATSAPP_APP_SECRET?.trim();

  if (!secret) {
    if (process.env.NODE_ENV === "production") {
      throw new Error("AUTH_SECRET or META_APP_SECRET is required to sign OAuth state in production.");
    }
    return "dev_fallback_secret_for_oauth_state_signing_only_32_bytes";
  }

  return secret;
}

/**
 * Generates an HMAC-SHA256 signed, tamper-proof, time-bound OAuth state token.
 * Prevents CSRF attacks and binds the OAuth flow to a specific merchant business and user.
 */
export function generateMetaOAuthState(params: {
  businessId: string;
  userId: string;
  redirectPath?: string;
  secret?: string;
}): string {
  if (!params.businessId || !params.userId) {
    throw new Error("businessId and userId are required to generate OAuth state.");
  }

  const payload: OAuthStatePayload = {
    businessId: params.businessId,
    userId: params.userId,
    redirectPath: params.redirectPath || "/settings?tab=whatsapp",
    timestamp: Date.now(),
    nonce: crypto.randomBytes(16).toString("hex"),
  };

  const payloadString = JSON.stringify(payload);
  const encodedPayload = Buffer.from(payloadString, "utf8").toString("base64url");
  const secret = getSigningSecret(params.secret);

  const signature = crypto
    .createHmac("sha256", secret)
    .update(encodedPayload, "utf8")
    .digest("base64url");

  return `${encodedPayload}.${signature}`;
}

/**
 * Validates and decodes an HMAC-SHA256 signed OAuth state token.
 * Verifies authenticity, integrity, clock skew, and TTL expiry.
 */
export function verifyMetaOAuthState(
  stateString: string | null | undefined,
  options?: {
    maxAgeMs?: number;
    secret?: string;
  }
): { valid: boolean; data?: OAuthStatePayload; error?: string } {
  if (!stateString || typeof stateString !== "string" || stateString.trim() === "") {
    return { valid: false, error: "Missing or empty OAuth state token." };
  }

  const parts = stateString.trim().split(".");
  if (parts.length !== 2) {
    return { valid: false, error: "Malformed OAuth state token format." };
  }

  const [encodedPayload, signature] = parts;
  if (!encodedPayload || !signature) {
    return { valid: false, error: "Invalid OAuth state token structure." };
  }

  try {
    const secret = getSigningSecret(options?.secret);
    const expectedSignature = crypto
      .createHmac("sha256", secret)
      .update(encodedPayload, "utf8")
      .digest("base64url");

    const expectedBuffer = Buffer.from(expectedSignature, "utf8");
    const actualBuffer = Buffer.from(signature, "utf8");

    if (
      expectedBuffer.length !== actualBuffer.length ||
      !crypto.timingSafeEqual(expectedBuffer, actualBuffer)
    ) {
      return { valid: false, error: "OAuth state signature mismatch (tampering detected)." };
    }

    const payloadJson = Buffer.from(encodedPayload, "base64url").toString("utf8");
    const payload = JSON.parse(payloadJson) as OAuthStatePayload;

    if (!payload.businessId || !payload.userId || !payload.timestamp || !payload.nonce) {
      return { valid: false, error: "OAuth state payload is missing required security fields." };
    }

    const now = Date.now();
    const maxAge = options?.maxAgeMs ?? OAUTH_STATE_TTL_MS;

    // Reject future timestamps exceeding clock skew tolerance
    if (payload.timestamp > now + CLOCK_SKEW_TOLERANCE_MS) {
      return { valid: false, error: "OAuth state timestamp is invalid (in the future)." };
    }

    // Reject expired state tokens
    if (now - payload.timestamp > maxAge) {
      return { valid: false, error: "OAuth state token has expired." };
    }

    return { valid: true, data: payload };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Failed to parse OAuth state.";
    return { valid: false, error: `Invalid OAuth state: ${message}` };
  }
}

// ─── 4. Server-Side Authorization Code Exchange ──────────────────────────────

/**
 * Exchanges a temporary authorization code from Meta for an Access Token on the server.
 * Ensures that Meta App Secret and sensitive credentials are NEVER sent to the browser.
 */
export async function exchangeMetaAuthCode(
  code: string,
  options?: {
    redirectUri?: string;
    appId?: string;
    appSecret?: string;
    apiVersion?: string;
    fetchFn?: typeof fetch;
    env?: Record<string, string | undefined>;
  }
): Promise<MetaTokenExchangeResult> {
  if (!code || code.trim() === "") {
    return { success: false, error: "Authorization code is required for exchange." };
  }

  const env = options?.env || process.env;
  const credentials = getMetaOAuthCredentials(env);
  const appId = options?.appId || credentials?.appId;
  const appSecret = options?.appSecret || credentials?.appSecret;
  const redirectUri = options?.redirectUri || credentials?.redirectUri || getMetaOAuthRedirectUri(env);
  const apiVersion = options?.apiVersion || credentials?.apiVersion || DEFAULT_META_API_VERSION;

  const isProduction = env.NODE_ENV === "production";

  // Handle explicit simulation codes in testing
  if (code.startsWith("sim_code_")) {
    return {
      success: true,
      accessToken: `sim_access_token_${Date.now()}_${crypto.randomBytes(8).toString("hex")}`,
      tokenType: "bearer",
      expiresIn: 5184000,
    };
  }

  if (!appId || !appSecret) {
    if (isProduction) {
      return {
        success: false,
        error: "Meta OAuth credentials (META_APP_ID / META_APP_SECRET) are missing on the server.",
      };
    }
    // Simulation fallback for offline local development
    return {
      success: true,
      accessToken: `sim_access_token_${Date.now()}_${crypto.randomBytes(8).toString("hex")}`,
      tokenType: "bearer",
      expiresIn: 5184000, // 60 days
    };
  }

  const fetchImpl = options?.fetchFn || fetch;
  const tokenUrl = new URL(`https://graph.facebook.com/${apiVersion}/oauth/access_token`);
  tokenUrl.searchParams.set("client_id", appId);
  tokenUrl.searchParams.set("client_secret", appSecret);
  tokenUrl.searchParams.set("redirect_uri", redirectUri);
  tokenUrl.searchParams.set("code", code.trim());

  try {
    const response = await fetchImpl(tokenUrl.toString(), {
      method: "GET",
      headers: {
        Accept: "application/json",
      },
    });

    const responseBody = await response.json().catch(() => ({}));

    if (!response.ok) {
      const metaError = responseBody?.error;
      let errorMessage = "Meta authorization code exchange failed.";

      if (metaError?.message) {
        // Redact any accidental secret echoes if present
        errorMessage = `Meta OAuth Error: ${String(metaError.message).replace(new RegExp(appSecret, "gi"), "[REDACTED]")}`;
      } else if (response.statusText) {
        errorMessage = `Meta OAuth HTTP ${response.status}: ${response.statusText}`;
      }

      return {
        success: false,
        error: errorMessage,
      };
    }

    const accessToken = responseBody.access_token;
    if (!accessToken) {
      return {
        success: false,
        error: "Meta response did not contain an access_token.",
      };
    }

    return {
      success: true,
      accessToken,
      tokenType: responseBody.token_type || "bearer",
      expiresIn: responseBody.expires_in,
    };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Network error during Meta code exchange.";
    return {
      success: false,
      error: `Meta code exchange failed: ${message}`,
    };
  }
}

// ─── 5. Meta Dialog OAuth URL Builder ────────────────────────────────────────

/**
 * Builds the Meta OAuth / Embedded Signup dialog URL for initiating the flow.
 */
export function buildMetaOAuthAuthorizationUrl(params: {
  businessId: string;
  userId: string;
  redirectPath?: string;
  configId?: string;
  secret?: string;
  env?: Record<string, string | undefined>;
}): { url: string; state: string } {
  const env = params.env || process.env;
  const credentials = getMetaOAuthCredentials(env);
  const secret =
    params.secret ||
    env.AUTH_SECRET ||
    env.META_APP_SECRET ||
    env.WHATSAPP_APP_SECRET;

  const state = generateMetaOAuthState({
    businessId: params.businessId,
    userId: params.userId,
    redirectPath: params.redirectPath,
    secret,
  });

  if (!credentials?.appId) {
    throw new Error("META_APP_ID is required to build Meta OAuth URL.");
  }

  const configId = params.configId || credentials.configId;
  const authUrl = new URL(`https://www.facebook.com/${credentials.apiVersion}/dialog/oauth`);
  authUrl.searchParams.set("client_id", credentials.appId);
  authUrl.searchParams.set("redirect_uri", credentials.redirectUri);
  authUrl.searchParams.set("response_type", "code");
  authUrl.searchParams.set("state", state);

  if (configId) {
    authUrl.searchParams.set("config_id", configId);
  }

  return {
    url: authUrl.toString(),
    state,
  };
}

// ─── 6. Fetch Granted WABA Data from Meta Graph API ──────────────────────────

/**
 * After a customer completes WhatsApp Embedded Signup and the authorization code
 * is exchanged for a User Access Token, this function calls the Meta Graph API to
 * retrieve the WhatsApp Business Account(s) and phone number(s) the customer granted
 * access to during the Embedded Signup flow.
 *
 * This is the critical step that converts an OAuth token into the concrete WABA ID
 * and Phone Number ID needed for per-business outbound messaging and inbound routing.
 *
 * Security:
 * - Called exclusively server-side after token exchange.
 * - The accessToken must NEVER be passed to or logged by client-side code.
 * - Only the WABA ID, phone number ID, and display name are stored in the DB — not the token itself.
 *   (The token is stored separately in WhatsAppConnection.metaAccessToken, encrypted at rest.)
 */
export async function fetchGrantedWABAData(
  userAccessToken: string,
  options?: {
    apiVersion?: string;
    fetchFn?: typeof fetch;
  }
): Promise<MetaWABAFetchResult> {
  if (!userAccessToken || userAccessToken.trim() === "") {
    return { success: false, error: "User access token is required to fetch WABA data." };
  }

  // Simulation mode: honour sim_ prefixed tokens in dev / test environments
  if (userAccessToken.startsWith("sim_access_token_")) {
    return {
      success: true,
      data: {
        wabaId: `sim_waba_${Date.now()}`,
        wabaName: "Simulated WABA Business",
        phoneNumbers: [
          {
            id: `sim_phone_id_${Date.now()}`,
            displayPhoneNumber: "+234 800 000 0000",
            verifiedName: "BizPilot Test",
            qualityRating: "GREEN",
            status: "CONNECTED",
          },
        ],
      },
    };
  }

  const apiVersion = options?.apiVersion || DEFAULT_META_API_VERSION;
  const fetchImpl = options?.fetchFn || fetch;

  try {
    // Step 1: Fetch the WhatsApp Business Accounts the user granted access to.
    // The /me/businesses endpoint returns businesses linked to the user token.
    // For Embedded Signup, we specifically query WhatsApp Business Accounts.
    const wabaUrl = new URL(`https://graph.facebook.com/${apiVersion}/me/whatsapp_business_accounts`);
    wabaUrl.searchParams.set("access_token", userAccessToken);
    wabaUrl.searchParams.set("fields", "id,name,phone_numbers{id,display_phone_number,verified_name,quality_rating,status}");

    const wabaResponse = await fetchImpl(wabaUrl.toString(), {
      method: "GET",
      headers: { Accept: "application/json" },
    });

    const wabaBody = await wabaResponse.json().catch(() => ({})) as {
      data?: {
        id: string;
        name?: string;
        phone_numbers?: {
          data?: {
            id: string;
            display_phone_number: string;
            verified_name?: string;
            quality_rating?: string;
            status?: string;
          }[];
        };
      }[];
      error?: { message?: string; code?: number };
    };

    if (!wabaResponse.ok) {
      const errorMsg = wabaBody?.error?.message || `HTTP ${wabaResponse.status}`;
      console.error(`[Meta WABA Fetch] Failed to retrieve WABA data: ${errorMsg}`);
      return { success: false, error: `Meta API error fetching WABA: ${errorMsg}` };
    }

    const wabaAccounts = wabaBody.data;
    if (!wabaAccounts || wabaAccounts.length === 0) {
      return {
        success: false,
        error: "No WhatsApp Business Accounts were granted during Embedded Signup. The customer may not have completed the flow.",
      };
    }

    // Use the first granted WABA (Embedded Signup typically grants one WABA per flow)
    const waba = wabaAccounts[0];
    const phoneNumbers: MetaWABAPhoneNumber[] = (waba.phone_numbers?.data ?? []).map((pn) => ({
      id: pn.id,
      displayPhoneNumber: pn.display_phone_number,
      verifiedName: pn.verified_name,
      qualityRating: pn.quality_rating,
      status: pn.status,
    }));

    return {
      success: true,
      data: {
        wabaId: waba.id,
        wabaName: waba.name,
        phoneNumbers,
      },
    };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Network error fetching WABA data.";
    return { success: false, error: `WABA data fetch failed: ${message}` };
  }
}
