import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { Shield, Search, Plus, Smartphone, Edit } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface Dispositivo {
  id: string;
  imei_serial: string;
  modelo: string | null;
  status_seguranca: string;
  cliente_nome: string | null;
  observacoes: string | null;
  data_ativacao: string;
}

const statusColors: Record<string, string> = {
  protegido: "bg-primary/10 text-primary",
  bloqueado: "bg-destructive/10 text-destructive",
  liberado: "bg-warning/10 text-warning",
};

const statusLabels: Record<string, string> = {
  protegido: "Protegido",
  bloqueado: "Bloqueado",
  liberado: "Liberado",
};

const SegurancaPage = () => {
  const { isAdmin, user } = useAuth();
  const [dispositivos, setDispositivos] = useState<Dispositivo[]>([]);
  const [search, setSearch] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [form, setForm] = useState({
    imei_serial: "",
    modelo: "",
    cliente_nome: "",
    observacoes: "",
  });

  useEffect(() => {
    fetchDispositivos();
  }, []);

  const fetchDispositivos = async () => {
    const { data } = await supabase.from("dispositivos").select("*").order("created_at", { ascending: false });
    setDispositivos((data as Dispositivo[]) || []);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const { error } = await supabase.from("dispositivos").insert({
      imei_serial: form.imei_serial.trim(),
      modelo: form.modelo.trim() || null,
      cliente_nome: form.cliente_nome.trim() || null,
      observacoes: form.observacoes.trim() || null,
    });
    if (error) { toast.error(error.message); return; }
    toast.success("Dispositivo cadastrado!");
    setDialogOpen(false);
    setForm({ imei_serial: "", modelo: "", cliente_nome: "", observacoes: "" });
    fetchDispositivos();
  };

  const updateStatus = async (id: string, newStatus: string) => {
    if (!isAdmin) { toast.error("Apenas o admin pode alterar o status"); return; }
    await supabase.from("dispositivos").update({ status_seguranca: newStatus }).eq("id", id);
    toast.success("Status atualizado");
    fetchDispositivos();
  };

  const filtered = dispositivos.filter(
    (d) =>
      d.imei_serial.includes(search) ||
      d.modelo?.toLowerCase().includes(search.toLowerCase()) ||
      d.cliente_nome?.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="page-container">
      <div className="flex items-center justify-between mb-4 slide-up">
        <div>
          <h1 className="text-xl font-extrabold tracking-tight">Segurança SR</h1>
          <p className="text-sm text-muted-foreground">{dispositivos.length} dispositivos</p>
        </div>
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button size="sm"><Plus className="w-4 h-4 mr-1" /> Novo</Button>
          </DialogTrigger>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>Cadastrar Dispositivo</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleSubmit} className="space-y-3">
              <Input placeholder="IMEI / Serial *" value={form.imei_serial} onChange={(e) => setForm({ ...form, imei_serial: e.target.value })} required />
              <Input placeholder="Modelo" value={form.modelo} onChange={(e) => setForm({ ...form, modelo: e.target.value })} />
              <Input placeholder="Nome do cliente" value={form.cliente_nome} onChange={(e) => setForm({ ...form, cliente_nome: e.target.value })} />
              <Input placeholder="Observações" value={form.observacoes} onChange={(e) => setForm({ ...form, observacoes: e.target.value })} />
              <Button type="submit" className="w-full">Cadastrar</Button>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      <div className="relative mb-4 slide-up delay-1">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input placeholder="Buscar por IMEI, modelo ou cliente..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-10" />
      </div>

      <div className="space-y-2">
        {filtered.map((d, i) => (
          <Card key={d.id} className={`slide-up delay-${Math.min(i + 2, 6)}`}>
            <CardContent className="p-4 flex items-center gap-3">
              <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${statusColors[d.status_seguranca] || "bg-secondary"}`}>
                <Smartphone className="w-5 h-5" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-sm truncate">{d.modelo || "Dispositivo"}</p>
                <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                  <span className="text-xs text-muted-foreground font-mono">{d.imei_serial}</span>
                  <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded-full ${statusColors[d.status_seguranca]}`}>
                    {statusLabels[d.status_seguranca]}
                  </span>
                  {d.cliente_nome && <span className="text-xs text-muted-foreground">{d.cliente_nome}</span>}
                </div>
              </div>
              {isAdmin && (
                <Select value={d.status_seguranca} onValueChange={(val) => updateStatus(d.id, val)}>
                  <SelectTrigger className="w-28 h-8 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="protegido">Protegido</SelectItem>
                    <SelectItem value="bloqueado">Bloqueado</SelectItem>
                    <SelectItem value="liberado">Liberado</SelectItem>
                  </SelectContent>
                </Select>
              )}
            </CardContent>
          </Card>
        ))}
        {filtered.length === 0 && (
          <div className="text-center py-12 text-muted-foreground">
            <Shield className="w-12 h-12 mx-auto mb-3 opacity-30" />
            <p className="font-medium">Nenhum dispositivo encontrado</p>
            <p className="text-sm">Cadastre o primeiro dispositivo</p>
          </div>
        )}
      </div>
    </div>
  );
};

export default SegurancaPage;
