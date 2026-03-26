import { useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { TrendingUp } from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import { supabase } from "@/integrations/supabase/client";

type Periodo = "semana" | "quinzena" | "mes" | "ano";

type ChartPoint = {
  dia: string;
  vendas: number;
};

const periodoLabels: Record<Periodo, string> = {
  semana: "Semanal",
  quinzena: "Quinzenal",
  mes: "Mensal",
  ano: "Anual",
};

const SalesChartCard = () => {
  const [chartPeriodo, setChartPeriodo] = useState<Periodo>("semana");
  const [chartData, setChartData] = useState<ChartPoint[]>([]);

  useEffect(() => {
    void fetchChartData(chartPeriodo);
  }, [chartPeriodo]);

  const fetchChartData = async (periodo: Periodo) => {
    const numDays = periodo === "semana" ? 7 : periodo === "quinzena" ? 15 : periodo === "mes" ? 30 : 365;
    const days: string[] = [];

    for (let i = numDays - 1; i >= 0; i -= 1) {
      const date = new Date();
      date.setDate(date.getDate() - i);
      days.push(date.toISOString().split("T")[0]);
    }

    const { data } = await supabase
      .from("vendas")
      .select("valor_total, created_at")
      .eq("status", "concluida")
      .gte("created_at", days[0]);

    if (periodo === "ano") {
      const months: Record<string, number> = {};

      data?.forEach((venda) => {
        const month = venda.created_at?.substring(0, 7) || "";
        months[month] = (months[month] || 0) + Number(venda.valor_total);
      });

      const sortedMonths = Object.keys(months).sort();
      setChartData(
        sortedMonths.map((month) => ({
          dia: new Date(`${month}-15`).toLocaleDateString("pt-BR", { month: "short" }),
          vendas: months[month],
        })),
      );
      return;
    }

    const mappedData = days.map((day) => {
      const dia =
        periodo === "mes" || periodo === "quinzena"
          ? new Date(`${day}T12:00:00`).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" })
          : new Date(`${day}T12:00:00`).toLocaleDateString("pt-BR", { weekday: "short" });

      const vendas =
        data
          ?.filter((venda) => venda.created_at?.startsWith(day))
          .reduce((sum, venda) => sum + Number(venda.valor_total), 0) || 0;

      return { dia, vendas };
    });

    setChartData(mappedData);
  };

  const totalPeriodo = useMemo(
    () => chartData.reduce((sum, item) => sum + (item.vendas || 0), 0),
    [chartData],
  );

  return (
    <Card className="mb-6 slide-up delay-6">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2 text-base">
            <TrendingUp className="w-4 h-4 text-primary" />
            Vendas
          </CardTitle>
        </div>
        <div className="mt-2 flex flex-wrap gap-1.5">
          {(Object.keys(periodoLabels) as Periodo[]).map((periodo) => (
            <button
              key={periodo}
              onClick={() => setChartPeriodo(periodo)}
              className={`px-2.5 py-1 rounded-full text-xs font-medium transition-colors ${
                chartPeriodo === periodo
                  ? "bg-primary text-primary-foreground"
                  : "bg-muted text-muted-foreground hover:bg-muted/80"
              }`}
            >
              {periodoLabels[periodo]}
            </button>
          ))}
        </div>
      </CardHeader>
      <CardContent>
        <div className="mb-3 flex items-center justify-between rounded-lg bg-primary/10 p-3">
          <span className="text-xs font-medium text-muted-foreground">Total do período</span>
          <span className="text-sm font-extrabold tabular-nums text-primary">
            {totalPeriodo.toLocaleString("pt-BR", { style: "currency", currency: "BRL", minimumFractionDigits: 2 })}
          </span>
        </div>
        <div className="h-48">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
              <XAxis dataKey="dia" tick={{ fontSize: 12 }} stroke="hsl(var(--muted-foreground))" />
              <YAxis tick={{ fontSize: 12 }} stroke="hsl(var(--muted-foreground))" />
              <Tooltip
                contentStyle={{
                  background: "hsl(var(--card))",
                  border: "1px solid hsl(var(--border))",
                  borderRadius: "8px",
                  fontSize: 13,
                }}
                formatter={(value: number) => [`R$ ${value.toLocaleString("pt-BR")}`, "Vendas"]}
              />
              <Bar dataKey="vendas" fill="hsl(var(--primary))" radius={[6, 6, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  );
};

export default SalesChartCard;
