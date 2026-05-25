import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { DollarSign, Clock, CheckCircle2, ChevronRight } from "lucide-react";
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, Legend } from "recharts";
import { format, parseISO, addWeeks, addDays, addMonths, isAfter } from "date-fns";
import RecebidosDetalhes from "./RecebidosDetalhes";
import PendentesDetalhes from "./PendentesDetalhes";
import CustomPeriodPicker from "./CustomPeriodPicker";

type Periodo = "semana" | "quinzena" | "mes" | "ano";

function generateDates(dataInicio: string, dataFim: string, frequencia: string): string[] {
  const start = parseISO(dataInicio);
  const end = parseISO(dataFim);
  const out: string[] = [];
  let cur = start;
  while (!isAfter(cur, end)) {
    out.push(format(cur, "yyyy-MM-dd"));
    if (frequencia === "semana") cur = addWeeks(cur, 1);
    else if (frequencia === "quinzena") cur = addDays(cur, 15);
    else cur = addMonths(cur, 1);
  }
  return out;
}

const periodoLabels: Record<Periodo, string> = {
  semana: "Semanal",
  quinzena: "Quinzenal",
  mes: "Mensal",
  ano: "Anual",
};

function getDateRange(periodo: Periodo): { start: string; end: string } {
  const now = new Date();
  const end = now.toISOString().split("T")[0];
  const d = new Date();
  switch (periodo) {
    case "semana":
      d.setDate(d.getDate() - 7);
      break;
    case "quinzena":
      d.setDate(d.getDate() - 15);
      break;
    case "mes":
      d.setMonth(d.getMonth() - 1);
      break;
    case "ano":
      d.setFullYear(d.getFullYear() - 1);
      break;
  }
  return { start: d.toISOString().split("T")[0], end };
}

const COLORS = ["hsl(142, 71%, 45%)", "hsl(0, 84%, 60%)"];

const CobrancaResumo = () => {
  const [periodo, setPeriodo] = useState<Periodo>("mes");
  const [custom, setCustom] = useState<{ start: string; end: string } | null>(null);
  const [recebido, setRecebido] = useState(0);
  const [pendente, setPendente] = useState(0);
  const [recebidosOpen, setRecebidosOpen] = useState(false);
  const [pendentesOpen, setPendentesOpen] = useState(false);

  const range = useMemo(() => custom ?? getDateRange(periodo), [custom, periodo]);

  useEffect(() => {
    fetchData();
  }, [range.start, range.end]);


  const fetchData = async () => {
    const { start, end } = range;

    let totalRecebido = 0;
    let totalPendente = 0;

    // 1a) Parcelas PAGAS no período — filtrar por pago_em (data real do pagamento)
    const { data: pagosPeriodo } = await supabase
      .from("cobranca_pagamentos")
      .select("cobranca_id, pago_em")
      .eq("status", "pago")
      .gte("pago_em", `${start}T00:00:00`)
      .lte("pago_em", `${end}T23:59:59`);

    // 1b) PENDENTES = parcelas virtuais com vencimento < hoje, dentro do período,
    //     e que NÃO estejam pagas/isentas. Igual à lógica da agenda.
    const today = format(new Date(), "yyyy-MM-dd");
    const { data: allCobrancas } = await supabase
      .from("cobrancas")
      .select("id, cliente_nome, valor_parcela, data_inicio, data_fim, frequencia, observacoes");
    const { data: allPagamentos } = await supabase
      .from("cobranca_pagamentos")
      .select("cobranca_id, data_vencimento, status");

    const pagMap = new Map<string, string>();
    (allPagamentos || []).forEach((p) => {
      pagMap.set(`${p.cobranca_id}_${p.data_vencimento}`, p.status);
    });

    const entradaByClient = new Map<string, any>();
    (allCobrancas || []).forEach((c: any) => {
      if (c.observacoes?.toLowerCase().startsWith("entrada")) {
        entradaByClient.set(c.cliente_nome.trim().toUpperCase(), c);
      }
    });
    const merged = (allCobrancas || []).filter((c: any) => {
      if (!c.observacoes?.toLowerCase().startsWith("entrada")) return true;
      const key = c.cliente_nome.trim().toUpperCase();
      return !(allCobrancas || []).some(
        (o: any) => o.id !== c.id && o.cliente_nome.trim().toUpperCase() === key && !o.observacoes?.toLowerCase().startsWith("entrada")
      );
    });

    merged.forEach((c: any) => {
      const dates = generateDates(c.data_inicio, c.data_fim, c.frequencia);
      const clientKey = c.cliente_nome.trim().toUpperCase();
      const entrada = entradaByClient.get(clientKey);
      let entradaDate: string | null = null;
      if (entrada && !c.observacoes?.toLowerCase().startsWith("entrada")) {
        entradaDate = format(parseISO(entrada.data_inicio), "yyyy-MM-dd");
        if (!dates.includes(entradaDate)) dates.unshift(entradaDate);
      }
      dates.forEach((d) => {
        if (d >= today) return; // só atrasado conta como pendente
        if (d < start || d > end) return; // filtro do período
        const statusCobId = entradaDate && d === entradaDate ? entrada.id : c.id;
        const st = pagMap.get(`${statusCobId}_${d}`);
        if (st === "pago" || st === "isento") return;
        const valor = entradaDate && d === entradaDate ? Number(entrada.valor_parcela) : Number(c.valor_parcela);
        totalPendente += valor;
      });
    });

    // RECEBIDOS — parcelas pagas no período (por pago_em)
    const { data: pagosPeriodo } = await supabase
      .from("cobranca_pagamentos")
      .select("cobranca_id, pago_em")
      .eq("status", "pago")
      .gte("pago_em", `${start}T00:00:00`)
      .lte("pago_em", `${end}T23:59:59`);

    if (pagosPeriodo && pagosPeriodo.length > 0) {
      const valorMap = new Map<string, number>();
      (allCobrancas || []).forEach((c: any) => valorMap.set(c.id, Number(c.valor_parcela)));
      pagosPeriodo.forEach((p) => {
        totalRecebido += valorMap.get(p.cobranca_id) || 0;
      });
    }

    // Entradas de venda no período (deduplicadas)
    const { data: vendas } = await supabase
      .from("vendas")
      .select("id, cliente_nome, valor_entrada, created_at, data_entrada")
      .eq("status", "concluida");

    const entradaTracked = new Set<string>();
    const { data: pagosEntrada } = await supabase
      .from("cobranca_pagamentos")
      .select("cobranca_id, data_vencimento")
      .eq("tipo_pagamento", "entrada")
      .eq("status", "pago");

    if (pagosEntrada && pagosEntrada.length > 0) {
      const nomeMap = new Map<string, string>();
      (allCobrancas || []).forEach((c: any) => nomeMap.set(c.id, c.cliente_nome.trim().toUpperCase()));
      pagosEntrada.forEach((p) => {
        const nome = nomeMap.get(p.cobranca_id);
        if (nome) entradaTracked.add(`${nome}_${p.data_vencimento}`);
      });
    }

    if (vendas) {
      vendas.forEach((v) => {
        const entrada = Number(v.valor_entrada) || 0;
        if (entrada <= 0) return;
        const dataEntrada = (v as any).data_entrada || v.created_at?.split("T")[0] || "";
        if (dataEntrada >= start && dataEntrada <= end) {
          const dedupKey = `${v.cliente_nome.trim().toUpperCase()}_${dataEntrada}`;
          if (!entradaTracked.has(dedupKey)) {
            totalRecebido += entrada;
            entradaTracked.add(dedupKey);
          }
        }
      });
    }

    setRecebido(totalRecebido);
    setPendente(totalPendente);
  };

  const pieData = [
    { name: "Recebido", value: recebido },
    { name: "Pendente", value: pendente },
  ].filter((d) => d.value > 0);

  const total = recebido + pendente;

  return (
    <>
    <Card className="slide-up delay-5">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base flex items-center gap-2">
            <DollarSign className="w-4 h-4 text-primary" />
            Cobranças
          </CardTitle>
        </div>
        <div className="flex gap-1.5 mt-2 flex-wrap items-center">
          {(Object.keys(periodoLabels) as Periodo[]).map((p) => (
            <button
              key={p}
              onClick={() => { setCustom(null); setPeriodo(p); }}
              className={`px-2.5 py-1 rounded-full text-xs font-medium transition-colors ${
                !custom && periodo === p
                  ? "bg-primary text-primary-foreground"
                  : "bg-muted text-muted-foreground hover:bg-muted/80"
              }`}
            >
              {periodoLabels[p]}
            </button>
          ))}
          <CustomPeriodPicker
            start={range.start}
            end={range.end}
            active={!!custom}
            onChange={(s, e) => setCustom({ start: s, end: e })}
            onClear={() => setCustom(null)}
          />
        </div>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-1 gap-3 mb-4 sm:grid-cols-2">
          <button onClick={() => setRecebidosOpen(true)} className="flex min-w-0 items-center gap-2 rounded-lg bg-primary/10 p-3 text-left transition-colors hover:bg-primary/20 cursor-pointer w-full">
            <CheckCircle2 className="w-5 h-5 text-primary shrink-0" />
            <div className="min-w-0 flex-1">
              <p className="text-[10px] text-muted-foreground">Recebido</p>
              <p className="truncate text-sm font-bold tabular-nums text-primary">
                {recebido.toLocaleString("pt-BR", { style: "currency", currency: "BRL", minimumFractionDigits: 2 })}
              </p>
            </div>
            <ChevronRight className="w-4 h-4 text-primary/50 shrink-0" />
          </button>
          <button onClick={() => setPendentesOpen(true)} className="flex min-w-0 items-center gap-2 rounded-lg bg-destructive/10 p-3 text-left transition-colors hover:bg-destructive/20 cursor-pointer w-full">
            <Clock className="w-5 h-5 text-destructive shrink-0" />
            <div className="min-w-0 flex-1">
              <p className="text-[10px] text-muted-foreground">Pendente</p>
              <p className="truncate text-sm font-bold tabular-nums text-destructive">
                {pendente.toLocaleString("pt-BR", { style: "currency", currency: "BRL", minimumFractionDigits: 2 })}
              </p>
            </div>
            <ChevronRight className="w-4 h-4 text-destructive/50 shrink-0" />
          </button>
        </div>

        {total > 0 ? (
          <div className="h-48">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={pieData}
                  cx="50%"
                  cy="50%"
                  innerRadius={45}
                  outerRadius={70}
                  paddingAngle={4}
                  dataKey="value"
                  stroke="none"
                >
                  {pieData.map((_, index) => (
                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip
                  contentStyle={{
                    background: "hsl(var(--card))",
                    border: "1px solid hsl(var(--border))",
                    borderRadius: "8px",
                    fontSize: 13,
                  }}
                  formatter={(value: number) => [
                    `${value.toLocaleString("pt-BR", { style: "currency", currency: "BRL", minimumFractionDigits: 2 })}`,
                  ]}
                />
                <Legend
                  formatter={(value) => (
                    <span className="text-xs text-foreground">{value}</span>
                  )}
                />
              </PieChart>
            </ResponsiveContainer>
          </div>
        ) : (
          <p className="text-center text-sm text-muted-foreground py-8">
            Nenhuma cobrança neste período
          </p>
        )}
      </CardContent>
    </Card>

    <RecebidosDetalhes
      open={recebidosOpen}
      onOpenChange={setRecebidosOpen}
      start={range.start}
      end={range.end}
    />
    <PendentesDetalhes
      open={pendentesOpen}
      onOpenChange={setPendentesOpen}
    />
    </>
  );
};

export default CobrancaResumo;
