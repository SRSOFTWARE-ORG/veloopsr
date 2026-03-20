import React, { createContext, useContext, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { User, Session } from "@supabase/supabase-js";

type UserRole = "admin" | "vendedor";

interface UserPermissions {
  pode_editar_preco: boolean;
  pode_excluir_venda: boolean;
  pode_dar_desconto: boolean;
  limite_desconto: number;
}

interface AuthContextType {
  user: User | null;
  session: Session | null;
  loading: boolean;
  profile: { nome: string } | null;
  role: UserRole;
  permissions: UserPermissions;
  isAdmin: boolean;
  signOut: () => Promise<void>;
}

const defaultPermissions: UserPermissions = {
  pode_editar_preco: false,
  pode_excluir_venda: false,
  pode_dar_desconto: false,
  limite_desconto: 0,
};

const AuthContext = createContext<AuthContextType>({
  user: null,
  session: null,
  loading: true,
  profile: null,
  role: "vendedor",
  permissions: defaultPermissions,
  isAdmin: false,
  signOut: async () => {},
});

export const useAuth = () => useContext(AuthContext);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [profile, setProfile] = useState<{ nome: string } | null>(null);
  const [role, setRole] = useState<UserRole>("vendedor");
  const [permissions, setPermissions] = useState<UserPermissions>(defaultPermissions);

  const fetchUserData = async (userId: string) => {
    const [profileRes, roleRes, permRes] = await Promise.all([
      supabase.from("profiles").select("nome").eq("id", userId).single(),
      supabase.from("user_roles").select("role").eq("user_id", userId).single(),
      supabase.from("permissions").select("*").eq("user_id", userId).single(),
    ]);

    if (profileRes.data) setProfile(profileRes.data);
    if (roleRes.data) setRole(roleRes.data.role as UserRole);
    if (permRes.data) {
      setPermissions({
        pode_editar_preco: permRes.data.pode_editar_preco ?? false,
        pode_excluir_venda: permRes.data.pode_excluir_venda ?? false,
        pode_dar_desconto: permRes.data.pode_dar_desconto ?? false,
        limite_desconto: Number(permRes.data.limite_desconto) || 0,
      });
    }
  };

  useEffect(() => {
    // If user chose not to stay logged in, clear session on tab close
    const handleBeforeUnload = () => {
      const manterLogado = localStorage.getItem("veloop_manter_logado");
      if (manterLogado !== "true" && session) {
        supabase.auth.signOut();
      }
    };

    window.addEventListener("beforeunload", handleBeforeUnload);

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (_event, session) => {
        setSession(session);
        setUser(session?.user ?? null);
        if (session?.user) {
          setTimeout(() => fetchUserData(session.user.id), 0);
        } else {
          setProfile(null);
          setRole("vendedor");
          setPermissions(defaultPermissions);
        }
        setLoading(false);
      }
    );

    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setUser(session?.user ?? null);
      if (session?.user) {
        fetchUserData(session.user.id);
      }
      setLoading(false);
    });

    return () => {
      subscription.unsubscribe();
      window.removeEventListener("beforeunload", handleBeforeUnload);
    };
  }, []);

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
        signOut,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};
