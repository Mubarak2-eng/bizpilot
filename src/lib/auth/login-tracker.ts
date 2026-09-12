import crypto from "crypto";
import { prisma } from "@/lib/prisma";

/**
 * Creates a privacy-preserving one-way hash of an IP address.
 * Never stores or exposes raw IP addresses in plain text.
 */
export function anonymizeIp(ip?: string | null): string | null {
  if (!ip || typeof ip !== "string") return null;
  const cleanIp = ip.trim();
  if (!cleanIp || cleanIp === "unknown") return null;

  // Salt with internal secret to prevent rainbow table attacks
  const salt = process.env.AUTH_SECRET || "bizpilot_ip_salt_2026";
  const hash = crypto.createHmac("sha256", salt).update(cleanIp).digest("hex");
  
  // Return short deterministic hash prefix (e.g., hash:a8f23b7c91e4)
  return `hash:${hash.slice(0, 12)}`;
}

/**
 * Extracts a simplified, human-readable browser & OS label from User-Agent string.
 */
export function parseUserAgent(ua?: string | null): string {
  if (!ua || typeof ua !== "string") return "Unknown Browser";

  const clean = ua.toLowerCase();

  // Determine OS (mobile first, then desktop)
  let os = "Other OS";
  if (clean.includes("iphone") || clean.includes("ipad") || clean.includes("ios")) os = "iOS";
  else if (clean.includes("android")) os = "Android";
  else if (clean.includes("windows")) os = "Windows";
  else if (clean.includes("macintosh") || clean.includes("mac os") || clean.includes("macos")) os = "macOS";
  else if (clean.includes("linux")) os = "Linux";

  // Determine Browser
  let browser = "Browser";
  if (clean.includes("edg/") || clean.includes("edge")) browser = "Edge";
  else if (clean.includes("chrome") && !clean.includes("edg")) browser = "Chrome";
  else if (clean.includes("safari") && !clean.includes("chrome")) browser = "Safari";
  else if (clean.includes("firefox")) browser = "Firefox";
  else if (clean.includes("opera") || clean.includes("opr/")) browser = "Opera";

  return `${browser} on ${os}`;
}

export interface RecordLoginEventParams {
  userId: string;
  status?: "SUCCESS" | "FAILED";
  ip?: string | null;
  userAgent?: string | null;
}

/**
 * Securely records a login event and updates lastLoginAt only on successful verification.
 * Fails safely without throwing unhandled exceptions into the login pipeline.
 */
export async function recordLoginEvent(params: RecordLoginEventParams): Promise<void> {
  const { userId, status = "SUCCESS", ip, userAgent } = params;

  if (!userId) return;

  try {
    const ipHash = anonymizeIp(ip);
    const userAgentLabel = parseUserAgent(userAgent);

    // 1. Create audit login event record
    await prisma.loginEvent.create({
      data: {
        userId,
        status,
        ipHash,
        userAgentLabel,
      },
    });

    // 2. Advance lastLoginAt ONLY on verified successful logins
    if (status === "SUCCESS") {
      await prisma.user.update({
        where: { id: userId },
        data: {
          lastLoginAt: new Date(),
        },
      });
    }
  } catch (error) {
    // Audit logging failure should not break user authentication
    console.error("[Login Tracker] Failed to log login event:", error);
  }
}
