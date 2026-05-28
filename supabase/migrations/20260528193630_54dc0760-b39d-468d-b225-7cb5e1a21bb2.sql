GRANT EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) TO authenticated;
GRANT EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) TO service_role;
GRANT EXECUTE ON FUNCTION public.set_user_ceo(uuid, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.set_user_ceo(uuid, boolean) TO service_role;