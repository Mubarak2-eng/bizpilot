import { BusinessHealthMetrics } from "../brain/types";
import { AutopilotEvent, BusinessOpportunity, DailyActionItem, DailyActionPlan } from "./types";

/**
 * Builds the prioritized Daily Action Plan (max 5 items) for a business.
 */
export function buildDailyActionPlan(
  businessId: string,
  businessName: string,
  businessType: string,
  events: AutopilotEvent[],
  opportunities: BusinessOpportunity[],
  referenceDate = new Date()
): DailyActionPlan {
  const actions: DailyActionItem[] = [];

  // Sort events deterministically by severity score: CRITICAL (4), HIGH (3), MEDIUM (2), LOW (1)
  const severityScore: Record<string, number> = {
    CRITICAL: 4,
    HIGH: 3,
    MEDIUM: 2,
    LOW: 1,
  };

  const sortedEvents = [...events].sort(
    (a, b) => (severityScore[b.severity] || 0) - (severityScore[a.severity] || 0)
  );

  // 1. Add top problem/alert events
  for (const ev of sortedEvents) {
    if (actions.length >= 4) break;

    const badge =
      ev.severity === "CRITICAL"
        ? "🔴"
        : ev.severity === "HIGH"
        ? "🟠"
        : ev.severity === "MEDIUM"
        ? "🟡"
        : "🟢";

    const evidenceStr =
      typeof ev.evidence === "object"
        ? Object.entries(ev.evidence)
            .map(([k, v]) => `${k}: ${v}`)
            .join(", ")
        : String(ev.evidence);

    actions.push({
      priority: actions.length + 1,
      severity: ev.severity,
      badge,
      title: ev.title,
      action: ev.recommendedAction,
      evidence: evidenceStr,
      category: ev.type,
      relatedEntityId: (ev.evidence as Record<string, unknown>)?.productId as string | undefined,
    });
  }

  // 2. Add top growth opportunities if space remains
  for (const opp of opportunities) {
    if (actions.length >= 5) break;

    actions.push({
      priority: actions.length + 1,
      severity: "LOW",
      badge: "🟢",
      title: opp.title,
      action: opp.recommendedNextStep,
      evidence: opp.evidence,
      category: opp.category,
    });
  }

  // Date formatting
  const dateStr = referenceDate.toLocaleDateString("en-GB", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });

  // Dynamic headline
  let headline = "Your business is operating normally today. No urgent action is required.";
  const criticalCount = actions.filter((a) => a.severity === "CRITICAL").length;
  const highCount = actions.filter((a) => a.severity === "HIGH").length;

  if (criticalCount > 0) {
    headline = `Immediate Action Needed: ${criticalCount} critical situation${criticalCount > 1 ? "s" : ""} detected today.`;
  } else if (highCount > 0) {
    headline = `Operational Focus: ${highCount} high-priority item${highCount > 1 ? "s" : ""} require attention.`;
  } else if (actions.length > 0) {
    headline = `Today's Roadmap: ${actions.length} strategic priority recommendation${actions.length > 1 ? "s" : ""}.`;
  }

  // Build formatted summary text
  const lines: string[] = [];
  lines.push(`📋 **TODAY'S BIZPILOT ACTION PLAN** — ${businessName}`);
  lines.push(`📅 *${dateStr}*\n`);
  lines.push(`*${headline}*\n`);

  if (actions.length === 0) {
    lines.push("✅ **All Clear**: No overdue invoices, no depleted inventory, and operations are running smoothly.\n");
  } else {
    for (const a of actions) {
      lines.push(`${a.badge} **${a.priority}. ${a.title}**`);
      lines.push(`   ↳ **Action**: ${a.action}`);
      if (a.evidence) {
        lines.push(`   ↳ _Evidence_: ${a.evidence}`);
      }
      lines.push("");
    }
  }

  return {
    businessId,
    businessName,
    businessType,
    date: dateStr,
    headline,
    totalActions: actions.length,
    actions,
    formattedSummary: lines.join("\n"),
  };
}
