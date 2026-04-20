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

  // Fetch sender info and ALL subscriptions for the receiver
  const [{ data: sender }, { data: subs }] = await Promise.all([
    supabaseAdmin.from("users").select("username").eq("id", record.sender_id).single(),
    supabaseAdmin.from("push_subscriptions").select("subscription, endpoint").eq("user_id", record.receiver_id),
  ]);

  if (!subs || subs.length === 0) {
    return NextResponse.json({ ok: true, reason: "No subscriptions" });
  }

  const senderName = sender?.username ?? "Someone";
  const isImage = record.message_type === "image";
  const messagePreview = isImage ? "📎 Sent an image" : "🔒 New encrypted message";

  const payload = JSON.stringify({
    title: `PVT — ${senderName}`,
    body: messagePreview,
    url: `/chat/${record.sender_id}`,
    tag: `msg-${record.sender_id}`,
  });

  // Send to all devices
  const results = await Promise.allSettled(
    subs.map((sub) => 
      webpush.sendNotification(sub.subscription, payload)
        .catch(async (err) => {
          // If status is 410 (Gone) or 404 (Not Found), the subscription is expired
          if (err.statusCode === 410 || err.statusCode === 404) {
            await supabaseAdmin.from("push_subscriptions").delete().eq("endpoint", sub.endpoint);
          }
          throw err;
        })
    )
  );

  const failedCount = results.filter(r => r.status === "rejected").length;
  console.log(`Push sent: ${results.length - failedCount} succeeded, ${failedCount} failed.`);

  return NextResponse.json({ ok: true, sent: results.length, failed: failedCount });
}
