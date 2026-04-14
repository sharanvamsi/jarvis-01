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
      const isWelcome = nextUrl.pathname.startsWith("/welcome")
      const isPrivacy = nextUrl.pathname.startsWith("/privacy")
      const isTerms = nextUrl.pathname.startsWith("/terms")
      if (isOnboarding || isWelcome || isPrivacy || isTerms) return true
      if (isLoggedIn) return true
      return false
    },
  },
}
