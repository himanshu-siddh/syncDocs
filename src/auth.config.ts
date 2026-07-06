import type { NextAuthConfig } from "next-auth";

// Keep proxy-safe Auth.js configuration separate from the Node/server auth
// implementation. The proxy runtime must not import Prisma, bcrypt, or other
// server-only modules while Next analyzes the App Router graph.
export const authConfig = {
  pages: {
    signIn: "/login",
  },
  providers: [],
  callbacks: {
    authorized({ auth: session, request }) {
      const { pathname } = request.nextUrl;
      const isAuthRoute = pathname.startsWith("/login") || pathname.startsWith("/register");
      const isPublicApi = pathname.startsWith("/api/auth");

      if (isPublicApi || isAuthRoute) {
        return true;
      }

      return Boolean(session?.user);
    },
  },
} satisfies NextAuthConfig;
