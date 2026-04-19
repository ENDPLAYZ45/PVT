import { type NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";

export async function proxy(request: NextRequest) {
  return await updateSession(request);
}

export const config = {
  matcher: [
    /*
     * Match all request paths except:
     * - _next/static, _next/image (Next.js internals)
     * - favicon.ico, icons/, manifest.json, sw.js (PWA assets — must be public)
     * - .well-known/ (Digital Asset Links for Play Store)
     * - offline (offline fallback page)
     * - Image files
     */
    "/((?!_next/static|_next/image|favicon.ico|icons/|manifest\\.json|sw\\.js|\\.well-known/|offline|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
