
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS is_ceo boolean NOT NULL DEFAULT false;

-- Garante que o fundador está marcado como CEO
UPDATE public.profiles p
SET is_ceo = true
WHERE p.id IN (
  SELECT id FROM auth.users WHERE email = 'srcj9975@gmail.com'
);

-- Função segura: apenas o fundador pode alterar a flag CEO de outro usuário
CREATE OR REPLACE FUNCTION public.set_user_ceo(_target_user_id uuid, _is_ceo boolean)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _caller_email text;
  _target_email text;
BEGIN
  SELECT email INTO _caller_email FROM auth.users WHERE id = auth.uid();
  IF _caller_email IS DISTINCT FROM 'srcj9975@gmail.com' THEN
    RAISE EXCEPTION 'Apenas o CEO fundador pode transferir o cargo de CEO';
  END IF;

  SELECT email INTO _target_email FROM auth.users WHERE id = _target_user_id;
  IF _target_email = 'srcj9975@gmail.com' THEN
    RAISE EXCEPTION 'O CEO fundador não pode ser alterado';
  END IF;

  UPDATE public.profiles SET is_ceo = _is_ceo WHERE id = _target_user_id;

  -- Garante que um CEO promovido também tenha papel admin
  IF _is_ceo THEN
    INSERT INTO public.user_roles (user_id, role)
    VALUES (_target_user_id, 'admin')
    ON CONFLICT (user_id, role) DO NOTHING;
    UPDATE public.user_roles SET role = 'admin' WHERE user_id = _target_user_id;
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public.set_user_ceo(uuid, boolean) TO authenticated;
