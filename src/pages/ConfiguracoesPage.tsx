import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { Settings, Users, Shield, Save } from "lucide-react";
import { Switch } from "@/components/ui/switch";

interface UserWithPermissions {
  id: string;
  nome: string;
  role: string;
  permissions: {
    pode_editar_preco: boolean;
    pode_excluir_venda: boolean;
    pode_dar_desconto: boolean;
    limite_desconto: number;
  };
}

const ConfiguracoesPage = () => {
  const { isAdmin } = useAuth();
  const [users, setUsers] = useState<UserWithPermissions[]>([]);

  useEffect(() => {
    if (isAdmin) fetchUsers();
  }, [isAdmin]);

  const fetchUsers = async () => {
    const [profilesRes, rolesRes, permsRes] = await Promise.all([
      supabase.from("profiles").select("*"),
      supabase.from("user_roles").select("*"),
      supabase.from("permissions").select("*"),
    ]);

    const profiles = profilesRes.data || [];
    const roles = rolesRes.data || [];
    const perms = permsRes.data || [];

    const merged: UserWithPermissions[] = profiles.map((p) => {
      const role = roles.find((r) => r.user_id === p.id);
      const perm = perms.find((pe) => pe.user_id === p.id);
      return {
        id: p.id,
        nome: p.nome,
        role: role?.role || "vendedor",
        permissions: {
          pode_editar_preco: perm?.pode_editar_preco ?? false,
          pode_excluir_venda: perm?.pode_excluir_venda ?? false,
          pode_dar_desconto: perm?.pode_dar_desconto ?? false,
          limite_desconto: Number(perm?.limite_desconto) || 0,
        },
      };
    });

    setUsers(merged);
  };

  const updateRole = async (userId: string, newRole: string) => {
    await supabase.from("user_roles").update({ role: newRole }).eq("user_id", userId);
    toast.success("Cargo atualizado!");
    fetchUsers();
  };

  const updatePermission = async (userId: string, field: string, value: boolean | number) => {
    await supabase.from("permissions").update({ [field]: value }).eq("user_id", userId);
    toast.success("Permissão atualizada!");
    fetchUsers();
  };

  if (!isAdmin) {
    return (
      <div className="page-container text-center py-20">
        <Shield className="w-16 h-16 mx-auto mb-4 text-muted-foreground opacity-30" />
        <p className="font-semibold text-lg">Acesso Restrito</p>
        <p className="text-sm text-muted-foreground">Apenas administradores podem acessar esta página.</p>
      </div>
    );
  }

  return (
    <div className="page-container">
      <div className="mb-6 slide-up">
        <h1 className="text-xl font-extrabold tracking-tight">Configurações</h1>
        <p className="text-sm text-muted-foreground">Gerenciar usuários e permissões</p>
      </div>

      <div className="space-y-4">
        {users.map((u, i) => (
          <Card key={u.id} className={`slide-up delay-${Math.min(i + 1, 6)}`}>
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center justify-between text-base">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-sm font-bold text-primary">
                    {u.nome.charAt(0).toUpperCase()}
                  </div>
                  <span>{u.nome}</span>
                </div>
                <select
                  value={u.role}
                  onChange={(e) => updateRole(u.id, e.target.value as "admin" | "vendedor")}
                  className="text-xs border rounded-md px-2 py-1 bg-background"
                >
                  <option value="vendedor">Vendedor</option>
                  <option value="admin">Admin</option>
                </select>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {u.role === "vendedor" && (
                <>
                  <div className="flex items-center justify-between">
                    <span className="text-sm">Pode editar preço</span>
                    <Switch
                      checked={u.permissions.pode_editar_preco}
                      onCheckedChange={(v) => updatePermission(u.id, "pode_editar_preco", v)}
                    />
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm">Pode excluir venda</span>
                    <Switch
                      checked={u.permissions.pode_excluir_venda}
                      onCheckedChange={(v) => updatePermission(u.id, "pode_excluir_venda", v)}
                    />
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm">Pode dar desconto</span>
                    <Switch
                      checked={u.permissions.pode_dar_desconto}
                      onCheckedChange={(v) => updatePermission(u.id, "pode_dar_desconto", v)}
                    />
                  </div>
                  {u.permissions.pode_dar_desconto && (
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-sm text-muted-foreground">Limite de desconto (%)</span>
                      <Input
                        type="number"
                        className="w-20 h-8 text-sm"
                        value={u.permissions.limite_desconto}
                        onChange={(e) =>
                          updatePermission(u.id, "limite_desconto", parseFloat(e.target.value) || 0)
                        }
                        min={0}
                        max={100}
                      />
                    </div>
                  )}
                </>
              )}
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
};

export default ConfiguracoesPage;
