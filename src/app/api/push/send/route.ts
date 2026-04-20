import { NextRequest, NextResponse } from "next/server";
import webpush from "web-push";
import { createClient } from "@supabase/supabase-js";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const pub = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const priv = process.env.VAPID_PRIVATE_KEY;
  
  console.log("[push/send] Called. VAPID configured:", !!pub && !!priv);
  
  if (!pub || !priv) return NextResponse.json({ error: "VAPID not configured" }, { status: 500 });

  webpush.setVapidDetails("mailto:admin@pvt.app", pub, priv);

  const webhookSecret = req.headers.get("x-webhook-secret");
  console.log("[push/send] webhook secret match:", webhookSecret === process.env.WEBHOOK_SECRET);
  
  if (webhookSecret !== process.env.WEBHOOK_SECRET) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await req.json();
  const record = body.record;
  console.log("[push/send] record:", JSON.stringify({ receiver_id: record?.receiver_id, sender_id: record?.sender_id, type: record?.message_type }));

  if (!record?.receiver_id || !record?.sender_id) {
    return NextResponse.json({ ok: true, reason: "No receiver/sender" });
  }

  // Don't send notification to yourself
  if (record.receiver_id === record.sender_id) {
    return NextResponse.json({ ok: true, reason: "Same user" });
  }

  const supabaseAdmin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  const [{ data: sender }, { data: subs }] = await Promise.all([
    supabaseAdmin.from("users").select("username").eq("id", record.sender_id).single(),
    supabaseAdmin.from("push_subscriptions").select("subscription, endpoint").eq("user_id", record.receiver_id),
  ]);

  console.log("[push/send] sender:", sender?.username, "subscriptions found:", subs?.length ?? 0);

  if (!subs || subs.length === 0) {
    return NextResponse.json({ ok: true, reason: "No subscriptions found for receiver" });
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

  const results = await Promise.allSettled(
    subs.map((sub) =>
      webpush.sendNotification(sub.subscription, payload)
        .catch(async (err) => {
          console.error("[push/send] push failed for endpoint:", sub.endpoint?.slice(0, 40), "status:", err.statusCode);
          if (err.statusCode === 410 || err.statusCode === 404) {
            await supabaseAdmin.from("push_subscriptions").delete().eq("endpoint", sub.endpoint);
          }
          throw err;
        })
    )
  );

  const failedCount = results.filter(r => r.status === "rejected").length;
  console.log(`[push/send] Sent: ${results.length - failedCount} succeeded, ${failedCount} failed`);

  return NextResponse.json({ ok: true, sent: results.length, failed: failedCount });
}
