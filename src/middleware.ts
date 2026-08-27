import NextAuth from "next-auth";
import { authConfig } from "@/auth.config";

export default NextAuth(authConfig).auth;

export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - api/auth (NextAuth API routes)
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * - public files (*.svg, *.png, etc.)
     */
    "/((?!api/auth|_next/static|_next/image|.*\\.svg|.*\\.png|favicon\\.ico).*)",
  ],
};
