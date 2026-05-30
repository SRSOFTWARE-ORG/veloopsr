DO $$
DECLARE
  founder_id uuid;
BEGIN
  SELECT id INTO founder_id
  FROM auth.users
  WHERE lower(email) = 'srcj9975@gmail.com'
  LIMIT 1;

  IF founder_id IS NOT NULL THEN
    UPDATE public.profiles
    SET is_ceo = true,
        updated_at = now()
    WHERE id = founder_id;

    INSERT INTO public.user_roles (user_id, role)
    VALUES (founder_id, 'admin'::public.app_role)
    ON CONFLICT DO NOTHING;
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role app_role)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT
    EXISTS (
      SELECT 1
      FROM public.user_roles
      WHERE user_id = _user_id
        AND role = _role
    )
    OR (
      _role = 'admin'::public.app_role
      AND EXISTS (
        SELECT 1
        FROM public.profiles p
        WHERE p.id = _user_id
          AND p.is_ceo = true
      )
    )
$$;

DROP POLICY IF EXISTS "Authenticated can update documentos" ON public.documentos;
CREATE POLICY "Owners or admins can update documentos"
ON public.documentos
FOR UPDATE
TO authenticated
USING (
  public.has_role(auth.uid(), 'admin'::public.app_role)
  OR uploaded_by = auth.uid()
  OR EXISTS (
    SELECT 1
    FROM public.vendas v
    WHERE v.id = documentos.venda_id
      AND v.vendedor_id = auth.uid()
  )
)
WITH CHECK (
  public.has_role(auth.uid(), 'admin'::public.app_role)
  OR uploaded_by = auth.uid()
  OR EXISTS (
    SELECT 1
    FROM public.vendas v
    WHERE v.id = documentos.venda_id
      AND v.vendedor_id = auth.uid()
  )
);

DROP POLICY IF EXISTS "Authenticated can insert produtos" ON public.produtos;
DROP POLICY IF EXISTS "Authenticated can update produtos" ON public.produtos;
CREATE POLICY "Only admins can insert produtos"
ON public.produtos
FOR INSERT
TO authenticated
WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));
CREATE POLICY "Only admins can update produtos"
ON public.produtos
FOR UPDATE
TO authenticated
USING (public.has_role(auth.uid(), 'admin'::public.app_role))
WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));

DROP POLICY IF EXISTS "Can update venda_itens" ON public.venda_itens;
CREATE POLICY "Owners or admins can update venda_itens"
ON public.venda_itens
FOR UPDATE
TO authenticated
USING (
  public.has_role(auth.uid(), 'admin'::public.app_role)
  OR EXISTS (
    SELECT 1
    FROM public.vendas v
    WHERE v.id = venda_itens.venda_id
      AND v.vendedor_id = auth.uid()
  )
)
WITH CHECK (
  public.has_role(auth.uid(), 'admin'::public.app_role)
  OR EXISTS (
    SELECT 1
    FROM public.vendas v
    WHERE v.id = venda_itens.venda_id
      AND v.vendedor_id = auth.uid()
  )
);

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'clientes') THEN
    ALTER PUBLICATION supabase_realtime DROP TABLE public.clientes;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'cobrancas') THEN
    ALTER PUBLICATION supabase_realtime DROP TABLE public.cobrancas;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'assistencias') THEN
    ALTER PUBLICATION supabase_realtime DROP TABLE public.assistencias;
  END IF;
END $$;