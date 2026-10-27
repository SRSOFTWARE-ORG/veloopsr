-- Limit account/profile metadata to the account owner and trusted admins.
-- Existing broad "viewable by authenticated" policies exposed every profile, role and permission row.
DROP POLICY IF EXISTS "Profiles viewable by authenticated" ON public.profiles;
CREATE POLICY "Users view own profile and admins view all"
ON public.profiles
FOR SELECT
TO authenticated
USING (
  id = auth.uid()
  OR public.has_role(auth.uid(), 'admin'::public.app_role)
);

DROP POLICY IF EXISTS "Roles viewable by authenticated" ON public.user_roles;
CREATE POLICY "Users view own role and admins view all"
ON public.user_roles
FOR SELECT
TO authenticated
USING (
  user_id = auth.uid()
  OR public.has_role(auth.uid(), 'admin'::public.app_role)
);

DROP POLICY IF EXISTS "Permissions viewable by authenticated" ON public.permissions;
CREATE POLICY "Users view own permissions and admins view all"
ON public.permissions
FOR SELECT
TO authenticated
USING (
  user_id = auth.uid()
  OR public.has_role(auth.uid(), 'admin'::public.app_role)
);
