import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Save, Eye, EyeOff, Camera } from "lucide-react";
import { UserAvatar, uploadAvatar } from "./UserAvatar";

interface EditVendedorDialogProps {
  vendedor: { id: string; nome: string; email?: string } | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved: () => void;
}

const EditVendedorDialog = ({ vendedor, open, onOpenChange, onSaved }: EditVendedorDialogProps) => {
  const [nome, setNome] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [avatarVersion, setAvatarVersion] = useState<number | undefined>(undefined);

  const handlePhoto = async (file?: File) => {
    if (!vendedor || !file) return;
    setUploading(true);
    try {
      await uploadAvatar(vendedor.id, file);
      setAvatarVersion(Date.now());
      toast.success("Foto atualizada!");
      onSaved();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao enviar foto");
    } finally {
      setUploading(false);
    }
  };

  useEffect(() => {
    if (vendedor) {
      setNome(vendedor.nome);
      setEmail(vendedor.email || "");
      setPassword("");
      setShowPassword(false);
    }
  }, [vendedor]);

  const handleSave = async () => {
    if (!vendedor || !nome.trim()) {
      toast.error("Preencha o nome");
      return;
    }
    if (password && password.length < 6) {
      toast.error("A senha deve ter pelo menos 6 caracteres");
      return;
    }

    setSaving(true);
    try {
      const body: Record<string, string> = { user_id: vendedor.id };
      if (nome.trim() !== vendedor.nome) body.nome = nome.trim();
      if (email.trim() && email.trim() !== vendedor.email) body.email = email.trim();
      if (password) body.password = password;

      const res = await supabase.functions.invoke("update-vendor", { body });

      if (res.error || res.data?.error) {
        toast.error(res.data?.error || res.error?.message || "Erro ao salvar");
      } else {
        toast.success("Dados atualizados com sucesso!");
        onOpenChange(false);
        onSaved();
      }
    } catch (err: any) {
      toast.error(err.message || "Erro inesperado");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Editar Vendedor</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 pt-2">
          {vendedor && (
            <div className="flex flex-col items-center gap-2">
              <UserAvatar userId={vendedor.id} nome={vendedor.nome} version={avatarVersion} className="w-20 h-20 text-2xl" />
              <label className="inline-flex items-center gap-1.5 text-sm text-primary font-medium cursor-pointer">
                <Camera className="w-4 h-4" />
                {uploading ? "Enviando..." : "Alterar foto"}
                <input
                  type="file"
                  accept="image/*"
                  className="sr-only"
                  disabled={uploading}
                  onChange={(e) => { void handlePhoto(e.target.files?.[0]); e.target.value = ""; }}
                />
              </label>
            </div>
          )}
          <div className="space-y-2">
            <Label>Nome</Label>
            <Input
              value={nome}
              onChange={(e) => setNome(e.target.value)}
              placeholder="Nome do vendedor"
            />
          </div>
          <div className="space-y-2">
            <Label>Email</Label>
            <Input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="email@exemplo.com"
            />
          </div>
          <div className="space-y-2">
            <Label>Nova Senha <span className="text-xs text-muted-foreground">(deixe vazio para manter)</span></Label>
            <div className="relative">
              <Input
                type={showPassword ? "text" : "password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Mínimo 6 caracteres"
                className="pr-10"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
              >
                {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>
          <Button onClick={handleSave} disabled={saving} className="w-full gap-2">
            <Save className="w-4 h-4" />
            {saving ? "Salvando..." : "Salvar"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default EditVendedorDialog;
