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
import { CalendarIcon, Pencil, Plus, CheckCircle2 } from "lucide-react";
import { format } from "date-fns";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { CurrencyInput } from "@/components/ui/currency-input";

interface RecebidosDetalhesProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  start: string;
  end: string;
}

interface RecebidoItem {
  id: string;
  tipo: "entrada" | "parcela";
  cliente_nome: string;
  valor: number;
  data: string;
  cobranca_id?: string;
  venda_id?: string;
}

const RecebidosDetalhes = ({ open, onOpenChange, start, end }: RecebidosDetalhesProps) => {
  const [items, setItems] = useState<RecebidoItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [editItem, setEditItem] = useState<RecebidoItem | null>(null);
  const [editValor, setEditValor] = useState(0);
  const [editData, setEditData] = useState<Date | undefined>();
  const [addOpen, setAddOpen] = useState(false);
  const [addCliente, setAddCliente] = useState("");
  const [addValor, setAddValor] = useState(0);
  const [addData, setAddData] = useState<Date | undefined>(new Date());

  useEffect(() => {
    if (open) fetchData();
  }, [open, start, end]);

  const fetchData = async () => {
    setLoading(true);
    const result: RecebidoItem[] = [];

    // 1) Parcelas pagas no período (by pago_em)
    const { data: pagos } = await supabase
      .from("cobranca_pagamentos")
      .select("id, cobranca_id, pago_em, tipo_pagamento")
      .eq("status", "pago")
      .gte("pago_em", `${start}T00:00:00`)
      .lte("pago_em", `${end}T23:59:59`);

    if (pagos && pagos.length > 0) {
      const cobrancaIds = [...new Set(pagos.map((p) => p.cobranca_id))];
      const { data: cobrancas } = await supabase
        .from("cobrancas")
        .select("id, cliente_nome, valor_parcela")
        .in("id", cobrancaIds);

      const cobMap: Record<string, { nome: string; valor: number }> = {};
      cobrancas?.forEach((c) => {
        cobMap[c.id] = { nome: c.cliente_nome, valor: Number(c.valor_parcela) };
      });

      pagos.forEach((p) => {
        const cob = cobMap[p.cobranca_id];
        if (cob) {
          result.push({
            id: p.id,
            tipo: (p as any).tipo_pagamento === "entrada" ? "entrada" : "parcela",
            cliente_nome: cob.nome,
            valor: cob.valor,
            data: p.pago_em?.split("T")[0] || "",
            cobranca_id: p.cobranca_id,
          });
        }
      });
    }

    // 2) Entradas de vendas concluídas
    const { data: vendas } = await supabase
      .from("vendas")
      .select("id, cliente_nome, valor_entrada, created_at, data_entrada")
      .eq("status", "concluida");

    if (vendas) {
      vendas.forEach((v) => {
        const entradaVal = Number(v.valor_entrada) || 0;
        if (entradaVal <= 0) return;
        const dataEntrada = (v as any).data_entrada || v.created_at?.split("T")[0] || "";
        if (dataEntrada >= start && dataEntrada <= end) {
          // avoid double counting if already tracked via cobranca_pagamentos
          const alreadyTracked = result.some(
            (r) => r.tipo === "entrada" && r.venda_id === v.id
          );
          if (!alreadyTracked) {
            result.push({
              id: `venda-${v.id}`,
              tipo: "entrada",
              cliente_nome: v.cliente_nome,
              valor: entradaVal,
              data: dataEntrada,
              venda_id: v.id,
            });
          }
        }
      });
    }

    result.sort((a, b) => b.data.localeCompare(a.data));
    setItems(result);
    setLoading(false);
  };

  const handleEdit = (item: RecebidoItem) => {
    setEditItem(item);
    setEditValor(item.valor);
    setEditData(item.data ? new Date(item.data + "T12:00:00") : undefined);
  };

  const saveEdit = async () => {
    if (!editItem) return;

    if (editItem.venda_id) {
      await supabase.from("vendas").update({
        valor_entrada: editValor,
        data_entrada: editData ? format(editData, "yyyy-MM-dd") : null,
      }).eq("id", editItem.venda_id);
    } else if (editItem.cobranca_id) {
      await supabase.from("cobranca_pagamentos").update({
        pago_em: editData ? editData.toISOString() : null,
      }).eq("id", editItem.id);
      // update valor on cobranca
      await supabase.from("cobrancas").update({
        valor_parcela: editValor,
      }).eq("id", editItem.cobranca_id);
    }

    toast.success("Registro atualizado!");
    setEditItem(null);
    fetchData();
  };

  const addRecebimento = async () => {
    if (!addCliente.trim() || addValor <= 0 || !addData) {
      toast.error("Preencha todos os campos");
      return;
    }

    // Find or create client
    const { data: cliente } = await supabase
      .from("clientes")
      .select("id")
      .ilike("nome", addCliente.trim())
      .limit(1)
      .maybeSingle();

    const clienteId = cliente?.id;
    const { data: { user } } = await supabase.auth.getUser();

    // Create a cobranca + payment for the manual entry
    const dataStr = format(addData, "yyyy-MM-dd");
    const { data: cob } = await supabase.from("cobrancas").insert({
      cliente_id: clienteId || "00000000-0000-0000-0000-000000000000",
      cliente_nome: addCliente.trim(),
      valor_parcela: addValor,
      data_inicio: dataStr,
      data_fim: dataStr,
      frequencia: "mes",
      criado_por: user!.id,
      observacoes: "Recebimento manual",
    }).select().single();

    if (cob) {
      await supabase.from("cobranca_pagamentos").insert({
        cobranca_id: cob.id,
        data_vencimento: dataStr,
        status: "pago",
        pago_em: addData.toISOString(),
        pago_por: user!.id,
        tipo_pagamento: "entrada",
      });
    }

    toast.success("Recebimento adicionado!");
    setAddOpen(false);
    setAddCliente("");
    setAddValor(0);
    setAddData(new Date());
    fetchData();
  };

  const totalRecebido = items.reduce((s, i) => s + i.valor, 0);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <CheckCircle2 className="w-5 h-5 text-primary" />
            Detalhes — Recebidos
          </DialogTitle>
        </DialogHeader>

        <div className="flex items-center justify-between mb-3">
          <p className="text-sm text-muted-foreground">
            Total: <span className="font-bold text-primary">{formatCurrency(totalRecebido)}</span>
          </p>
          <Button size="sm" variant="outline" onClick={() => setAddOpen(true)}>
            <Plus className="w-4 h-4 mr-1" /> Adicionar
          </Button>
        </div>

        {loading ? (
          <p className="text-sm text-muted-foreground py-4 text-center">Carregando...</p>
        ) : items.length === 0 ? (
          <p className="text-sm text-muted-foreground py-4 text-center">Nenhum recebimento no período</p>
        ) : (
          <div className="space-y-2">
            {items.map((item) => (
              <div key={item.id} className="flex items-center gap-3 p-3 rounded-lg border bg-card">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold truncate">{item.cliente_nome}</p>
                  <div className="flex items-center gap-2 mt-0.5">
                    <span className="text-xs font-bold tabular-nums text-primary">
                      {formatCurrency(item.valor)}
                    </span>
                    <Badge variant="outline" className="text-[10px]">
                      {item.tipo === "entrada" ? "Entrada" : "Parcela"}
                    </Badge>
                  </div>
                </div>
                <div className="text-right shrink-0">
                  <p className="text-[10px] text-muted-foreground">
                    {item.data ? new Date(item.data + "T12:00:00").toLocaleDateString("pt-BR") : "—"}
                  </p>
                </div>
                <Button size="icon" variant="ghost" className="h-8 w-8 shrink-0" onClick={() => handleEdit(item)}>
                  <Pencil className="w-3.5 h-3.5" />
                </Button>
              </div>
            ))}
          </div>
        )}

        {/* Edit Modal */}
        <Dialog open={!!editItem} onOpenChange={(o) => !o && setEditItem(null)}>
          <DialogContent className="max-w-sm">
            <DialogHeader>
              <DialogTitle>Editar Recebimento</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div>
                <Label>Cliente</Label>
                <Input value={editItem?.cliente_nome || ""} disabled />
              </div>
              <div>
                <Label>Valor</Label>
                <CurrencyInput value={editValor} onChange={setEditValor} />
              </div>
              <div>
                <Label>Data</Label>
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
          <DialogContent className="max-w-sm">
            <DialogHeader>
              <DialogTitle>Novo Recebimento</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div>
                <Label>Cliente</Label>
                <Input value={addCliente} onChange={(e) => setAddCliente(e.target.value)} placeholder="Nome do cliente" />
              </div>
              <div>
                <Label>Valor</Label>
                <CurrencyInput value={addValor} onChange={setAddValor} />
              </div>
              <div>
                <Label>Data</Label>
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
              <Button className="w-full" onClick={addRecebimento}>Adicionar</Button>
            </div>
          </DialogContent>
        </Dialog>
      </DialogContent>
    </Dialog>
  );
};

export default RecebidosDetalhes;
