import "dotenv/config";
import { describe, it, expect, beforeEach, vi } from "vitest";
import { prisma } from "@/lib/prisma";
import {
  createCampaignAction,
  previewCampaignRecipientsAction,
  sendCampaignAction,
  getCampaignsAction,
  getCampaignDetailsAction,
  deleteCampaignAction,
} from "@/lib/actions/campaigns";
import * as authHelpers from "@/lib/auth-helpers";
import * as emailModule from "@/lib/email";
import { Role } from "@/types/auth";
import { Business, Customer, Membership, User } from "@prisma/client";

// Mock next/cache revalidatePath
vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
  revalidateTag: vi.fn(),
}));

describe("Phase 11: Customer Email Campaigns & Announcements", () => {
  let businessA: Business;
  let businessB: Business;
  let ownerUserA: User;
  let staffUserA: User;
  let ownerUserB: User;

  let customerA1: Customer;
  let customerA2: Customer;
  let customerA_NoEmail: Customer;
  let customerA_InvalidEmail: Customer;
  let customerA_DuplicateEmail: Customer;

  let customerB1: Customer;

  beforeEach(async () => {
    // Upsert Business A
    businessA = await prisma.business.upsert({
      where: { slug: "campaign-biz-a" },
      update: {},
      create: {
        name: "Campaign Business A",
        slug: "campaign-biz-a",
        businessType: "RETAIL",
        currency: "NGN",
      },
    });

    // Upsert Business B
    businessB = await prisma.business.upsert({
      where: { slug: "campaign-biz-b" },
      update: {},
      create: {
        name: "Campaign Business B",
        slug: "campaign-biz-b",
        businessType: "RETAIL",
        currency: "NGN",
      },
    });

    // Clean up campaigns and customers for these two businesses
    await prisma.campaignRecipient.deleteMany({});
    await prisma.customerCampaign.deleteMany({});
    await prisma.customer.deleteMany({
      where: {
        businessId: { in: [businessA.id, businessB.id] },
      },
    });

    // Create Users
    ownerUserA = await prisma.user.upsert({
      where: { email: "owner-a@campaign-test.com" },
      update: {},
      create: {
        email: "owner-a@campaign-test.com",
        name: "Owner A",
        password: "$2a$10$abcdefg",
      },
    });

    staffUserA = await prisma.user.upsert({
      where: { email: "staff-a@campaign-test.com" },
      update: {},
      create: {
        email: "staff-a@campaign-test.com",
        name: "Staff A",
        password: "$2a$10$abcdefg",
      },
    });

    ownerUserB = await prisma.user.upsert({
      where: { email: "owner-b@campaign-test.com" },
      update: {},
      create: {
        email: "owner-b@campaign-test.com",
        name: "Owner B",
        password: "$2a$10$abcdefg",
      },
    });

    // Memberships
    await prisma.membership.upsert({
      where: { userId_businessId: { userId: ownerUserA.id, businessId: businessA.id } },
      update: { role: "OWNER" },
      create: { userId: ownerUserA.id, businessId: businessA.id, role: "OWNER" },
    });

    await prisma.membership.upsert({
      where: { userId_businessId: { userId: staffUserA.id, businessId: businessA.id } },
      update: { role: "STAFF" },
      create: { userId: staffUserA.id, businessId: businessA.id, role: "STAFF" },
    });

    await prisma.membership.upsert({
      where: { userId_businessId: { userId: ownerUserB.id, businessId: businessB.id } },
      update: { role: "OWNER" },
      create: { userId: ownerUserB.id, businessId: businessB.id, role: "OWNER" },
    });

    // Customers for Business A
    customerA1 = await prisma.customer.create({
      data: {
        businessId: businessA.id,
        name: "Alice Johnson",
        email: "alice@campaign-test.com",
      },
    });

    customerA2 = await prisma.customer.create({
      data: {
        businessId: businessA.id,
        name: "Bob Smith",
        email: "bob@campaign-test.com",
      },
    });

    customerA_NoEmail = await prisma.customer.create({
      data: {
        businessId: businessA.id,
        name: "Charlie No Email",
        email: null,
      },
    });

    customerA_InvalidEmail = await prisma.customer.create({
      data: {
        businessId: businessA.id,
        name: "Diana Invalid",
        email: "not-an-email",
      },
    });

    customerA_DuplicateEmail = await prisma.customer.create({
      data: {
        businessId: businessA.id,
        name: "Zara Duplicate",
        email: "alice@campaign-test.com", // Duplicate of customerA1
      },
    });

    // Customer for Business B
    customerB1 = await prisma.customer.create({
      data: {
        businessId: businessB.id,
        name: "Eve Tenant B",
        email: "eve@campaign-test.com",
      },
    });

    vi.restoreAllMocks();
  });

  describe("1. Validation & Customer Eligibility Rules", () => {
    it("should reject campaign creation when subject is empty", async () => {
      vi.spyOn(authHelpers, "requireBusinessRole").mockResolvedValue({
        user: ownerUserA,
        membership: { role: "OWNER" } as unknown as Membership,
        business: businessA,
        role: Role.OWNER,
      });

      const res = await createCampaignAction(businessA.id, {
        subject: "",
        body: "Hello Customers!",
      });

      expect(res.error).toMatch(/subject cannot be empty/i);
    });

    it("should reject campaign creation when message body is empty", async () => {
      vi.spyOn(authHelpers, "requireBusinessRole").mockResolvedValue({
        user: ownerUserA,
        membership: { role: "OWNER" } as unknown as Membership,
        business: businessA,
        role: Role.OWNER,
      });

      const res = await createCampaignAction(businessA.id, {
        subject: "Special Announcement",
        body: "   ",
      });

      expect(res.error).toMatch(/message cannot be empty/i);
    });

    it("should correctly preview eligible recipients and skip missing, invalid, and duplicate emails", async () => {
      vi.spyOn(authHelpers, "requireBusinessRole").mockResolvedValue({
        user: ownerUserA,
        membership: { role: "OWNER" } as unknown as Membership,
        business: businessA,
        role: Role.OWNER,
      });

      const preview = await previewCampaignRecipientsAction(businessA.id);

      expect(preview.success).toBe(true);
      expect(preview.totalTargeted).toBe(5); // 5 customers in Biz A
      expect(preview.eligibleCount).toBe(2); // alice & bob
      expect(preview.skippedCount).toBe(3);
      expect(preview.skippedBreakdown.noEmail).toBe(1); // Charlie
      expect(preview.skippedBreakdown.invalidEmail).toBe(1); // Diana
      expect(preview.skippedBreakdown.duplicateEmail).toBe(1); // Alice Duplicate

      const emails = preview.recipients.map((r) => r.email);
      expect(emails).toContain("alice@campaign-test.com");
      expect(emails).toContain("bob@campaign-test.com");
    });

    it("should only evaluate customers belonging to the active business", async () => {
      vi.spyOn(authHelpers, "requireBusinessRole").mockResolvedValue({
        user: ownerUserA,
        membership: { role: "OWNER" } as unknown as Membership,
        business: businessA,
        role: Role.OWNER,
      });

      const preview = await previewCampaignRecipientsAction(businessA.id);
      const emails = preview.recipients.map((r) => r.email);

      // Eve belongs to Business B and must never appear in Business A preview
      expect(emails).not.toContain("eve@campaign-test.com");
    });
  });

  describe("2. RBAC & Multi-Tenant Authorization", () => {
    it("should reject campaign creation if user does not have ADMIN or OWNER role (e.g. STAFF)", async () => {
      vi.spyOn(authHelpers, "requireBusinessRole").mockRejectedValue(
        new Error("Forbidden: You must be an ADMIN or OWNER to perform this action.")
      );

      const res = await createCampaignAction(businessA.id, {
        subject: "Staff Announcement",
        body: "Test message",
      });

      expect(res.error).toMatch(/forbidden/i);
    });

    it("should allow OWNER or ADMIN to create draft campaigns", async () => {
      vi.spyOn(authHelpers, "requireBusinessRole").mockResolvedValue({
        user: ownerUserA,
        membership: { role: "OWNER" } as unknown as Membership,
        business: businessA,
        role: Role.OWNER,
      });

      const res = await createCampaignAction(businessA.id, {
        subject: "Weekend Clearance Sale",
        body: "Enjoy 20% discount this Saturday and Sunday.",
      });

      expect(res.success).toBe(true);
      expect(res.campaignId).toBeDefined();
      expect(res.recipientCount).toBe(2);

      const saved = await prisma.customerCampaign.findUnique({
        where: { id: res.campaignId },
      });
      expect(saved?.status).toBe("DRAFT");
      expect(saved?.sentCount).toBe(0);
      expect(saved?.sentAt).toBeNull();
    });

    it("should reject tenant isolation breach when accessing campaigns of another business", async () => {
      // Create campaign for Business A
      const campaignA = await prisma.customerCampaign.create({
        data: {
          businessId: businessA.id,
          createdBy: "Owner A",
          subject: "Secret Announcement A",
          body: "Top Secret",
          status: "DRAFT",
          recipientCount: 2,
        },
      });

      // User B attempts to access campaign A details
      vi.spyOn(authHelpers, "requireBusinessMembership").mockResolvedValue({
        user: ownerUserB,
        membership: { role: "OWNER" } as unknown as Membership,
        business: businessB,
        role: Role.OWNER,
      });

      const res = await getCampaignDetailsAction(businessB.id, campaignA.id);
      expect(res.error).toMatch(/not found or access denied/i);
      expect(res.campaign).toBeUndefined();
    });

    it("should reject cross-tenant customer IDs when user specifies selected recipients", async () => {
      vi.spyOn(authHelpers, "requireBusinessRole").mockResolvedValue({
        user: ownerUserA,
        membership: { role: "OWNER" } as unknown as Membership,
        business: businessA,
        role: Role.OWNER,
      });

      // User A tries to pass customerB1's ID from Business B
      const preview = await previewCampaignRecipientsAction(businessA.id, [customerB1.id]);
      expect(preview.eligibleCount).toBe(0); // Query enforces businessId = businessA.id, so customerB1 returns nothing
    });
  });

  describe("3. Send Workflow, Atomic Locking & Duplicate-Sending Protection", () => {
    it("should transition DRAFT -> SENDING and record successful delivery as SENT", async () => {
      vi.spyOn(authHelpers, "requireBusinessRole").mockResolvedValue({
        user: ownerUserA,
        membership: { role: "OWNER" } as unknown as Membership,
        business: businessA,
        role: Role.OWNER,
      });

      const campaign = await prisma.customerCampaign.create({
        data: {
          businessId: businessA.id,
          createdBy: "Owner A",
          subject: "Loyalty Appreciation",
          body: "Thank you for being our loyal customer.",
          status: "DRAFT",
          recipientCount: 2,
        },
      });

      // Mock email sending success
      vi.spyOn(emailModule, "sendCustomerCampaignEmail").mockResolvedValue({
        success: true,
        messageId: "msg-12345",
      });

      const sendRes = await sendCampaignAction(businessA.id, campaign.id);

      expect(sendRes.success).toBe(true);
      expect(sendRes.status).toBe("SENT");
      expect(sendRes.sentCount).toBe(2);
      expect(sendRes.failedCount).toBe(0);

      // Verify campaign in database
      const updatedCampaign = await prisma.customerCampaign.findUnique({
        where: { id: campaign.id },
      });
      expect(updatedCampaign?.status).toBe("SENT");
      expect(updatedCampaign?.sentCount).toBe(2);
      expect(updatedCampaign?.sentAt).not.toBeNull();

      // Verify recipient snapshots
      const recipients = await prisma.campaignRecipient.findMany({
        where: { campaignId: campaign.id },
      });
      expect(recipients.length).toBe(2);
      expect(recipients.every((r) => r.status === "SENT")).toBe(true);
      expect(recipients.map((r) => r.email).sort()).toEqual(
        ["alice@campaign-test.com", "bob@campaign-test.com"].sort()
      );
    });

    it("should prevent duplicate sends if campaign is already SENT", async () => {
      vi.spyOn(authHelpers, "requireBusinessRole").mockResolvedValue({
        user: ownerUserA,
        membership: { role: "OWNER" } as unknown as Membership,
        business: businessA,
        role: Role.OWNER,
      });

      const campaign = await prisma.customerCampaign.create({
        data: {
          businessId: businessA.id,
          createdBy: "Owner A",
          subject: "Already Sent Announcement",
          body: "Message body",
          status: "SENT",
          sentCount: 2,
          recipientCount: 2,
        },
      });

      const res = await sendCampaignAction(businessA.id, campaign.id);
      expect(res.error).toMatch(/already in progress or has already been sent/i);
    });

    it("should enforce atomic state acquisition so concurrent send calls cannot double-send", async () => {
      vi.spyOn(authHelpers, "requireBusinessRole").mockResolvedValue({
        user: ownerUserA,
        membership: { role: "OWNER" } as unknown as Membership,
        business: businessA,
        role: Role.OWNER,
      });

      const campaign = await prisma.customerCampaign.create({
        data: {
          businessId: businessA.id,
          createdBy: "Owner A",
          subject: "Concurrent Test",
          body: "Concurrent Message",
          status: "DRAFT",
          recipientCount: 2,
        },
      });

      vi.spyOn(emailModule, "sendCustomerCampaignEmail").mockResolvedValue({
        success: true,
        messageId: "msg-concurrent",
      });

      // Fire two concurrent send requests
      const [res1, res2] = await Promise.all([
        sendCampaignAction(businessA.id, campaign.id),
        sendCampaignAction(businessA.id, campaign.id),
      ]);

      // Exactly one must succeed, and one must be rejected by atomic state check
      const successes = [res1, res2].filter((r) => r.success);
      const errors = [res1, res2].filter((r) => r.error);

      expect(successes.length).toBe(1);
      expect(errors.length).toBe(1);
      expect(errors[0].error).toMatch(/cannot be sent in its current state|already/i);
    });
  });

  describe("4. Partial Failures, Recipient Snapshots & Delivery Audit", () => {
    it("should record PARTIALLY_SENT when some recipients fail and some succeed", async () => {
      vi.spyOn(authHelpers, "requireBusinessRole").mockResolvedValue({
        user: ownerUserA,
        membership: { role: "OWNER" } as unknown as Membership,
        business: businessA,
        role: Role.OWNER,
      });

      const campaign = await prisma.customerCampaign.create({
        data: {
          businessId: businessA.id,
          createdBy: "Owner A",
          subject: "Partial Delivery Test",
          body: "Testing partial results",
          status: "DRAFT",
          recipientCount: 2,
        },
      });

      // Mock email sending: Alice succeeds, Bob fails
      vi.spyOn(emailModule, "sendCustomerCampaignEmail").mockImplementation(async ({ to }) => {
        if (to === "alice@campaign-test.com") {
          return { success: true, messageId: "msg-alice" };
        }
        return { success: false, error: "Mailbox full / rejected by upstream" };
      });

      const sendRes = await sendCampaignAction(businessA.id, campaign.id);

      expect(sendRes.success).toBe(true);
      expect(sendRes.status).toBe("PARTIALLY_SENT");
      expect(sendRes.sentCount).toBe(1);
      expect(sendRes.failedCount).toBe(1);

      const dbCampaign = await prisma.customerCampaign.findUnique({
        where: { id: campaign.id },
      });
      expect(dbCampaign?.status).toBe("PARTIALLY_SENT");
      expect(dbCampaign?.sentCount).toBe(1);
      expect(dbCampaign?.failedCount).toBe(1);

      // Verify recipient audit
      const recipients = await prisma.campaignRecipient.findMany({
        where: { campaignId: campaign.id },
        orderBy: { email: "asc" },
      });
      expect(recipients[0].email).toBe("alice@campaign-test.com");
      expect(recipients[0].status).toBe("SENT");
      expect(recipients[1].email).toBe("bob@campaign-test.com");
      expect(recipients[1].status).toBe("FAILED");
      expect(recipients[1].errorMessage).toMatch(/rejected/i);
    });

    it("should record FAILED when all recipients fail", async () => {
      vi.spyOn(authHelpers, "requireBusinessRole").mockResolvedValue({
        user: ownerUserA,
        membership: { role: "OWNER" } as unknown as Membership,
        business: businessA,
        role: Role.OWNER,
      });

      const campaign = await prisma.customerCampaign.create({
        data: {
          businessId: businessA.id,
          createdBy: "Owner A",
          subject: "Total Failure Test",
          body: "Testing failure",
          status: "DRAFT",
          recipientCount: 2,
        },
      });

      // Mock all emails failing
      vi.spyOn(emailModule, "sendCustomerCampaignEmail").mockResolvedValue({
        success: false,
        error: "Provider down",
      });

      const sendRes = await sendCampaignAction(businessA.id, campaign.id);

      expect(sendRes.success).toBe(true);
      expect(sendRes.status).toBe("FAILED");
      expect(sendRes.sentCount).toBe(0);
      expect(sendRes.failedCount).toBe(2);
    });

    it("should preserve historical snapshot email even if customer email is subsequently modified", async () => {
      vi.spyOn(authHelpers, "requireBusinessRole").mockResolvedValue({
        user: ownerUserA,
        membership: { role: "OWNER" } as unknown as Membership,
        business: businessA,
        role: Role.OWNER,
      });

      const campaign = await prisma.customerCampaign.create({
        data: {
          businessId: businessA.id,
          createdBy: "Owner A",
          subject: "Historical Snapshot Test",
          body: "Testing snapshot",
          status: "DRAFT",
          recipientCount: 2,
        },
      });

      vi.spyOn(emailModule, "sendCustomerCampaignEmail").mockResolvedValue({
        success: true,
        messageId: "msg-snapshot",
      });

      await sendCampaignAction(businessA.id, campaign.id);

      // Customer subsequently changes email
      await prisma.customer.update({
        where: { id: customerA1.id },
        data: { email: "alice-new-address@campaign-test.com" },
      });

      // The historical campaign recipient record MUST still have the snapshot email
      const recipient = await prisma.campaignRecipient.findFirst({
        where: { campaignId: campaign.id, customerId: customerA1.id },
      });

      expect(recipient?.email).toBe("alice@campaign-test.com");
    });
  });

  describe("5. Campaign History, Deletion & Production Safety", () => {
    it("should retrieve campaign history scoped exclusively to active business", async () => {
      // Create campaign for Business A
      await prisma.customerCampaign.create({
        data: {
          businessId: businessA.id,
          createdBy: "Owner A",
          subject: "Biz A Promo",
          body: "Promo text",
          status: "SENT",
          sentCount: 2,
          recipientCount: 2,
        },
      });

      // Create campaign for Business B
      await prisma.customerCampaign.create({
        data: {
          businessId: businessB.id,
          createdBy: "Owner B",
          subject: "Biz B Exclusive",
          body: "Exclusive text",
          status: "SENT",
          sentCount: 1,
          recipientCount: 1,
        },
      });

      vi.spyOn(authHelpers, "requireBusinessMembership").mockResolvedValue({
        user: ownerUserA,
        membership: { role: "OWNER" } as unknown as Membership,
        business: businessA,
        role: Role.OWNER,
      });

      const historyA = await getCampaignsAction(businessA.id);
      expect(historyA.success).toBe(true);
      expect(historyA.campaigns.length).toBe(1);
      expect(historyA.campaigns[0].subject).toBe("Biz A Promo");
    });

    it("should allow deleting DRAFT campaign and forbid deleting SENT campaign", async () => {
      vi.spyOn(authHelpers, "requireBusinessRole").mockResolvedValue({
        user: ownerUserA,
        membership: { role: "OWNER" } as unknown as Membership,
        business: businessA,
        role: Role.OWNER,
      });

      const draftCampaign = await prisma.customerCampaign.create({
        data: {
          businessId: businessA.id,
          createdBy: "Owner A",
          subject: "Unwanted Draft",
          body: "Draft body",
          status: "DRAFT",
        },
      });

      const sentCampaign = await prisma.customerCampaign.create({
        data: {
          businessId: businessA.id,
          createdBy: "Owner A",
          subject: "Permanent Sent Campaign",
          body: "Sent body",
          status: "SENT",
          sentCount: 2,
        },
      });

      // Deleting draft should succeed
      const deleteDraftRes = await deleteCampaignAction(businessA.id, draftCampaign.id);
      expect(deleteDraftRes.success).toBe(true);

      // Deleting sent campaign should fail
      const deleteSentRes = await deleteCampaignAction(businessA.id, sentCampaign.id);
      expect(deleteSentRes.error).toMatch(/only draft campaigns can be deleted/i);
    });

    it("should return campaign details and individual recipient breakdown for authorized user", async () => {
      vi.spyOn(authHelpers, "requireBusinessMembership").mockResolvedValue({
        user: ownerUserA,
        membership: { role: "OWNER" } as unknown as Membership,
        business: businessA,
        role: Role.OWNER,
      });

      const campaign = await prisma.customerCampaign.create({
        data: {
          businessId: businessA.id,
          createdBy: "Owner A",
          subject: "Detailed Report Campaign",
          body: "Message body",
          status: "SENT",
          sentCount: 1,
          recipients: {
            create: {
              customerId: customerA1.id,
              email: "alice@campaign-test.com",
              status: "SENT",
              sentAt: new Date(),
            },
          },
        },
      });

      const details = await getCampaignDetailsAction(businessA.id, campaign.id);
      expect(details.success).toBe(true);
      expect(details.campaign?.subject).toBe("Detailed Report Campaign");
      expect(details.recipients?.length).toBe(1);
      expect(details.recipients?.[0].customerName).toBe("Alice Johnson");
      expect(details.recipients?.[0].email).toBe("alice@campaign-test.com");
      expect(details.recipients?.[0].status).toBe("SENT");
    });

    it("should fail safely in production when RESEND_API_KEY is missing", async () => {
      const originalNodeEnv = process.env.NODE_ENV;
      const originalApiKey = process.env.RESEND_API_KEY;

      try {
        (process.env as Record<string, string | undefined>).NODE_ENV = "production";
        delete process.env.RESEND_API_KEY;

        const result = await emailModule.sendCustomerCampaignEmail({
          to: "customer@example.com",
          businessName: "Acme Electronics",
          subject: "Test Production Announcement",
          message: "Test message",
        });

        expect(result.success).toBe(false);
        expect(result.error).toMatch(/not configured in production/i);
      } finally {
        (process.env as Record<string, string | undefined>).NODE_ENV = originalNodeEnv;
        if (originalApiKey) process.env.RESEND_API_KEY = originalApiKey;
      }
    });

    it("should reject campaign creation when no eligible recipients exist", async () => {
      // Business with no customers
      const emptyBusiness = await prisma.business.create({
        data: {
          name: "Empty Store",
          slug: `empty-store-${Date.now()}`,
          businessType: "RETAIL",
        },
      });

      vi.spyOn(authHelpers, "requireBusinessRole").mockResolvedValue({
        user: ownerUserA,
        membership: { role: "OWNER" } as unknown as Membership,
        business: emptyBusiness,
        role: Role.OWNER,
      });

      const res = await createCampaignAction(emptyBusiness.id, {
        subject: "No Recipients Test",
        body: "Test message",
      });

      expect(res.error).toMatch(/no eligible customers with valid email addresses found/i);
    });
  });

  describe("6. Hard Server-Side 500-Recipient Limit Enforcement", () => {
    let largeBiz: Business;
    let largeOwner: User;

    beforeEach(async () => {
      // Clean up and create a large business
      largeBiz = await prisma.business.upsert({
        where: { slug: "large-campaign-biz" },
        update: {},
        create: {
          name: "Large Scale Business",
          slug: "large-campaign-biz",
          businessType: "RETAIL",
          currency: "NGN",
        },
      });

      largeOwner = await prisma.user.upsert({
        where: { email: "large-owner@campaign-test.com" },
        update: {},
        create: {
          email: "large-owner@campaign-test.com",
          name: "Large Owner",
          password: "$2a$10$abcdefg",
        },
      });

      await prisma.membership.upsert({
        where: { userId_businessId: { userId: largeOwner.id, businessId: largeBiz.id } },
        update: { role: "OWNER" },
        create: { userId: largeOwner.id, businessId: largeBiz.id, role: "OWNER" },
      });

      await prisma.campaignRecipient.deleteMany({});
      await prisma.customerCampaign.deleteMany({});
      await prisma.customer.deleteMany({
        where: { businessId: largeBiz.id },
      });
    });

    it("should allow campaign creation when eligible recipients count is exactly 500", async () => {
      vi.spyOn(authHelpers, "requireBusinessRole").mockResolvedValue({
        user: largeOwner,
        membership: { role: "OWNER" } as unknown as Membership,
        business: largeBiz,
        role: Role.OWNER,
      });

      // Create exactly 500 customers with unique emails
      const customerData = Array.from({ length: 500 }, (_, i) => ({
        businessId: largeBiz.id,
        name: `Customer ${i + 1}`,
        email: `customer${i + 1}@large-test.com`,
      }));
      await prisma.customer.createMany({ data: customerData });

      const res = await createCampaignAction(largeBiz.id, {
        subject: "500 Customers Announcement",
        body: "Reaching exactly 500 customers.",
      });

      expect(res.success).toBe(true);
      expect(res.recipientCount).toBe(500);
      expect(res.campaignId).toBeDefined();
    });

    it("should reject campaign creation when eligible recipients count is 501", async () => {
      vi.spyOn(authHelpers, "requireBusinessRole").mockResolvedValue({
        user: largeOwner,
        membership: { role: "OWNER" } as unknown as Membership,
        business: largeBiz,
        role: Role.OWNER,
      });

      // Create 501 customers
      const customerData = Array.from({ length: 501 }, (_, i) => ({
        businessId: largeBiz.id,
        name: `Customer ${i + 1}`,
        email: `customer${i + 1}@large-test.com`,
      }));
      await prisma.customer.createMany({ data: customerData });

      const res = await createCampaignAction(largeBiz.id, {
        subject: "501 Customers Announcement",
        body: "Reaching 501 customers.",
      });

      expect(res.error).toMatch(/exceeds maximum recipient limit of 500 customers/i);
      expect(res.error).toMatch(/501/);
      expect(res.success).toBeUndefined();
    });

    it("should reject sendCampaignAction when eligible recipients count is 501, keep campaign in DRAFT, and send ZERO emails", async () => {
      vi.spyOn(authHelpers, "requireBusinessRole").mockResolvedValue({
        user: largeOwner,
        membership: { role: "OWNER" } as unknown as Membership,
        business: largeBiz,
        role: Role.OWNER,
      });

      // Create 501 customers
      const customerData = Array.from({ length: 501 }, (_, i) => ({
        businessId: largeBiz.id,
        name: `Customer ${i + 1}`,
        email: `customer${i + 1}@large-test.com`,
      }));
      await prisma.customer.createMany({ data: customerData });

      // Create DRAFT campaign directly in DB
      const draftCampaign = await prisma.customerCampaign.create({
        data: {
          businessId: largeBiz.id,
          createdBy: "Large Owner",
          subject: "Oversized Campaign",
          body: "Trying to send to 501 recipients",
          status: "DRAFT",
          recipientCount: 501,
        },
      });

      const emailSpy = vi.spyOn(emailModule, "sendCustomerCampaignEmail");

      const sendRes = await sendCampaignAction(largeBiz.id, draftCampaign.id);

      // Verify rejected
      expect(sendRes.error).toMatch(/exceeds maximum recipient limit of 500 customers/i);
      expect(sendRes.success).toBeUndefined();

      // ZERO emails must have been sent
      expect(emailSpy).not.toHaveBeenCalled();

      // Campaign MUST remain in DRAFT status
      const dbCampaign = await prisma.customerCampaign.findUnique({
        where: { id: draftCampaign.id },
      });
      expect(dbCampaign?.status).toBe("DRAFT");
      expect(dbCampaign?.sentCount).toBe(0);
      expect(dbCampaign?.sentAt).toBeNull();
    });

    it("should reject selected-customer campaign when selected list exceeds 500 eligible recipients", async () => {
      vi.spyOn(authHelpers, "requireBusinessRole").mockResolvedValue({
        user: largeOwner,
        membership: { role: "OWNER" } as unknown as Membership,
        business: largeBiz,
        role: Role.OWNER,
      });

      const customerData = Array.from({ length: 505 }, (_, i) => ({
        businessId: largeBiz.id,
        name: `Customer ${i + 1}`,
        email: `customer${i + 1}@large-test.com`,
      }));
      await prisma.customer.createMany({ data: customerData });

      const allCustomers = await prisma.customer.findMany({
        where: { businessId: largeBiz.id },
        select: { id: true },
      });

      const selectedIds = allCustomers.map((c) => c.id); // 505 customer IDs

      const res = await createCampaignAction(largeBiz.id, {
        subject: "Selected Customers Overflow",
        body: "Testing selected customers limit.",
        customerIds: selectedIds,
      });

      expect(res.error).toMatch(/exceeds maximum recipient limit of 500 customers/i);
    });
  });
});
