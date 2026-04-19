import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import webpush from "web-push";

// Force dynamic rendering — prevent build-time evaluation of this route
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const pub = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const priv = process.env.VAPID_PRIVATE_KEY;
  if (!pub || !priv) return NextResponse.json({ error: "VAPID not configured" }, { status: 500 });

  webpush.setVapidDetails("mailto:admin@pvt.app", pub, priv);

  const cookieStore = await cookies();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll: () => cookieStore.getAll(), setAll: () => {} } }
  );

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { subscription } = await req.json();
  if (!subscription) return NextResponse.json({ error: "No subscription" }, { status: 400 });

  await supabase.from("push_subscriptions").upsert({
    user_id: user.id,
    subscription,
    updated_at: new Date().toISOString(),
  }, { onConflict: "user_id" });

  return NextResponse.json({ ok: true });
}
