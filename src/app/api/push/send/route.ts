import { NextRequest, NextResponse } from "next/server";
import webpush from "web-push";
import { createClient } from "@supabase/supabase-js";

// Force dynamic rendering — prevent build-time evaluation
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const pub = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const priv = process.env.VAPID_PRIVATE_KEY;
  if (!pub || !priv) return NextResponse.json({ error: "VAPID not configured" }, { status: 500 });

  webpush.setVapidDetails("mailto:admin@pvt.app", pub, priv);

  // Verify this is from Supabase
  const webhookSecret = req.headers.get("x-webhook-secret");
  if (webhookSecret !== process.env.WEBHOOK_SECRET) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await req.json();
  const record = body.record;
  if (!record?.receiver_id || !record?.sender_id) {
    return NextResponse.json({ ok: true });
  }

  const supabaseAdmin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  const [{ data: sender }, { data: sub }] = await Promise.all([
    supabaseAdmin.from("users").select("username").eq("id", record.sender_id).single(),
    supabaseAdmin.from("push_subscriptions").select("subscription").eq("user_id", record.receiver_id).single(),
  ]);

  if (!sub?.subscription) return NextResponse.json({ ok: true, reason: "No subscription" });

  const senderName = sender?.username ?? "Someone";
  const isImage = record.message_type === "image";
  const messagePreview = isImage ? "📎 Sent an image" : "🔒 New encrypted message";

  try {
    await webpush.sendNotification(
      sub.subscription,
      JSON.stringify({
        title: `PVT — ${senderName}`,
        body: messagePreview,
        url: `/chat/${record.sender_id}`,
        tag: `msg-${record.sender_id}`,
      })
    );
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("Push error:", err);
    await supabaseAdmin.from("push_subscriptions").delete().eq("user_id", record.receiver_id);
    return NextResponse.json({ ok: true, reason: "Subscription expired" });
  }
}
