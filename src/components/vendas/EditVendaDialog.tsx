import { useState, useEffect } from "react";
import { formatCurrency } from "@/lib/masks";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { CurrencyInput } from "@/components/ui/currency-input";
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
  const queryClient = useQueryClient();

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
    if (valorTotal <= 0) { toast.error("Valor total deve ser maior que R$ 0,00"); return; }
    if (formaPagamento === "parcelado" && valorParcela <= 0) { toast.error("Valor da parcela deve ser maior que R$ 0,00"); return; }
    if (!clienteNome.trim()) { toast.error("Nome do cliente é obrigatório"); return; }
    setSaving(true);
    try {
      const novaEntrada = formaPagamento === "parcelado" ? valorEntrada : 0;
      const { error } = await supabase
        .from("vendas")
        .update({
          cliente_nome: clienteNome,
          cliente_telefone: clienteTelefone || null,
          cliente_cpf: clienteCpf || null,
          valor_total: valorTotal,
          valor_entrada: novaEntrada,
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
        return;
      }

      // ===== Sincroniza cobranças/pagamentos vinculados a esta venda =====
      // 1) Apaga registros antigos da entrada (gerados automaticamente)
      const tag = `Entrada da venda #${venda.id.slice(0, 8)}`;
      const { data: cobrancasAntigas } = await supabase
        .from("cobrancas")
        .select("id")
        .ilike("observacoes", `%${tag}%`);

      const idsAntigos = (cobrancasAntigas || []).map((c) => c.id);
      if (idsAntigos.length > 0) {
        await supabase.from("cobranca_pagamentos").delete().in("cobranca_id", idsAntigos);
        await supabase.from("cobrancas").delete().in("id", idsAntigos);
      }

      // 2) Recria a entrada com o valor novo (se houver)
      if (novaEntrada > 0 && status === "concluida") {
        const { data: { user } } = await supabase.auth.getUser();
        const dataEntrada = new Date().toISOString().split("T")[0];

        // Tenta achar cliente_id pelo nome/cpf
        let clienteId: string | null = null;
        if (clienteCpf) {
          const { data: cli } = await supabase
            .from("clientes").select("id").eq("cpf", clienteCpf).maybeSingle();
          clienteId = cli?.id || null;
        }
        if (!clienteId) {
          const { data: cli } = await supabase
            .from("clientes").select("id").ilike("nome", clienteNome.trim()).limit(1).maybeSingle();
          clienteId = cli?.id || null;
        }

        const { data: cob } = await supabase.from("cobrancas").insert({
          cliente_id: clienteId || "00000000-0000-0000-0000-000000000000",
          cliente_nome: clienteNome.trim(),
          valor_parcela: novaEntrada,
          data_inicio: dataEntrada,
          data_fim: dataEntrada,
          frequencia: "mes",
          criado_por: user!.id,
          observacoes: tag,
        }).select().single();

        if (cob) {
          await supabase.from("cobranca_pagamentos").insert({
            cobranca_id: cob.id,
            data_vencimento: dataEntrada,
            status: "pago",
            pago_em: new Date().toISOString(),
            pago_por: user!.id,
            tipo_pagamento: "entrada",
          });
        }
      }

      // 3) Invalida caches e notifica todas as telas para recarregar
      queryClient.invalidateQueries();
      window.dispatchEvent(new CustomEvent("venda-updated", { detail: { id: venda.id } }));

      toast.success("Venda atualizada — dados antigos substituídos");
      onOpenChange(false);
      onSaved();
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
            <CurrencyInput
              value={valorTotal}
              onValueChange={(v) => setValorTotal(v)}
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
                <CurrencyInput
                  value={valorEntrada}
                  onValueChange={(v) => setValorEntrada(v)}
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
                <CurrencyInput
                  value={valorParcela}
                  onValueChange={(v) => setValorParcela(v)}
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
