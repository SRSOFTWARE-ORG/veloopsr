import { useEffect, useMemo, useState } from "react";
import { format, parseISO, differenceInCalendarDays, addDays } from "date-fns";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { CurrencyInput } from "@/components/ui/currency-input";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Badge } from "@/components/ui/badge";
import { formatCurrency } from "@/lib/masks";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Loader2, AlertCircle } from "lucide-react";

const JUROS_DIA = 3;

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  cobrancaId: string;
  dataVencimento: string;
  valorParcela: number;
  clienteNome: string;
  subParcelaId?: string | null;
  onSuccess?: () => void;
}

type Destino = "proxima_parcela" | "sub_parcela_data" | "sub_parcela_dias";

export default function PartialPaymentDialog({
  open, onOpenChange, cobrancaId, dataVencimento, valorParcela, clienteNome, subParcelaId, onSuccess,
}: Props) {
  const [valorPago, setValorPago] = useState(0);
  const [destino, setDestino] = useState<Destino>("proxima_parcela");
  const [dataSub, setDataSub] = useState<string>("");
  const [diasSub, setDiasSub] = useState<string>("7");
  const [saving, setSaving] = useState(false);

  const hoje = new Date();
  const venc = parseISO(dataVencimento);
  const diasAtraso = Math.max(0, differenceInCalendarDays(hoje, venc));
  const juros = diasAtraso * JUROS_DIA;
  const totalDevido = useMemo(() => valorParcela + juros, [valorParcela, juros]);
  const saldoRestante = Math.max(0, totalDevido - valorPago);
  const isParcial = saldoRestante > 0.009 && valorPago > 0;

  useEffect(() => {
    if (open) {
      setValorPago(0);
      setDestino("proxima_parcela");
      setDataSub(format(addDays(new Date(), 7), "yyyy-MM-dd"));
      setDiasSub("7");
    }
  }, [open]);

  const handleSubmit = async () => {
    if (valorPago <= 0) {
      toast.error("Informe o valor pago");
      return;
    }
    if (valorPago > totalDevido + 0.01) {
      toast.error("Valor pago não pode ser maior que o total devido");
      return;
    }

    let destinoApi: "proxima_parcela" | "sub_parcela" | "nenhum" = "nenhum";
    let dataSubFinal: string | undefined;
    let diasSubFinal: number | undefined;

    if (isParcial) {
      if (destino === "proxima_parcela") destinoApi = "proxima_parcela";
      else if (destino === "sub_parcela_data") {
        if (!dataSub) { toast.error("Selecione a data da cobrança avulsa"); return; }
        destinoApi = "sub_parcela";
        dataSubFinal = dataSub;
      } else {
        const n = parseInt(diasSub || "0", 10);
        if (!n || n < 1) { toast.error("Informe os dias para cobrança avulsa"); return; }
        destinoApi = "sub_parcela";
        diasSubFinal = n;
      }
    }

    setSaving(true);
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const accessToken = sessionData.session?.access_token;
      if (!accessToken) throw new Error("Sessão expirada. Entre novamente para registrar o pagamento.");
      const { data, error } = await supabase.functions.invoke("register-partial-payment", {
        headers: { Authorization: `Bearer ${accessToken}` },
        body: {
          cobranca_id: cobrancaId,
          data_vencimento: dataVencimento,
          valor_pago: valorPago,
          destino_saldo: destinoApi,
          data_sub_parcela: dataSubFinal,
          dias_sub_parcela: diasSubFinal,
          sub_parcela_id: subParcelaId ?? null,
        },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      toast.success(
        isParcial
          ? `Pagamento parcial registrado. Nova cobrança de ${formatCurrency(saldoRestante)} criada.`
          : "Pagamento registrado!"
      );
      onSuccess?.();
      onOpenChange(false);
    } catch (err: any) {
      console.error(err);
      toast.error(err.message || "Erro ao registrar pagamento");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[calc(100%-2rem)] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Pagamento Parcial — {clienteNome}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 pt-2">
          <div className="rounded-lg border bg-muted/40 p-3 space-y-1 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Valor original</span>
              <span className="font-medium">{formatCurrency(valorParcela)}</span>
            </div>
            {juros > 0 && (
              <div className="flex justify-between text-amber-700 dark:text-amber-400">
                <span>Juros ({diasAtraso} dia{diasAtraso > 1 ? "s" : ""} de atraso)</span>
                <span className="font-medium">{formatCurrency(juros)}</span>
              </div>
            )}
            <div className="flex justify-between border-t pt-1 mt-1">
              <span className="font-semibold">Total devido</span>
              <span className="font-bold">{formatCurrency(totalDevido)}</span>
            </div>
          </div>

          <div className="space-y-2">
            <Label>Valor pago no ato *</Label>
            <CurrencyInput value={valorPago} onValueChange={setValorPago} />
          </div>

          {valorPago > 0 && (
            <div className={`rounded-lg p-3 text-sm border ${isParcial ? "bg-amber-500/10 border-amber-500/30" : "bg-emerald-500/10 border-emerald-500/30"}`}>
              <div className="flex justify-between items-center">
                <span className="text-muted-foreground">Saldo restante</span>
                <Badge variant="outline" className={isParcial ? "border-amber-500/40 text-amber-700" : "border-emerald-500/40 text-emerald-700"}>
                  {formatCurrency(saldoRestante)}
                </Badge>
              </div>
            </div>
          )}

          {isParcial && (
            <div className="space-y-3">
              <Label className="flex items-center gap-2">
                <AlertCircle className="w-4 h-4 text-amber-600" />
                Destino do saldo restante *
              </Label>
              <RadioGroup value={destino} onValueChange={(v) => setDestino(v as Destino)}>
                <div className="flex items-start gap-2 rounded-md border p-3">
                  <RadioGroupItem value="proxima_parcela" id="d1" className="mt-0.5" />
                  <Label htmlFor="d1" className="font-normal cursor-pointer flex-1">
                    <span className="font-medium">Gerar cobrança na data da próxima parcela</span>
                    <p className="text-xs text-muted-foreground">O saldo vira uma nova cobrança normal na próxima data desta cobrança.</p>
                  </Label>
                </div>
                <div className="flex items-start gap-2 rounded-md border p-3">
                  <RadioGroupItem value="sub_parcela_data" id="d2" className="mt-0.5" />
                  <Label htmlFor="d2" className="font-normal cursor-pointer flex-1">
                    <span className="font-medium">Cobrança avulsa em data específica</span>
                    {destino === "sub_parcela_data" && (
                      <Input
                        type="date"
                        value={dataSub}
                        onChange={(e) => setDataSub(e.target.value)}
                        className="mt-2"
                        min={format(new Date(), "yyyy-MM-dd")}
                      />
                    )}
                  </Label>
                </div>
                <div className="flex items-start gap-2 rounded-md border p-3">
                  <RadioGroupItem value="sub_parcela_dias" id="d3" className="mt-0.5" />
                  <Label htmlFor="d3" className="font-normal cursor-pointer flex-1">
                    <span className="font-medium">Cobrança avulsa em X dias</span>
                    {destino === "sub_parcela_dias" && (
                      <Input
                        type="number"
                        min={1}
                        value={diasSub}
                        onChange={(e) => setDiasSub(e.target.value)}
                        className="mt-2 w-32"
                        placeholder="7"
                      />
                    )}
                  </Label>
                </div>
              </RadioGroup>
            </div>
          )}

          <Button onClick={handleSubmit} disabled={saving || valorPago <= 0} className="w-full">
            {saving ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
            {isParcial ? "Registrar Pagamento Parcial" : "Registrar Pagamento"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
