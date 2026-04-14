// Supabase Edge Function: cleanup-messages
// Deletes all messages older than 24 hours
// Deploy with: supabase functions deploy cleanup-messages
// Schedule with: cron trigger every hour

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

Deno.serve(async () => {
  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

  const { error, count } = await supabase
    .from("messages")
    .delete()
    .lt("created_at", cutoff);

  if (error) {
    console.error("Cleanup error:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
    });
  }

  console.log(`Deleted ${count} messages older than 24h`);
  return new Response(
    JSON.stringify({ success: true, deleted: count }),
    { status: 200 }
  );
});
