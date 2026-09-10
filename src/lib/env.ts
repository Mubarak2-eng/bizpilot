/**
 * Production Environment Configuration & Security Validator.
 * Validates that all required secrets, connection strings, and security keys
 * are properly configured and meet minimum strength criteria for live production deployment.
 */

export interface EnvValidationResult {
  isValid: boolean;
  isProduction: boolean;
  errors: string[];
  warnings: string[];
  configuredServices: {
    database: boolean;
    auth: boolean;
    email: boolean;
    cron: boolean;
    whatsapp: boolean;
    paystack: boolean;
    externalAi: boolean;
    metaOAuth?: boolean;
  };
}

export { validateMetaOAuthEnv } from "./whatsapp/meta-oauth";

export function validateProductionEnv(
  env: Record<string, string | undefined> = process.env
): EnvValidationResult {
  const isProduction = env.NODE_ENV === "production";
  const errors: string[] = [];
  const warnings: string[] = [];

  // 1. Database
  const hasDatabase = Boolean(env.DATABASE_URL && env.DATABASE_URL.trim() !== "");
  if (!hasDatabase) {
    errors.push("DATABASE_URL is required.");
  } else if (!env.DATABASE_URL!.startsWith("postgresql://") && !env.DATABASE_URL!.startsWith("postgres://")) {
    errors.push("DATABASE_URL must be a valid PostgreSQL connection string.");
  }

  // 2. Authentication
  const authSecret = env.AUTH_SECRET?.trim();
  const hasAuth = Boolean(authSecret);
  if (!hasAuth) {
    errors.push("AUTH_SECRET is required.");
  } else if (authSecret!.length < 32) {
    if (isProduction) {
      errors.push("AUTH_SECRET must be at least 32 characters in production.");
    } else {
      warnings.push("AUTH_SECRET is less than 32 characters.");
    }
  }

  // 3. Transactional Email (Resend)
  const resendApiKey = env.RESEND_API_KEY?.trim();
  const hasEmail = Boolean(resendApiKey);
  if (isProduction && !hasEmail) {
    errors.push("RESEND_API_KEY is required in production for transactional emails (campaigns, reminders).");
  } else if (!hasEmail) {
    warnings.push("RESEND_API_KEY is not configured (simulated mode in development).");
  }

  // 4. Background Scheduled Tasks (Cron)
  const cronSecret = env.CRON_SECRET?.trim();
  const hasCron = Boolean(cronSecret);
  if (isProduction && !hasCron) {
    errors.push("CRON_SECRET is required in production to secure /api/cron/morning-brief.");
  } else if (!hasCron) {
    warnings.push("CRON_SECRET is not configured.");
  }

  // 5. WhatsApp Business Cloud API
  const waAccessToken = env.WHATSAPP_ACCESS_TOKEN?.trim();
  const waPhoneNumberId = env.WHATSAPP_PHONE_NUMBER_ID?.trim();
  const waSecret = env.WHATSAPP_APP_SECRET?.trim();
  const waVerifyToken = env.WHATSAPP_VERIFY_TOKEN?.trim();
  const hasWhatsApp = Boolean(waAccessToken && waPhoneNumberId && waSecret && waVerifyToken);

  if (isProduction) {
    if (!waAccessToken) {
      errors.push("WHATSAPP_ACCESS_TOKEN is required in production for outbound WhatsApp messaging.");
    }
    if (!waPhoneNumberId) {
      errors.push("WHATSAPP_PHONE_NUMBER_ID is required in production for outbound WhatsApp messaging.");
    }
    if (!waSecret) {
      errors.push("WHATSAPP_APP_SECRET is required in production for WhatsApp webhook signature verification.");
    }
    if (!waVerifyToken) {
      errors.push("WHATSAPP_VERIFY_TOKEN is required in production for WhatsApp webhook challenge verification.");
    }
  } else {
    if (!waAccessToken) warnings.push("WHATSAPP_ACCESS_TOKEN is not configured (simulated outbound messaging in development).");
    if (!waPhoneNumberId) warnings.push("WHATSAPP_PHONE_NUMBER_ID is not configured (simulated outbound messaging in development).");
    if (!waSecret) warnings.push("WHATSAPP_APP_SECRET is not configured for WhatsApp webhook signature verification.");
    if (!waVerifyToken) warnings.push("WHATSAPP_VERIFY_TOKEN is not configured for WhatsApp webhook challenge verification.");
  }

  // 6. Paystack Payments
  const paystackSecret = env.PAYSTACK_SECRET_KEY?.trim();
  const hasPaystack = Boolean(paystackSecret);
  if (isProduction && !hasPaystack) {
    warnings.push("PAYSTACK_SECRET_KEY is not configured for live billing.");
  }

  // 7. External AI LLM (Optional)
  const openaiKey = env.OPENAI_API_KEY?.trim();
  const hasExternalAi = Boolean(openaiKey);

  // 8. Meta WhatsApp Embedded Signup OAuth
  const metaAppId = env.META_APP_ID?.trim() || env.NEXT_PUBLIC_META_APP_ID?.trim();
  const metaAppSecret = env.META_APP_SECRET?.trim() || env.WHATSAPP_APP_SECRET?.trim();
  const hasMetaOAuth = Boolean(metaAppId && metaAppSecret);

  return {
    isValid: errors.length === 0,
    isProduction,
    errors,
    warnings,
    configuredServices: {
      database: hasDatabase,
      auth: hasAuth,
      email: hasEmail,
      cron: hasCron,
      whatsapp: hasWhatsApp,
      paystack: hasPaystack,
      externalAi: hasExternalAi,
      metaOAuth: hasMetaOAuth,
    },
  };
}
