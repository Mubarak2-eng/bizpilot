import { prisma } from "../prisma";
import { PlanCode } from "@prisma/client";

export interface PlanDefinition {
  code: PlanCode;
  name: string;
  description: string;
  monthlyPrice: number;
  currency: string;
  aiMonthlyLimit: number;
  maxStaff: number;
  highlighted?: boolean;
  features: string[];
}

export const PLAN_DEFINITIONS: Record<PlanCode, PlanDefinition> = {
  FREE: {
    code: "FREE",
    name: "BizPilot Free",
    description: "For trying BizPilot and exploring core business operations.",
    monthlyPrice: 0,
    currency: "NGN",
    aiMonthlyLimit: 25,
    maxStaff: 2,
    features: [
      "Core sales, expenses & invoicing",
      "Basic business dashboard",
      "25 AI Assistant queries / month",
      "Essential inventory management",
    ],
  },
  STARTER: {
    code: "STARTER",
    name: "BizPilot Starter",
    description: "For small businesses looking to streamline everyday sales and reporting.",
    monthlyPrice: 5000,
    currency: "NGN",
    aiMonthlyLimit: 150,
    maxStaff: 5,
    features: [
      "Everything in Free",
      "Full Business Brain Health Metrics",
      "Industry Intelligence (8 business domains)",
      "WhatsApp AI Bot Integration",
      "150 AI Assistant queries / month",
    ],
  },
  PRO: {
    code: "PRO",
    name: "BizPilot Pro",
    description: "For growing SMEs needing proactive AI business management and actions.",
    monthlyPrice: 12000,
    currency: "NGN",
    aiMonthlyLimit: 500,
    maxStaff: 10,
    highlighted: true,
    features: [
      "Everything in Starter",
      "Advanced Business Brain Executive Briefs",
      "AI 2-Turn Write Actions (POS, Invoices, Expenses)",
      "500 AI Assistant queries / month",
      "Multi-user role permissions (Up to 10 staff)",
    ],
  },
  BUSINESS: {
    code: "BUSINESS",
    name: "BizPilot Business",
    description: "For established businesses with high transaction volume and multiple staff.",
    monthlyPrice: 25000,
    currency: "NGN",
    aiMonthlyLimit: 1500,
    maxStaff: 25,
    features: [
      "Everything in Pro",
      "1,500 AI Assistant queries / month",
      "Up to 25 staff members",
      "Priority AI execution throughput",
      "Dedicated account manager support",
    ],
  },
};

export type FeatureKey =
  | "core_operations"
  | "basic_dashboard"
  | "business_brain_basic"
  | "business_brain_advanced"
  | "industry_intelligence"
  | "whatsapp_ai"
  | "ai_write_actions"
  | "priority_support";

export const FEATURE_PLAN_MAP: Record<FeatureKey, PlanCode[]> = {
  core_operations: ["FREE", "STARTER", "PRO", "BUSINESS"],
  basic_dashboard: ["FREE", "STARTER", "PRO", "BUSINESS"],
  business_brain_basic: ["FREE", "STARTER", "PRO", "BUSINESS"],
  business_brain_advanced: ["STARTER", "PRO", "BUSINESS"],
  industry_intelligence: ["STARTER", "PRO", "BUSINESS"],
  whatsapp_ai: ["STARTER", "PRO", "BUSINESS"],
  ai_write_actions: ["PRO", "BUSINESS"],
  priority_support: ["BUSINESS"],
};

/**
 * Idempotently ensures all 4 commercial plans exist in the database with current definitions.
 */
export async function ensureDefaultPlans() {
  for (const planDef of Object.values(PLAN_DEFINITIONS)) {
    await prisma.plan.upsert({
      where: { code: planDef.code },
      create: {
        code: planDef.code,
        name: planDef.name,
        description: planDef.description,
        monthlyPrice: planDef.monthlyPrice,
        currency: planDef.currency,
        aiMonthlyLimit: planDef.aiMonthlyLimit,
        maxStaff: planDef.maxStaff,
        isActive: true,
      },
      update: {
        name: planDef.name,
        description: planDef.description,
        monthlyPrice: planDef.monthlyPrice,
        currency: planDef.currency,
        aiMonthlyLimit: planDef.aiMonthlyLimit,
        maxStaff: planDef.maxStaff,
        isActive: true,
      },
    });
  }
}
