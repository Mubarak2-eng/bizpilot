import { NextResponse } from "next/server";

/**
 * GET /api/health
 * Lightweight liveness health check endpoint.
 * Returns minimal status without exposing sensitive infrastructure or database details.
 */
export async function GET() {
  return NextResponse.json(
    {
      status: "ok",
      timestamp: new Date().toISOString(),
    },
    {
      status: 200,
      headers: {
        "Cache-Control": "no-store, no-cache, must-revalidate",
      },
    }
  );
}
