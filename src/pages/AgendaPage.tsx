import { useEffect, useState, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Calendar } from "@/components/ui/calendar";
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
  isSameMonth,
  addMonths,
  subMonths,
  addWeeks,
  addDays,
  isAfter,
  isBefore,
  parseISO,
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

interface Cliente {
  id: string;
  nome: string;
}

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

const AgendaPage = () => {
  const { user, isAdmin } = useAuth();
  const [cobrancas, setCobrancas] = useState<Cobranca[]>([]);
  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  const [form, setForm] = useState({
    cliente_id: "",
    valor_parcela: "",
    frequencia: "mes",
    data_inicio: "",
    data_fim: "",
    observacoes: "",
  });

  useEffect(() => {
    fetchCobrancas();
    fetchClientes();
  }, []);

  const fetchCobrancas = async () => {
    const { data } = await supabase
      .from("cobrancas")
      .select("*")
      .order("data_inicio", { ascending: true });
    if (data) setCobrancas(data as Cobranca[]);
  };

  const fetchClientes = async () => {
    const { data } = await supabase
      .from("clientes")
      .select("id, nome")
      .order("nome");
    if (data) setClientes(data);
  };

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
      fetchCobrancas();
    }
  };

  const handleDelete = async (id: string) => {
    const { error } = await supabase.from("cobrancas").delete().eq("id", id);
    if (error) {
      toast.error("Erro ao excluir cobrança");
    } else {
      toast.success("Cobrança removida");
      fetchCobrancas();
    }
  };

  // Build a map of dates -> cobrancas for the calendar
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
  const selectedCobrancas = selectedDateKey ? dateMap.get(selectedDateKey) || [] : [];

  // Days with markers
  const markedDays = useMemo(() => {
    const set = new Set<string>();
    dateMap.forEach((_, key) => set.add(key));
    return set;
  }, [dateMap]);

  const startPadding = startOfMonth(currentMonth).getDay();

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
                <Select
                  value={form.cliente_id}
                  onValueChange={(v) => setForm((p) => ({ ...p, cliente_id: v }))}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione o cliente" />
                  </SelectTrigger>
                  <SelectContent>
                    {clientes.map((c) => (
                      <SelectItem key={c.id} value={c.id}>
                        {c.nome}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>Valor da parcela (R$) *</Label>
                <Input
                  type="number"
                  min={0}
                  step="0.01"
                  placeholder="0,00"
                  value={form.valor_parcela}
                  onChange={(e) => setForm((p) => ({ ...p, valor_parcela: e.target.value }))}
                />
              </div>

              <div className="space-y-2">
                <Label>Frequência *</Label>
                <Select
                  value={form.frequencia}
                  onValueChange={(v) => setForm((p) => ({ ...p, frequencia: v }))}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
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
                  <Input
                    type="date"
                    value={form.data_inicio}
                    onChange={(e) => setForm((p) => ({ ...p, data_inicio: e.target.value }))}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Data fim *</Label>
                  <Input
                    type="date"
                    value={form.data_fim}
                    onChange={(e) => setForm((p) => ({ ...p, data_fim: e.target.value }))}
                  />
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
                <Textarea
                  placeholder="Ex: Carnê referente à compra do iPhone..."
                  value={form.observacoes}
                  onChange={(e) => setForm((p) => ({ ...p, observacoes: e.target.value }))}
                  rows={2}
                />
              </div>

              <Button onClick={handleSave} disabled={saving} className="w-full">
                {saving ? "Salvando..." : "Agendar Cobrança"}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {/* Calendar */}
      <Card className="slide-up delay-1 mb-4">
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setCurrentMonth(subMonths(currentMonth, 1))}
            >
              <ChevronLeft className="w-4 h-4" />
            </Button>
            <CardTitle className="text-base capitalize">
              {format(currentMonth, "MMMM yyyy", { locale: ptBR })}
            </CardTitle>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setCurrentMonth(addMonths(currentMonth, 1))}
            >
              <ChevronRight className="w-4 h-4" />
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-7 text-center mb-1">
            {["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"].map((d) => (
              <div key={d} className="text-xs font-medium text-muted-foreground py-2">
                {d}
              </div>
            ))}
          </div>
          <div className="grid grid-cols-7">
            {Array.from({ length: startPadding }).map((_, i) => (
              <div key={`pad-${i}`} />
            ))}
            {daysInMonth.map((day) => {
              const key = format(day, "yyyy-MM-dd");
              const hasEvents = markedDays.has(key);
              const isSelected = selectedDate && isSameDay(day, selectedDate);
              const isToday = isSameDay(day, new Date());

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
                        isSelected ? "bg-primary-foreground" : "bg-primary"
                      )}
                    />
                  )}
                </button>
              );
            })}
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
            selectedCobrancas.map((c) => (
              <Card key={c.id}>
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
                    {isAdmin && (
                      <Button
                        variant="ghost"
                        size="icon"
                        className="text-destructive hover:text-destructive h-8 w-8"
                        onClick={() => handleDelete(c.id)}
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    )}
                  </div>
                  <div className="text-xs text-muted-foreground pl-10">
                    De {format(parseISO(c.data_inicio), "dd/MM/yyyy")} até{" "}
                    {format(parseISO(c.data_fim), "dd/MM/yyyy")}
                    {" · "}
                    {generatePaymentDates(c.data_inicio, c.data_fim, c.frequencia).length} parcelas
                  </div>
                  {c.observacoes && (
                    <p className="text-xs text-muted-foreground pl-10 italic">
                      {c.observacoes}
                    </p>
                  )}
                </CardContent>
              </Card>
            ))
          )}
        </div>
      )}

      {/* Upcoming list */}
      {!selectedDate && (
        <div className="space-y-3 slide-up delay-2">
          <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
            Próximas cobranças
          </h2>
          {cobrancas.length === 0 ? (
            <Card>
              <CardContent className="py-8 text-center text-muted-foreground">
                <CalendarDays className="w-10 h-10 mx-auto mb-2 opacity-30" />
                <p className="text-sm">Nenhuma cobrança cadastrada</p>
              </CardContent>
            </Card>
          ) : (
            cobrancas.slice(0, 10).map((c) => (
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
    </div>
  );
};

export default AgendaPage;
