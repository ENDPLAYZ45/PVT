import { NextRequest, NextResponse } from "next/server";
import webpush from "web-push";
import { createClient } from "@supabase/supabase-js";

// This route is called by Supabase Webhook when a new message is inserted

// Use service role key to bypass RLS when reading subscriptions
const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function POST(req: NextRequest) {
  // Set VAPID details inside handler (not module level) to avoid build-time errors
  webpush.setVapidDetails(
    "mailto:admin@pvt.app",
    process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY!,
    process.env.VAPID_PRIVATE_KEY!
  );
  // Verify this is from Supabase (basic security)
  const webhookSecret = req.headers.get("x-webhook-secret");
  if (webhookSecret !== process.env.WEBHOOK_SECRET) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await req.json();
  const record = body.record; // The new message row from Supabase

  if (!record?.receiver_id || !record?.sender_id) {
    return NextResponse.json({ ok: true }); // Not a message insert, skip
  }

  const receiverId = record.receiver_id;

  // Get sender's username
  const { data: sender } = await supabaseAdmin
    .from("users")
    .select("username")
    .eq("id", record.sender_id)
    .single();

  // Get the receiver's push subscription
  const { data: sub } = await supabaseAdmin
    .from("push_subscriptions")
    .select("subscription")
    .eq("user_id", receiverId)
    .single();

  if (!sub?.subscription) {
    return NextResponse.json({ ok: true, reason: "No subscription found" });
  }

  const senderName = sender?.username ?? "Someone";
  // Content is end-to-end encrypted — show generic notification
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
    console.error("Push send error:", err);
    // Remove expired subscription
    await supabaseAdmin.from("push_subscriptions").delete().eq("user_id", receiverId);
    return NextResponse.json({ ok: true, reason: "Subscription expired, removed" });
  }
}
