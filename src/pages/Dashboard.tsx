import { useCallback, useEffect, useState } from "react";
import { formatCurrency } from "@/lib/masks";
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
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useNavigate } from "react-router-dom";
import SalesChartCard from "@/components/dashboard/SalesChartCard";
import CobrancaResumo from "@/components/dashboard/CobrancaResumo";
import EnviosProgramados from "@/components/dashboard/EnviosProgramados";

const frequenciaLabels: Record<string, string> = {
  semana: "Semanal",
  quinzena: "Quinzenal",
  mes: "Mensal",
};

const CardSectionLoader = ({ message }: { message: string }) => (
  <Card className="mb-6 slide-up delay-6">
    <CardContent className="p-6 text-sm text-muted-foreground">{message}</CardContent>
  </Card>
);

const Dashboard = () => {
  const { isAdmin, profile, permissions } = useAuth();
  const canSeeFaturamento = isAdmin || permissions.pode_ver_faturamento;
  const navigate = useNavigate();
  const [stats, setStats] = useState({
    vendasHoje: 0,
    simulacoes: 0,
    estoqueCritico: 0,
    vendasConcluidas: 0,
  });
  const [recentVendas, setRecentVendas] = useState<any[]>([]);

  const fetchStats = useCallback(async () => {
    const today = new Date().toISOString().split("T")[0];

    const [vendasRes, simRes, estoqueRes, concluidasRes] = await Promise.all([
      supabase.from("vendas").select("valor_total").eq("status", "concluida").gte("created_at", today),
      supabase.from("vendas").select("id", { count: "exact", head: true }).eq("status", "simulacao"),
      supabase.from("produtos").select("id", { count: "exact", head: true }).lt("estoque_atual", 5),
      supabase.from("vendas").select("id", { count: "exact", head: true }).eq("status", "concluida"),
    ]);

    setStats({
      vendasHoje: vendasRes.data?.reduce((sum, venda) => sum + Number(venda.valor_total), 0) || 0,
      simulacoes: simRes.count || 0,
      estoqueCritico: estoqueRes.count || 0,
      vendasConcluidas: concluidasRes.count || 0,
    });
  }, []);

  const fetchRecentVendas = useCallback(async () => {
    const { data } = await supabase
      .from("vendas")
      .select("id, cliente_nome, valor_total, num_parcelas, valor_parcela, frequencia_parcela, forma_pagamento, created_at")
      .eq("status", "concluida")
      .order("created_at", { ascending: false })
      .limit(10);

    setRecentVendas(data || []);
  }, []);

  useEffect(() => {
    void fetchStats();

    if (isAdmin) {
      void fetchRecentVendas();
      return;
    }

    setRecentVendas([]);
  }, [fetchRecentVendas, fetchStats, isAdmin]);

  const statCards = [
    {
      label: "Vendas Hoje",
      value: formatCurrency(stats.vendasHoje),
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
      icon: FileText,
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
        <p className="mt-1 text-sm text-muted-foreground">
          {isAdmin
            ? "Painel administrativo — todas as vendas dos vendedores"
            : canSeeFaturamento
              ? "Resumo geral de vendas"
              : "Resumo das suas vendas de hoje"}
        </p>
      </div>

      <div className="mb-6 grid w-full min-w-0 grid-cols-2 gap-3 md:grid-cols-4">
        {statCards.map((stat, index) => (
          <div key={stat.label} className={`stat-card slide-up delay-${index + 1}`}>
            <div className="mb-3 flex items-center justify-between">
              <div className={`flex h-9 w-9 items-center justify-center rounded-lg ${stat.bg}`}>
                <stat.icon className={`h-5 w-5 ${stat.color}`} />
              </div>
            </div>
            <p className="text-xl font-extrabold tabular-nums">{stat.value}</p>
            <p className="mt-0.5 text-xs text-muted-foreground">{stat.label}</p>
          </div>
        ))}
      </div>

      <div className="mb-6 slide-up delay-5">
        <h2 className="section-title mb-3">Ações Rápidas</h2>
        <div className="grid grid-cols-3 gap-3">
          <button onClick={() => navigate("/vendas")} className="quick-action-btn">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10">
              <Plus className="h-5 w-5 text-primary" />
            </div>
            <span>Nova Venda</span>
          </button>
          <button onClick={() => navigate("/documentos")} className="quick-action-btn">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-yellow-500/10">
              <Upload className="h-5 w-5 text-yellow-600" />
            </div>
            <span>Upload Nota</span>
          </button>
          <button onClick={() => navigate("/produtos")} className="quick-action-btn">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-500/10">
              <Search className="h-5 w-5 text-blue-600" />
            </div>
            <span>Consultar</span>
          </button>
        </div>
      </div>

      <SalesChartCard />

      <div className="mb-6">
        <EnviosProgramados />
      </div>

      <div className="mb-6">
        <CobrancaResumo />
      </div>

      {isAdmin && recentVendas.length > 0 && (
        <div className="slide-up delay-6">
          <h2 className="section-title mb-3">Vendas Concluídas (Todos Vendedores)</h2>
          <div className="space-y-2">
            {recentVendas.map((venda) => (
              <Card key={venda.id}>
                <CardContent className="flex items-center gap-3 p-4">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10">
                    <ShoppingCart className="h-5 w-5 text-primary" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold">{venda.cliente_nome}</p>
                    <div className="mt-0.5 flex flex-wrap items-center gap-2">
                      <span className="text-xs font-bold tabular-nums">
                        {formatCurrency(venda.valor_total)}
                      </span>
                      {(venda.num_parcelas || 0) > 1 && (
                        <span className="text-xs text-muted-foreground">
                          {venda.num_parcelas}x {formatCurrency(venda.valor_parcela)}
                          {venda.frequencia_parcela && ` · ${frequenciaLabels[venda.frequencia_parcela] || ""}`}
                        </span>
                      )}
                      {venda.forma_pagamento === "avista" && (
                        <Badge variant="outline" className="text-[10px]">
                          À Vista
                        </Badge>
                      )}
                    </div>
                  </div>
                  <div className="shrink-0 text-right">
                    <p className="text-[10px] text-muted-foreground">
                      {new Date(venda.created_at).toLocaleDateString("pt-BR")}
                    </p>
                    <p className="text-[10px] text-muted-foreground">
                      {new Date(venda.created_at).toLocaleTimeString("pt-BR", {
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
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
