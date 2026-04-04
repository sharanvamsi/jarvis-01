import { NextResponse } from "next/server"
import type { NextRequest } from "next/server"

export function middleware(request: NextRequest) {
  const sessionCookie =
    request.cookies.get("authjs.session-token") ||
    request.cookies.get("__Secure-authjs.session-token")

  const isOnboarding = request.nextUrl.pathname.startsWith("/onboarding")

  if (isOnboarding) return NextResponse.next()
  if (sessionCookie) return NextResponse.next()

  return NextResponse.redirect(new URL("/onboarding", request.url))
}

export const config = {
  matcher: [
    "/((?!api|_next/static|_next/image|favicon.ico).*)",
  ],
}
