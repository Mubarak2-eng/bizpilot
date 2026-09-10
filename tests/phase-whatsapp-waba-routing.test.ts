import "dotenv/config";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { POST as webhookHandler } from "../src/app/api/webhook/whatsapp/route";
import { handleIncomingWhatsAppMessage } from "../src/lib/whatsapp/handler";
import { sendWhatsAppTextMessageForBusiness } from "../src/lib/whatsapp/client";
import { prisma } from "../src/lib/prisma";

describe("Phase 12: WhatsApp Multi-Tenant WABA Routing & Isolation", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  describe("1. Inbound Webhook Multi-Tenant Routing", () => {
    it("should extract receiving phone_number_id from metadata and route message to tenant B", async () => {
      const receivingPhoneNumberId = "meta_phone_id_tenant_b_888";
      const senderPhone = "2348012345678";

      // Mock webhook security functions to pass without requiring DB connection
      const security = await import("../src/lib/whatsapp/security");
      vi.spyOn(security, "verifyWhatsAppSignature").mockReturnValue(true);
      vi.spyOn(security, "isMessageProcessed").mockResolvedValue(false);
      vi.spyOn(security, "markMessageProcessed").mockResolvedValue(undefined as any);
      vi.spyOn(security, "checkRateLimit").mockResolvedValue(true);

      // Mock DB lookups
      const findUniqueSpy = vi.spyOn(prisma.whatsAppConnection, "findUnique").mockImplementation((((args: any) => {
        if (args.where?.phoneNumberId === receivingPhoneNumberId) {
          return Promise.resolve({
            id: "conn_tenant_b",
            businessId: "biz_tenant_b",
            phoneNumber: "2348088888888",
            userId: "user_b",
            connectionType: "EMBEDDED_WABA",
            status: "CONNECTED",
            wabaId: "waba_tenant_b",
            phoneNumberId: receivingPhoneNumberId,
            metaAccessToken: "token_tenant_b",
            verified: true,
            business: {
              id: "biz_tenant_b",
              name: "Tenant B Store",
              currency: "NGN",
            },
            user: {
              id: "user_b",
              name: "Owner B",
              email: "owner_b@test.com",
            },
          } as any);
        }
        return Promise.resolve(null);
      }) as any));


      const payload = {
        object: "whatsapp_business_account",
        entry: [
          {
            id: "waba_tenant_b",
            changes: [
              {
                field: "messages",
                value: {
                  messaging_product: "whatsapp",
                  metadata: {
                    display_phone_number: "+234 808 888 8888",
                    phone_number_id: receivingPhoneNumberId,
                  },
                  messages: [
                    {
                      from: senderPhone,
                      id: "wamid_inbound_test_123",
                      timestamp: "1789040000",
                      text: { body: "What are my sales today?" },
                      type: "text",
                    },
                  ],
                },
              },
            ],
          },
        ],
      };

      const req = new NextRequest("https://bizpilot-nu.vercel.app/api/webhook/whatsapp", {
        method: "POST",
        headers: {
          "x-hub-signature-256": "sha256=mock_valid_signature",
          "content-type": "application/json",
        },
        body: JSON.stringify(payload),
      });

      const response = await webhookHandler(req);
      expect(response.status).toBe(200);

      // Verify the lookup by phoneNumberId was queried
      expect(findUniqueSpy).toHaveBeenCalled();
      const queriedPhoneNumberIds = findUniqueSpy.mock.calls.map((c) => c[0].where?.phoneNumberId).filter(Boolean);
      expect(queriedPhoneNumberIds).toContain(receivingPhoneNumberId);
    });
  });

  describe("2. Outbound Tenant Isolation & Access Token Protection", () => {
    it("Tenant A sending messages should never access or use Tenant B's credentials", async () => {
      const tenantAId = "biz_tenant_aaa";
      const tenantBId = "biz_tenant_bbb";

      const mockDb = vi.spyOn(prisma.whatsAppConnection, "findUnique").mockImplementation((((args: any) => {
        if (args.where?.businessId === tenantAId) {
          return Promise.resolve({
            id: "conn_a",
            businessId: tenantAId,
            phoneNumber: "2348011111111",
            userId: "user_a",
            connectionType: "EMBEDDED_WABA",
            status: "CONNECTED",
            wabaId: "waba_a",
            phoneNumberId: "phone_id_a",
            metaAccessToken: "token_secret_tenant_a",
            verified: true,
          } as any);
        }
        if (args.where?.businessId === tenantBId) {
          return Promise.resolve({
            id: "conn_b",
            businessId: tenantBId,
            phoneNumber: "2348022222222",
            userId: "user_b",
            connectionType: "EMBEDDED_WABA",
            status: "CONNECTED",
            wabaId: "waba_b",
            phoneNumberId: "phone_id_b",
            metaAccessToken: "token_secret_tenant_b",
            verified: true,
          } as any);
        }
        return Promise.resolve(null);
      }) as any));


      const originalFetch = global.fetch;
      const fetchCalls: { url: string; authHeader: string }[] = [];

      global.fetch = vi.fn().mockImplementation(async (url: string, init?: any) => {
        fetchCalls.push({
          url: url.toString(),
          authHeader: init?.headers?.Authorization || "",
        });
        return {
          ok: true,
          json: async () => ({ messages: [{ id: "wamid_sent_1" }] }),
        };
      }) as unknown as typeof fetch;

      try {
        // Send message for Tenant A
        const resA = await sendWhatsAppTextMessageForBusiness(tenantAId, "2348099990000", "Msg for A");
        expect(resA.success).toBe(true);

        expect(fetchCalls[0].url).toContain("phone_id_a/messages");
        expect(fetchCalls[0].authHeader).toBe("Bearer token_secret_tenant_a");
        expect(fetchCalls[0].authHeader).not.toContain("token_secret_tenant_b");

        // Send message for Tenant B
        const resB = await sendWhatsAppTextMessageForBusiness(tenantBId, "2348099990000", "Msg for B");
        expect(resB.success).toBe(true);

        expect(fetchCalls[1].url).toContain("phone_id_b/messages");
        expect(fetchCalls[1].authHeader).toBe("Bearer token_secret_tenant_b");
        expect(fetchCalls[1].authHeader).not.toContain("token_secret_tenant_a");
      } finally {
        global.fetch = originalFetch;
        mockDb.mockRestore();
      }
    });

    it("should refuse outbound messaging if connection is disconnected or unverified", async () => {
      vi.spyOn(prisma.whatsAppConnection, "findUnique").mockResolvedValue({
        id: "conn_unverified",
        businessId: "biz_unverified",
        phoneNumber: "2348033333333",
        userId: "user_c",
        connectionType: "EMBEDDED_WABA",
        status: "DISCONNECTED",
        wabaId: "waba_c",
        phoneNumberId: "phone_id_c",
        metaAccessToken: "token_c",
        verified: false,
      } as any);

      const res = await sendWhatsAppTextMessageForBusiness("biz_unverified", "2348099990000", "Test");
      expect(res.success).toBe(false);
      expect(res.error).toContain("No verified WhatsApp connection");
    });
  });
});
