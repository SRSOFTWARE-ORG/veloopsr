import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { User, Session } from "@supabase/supabase-js";

type UserRole = "admin" | "vendedor";

interface UserPermissions {
  pode_editar_preco: boolean;
  pode_excluir_venda: boolean;
  pode_dar_desconto: boolean;
  limite_desconto: number;
  pode_ver_faturamento: boolean;
  tipo_comissao: string;
  valor_comissao: number;
}

export const FOUNDER_EMAIL = "srcj9975@gmail.com";

interface AuthContextType {
  user: User | null;
  session: Session | null;
  loading: boolean;
  profile: { nome: string; is_ceo?: boolean } | null;
  role: UserRole;
  permissions: UserPermissions;
  isAdmin: boolean;
  isPrimaryAdmin: boolean;
  isFounder: boolean;
  isReadOnly: boolean;
  signOut: () => Promise<void>;
}

const defaultPermissions: UserPermissions = {
  pode_editar_preco: false,
  pode_excluir_venda: false,
  pode_dar_desconto: false,
  limite_desconto: 0,
  pode_ver_faturamento: false,
  tipo_comissao: "percentual",
  valor_comissao: 0,
};

const AuthContext = createContext<AuthContextType>({
  user: null,
  session: null,
  loading: true,
  profile: null,
  role: "vendedor",
  permissions: defaultPermissions,
  isAdmin: false,
  isPrimaryAdmin: false,
  isFounder: false,
  isReadOnly: true,
  signOut: async () => {},
});

export const useAuth = () => useContext(AuthContext);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [profile, setProfile] = useState<{ nome: string; is_ceo?: boolean } | null>(null);
  const [role, setRole] = useState<UserRole>("vendedor");
  const [permissions, setPermissions] = useState<UserPermissions>(defaultPermissions);
  const sessionRef = useRef<Session | null>(null);
  const initialSessionHandledRef = useRef(false);
  const activeFetchRef = useRef(0);

  const resetUserData = useCallback(() => {
    setProfile(null);
    setRole("vendedor");
    setPermissions(defaultPermissions);
  }, []);

  const fetchUserData = useCallback(async (userId: string) => {
    const requestId = ++activeFetchRef.current;
    const [profileRes, roleRes, permRes] = await Promise.all([
      supabase.from("profiles").select("nome, is_ceo").eq("id", userId).maybeSingle(),
      supabase.from("user_roles").select("role").eq("user_id", userId).maybeSingle(),
      supabase.from("permissions").select("*").eq("user_id", userId).maybeSingle(),
    ]);

    if (requestId !== activeFetchRef.current) {
      return;
    }

    setProfile(profileRes.data ? { nome: profileRes.data.nome, is_ceo: (profileRes.data as any).is_ceo ?? false } : null);
    setRole((roleRes.data?.role as UserRole) ?? "vendedor");
    setProfile(profileRes.data ? { nome: profileRes.data.nome } : null);
    setRole((roleRes.data?.role as UserRole) ?? "vendedor");

    if (!permRes.data) {
      setPermissions(defaultPermissions);
      return;
    }

    setPermissions({
      pode_editar_preco: permRes.data.pode_editar_preco ?? false,
      pode_excluir_venda: permRes.data.pode_excluir_venda ?? false,
      pode_dar_desconto: permRes.data.pode_dar_desconto ?? false,
      limite_desconto: Number(permRes.data.limite_desconto) || 0,
      pode_ver_faturamento: (permRes.data as any).pode_ver_faturamento ?? false,
      tipo_comissao: (permRes.data as any).tipo_comissao || "percentual",
      valor_comissao: Number((permRes.data as any).valor_comissao) || 0,
    });
  }, []);

  const syncSession = useCallback(
    async (nextSession: Session | null) => {
      setSession(nextSession);
      sessionRef.current = nextSession;

      const nextUser = nextSession?.user ?? null;
      setUser(nextUser);

      if (!nextUser) {
        activeFetchRef.current += 1;
        resetUserData();
        setLoading(false);
        return;
      }

      await fetchUserData(nextUser.id);
      setLoading(false);
    },
    [fetchUserData, resetUserData],
  );

  useEffect(() => {
    const handleBeforeUnload = () => {
      const manterLogado = localStorage.getItem("veloop_manter_logado");
      if (manterLogado !== "true" && sessionRef.current) {
        void supabase.auth.signOut({ scope: "local" });
      }
    };

    window.addEventListener("beforeunload", handleBeforeUnload);

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, nextSession) => {
      if (event === "INITIAL_SESSION") {
        initialSessionHandledRef.current = true;
      }
      void syncSession(nextSession);
    });

    void supabase.auth.getSession().then(({ data: { session: initialSession } }) => {
      if (initialSessionHandledRef.current) {
        return;
      }

      initialSessionHandledRef.current = true;
      void syncSession(initialSession);
    });

    return () => {
      subscription.unsubscribe();
      window.removeEventListener("beforeunload", handleBeforeUnload);
    };
  }, [syncSession]);

  const signOut = async () => {
    await supabase.auth.signOut();
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        session,
        loading,
        profile,
        role,
        permissions,
        isAdmin: role === "admin",
        isPrimaryAdmin: role === "admin" && user?.email === PRIMARY_ADMIN_EMAIL,
        isReadOnly: role === "admin" && user?.email !== PRIMARY_ADMIN_EMAIL,
        signOut,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};
