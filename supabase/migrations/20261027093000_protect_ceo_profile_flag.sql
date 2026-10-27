-- Prevent users from granting themselves CEO-only UI privileges by editing their own profile.
-- Authorization for protected operations must still be enforced by user_roles and server-side checks.
CREATE OR REPLACE FUNCTION public.prevent_self_ceo_escalation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.is_ceo IS DISTINCT FROM OLD.is_ceo
     AND auth.uid() IS NOT NULL
     AND NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Only an administrator can change the CEO profile flag'
      USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS protect_profiles_ceo_flag ON public.profiles;
CREATE TRIGGER protect_profiles_ceo_flag
BEFORE UPDATE OF is_ceo ON public.profiles
FOR EACH ROW
EXECUTE FUNCTION public.prevent_self_ceo_escalation();
