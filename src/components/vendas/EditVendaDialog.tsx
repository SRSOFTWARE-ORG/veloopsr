import { useState, useEffect } from "react";
import { formatCurrency } from "@/lib/masks";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Save } from "lucide-react";

interface Venda {
  id: string;
  cliente_nome: string;
  cliente_telefone: string | null;
  valor_total: number;
  valor_entrada: number;
  num_parcelas: number;
  valor_parcela: number;
  desconto_percentual: number;
  status: string;
  created_at: string;
  forma_pagamento: string | null;
  frequencia_parcela: string | null;
  data_inicio_pagamento: string | null;
  observacoes?: string | null;
  cliente_cpf?: string | null;
}

const frequenciaLabels: Record<string, string> = {
  semana: "Semanal",
  quinzena: "Quinzenal",
  mes: "Mensal",
};

interface EditVendaDialogProps {
  venda: Venda | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved: () => void;
}

const EditVendaDialog = ({ venda, open, onOpenChange, onSaved }: EditVendaDialogProps) => {
  const [valorTotal, setValorTotal] = useState(0);
  const [valorEntrada, setValorEntrada] = useState(0);
  const [numParcelas, setNumParcelas] = useState(1);
  const [valorParcela, setValorParcela] = useState(0);
  const [descontoPercentual, setDescontoPercentual] = useState(0);
  const [formaPagamento, setFormaPagamento] = useState<"avista" | "parcelado">("parcelado");
  const [frequencia, setFrequencia] = useState("mes");
  const [dataInicio, setDataInicio] = useState("");
  const [observacoes, setObservacoes] = useState("");
  const [status, setStatus] = useState("simulacao");
  const [clienteNome, setClienteNome] = useState("");
  const [clienteTelefone, setClienteTelefone] = useState("");
  const [clienteCpf, setClienteCpf] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (venda) {
      setValorTotal(Number(venda.valor_total));
      setValorEntrada(Number(venda.valor_entrada) || 0);
      setNumParcelas(venda.num_parcelas || 1);
      setValorParcela(Number(venda.valor_parcela) || 0);
      setDescontoPercentual(Number(venda.desconto_percentual) || 0);
      setFormaPagamento(venda.forma_pagamento === "avista" ? "avista" : "parcelado");
      setFrequencia(venda.frequencia_parcela || "mes");
      setDataInicio(venda.data_inicio_pagamento || "");
      setObservacoes(venda.observacoes || "");
      setStatus(venda.status || "simulacao");
      setClienteNome(venda.cliente_nome);
      setClienteTelefone(venda.cliente_telefone || "");
      setClienteCpf(venda.cliente_cpf || "");
    }
  }, [venda]);

  const restante = valorTotal - valorEntrada;
  const parcelaCalculada = numParcelas > 0 ? restante / numParcelas : restante;

  const recalcularParcela = () => {
    setValorParcela(parcelaCalculada);
  };

  const handleSave = async () => {
    if (!venda) return;
    setSaving(true);
    try {
      const { error } = await supabase
        .from("vendas")
        .update({
          cliente_nome: clienteNome,
          cliente_telefone: clienteTelefone || null,
          cliente_cpf: clienteCpf || null,
          valor_total: valorTotal,
          valor_entrada: valorEntrada,
          num_parcelas: formaPagamento === "avista" ? 1 : numParcelas,
          valor_parcela: formaPagamento === "avista" ? valorTotal : valorParcela,
          desconto_percentual: descontoPercentual,
          forma_pagamento: formaPagamento,
          frequencia_parcela: formaPagamento === "avista" ? null : frequencia,
          data_inicio_pagamento: formaPagamento === "avista" ? null : dataInicio || null,
          observacoes: observacoes || null,
          status,
        })
        .eq("id", venda.id);

      if (error) {
        toast.error("Erro ao salvar: " + error.message);
      } else {
        toast.success("Venda atualizada com sucesso!");
        onOpenChange(false);
        onSaved();
      }
    } catch (err: any) {
      toast.error(err.message || "Erro inesperado");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Editar Venda</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Cliente */}
          <div className="space-y-2">
            <Label>Nome do Cliente</Label>
            <Input value={clienteNome} onChange={(e) => setClienteNome(e.target.value)} />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-2">
              <Label>Telefone</Label>
              <Input value={clienteTelefone} onChange={(e) => setClienteTelefone(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>CPF</Label>
              <Input value={clienteCpf} onChange={(e) => setClienteCpf(e.target.value)} />
            </div>
          </div>

          {/* Status */}
          <div className="space-y-2">
            <Label>Status</Label>
            <div className="grid grid-cols-2 gap-2">
              {[
                { value: "simulacao", label: "Simulação" },
                { value: "concluida", label: "Concluída" },
                { value: "pendente", label: "Pendente" },
                { value: "cancelada", label: "Cancelada" },
              ].map((s) => (
                <button
                  key={s.value}
                  onClick={() => setStatus(s.value)}
                  className={`px-3 py-2 rounded-lg border text-sm font-medium transition-colors ${
                    status === s.value ? "border-primary bg-primary/10 text-primary" : "border-border hover:bg-secondary"
                  }`}
                >
                  {s.label}
                </button>
              ))}
            </div>
          </div>

          {/* Valor Total */}
          <div className="space-y-2">
            <Label>Valor Total (R$)</Label>
            <Input
              type="number"
              value={valorTotal || ""}
              onChange={(e) => setValorTotal(parseFloat(e.target.value) || 0)}
              min={0}
              step={0.01}
            />
          </div>

          {/* Desconto */}
          <div className="space-y-2">
            <Label>Desconto (%)</Label>
            <Input
              type="number"
              value={descontoPercentual || ""}
              onChange={(e) => setDescontoPercentual(parseFloat(e.target.value) || 0)}
              min={0}
              max={100}
              step={0.5}
            />
          </div>

          {/* Forma de pagamento */}
          <div className="space-y-2">
            <Label>Forma de Pagamento</Label>
            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={() => setFormaPagamento("avista")}
                className={`px-4 py-3 rounded-lg border text-sm font-medium transition-colors ${
                  formaPagamento === "avista" ? "border-primary bg-primary/10 text-primary" : "border-border hover:bg-secondary"
                }`}
              >
                À Vista
              </button>
              <button
                onClick={() => setFormaPagamento("parcelado")}
                className={`px-4 py-3 rounded-lg border text-sm font-medium transition-colors ${
                  formaPagamento === "parcelado" ? "border-primary bg-primary/10 text-primary" : "border-border hover:bg-secondary"
                }`}
              >
                Parcelado
              </button>
            </div>
          </div>

          {formaPagamento === "parcelado" && (
            <>
              {/* Entrada */}
              <div className="space-y-2">
                <Label>Valor de Entrada (R$)</Label>
                <Input
                  type="number"
                  value={valorEntrada || ""}
                  onChange={(e) => setValorEntrada(parseFloat(e.target.value) || 0)}
                  min={0}
                  step={0.01}
                />
              </div>

              {/* Frequência */}
              <div className="space-y-2">
                <Label>Frequência do Parcelamento</Label>
                <div className="grid grid-cols-3 gap-2">
                  {(["semana", "quinzena", "mes"] as const).map((f) => (
                    <button
                      key={f}
                      onClick={() => setFrequencia(f)}
                      className={`px-3 py-2 rounded-lg border text-sm font-medium transition-colors ${
                        frequencia === f ? "border-primary bg-primary/10 text-primary" : "border-border hover:bg-secondary"
                      }`}
                    >
                      {frequenciaLabels[f]}
                    </button>
                  ))}
                </div>
              </div>

              {/* Parcelas */}
              <div className="space-y-2">
                <Label>Número de Parcelas</Label>
                <div className="flex gap-1 flex-wrap">
                  {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map((n) => (
                    <button
                      key={n}
                      onClick={() => { setNumParcelas(n); }}
                      className={`px-2.5 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                        numParcelas === n ? "bg-primary text-primary-foreground" : "bg-secondary hover:bg-secondary/80"
                      }`}
                    >
                      {n}x
                    </button>
                  ))}
                </div>
              </div>

              {/* Valor da Parcela */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label>Valor da Parcela (R$)</Label>
                  <Button variant="ghost" size="sm" className="text-xs h-6" onClick={recalcularParcela}>
                    Recalcular
                  </Button>
                </div>
                <Input
                  type="number"
                  value={valorParcela || ""}
                  onChange={(e) => setValorParcela(parseFloat(e.target.value) || 0)}
                  min={0}
                  step={0.01}
                />
                {Math.abs(valorParcela - parcelaCalculada) > 0.01 && (
                  <p className="text-xs text-muted-foreground">
                    Valor calculado: {formatCurrency(parcelaCalculada)}
                  </p>
                )}
              </div>

              {/* Data início */}
              <div className="space-y-2">
                <Label>Data do 1º Pagamento</Label>
                <Input
                  type="date"
                  value={dataInicio}
                  onChange={(e) => setDataInicio(e.target.value)}
                />
              </div>
            </>
          )}

          {/* Observações */}
          <div className="space-y-2">
            <Label>Observações</Label>
            <Textarea
              value={observacoes}
              onChange={(e) => setObservacoes(e.target.value)}
              rows={2}
              placeholder="Anotações sobre a venda..."
            />
          </div>

          {/* Preview */}
          <div className="bg-secondary/30 rounded-xl p-4 space-y-2">
            <div className="flex justify-between font-extrabold">
              <span>Total</span>
              <span className="tabular-nums">{formatCurrency(valorTotal)}</span>
            </div>
            {formaPagamento === "parcelado" && (
              <>
                {valorEntrada > 0 && (
                  <div className="flex justify-between text-sm text-muted-foreground">
                    <span>Entrada</span>
                    <span className="tabular-nums">- {formatCurrency(valorEntrada)}</span>
                  </div>
                )}
                <div className="flex justify-between text-sm font-semibold text-primary">
                  <span>{numParcelas}x {frequenciaLabels[frequencia]}</span>
                  <span className="tabular-nums">{formatCurrency(valorParcela)}</span>
                </div>
              </>
            )}
          </div>

          <Button onClick={handleSave} disabled={saving} className="w-full gap-2">
            <Save className="w-4 h-4" />
            {saving ? "Salvando..." : "Salvar Alterações"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default EditVendaDialog;
