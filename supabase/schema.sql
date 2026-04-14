-- ============================================
-- PVT — E2E Encrypted Messaging Platform
-- Database Schema & RLS Policies
-- Run this in your Supabase SQL Editor
-- ============================================

-- ============================================
-- 1. USERS TABLE
-- ============================================
CREATE TABLE public.users (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  username TEXT UNIQUE NOT NULL,
  email TEXT,
  phone TEXT,
  public_key TEXT NOT NULL,           -- JWK-serialised RSA-OAEP public key
  discoverable BOOLEAN DEFAULT false, -- opt-in to searchability
  created_at TIMESTAMPTZ DEFAULT now(),
  CONSTRAINT email_or_phone CHECK (email IS NOT NULL OR phone IS NOT NULL)
);

-- Enable RLS
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;

-- Users can read their own full row
CREATE POLICY "Users can read own row"
  ON public.users FOR SELECT
  USING (auth.uid() = id);

-- Users can read id, username of discoverable users (for search)
CREATE POLICY "Anyone can search discoverable users"
  ON public.users FOR SELECT
  USING (discoverable = true);

-- Users can insert their own row (signup)
CREATE POLICY "Users can insert own row"
  ON public.users FOR INSERT
  WITH CHECK (auth.uid() = id);

-- Users can update their own row
CREATE POLICY "Users can update own row"
  ON public.users FOR UPDATE
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

-- ============================================
-- 2. MESSAGES TABLE
-- ============================================
CREATE TABLE public.messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sender_id UUID NOT NULL REFERENCES public.users(id),
  receiver_id UUID NOT NULL REFERENCES public.users(id),
  ciphertext TEXT NOT NULL,            -- base64 encrypted payload, never plaintext
  delivered_at TIMESTAMPTZ,            -- set when receiver reads the message
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;

-- Only sender or receiver can read their messages
CREATE POLICY "Users can read own messages"
  ON public.messages FOR SELECT
  USING (auth.uid() = sender_id OR auth.uid() = receiver_id);

-- Only authenticated users can insert (as sender)
CREATE POLICY "Users can send messages"
  ON public.messages FOR INSERT
  WITH CHECK (auth.uid() = sender_id);

-- Only receiver can update delivered_at
CREATE POLICY "Receiver can mark delivered"
  ON public.messages FOR UPDATE
  USING (auth.uid() = receiver_id)
  WITH CHECK (auth.uid() = receiver_id);

-- Index for fast conversation lookups
CREATE INDEX idx_messages_sender ON public.messages(sender_id, created_at DESC);
CREATE INDEX idx_messages_receiver ON public.messages(receiver_id, created_at DESC);

-- ============================================
-- 3. BLOCKED USERS TABLE
-- ============================================
CREATE TABLE public.blocked_users (
  blocker_id UUID NOT NULL REFERENCES public.users(id),
  blocked_id UUID NOT NULL REFERENCES public.users(id),
  created_at TIMESTAMPTZ DEFAULT now(),
  PRIMARY KEY (blocker_id, blocked_id)
);

-- Enable RLS
ALTER TABLE public.blocked_users ENABLE ROW LEVEL SECURITY;

-- Users can read their own blocks
CREATE POLICY "Users can read own blocks"
  ON public.blocked_users FOR SELECT
  USING (auth.uid() = blocker_id);

-- Users can insert their own blocks
CREATE POLICY "Users can block others"
  ON public.blocked_users FOR INSERT
  WITH CHECK (auth.uid() = blocker_id);

-- Users can remove their own blocks
CREATE POLICY "Users can unblock"
  ON public.blocked_users FOR DELETE
  USING (auth.uid() = blocker_id);

-- ============================================
-- 4. ENABLE REALTIME for messages
-- ============================================
-- Run this in the Supabase dashboard:
-- Go to Database > Replication > Publication
-- Enable INSERT on public.messages

ALTER PUBLICATION supabase_realtime ADD TABLE public.messages;

-- ============================================
-- 5. AUTO-DELETE CRON (messages older than 24h)
-- ============================================
-- Enable pg_cron extension (must be done from Supabase dashboard)
-- Then run:

-- CREATE EXTENSION IF NOT EXISTS pg_cron;
-- SELECT cron.schedule(
--   'delete-old-messages',
--   '0 * * * *',  -- every hour
--   $$DELETE FROM public.messages WHERE created_at < now() - interval '24 hours'$$
-- );
