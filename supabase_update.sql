-- Add columns to users table
ALTER TABLE users ADD COLUMN IF NOT EXISTS avatar_url TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS wallpaper TEXT;

-- Create the public bucket for avatars and wallpapers
INSERT INTO storage.buckets (id, name, public) 
VALUES ('user-assets', 'user-assets', true) 
ON CONFLICT (id) DO NOTHING;

-- RLS Policies for user-assets bucket
-- 1. Anyone can view public user-assets
CREATE POLICY "Public Asset Viewing" 
ON storage.objects FOR SELECT 
USING (bucket_id = 'user-assets');

-- 2. Authenticated users can upload to their own folder within user-assets (e.g., /user-assets/<user_id>/avatar.png)
CREATE POLICY "Users can upload own assets" 
ON storage.objects FOR INSERT 
TO authenticated 
WITH CHECK (
  bucket_id = 'user-assets' AND 
  (storage.foldername(name))[1] = auth.uid()::text
);

-- 3. Authenticated users can update their own assets
CREATE POLICY "Users can update own assets" 
ON storage.objects FOR UPDATE 
TO authenticated 
USING (
  bucket_id = 'user-assets' AND 
  (storage.foldername(name))[1] = auth.uid()::text
);

-- 4. Authenticated users can delete their own assets
CREATE POLICY "Users can delete own assets" 
ON storage.objects FOR DELETE 
TO authenticated 
USING (
  bucket_id = 'user-assets' AND 
  (storage.foldername(name))[1] = auth.uid()::text
);
