import type { NextAuthConfig } from "next-auth"

export const authConfig: NextAuthConfig = {
  providers: [],
  pages: {
    signIn: "/onboarding",
  },
  callbacks: {
    authorized({ auth, request: { nextUrl } }) {
      const isLoggedIn = !!auth?.user
      const isOnboarding = nextUrl.pathname.startsWith("/onboarding")
      if (isOnboarding) return true
      if (isLoggedIn) return true
      return false
    },
  },
}
