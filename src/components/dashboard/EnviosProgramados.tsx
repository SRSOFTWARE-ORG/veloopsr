import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Send, Clock, CheckCircle2, AlertTriangle } from "lucide-react";
import { formatCurrency } from "@/lib/masks";

interface EnvioProgramado {
  clienteNome: string;
  telefone: string;
  valor: number;
  dataVencimento: string;
  tipo: "D-3" | "D-1" | "D0";
  status: string;
  jaEnviado: boolean;
}

const DAY_MS = 24 * 60 * 60 * 1000;

function formatDateOnly(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function addMonthsPreservingDay(date: Date, months: number): Date {
  const next = new Date(date);
  const originalDay = next.getUTCDate();
  next.setUTCDate(1);
  next.setUTCMonth(next.getUTCMonth() + months);
  const lastDay = new Date(Date.UTC(next.getUTCFullYear(), next.getUTCMonth() + 1, 0)).getUTCDate();
  next.setUTCDate(Math.min(originalDay, lastDay));
  return next;
}

function generateProjectedDates(dataInicio: string, dataFim: string, frequencia: string): string[] {
  const start = new Date(`${dataInicio}T00:00:00.000Z`);
  const end = new Date(`${dataFim}T00:00:00.000Z`);
  const dates: string[] = [];
  let current = new Date(start);
  while (current <= end) {
    dates.push(formatDateOnly(current));
    if (frequencia === "semana") current = new Date(current.getTime() + 7 * DAY_MS);
    else if (frequencia === "quinzena") current = new Date(current.getTime() + 15 * DAY_MS);
    else current = addMonthsPreservingDay(current, 1);
  }
  return dates;
}

const tipoConfig = {
  "D0": { label: "Hoje", color: "bg-destructive/10 text-destructive border-destructive/20", icon: AlertTriangle },
  "D-1": { label: "Amanhã", color: "bg-amber-500/10 text-amber-600 border-amber-200", icon: Clock },
  "D-3": { label: "Em 3 dias", color: "bg-blue-500/10 text-blue-600 border-blue-200", icon: Send },
};

export default function EnviosProgramados() {
  const [envios, setEnvios] = useState<EnvioProgramado[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchEnvios = useCallback(async () => {
    try {
      const now = new Date();
      const todayStr = formatDateOnly(now);
      const tomorrowStr = formatDateOnly(new Date(now.getTime() + DAY_MS));
      const threeDaysStr = formatDateOnly(new Date(now.getTime() + 3 * DAY_MS));

      const [cobRes, pagRes, enviosRes] = await Promise.all([
        supabase.from("cobrancas").select("id, cliente_id, cliente_nome, valor_parcela, data_inicio, data_fim, frequencia"),
        supabase.from("cobranca_pagamentos").select("cobranca_id, data_vencimento, status"),
        supabase.from("envio_cobranca").select("cpf").eq("data_envio", todayStr),
      ]);

      const cobrancas = cobRes.data || [];
      const clienteIds = [...new Set(cobrancas.map((c) => c.cliente_id))];

      const { data: clientes } = await supabase
        .from("clientes")
        .select("id, telefone, cpf")
        .in("id", clienteIds);

      const clienteMap = new Map<string, { telefone: string; cpf: string }>();
      for (const cl of clientes || []) {
        clienteMap.set(cl.id, { telefone: cl.telefone || "", cpf: cl.cpf || "" });
      }

      const statusMap = new Map<string, string>();
      for (const p of pagRes.data || []) {
        statusMap.set(`${p.cobranca_id}_${p.data_vencimento}`, p.status);
      }

      const cpfsEnviados = new Set((enviosRes.data || []).map((e) => e.cpf));

      const programados: EnvioProgramado[] = [];

      for (const cob of cobrancas) {
        const dates = generateProjectedDates(cob.data_inicio, cob.data_fim, cob.frequencia);
        const cliente = clienteMap.get(cob.cliente_id);
        if (!cliente?.telefone || !cliente?.cpf) continue;

        for (const date of dates) {
          const key = `${cob.id}_${date}`;
          const status = statusMap.get(key) || "a_pagar";
          if (status === "pago" || status === "isento") continue;

          let tipo: "D-3" | "D-1" | "D0" | null = null;
          if (date === threeDaysStr) tipo = "D-3";
          else if (date === tomorrowStr) tipo = "D-1";
          else if (date === todayStr) tipo = "D0";
          if (!tipo) continue;

          programados.push({
            clienteNome: cob.cliente_nome,
            telefone: cliente.telefone,
            valor: cob.valor_parcela,
            dataVencimento: date,
            tipo,
            status,
            jaEnviado: cpfsEnviados.has(cliente.cpf),
          });
        }
      }

      // Sort: D0 first, then D-1, then D-3
      const order = { "D0": 0, "D-1": 1, "D-3": 2 };
      programados.sort((a, b) => order[a.tipo] - order[b.tipo]);

      setEnvios(programados);
    } catch (err) {
      console.error("Erro ao buscar envios programados:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchEnvios();
  }, [fetchEnvios]);

  if (loading) {
    return (
      <Card>
        <CardContent className="p-6 text-sm text-muted-foreground">Carregando envios programados...</CardContent>
      </Card>
    );
  }

  if (envios.length === 0) {
    return (
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-base">
            <Send className="h-5 w-5 text-primary" />
            Envios Automáticos
          </CardTitle>
        </CardHeader>
        <CardContent className="pb-4">
          <p className="text-sm text-muted-foreground">Nenhum envio programado para hoje ou próximos dias.</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-base">
          <Send className="h-5 w-5 text-primary" />
          Envios Automáticos
          <Badge variant="secondary" className="ml-auto text-[10px]">
            {envios.length} programado{envios.length > 1 ? "s" : ""}
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2 pb-4">
        {envios.map((envio, i) => {
          const config = tipoConfig[envio.tipo];
          const Icon = config.icon;
          return (
            <div
              key={`${envio.clienteNome}-${envio.dataVencimento}-${i}`}
              className="flex items-center gap-3 rounded-lg border border-border/50 bg-secondary/30 p-3"
            >
              <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${envio.jaEnviado ? "bg-green-500/10" : config.color.split(" ")[0]}`}>
                {envio.jaEnviado ? (
                  <CheckCircle2 className="h-4 w-4 text-green-600" />
                ) : (
                  <Icon className={`h-4 w-4 ${config.color.split(" ")[1]}`} />
                )}
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{envio.clienteNome}</p>
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <span className="font-semibold tabular-nums">{formatCurrency(envio.valor)}</span>
                  <span>·</span>
                  <span>{envio.dataVencimento.split("-").reverse().join("/")}</span>
                </div>
              </div>
              <div className="flex flex-col items-end gap-1">
                <Badge className={`text-[10px] ${envio.jaEnviado ? "bg-green-500/10 text-green-600 border-green-200" : config.color}`}>
                  {envio.jaEnviado ? "Enviado ✓" : config.label}
                </Badge>
                {envio.status === "pendente" && (
                  <span className="text-[10px] text-destructive font-medium">Em atraso</span>
                )}
              </div>
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}
