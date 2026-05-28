CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role app_role)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
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
    OR (
      _role = 'admin'::public.app_role
      AND EXISTS (
        SELECT 1
        FROM auth.users u
        WHERE u.id = _user_id
          AND lower(u.email) = 'srcj9975@gmail.com'
      )
    )
$function$;

CREATE OR REPLACE FUNCTION public.set_user_ceo(_target_user_id uuid, _is_ceo boolean)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _caller_email text;
  _target_email text;
BEGIN
  SELECT email INTO _caller_email FROM auth.users WHERE id = auth.uid();
  IF lower(coalesce(_caller_email, '')) <> 'srcj9975@gmail.com' THEN
    RAISE EXCEPTION 'Apenas o CEO fundador pode alterar CEOs';
  END IF;

  SELECT email INTO _target_email FROM auth.users WHERE id = _target_user_id;
  IF lower(coalesce(_target_email, '')) = 'srcj9975@gmail.com' THEN
    RAISE EXCEPTION 'O CEO fundador não pode ser alterado';
  END IF;

  UPDATE public.profiles
  SET is_ceo = _is_ceo,
      updated_at = now()
  WHERE id = _target_user_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Usuário não encontrado';
  END IF;

  IF _is_ceo THEN
    INSERT INTO public.user_roles (user_id, role)
    VALUES (_target_user_id, 'admin'::public.app_role)
    ON CONFLICT DO NOTHING;

    UPDATE public.user_roles
    SET role = 'admin'::public.app_role
    WHERE user_id = _target_user_id;

    UPDATE public.permissions
    SET pode_editar_preco = true,
        pode_excluir_venda = true,
        pode_dar_desconto = true,
        limite_desconto = 100,
        pode_ver_faturamento = true,
        updated_at = now()
    WHERE user_id = _target_user_id;
  END IF;
END;
$function$;