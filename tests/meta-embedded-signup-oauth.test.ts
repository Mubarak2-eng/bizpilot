import "dotenv/config";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import {
  generateMetaOAuthState,
  verifyMetaOAuthState,
  getMetaOAuthRedirectUri,
  getMetaOAuthCredentials,
  validateMetaOAuthEnv,
  exchangeMetaAuthCode,
  buildMetaOAuthAuthorizationUrl,
  fetchGrantedWABAData,
  OAUTH_STATE_TTL_MS,
  DEFAULT_PRODUCTION_URL,
} from "../src/lib/whatsapp/meta-oauth";
import { validateProductionEnv } from "../src/lib/env";
import { GET as metaCallbackHandler } from "../src/app/api/auth/meta/callback/route";

describe("Meta WhatsApp Embedded Signup OAuth Foundation", () => {
  const testBusinessId = "biz_test_123456";
  const testUserId = "user_test_789012";
  const testSecret = "test_super_secret_signing_key_32_bytes_long";

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  // ─── 1. Cryptographic CSRF State Generation & Verification ───────────────────
  describe("1. Cryptographic CSRF State Handling", () => {
    it("should generate a valid HMAC-SHA256 signed OAuth state token", () => {
      const state = generateMetaOAuthState({
        businessId: testBusinessId,
        userId: testUserId,
        redirectPath: "/settings?tab=whatsapp",
        secret: testSecret,
      });

      expect(state).toBeDefined();
      expect(typeof state).toBe("string");
      expect(state.split(".").length).toBe(2);
    });

    it("should successfully verify a valid, untampered OAuth state token", () => {
      const state = generateMetaOAuthState({
        businessId: testBusinessId,
        userId: testUserId,
        redirectPath: "/settings?tab=whatsapp",
        secret: testSecret,
      });

      const result = verifyMetaOAuthState(state, { secret: testSecret });
      expect(result.valid).toBe(true);
      expect(result.data).toBeDefined();
      expect(result.data?.businessId).toBe(testBusinessId);
      expect(result.data?.userId).toBe(testUserId);
      expect(result.data?.redirectPath).toBe("/settings?tab=whatsapp");
      expect(result.data?.nonce).toBeDefined();
      expect(result.data?.timestamp).toBeLessThanOrEqual(Date.now());
    });

    it("should reject tampered payload in state token (Anti-Tampering)", () => {
      const state = generateMetaOAuthState({
        businessId: testBusinessId,
        userId: testUserId,
        secret: testSecret,
      });

      const [payload, signature] = state.split(".");
      // Decode, modify businessId (cross-tenant attempt), re-encode without signature update
      const decoded = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
      decoded.businessId = "biz_attacker_999999";
      const tamperedPayload = Buffer.from(JSON.stringify(decoded), "utf8").toString("base64url");

      const tamperedState = `${tamperedPayload}.${signature}`;
      const result = verifyMetaOAuthState(tamperedState, { secret: testSecret });

      expect(result.valid).toBe(false);
      expect(result.error).toContain("tampering detected");
    });

    it("should reject tampered signature in state token", () => {
      const state = generateMetaOAuthState({
        businessId: testBusinessId,
        userId: testUserId,
        secret: testSecret,
      });

      const [payload] = state.split(".");
      const forgedState = `${payload}.forged_invalid_signature_abc123`;
      const result = verifyMetaOAuthState(forgedState, { secret: testSecret });

      expect(result.valid).toBe(false);
      expect(result.error).toContain("tampering detected");
    });

    it("should reject state tokens signed with a different secret", () => {
      const state = generateMetaOAuthState({
        businessId: testBusinessId,
        userId: testUserId,
        secret: "secret_a_123456789012345678901234",
      });

      const result = verifyMetaOAuthState(state, {
        secret: "secret_b_different_key_1234567890",
      });

      expect(result.valid).toBe(false);
      expect(result.error).toContain("tampering detected");
    });

    it("should reject expired state tokens beyond TTL (15 minutes)", () => {
      const state = generateMetaOAuthState({
        businessId: testBusinessId,
        userId: testUserId,
        secret: testSecret,
      });

      // Verify with maxAgeMs = 0 to simulate expiration
      const result = verifyMetaOAuthState(state, { maxAgeMs: -1000, secret: testSecret });
      expect(result.valid).toBe(false);
      expect(result.error).toContain("expired");
    });

    it("should reject missing or malformed state tokens gracefully", () => {
      expect(verifyMetaOAuthState("").valid).toBe(false);
      expect(verifyMetaOAuthState(null).valid).toBe(false);
      expect(verifyMetaOAuthState(undefined).valid).toBe(false);
      expect(verifyMetaOAuthState("invalid-state-no-dot").valid).toBe(false);
      expect(verifyMetaOAuthState("a.b.c").valid).toBe(false);
    });

    it("should require both businessId and userId when generating state", () => {
      expect(() =>
        generateMetaOAuthState({
          businessId: "",
          userId: testUserId,
          secret: testSecret,
        })
      ).toThrow("businessId and userId are required");

      expect(() =>
        generateMetaOAuthState({
          businessId: testBusinessId,
          userId: "",
          secret: testSecret,
        })
      ).toThrow("businessId and userId are required");
    });
  });

  // ─── 2. Redirect URI & Environment Validation ───────────────────────────────
  describe("2. Redirect URI & Credential Validation", () => {
    it("should resolve the exact production callback URL by default in production", () => {
      const redirectUri = getMetaOAuthRedirectUri({
        NODE_ENV: "production",
      });

      expect(redirectUri).toBe("https://bizpilot-nu.vercel.app/api/auth/meta/callback");
    });

    it("should prioritize NEXT_PUBLIC_APP_URL when configured", () => {
      const redirectUri = getMetaOAuthRedirectUri({
        NEXT_PUBLIC_APP_URL: "https://custom-domain.bizpilot.app/",
      });

      expect(redirectUri).toBe("https://custom-domain.bizpilot.app/api/auth/meta/callback");
    });

    it("should prioritize explicit META_REDIRECT_URI when configured", () => {
      const redirectUri = getMetaOAuthRedirectUri({
        META_REDIRECT_URI: "https://custom.bizpilot.app/auth/meta/callback",
      });

      expect(redirectUri).toBe("https://custom.bizpilot.app/auth/meta/callback");
    });

    it("should correctly resolve credentials and fallbacks", () => {
      const credentials = getMetaOAuthCredentials({
        META_APP_ID: "1122334455",
        META_APP_SECRET: "secret_998877",
        META_CONFIG_ID: "config_445566",
        NODE_ENV: "production",
      });

      expect(credentials).not.toBeNull();
      expect(credentials?.appId).toBe("1122334455");
      expect(credentials?.appSecret).toBe("secret_998877");
      expect(credentials?.configId).toBe("config_445566");
      expect(credentials?.redirectUri).toBe("https://bizpilot-nu.vercel.app/api/auth/meta/callback");
      expect(credentials?.apiVersion).toBe("v21.0");
    });

    it("should fall back to NEXT_PUBLIC_META_APP_ID and WHATSAPP_APP_SECRET", () => {
      const credentials = getMetaOAuthCredentials({
        NEXT_PUBLIC_META_APP_ID: "pub_app_123",
        WHATSAPP_APP_SECRET: "wa_secret_456",
        NEXT_PUBLIC_META_CONFIG_ID: "pub_config_789",
        NODE_ENV: "production",
      });

      expect(credentials).not.toBeNull();
      expect(credentials?.appId).toBe("pub_app_123");
      expect(credentials?.appSecret).toBe("wa_secret_456");
      expect(credentials?.configId).toBe("pub_config_789");
    });

    it("validateMetaOAuthEnv should pass in production when required credentials exist", () => {
      const result = validateMetaOAuthEnv({
        NODE_ENV: "production",
        META_APP_ID: "app_123456",
        META_APP_SECRET: "secret_123456",
        META_CONFIG_ID: "cfg_123456",
      });

      expect(result.isValid).toBe(true);
      expect(result.errors.length).toBe(0);
      expect(result.credentials.hasAppId).toBe(true);
      expect(result.credentials.hasAppSecret).toBe(true);
    });

    it("validateMetaOAuthEnv should fail in production when META_APP_ID is missing", () => {
      const result = validateMetaOAuthEnv({
        NODE_ENV: "production",
        META_APP_SECRET: "secret_123456",
      });

      expect(result.isValid).toBe(false);
      expect(result.errors.some((e) => e.includes("META_APP_ID"))).toBe(true);
    });

    it("validateMetaOAuthEnv should fail in production when META_APP_SECRET is missing", () => {
      const result = validateMetaOAuthEnv({
        NODE_ENV: "production",
        META_APP_ID: "app_123456",
      });

      expect(result.isValid).toBe(false);
      expect(result.errors.some((e) => e.includes("META_APP_SECRET"))).toBe(true);
    });

    it("validateProductionEnv should incorporate metaOAuth status without breaking existing checks", () => {
      const validEnv = {
        NODE_ENV: "production",
        DATABASE_URL: "postgresql://user:pass@localhost:5432/bizpilot",
        AUTH_SECRET: "abcdef0123456789abcdef0123456789",
        RESEND_API_KEY: "re_live_123456789",
        CRON_SECRET: "cron_secret_32_bytes_long_12345",
        WHATSAPP_ACCESS_TOKEN: "wa_access_token_12345",
        WHATSAPP_PHONE_NUMBER_ID: "109876543210987",
        WHATSAPP_APP_SECRET: "wa_secret_12345",
        WHATSAPP_VERIFY_TOKEN: "wa_verify_12345",
        META_APP_ID: "meta_app_999",
      };

      const result = validateProductionEnv(validEnv);
      expect(result.isValid).toBe(true);
      expect(result.configuredServices.whatsapp).toBe(true);
      expect(result.configuredServices.metaOAuth).toBe(true);
    });
  });

  // ─── 3. Meta Authorization Code Exchange Server-Side ─────────────────────────
  describe("3. Authorization Code Exchange Server-Side", () => {
    it("should reject code exchange when authorization code is empty", async () => {
      const result = await exchangeMetaAuthCode("");
      expect(result.success).toBe(false);
      expect(result.error).toContain("Authorization code is required");
    });

    it("should successfully exchange valid code with Meta Graph API", async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          access_token: "EAAB_mock_user_access_token_12345",
          token_type: "bearer",
          expires_in: 5184000,
        }),
      });

      const result = await exchangeMetaAuthCode("valid_meta_auth_code", {
        appId: "app_123",
        appSecret: "secret_456",
        redirectUri: "https://bizpilot-nu.vercel.app/api/auth/meta/callback",
        fetchFn: mockFetch as unknown as typeof fetch,
      });

      expect(result.success).toBe(true);
      expect(result.accessToken).toBe("EAAB_mock_user_access_token_12345");
      expect(result.tokenType).toBe("bearer");
      expect(result.expiresIn).toBe(5184000);

      // Verify exact Graph API URL called
      expect(mockFetch).toHaveBeenCalledTimes(1);
      const calledUrl = mockFetch.mock.calls[0][0];
      expect(calledUrl).toContain("https://graph.facebook.com/v21.0/oauth/access_token");
      expect(calledUrl).toContain("client_id=app_123");
      expect(calledUrl).toContain("code=valid_meta_auth_code");
    });

    it("should handle Meta Graph API error response gracefully", async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 400,
        statusText: "Bad Request",
        json: async () => ({
          error: {
            message: "Invalid verification code format.",
            type: "OAuthException",
            code: 100,
            fbtrace_id: "AbCdEf123456",
          },
        }),
      });

      const result = await exchangeMetaAuthCode("invalid_code", {
        appId: "app_123",
        appSecret: "secret_456",
        fetchFn: mockFetch as unknown as typeof fetch,
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain("Meta OAuth Error: Invalid verification code format.");
      expect(result.accessToken).toBeUndefined();
    });

    it("should NEVER leak the Meta App Secret in error messages", async () => {
      const sensitiveSecret = "SUPER_SECRET_APP_SECRET_987654";
      const mockFetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 400,
        json: async () => ({
          error: {
            message: `Error with secret SUPER_SECRET_APP_SECRET_987654 in exchange`,
            type: "OAuthException",
          },
        }),
      });

      const result = await exchangeMetaAuthCode("code_triggering_error", {
        appId: "app_123",
        appSecret: sensitiveSecret,
        fetchFn: mockFetch as unknown as typeof fetch,
      });

      expect(result.success).toBe(false);
      expect(result.error).not.toContain(sensitiveSecret);
      expect(result.error).toContain("[REDACTED]");
    });

    it("should handle network failure during code exchange without throwing", async () => {
      const mockFetch = vi.fn().mockRejectedValue(new Error("Connection timeout to graph.facebook.com"));

      const result = await exchangeMetaAuthCode("any_code", {
        appId: "app_123",
        appSecret: "secret_456",
        fetchFn: mockFetch as unknown as typeof fetch,
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain("Connection timeout");
    });
  });

  // ─── 4. Meta OAuth Callback Route Handler (/api/auth/meta/callback) ──────────
  describe("4. Meta OAuth Callback Route Handler", () => {
    it("should handle Meta error parameter (e.g. user cancelled login)", async () => {
      const req = new NextRequest(
        "https://bizpilot-nu.vercel.app/api/auth/meta/callback?error=access_denied&error_description=User+cancelled+login&format=json"
      );

      const response = await metaCallbackHandler(req);
      expect(response.status).toBe(400);

      const json = await response.json();
      expect(json.success).toBe(false);
      expect(json.error).toBe("meta_oauth_error");
      expect(json.details).toContain("User cancelled login");
    });

    it("should reject requests with missing code or state parameters", async () => {
      const reqNoCode = new NextRequest(
        "https://bizpilot-nu.vercel.app/api/auth/meta/callback?state=some_state&format=json"
      );
      const resNoCode = await metaCallbackHandler(reqNoCode);
      expect(resNoCode.status).toBe(400);
      const jsonNoCode = await resNoCode.json();
      expect(jsonNoCode.error).toBe("missing_parameters");

      const reqNoState = new NextRequest(
        "https://bizpilot-nu.vercel.app/api/auth/meta/callback?code=some_code&format=json"
      );
      const resNoState = await metaCallbackHandler(reqNoState);
      expect(resNoState.status).toBe(400);
      const jsonNoState = await resNoState.json();
      expect(jsonNoState.error).toBe("missing_parameters");
    });

    it("should reject requests with invalid or tampered state token", async () => {
      const req = new NextRequest(
        "https://bizpilot-nu.vercel.app/api/auth/meta/callback?code=valid_code&state=invalid.tampered_state&format=json"
      );

      const response = await metaCallbackHandler(req);
      expect(response.status).toBe(400);

      const json = await response.json();
      expect(json.error).toBe("invalid_state");
      expect(json.details).toBeDefined();
    });

    it("should reject requests when authorization code exchange fails", async () => {
      process.env.META_APP_ID = "test_app_12345";
      process.env.META_APP_SECRET = "test_secret_67890";

      // Generate valid state
      const state = generateMetaOAuthState({
        businessId: testBusinessId,
        userId: testUserId,
      });

      // Mock global fetch to return Meta error
      const originalFetch = global.fetch;
      global.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 400,
        json: async () => ({
          error: { message: "Invalid authorization code.", type: "OAuthException" },
        }),
      }) as unknown as typeof fetch;

      try {
        const req = new NextRequest(
          `https://bizpilot-nu.vercel.app/api/auth/meta/callback?code=bad_code&state=${encodeURIComponent(state)}&format=json`
        );

        const response = await metaCallbackHandler(req);
        expect(response.status).toBe(400);

        const json = await response.json();
        expect(json.error).toBe("token_exchange_failed");
        expect(json.details).toContain("Invalid authorization code");
      } finally {
        global.fetch = originalFetch;
        delete process.env.META_APP_ID;
        delete process.env.META_APP_SECRET;
      }
    });

    it("should successfully process callback, retrieve WABA data, and never leak access token or app secret", async () => {
      const state = generateMetaOAuthState({
        businessId: testBusinessId,
        userId: testUserId,
        redirectPath: "/settings?tab=whatsapp",
      });

      const mockAccessToken = "EAAB_very_secret_meta_token_never_expose_to_client_123456";
      const originalFetch = global.fetch;

      // Mock fetch to handle both OAuth token exchange and Graph API WABA retrieval
      global.fetch = vi.fn().mockImplementation(async (input: string | URL | Request) => {
        const urlStr = typeof input === "string" ? input : input.toString();

        if (urlStr.includes("oauth/access_token")) {
          return {
            ok: true,
            status: 200,
            json: async () => ({
              access_token: mockAccessToken,
              token_type: "bearer",
              expires_in: 5184000,
            }),
          };
        }

        if (urlStr.includes("whatsapp_business_accounts")) {
          return {
            ok: true,
            status: 200,
            json: async () => ({
              data: [
                {
                  id: "waba_test_999888",
                  name: "Test Business WABA",
                  phone_numbers: {
                    data: [
                      {
                        id: "phone_id_555444",
                        display_phone_number: "+234 801 234 5678",
                        verified_name: "Test Business",
                        quality_rating: "GREEN",
                        status: "CONNECTED",
                      },
                    ],
                  },
                },
              ],
            }),
          };
        }

        return {
          ok: true,
          status: 200,
          json: async () => ({}),
        };
      }) as unknown as typeof fetch;

      // Mock prisma lookups so unit tests don't require live database connection
      const { prisma } = await import("../src/lib/prisma");
      const findBusinessSpy = vi.spyOn(prisma.business, "findUnique").mockResolvedValue({
        id: testBusinessId,
        name: "Test Business",
        slug: "test-biz",
        currency: "NGN",
        createdAt: new Date(),
        updatedAt: new Date(),
      } as any);
      const findPhoneSpy = vi.spyOn(prisma.whatsAppConnection, "findUnique").mockResolvedValue(null);
      const upsertSpy = vi.spyOn(prisma.whatsAppConnection, "upsert").mockResolvedValue({} as any);

      process.env.META_APP_ID = "test_app_id_123";
      process.env.META_APP_SECRET = "test_app_secret_456";

      try {
        // Test JSON API response
        const jsonReq = new NextRequest(
          `https://bizpilot-nu.vercel.app/api/auth/meta/callback?code=auth_code_live_test_123&state=${encodeURIComponent(state)}&format=json`
        );
        const jsonRes = await metaCallbackHandler(jsonReq);
        expect(jsonRes.status).toBe(200);

        const jsonBody = await jsonRes.json();
        expect(jsonBody.success).toBe(true);
        expect(jsonBody.status).toBe("AUTHORIZED");
        expect(jsonBody.businessId).toBe(testBusinessId);
        expect(jsonBody.wabaConnected).toBe(true);

        // Verify DB upsert was called with businessId and WABA data
        expect(upsertSpy).toHaveBeenCalled();
        const upsertArgs = upsertSpy.mock.calls[0][0];
        expect(upsertArgs.where.businessId).toBe(testBusinessId);
        expect(upsertArgs.create.wabaId).toBe("waba_test_999888");
        expect(upsertArgs.create.phoneNumberId).toBe("phone_id_555444");

        // Crucial security invariant: token must NOT be in JSON response
        const stringifiedJson = JSON.stringify(jsonBody);
        expect(stringifiedJson).not.toContain(mockAccessToken);
        expect(stringifiedJson).not.toContain("access_token");
        expect(stringifiedJson).not.toContain("secret");

        // Test browser redirect response
        const redirectReq = new NextRequest(
          `https://bizpilot-nu.vercel.app/api/auth/meta/callback?code=auth_code_live_test_123&state=${encodeURIComponent(state)}`
        );
        const redirectRes = await metaCallbackHandler(redirectReq);
        expect(redirectRes.status).toBe(307); // NextResponse.redirect default status

        const redirectLocation = redirectRes.headers.get("location");
        expect(redirectLocation).toBeDefined();
        expect(redirectLocation).toContain("/settings");
        expect(redirectLocation).toContain("status=oauth_authorized");
        expect(redirectLocation).toContain(`businessId=${testBusinessId}`);

        // Crucial security invariant: token must NOT be in redirect URL
        expect(redirectLocation).not.toContain(mockAccessToken);
        expect(redirectLocation).not.toContain("access_token");
        expect(redirectLocation).not.toContain("secret");
      } finally {
        global.fetch = originalFetch;
        findBusinessSpy.mockRestore();
        findPhoneSpy.mockRestore();
        upsertSpy.mockRestore();
        delete process.env.META_APP_ID;
        delete process.env.META_APP_SECRET;
      }
    });
  });

  // ─── 5. Meta Dialog OAuth URL Builder ────────────────────────────────────────
  describe("5. Meta Dialog OAuth URL Builder", () => {
    it("should construct valid Meta OAuth authorization URL with config_id and signed state", () => {
      const { url, state } = buildMetaOAuthAuthorizationUrl({
        businessId: testBusinessId,
        userId: testUserId,
        configId: "9988776655",
        secret: testSecret,
        env: {
          META_APP_ID: "1234567890",
          META_APP_SECRET: testSecret,
          NODE_ENV: "production",
        },
      });

      expect(url).toContain("https://www.facebook.com/v21.0/dialog/oauth");
      expect(url).toContain("client_id=1234567890");
      expect(url).toContain("config_id=9988776655");
      expect(url).toContain("response_type=code");
      expect(url).toContain("redirect_uri=" + encodeURIComponent("https://bizpilot-nu.vercel.app/api/auth/meta/callback"));
      expect(url).toContain("state=" + encodeURIComponent(state));

      // Verifying the state generated within URL builder
      const verified = verifyMetaOAuthState(state, { secret: testSecret });
      expect(verified.valid).toBe(true);
      expect(verified.data?.businessId).toBe(testBusinessId);
    });
  });

  // ─── 6. Meta Graph API WABA Data Fetching ───────────────────────────────────
  describe("6. Meta Graph API WABA Data Fetching", () => {
    it("should reject when access token is empty or whitespace", async () => {
      const result = await fetchGrantedWABAData("");
      expect(result.success).toBe(false);
      expect(result.error).toContain("token is required");
    });

    it("should return simulated WABA data in test environments for sim_ tokens", async () => {
      const result = await fetchGrantedWABAData("sim_access_token_mock_test_123");
      expect(result.success).toBe(true);
      expect(result.data).toBeDefined();
      expect(result.data?.wabaId).toContain("sim_waba_");
      expect(result.data?.phoneNumbers.length).toBeGreaterThan(0);
      expect(result.data?.phoneNumbers[0].id).toContain("sim_phone_id_");
    });

    it("should correctly parse WABA and phone number hierarchy from Meta Graph API", async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          data: [
            {
              id: "waba_live_123456",
              name: "Acme Retail Ltd",
              phone_numbers: {
                data: [
                  {
                    id: "phone_live_789012",
                    display_phone_number: "+234 803 111 2222",
                    verified_name: "Acme Orders",
                    quality_rating: "GREEN",
                    status: "CONNECTED",
                  },
                ],
              },
            },
          ],
        }),
      });

      const result = await fetchGrantedWABAData("live_valid_token_xyz", {
        fetchFn: mockFetch as unknown as typeof fetch,
      });

      expect(result.success).toBe(true);
      expect(result.data?.wabaId).toBe("waba_live_123456");
      expect(result.data?.wabaName).toBe("Acme Retail Ltd");
      expect(result.data?.phoneNumbers.length).toBe(1);
      expect(result.data?.phoneNumbers[0].id).toBe("phone_live_789012");
      expect(result.data?.phoneNumbers[0].displayPhoneNumber).toBe("+234 803 111 2222");
    });

    it("should handle error when no WABA accounts were granted", async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ data: [] }),
      });

      const result = await fetchGrantedWABAData("token_no_wabas", {
        fetchFn: mockFetch as unknown as typeof fetch,
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain("No WhatsApp Business Accounts were granted");
    });
  });

  // ─── 7. Per-Business Outbound Routing (Multi-Tenant Isolation) ───────────────
  describe("7. Per-Business Outbound Routing", () => {
    it("should route outbound messages using per-business WABA credentials", async () => {
      const { sendWhatsAppTextMessageForBusiness } = await import(
        "../src/lib/whatsapp/client"
      );
      const { prisma } = await import("../src/lib/prisma");

      const mockFindUnique = vi.spyOn(prisma.whatsAppConnection, "findUnique").mockResolvedValue({
        id: "conn_123",
        businessId: "biz_tenant_a",
        phoneNumber: "2348011112222",
        userId: "user_123",
        connectionType: "EMBEDDED_WABA",
        status: "CONNECTED",
        wabaId: "waba_tenant_a",
        phoneNumberId: "phone_id_tenant_a",
        metaAccessToken: "token_tenant_a",
        verified: true,
      } as any);

      const originalFetch = global.fetch;
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ messages: [{ id: "wamid_outbound_123" }] }),
      }) as unknown as typeof fetch;

      try {
        const result = await sendWhatsAppTextMessageForBusiness(
          "biz_tenant_a",
          "2348099998888",
          "Hello from Tenant A"
        );

        expect(result.success).toBe(true);
        expect(result.messageId).toBe("wamid_outbound_123");

        // Verify it sent to Tenant A's specific phone number ID endpoint
        expect(global.fetch).toHaveBeenCalled();
        const calledUrl = (global.fetch as any).mock.calls[0][0];
        expect(calledUrl).toContain("phone_id_tenant_a/messages");
      } finally {
        global.fetch = originalFetch;
        mockFindUnique.mockRestore();
      }
    });
  });
});

