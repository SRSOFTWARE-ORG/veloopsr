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
import { format } from "date-fns";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { CurrencyInput } from "@/components/ui/currency-input";

interface PendentesDetalhesProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  start: string;
  end: string;
}

interface PendenteItem {
  id: string;
  cliente_nome: string;
  valor: number;
  data_vencimento: string;
  cobranca_id: string;
  status: string;
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
  }, [open, start, end]);

  const fetchData = async () => {
    setLoading(true);
    const result: PendenteItem[] = [];

    // Mostra TODOS os pendentes (inclui atrasados de períodos anteriores até a data final)
    const { data: pendentes } = await supabase
      .from("cobranca_pagamentos")
      .select("id, cobranca_id, data_vencimento, status")
      .neq("status", "pago")
      .neq("status", "isento")
      .lte("data_vencimento", end);

    if (pendentes && pendentes.length > 0) {
      const cobrancaIds = [...new Set(pendentes.map((p) => p.cobranca_id))];
      const { data: cobrancas } = await supabase
        .from("cobrancas")
        .select("id, cliente_nome, valor_parcela")
        .in("id", cobrancaIds);

      const cobMap: Record<string, { nome: string; valor: number }> = {};
      cobrancas?.forEach((c) => {
        cobMap[c.id] = { nome: c.cliente_nome, valor: Number(c.valor_parcela) };
      });

      pendentes.forEach((p) => {
        const cob = cobMap[p.cobranca_id];
        if (cob) {
          result.push({
            id: p.id,
            cliente_nome: cob.nome,
            valor: cob.valor,
            data_vencimento: p.data_vencimento,
            cobranca_id: p.cobranca_id,
            status: p.status,
          });
        }
      });
    }

    result.sort((a, b) => a.data_vencimento.localeCompare(b.data_vencimento));
    setItems(result);
    setLoading(false);
  };

  const marcarPago = async (item: PendenteItem) => {
    const { data: { user } } = await supabase.auth.getUser();
    await supabase.from("cobranca_pagamentos").update({
      status: "pago",
      pago_em: new Date().toISOString(),
      pago_por: user?.id,
    }).eq("id", item.id);
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
    await supabase.from("cobranca_pagamentos").update({
      data_vencimento: editData ? format(editData, "yyyy-MM-dd") : editItem.data_vencimento,
    }).eq("id", editItem.id);
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
  const today = new Date().toISOString().split("T")[0];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Clock className="w-5 h-5 text-destructive" />
            Detalhes — Pendentes
          </DialogTitle>
        </DialogHeader>

        <div className="flex items-center justify-between mb-3">
          <p className="text-sm text-muted-foreground">
            Total: <span className="font-bold text-destructive">{formatCurrency(totalPendente)}</span>
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
                    <Badge
                      variant="outline"
                      className={cn(
                        "text-[10px]",
                        item.data_vencimento < today && "border-destructive text-destructive"
                      )}
                    >
                      {item.data_vencimento < today ? "Atrasado" : "A Pagar"}
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
          <DialogContent className="max-w-sm">
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
          <DialogContent className="max-w-sm">
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
