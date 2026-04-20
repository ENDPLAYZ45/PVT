import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

export const dynamic = "force-dynamic";

// DELETE /api/messages/[id] — soft-delete a message
export async function DELETE(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  const cookieStore = await cookies();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll: () => cookieStore.getAll(), setAll: () => {} } }
  );

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { error } = await supabase
    .from("messages")
    .update({ is_deleted: true, ciphertext: "__DELETED__", sender_ciphertext: "__DELETED__" })
    .eq("id", params.id)
    .eq("sender_id", user.id); // only own messages

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}

// PATCH /api/messages/[id] — edit a message (re-encrypt)
export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const cookieStore = await cookies();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll: () => cookieStore.getAll(), setAll: () => {} } }
  );

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { ciphertext, sender_ciphertext } = await req.json();
  if (!ciphertext || !sender_ciphertext) {
    return NextResponse.json({ error: "Missing ciphertext" }, { status: 400 });
  }

  const { error } = await supabase
    .from("messages")
    .update({ ciphertext, sender_ciphertext, edited_at: new Date().toISOString() })
    .eq("id", params.id)
    .eq("sender_id", user.id); // only own messages

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
