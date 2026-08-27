import { calculateBusinessHealth } from "../brain/health";
import { evaluateNeedsAttention } from "../brain/attention";
import { evaluateIndustryIntelligence } from "../brain/industry";
import { detectAutopilotEvents } from "./events";
import { detectBusinessOpportunities } from "./opportunities";
import { buildDailyActionPlan } from "./action-plans";
import { generateMorningBrief } from "./morning-brief";
import { AutopilotEvent, BusinessOpportunity, DailyActionPlan, MorningBrief } from "./types";

export interface BusinessAutopilotEvaluation {
  businessId: string;
  businessName: string;
  businessType: string;
  currency: string;
  evaluatedAt: string;
  events: AutopilotEvent[];
  opportunities: BusinessOpportunity[];
  actionPlan: DailyActionPlan;
  morningBrief: MorningBrief;
}

/**
 * Main server-side Business Autopilot Engine.
 * Consumes the trusted Business Brain and Industry Intelligence to generate
 * prioritized alerts, commercial growth opportunities, and the Daily Action Plan.
 */
export async function evaluateBusinessAutopilot(
  businessId: string,
  referenceDate = new Date()
): Promise<BusinessAutopilotEvaluation> {
  // 1. Calculate deterministic business health
  const health = await calculateBusinessHealth(businessId, referenceDate);

  // 2. Evaluate industry intelligence
  const attention = evaluateNeedsAttention(health);
  const industryInsights = evaluateIndustryIntelligence(
    health,
    attention,
    health.businessType || "OTHER"
  );

  // 3. Detect prioritized operational events
  const events = detectAutopilotEvents(health, industryInsights, referenceDate);

  // 4. Detect grounded commercial opportunities
  const opportunities = detectBusinessOpportunities(health);

  // 5. Build prioritized Daily Action Plan (max 5 items)
  const actionPlan = buildDailyActionPlan(
    businessId,
    health.businessName,
    health.businessType || "OTHER",
    events,
    opportunities,
    referenceDate
  );

  // 6. Generate crisp Morning Business Brief
  const morningBrief = generateMorningBrief(health, events, opportunities, referenceDate);

  return {
    businessId,
    businessName: health.businessName,
    businessType: health.businessType || "OTHER",
    currency: health.currency,
    evaluatedAt: referenceDate.toISOString(),
    events,
    opportunities,
    actionPlan,
    morningBrief,
  };
}
