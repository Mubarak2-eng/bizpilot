import type { NextAuthConfig } from "next-auth";

export const authConfig: NextAuthConfig = {
  secret: process.env.AUTH_SECRET,
  trustHost: true,
  pages: {
    signIn: "/login",
  },
  session: {
    strategy: "jwt",
    maxAge: 30 * 24 * 60 * 60, // 30 days
  },
  callbacks: {
    authorized({ auth, request: { nextUrl } }) {
      const isLoggedIn = !!auth?.user;
      const isOnProtectedPage =
        nextUrl.pathname.startsWith("/dashboard") ||
        nextUrl.pathname.startsWith("/products") ||
        nextUrl.pathname.startsWith("/sales") ||
        nextUrl.pathname.startsWith("/customers") ||
        nextUrl.pathname.startsWith("/expenses") ||
        nextUrl.pathname.startsWith("/invoices") ||
        nextUrl.pathname.startsWith("/assistant") ||
        nextUrl.pathname.startsWith("/settings");
      const isOnAuthPage =
        nextUrl.pathname === "/login" || nextUrl.pathname === "/signup";

      if (isOnProtectedPage) {
        if (isLoggedIn) return true;
        return false; // Redirect unauthenticated users to /login
      } else if (isOnAuthPage && isLoggedIn) {
        return Response.redirect(new URL("/dashboard", nextUrl));
      }
      return true;
    },
    jwt({ token, user }) {
      if (user) {
        token.id = user.id;
        token.email = user.email;
        token.name = user.name;
        token.picture = user.image;
      }
      return token;
    },
    session({ session, token }) {
      if (session.user && token) {
        session.user.id = (token.id as string) || (token.sub as string);
        if (token.email) session.user.email = token.email as string;
        if (token.name) session.user.name = token.name as string;
      }
      return session;
    },
  },
  providers: [],
};
