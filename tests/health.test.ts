import { describe, it, expect } from "vitest";
import { GET } from "../src/app/api/health/route";

describe("Health Check API (GET /api/health)", () => {
  it("should return HTTP 200 with status ok and zero leaked infrastructure details", async () => {
    const res = await GET();
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.status).toBe("ok");
    expect(body.timestamp).toBeDefined();

    // Verify zero leaked sensitive keys
    expect(body.DATABASE_URL).toBeUndefined();
    expect(body.AUTH_SECRET).toBeUndefined();
    expect(body.PAYSTACK_SECRET_KEY).toBeUndefined();
    expect(body.WHATSAPP_ACCESS_TOKEN).toBeUndefined();
    expect(body.env).toBeUndefined();
    expect(body.database).toBeUndefined();
  });
});
