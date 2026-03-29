import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { Shield, UserPlus, Eye, EyeOff, Pencil, Trash2, ChevronDown, Smartphone } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import EditVendedorDialog from "@/components/configuracoes/EditVendedorDialog";
import PermissionsManager from "@/components/PermissionsManager";
import AISearchBar from "@/components/configuracoes/AISearchBar";

interface UserWithPermissions {
  id: string;
  nome: string;
  email?: string;
  role: string;
  permissions: {
    pode_editar_preco: boolean;
    pode_excluir_venda: boolean;
    pode_dar_desconto: boolean;
    limite_desconto: number;
    pode_ver_faturamento: boolean;
    tipo_comissao: string;
    valor_comissao: number;
  };
}

const ConfiguracoesPage = () => {
  const { isAdmin, user } = useAuth();
  const [users, setUsers] = useState<UserWithPermissions[]>([]);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [newVendor, setNewVendor] = useState({ nome: "", email: "", password: "" });
  const [editVendedor, setEditVendedor] = useState<{ id: string; nome: string; email?: string } | null>(null);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [deleteUserId, setDeleteUserId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    if (isAdmin) fetchUsers();
  }, [isAdmin]);

  const fetchUsers = async () => {
    const [profilesRes, rolesRes, permsRes, emailsRes] = await Promise.all([
      supabase.from("profiles").select("*"),
      supabase.from("user_roles").select("*"),
      supabase.from("permissions").select("*"),
      supabase.functions.invoke("list-user-emails"),
    ]);

    const profiles = profilesRes.data || [];
    const roles = rolesRes.data || [];
    const perms = permsRes.data || [];
    const emailMap: Record<string, string> = emailsRes.data?.emails || {};

    const merged: UserWithPermissions[] = profiles.map((p) => {
      const role = roles.find((r) => r.user_id === p.id);
      const perm = perms.find((pe) => pe.user_id === p.id);
      return {
        id: p.id,
        nome: p.nome,
        email: emailMap[p.id] || "",
        role: role?.role || "vendedor",
        permissions: {
          pode_editar_preco: perm?.pode_editar_preco ?? false,
          pode_excluir_venda: perm?.pode_excluir_venda ?? false,
          pode_dar_desconto: perm?.pode_dar_desconto ?? false,
          limite_desconto: Number(perm?.limite_desconto) || 0,
          pode_ver_faturamento: (perm as any)?.pode_ver_faturamento ?? false,
          tipo_comissao: (perm as any)?.tipo_comissao || "percentual",
          valor_comissao: Number((perm as any)?.valor_comissao) || 0,
        },
      };
    });

    setUsers(merged);
  };

  const handleCreateVendor = async () => {
    if (!newVendor.nome || !newVendor.email || !newVendor.password) {
      toast.error("Preencha todos os campos");
      return;
    }
    if (newVendor.password.length < 6) {
      toast.error("A senha deve ter pelo menos 6 caracteres");
      return;
    }

    setCreating(true);
    try {
      const res = await supabase.functions.invoke("create-vendor", {
        body: { email: newVendor.email, password: newVendor.password, nome: newVendor.nome },
      });

      if (res.error || res.data?.error) {
        toast.error(res.data?.error || res.error?.message || "Erro ao criar vendedor");
      } else {
        toast.success(`Vendedor "${newVendor.nome}" criado com sucesso!`);
        setNewVendor({ nome: "", email: "", password: "" });
        setDialogOpen(false);
        setTimeout(fetchUsers, 1000);
      }
    } catch (err: any) {
      toast.error(err.message || "Erro inesperado");
    } finally {
      setCreating(false);
    }
  };

  const handleDeleteVendor = async () => {
    if (!deleteUserId) return;
    setDeleting(true);
    try {
      const res = await supabase.functions.invoke("delete-vendor", {
        body: { user_id: deleteUserId },
      });
      if (res.error || res.data?.error) {
        toast.error(res.data?.error || res.error?.message || "Erro ao excluir");
      } else {
        toast.success("Vendedor excluído com sucesso!");
        fetchUsers();
      }
    } catch (err: any) {
      toast.error(err.message || "Erro inesperado");
    } finally {
      setDeleting(false);
      setDeleteUserId(null);
    }
  };

  const updateRole = async (userId: string, newRole: "admin" | "vendedor") => {
    await supabase.from("user_roles").update({ role: newRole }).eq("user_id", userId);
    toast.success("Cargo atualizado!");
    fetchUsers();
  };

  const updatePermission = async (userId: string, field: string, value: boolean | number | string) => {
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
      {/* AI Search Bar */}
      <div className="mb-6 slide-up">
        <AISearchBar />
      </div>

      <div className="mb-6 slide-up flex items-center justify-between">
        <div>
          <h1 className="text-xl font-extrabold tracking-tight">Gerenciar Equipe</h1>
          <p className="text-sm text-muted-foreground">Adicionar vendedores e gerenciar permissões</p>
        </div>
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button size="sm" className="gap-2 btn-3d">
              <UserPlus className="w-4 h-4" />
              Novo Vendedor
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Adicionar Vendedor</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 pt-2">
              <div className="space-y-2">
                <Label>Nome</Label>
                <Input placeholder="Nome do vendedor" value={newVendor.nome} onChange={(e) => setNewVendor((p) => ({ ...p, nome: e.target.value }))} />
              </div>
              <div className="space-y-2">
                <Label>Email</Label>
                <Input type="email" placeholder="email@exemplo.com" value={newVendor.email} onChange={(e) => setNewVendor((p) => ({ ...p, email: e.target.value }))} />
              </div>
              <div className="space-y-2">
                <Label>Senha</Label>
                <div className="relative">
                  <Input type={showPassword ? "text" : "password"} placeholder="Mínimo 6 caracteres" value={newVendor.password} onChange={(e) => setNewVendor((p) => ({ ...p, password: e.target.value }))} />
                  <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>
              <Button onClick={handleCreateVendor} disabled={creating} className="w-full">
                {creating ? "Criando..." : "Criar Vendedor"}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
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
                  <div>
                    <span className="block">{u.nome}</span>
                    {u.email === "srcj9975@gmail.com" && (
                      <span className="text-[10px] font-semibold text-primary">Gerente & CEO</span>
                    )}
                    <span className="text-xs font-normal text-muted-foreground block">{u.email}</span>
                    <span className="text-xs font-normal text-muted-foreground capitalize">{u.role}</span>
                  </div>
                </div>
                <div className="flex items-center gap-1">
                  <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => { setEditVendedor({ id: u.id, nome: u.nome, email: (u as any).email }); setEditDialogOpen(true); }}>
                    <Pencil className="w-3.5 h-3.5" />
                  </Button>
                  {u.id !== user?.id && (
                    <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-destructive" onClick={() => setDeleteUserId(u.id)}>
                      <Trash2 className="w-3.5 h-3.5" />
                    </Button>
                  )}
                  <select
                    value={u.role}
                    onChange={(e) => updateRole(u.id, e.target.value as "admin" | "vendedor")}
                    className="text-xs border rounded-md px-2 py-1 bg-background"
                  >
                    <option value="vendedor">Vendedor</option>
                    <option value="admin">Admin</option>
                  </select>
                </div>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 pt-2">
              {u.role === "vendedor" && (
                <details className="group">
                  <summary className="flex items-center justify-between cursor-pointer py-2 px-2 rounded-lg hover:bg-secondary/50 transition-colors list-none">
                    <div className="flex items-center gap-2">
                      <Shield className="w-4 h-4 text-primary" />
                      <span className="text-sm font-medium">Permissões</span>
                    </div>
                    <ChevronDown className="w-4 h-4 text-muted-foreground transition-transform duration-300 group-open:rotate-180" />
                  </summary>
                  <div className="space-y-3 pt-2 pb-1 px-1 animate-fade-in">
                    <div className="flex items-center justify-between">
                      <span className="text-sm">Pode editar preço</span>
                      <Switch checked={u.permissions.pode_editar_preco} onCheckedChange={(v) => updatePermission(u.id, "pode_editar_preco", v)} />
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-sm">Pode dar desconto</span>
                      <Switch checked={u.permissions.pode_dar_desconto} onCheckedChange={(v) => updatePermission(u.id, "pode_dar_desconto", v)} />
                    </div>
                    {u.permissions.pode_dar_desconto && (
                      <div className="flex items-center justify-between gap-3 pl-4">
                        <span className="text-sm text-muted-foreground">Limite de desconto (%)</span>
                        <Input type="number" className="w-20 h-8 text-sm" value={u.permissions.limite_desconto} onChange={(e) => updatePermission(u.id, "limite_desconto", parseFloat(e.target.value) || 0)} min={0} max={100} />
                      </div>
                    )}
                    <div className="flex items-center justify-between">
                      <span className="text-sm">Pode ver faturamento geral</span>
                      <Switch checked={u.permissions.pode_ver_faturamento} onCheckedChange={(v) => updatePermission(u.id, "pode_ver_faturamento", v)} />
                    </div>

                    <div className="border-t border-border/40 pt-3 mt-2">
                      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Comissão</p>
                      <div className="flex items-center gap-3">
                        <Select
                          value={u.permissions.tipo_comissao}
                          onValueChange={(v) => updatePermission(u.id, "tipo_comissao", v)}
                        >
                          <SelectTrigger className="w-36 h-8 text-sm">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="percentual">Percentual (%)</SelectItem>
                            <SelectItem value="fixo">Valor Fixo (R$)</SelectItem>
                          </SelectContent>
                        </Select>
                        <Input
                          type="number"
                          className="w-24 h-8 text-sm"
                          value={u.permissions.valor_comissao}
                          onChange={(e) => updatePermission(u.id, "valor_comissao", parseFloat(e.target.value) || 0)}
                          min={0}
                          max={u.permissions.tipo_comissao === "percentual" ? 30 : 99999}
                          placeholder={u.permissions.tipo_comissao === "percentual" ? "0-30%" : "R$"}
                        />
                      </div>
                    </div>

                    <div className="pt-2 border-t border-border/40">
                      <p className="text-xs text-muted-foreground italic">
                        Vendedores não podem excluir registros (vendas, produtos, clientes ou documentos).
                      </p>
                    </div>
                  </div>
                </details>
              )}
            </CardContent>
          </Card>
        ))}

        {users.length === 0 && (
          <div className="text-center py-12 text-muted-foreground">
            <UserPlus className="w-12 h-12 mx-auto mb-3 opacity-30" />
            <p className="text-sm">Nenhum usuário cadastrado ainda.</p>
          </div>
        )}
      </div>

      <details className="group mt-4">
        <summary className="flex items-center justify-between cursor-pointer py-3 px-4 rounded-xl bg-card border border-border hover:bg-secondary/50 transition-colors list-none"
          style={{ boxShadow: '0 4px 12px rgba(0,0,0,0.08)' }}>
          <div className="flex items-center gap-2">
            <Smartphone className="w-5 h-5 text-primary" />
            <span className="text-sm font-semibold">Permissões do Dispositivo</span>
          </div>
          <ChevronDown className="w-4 h-4 text-muted-foreground transition-transform duration-300 group-open:rotate-180" />
        </summary>
        <div className="mt-2 animate-fade-in">
          <PermissionsManager />
        </div>
      </details>

      <EditVendedorDialog vendedor={editVendedor} open={editDialogOpen} onOpenChange={setEditDialogOpen} onSaved={fetchUsers} />

      <AlertDialog open={!!deleteUserId} onOpenChange={(o) => !o && setDeleteUserId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir vendedor?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta ação é irreversível. O vendedor será removido permanentemente do sistema.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleDeleteVendor} disabled={deleting} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              {deleting ? "Excluindo..." : "Excluir"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default ConfiguracoesPage;
