import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import {
  DollarSign,
  ShoppingCart,
  AlertTriangle,
  FileText,
  Plus,
  Upload,
  Search,
  TrendingUp,
  User,
  Clock,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useNavigate } from "react-router-dom";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";

const frequenciaLabels: Record<string, string> = {
  semana: "Semanal",
  quinzena: "Quinzenal",
  mes: "Mensal",
};

const Dashboard = () => {
  const { isAdmin, profile, role } = useAuth();
  const navigate = useNavigate();
  const [stats, setStats] = useState({
    vendasHoje: 0,
    simulacoes: 0,
    estoqueCritico: 0,
    vendasConcluidas: 0,
  });
  const [chartData, setChartData] = useState<any[]>([]);
  const [recentVendas, setRecentVendas] = useState<any[]>([]);

  useEffect(() => {
    fetchStats();
    fetchChartData();
    if (isAdmin) fetchRecentVendas();
  }, [isAdmin]);

  const fetchStats = async () => {
    const today = new Date().toISOString().split("T")[0];

    const [vendasRes, simRes, estoqueRes, concluidasRes] = await Promise.all([
      supabase.from("vendas").select("valor_total").eq("status", "concluida").gte("created_at", today),
      supabase.from("vendas").select("id", { count: "exact" }).eq("status", "simulacao"),
      supabase.from("produtos").select("id", { count: "exact" }).lt("estoque_atual", 5),
      supabase.from("vendas").select("id", { count: "exact" }).eq("status", "concluida"),
    ]);

    setStats({
      vendasHoje: vendasRes.data?.reduce((sum, v) => sum + Number(v.valor_total), 0) || 0,
      simulacoes: simRes.count || 0,
      estoqueCritico: estoqueRes.count || 0,
      vendasConcluidas: concluidasRes.count || 0,
    });
  };

  const fetchChartData = async () => {
    const days = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      days.push(d.toISOString().split("T")[0]);
    }

    const { data } = await supabase
      .from("vendas")
      .select("valor_total, created_at")
      .eq("status", "concluida")
      .gte("created_at", days[0]);

    const mapped = days.map((day) => {
      const dayName = new Date(day + "T12:00:00").toLocaleDateString("pt-BR", { weekday: "short" });
      const total = data
        ?.filter((v) => v.created_at?.startsWith(day))
        .reduce((sum, v) => sum + Number(v.valor_total), 0) || 0;
      return { dia: dayName, vendas: total };
    });

    setChartData(mapped);
  };

  const fetchRecentVendas = async () => {
    const { data } = await supabase
      .from("vendas")
      .select("*")
      .eq("status", "concluida")
      .order("created_at", { ascending: false })
      .limit(10);
    setRecentVendas(data || []);
  };

  const statCards = [
    {
      label: "Vendas Hoje",
      value: `R$ ${stats.vendasHoje.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`,
      icon: DollarSign,
      color: "text-primary",
      bg: "bg-primary/10",
    },
    {
      label: "Simulações Ativas",
      value: stats.simulacoes.toString(),
      icon: ShoppingCart,
      color: "text-blue-600",
      bg: "bg-blue-500/10",
    },
    {
      label: "Estoque Crítico",
      value: stats.estoqueCritico.toString(),
      icon: AlertTriangle,
      color: stats.estoqueCritico > 0 ? "text-destructive" : "text-primary",
      bg: stats.estoqueCritico > 0 ? "bg-destructive/10" : "bg-primary/10",
    },
    {
      label: isAdmin ? "Vendas Concluídas" : "Docs Pendentes",
      value: isAdmin ? stats.vendasConcluidas.toString() : "—",
      icon: isAdmin ? FileText : FileText,
      color: "text-primary",
      bg: "bg-primary/10",
    },
  ];

  return (
    <div className="page-container pb-24 md:pb-8">
      <div className="mb-6 slide-up">
        <h1 className="text-2xl font-extrabold tracking-tight">
          Olá, {profile?.nome?.split(" ")[0] || "Usuário"} 👋
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          {isAdmin ? "Painel administrativo — todas as vendas dos vendedores" : "Resumo das suas vendas de hoje"}
        </p>
      </div>

      {/* Stat Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        {statCards.map((stat, i) => (
          <div key={stat.label} className={`stat-card slide-up delay-${i + 1}`}>
            <div className="flex items-center justify-between mb-3">
              <div className={`w-9 h-9 rounded-lg ${stat.bg} flex items-center justify-center`}>
                <stat.icon className={`w-5 h-5 ${stat.color}`} />
              </div>
            </div>
            <p className="text-xl font-extrabold tabular-nums">{stat.value}</p>
            <p className="text-xs text-muted-foreground mt-0.5">{stat.label}</p>
          </div>
        ))}
      </div>

      {/* Quick Actions */}
      <div className="mb-6 slide-up delay-5">
        <h2 className="section-title mb-3">Ações Rápidas</h2>
        <div className="grid grid-cols-3 gap-3">
          <button onClick={() => navigate("/vendas")} className="quick-action-btn">
            <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
              <Plus className="w-5 h-5 text-primary" />
            </div>
            <span>Nova Venda</span>
          </button>
          <button onClick={() => navigate("/documentos")} className="quick-action-btn">
            <div className="w-10 h-10 rounded-xl bg-yellow-500/10 flex items-center justify-center">
              <Upload className="w-5 h-5 text-yellow-600" />
            </div>
            <span>Upload Nota</span>
          </button>
          <button onClick={() => navigate("/produtos")} className="quick-action-btn">
            <div className="w-10 h-10 rounded-xl bg-blue-500/10 flex items-center justify-center">
              <Search className="w-5 h-5 text-blue-600" />
            </div>
            <span>Consultar</span>
          </button>
        </div>
      </div>

      {/* Chart */}
      <Card className="mb-6 slide-up delay-6">
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-base">
            <TrendingUp className="w-4 h-4 text-primary" />
            Vendas da Semana
          </CardTitle>
        </CardHeader>
        <CardContent>
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

      {/* Admin: Recent completed sales from all vendors */}
      {isAdmin && recentVendas.length > 0 && (
        <div className="slide-up delay-6">
          <h2 className="section-title mb-3">Vendas Concluídas (Todos Vendedores)</h2>
          <div className="space-y-2">
            {recentVendas.map((v) => (
              <Card key={v.id}>
                <CardContent className="p-4 flex items-center gap-3">
                  <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                    <ShoppingCart className="w-5 h-5 text-primary" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-sm truncate">{v.cliente_nome}</p>
                    <div className="flex items-center gap-2 flex-wrap mt-0.5">
                      <span className="text-xs font-bold tabular-nums">
                        R$ {Number(v.valor_total).toFixed(2)}
                      </span>
                      {(v.num_parcelas || 0) > 1 && (
                        <span className="text-xs text-muted-foreground">
                          {v.num_parcelas}x R$ {Number(v.valor_parcela).toFixed(2)}
                          {v.frequencia_parcela && ` · ${frequenciaLabels[v.frequencia_parcela] || ""}`}
                        </span>
                      )}
                      {v.forma_pagamento === "avista" && (
                        <Badge variant="outline" className="text-[10px]">À Vista</Badge>
                      )}
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-[10px] text-muted-foreground">
                      {new Date(v.created_at).toLocaleDateString("pt-BR")}
                    </p>
                    <p className="text-[10px] text-muted-foreground">
                      {new Date(v.created_at).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}
                    </p>
                  </div>
                </CardContent>
              </Card>
            ))}
            <Button variant="outline" className="w-full" onClick={() => navigate("/vendas")}>
              Ver todas as vendas
            </Button>
          </div>
        </div>
      )}
    </div>
  );
};

export default Dashboard;
