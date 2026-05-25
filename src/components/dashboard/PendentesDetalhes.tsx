import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { formatCurrency } from "@/lib/masks";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { CalendarIcon, Pencil, Plus, Clock, Check } from "lucide-react";
import { format, parseISO, addWeeks, addDays, addMonths, isAfter } from "date-fns";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { CurrencyInput } from "@/components/ui/currency-input";

interface PendentesDetalhesProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  start?: string;
  end?: string;
}

interface PendenteItem {
  id: string; // virtual id = cobranca_id_data
  pagamento_id: string | null;
  cliente_nome: string;
  valor: number;
  data_vencimento: string;
  cobranca_id: string;
}

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

const PendentesDetalhes = ({ open, onOpenChange, start, end }: PendentesDetalhesProps) => {
  const [items, setItems] = useState<PendenteItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [editItem, setEditItem] = useState<PendenteItem | null>(null);
  const [editValor, setEditValor] = useState(0);
  const [editData, setEditData] = useState<Date | undefined>();
  const [addOpen, setAddOpen] = useState(false);
  const [addCliente, setAddCliente] = useState("");
  const [addValor, setAddValor] = useState(0);
  const [addData, setAddData] = useState<Date | undefined>(new Date());

  useEffect(() => {
    if (open) fetchData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, start, end]);

  const fetchData = async () => {
    setLoading(true);
    const today = format(new Date(), "yyyy-MM-dd");

    const [cobRes, pagRes] = await Promise.all([
      supabase.from("cobrancas").select("id, cliente_nome, valor_parcela, data_inicio, data_fim, frequencia, observacoes"),
      supabase.from("cobranca_pagamentos").select("id, cobranca_id, data_vencimento, status"),
    ]);

    const cobrancas = cobRes.data || [];
    const pagamentos = pagRes.data || [];

    // Mapa de status por (cobranca_id_data)
    const pagMap = new Map<string, { id: string; status: string }>();
    pagamentos.forEach((p) => {
      pagMap.set(`${p.cobranca_id}_${p.data_vencimento}`, { id: p.id, status: p.status });
    });

    // Detecta entradas (mesmo cliente que também tem carnê) para evitar duplicação
    const entradaByClient = new Map<string, any>();
    cobrancas.forEach((c: any) => {
      if (c.observacoes?.toLowerCase().startsWith("entrada")) {
        entradaByClient.set(c.cliente_nome.trim().toUpperCase(), c);
      }
    });
    const merged = cobrancas.filter((c: any) => {
      if (!c.observacoes?.toLowerCase().startsWith("entrada")) return true;
      const key = c.cliente_nome.trim().toUpperCase();
      const hasCarne = cobrancas.some(
        (o: any) => o.id !== c.id && o.cliente_nome.trim().toUpperCase() === key && !o.observacoes?.toLowerCase().startsWith("entrada")
      );
      return !hasCarne;
    });

    const result: PendenteItem[] = [];
    merged.forEach((c: any) => {
      const dates = generateDates(c.data_inicio, c.data_fim, c.frequencia);
      // Adiciona data da entrada se houver carnê correspondente
      const clientKey = c.cliente_nome.trim().toUpperCase();
      const entrada = entradaByClient.get(clientKey);
      if (entrada && !c.observacoes?.toLowerCase().startsWith("entrada")) {
        const ed = format(parseISO(entrada.data_inicio), "yyyy-MM-dd");
        if (!dates.includes(ed)) dates.unshift(ed);
      }

      dates.forEach((d) => {
        // Só conta como PENDENTE se vencimento < hoje (atrasado)
        if (d >= today) return;
        // Filtro de período
        if (start && d < start) return;
        if (end && d > end) return;
        // Determina qual cobrança usar para status (entrada vs carnê)
        const statusCobId = entrada && !c.observacoes?.toLowerCase().startsWith("entrada") && d === format(parseISO(entrada.data_inicio), "yyyy-MM-dd")
          ? entrada.id
          : c.id;
        const pag = pagMap.get(`${statusCobId}_${d}`);
        if (pag?.status === "pago" || pag?.status === "isento") return;

        const valor = entrada && d === format(parseISO(entrada.data_inicio), "yyyy-MM-dd")
          ? Number(entrada.valor_parcela)
          : Number(c.valor_parcela);

        result.push({
          id: `${statusCobId}_${d}`,
          pagamento_id: pag?.id || null,
          cliente_nome: c.cliente_nome,
          valor,
          data_vencimento: d,
          cobranca_id: statusCobId,
        });
      });
    });

    result.sort((a, b) => a.data_vencimento.localeCompare(b.data_vencimento));
    setItems(result);
    setLoading(false);
  };

  const marcarPago = async (item: PendenteItem) => {
    const { data: { user } } = await supabase.auth.getUser();
    if (item.pagamento_id) {
      await supabase.from("cobranca_pagamentos").update({
        status: "pago",
        pago_em: new Date().toISOString(),
        pago_por: user?.id,
      }).eq("id", item.pagamento_id);
    } else {
      await supabase.from("cobranca_pagamentos").insert({
        cobranca_id: item.cobranca_id,
        data_vencimento: item.data_vencimento,
        status: "pago",
        pago_em: new Date().toISOString(),
        pago_por: user?.id,
        tipo_pagamento: "carne",
      });
    }
    toast.success(`Pagamento de ${item.cliente_nome} marcado como pago!`);
    fetchData();
  };

  const handleEdit = (item: PendenteItem) => {
    setEditItem(item);
    setEditValor(item.valor);
    setEditData(new Date(item.data_vencimento + "T12:00:00"));
  };

  const saveEdit = async () => {
    if (!editItem) return;
    const novaData = editData ? format(editData, "yyyy-MM-dd") : editItem.data_vencimento;
    if (editItem.pagamento_id) {
      await supabase.from("cobranca_pagamentos").update({
        data_vencimento: novaData,
      }).eq("id", editItem.pagamento_id);
    }
    await supabase.from("cobrancas").update({
      valor_parcela: editValor,
    }).eq("id", editItem.cobranca_id);
    toast.success("Registro atualizado!");
    setEditItem(null);
    fetchData();
  };

  const addPendencia = async () => {
    if (!addCliente.trim() || addValor <= 0 || !addData) {
      toast.error("Preencha todos os campos");
      return;
    }
    const { data: cliente } = await supabase
      .from("clientes")
      .select("id")
      .ilike("nome", addCliente.trim())
      .limit(1)
      .maybeSingle();

    const clienteId = cliente?.id;
    const { data: { user } } = await supabase.auth.getUser();
    const dataStr = format(addData, "yyyy-MM-dd");

    const { data: cob } = await supabase.from("cobrancas").insert({
      cliente_id: clienteId || "00000000-0000-0000-0000-000000000000",
      cliente_nome: addCliente.trim(),
      valor_parcela: addValor,
      data_inicio: dataStr,
      data_fim: dataStr,
      frequencia: "mes",
      criado_por: user!.id,
      observacoes: "Pendência manual",
    }).select().single();

    if (cob) {
      await supabase.from("cobranca_pagamentos").insert({
        cobranca_id: cob.id,
        data_vencimento: dataStr,
        status: "a_pagar",
        tipo_pagamento: "carne",
      });
    }

    toast.success("Pendência adicionada!");
    setAddOpen(false);
    setAddCliente("");
    setAddValor(0);
    setAddData(new Date());
    fetchData();
  };

  const totalPendente = items.reduce((s, i) => s + i.valor, 0);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[calc(100%-2rem)] max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Clock className="w-5 h-5 text-destructive" />
            Detalhes — Pendentes
          </DialogTitle>
        </DialogHeader>

        <div className="flex items-center justify-between mb-3">
          <p className="text-sm text-muted-foreground">
            Total: <span className="font-bold text-destructive">{formatCurrency(totalPendente)}</span>
            <span className="ml-2 text-[10px]">({items.length} parcela{items.length !== 1 ? "s" : ""})</span>
          </p>
          <Button size="sm" variant="outline" onClick={() => setAddOpen(true)}>
            <Plus className="w-4 h-4 mr-1" /> Adicionar
          </Button>
        </div>

        {loading ? (
          <p className="text-sm text-muted-foreground py-4 text-center">Carregando...</p>
        ) : items.length === 0 ? (
          <p className="text-sm text-muted-foreground py-4 text-center">Nenhuma pendência no período</p>
        ) : (
          <div className="space-y-2">
            {items.map((item) => (
              <div key={item.id} className="flex items-center gap-3 p-3 rounded-lg border bg-card">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold truncate">{item.cliente_nome}</p>
                  <div className="flex items-center gap-2 mt-0.5">
                    <span className="text-xs font-bold tabular-nums text-destructive">
                      {formatCurrency(item.valor)}
                    </span>
                    <Badge variant="outline" className="text-[10px] border-destructive text-destructive">
                      Atrasado
                    </Badge>
                  </div>
                </div>
                <div className="text-right shrink-0">
                  <p className="text-[10px] text-muted-foreground">
                    Venc: {new Date(item.data_vencimento + "T12:00:00").toLocaleDateString("pt-BR")}
                  </p>
                </div>
                <div className="flex gap-1 shrink-0">
                  <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => marcarPago(item)} title="Marcar como pago">
                    <Check className="w-3.5 h-3.5 text-primary" />
                  </Button>
                  <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => handleEdit(item)}>
                    <Pencil className="w-3.5 h-3.5" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Edit Modal */}
        <Dialog open={!!editItem} onOpenChange={(o) => !o && setEditItem(null)}>
          <DialogContent className="w-[calc(100%-2rem)] max-w-sm">
            <DialogHeader>
              <DialogTitle>Editar Pendência</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div>
                <Label>Cliente</Label>
                <Input value={editItem?.cliente_nome || ""} disabled />
              </div>
              <div>
                <Label>Valor</Label>
                <CurrencyInput value={editValor} onValueChange={setEditValor} />
              </div>
              <div>
                <Label>Data Vencimento</Label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button variant="outline" className={cn("w-full justify-start text-left", !editData && "text-muted-foreground")}>
                      <CalendarIcon className="mr-2 h-4 w-4" />
                      {editData ? format(editData, "dd/MM/yyyy") : "Selecionar"}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <Calendar mode="single" selected={editData} onSelect={setEditData} className="p-3 pointer-events-auto" />
                  </PopoverContent>
                </Popover>
              </div>
              <Button className="w-full" onClick={saveEdit}>Salvar</Button>
            </div>
          </DialogContent>
        </Dialog>

        {/* Add Modal */}
        <Dialog open={addOpen} onOpenChange={setAddOpen}>
          <DialogContent className="w-[calc(100%-2rem)] max-w-sm">
            <DialogHeader>
              <DialogTitle>Nova Pendência</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div>
                <Label>Cliente</Label>
                <Input value={addCliente} onChange={(e) => setAddCliente(e.target.value)} placeholder="Nome do cliente" />
              </div>
              <div>
                <Label>Valor</Label>
                <CurrencyInput value={addValor} onValueChange={setAddValor} />
              </div>
              <div>
                <Label>Data Vencimento</Label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button variant="outline" className={cn("w-full justify-start text-left", !addData && "text-muted-foreground")}>
                      <CalendarIcon className="mr-2 h-4 w-4" />
                      {addData ? format(addData, "dd/MM/yyyy") : "Selecionar"}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <Calendar mode="single" selected={addData} onSelect={setAddData} className="p-3 pointer-events-auto" />
                  </PopoverContent>
                </Popover>
              </div>
              <Button className="w-full" onClick={addPendencia}>Adicionar</Button>
            </div>
          </DialogContent>
        </Dialog>
      </DialogContent>
    </Dialog>
  );
};

export default PendentesDetalhes;
