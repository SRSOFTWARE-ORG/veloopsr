import { useEffect, useState, useMemo, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import {
  CalendarDays,
  Plus,
  ChevronLeft,
  ChevronRight,
  Trash2,
  Clock,
  User,
  DollarSign,
  CheckCircle2,
  AlertCircle,
  Undo2,
  ShieldOff,
  Pencil,
} from "lucide-react";
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
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import {
  format,
  startOfMonth,
  endOfMonth,
  eachDayOfInterval,
  isSameDay,
  addMonths,
  subMonths,
  addWeeks,
  addDays,
  isAfter,
  isBefore,
  parseISO,
  startOfDay,
} from "date-fns";
import { ptBR } from "date-fns/locale";

interface Cobranca {
  id: string;
  cliente_id: string;
  cliente_nome: string;
  valor_parcela: number;
  frequencia: string;
  data_inicio: string;
  data_fim: string;
  criado_por: string;
  observacoes: string | null;
  created_at: string;
}

interface Pagamento {
  id: string;
  cobranca_id: string;
  data_vencimento: string;
  status: string;
  pago_por: string | null;
  pago_em: string | null;
}

interface Cliente {
  id: string;
  nome: string;
}

type StatusFilter = "todos" | "a_pagar" | "pago" | "pendente" | "isento";

function generatePaymentDates(
  dataInicio: string,
  dataFim: string,
  frequencia: string
): Date[] {
  const start = parseISO(dataInicio);
  const end = parseISO(dataFim);
  const dates: Date[] = [];
  let current = start;

  while (!isAfter(current, end)) {
    dates.push(current);
    if (frequencia === "semana") {
      current = addWeeks(current, 1);
    } else if (frequencia === "quinzena") {
      current = addDays(current, 15);
    } else {
      current = addMonths(current, 1);
    }
  }
  return dates;
}

const frequenciaLabels: Record<string, string> = {
  semana: "Semanal",
  quinzena: "Quinzenal",
  mes: "Mensal",
};

function getPaymentStatus(
  dateKey: string,
  cobrancaId: string,
  pagamentosMap: Map<string, Pagamento>
): string {
  const key = `${cobrancaId}_${dateKey}`;
  const pagamento = pagamentosMap.get(key);
  if (pagamento?.status === "pago") return "pago";
  if (pagamento?.status === "isento") return "isento";

  const today = startOfDay(new Date());
  const vencimento = parseISO(dateKey);
  if (isBefore(vencimento, today)) return "pendente";
  return "a_pagar";
}

const statusConfig: Record<string, { label: string; color: string; icon: typeof CheckCircle2 }> = {
  pago: { label: "Pago", color: "bg-emerald-500/10 text-emerald-600 border-emerald-500/20", icon: CheckCircle2 },
  pendente: { label: "Pendente", color: "bg-red-500/10 text-red-600 border-red-500/20", icon: AlertCircle },
  a_pagar: { label: "A pagar", color: "bg-blue-500/10 text-blue-600 border-blue-500/20", icon: Clock },
  isento: { label: "Isento", color: "bg-amber-500/10 text-amber-600 border-amber-500/20", icon: ShieldOff },
};

const filterOptions: { value: StatusFilter; label: string }[] = [
  { value: "todos", label: "Todos" },
  { value: "a_pagar", label: "A pagar" },
  { value: "pendente", label: "Pendentes" },
  { value: "pago", label: "Pagos" },
  { value: "isento", label: "Isentos" },
];

const AgendaPage = () => {
  const { user, isAdmin, isPrimaryAdmin, isReadOnly } = useAuth();
  const [cobrancas, setCobrancas] = useState<Cobranca[]>([]);
  const [pagamentos, setPagamentos] = useState<Pagamento[]>([]);
  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [editingCobranca, setEditingCobranca] = useState<Cobranca | null>(null);
  const [saving, setSaving] = useState(false);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("todos");

  const [form, setForm] = useState({
    cliente_id: "",
    valor_parcela: "",
    frequencia: "mes",
    data_inicio: "",
    data_fim: "",
    observacoes: "",
  });

  const [editForm, setEditForm] = useState({
    valor_parcela: "",
    frequencia: "mes",
    data_inicio: "",
    data_fim: "",
    observacoes: "",
  });

  const fetchAll = useCallback(async () => {
    const [cobRes, pagRes, cliRes] = await Promise.all([
      supabase.from("cobrancas").select("*").order("data_inicio", { ascending: true }),
      supabase.from("cobranca_pagamentos").select("*"),
      supabase.from("clientes").select("id, nome").order("nome"),
    ]);
    if (cobRes.data) setCobrancas(cobRes.data as Cobranca[]);
    if (pagRes.data) setPagamentos(pagRes.data as Pagamento[]);
    if (cliRes.data) setClientes(cliRes.data);
  }, []);

  useEffect(() => {
    fetchAll();
  }, [fetchAll]);

  const pagamentosMap = useMemo(() => {
    const map = new Map<string, Pagamento>();
    pagamentos.forEach((p) => {
      map.set(`${p.cobranca_id}_${p.data_vencimento}`, p);
    });
    return map;
  }, [pagamentos]);

  const handleSave = async () => {
    if (!form.cliente_id || !form.valor_parcela || !form.data_inicio || !form.data_fim) {
      toast.error("Preencha todos os campos obrigatórios");
      return;
    }
    if (parseISO(form.data_fim) <= parseISO(form.data_inicio)) {
      toast.error("A data final deve ser posterior à data inicial");
      return;
    }

    const cliente = clientes.find((c) => c.id === form.cliente_id);
    setSaving(true);

    const { error } = await supabase.from("cobrancas").insert({
      cliente_id: form.cliente_id,
      cliente_nome: cliente?.nome || "",
      valor_parcela: parseFloat(form.valor_parcela),
      frequencia: form.frequencia,
      data_inicio: form.data_inicio,
      data_fim: form.data_fim,
      criado_por: user!.id,
      observacoes: form.observacoes || null,
    });

    setSaving(false);
    if (error) {
      toast.error("Erro ao salvar cobrança");
    } else {
      toast.success("Cobrança agendada!");
      setForm({ cliente_id: "", valor_parcela: "", frequencia: "mes", data_inicio: "", data_fim: "", observacoes: "" });
      setDialogOpen(false);
      fetchAll();
    }
  };

  const handleDelete = async (id: string) => {
    if (!isAdmin) {
      toast.error("Apenas administradores podem excluir cobranças");
      return;
    }
    const { error } = await supabase.from("cobrancas").delete().eq("id", id);
    if (error) {
      toast.error("Erro ao excluir cobrança");
    } else {
      toast.success("Cobrança removida");
      fetchAll();
    }
  };

  const handleSetPaymentStatus = async (cobrancaId: string, dateKey: string, newStatus: string) => {
    if (!isAdmin) {
      toast.error("Apenas administradores podem alterar status de pagamento");
      return;
    }

    const existing = pagamentosMap.get(`${cobrancaId}_${dateKey}`);
    if (existing) {
      const updateData: Record<string, unknown> = { status: newStatus };
      if (newStatus === "pago" || newStatus === "isento") {
        updateData.pago_por = user!.id;
        updateData.pago_em = new Date().toISOString();
      } else {
        updateData.pago_por = null;
        updateData.pago_em = null;
      }
      const { error } = await supabase
        .from("cobranca_pagamentos")
        .update(updateData)
        .eq("id", existing.id);
      if (error) {
        toast.error("Erro ao atualizar pagamento");
        return;
      }
    } else {
      const isPaidOrExempt = newStatus === "pago" || newStatus === "isento";
      const { error } = await supabase.from("cobranca_pagamentos").insert({
        cobranca_id: cobrancaId,
        data_vencimento: dateKey,
        status: newStatus,
        pago_por: isPaidOrExempt ? user!.id : null,
        pago_em: isPaidOrExempt ? new Date().toISOString() : null,
      });
      if (error) {
        toast.error("Erro ao registrar pagamento");
        return;
      }
    }

    const labels: Record<string, string> = {
      pago: "Pagamento registrado!",
      isento: "Parcela marcada como isenta!",
      a_pagar: "Status revertido para a pagar!",
    };
    toast.success(labels[newStatus] || "Status atualizado!");
    fetchAll();
  };

  const openEditDialog = (c: Cobranca) => {
    setEditingCobranca(c);
    setEditForm({
      valor_parcela: String(c.valor_parcela),
      frequencia: c.frequencia,
      data_inicio: c.data_inicio,
      data_fim: c.data_fim,
      observacoes: c.observacoes || "",
    });
    setEditDialogOpen(true);
  };

  const handleEditSave = async () => {
    if (!editingCobranca) return;
    if (!editForm.valor_parcela || !editForm.data_inicio || !editForm.data_fim) {
      toast.error("Preencha todos os campos obrigatórios");
      return;
    }
    if (parseISO(editForm.data_fim) <= parseISO(editForm.data_inicio)) {
      toast.error("A data final deve ser posterior à data inicial");
      return;
    }

    setSaving(true);
    const { error } = await supabase
      .from("cobrancas")
      .update({
        valor_parcela: parseFloat(editForm.valor_parcela),
        frequencia: editForm.frequencia,
        data_inicio: editForm.data_inicio,
        data_fim: editForm.data_fim,
        observacoes: editForm.observacoes || null,
      })
      .eq("id", editingCobranca.id);

    setSaving(false);
    if (error) {
      toast.error("Erro ao atualizar cobrança");
    } else {
      toast.success("Cobrança atualizada!");
      setEditDialogOpen(false);
      setEditingCobranca(null);
      fetchAll();
    }
  };

  // Build date -> cobrancas map
  const dateMap = useMemo(() => {
    const map = new Map<string, Cobranca[]>();
    cobrancas.forEach((c) => {
      const dates = generatePaymentDates(c.data_inicio, c.data_fim, c.frequencia);
      dates.forEach((d) => {
        const key = format(d, "yyyy-MM-dd");
        if (!map.has(key)) map.set(key, []);
        map.get(key)!.push(c);
      });
    });
    return map;
  }, [cobrancas]);

  const daysInMonth = eachDayOfInterval({
    start: startOfMonth(currentMonth),
    end: endOfMonth(currentMonth),
  });

  const selectedDateKey = selectedDate ? format(selectedDate, "yyyy-MM-dd") : null;
  const selectedCobrancas = useMemo(() => {
    if (!selectedDateKey) return [];
    const items = dateMap.get(selectedDateKey) || [];
    if (statusFilter === "todos") return items;
    return items.filter((c) => {
      const status = getPaymentStatus(selectedDateKey, c.id, pagamentosMap);
      return status === statusFilter;
    });
  }, [selectedDateKey, dateMap, statusFilter, pagamentosMap]);

  const dayStatusMap = useMemo(() => {
    const map = new Map<string, Set<string>>();
    dateMap.forEach((cobList, key) => {
      const statuses = new Set<string>();
      cobList.forEach((c) => {
        statuses.add(getPaymentStatus(key, c.id, pagamentosMap));
      });
      map.set(key, statuses);
    });
    return map;
  }, [dateMap, pagamentosMap]);

  const startPadding = startOfMonth(currentMonth).getDay();

  const upcomingItems = useMemo(() => {
    if (statusFilter === "todos") return cobrancas.slice(0, 10);
    return cobrancas.filter((c) => {
      const dates = generatePaymentDates(c.data_inicio, c.data_fim, c.frequencia);
      return dates.some((d) => {
        const key = format(d, "yyyy-MM-dd");
        return getPaymentStatus(key, c.id, pagamentosMap) === statusFilter;
      });
    }).slice(0, 10);
  }, [cobrancas, statusFilter, pagamentosMap]);

  function getDotColor(key: string): string {
    const statuses = dayStatusMap.get(key);
    if (!statuses) return "";
    if (statuses.has("pendente")) return "bg-red-500";
    if (statuses.has("a_pagar")) return "bg-blue-500";
    if (statuses.has("isento")) return "bg-amber-500";
    return "bg-emerald-500";
  }

  return (
    <div className="page-container pb-24 md:pb-8">
      <div className="mb-6 slide-up flex items-center justify-between">
        <div>
          <h1 className="text-xl font-extrabold tracking-tight">Agenda de Cobranças</h1>
          <p className="text-sm text-muted-foreground">Calendário de pagamentos dos clientes</p>
        </div>
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button size="sm" className="gap-2">
              <Plus className="w-4 h-4" />
              Nova Cobrança
            </Button>
          </DialogTrigger>
          <DialogContent className="max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Agendar Cobrança</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 pt-2">
              <div className="space-y-2">
                <Label>Cliente *</Label>
                <Select value={form.cliente_id} onValueChange={(v) => setForm((p) => ({ ...p, cliente_id: v }))}>
                  <SelectTrigger><SelectValue placeholder="Selecione o cliente" /></SelectTrigger>
                  <SelectContent>
                    {clientes.map((c) => (
                      <SelectItem key={c.id} value={c.id}>{c.nome}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Valor da parcela (R$) *</Label>
                <Input type="number" min={0} step="0.01" placeholder="0,00" value={form.valor_parcela}
                  onChange={(e) => setForm((p) => ({ ...p, valor_parcela: e.target.value }))} />
              </div>
              <div className="space-y-2">
                <Label>Frequência *</Label>
                <Select value={form.frequencia} onValueChange={(v) => setForm((p) => ({ ...p, frequencia: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="semana">Semanal</SelectItem>
                    <SelectItem value="quinzena">Quinzenal</SelectItem>
                    <SelectItem value="mes">Mensal</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label>Data início *</Label>
                  <Input type="date" value={form.data_inicio}
                    onChange={(e) => setForm((p) => ({ ...p, data_inicio: e.target.value }))} />
                </div>
                <div className="space-y-2">
                  <Label>Data fim *</Label>
                  <Input type="date" value={form.data_fim}
                    onChange={(e) => setForm((p) => ({ ...p, data_fim: e.target.value }))} />
                </div>
              </div>
              {form.data_inicio && form.data_fim && parseISO(form.data_fim) > parseISO(form.data_inicio) && (
                <div className="rounded-lg bg-muted/50 p-3 text-sm">
                  <p className="font-medium text-foreground">
                    {generatePaymentDates(form.data_inicio, form.data_fim, form.frequencia).length} parcelas
                  </p>
                  <p className="text-muted-foreground">
                    de R$ {parseFloat(form.valor_parcela || "0").toFixed(2)} · {frequenciaLabels[form.frequencia]}
                  </p>
                </div>
              )}
              <div className="space-y-2">
                <Label>Observações</Label>
                <Textarea placeholder="Ex: Carnê referente à compra do iPhone..." value={form.observacoes}
                  onChange={(e) => setForm((p) => ({ ...p, observacoes: e.target.value }))} rows={2} />
              </div>
              <Button onClick={handleSave} disabled={saving} className="w-full">
                {saving ? "Salvando..." : "Agendar Cobrança"}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {/* Filter */}
      <div className="flex gap-2 mb-4 slide-up overflow-x-auto">
        {filterOptions.map((opt) => (
          <Button
            key={opt.value}
            variant={statusFilter === opt.value ? "default" : "outline"}
            size="sm"
            onClick={() => setStatusFilter(opt.value)}
            className="shrink-0"
          >
            {opt.label}
          </Button>
        ))}
      </div>

      {/* Calendar */}
      <Card className="slide-up delay-1 mb-4">
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <Button variant="ghost" size="icon" onClick={() => setCurrentMonth(subMonths(currentMonth, 1))}>
              <ChevronLeft className="w-4 h-4" />
            </Button>
            <CardTitle className="text-base capitalize">
              {format(currentMonth, "MMMM yyyy", { locale: ptBR })}
            </CardTitle>
            <Button variant="ghost" size="icon" onClick={() => setCurrentMonth(addMonths(currentMonth, 1))}>
              <ChevronRight className="w-4 h-4" />
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-7 text-center mb-1">
            {["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"].map((d) => (
              <div key={d} className="text-xs font-medium text-muted-foreground py-2">{d}</div>
            ))}
          </div>
          <div className="grid grid-cols-7">
            {Array.from({ length: startPadding }).map((_, i) => (
              <div key={`pad-${i}`} />
            ))}
            {daysInMonth.map((day) => {
              const key = format(day, "yyyy-MM-dd");
              const hasEvents = dayStatusMap.has(key);
              const isSelected = selectedDate && isSameDay(day, selectedDate);
              const isToday = isSameDay(day, new Date());
              const dotColor = getDotColor(key);

              return (
                <button
                  key={key}
                  onClick={() => setSelectedDate(day)}
                  className={cn(
                    "relative flex flex-col items-center justify-center py-2 rounded-lg text-sm transition-colors",
                    isSelected
                      ? "bg-primary text-primary-foreground"
                      : isToday
                      ? "bg-accent text-accent-foreground font-semibold"
                      : "hover:bg-secondary"
                  )}
                >
                  {day.getDate()}
                  {hasEvents && (
                    <span
                      className={cn(
                        "absolute bottom-0.5 w-1.5 h-1.5 rounded-full",
                        isSelected ? "bg-primary-foreground" : dotColor
                      )}
                    />
                  )}
                </button>
              );
            })}
          </div>

          {/* Legend */}
          <div className="flex items-center gap-3 mt-3 pt-3 border-t text-xs text-muted-foreground flex-wrap">
            <div className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-emerald-500" /> Pago</div>
            <div className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-blue-500" /> A pagar</div>
            <div className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-red-500" /> Pendente</div>
            <div className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-amber-500" /> Isento</div>
          </div>
        </CardContent>
      </Card>

      {/* Selected day details */}
      {selectedDate && (
        <div className="space-y-3 slide-up delay-2">
          <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
            {format(selectedDate, "dd 'de' MMMM", { locale: ptBR })}
            {selectedCobrancas.length > 0 && (
              <Badge variant="secondary" className="ml-2 text-xs">
                {selectedCobrancas.length} cobrança{selectedCobrancas.length > 1 ? "s" : ""}
              </Badge>
            )}
          </h2>

          {selectedCobrancas.length === 0 ? (
            <Card>
              <CardContent className="py-8 text-center text-muted-foreground">
                <CalendarDays className="w-10 h-10 mx-auto mb-2 opacity-30" />
                <p className="text-sm">Nenhuma cobrança neste dia</p>
              </CardContent>
            </Card>
          ) : (
            selectedCobrancas.map((c) => {
              const status = getPaymentStatus(selectedDateKey!, c.id, pagamentosMap);
              const config = statusConfig[status];
              const StatusIcon = config.icon;
              const isPaidOrExempt = status === "pago" || status === "isento";

              return (
                <Card key={c.id} className={cn("border", isPaidOrExempt && "opacity-75")}>
                  <CardContent className="py-4 space-y-2">
                    <div className="flex items-start justify-between">
                      <div className="flex items-center gap-2">
                        <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center">
                          <User className="w-4 h-4 text-primary" />
                        </div>
                        <div>
                          <p className="text-sm font-semibold">{c.cliente_nome}</p>
                          <div className="flex items-center gap-3 text-xs text-muted-foreground">
                            <span className="flex items-center gap-1">
                              <DollarSign className="w-3 h-3" />
                              R$ {Number(c.valor_parcela).toFixed(2)}
                            </span>
                            <span className="flex items-center gap-1">
                              <Clock className="w-3 h-3" />
                              {frequenciaLabels[c.frequencia]}
                            </span>
                          </div>
                        </div>
                      </div>
                      <Badge variant="outline" className={cn("text-xs border", config.color)}>
                        <StatusIcon className="w-3 h-3 mr-1" />
                        {config.label}
                      </Badge>
                    </div>

                    <div className="text-xs text-muted-foreground pl-10">
                      De {format(parseISO(c.data_inicio), "dd/MM/yyyy")} até{" "}
                      {format(parseISO(c.data_fim), "dd/MM/yyyy")}
                      {" · "}
                      {generatePaymentDates(c.data_inicio, c.data_fim, c.frequencia).length} parcelas
                    </div>
                    {c.observacoes && (
                      <p className="text-xs text-muted-foreground pl-10 italic">{c.observacoes}</p>
                    )}

                    {/* Actions */}
                    <div className="flex items-center gap-2 pl-10 pt-1 flex-wrap">
                      {isAdmin && !isPaidOrExempt && (
                        <>
                          <Button
                            variant="outline"
                            size="sm"
                            className="text-xs h-7 gap-1 text-emerald-600 border-emerald-500/30 hover:bg-emerald-500/10"
                            onClick={() => handleSetPaymentStatus(c.id, selectedDateKey!, "pago")}
                          >
                            <CheckCircle2 className="w-3 h-3" />
                            Pago
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            className="text-xs h-7 gap-1 text-amber-600 border-amber-500/30 hover:bg-amber-500/10"
                            onClick={() => handleSetPaymentStatus(c.id, selectedDateKey!, "isento")}
                          >
                            <ShieldOff className="w-3 h-3" />
                            Isentar
                          </Button>
                        </>
                      )}
                      {isAdmin && isPaidOrExempt && (
                        <Button
                          variant="outline"
                          size="sm"
                          className="text-xs h-7 gap-1 text-blue-600 border-blue-500/30 hover:bg-blue-500/10"
                          onClick={() => handleSetPaymentStatus(c.id, selectedDateKey!, "a_pagar")}
                        >
                          <Undo2 className="w-3 h-3" />
                          Desfazer
                        </Button>
                      )}
                      {isAdmin && (
                        <>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="text-xs h-7 gap-1 text-foreground"
                            onClick={() => openEditDialog(c)}
                          >
                            <Pencil className="w-3 h-3" />
                            Editar
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="text-xs h-7 gap-1 text-destructive hover:text-destructive"
                            onClick={() => handleDelete(c.id)}
                          >
                            <Trash2 className="w-3 h-3" />
                            Excluir
                          </Button>
                        </>
                      )}
                    </div>
                  </CardContent>
                </Card>
              );
            })
          )}
        </div>
      )}

      {/* Upcoming list */}
      {!selectedDate && (
        <div className="space-y-3 slide-up delay-2">
          <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
            Próximas cobranças
          </h2>
          {upcomingItems.length === 0 ? (
            <Card>
              <CardContent className="py-8 text-center text-muted-foreground">
                <CalendarDays className="w-10 h-10 mx-auto mb-2 opacity-30" />
                <p className="text-sm">Nenhuma cobrança encontrada</p>
              </CardContent>
            </Card>
          ) : (
            upcomingItems.map((c) => (
              <Card key={c.id}>
                <CardContent className="py-3 flex items-center justify-between">
                  <div>
                    <p className="text-sm font-semibold">{c.cliente_nome}</p>
                    <p className="text-xs text-muted-foreground">
                      R$ {Number(c.valor_parcela).toFixed(2)} · {frequenciaLabels[c.frequencia]} · até{" "}
                      {format(parseISO(c.data_fim), "dd/MM/yyyy")}
                    </p>
                  </div>
                  <Badge variant="outline" className="text-xs">
                    {generatePaymentDates(c.data_inicio, c.data_fim, c.frequencia).length} parcelas
                  </Badge>
                </CardContent>
              </Card>
            ))
          )}
        </div>
      )}

      {/* Edit Dialog */}
      <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Editar Cobrança — {editingCobranca?.cliente_nome}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 pt-2">
            <div className="space-y-2">
              <Label>Valor da parcela (R$) *</Label>
              <Input type="number" min={0} step="0.01" value={editForm.valor_parcela}
                onChange={(e) => setEditForm((p) => ({ ...p, valor_parcela: e.target.value }))} />
            </div>
            <div className="space-y-2">
              <Label>Frequência *</Label>
              <Select value={editForm.frequencia} onValueChange={(v) => setEditForm((p) => ({ ...p, frequencia: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="semana">Semanal</SelectItem>
                  <SelectItem value="quinzena">Quinzenal</SelectItem>
                  <SelectItem value="mes">Mensal</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>Data início *</Label>
                <Input type="date" value={editForm.data_inicio}
                  onChange={(e) => setEditForm((p) => ({ ...p, data_inicio: e.target.value }))} />
              </div>
              <div className="space-y-2">
                <Label>Data fim *</Label>
                <Input type="date" value={editForm.data_fim}
                  onChange={(e) => setEditForm((p) => ({ ...p, data_fim: e.target.value }))} />
              </div>
            </div>
            {editForm.data_inicio && editForm.data_fim && parseISO(editForm.data_fim) > parseISO(editForm.data_inicio) && (
              <div className="rounded-lg bg-muted/50 p-3 text-sm">
                <p className="font-medium text-foreground">
                  {generatePaymentDates(editForm.data_inicio, editForm.data_fim, editForm.frequencia).length} parcelas
                </p>
                <p className="text-muted-foreground">
                  de R$ {parseFloat(editForm.valor_parcela || "0").toFixed(2)} · {frequenciaLabels[editForm.frequencia]}
                </p>
              </div>
            )}
            <div className="space-y-2">
              <Label>Observações</Label>
              <Textarea value={editForm.observacoes}
                onChange={(e) => setEditForm((p) => ({ ...p, observacoes: e.target.value }))} rows={2} />
            </div>
            <Button onClick={handleEditSave} disabled={saving} className="w-full">
              {saving ? "Salvando..." : "Salvar Alterações"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default AgendaPage;