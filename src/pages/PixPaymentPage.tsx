import { useEffect, useMemo, useState, useCallback } from "react";
import { useParams } from "react-router-dom";
import { QRCodeSVG } from "qrcode.react";
import { Copy, Check, QrCode, Loader2, CheckCircle2 } from "lucide-react";

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

export default function PixPaymentPage() {
  const { cobrancaId, dataVencimento } = useParams<{ cobrancaId: string; dataVencimento: string }>();
  const [copied, setCopied] = useState(false);
  const [loading, setLoading] = useState(true);
  const [pixData, setPixData] = useState<{
    mp_qr_code_base64?: string;
    mp_copia_cola?: string;
    status?: string;
    already_paid?: boolean;
  } | null>(null);
  const [error, setError] = useState("");
  const [paid, setPaid] = useState(false);

  const searchParams = new URLSearchParams(window.location.search);
  const valorBase = parseFloat(searchParams.get("valor") || "0");
  const clienteNome = searchParams.get("cliente") || "Cliente";
  const parcela = searchParams.get("parcela") || "";
  const clienteId = searchParams.get("cliente_id") || "";

  // Calculate interest: R$2/day starting on day 1 of overdue
  const jurosInfo = useMemo(() => {
    if (!dataVencimento) return { diasAtraso: 0, diasComJuros: 0, juros: 0, valorFinal: valorBase };
    const hoje = new Date();
    hoje.setHours(0, 0, 0, 0);
    const venc = new Date(`${dataVencimento}T00:00:00`);
    const diffMs = hoje.getTime() - venc.getTime();
    const diasAtraso = Math.max(0, Math.floor(diffMs / (1000 * 60 * 60 * 24)));
    const diasComJuros = diasAtraso; // juros desde o 1º dia de atraso
    const juros = diasComJuros * 2; // R$2 per day
    return { diasAtraso, diasComJuros, juros, valorFinal: valorBase + juros };
  }, [dataVencimento, valorBase]);

  const valor = jurosInfo.valorFinal;
  const valorFormatado = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(valor);
  const valorBaseFormatado = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(valorBase);
  const jurosFormatado = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(jurosInfo.juros);
  const dataFormatada = dataVencimento ? dataVencimento.split("-").reverse().join("/") : "";

  // Create PIX payment
  useEffect(() => {
    if (!cobrancaId || !dataVencimento || valor <= 0) {
      setLoading(false);
      setError("Link de pagamento inválido.");
      return;
    }

    const createPayment = async () => {
      try {
        const res = await fetch(`${SUPABASE_URL}/functions/v1/create-pix-payment`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "apikey": SUPABASE_KEY,
          },
          body: JSON.stringify({
            cobranca_id: cobrancaId,
            data_vencimento: dataVencimento,
            valor,
            cliente_nome: clienteNome,
            cliente_id: clienteId || undefined,
          }),
        });

        const data = await res.json();

        if (!res.ok) {
          setError(data.error || "Erro ao criar pagamento.");
          return;
        }

        if (data.already_paid) {
          setPaid(true);
          setPixData(data.payment);
        } else {
          setPixData(data.payment);
        }
      } catch (err) {
        setError("Erro de conexão. Tente novamente.");
      } finally {
        setLoading(false);
      }
    };

    createPayment();
  }, [cobrancaId, dataVencimento, valor, clienteNome, clienteId]);

  // Poll for payment status
  useEffect(() => {
    if (paid || !pixData?.mp_copia_cola) return;

    const interval = setInterval(async () => {
      try {
        const res = await fetch(
          `${SUPABASE_URL}/rest/v1/pix_payments?cobranca_id=eq.${cobrancaId}&data_vencimento=eq.${dataVencimento}&select=status&order=created_at.desc&limit=1`,
          { headers: { "apikey": SUPABASE_KEY, "Authorization": `Bearer ${SUPABASE_KEY}` } }
        );
        const data = await res.json();
        if (data?.[0]?.status === "approved") {
          setPaid(true);
          clearInterval(interval);
        }
      } catch {}
    }, 5000);

    return () => clearInterval(interval);
  }, [paid, pixData, cobrancaId, dataVencimento]);

  const handleCopy = useCallback(async () => {
    const code = pixData?.mp_copia_cola;
    if (!code) return;
    try {
      await navigator.clipboard.writeText(code);
    } catch {
      const ta = document.createElement("textarea");
      ta.value = code;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      document.body.removeChild(ta);
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 3000);
  }, [pixData]);

  // Loading state
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-green-50 via-white to-emerald-50 p-4">
        <div className="bg-white rounded-2xl shadow-xl max-w-md w-full p-8 text-center">
          <Loader2 className="h-12 w-12 animate-spin text-green-600 mx-auto mb-4" />
          <p className="text-gray-600 font-medium">Gerando pagamento PIX...</p>
          <p className="text-gray-400 text-sm mt-1">Aguarde um momento</p>
        </div>
      </div>
    );
  }

  // Error state
  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
        <div className="bg-white rounded-2xl shadow-lg p-8 max-w-md w-full text-center">
          <p className="text-red-500 font-medium">{error}</p>
        </div>
      </div>
    );
  }

  // Paid state
  if (paid) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-green-50 via-white to-emerald-50 p-4">
        <div className="bg-white rounded-2xl shadow-xl max-w-md w-full overflow-hidden">
          <div className="bg-gradient-to-r from-green-500 to-emerald-500 px-6 py-8 text-white text-center">
            <CheckCircle2 className="h-16 w-16 mx-auto mb-3" />
            <h1 className="text-2xl font-bold">Pagamento Confirmado!</h1>
            <p className="text-green-100 mt-1">Recebemos seu PIX com sucesso</p>
          </div>
          <div className="px-6 py-6">
            <div className="bg-green-50 rounded-xl p-4 space-y-2 text-sm border border-green-200">
              <div className="flex justify-between">
                <span className="text-gray-500">Cliente</span>
                <span className="font-medium text-gray-800">{clienteNome}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">Parcela</span>
                <span className="font-medium text-gray-800">{dataFormatada}</span>
              </div>
              <div className="flex justify-between border-t border-green-200 pt-2 mt-2">
                <span className="text-gray-500 font-medium">Valor</span>
                <span className="font-bold text-green-700 text-lg">{valorFormatado}</span>
              </div>
            </div>
            <p className="text-center text-gray-400 text-xs mt-4">
              Uma confirmação foi enviada para seu WhatsApp.
            </p>
          </div>
          <div className="border-t px-6 py-3 bg-gray-50 text-center">
            <p className="text-[10px] text-gray-400">SR Software — Veloop 🟢</p>
          </div>
        </div>
      </div>
    );
  }

  const copiaCola = pixData?.mp_copia_cola || "";
  const qrBase64 = pixData?.mp_qr_code_base64 || "";

  return (
    <div className="min-h-screen bg-gradient-to-br from-green-50 via-white to-emerald-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-xl max-w-md w-full overflow-hidden">
        {/* Header */}
        <div className="bg-gradient-to-r from-green-600 to-emerald-600 px-6 py-5 text-white text-center">
          <div className="flex items-center justify-center gap-2 mb-1">
            <QrCode className="h-6 w-6" />
            <h1 className="text-xl font-bold">Pagamento via PIX</h1>
          </div>
          <p className="text-green-100 text-sm">SR Software — Veloop</p>
        </div>

        {/* Client info */}
        <div className="px-6 pt-5 pb-3">
          <div className="bg-gray-50 rounded-xl p-4 space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-gray-500">Cliente</span>
              <span className="font-medium text-gray-800">{clienteNome}</span>
            </div>
            {parcela && (
              <div className="flex justify-between">
                <span className="text-gray-500">Parcela</span>
                <span className="font-medium text-gray-800">{parcela}</span>
              </div>
            )}
            <div className="flex justify-between">
              <span className="text-gray-500">Vencimento</span>
              <span className="font-medium text-gray-800">{dataFormatada}</span>
            </div>
            {jurosInfo.juros > 0 ? (
              <>
                <div className="flex justify-between border-t pt-2 mt-2">
                  <span className="text-gray-500">Valor original</span>
                  <span className="font-medium text-gray-800">{valorBaseFormatado}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-red-500 font-medium">Juros ({jurosInfo.diasComJuros} dia{jurosInfo.diasComJuros !== 1 ? 's' : ''} × R$2,00)</span>
                  <span className="font-bold text-red-600">+{jurosFormatado}</span>
                </div>
                <div className="flex justify-between border-t pt-2 mt-1">
                  <span className="text-gray-500 font-medium">Total a pagar</span>
                  <span className="font-bold text-green-700 text-lg">{valorFormatado}</span>
                </div>
                <div className="bg-red-50 border border-red-200 rounded-lg p-2 mt-2">
                  <p className="text-xs text-red-600 font-medium text-center">
                    ⚠️ Juros de R$2,00/dia aplicados desde o 1º dia de atraso
                  </p>
                </div>
              </>
            ) : (
              <div className="flex justify-between border-t pt-2 mt-2">
                <span className="text-gray-500 font-medium">Valor</span>
                <span className="font-bold text-green-700 text-lg">{valorFormatado}</span>
              </div>
            )}
          </div>
        </div>

        {/* QR Code */}
        <div className="flex flex-col items-center px-6 py-4">
          <div className="bg-white border-2 border-green-200 rounded-2xl p-4 shadow-sm">
            {qrBase64 ? (
              <img src={`data:image/png;base64,${qrBase64}`} alt="QR Code PIX" className="w-[220px] h-[220px]" />
            ) : copiaCola ? (
              <QRCodeSVG value={copiaCola} size={220} level="M" includeMargin bgColor="#ffffff" fgColor="#000000" />
            ) : null}
          </div>
          <p className="text-xs text-gray-400 mt-2">Escaneie o QR Code com o app do seu banco</p>
          <div className="flex items-center gap-1.5 mt-2 text-xs text-amber-600 bg-amber-50 px-3 py-1.5 rounded-full">
            <Loader2 className="h-3 w-3 animate-spin" />
            Aguardando pagamento...
          </div>
        </div>

        {/* Copia e Cola */}
        <div className="px-6 pb-6">
          <p className="text-xs text-gray-500 mb-2 text-center font-medium">Ou copie o código PIX:</p>
          <div className="bg-gray-50 rounded-xl p-3 border border-gray-200">
            <p className="text-xs text-gray-600 break-all font-mono leading-relaxed max-h-20 overflow-y-auto">
              {copiaCola}
            </p>
          </div>
          <button
            onClick={handleCopy}
            className={`mt-3 w-full flex items-center justify-center gap-2 py-3 rounded-xl font-semibold text-white transition-all ${
              copied
                ? "bg-green-500"
                : "bg-gradient-to-r from-green-600 to-emerald-600 hover:from-green-700 hover:to-emerald-700 active:scale-[0.98]"
            }`}
          >
            {copied ? <Check className="h-5 w-5" /> : <Copy className="h-5 w-5" />}
            {copied ? "Copiado!" : "Copiar PIX Copia e Cola"}
          </button>
        </div>

        {/* Footer */}
        <div className="border-t px-6 py-3 bg-gray-50 text-center">
          <p className="text-[10px] text-gray-400">
            Pagamento processado pelo Mercado Pago · Ambiente seguro 🔒
          </p>
        </div>
      </div>
    </div>
  );
}
