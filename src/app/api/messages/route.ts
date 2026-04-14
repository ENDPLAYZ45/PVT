import { createClient } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();

    // Verify authenticated user
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const { receiver_id, ciphertext } = body;

    if (!receiver_id || !ciphertext) {
      return NextResponse.json(
        { error: "receiver_id and ciphertext are required" },
        { status: 400 }
      );
    }

    // Check if user is blocked
    const { data: blocked } = await supabase
      .from("blocked_users")
      .select("blocker_id")
      .eq("blocker_id", receiver_id)
      .eq("blocked_id", user.id)
      .single();

    if (blocked) {
      return NextResponse.json(
        { error: "You cannot message this user" },
        { status: 403 }
      );
    }

    // Insert the encrypted message
    const { data, error } = await supabase
      .from("messages")
      .insert({
        sender_id: user.id,
        receiver_id,
        ciphertext,
      })
      .select()
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json(data, { status: 201 });
  } catch {
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
