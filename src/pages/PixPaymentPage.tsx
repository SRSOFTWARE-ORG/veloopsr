import { useEffect, useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import { QRCodeSVG } from "qrcode.react";
import { Copy, Check, QrCode } from "lucide-react";

// ── PIX BR Code (EMV) generator ──
function computeCRC16(str: string): string {
  let crc = 0xffff;
  for (let i = 0; i < str.length; i++) {
    crc ^= str.charCodeAt(i) << 8;
    for (let j = 0; j < 8; j++) {
      crc = crc & 0x8000 ? (crc << 1) ^ 0x1021 : crc << 1;
      crc &= 0xffff;
    }
  }
  return crc.toString(16).toUpperCase().padStart(4, "0");
}

function tlv(id: string, value: string): string {
  return `${id}${value.length.toString().padStart(2, "0")}${value}`;
}

function generatePixPayload(pixKey: string, merchantName: string, merchantCity: string, amount: number, txId?: string): string {
  const gui = tlv("00", "br.gov.bcb.pix");
  const key = tlv("01", pixKey);
  const merchantAccount = tlv("26", gui + key);

  let payload = "";
  payload += tlv("00", "01"); // format indicator
  payload += merchantAccount;
  payload += tlv("52", "0000"); // MCC
  payload += tlv("53", "986"); // BRL
  if (amount > 0) {
    payload += tlv("54", amount.toFixed(2));
  }
  payload += tlv("58", "BR");
  payload += tlv("59", merchantName.substring(0, 25));
  payload += tlv("60", merchantCity.substring(0, 15));
  if (txId) {
    payload += tlv("62", tlv("05", txId.substring(0, 25)));
  }
  // CRC placeholder
  payload += "6304";
  const crc = computeCRC16(payload);
  return payload + crc;
}

// ── PIX config ──
const PIX_KEY_CPF = "18827317783"; // CPF sem pontuação como chave PIX
const MERCHANT_NAME = "Silvio R Cruz Junior";
const MERCHANT_CITY = "SAO PAULO";

export default function PixPaymentPage() {
  const { cobrancaId, dataVencimento } = useParams<{ cobrancaId: string; dataVencimento: string }>();
  const [copied, setCopied] = useState(false);

  // Parse amount and client info from URL search params
  const searchParams = new URLSearchParams(window.location.search);
  const valor = parseFloat(searchParams.get("valor") || "0");
  const clienteNome = searchParams.get("cliente") || "Cliente";
  const parcela = searchParams.get("parcela") || "";

  const pixCode = useMemo(() => {
    if (valor <= 0) return "";
    const txId = `VLP${(cobrancaId || "").substring(0, 10).replace(/-/g, "")}`;
    return generatePixPayload(PIX_KEY_CPF, MERCHANT_NAME, MERCHANT_CITY, valor, txId);
  }, [valor, cobrancaId]);

  const handleCopy = async () => {
    if (!pixCode) return;
    try {
      await navigator.clipboard.writeText(pixCode);
      setCopied(true);
      setTimeout(() => setCopied(false), 3000);
    } catch {
      const ta = document.createElement("textarea");
      ta.value = pixCode;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      document.body.removeChild(ta);
      setCopied(true);
      setTimeout(() => setCopied(false), 3000);
    }
  };

  const valorFormatado = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(valor);
  const dataFormatada = dataVencimento ? dataVencimento.split("-").reverse().join("/") : "";

  if (!pixCode) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
        <div className="bg-white rounded-2xl shadow-lg p-8 max-w-md w-full text-center">
          <p className="text-gray-500">Link de pagamento inválido ou sem valor.</p>
        </div>
      </div>
    );
  }

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
            <div className="flex justify-between border-t pt-2 mt-2">
              <span className="text-gray-500 font-medium">Valor</span>
              <span className="font-bold text-green-700 text-lg">{valorFormatado}</span>
            </div>
          </div>
        </div>

        {/* QR Code */}
        <div className="flex flex-col items-center px-6 py-4">
          <div className="bg-white border-2 border-green-200 rounded-2xl p-4 shadow-sm">
            <QRCodeSVG
              value={pixCode}
              size={220}
              level="M"
              includeMargin
              bgColor="#ffffff"
              fgColor="#000000"
            />
          </div>
          <p className="text-xs text-gray-400 mt-2">Escaneie o QR Code com o app do seu banco</p>
        </div>

        {/* Copia e Cola */}
        <div className="px-6 pb-6">
          <p className="text-xs text-gray-500 mb-2 text-center font-medium">Ou copie o código PIX:</p>
          <div className="bg-gray-50 rounded-xl p-3 border border-gray-200">
            <p className="text-xs text-gray-600 break-all font-mono leading-relaxed max-h-20 overflow-y-auto">
              {pixCode}
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
            Destinatário: Silvio Rodrigues da Cruz Junior · CPF: 188.***.***-83
          </p>
        </div>
      </div>
    </div>
  );
}
