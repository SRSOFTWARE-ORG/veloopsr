import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { DollarSign, Clock, CheckCircle2 } from "lucide-react";
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, Legend } from "recharts";

type Periodo = "semana" | "quinzena" | "mes" | "ano";

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
  const [recebido, setRecebido] = useState(0);
  const [pendente, setPendente] = useState(0);

  useEffect(() => {
    fetchData();
  }, [periodo]);

  const fetchData = async () => {
    const { start, end } = getDateRange(periodo);

    // 1) Cobranças da agenda (cobranca_pagamentos)
    const { data: pagamentos } = await supabase
      .from("cobranca_pagamentos")
      .select("status, cobranca_id, data_vencimento")
      .gte("data_vencimento", start)
      .lte("data_vencimento", end);

    let totalRecebido = 0;
    let totalPendente = 0;

    if (pagamentos && pagamentos.length > 0) {
      const cobrancaIds = [...new Set(pagamentos.map((p) => p.cobranca_id))];
      const { data: cobrancas } = await supabase
        .from("cobrancas")
        .select("id, valor_parcela")
        .in("id", cobrancaIds);

      const valorMap: Record<string, number> = {};
      cobrancas?.forEach((c) => {
        valorMap[c.id] = Number(c.valor_parcela);
      });

      pagamentos.forEach((p) => {
        const valor = valorMap[p.cobranca_id] || 0;
        if (p.status === "pago") {
          totalRecebido += valor;
        } else if (p.status === "isento") {
          // Isento não conta
        } else {
          totalPendente += valor;
        }
      });
    }

    // 2) Vendas concluídas — apenas entradas (valor_entrada)
    // Parcelas de vendas já são rastreadas via cobranca_pagamentos na agenda,
    // então NÃO projetamos parcelas aqui para evitar duplicação.
    const { data: vendas } = await supabase
      .from("vendas")
      .select("valor_entrada, created_at")
      .eq("status", "concluida");

    if (vendas) {
      vendas.forEach((v) => {
        const vendaDate = v.created_at?.split("T")[0] || "";
        const entrada = Number(v.valor_entrada) || 0;
        if (entrada > 0 && vendaDate >= start && vendaDate <= end) {
          totalRecebido += entrada;
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
    <Card className="slide-up delay-5">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base flex items-center gap-2">
            <DollarSign className="w-4 h-4 text-primary" />
            Cobranças
          </CardTitle>
        </div>
        <div className="flex gap-1.5 mt-2 flex-wrap">
          {(Object.keys(periodoLabels) as Periodo[]).map((p) => (
            <button
              key={p}
              onClick={() => setPeriodo(p)}
              className={`px-2.5 py-1 rounded-full text-xs font-medium transition-colors ${
                periodo === p
                  ? "bg-primary text-primary-foreground"
                  : "bg-muted text-muted-foreground hover:bg-muted/80"
              }`}
            >
              {periodoLabels[p]}
            </button>
          ))}
        </div>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-1 gap-3 mb-4 sm:grid-cols-2">
          <div className="flex min-w-0 items-center gap-2 rounded-lg bg-primary/10 p-3">
            <CheckCircle2 className="w-5 h-5 text-primary shrink-0" />
            <div className="min-w-0">
              <p className="text-[10px] text-muted-foreground">Recebido</p>
              <p className="truncate text-sm font-bold tabular-nums text-primary">
                R$ {recebido.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
              </p>
            </div>
          </div>
          <div className="flex min-w-0 items-center gap-2 rounded-lg bg-destructive/10 p-3">
            <Clock className="w-5 h-5 text-destructive shrink-0" />
            <div className="min-w-0">
              <p className="text-[10px] text-muted-foreground">Pendente</p>
              <p className="truncate text-sm font-bold tabular-nums text-destructive">
                R$ {pendente.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
              </p>
            </div>
          </div>
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
                    `R$ ${value.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`,
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
  );
};

export default CobrancaResumo;
