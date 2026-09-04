import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { prisma } from "../../../../lib/prisma";
import { getBusinessSubscription } from "../../../../lib/subscriptions/service";
import { sendMorningBriefToWhatsApp } from "../../../../lib/autopilot/delivery";
import { cleanupExpiredServerlessState } from "../../../../lib/cleanup";

/**
 * Validates the Cron Secret from the Authorization header.
 * Uses timing-safe comparison and fails closed in production.
 */
function verifyCronAuthorization(req: NextRequest): boolean {
  const isProduction = process.env.NODE_ENV === "production";
  const cronSecret = process.env.CRON_SECRET;

  if (!cronSecret || cronSecret.trim() === "") {
    if (isProduction) {
      console.error("[Cron Security] Critical: CRON_SECRET is not configured in production. Rejecting cron trigger (fail-closed).");
      return false;
    }
    // In dev / test: allow only if request sends Authorization matching test secret or fallback
    const authHeader = req.headers.get("authorization");
    if (!authHeader) return false;
    const token = authHeader.replace(/^Bearer\s+/i, "").trim();
    return token === "test_cron_secret" || token.length > 0;
  }

  const authHeader = req.headers.get("authorization");
  if (!authHeader) {
    return false;
  }

  const token = authHeader.replace(/^Bearer\s+/i, "").trim();
  if (!token) {
    return false;
  }

  try {
    const expectedBuf = Buffer.from(cronSecret.trim());
    const actualBuf = Buffer.from(token);

    if (expectedBuf.length !== actualBuf.length) {
      return false;
    }

    return crypto.timingSafeEqual(expectedBuf, actualBuf);
  } catch {
    return false;
  }
}

/**
 * GET /api/cron/morning-brief
 * Vercel Cron support (Vercel Cron invokes GET requests with Authorization: Bearer <CRON_SECRET>).
 */
export async function GET(req: NextRequest) {
  return POST(req);
}

/**
 * POST /api/cron/morning-brief
 * Daily scheduled background worker to dispatch Morning Business Briefings to active businesses.
 */
export async function POST(req: NextRequest) {
  // 1. Authorization check
  const isAuthorized = verifyCronAuthorization(req);
  if (!isAuthorized) {
    console.warn("[Cron Security] Unauthorized morning-brief cron attempt rejected.");
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let processed = 0;
  let sent = 0;
  let skipped = 0;
  let failed = 0;

  try {
    // 2. Storage Maintenance: Clean expired serverless state rows
    await cleanupExpiredServerlessState();

    // 3. Fetch all verified WhatsApp connections
    const verifiedConnections = await prisma.whatsAppConnection.findMany({

      where: { verified: true },
      include: {
        business: {
          select: {
            id: true,
            name: true,
            slug: true,
          },
        },
      },
    });

    processed = verifiedConnections.length;

    // 3. Process each verified business
    for (const conn of verifiedConnections) {
      try {
        const businessId = conn.businessId;

        // Check subscription status
        const subState = await getBusinessSubscription(businessId);

        // Skip businesses whose trial or paid subscription is expired
        if (!subState.isActive) {
          console.log(`[Cron Morning Brief] Skipped business ${conn.business.slug} — subscription status: ${subState.status}`);
          skipped++;
          continue;
        }

        // Deliver Morning Brief
        const deliveryResult = await sendMorningBriefToWhatsApp(businessId);

        if (deliveryResult.success) {
          sent++;
          console.log(`[Cron Morning Brief] Successfully sent morning brief to business ${conn.business.slug}`);
        } else {
          failed++;
          console.warn(`[Cron Morning Brief] Delivery failed for business ${conn.business.slug}: ${deliveryResult.reason}`);
        }
      } catch (bizErr: unknown) {
        failed++;
        const errMsg = bizErr instanceof Error ? bizErr.message : "Unknown error";
        console.error(`[Cron Morning Brief Error] Failed processing business ${conn.businessId}: ${errMsg}`);
      }
    }

    return NextResponse.json({
      success: true,
      processed,
      sent,
      skipped,
      failed,
      timestamp: new Date().toISOString(),
    });
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : "Internal cron execution failure";
    console.error("[Cron Morning Brief Fatal Error]", errorMsg);
    return NextResponse.json(
      {
        success: false,
        error: "Cron execution encountered an internal error",
        processed,
        sent,
        skipped,
        failed,
      },
      { status: 500 }
    );
  }
}
