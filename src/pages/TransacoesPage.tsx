import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Receipt, Search, FileText, Loader2, CheckCircle2, ChevronLeft, ChevronRight, CalendarIcon, X, Download } from "lucide-react";
import { toast } from "sonner";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { cn } from "@/lib/utils";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

const PAGE_SIZE = 20;

function formatCurrency(v: number) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v);
}
function formatDate(d: string) {
  return d.split("-").reverse().join("/");
}

function PdfButton({ cobrancaId, dataVencimento, exists }: { cobrancaId: string; dataVencimento: string; exists: boolean }) {
  const [loading, setLoading] = useState(false);

  const handleClick = async () => {
    if (exists) {
      const url = `${import.meta.env.VITE_SUPABASE_URL}/storage/v1/object/public/documentos_vendas/comprovantes/${cobrancaId}_${dataVencimento}.pdf`;
      window.open(url, "_blank");
      return;
    }
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("generate-payment-receipt", {
        body: { cobranca_id: cobrancaId, data_vencimento: dataVencimento },
      });
      if (error) throw error;
      if (data?.pdf_url) {
        window.open(data.pdf_url, "_blank");
      } else {
        throw new Error("URL não retornada");
      }
    } catch (err: any) {
      console.error("Erro ao gerar PDF:", err);
      toast.error("Erro ao gerar comprovante PDF");
    } finally {
      setLoading(false);
    }
  };

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button variant="ghost" size="sm" className="h-7 gap-1" onClick={handleClick} disabled={loading}>
            {loading ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : exists ? (
              <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />
            ) : (
              <FileText className="h-3.5 w-3.5" />
            )}
            PDF
          </Button>
        </TooltipTrigger>
        <TooltipContent>
          {exists ? "PDF já gerado — clique para abrir" : "Clique para gerar o comprovante"}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

function DateFilter({ label, date, onSelect }: { label: string; date: Date | undefined; onSelect: (d: Date | undefined) => void }) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm" className={cn("h-9 gap-1.5 text-xs", !date && "text-muted-foreground")}>
          <CalendarIcon className="h-3.5 w-3.5" />
          {date ? format(date, "dd/MM/yyyy") : label}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="start">
        <Calendar mode="single" selected={date} onSelect={onSelect} locale={ptBR} initialFocus className={cn("p-3 pointer-events-auto")} />
      </PopoverContent>
    </Popover>
  );
}

export default function TransacoesPage() {
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(0);
  const [dateFrom, setDateFrom] = useState<Date | undefined>();
  const [dateTo, setDateTo] = useState<Date | undefined>();
  const [existingPdfs, setExistingPdfs] = useState<Set<string>>(new Set());

  const { data: pagamentos = [], isLoading } = useQuery({
    queryKey: ["transacoes-historico"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("cobranca_pagamentos")
        .select("*, cobrancas(cliente_nome, valor_parcela, cliente_id, observacoes)")
        .eq("status", "pago")
        .order("pago_em", { ascending: false })
        .limit(500);
      if (error) throw error;
      return data || [];
    },
  });

  useEffect(() => {
    if (pagamentos.length === 0) return;
    const checkExisting = async () => {
      const { data } = await supabase.storage.from("documentos_vendas").list("comprovantes", { limit: 1000 });
      if (data) {
        const names = new Set(data.map((f) => f.name));
        const found = new Set<string>();
        pagamentos.forEach((p: any) => {
          const key = `${p.cobranca_id}_${p.data_vencimento}.pdf`;
          if (names.has(key)) found.add(p.id);
        });
        setExistingPdfs(found);
      }
    };
    checkExisting();
  }, [pagamentos]);

  const filtered = pagamentos.filter((p: any) => {
    if (search) {
      const s = search.toLowerCase();
      const nome = (p.cobrancas as any)?.cliente_nome?.toLowerCase() || "";
      if (!nome.includes(s) && !p.data_vencimento.includes(s)) return false;
    }
    if (dateFrom || dateTo) {
      const pagoEm = p.pago_em ? new Date(p.pago_em) : null;
      if (!pagoEm) return false;
      if (dateFrom && pagoEm < dateFrom) return false;
      if (dateTo) {
        const end = new Date(dateTo);
        end.setHours(23, 59, 59, 999);
        if (pagoEm > end) return false;
      }
    }
    return true;
  });

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages - 1);
  const paged = filtered.slice(safePage * PAGE_SIZE, (safePage + 1) * PAGE_SIZE);

  useEffect(() => { setPage(0); }, [search, dateFrom, dateTo]);

  const hasDateFilter = dateFrom || dateTo;

  const exportCsv = () => {
    if (filtered.length === 0) return;
    const header = "Cliente;Parcela;Valor;Forma;Pago em";
    const rows = filtered.map((p: any) => {
      const cob = p.cobrancas as any;
      const nome = cob?.cliente_nome || "";
      const parcela = formatDate(p.data_vencimento);
      const valor = formatCurrency(cob?.valor_parcela || 0);
      const forma = p.tipo_pagamento === "pix_mercadopago" ? "PIX MP" : p.tipo_pagamento || "Manual";
      const pagoEm = p.pago_em ? new Date(p.pago_em).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", year: "2-digit", hour: "2-digit", minute: "2-digit" }) : "";
      return `${nome};${parcela};${valor};${forma};${pagoEm}`;
    });
    const csv = "\uFEFF" + [header, ...rows].join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `transacoes_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success(`${filtered.length} transações exportadas`);
  };

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
              <Input placeholder="Buscar cliente..." className="pl-8 h-9" value={search} onChange={(e) => setSearch(e.target.value)} />
            </div>
          </div>
          <div className="flex items-center gap-2 flex-wrap pt-2">
            <DateFilter label="Data início" date={dateFrom} onSelect={setDateFrom} />
            <DateFilter label="Data fim" date={dateTo} onSelect={setDateTo} />
            {hasDateFilter && (
              <Button variant="ghost" size="sm" className="h-9 gap-1 text-xs text-muted-foreground" onClick={() => { setDateFrom(undefined); setDateTo(undefined); }}>
                <X className="h-3.5 w-3.5" /> Limpar
              </Button>
            )}
            <span className="text-xs text-muted-foreground ml-auto">{filtered.length} resultado(s)</span>
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="text-center py-8 text-muted-foreground">Carregando...</div>
          ) : filtered.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">Nenhuma transação encontrada</div>
          ) : (
            <>
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
                    {paged.map((p: any) => {
                      const cob = p.cobrancas as any;
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
                            <PdfButton cobrancaId={p.cobranca_id} dataVencimento={p.data_vencimento} exists={existingPdfs.has(p.id)} />
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>

              {totalPages > 1 && (
                <div className="flex items-center justify-between pt-4 border-t mt-4">
                  <span className="text-sm text-muted-foreground">
                    {safePage * PAGE_SIZE + 1}–{Math.min((safePage + 1) * PAGE_SIZE, filtered.length)} de {filtered.length}
                  </span>
                  <div className="flex items-center gap-1">
                    <Button variant="outline" size="sm" disabled={safePage === 0} onClick={() => setPage(safePage - 1)}>
                      <ChevronLeft className="h-4 w-4" />
                    </Button>
                    <span className="text-sm px-2 text-muted-foreground">{safePage + 1}/{totalPages}</span>
                    <Button variant="outline" size="sm" disabled={safePage >= totalPages - 1} onClick={() => setPage(safePage + 1)}>
                      <ChevronRight className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
