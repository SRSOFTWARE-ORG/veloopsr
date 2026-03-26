import { useEffect, useState } from "react";
import { formatCurrency } from "@/lib/masks";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
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
import {
  DollarSign,
  TrendingUp,
  TrendingDown,
  Plus,
  Trash2,
  Wallet,
  ChevronDown,
  User,
} from "lucide-react";

interface EntradaDetalhe {
  cliente_nome: string;
  valor: number;
  pago_por_nome: string;
  pago_em: string;
  tipo: "parcela" | "entrada";
}

type Periodo = "semana" | "quinzena" | "mes" | "ano";

const periodoLabels: Record<Periodo, string> = {
  semana: "Semanal",
  quinzena: "Quinzenal",
  mes: "Mensal",
  ano: "Anual",
};

function getDateRange(periodo: Periodo) {
  const now = new Date();
  const end = now.toISOString().split("T")[0];
  const d = new Date();
  switch (periodo) {
    case "semana": d.setDate(d.getDate() - 7); break;
    case "quinzena": d.setDate(d.getDate() - 15); break;
    case "mes": d.setMonth(d.getMonth() - 1); break;
    case "ano": d.setFullYear(d.getFullYear() - 1); break;
  }
  return { start: d.toISOString().split("T")[0], end };
}

interface Saida {
  id: string;
  valor: number;
  motivo: string;
  responsavel_id: string;
  responsavel_nome?: string;
  registrado_por: string;
  created_at: string;
}

const CaixaPage = () => {
  const { user, isAdmin, isPrimaryAdmin, isReadOnly } = useAuth();
  const [periodo, setPeriodo] = useState<Periodo>("mes");
  const [entradaTotal, setEntradaTotal] = useState(0);
  const [saidas, setSaidas] = useState<Saida[]>([]);
  const [profiles, setProfiles] = useState<{ id: string; nome: string }[]>([]);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [newSaida, setNewSaida] = useState({ valor: "", motivo: "", responsavel_id: "" });
  const [entradasDetalhes, setEntradasDetalhes] = useState<EntradaDetalhe[]>([]);
  const [entradasOpen, setEntradasOpen] = useState(false);

  useEffect(() => {
    fetchData();
  }, [periodo]);

  useEffect(() => {
    fetchProfiles();
  }, []);

  const fetchProfiles = async () => {
    const { data } = await supabase.from("profiles").select("id, nome");
    if (data) setProfiles(data);
  };

  const fetchData = async () => {
    const { start, end } = getDateRange(periodo);

    // Fetch entradas (recebido from cobranca_pagamentos)
    const { data: pagamentos } = await supabase
      .from("cobranca_pagamentos")
      .select("status, cobranca_id, data_vencimento")
      .gte("data_vencimento", start)
      .lte("data_vencimento", end)
      .eq("status", "pago");

    let totalEntrada = 0;

    if (pagamentos && pagamentos.length > 0) {
      const cobrancaIds = [...new Set(pagamentos.map((p) => p.cobranca_id))];
      const { data: cobrancas } = await supabase
        .from("cobrancas")
        .select("id, valor_parcela")
        .in("id", cobrancaIds);

      const valorMap: Record<string, number> = {};
      cobrancas?.forEach((c) => { valorMap[c.id] = Number(c.valor_parcela); });

      pagamentos.forEach((p) => {
        totalEntrada += valorMap[p.cobranca_id] || 0;
      });
    }

    // Also add entradas from vendas (valor_entrada)
    const { data: vendas } = await supabase
      .from("vendas")
      .select("valor_entrada, created_at")
      .eq("status", "concluida");

    if (vendas) {
      vendas.forEach((v) => {
        const vendaDate = v.created_at?.split("T")[0] || "";
        const entrada = Number(v.valor_entrada) || 0;
        if (entrada > 0 && vendaDate >= start && vendaDate <= end) {
          totalEntrada += entrada;
        }
      });
    }

    setEntradaTotal(totalEntrada);

    // Fetch saídas
    const { data: saidasData } = await supabase
      .from("saidas_caixa")
      .select("*")
      .gte("created_at", start + "T00:00:00")
      .lte("created_at", end + "T23:59:59")
      .order("created_at", { ascending: false });

    if (saidasData) {
      setSaidas(saidasData as Saida[]);
    }
  };

  const handleCreateSaida = async () => {
    const valor = parseFloat(newSaida.valor);
    if (!valor || valor <= 0 || !newSaida.motivo.trim() || !newSaida.responsavel_id) {
      toast.error("Preencha todos os campos corretamente");
      return;
    }
    setCreating(true);
    try {
      const { error } = await supabase.from("saidas_caixa").insert({
        valor,
        motivo: newSaida.motivo.trim(),
        responsavel_id: newSaida.responsavel_id,
        registrado_por: user!.id,
      });
      if (error) throw error;
      toast.success("Saída registrada!");
      setNewSaida({ valor: "", motivo: "", responsavel_id: "" });
      setDialogOpen(false);
      fetchData();
    } catch (err: any) {
      toast.error(err.message || "Erro ao registrar saída");
    } finally {
      setCreating(false);
    }
  };

  const handleDeleteSaida = async () => {
    if (!deleteId) return;
    const { error } = await supabase.from("saidas_caixa").delete().eq("id", deleteId);
    if (error) {
      toast.error("Erro ao excluir: " + error.message);
    } else {
      toast.success("Saída excluída!");
      fetchData();
    }
    setDeleteId(null);
  };

  const totalSaidas = saidas.reduce((s, item) => s + Number(item.valor), 0);
  const saldo = entradaTotal - totalSaidas;

  const getResponsavelNome = (id: string) =>
    profiles.find((p) => p.id === id)?.nome || "Desconhecido";

  return (
    <div className="page-container">
      <div className="mb-6 slide-up flex items-center justify-between">
        <div>
          <h1 className="text-xl font-extrabold tracking-tight">Gestão de Caixa</h1>
          <p className="text-sm text-muted-foreground">Controle de entradas e saídas</p>
        </div>
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button size="sm" className="gap-2">
              <Plus className="w-4 h-4" />
              Nova Saída
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Registrar Saída</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 pt-2">
              <div className="space-y-2">
                <Label>Valor</Label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground font-medium">R$</span>
                  <Input
                    type="text"
                    inputMode="numeric"
                    placeholder="0,00"
                    className="pl-10"
                    value={newSaida.valor && Number(newSaida.valor) > 0 ? Number(newSaida.valor).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : ""}
                    onChange={(e) => {
                      const raw = e.target.value.replace(/\D/g, "");
                      setNewSaida((p) => ({ ...p, valor: raw ? String(parseInt(raw, 10) / 100) : "" }));
                    }}
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label>Responsável pela retirada</Label>
                <Select
                  value={newSaida.responsavel_id}
                  onValueChange={(v) => setNewSaida((p) => ({ ...p, responsavel_id: v }))}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Selecionar pessoa" />
                  </SelectTrigger>
                  <SelectContent>
                    {profiles.map((p) => (
                      <SelectItem key={p.id} value={p.id}>
                        {p.nome}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Motivo</Label>
                <Textarea
                  placeholder="Descreva o motivo da retirada..."
                  value={newSaida.motivo}
                  onChange={(e) => setNewSaida((p) => ({ ...p, motivo: e.target.value }))}
                />
              </div>
              <Button onClick={handleCreateSaida} disabled={creating} className="w-full">
                {creating ? "Registrando..." : "Registrar Saída"}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {/* Period filter */}
      <div className="flex gap-1.5 mb-4 flex-wrap slide-up delay-1">
        {(Object.keys(periodoLabels) as Periodo[]).map((p) => (
          <button
            key={p}
            onClick={() => setPeriodo(p)}
            className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
              periodo === p
                ? "bg-primary text-primary-foreground"
                : "bg-muted text-muted-foreground hover:bg-muted/80"
            }`}
          >
            {periodoLabels[p]}
          </button>
        ))}
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-6 slide-up delay-2">
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-emerald-500/10 flex items-center justify-center">
              <TrendingUp className="w-5 h-5 text-emerald-600" />
            </div>
            <div>
              <p className="text-[10px] text-muted-foreground">Entradas</p>
              <p className="text-sm font-bold tabular-nums text-emerald-700">
                {formatCurrency(entradaTotal)}
              </p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-destructive/10 flex items-center justify-center">
              <TrendingDown className="w-5 h-5 text-destructive" />
            </div>
            <div>
              <p className="text-[10px] text-muted-foreground">Saídas</p>
              <p className="text-sm font-bold tabular-nums text-destructive">
                {formatCurrency(totalSaidas)}
              </p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div className={`w-10 h-10 rounded-full flex items-center justify-center ${saldo >= 0 ? "bg-primary/10" : "bg-destructive/10"}`}>
              <Wallet className={`w-5 h-5 ${saldo >= 0 ? "text-primary" : "text-destructive"}`} />
            </div>
            <div>
              <p className="text-[10px] text-muted-foreground">Saldo</p>
              <p className={`text-sm font-bold tabular-nums ${saldo >= 0 ? "text-primary" : "text-destructive"}`}>
                {formatCurrency(saldo)}
              </p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Saídas list */}
      <div className="slide-up delay-3">
        <h2 className="text-sm font-semibold mb-3">Retiradas no período</h2>
        <div className="space-y-2">
          {saidas.length === 0 ? (
            <Card>
              <CardContent className="py-8 text-center text-muted-foreground">
                <DollarSign className="w-10 h-10 mx-auto mb-2 opacity-30" />
                <p className="text-sm">Nenhuma saída registrada neste período</p>
              </CardContent>
            </Card>
          ) : (
            saidas.map((s) => (
              <Card key={s.id}>
                <CardContent className="p-4 flex items-center justify-between">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-semibold text-destructive">
                        - {formatCurrency(s.valor)}
                      </p>
                      <span className="text-xs text-muted-foreground">
                        • {getResponsavelNome(s.responsavel_id)}
                      </span>
                    </div>
                    <p className="text-xs text-muted-foreground mt-0.5 truncate">{s.motivo}</p>
                    <p className="text-[10px] text-muted-foreground mt-0.5">
                      {new Date(s.created_at).toLocaleDateString("pt-BR")}
                    </p>
                  </div>
                  {isPrimaryAdmin && (
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 text-muted-foreground hover:text-destructive"
                      onClick={() => setDeleteId(s.id)}
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  )}
                </CardContent>
              </Card>
            ))
          )}
        </div>
      </div>

      <AlertDialog open={!!deleteId} onOpenChange={(o) => !o && setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir saída?</AlertDialogTitle>
            <AlertDialogDescription>Esta ação não pode ser desfeita.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleDeleteSaida} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default CaixaPage;
