import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { Plus, Search, Wrench, Edit, Trash2 } from "lucide-react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { maskPhone } from "@/lib/masks";

interface Assistencia {
  id: string;
  cliente_nome: string;
  cliente_telefone: string | null;
  modelo: string | null;
  imei_serial: string | null;
  defeito: string;
  observacoes: string | null;
  status: string;
  vendedor_id: string;
  created_at: string;
}

const emptyForm = {
  cliente_nome: "",
  cliente_telefone: "",
  modelo: "",
  imei_serial: "",
  defeito: "",
  observacoes: "",
  status: "aberto",
};

const statusLabels: Record<string, { label: string; color: string }> = {
  aberto: { label: "Aberto", color: "bg-amber-100 text-amber-800" },
  em_andamento: { label: "Em andamento", color: "bg-blue-100 text-blue-800" },
  concluido: { label: "Concluído", color: "bg-emerald-100 text-emerald-800" },
};

const AssistenciaPage = () => {
  const { isAdmin, user } = useAuth();
  const [items, setItems] = useState<Assistencia[]>([]);
  const [search, setSearch] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Assistencia | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [filterStatus, setFilterStatus] = useState<string | null>(null);

  useEffect(() => { fetchItems(); }, []);

  const fetchItems = async () => {
    const { data } = await supabase
      .from("assistencias")
      .select("*")
      .order("created_at", { ascending: false });
    setItems((data as Assistencia[]) || []);
  };

  const set = (field: string, value: string) => setForm((p) => ({ ...p, [field]: value }));

  const resetForm = () => { setForm(emptyForm); setEditing(null); };

  const openEdit = (a: Assistencia) => {
    setEditing(a);
    setForm({
      cliente_nome: a.cliente_nome,
      cliente_telefone: a.cliente_telefone || "",
      modelo: a.modelo || "",
      imei_serial: a.imei_serial || "",
      defeito: a.defeito,
      observacoes: a.observacoes || "",
      status: a.status,
    });
    setDialogOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.cliente_nome.trim() || !form.defeito.trim()) {
      toast.error("Cliente e defeito são obrigatórios");
      return;
    }

    const payload = {
      cliente_nome: form.cliente_nome.trim(),
      cliente_telefone: form.cliente_telefone.trim() || null,
      modelo: form.modelo.trim() || null,
      imei_serial: form.imei_serial.trim() || null,
      defeito: form.defeito.trim(),
      observacoes: form.observacoes.trim() || null,
      status: form.status,
      vendedor_id: editing ? editing.vendedor_id : user?.id,
    };

    if (editing) {
      const { error } = await supabase.from("assistencias").update(payload).eq("id", editing.id);
      if (error) { toast.error("Erro ao atualizar"); return; }
      toast.success("Assistência atualizada!");
    } else {
      const { error } = await supabase.from("assistencias").insert(payload);
      if (error) { toast.error("Erro ao cadastrar"); return; }
      toast.success("Assistência cadastrada!");
    }

    setDialogOpen(false);
    resetForm();
    fetchItems();
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Excluir esta assistência?")) return;
    const { error } = await supabase.from("assistencias").delete().eq("id", id);
    if (error) { toast.error("Erro ao excluir"); return; }
    toast.success("Assistência excluída");
    fetchItems();
  };

  const filtered = items.filter((a) => {
    const matchSearch =
      a.cliente_nome.toLowerCase().includes(search.toLowerCase()) ||
      a.defeito.toLowerCase().includes(search.toLowerCase()) ||
      a.modelo?.toLowerCase().includes(search.toLowerCase()) ||
      a.imei_serial?.includes(search);
    const matchStatus = !filterStatus || a.status === filterStatus;
    return matchSearch && matchStatus;
  });

  return (
    <div className="page-container pb-24 md:pb-8">
      <div className="flex items-center justify-between mb-4 slide-up">
        <div>
          <h1 className="text-xl font-extrabold tracking-tight">Assistências</h1>
          <p className="text-sm text-muted-foreground">{items.length} registros</p>
        </div>
        <Dialog open={dialogOpen} onOpenChange={(open) => { setDialogOpen(open); if (!open) resetForm(); }}>
          <DialogTrigger asChild>
            <Button size="sm"><Plus className="w-4 h-4 mr-1" /> Nova</Button>
          </DialogTrigger>
          <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>{editing ? "Editar Assistência" : "Nova Assistência"}</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label>Cliente *</Label>
                <Input placeholder="Nome do cliente" value={form.cliente_nome} onChange={(e) => set("cliente_nome", e.target.value)} required />
              </div>
              <div className="space-y-2">
                <Label>Telefone</Label>
                <Input placeholder="(00) 00000-0000" value={form.cliente_telefone} onChange={(e) => set("cliente_telefone", maskPhone(e.target.value))} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label>Modelo</Label>
                  <Input placeholder="Ex: iPhone 14" value={form.modelo} onChange={(e) => set("modelo", e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label>IMEI / Serial</Label>
                  <Input placeholder="IMEI ou Serial" value={form.imei_serial} onChange={(e) => set("imei_serial", e.target.value)} />
                </div>
              </div>
              <div className="space-y-2">
                <Label>Defeito *</Label>
                <Textarea placeholder="Descreva o defeito..." value={form.defeito} onChange={(e) => set("defeito", e.target.value)} rows={3} required />
              </div>
              <div className="space-y-2">
                <Label>Status</Label>
                <Select value={form.status} onValueChange={(v) => set("status", v)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="aberto">Aberto</SelectItem>
                    <SelectItem value="em_andamento">Em andamento</SelectItem>
                    <SelectItem value="concluido">Concluído</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Observações</Label>
                <Textarea placeholder="Observações adicionais..." value={form.observacoes} onChange={(e) => set("observacoes", e.target.value)} rows={2} />
              </div>
              <Button type="submit" className="w-full">{editing ? "Salvar" : "Cadastrar"}</Button>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {/* Search */}
      <div className="relative mb-4 slide-up delay-1">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input placeholder="Buscar por cliente, defeito, modelo..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-10" />
      </div>

      {/* Status filters */}
      <div className="flex gap-2 mb-5 overflow-x-auto pb-1 slide-up delay-2 scrollbar-hide">
        <button
          onClick={() => setFilterStatus(null)}
          className={`shrink-0 px-3 py-1.5 rounded-full text-xs font-medium transition-all duration-200 active:scale-95 ${
            !filterStatus ? "bg-primary text-primary-foreground shadow-sm" : "bg-secondary text-muted-foreground hover:text-foreground"
          }`}
        >
          Todos
        </button>
        {Object.entries(statusLabels).map(([key, { label }]) => (
          <button
            key={key}
            onClick={() => setFilterStatus(filterStatus === key ? null : key)}
            className={`shrink-0 px-3 py-1.5 rounded-full text-xs font-medium transition-all duration-200 active:scale-95 ${
              filterStatus === key ? "bg-primary text-primary-foreground shadow-sm" : "bg-secondary text-muted-foreground hover:text-foreground"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {/* List */}
      <div className="space-y-2">
        {filtered.map((a, i) => {
          const st = statusLabels[a.status] || statusLabels.aberto;
          return (
            <Card key={a.id} className={`slide-up delay-${Math.min(i + 2, 6)}`}>
              <CardContent className="p-4 flex items-start gap-3">
                <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center shrink-0 mt-0.5">
                  <Wrench className="w-5 h-5 text-primary" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="font-semibold text-sm truncate">{a.cliente_nome}</p>
                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${st.color}`}>
                      {st.label}
                    </span>
                  </div>
                  {a.modelo && (
                    <p className="text-xs text-muted-foreground mt-0.5">{a.modelo}{a.imei_serial ? ` · ${a.imei_serial}` : ""}</p>
                  )}
                  <p className="text-xs text-foreground/80 mt-1 line-clamp-2">{a.defeito}</p>
                  <p className="text-[10px] text-muted-foreground mt-1">
                    {new Date(a.created_at).toLocaleDateString("pt-BR")}
                  </p>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openEdit(a)}>
                    <Edit className="w-4 h-4" />
                  </Button>
                  {isAdmin && (
                    <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={() => handleDelete(a.id)}>
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>
          );
        })}
        {filtered.length === 0 && (
          <div className="text-center py-12 text-muted-foreground">
            <Wrench className="w-12 h-12 mx-auto mb-3 opacity-30" />
            <p className="font-medium">Nenhuma assistência encontrada</p>
            <p className="text-sm">Cadastre uma nova assistência</p>
          </div>
        )}
      </div>
    </div>
  );
};

export default AssistenciaPage;
