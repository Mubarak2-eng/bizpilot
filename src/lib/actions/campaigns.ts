"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireBusinessMembership, requireBusinessRole } from "@/lib/auth-helpers";
import { Role } from "@/types/auth";
import { CampaignStatus, RecipientStatus } from "@prisma/client";
import { sendCustomerCampaignEmail } from "@/lib/email";

// Email validation helper regex
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Resolves the hard server-side maximum recipients allowed per campaign.
 * Defaults to 500 or reads from process.env.MAX_CAMPAIGN_RECIPIENTS.
 */
function resolveMaxCampaignRecipients(): number {
  const envVal = process.env.MAX_CAMPAIGN_RECIPIENTS;
  if (envVal && !isNaN(parseInt(envVal, 10)) && parseInt(envVal, 10) > 0) {
    return parseInt(envVal, 10);
  }
  return 500;
}

export async function getMaxCampaignRecipients(): Promise<number> {
  return resolveMaxCampaignRecipients();
}

export interface CampaignRecipientPreview {
  customerId: string;
  name: string;
  email: string;
}

export interface PreviewRecipientsResult {
  success?: boolean;
  error?: string;
  totalTargeted: number;
  eligibleCount: number;
  skippedCount: number;
  skippedBreakdown: {
    noEmail: number;
    invalidEmail: number;
    duplicateEmail: number;
  };
  recipients: CampaignRecipientPreview[];
}

export interface CampaignItem {
  id: string;
  subject: string;
  body: string;
  status: CampaignStatus;
  recipientCount: number;
  sentCount: number;
  failedCount: number;
  createdBy: string;
  createdAt: string;
  sentAt: string | null;
}

export interface CampaignDetailRecipient {
  id: string;
  customerId: string | null;
  customerName: string;
  email: string;
  status: RecipientStatus;
  errorMessage: string | null;
  sentAt: string | null;
}

export interface CampaignDetailsResult {
  success?: boolean;
  error?: string;
  campaign?: CampaignItem;
  recipients?: CampaignDetailRecipient[];
}

/**
 * Previews eligible and skipped recipients for a prospective campaign.
 * Evaluates missing emails, invalid emails, and duplicates within the active tenant.
 */
export async function previewCampaignRecipientsAction(
  businessId: string,
  customerIds?: string[]
): Promise<PreviewRecipientsResult> {
  try {
    const context = await requireBusinessRole(businessId, Role.ADMIN);

    // Fetch customers belonging ONLY to this business
    const customers = await prisma.customer.findMany({
      where: {
        businessId: context.business.id,
        ...(customerIds && customerIds.length > 0 ? { id: { in: customerIds } } : {}),
      },
      select: {
        id: true,
        name: true,
        email: true,
      },
      orderBy: { name: "asc" },
    });

    let noEmail = 0;
    let invalidEmail = 0;
    let duplicateEmail = 0;

    const seenEmails = new Set<string>();
    const eligible: CampaignRecipientPreview[] = [];

    for (const c of customers) {
      if (!c.email || c.email.trim() === "") {
        noEmail++;
        continue;
      }

      const cleanEmail = c.email.toLowerCase().trim();

      if (!EMAIL_REGEX.test(cleanEmail)) {
        invalidEmail++;
        continue;
      }

      if (seenEmails.has(cleanEmail)) {
        duplicateEmail++;
        continue;
      }

      seenEmails.add(cleanEmail);
      eligible.push({
        customerId: c.id,
        name: c.name,
        email: cleanEmail,
      });
    }

    const skippedCount = noEmail + invalidEmail + duplicateEmail;

    return {
      success: true,
      totalTargeted: customers.length,
      eligibleCount: eligible.length,
      skippedCount,
      skippedBreakdown: {
        noEmail,
        invalidEmail,
        duplicateEmail,
      },
      recipients: eligible,
    };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Failed to preview recipients.";
    return {
      error: msg,
      totalTargeted: 0,
      eligibleCount: 0,
      skippedCount: 0,
      skippedBreakdown: { noEmail: 0, invalidEmail: 0, duplicateEmail: 0 },
      recipients: [],
    };
  }
}

/**
 * Creates a new customer announcement campaign in DRAFT status.
 */
export async function createCampaignAction(
  businessId: string,
  input: {
    subject: string;
    body: string;
    customerIds?: string[];
  }
): Promise<{ success?: boolean; error?: string; campaignId?: string; recipientCount?: number }> {
  try {
    const context = await requireBusinessRole(businessId, Role.ADMIN);

    const subject = input.subject?.trim();
    const body = input.body?.trim();

    if (!subject || subject.length === 0) {
      return { error: "Campaign subject cannot be empty." };
    }

    if (!body || body.length === 0) {
      return { error: "Campaign message cannot be empty." };
    }

    // Verify recipient eligibility
    const preview = await previewCampaignRecipientsAction(businessId, input.customerIds);
    if (!preview.success || preview.eligibleCount === 0) {
      return { error: "No eligible customers with valid email addresses found." };
    }

    const maxLimit = resolveMaxCampaignRecipients();
    if (preview.eligibleCount > maxLimit) {
      return {
        error: `Campaign exceeds maximum recipient limit of ${maxLimit} customers. Found ${preview.eligibleCount} eligible recipients.`,
      };
    }

    const campaign = await prisma.customerCampaign.create({
      data: {
        businessId: context.business.id,
        createdBy: context.user.name || context.user.email || "Administrator",
        subject,
        body,
        status: "DRAFT",
        recipientCount: preview.eligibleCount,
      },
    });

    revalidatePath("/customers");

    return {
      success: true,
      campaignId: campaign.id,
      recipientCount: preview.eligibleCount,
    };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Failed to create campaign.";
    return { error: msg };
  }
}

/**
 * Dispatches an email campaign to eligible customer recipients.
 * Enforces server-side recipient limit and atomic DRAFT -> SENDING state transition.
 */
export async function sendCampaignAction(
  businessId: string,
  campaignId: string,
  customerIds?: string[]
): Promise<{
  success?: boolean;
  error?: string;
  status?: CampaignStatus;
  sentCount?: number;
  failedCount?: number;
  total?: number;
}> {
  try {
    const context = await requireBusinessRole(businessId, Role.ADMIN);

    // 1. Verify campaign exists and is currently in DRAFT status
    const campaign = await prisma.customerCampaign.findFirst({
      where: {
        id: campaignId,
        businessId: context.business.id,
      },
    });

    if (!campaign) {
      return { error: "Campaign not found or access denied." };
    }

    if (campaign.status === "SENDING" || campaign.status === "SENT") {
      return { error: `Campaign is already in progress or has already been sent (${campaign.status}).` };
    }

    if (campaign.status !== "DRAFT") {
      return { error: `Campaign cannot be sent in its current state (${campaign.status}).` };
    }

    // 2. Fetch and deduplicate eligible recipients
    const preview = await previewCampaignRecipientsAction(businessId, customerIds);
    const recipients = preview.recipients;

    if (!preview.success || recipients.length === 0) {
      return { error: "No eligible recipients with valid email addresses found." };
    }

    // 3. Hard server-side recipient limit check (Checked BEFORE DRAFT -> SENDING transition)
    const maxLimit = resolveMaxCampaignRecipients();
    if (recipients.length > maxLimit) {
      return {
        error: `Campaign exceeds maximum recipient limit of ${maxLimit} customers. Found ${recipients.length} eligible recipients.`,
      };
    }

    // 4. Atomic state acquisition: Lock DRAFT -> SENDING
    const lockResult = await prisma.customerCampaign.updateMany({
      where: {
        id: campaignId,
        businessId: context.business.id,
        status: "DRAFT",
      },
      data: {
        status: "SENDING",
      },
    });

    if (lockResult.count === 0) {
      return { error: "Campaign is already being processed or has already been sent." };
    }

    let sentCount = 0;
    let failedCount = 0;

    // 3. Dispatch emails sequentially with delivery audit snapshots
    for (const r of recipients) {
      // Create pending snapshot record
      const recipientRecord = await prisma.campaignRecipient.create({
        data: {
          campaignId: campaign.id,
          customerId: r.customerId,
          email: r.email,
          status: "PENDING",
        },
      });

      // Send email via Resend
      const sendResult = await sendCustomerCampaignEmail({
        to: r.email,
        customerName: r.name,
        businessName: context.business.name,
        subject: campaign.subject,
        message: campaign.body,
      });

      if (sendResult.success) {
        sentCount++;
        await prisma.campaignRecipient.update({
          where: { id: recipientRecord.id },
          data: {
            status: "SENT",
            sentAt: new Date(),
          },
        });
      } else {
        failedCount++;
        await prisma.campaignRecipient.update({
          where: { id: recipientRecord.id },
          data: {
            status: "FAILED",
            errorMessage: sendResult.error || "Email dispatch failed",
          },
        });
      }
    }

    // 4. Compute final campaign status
    let finalStatus: CampaignStatus = "SENT";
    if (sentCount === 0 && failedCount > 0) {
      finalStatus = "FAILED";
    } else if (failedCount > 0) {
      finalStatus = "PARTIALLY_SENT";
    }

    const now = new Date();
    await prisma.customerCampaign.update({
      where: { id: campaign.id },
      data: {
        status: finalStatus,
        sentCount,
        failedCount,
        recipientCount: recipients.length,
        sentAt: now,
      },
    });

    revalidatePath("/customers");

    return {
      success: true,
      status: finalStatus,
      sentCount,
      failedCount,
      total: recipients.length,
    };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Unexpected error during campaign dispatch.";
    return { error: msg };
  }
}

/**
 * Retrieves the campaign history for the active business.
 */
export async function getCampaignsAction(
  businessId: string,
  limit = 20
): Promise<{ success?: boolean; error?: string; campaigns: CampaignItem[] }> {
  try {
    const context = await requireBusinessMembership(businessId);

    const records = await prisma.customerCampaign.findMany({
      where: { businessId: context.business.id },
      orderBy: { createdAt: "desc" },
      take: limit,
    });

    const campaigns: CampaignItem[] = records.map((c) => ({
      id: c.id,
      subject: c.subject,
      body: c.body,
      status: c.status,
      recipientCount: c.recipientCount,
      sentCount: c.sentCount,
      failedCount: c.failedCount,
      createdBy: c.createdBy,
      createdAt: c.createdAt.toISOString(),
      sentAt: c.sentAt ? c.sentAt.toISOString() : null,
    }));

    return {
      success: true,
      campaigns,
    };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Failed to load campaigns.";
    return { error: msg, campaigns: [] };
  }
}

/**
 * Retrieves full campaign details and individual recipient delivery snapshots.
 */
export async function getCampaignDetailsAction(
  businessId: string,
  campaignId: string
): Promise<CampaignDetailsResult> {
  try {
    const context = await requireBusinessMembership(businessId);

    const campaign = await prisma.customerCampaign.findFirst({
      where: {
        id: campaignId,
        businessId: context.business.id,
      },
      include: {
        recipients: {
          include: {
            customer: {
              select: {
                id: true,
                name: true,
              },
            },
          },
          orderBy: { createdAt: "asc" },
        },
      },
    });

    if (!campaign) {
      return { error: "Campaign not found or access denied." };
    }

    const formattedCampaign: CampaignItem = {
      id: campaign.id,
      subject: campaign.subject,
      body: campaign.body,
      status: campaign.status,
      recipientCount: campaign.recipientCount,
      sentCount: campaign.sentCount,
      failedCount: campaign.failedCount,
      createdBy: campaign.createdBy,
      createdAt: campaign.createdAt.toISOString(),
      sentAt: campaign.sentAt ? campaign.sentAt.toISOString() : null,
    };

    const formattedRecipients: CampaignDetailRecipient[] = campaign.recipients.map((r) => ({
      id: r.id,
      customerId: r.customerId,
      customerName: r.customer?.name || "Customer",
      email: r.email,
      status: r.status,
      errorMessage: r.errorMessage,
      sentAt: r.sentAt ? r.sentAt.toISOString() : null,
    }));

    return {
      success: true,
      campaign: formattedCampaign,
      recipients: formattedRecipients,
    };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Failed to load campaign details.";
    return { error: msg };
  }
}

/**
 * Deletes a draft campaign.
 */
export async function deleteCampaignAction(
  businessId: string,
  campaignId: string
): Promise<{ success?: boolean; error?: string }> {
  try {
    const context = await requireBusinessRole(businessId, Role.ADMIN);

    const campaign = await prisma.customerCampaign.findFirst({
      where: { id: campaignId, businessId: context.business.id },
    });

    if (!campaign) {
      return { error: "Campaign not found or access denied." };
    }

    if (campaign.status !== "DRAFT") {
      return { error: "Only draft campaigns can be deleted." };
    }

    await prisma.customerCampaign.delete({
      where: { id: campaignId },
    });

    revalidatePath("/customers");

    return { success: true };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Failed to delete campaign.";
    return { error: msg };
  }
}
