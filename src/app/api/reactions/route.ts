import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

export const dynamic = "force-dynamic";

// POST /api/reactions — toggle a reaction on a message
export async function POST(req: NextRequest) {
  const cookieStore = await cookies();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll: () => cookieStore.getAll(), setAll: () => {} } }
  );

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { message_id, emoji } = await req.json();
  if (!message_id || !emoji) {
    return NextResponse.json({ error: "Missing fields" }, { status: 400 });
  }

  // Check if reaction already exists
  const { data: existing } = await supabase
    .from("message_reactions")
    .select("id")
    .eq("message_id", message_id)
    .eq("user_id", user.id)
    .eq("emoji", emoji)
    .single();

  if (existing) {
    // Toggle off — remove reaction
    await supabase.from("message_reactions").delete().eq("id", existing.id);
    return NextResponse.json({ action: "removed" });
  } else {
    // Toggle on — add reaction
    await supabase.from("message_reactions").insert({
      message_id,
      user_id: user.id,
      emoji,
    });
    return NextResponse.json({ action: "added" });
  }
}
