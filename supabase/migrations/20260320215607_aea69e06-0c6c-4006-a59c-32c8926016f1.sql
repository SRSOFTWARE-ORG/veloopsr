-- Add image column to produtos
ALTER TABLE public.produtos ADD COLUMN IF NOT EXISTS imagem_url text;

-- Create storage bucket for product images
INSERT INTO storage.buckets (id, name, public)
VALUES ('produto_imagens', 'produto_imagens', true)
ON CONFLICT (id) DO NOTHING;

-- Allow authenticated users to upload
CREATE POLICY "Authenticated can upload product images"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'produto_imagens');

-- Allow public read
CREATE POLICY "Public can view product images"
ON storage.objects FOR SELECT TO public
USING (bucket_id = 'produto_imagens');

-- Allow authenticated to update
CREATE POLICY "Authenticated can update product images"
ON storage.objects FOR UPDATE TO authenticated
USING (bucket_id = 'produto_imagens');

-- Allow admins to delete
CREATE POLICY "Admins can delete product images"
ON storage.objects FOR DELETE TO authenticated
USING (bucket_id = 'produto_imagens' AND public.has_role(auth.uid(), 'admin'));