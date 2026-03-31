import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Receipt, Search, ExternalLink, FileText } from "lucide-react";

function formatCurrency(v: number) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v);
}
function formatDate(d: string) {
  return d.split("-").reverse().join("/");
}

export default function TransacoesPage() {
  const [search, setSearch] = useState("");

  const { data: pagamentos = [], isLoading } = useQuery({
    queryKey: ["transacoes-historico"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("cobranca_pagamentos")
        .select("*, cobrancas(cliente_nome, valor_parcela, cliente_id, observacoes)")
        .eq("status", "pago")
        .order("pago_em", { ascending: false })
        .limit(200);
      if (error) throw error;
      return data || [];
    },
  });

  const filtered = pagamentos.filter((p: any) => {
    if (!search) return true;
    const s = search.toLowerCase();
    const nome = (p.cobrancas as any)?.cliente_nome?.toLowerCase() || "";
    return nome.includes(s) || p.data_vencimento.includes(s);
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <Receipt className="h-6 w-6 text-primary" />
        <h1 className="text-2xl font-bold text-foreground">Histórico de Transações</h1>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <CardTitle className="text-lg">Pagamentos Confirmados</CardTitle>
            <div className="relative w-64">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Buscar cliente..."
                className="pl-8 h-9"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="text-center py-8 text-muted-foreground">Carregando...</div>
          ) : filtered.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">Nenhuma transação encontrada</div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Cliente</TableHead>
                    <TableHead>Parcela</TableHead>
                    <TableHead>Valor</TableHead>
                    <TableHead>Forma</TableHead>
                    <TableHead>Pago em</TableHead>
                    <TableHead>Recibo</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map((p: any) => {
                    const cob = p.cobrancas as any;
                    const pdfUrl = `https://vajadqjzwveuxzmcywvn.supabase.co/storage/v1/object/public/documentos_vendas/comprovantes/${p.cobranca_id}_${p.data_vencimento}.pdf`;
                    return (
                      <TableRow key={p.id}>
                        <TableCell className="font-medium">{cob?.cliente_nome || "—"}</TableCell>
                        <TableCell>{formatDate(p.data_vencimento)}</TableCell>
                        <TableCell className="text-primary font-semibold">{formatCurrency(cob?.valor_parcela || 0)}</TableCell>
                        <TableCell>
                          <Badge variant={p.tipo_pagamento?.includes("pix") ? "default" : "secondary"} className="text-xs">
                            {p.tipo_pagamento === "pix_mercadopago" ? "PIX MP" : p.tipo_pagamento || "Manual"}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-muted-foreground text-sm">
                          {p.pago_em ? new Date(p.pago_em).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", year: "2-digit", hour: "2-digit", minute: "2-digit" }) : "—"}
                        </TableCell>
                        <TableCell>
                          <Button variant="ghost" size="sm" className="h-7 gap-1" asChild>
                            <a href={pdfUrl} target="_blank" rel="noopener noreferrer">
                              <FileText className="h-3.5 w-3.5" />
                              PDF
                            </a>
                          </Button>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
