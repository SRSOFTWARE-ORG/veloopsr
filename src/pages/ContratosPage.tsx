import { useCallback, useEffect, useRef, useState } from "react";
import type { PointerEvent as ReactPointerEvent } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { FileSignature, FileText, Loader2, PenLine, Printer, RefreshCw, ShieldCheck } from "lucide-react";

type Sale = {
  id: string; cliente_nome: string; cliente_telefone: string | null; cliente_cpf: string | null;
  valor_total: number; valor_entrada: number | null; num_parcelas: number | null; valor_parcela: number | null;
  status: string; created_at: string; vendedor_id: string; forma_pagamento?: string | null;
  frequencia_parcela?: string | null; data_inicio_pagamento?: string | null; observacoes?: string | null;
};
type Contract = {
  id: string; venda_id: string; status: string; contract_data: Record<string, unknown>;
  document_html: string; document_sha256: string; created_at: string; signed_at: string | null;
};
type Signature = { id: string; contract_id: string; signer_role: string; signer_name: string; signed_at: string; };
type SaleItem = { nome: string; quantidade: number; preco_unitario: number; subtotal: number; };
const money = (v: unknown) => new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(Number(v || 0));
const dateBR = (v: string | null | undefined) => v ? new Date(v.length === 10 ? v + "T12:00:00" : v).toLocaleDateString("pt-BR") : "Não informado";
const esc = (v: unknown) => String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c] || c));
const sha256 = async (value: string) => {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, "0")).join("");
};
function buildContractHtml(sale: Sale, items: SaleItem[], sellerName: string, customer: Record<string, unknown> | null, data: Record<string, unknown>) {
  const get = (key: string, fallback = "Não informado") => esc(data[key] || customer?.[key] || fallback);
  const productRows = items.map((item) => `<tr><td>${esc(item.nome)}</td><td>${item.quantidade}</td><td>${money(item.preco_unitario)}</td><td>${money(item.subtotal)}</td></tr>`).join("");
  const frequency = ({ semana: "semanal", quinzena: "quinzenal", mes: "mensal" } as Record<string, string>)[sale.frequencia_parcela || ""] || sale.forma_pagamento || "Não informado";
  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Contrato de compra e venda parcelada — SR SOFTWARE</title>
<style>
@page{size:A4;margin:17mm}*{box-sizing:border-box}body{font:10.5pt/1.5 Arial,sans-serif;color:#202124;margin:0}h1{text-align:center;font-size:17pt;margin:0 0 4px}h2{font-size:12pt;margin:22px 0 6px;border-bottom:1px solid #bbb;padding-bottom:4px}h3{font-size:10.5pt;margin:12px 0 4px}.brand{text-align:center;color:#444;font-weight:bold;letter-spacing:2px}.sub{text-align:center;color:#555;margin-bottom:20px}.field{display:inline-block;min-width:160px;border-bottom:1px solid #999;padding:1px 4px}.grid{display:grid;grid-template-columns:1fr 1fr;gap:8px 18px}.box{border:1px solid #bbb;border-radius:4px;padding:10px;margin:8px 0}table{width:100%;border-collapse:collapse;margin:10px 0}th,td{border:1px solid #bbb;padding:6px;text-align:left}th{background:#f2f2f2}.signature{margin-top:30px;display:grid;grid-template-columns:1fr 1fr;gap:45px}.signline{border-top:1px solid #333;padding-top:6px;text-align:center;margin-top:42px}.small{font-size:8.5pt;color:#555}.pagebreak{break-before:page}.clause{margin:5px 0}.footer{border-top:1px solid #ddd;margin-top:24px;padding-top:7px;font-size:8pt;color:#666}
</style></head><body>
<div class="brand">SR SOFTWARE</div><h1>CONTRATO PARTICULAR DE COMPRA E VENDA PARCELADA DE APARELHO CELULAR</h1><div class="sub">Condições de pagamento, entrega, gerenciamento do aparelho e documentos complementares</div>
<h2>1. IDENTIFICAÇÃO DAS PARTES</h2><div class="box"><b>VENDEDOR</b><div class="grid"><div>Nome fantasia: <span class="field">SR SOFTWARE</span></div><div>CNPJ informado: <span class="field">64.909.239/0001-61</span></div><div>Razão social/titular: <span class="field">${get("vendedor_razao_social")}</span></div><div>Endereço: <span class="field">${get("vendedor_endereco")}</span></div><div>Cidade/UF: <span class="field">${get("vendedor_cidade")}</span></div><div>Telefone/WhatsApp: <span class="field">${get("vendedor_telefone")}</span></div><div>E-mail: <span class="field">${get("vendedor_email")}</span></div></div></div>
<div class="box"><b>COMPRADOR</b><div class="grid"><div>Nome completo: <span class="field">${esc(sale.cliente_nome)}</span></div><div>CPF: <span class="field">${esc(sale.cliente_cpf || customer?.cpf || "Não informado")}</span></div><div>RG: <span class="field">${get("rg")}</span></div><div>Nascimento: <span class="field">${get("data_nascimento")}</span></div><div>Estado civil: <span class="field">${get("estado_civil")}</span></div><div>Profissão: <span class="field">${get("profissao")}</span></div><div>Endereço: <span class="field">${get("endereco")}</span></div><div>Cidade/UF: <span class="field">${get("cidade_uf")}</span></div><div>Telefone/WhatsApp: <span class="field">${esc(sale.cliente_telefone || customer?.telefone || "Não informado")}</span></div><div>E-mail: <span class="field">${get("email")}</span></div></div></div>
<h2>2. IDENTIFICAÇÃO DO APARELHO</h2><div class="grid"><div>Marca: <span class="field">${get("marca")}</span></div><div>Modelo: <span class="field">${get("modelo", items.map(i=>i.nome).join(", "))}</span></div><div>Cor: <span class="field">${get("cor")}</span></div><div>Capacidade: <span class="field">${get("capacidade")}</span></div><div>IMEI 1: <span class="field">${get("imei1")}</span></div><div>IMEI 2: <span class="field">${get("imei2")}</span></div><div>Número de série: <span class="field">${get("numero_serie")}</span></div><div>Acessórios: <span class="field">${get("acessorios")}</span></div></div>
<h2>3. PREÇO E FORMA DE PAGAMENTO</h2><div class="box"><div class="grid"><div>Valor total da venda: <b>${money(sale.valor_total)}</b></div><div>Entrada: <b>${money(sale.valor_entrada)}</b></div><div>Saldo parcelado: <b>${money(Number(sale.valor_total)-Number(sale.valor_entrada||0))}</b></div><div>Quantidade de parcelas: <b>${sale.num_parcelas || 1}</b></div><div>Valor de cada parcela: <b>${money(sale.valor_parcela)}</b></div><div>Primeiro vencimento: <b>${dateBR(sale.data_inicio_pagamento)}</b></div><div>Demais vencimentos: <b>${frequency}</b></div><div>Meio: <b>${esc(sale.forma_pagamento || "Não informado")}</b></div></div></div>
<table><thead><tr><th>Produto</th><th>Qtd.</th><th>Valor unitário</th><th>Subtotal</th></tr></thead><tbody>${productRows || "<tr><td colspan='4'>Itens não vinculados à venda</td></tr>"}</tbody></table>
<h2>4. RESERVA DE DOMÍNIO — SUJEITA À VALIDADE LEGAL</h2><p class="clause">4.1. As partes registram a intenção de pactuar reserva de domínio sobre o aparelho até a quitação integral, nos termos dos artigos 521 e seguintes do Código Civil, quando aplicáveis. A validade e a eficácia perante terceiros dependem do atendimento dos requisitos legais, inclusive formalização adequada e registro quando exigido.</p><p class="clause">4.2. A reserva de domínio não autoriza o vendedor a tomar o aparelho à força, entrar em residência, constranger o comprador ou adotar medidas não permitidas por lei. A recuperação do bem deverá observar os procedimentos legais cabíveis.</p><p class="clause">4.3. Após a quitação integral, não subsistirá reserva de domínio por este contrato.</p>
<h2>5. ATRASO, MULTA E JUROS</h2><p class="clause">5.1. Em caso de atraso, será aplicada multa moratória máxima de 2% (dois por cento), uma única vez, sobre o valor da parcela vencida, observada a legislação de proteção do consumidor.</p><p class="clause">5.2. Além da multa, poderão incidir juros de mora proporcionais aos dias de atraso, desde que a taxa tenha sido informada previamente e seja legalmente permitida. Taxa acordada: ${get("juros_mora_mes", "conforme regra legal aplicável")}% ao mês. Se não houver taxa validamente estipulada, aplicam-se as regras legais pertinentes, inclusive o art. 406 do Código Civil, conforme alterado pela Lei nº 14.905/2024.</p><p class="clause">5.3. Não será cobrada multa diária adicional. O cálculo diário refere-se apenas à proporcionalidade dos juros de mora legalmente cabíveis.</p><p class="clause">5.4. Eventual vencimento antecipado dependerá de previsão clara, comunicação adequada e observância da legislação aplicável. Prazo para análise: ${get("prazo_atraso_dias")} dias.</p>
<h2>6. COBRANÇA</h2><p class="clause">6.1. O comprador poderá ser contatado pelos meios informados para avisos de vencimento e cobrança, sem exposição pública, ameaça, constrangimento ou contato abusivo com terceiros.</p><p class="clause">6.2. Persistindo o débito, o vendedor poderá utilizar os meios extrajudiciais e judiciais legalmente disponíveis. Despesas somente poderão ser exigidas quando houver base legal e comprovação aplicáveis.</p>
<h2>7. SISTEMA DE SEGURANÇA, GERENCIAMENTO E RASTREAMENTO</h2><p class="clause">7.1. O comprador declara ter sido informado, antes da assinatura, de que o aparelho possui ou poderá possuir sistema de gerenciamento, segurança e/ou localização, operado por: ${get("fornecedor_gerenciamento")}.</p><p class="clause">7.2. Finalidades informadas: ${get("finalidades_gerenciamento")}. O vendedor deverá explicar quais dados são coletados, quem tem acesso, por quanto tempo são mantidos e como exercer os direitos previstos na LGPD.</p><p class="clause">7.3. Este termo não representa autorização irrestrita para rastrear a pessoa, acessar conteúdo privado, monitorar comunicações ou bloquear remotamente o aparelho como coerção de pagamento. Qualquer bloqueio ou rastreamento deverá ter fundamento legítimo, ser proporcional e respeitar a lei.</p><p class="clause">7.4. Instruções e canal para dúvidas: ${get("canal_gerenciamento")}.</p>
<h2>8. OBRIGAÇÕES DO COMPRADOR</h2><p class="clause">8.1. Pagar as parcelas nos vencimentos ajustados e guardar os comprovantes.</p><p class="clause">8.2. Manter atualizados seus dados de contato e endereço.</p><p class="clause">8.3. Não praticar atos fraudulentos relacionados ao aparelho ou contrato. Restrições à venda, transferência ou disposição do aparelho serão interpretadas nos limites da lei e da validade da reserva de domínio.</p><p class="clause">8.4. Comunicar, quando possível, perda, furto, roubo ou defeito relevante do aparelho.</p>
<h2>9. INADIMPLEMENTO E EVENTUAL RECUPERAÇÃO DO BEM</h2><p class="clause">9.1. Em caso de inadimplência, o vendedor poderá notificar o comprador e buscar cobrança do saldo devido pelos meios legais. Eventual retomada dependerá do instrumento válido e do procedimento legal cabível.</p><p class="clause">9.2. É vedada a retirada forçada, ameaça, ingresso sem autorização em imóvel ou constrangimento. A devolução voluntária deverá ser documentada por recibo, com descrição do estado do aparelho e apuração transparente dos valores pagos e devidos.</p>
<h2>10. PROTEÇÃO DE DADOS PESSOAIS</h2><p class="clause">10.1. Os dados serão tratados para formalização e execução do contrato, prevenção a fraude, cumprimento de obrigações legais e cobrança legítima, conforme a Lei nº 13.709/2018 (LGPD), com acesso restrito e medidas de segurança adequadas.</p><p class="clause">10.2. Canal para solicitar informações sobre tratamento de dados: ${get("canal_lgpd")}.</p>
<h2>11. TERMO DE ENTREGA DO APARELHO</h2><p>O comprador declara receber o aparelho identificado neste contrato, acompanhado apenas dos acessórios descritos, após conferência conjunta.</p><div class="grid"><div>Data da entrega: ${get("data_entrega", dateBR(new Date().toISOString()))}</div><div>Horário: ${get("horario_entrega")}</div><div>Estado aparente: ${get("estado_aparelho", "Não informado")}</div><div>Observações/avarias: ${get("avarias")}</div></div>
<h2>12. DECLARAÇÃO DE CIÊNCIA DO COMPRADOR</h2><p>Declaro que li ou tive oportunidade de ler este contrato, que recebi explicações sobre as condições de pagamento e que receberei uma via assinada. Confirmo que recebi as informações do preço total, entrada, parcelas e vencimentos; fui informado sobre multa de mora de 2% por parcela vencida e juros aplicáveis; fui informado sobre o sistema de gerenciamento descrito; entendi os limites legais de cobrança; conferi o aparelho, IMEI e acessórios.</p>
<h2>13. NOTA PROMISSÓRIA — PREENCHER SOMENTE SE UTILIZADA</h2><p>Número: ${get("nota_promissoria_numero")} | Vencimento: ${get("nota_promissoria_vencimento")} | Valor: ${get("nota_promissoria_valor")} | Referente a: ${get("nota_promissoria_referencia")}. A nota promissória deve corresponder a obrigação certa, sem preenchimento abusivo ou cobrança em duplicidade. Recomenda-se orientação jurídica para definir valor, vencimento e vínculo com o contrato.</p>
<h2>14. DISPOSIÇÕES FINAIS E FORO</h2><p>14.1. Os campos preenchidos refletem o que foi acordado; alterações posteriores deverão ser registradas por escrito e aceitas pelas partes.</p><p>14.2. Este contrato não afasta direitos obrigatórios do consumidor nem autoriza cláusulas abusivas.</p><p>14.3. Será observado o foro legalmente competente, inclusive as regras protetivas aplicáveis ao consumidor.</p><p>Comarca/local: ${get("local_assinatura")} | Data: ${dateBR(new Date().toISOString())}</p>
<h2>15. ASSINATURAS ELETRÔNICAS</h2><p>As partes declaram que puderam ler o documento e concordam com o seu conteúdo. As assinaturas eletrônicas e evidências de aceite ficam vinculadas ao identificador e ao resumo criptográfico deste documento, sem afastar requisitos legais específicos que possam ser aplicáveis ao negócio.</p><div class="signature"><div class="signline">VENDEDOR / ${esc(sellerName)}</div><div class="signline">COMPRADOR / ${esc(sale.cliente_nome)}</div><div class="signline">TESTEMUNHA 1: ${get("testemunha_1")}</div><div class="signline">TESTEMUNHA 2: ${get("testemunha_2")}</div></div>
<h2>ANEXO — INADIMPLÊNCIA, COBRANÇA E CIÊNCIA DO COMPRADOR</h2><p>O comprador autoriza o envio de lembretes, avisos de vencimento, demonstrativos e notificações para os contatos informados, respeitados a privacidade e os limites contra cobrança abusiva. A falta de recebimento de lembrete não altera o vencimento. O comprador pode solicitar demonstrativo atualizado do saldo.</p><p>Se houver parcela vencida e não paga, o vendedor poderá, conforme o caso e os requisitos legais, enviar aviso amigável e notificação formal, negociar acordo escrito, promover cobrança extrajudicial lícita, apresentar título a protesto quando cabível, ajuizar ação quando houver os pressupostos legais e solicitar inclusão em cadastro de proteção ao crédito quando a dívida for legítima, vencida e exigível e os deveres legais forem cumpridos.</p><p>Vencimento antecipado não é automático por este anexo. Em caso de resolução ou recuperação do aparelho, serão observados os procedimentos legais. Não se admite perda automática de todas as parcelas pagas, retomada forçada ou entrada em residência sem autorização ou ordem legal.</p><p>Se houver gerenciamento, rastreamento ou bloqueio, o comprador deverá receber informação clara e separada sobre fornecedor, dados coletados, finalidade, funcionamento, condições de ativação/desativação, compartilhamentos, retenção e canal para exercer direitos. Inadimplência, por si só, não autoriza rastreamento ou bloqueio indiscriminado.</p><p>A multa moratória será de até 2% por parcela, uma única vez, sem multa diária adicional. Juros de mora serão cobrados conforme taxa previamente informada e validamente pactuada ou regra legal aplicável. O comprador tem direito a informações claras sobre preço à vista e total parcelado, quantidade e valor das parcelas, vencimentos e encargos, e poderá quitar antecipadamente o débito com redução proporcional dos juros e acréscimos cabíveis, conforme a lei.</p><p>Pagamentos parciais, acordos, renegociações e quitações deverão ser documentados por recibo ou instrumento escrito. O comprador declara que teve oportunidade de ler o contrato e anexo, compreendeu condições de pagamento, multa, juros, medidas de cobrança e limites legais de reserva de domínio, rastreamento e bloqueio.</p>
<div class="footer">SR SOFTWARE • Documento gerado pelo Veloop. CNPJ informado no modelo: 64.909.239/0001-61 — confirmar dados cadastrais e revisar juridicamente antes do uso. Este modelo não substitui revisão jurídica individualizada.</div></body></html>`;
}

function SignaturePad({ onChange }: { onChange: (data: string) => void }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);
  const hasInk = useRef(false);
  const point = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return null;
    const rect = canvas.getBoundingClientRect();
    return { x: (event.clientX - rect.left) * (canvas.width / rect.width), y: (event.clientY - rect.top) * (canvas.height / rect.height) };
  };
  const start = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current, ctx = canvas?.getContext("2d"), p = point(event);
    if (!canvas || !ctx || !p) return;
    canvas.setPointerCapture(event.pointerId); drawing.current = true; ctx.beginPath(); ctx.moveTo(p.x, p.y);
  };
  const move = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    if (!drawing.current) return;
    const ctx = canvasRef.current?.getContext("2d"), p = point(event);
    if (!ctx || !p) return;
    ctx.lineWidth = 2.5; ctx.lineCap = "round"; ctx.lineJoin = "round"; ctx.strokeStyle = "#111827"; ctx.lineTo(p.x, p.y); ctx.stroke(); hasInk.current = true;
  };
  const end = () => { drawing.current = false; const canvas = canvasRef.current; if (canvas && hasInk.current) onChange(canvas.toDataURL("image/png")); };
  const clear = () => { const canvas = canvasRef.current; const ctx = canvas?.getContext("2d"); if (!canvas || !ctx) return; ctx.clearRect(0,0,canvas.width,canvas.height); hasInk.current=false; onChange(""); };
  return <div className="space-y-2"><canvas ref={canvasRef} width={720} height={220} className="w-full rounded-lg border bg-white touch-none" onPointerDown={start} onPointerMove={move} onPointerUp={end} onPointerCancel={end} aria-label="Área para desenhar a assinatura" /><div className="flex justify-end"><Button type="button" variant="outline" size="sm" onClick={clear}>Limpar assinatura</Button></div></div>;
}

export default function ContratosPage() {
  const { user, isPrimaryAdmin } = useAuth();
  const [sales, setSales] = useState<Sale[]>([]);
  const [contracts, setContracts] = useState<Contract[]>([]);
  const [signatures, setSignatures] = useState<Signature[]>([]);
  const [selectedSale, setSelectedSale] = useState("");
  const [selectedContract, setSelectedContract] = useState<Contract | null>(null);
  const [items, setItems] = useState<SaleItem[]>([]);
  const [customer, setCustomer] = useState<Record<string, unknown> | null>(null);
  const [extra, setExtra] = useState<Record<string, string>>({});
  const [sellerName, setSellerName] = useState("");
  const [signOpen, setSignOpen] = useState(false);
  const [signRole, setSignRole] = useState<"vendedor"|"comprador"|"testemunha_1"|"testemunha_2">("comprador");
  const [signerName, setSignerName] = useState("");
  const [signerDocument, setSignerDocument] = useState("");
  const [signatureData, setSignatureData] = useState("");
  const [consent, setConsent] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const frameRef = useRef<HTMLIFrameElement>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const { data: saleData, error: saleError } = await supabase.from("vendas").select("id,cliente_nome,cliente_telefone,cliente_cpf,valor_total,valor_entrada,num_parcelas,valor_parcela,status,created_at,vendedor_id,forma_pagamento,frequencia_parcela,data_inicio_pagamento,observacoes").order("created_at",{ascending:false}).limit(200);
    if (saleError) toast.error("Não foi possível carregar as vendas");
    setSales((saleData || []) as Sale[]);
    const { data: contractData, error: contractError } = await (supabase as any).from("sale_contracts").select("id,venda_id,status,contract_data,document_html,document_sha256,created_at,signed_at").order("created_at",{ascending:false}).limit(200);
    if (contractError && !/sale_contracts/i.test(contractError.message)) toast.error("Não foi possível carregar os contratos");
    setContracts((contractData || []) as Contract[]);
    setLoading(false);
  }, []);
  useEffect(() => { void load(); }, [load]);

  const selectSale = async (id: string) => {
    setSelectedSale(id); setCustomer(null); setItems([]);
    const sale = sales.find(s => s.id === id);
    if (!sale) return;
    const [customerResult, itemResult, profileResult] = await Promise.all([
      sale.cliente_cpf ? supabase.from("clientes").select("*").eq("cpf",sale.cliente_cpf).limit(1).maybeSingle() : Promise.resolve({data:null,error:null}),
      supabase.from("venda_itens").select("produto_id,quantidade,preco_unitario,subtotal,produtos(nome)").eq("venda_id",id),
      supabase.from("profiles").select("nome").eq("id",sale.vendedor_id).maybeSingle(),
    ]);
    setCustomer(customerResult.data as Record<string, unknown> | null);
    setItems((itemResult.data || []).map((i: any) => ({nome:i.produtos?.nome || "Produto",quantidade:i.quantidade,preco_unitario:Number(i.preco_unitario),subtotal:Number(i.subtotal)})));
    setSellerName(profileResult.data?.nome || user?.email || "Representante SR SOFTWARE");
  };

  const createContract = async () => {
    const sale = sales.find(s => s.id === selectedSale);
    if (!sale || !user) { toast.error("Selecione uma venda"); return; }
    if (contracts.some(c => c.venda_id === sale.id && c.status !== "cancelado")) { toast.error("Esta venda já possui um contrato ativo. Abra o contrato existente para assinar ou imprimir."); return; }
    setSaving(true);
    try {
      const data = { ...extra };
      const html = buildContractHtml(sale, items, sellerName, customer, data);
      const hash = await sha256(html);
      const { data: created, error } = await (supabase as any).from("sale_contracts").insert({
        venda_id:sale.id, vendedor_id:sale.vendedor_id, status:"aguardando_assinaturas",
        template_version:"sr-venda-celular-2026-01", contract_data:data, document_html:html,
        document_sha256:hash, created_by:user.id,
      }).select("id,venda_id,status,contract_data,document_html,document_sha256,created_at,signed_at").single();
      if (error) throw error;
      setContracts(prev => [created as Contract,...prev]); setSelectedContract(created as Contract);
      toast.success("Contrato gerado e vinculado à venda");
    } catch (error) {
      console.error("contract creation failed", error);
      toast.error("Não foi possível gerar o contrato. Confirme se a migração de contratos foi aplicada.");
    } finally { setSaving(false); }
  };

  const openContract = async (contract: Contract) => {
    setSelectedContract(contract);
    const { data } = await (supabase as any).from("sale_contract_signatures").select("id,contract_id,signer_role,signer_name,signed_at").eq("contract_id",contract.id).order("signed_at");
    setSignatures((data || []) as Signature[]);
  };

  const saveSignature = async () => {
    if (!selectedContract || !user || !signerName.trim() || !signatureData || !consent) {
      toast.error("Preencha o nome, desenhe a assinatura e confirme a declaração de ciência"); return;
    }
    setSaving(true);
    try {
      const { error } = await (supabase as any).from("sale_contract_signatures").insert({
        contract_id:selectedContract.id, signer_role:signRole, signer_name:signerName.trim(),
        signer_document:signerDocument.trim() || null, signature_image_data:signatureData,
        consent_text:"Declaro que tive oportunidade de ler o contrato exibido, compreendi seu conteúdo e concordo com a assinatura eletrônica vinculada ao resumo criptográfico informado.",
        document_sha256:selectedContract.document_sha256, signer_user_id:user.id,
        user_agent:navigator.userAgent.slice(0,500),
      });
      if (error) throw error;
      const { data: sigData } = await (supabase as any).from("sale_contract_signatures").select("id,contract_id,signer_role,signer_name,signed_at").eq("contract_id",selectedContract.id).order("signed_at");
      const next = (sigData || []) as Signature[]; setSignatures(next);
      const roles = new Set(next.map(s=>s.signer_role));
      if (roles.has("vendedor") && roles.has("comprador")) {
        const { error: updateError } = await (supabase as any).from("sale_contracts").update({status:"assinado",signed_at:new Date().toISOString()}).eq("id",selectedContract.id);
        if (updateError) throw updateError;
        setSelectedContract({...selectedContract,status:"assinado",signed_at:new Date().toISOString()});
        setContracts(prev=>prev.map(c=>c.id===selectedContract.id?{...c,status:"assinado",signed_at:new Date().toISOString()}:c));
      }
      toast.success("Assinatura eletrônica registrada com evidências");
      setSignOpen(false); setSignatureData(""); setConsent(false); setSignerDocument("");
    } catch (error) {
      console.error("signature save failed",error);
      toast.error("Não foi possível registrar a assinatura. Verifique se o contrato ainda está aberto.");
    } finally { setSaving(false); }
  };

  const selectedSaleForContract = selectedContract ? sales.find(s=>s.id===selectedContract.venda_id) : null;
  const statusLabel = (s:string) => ({rascunho:"Rascunho",aguardando_assinaturas:"Aguardando assinaturas",assinado:"Assinado",cancelado:"Cancelado"}[s] || s);
  const printContract = () => { try { frameRef.current?.contentWindow?.focus(); frameRef.current?.contentWindow?.print(); } catch { toast.error("Use a opção de impressão do navegador"); } };

  return <div className="space-y-6 max-w-7xl mx-auto">
    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
      <div><h1 className="text-2xl font-bold tracking-tight flex items-center gap-2"><FileSignature className="h-6 w-6"/>Contratos e assinaturas</h1><p className="text-sm text-muted-foreground mt-1">Gere o contrato da venda, confira os dados e registre assinaturas eletrônicas.</p></div>
      <Button variant="outline" onClick={()=>void load()}><RefreshCw className="h-4 w-4 mr-2"/>Atualizar</Button>
    </div>
    <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]">
      <Card><CardHeader><CardTitle className="text-base">Novo contrato de venda</CardTitle></CardHeader><CardContent className="space-y-4">
        <div className="space-y-2"><Label>Venda</Label><Select value={selectedSale} onValueChange={selectSale}><SelectTrigger><SelectValue placeholder="Selecione uma venda"/></SelectTrigger><SelectContent>{sales.map(s=><SelectItem key={s.id} value={s.id}>{s.cliente_nome} — {money(s.valor_total)} — {dateBR(s.created_at)}</SelectItem>)}</SelectContent></Select></div>
        {selectedSale && <><div className="rounded-lg border p-3 text-sm space-y-1"><div><b>Comprador:</b> {sales.find(s=>s.id===selectedSale)?.cliente_nome}</div><div><b>Valor:</b> {money(sales.find(s=>s.id===selectedSale)?.valor_total)}</div><div><b>Itens:</b> {items.map(i=>i.nome).join(", ") || "Nenhum item vinculado"}</div><div className="text-muted-foreground">Confira os dados cadastrais e complete os campos específicos do aparelho antes de gerar.</div></div>
          <div className="grid sm:grid-cols-2 gap-3">{[
            ["marca","Marca do aparelho"],["modelo","Modelo"],["cor","Cor"],["capacidade","Capacidade"],["imei1","IMEI 1"],["imei2","IMEI 2"],["numero_serie","Número de série"],["acessorios","Acessórios entregues"],["endereco","Endereço do comprador"],["cidade_uf","Cidade/UF"],["rg","RG"],["data_nascimento","Data de nascimento"],["estado_civil","Estado civil"],["profissao","Profissão"],["vendedor_razao_social","Razão social/titular vendedor"],["vendedor_endereco","Endereço do vendedor"],["vendedor_cidade","Cidade/UF vendedor"],["vendedor_telefone","Telefone vendedor"],["vendedor_email","E-mail vendedor"],["fornecedor_gerenciamento","Fornecedor do gerenciamento (se houver)"],["finalidades_gerenciamento","Finalidades do gerenciamento"],["canal_gerenciamento","Canal de suporte do gerenciamento"],["canal_lgpd","Canal LGPD"],["juros_mora_mes","Juros de mora (% ao mês)"],["prazo_atraso_dias","Prazo para análise de atraso (dias)"],["data_entrega","Data da entrega"],["horario_entrega","Horário da entrega"],["estado_aparelho","Estado (novo/usado)"],["avarias","Observações/avarias"],["local_assinatura","Local de assinatura"]
          ].map(([key,label])=><div className="space-y-1" key={key}><Label>{label}</Label><Input value={extra[key]||""} onChange={e=>setExtra(prev=>({...prev,[key]:e.target.value}))} placeholder={label}/></div>)}</div>
          <Button className="w-full" onClick={()=>void createContract()} disabled={saving||loading}><FileText className="h-4 w-4 mr-2"/>{saving?"Gerando...":"Gerar contrato a partir da venda"}</Button>
        </>}
      </CardContent></Card>
      <Card><CardHeader><CardTitle className="text-base">Contratos registrados</CardTitle></CardHeader><CardContent className="space-y-3">
        {loading ? <div className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin"/>Carregando...</div> : contracts.length===0 ? <div className="py-8 text-center text-sm text-muted-foreground"><FileText className="h-8 w-8 mx-auto mb-2 opacity-50"/>Nenhum contrato registrado ainda.</div> : contracts.map(c=>{const sale=sales.find(s=>s.id===c.venda_id);return <button type="button" key={c.id} onClick={()=>void openContract(c)} className={`w-full rounded-lg border p-3 text-left transition-colors hover:bg-muted/50 ${selectedContract?.id===c.id?"border-primary bg-muted/30":""}`}><div className="flex items-start justify-between gap-3"><div className="font-medium">{sale?.cliente_nome || "Venda"} <div className="text-xs text-muted-foreground font-normal mt-1">{money(sale?.valor_total)} · {dateBR(c.created_at)}</div></div><Badge variant={c.status==="assinado"?"default":"secondary"}>{statusLabel(c.status)}</Badge></div></button>})}
      </CardContent></Card>
    </div>
    {selectedContract && <Card><CardHeader><div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"><div><CardTitle className="text-base">Contrato selecionado</CardTitle><p className="text-xs text-muted-foreground mt-1">SHA-256: <span className="break-all">{selectedContract.document_sha256}</span></p></div><div className="flex flex-wrap gap-2"><Button variant="outline" onClick={printContract}><Printer className="h-4 w-4 mr-2"/>Imprimir / salvar PDF</Button><Button onClick={()=>{setSignRole(signatures.some(s=>s.signer_role==="comprador")?"vendedor":"comprador");setSignerName(signatures.some(s=>s.signer_role==="comprador")?sellerName:(selectedSaleForContract?.cliente_nome||""));setSignOpen(true);}} disabled={selectedContract.status==="assinado"||selectedContract.status==="cancelado"}><PenLine className="h-4 w-4 mr-2"/>Assinar eletronicamente</Button></div></div></CardHeader><CardContent className="space-y-4">
      <div className="flex flex-wrap gap-2">{signatures.map(s=><Badge key={s.id} variant="outline">{s.signer_role.replace("_"," ")}: {s.signer_name} · {dateBR(s.signed_at)}</Badge>)}</div>
      <div className="rounded-lg border overflow-hidden bg-white"><iframe ref={frameRef} title="Prévia do contrato de venda" srcDoc={selectedContract.document_html} sandbox="" className="w-full h-[70vh] bg-white"/></div>
      <div className="text-xs text-muted-foreground flex items-start gap-2"><ShieldCheck className="h-4 w-4 shrink-0"/><span>O sistema registra o aceite, o desenho da assinatura, a data/hora, o usuário autenticado e o hash SHA-256 do documento. A assinatura eletrônica simples não equivale automaticamente a certificado ICP-Brasil nem substitui análise jurídica.</span></div>
    </CardContent></Card>}
    <Dialog open={signOpen} onOpenChange={setSignOpen}><DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto"><DialogHeader><DialogTitle>Registrar assinatura eletrônica</DialogTitle></DialogHeader><div className="space-y-4"><div className="rounded-md bg-muted/50 p-3 text-sm">Documento SHA-256: <span className="font-mono break-all">{selectedContract?.document_sha256}</span></div><div className="space-y-2"><Label>Quem está assinando?</Label><Select value={signRole} onValueChange={v=>setSignRole(v as typeof signRole)}><SelectTrigger><SelectValue/></SelectTrigger><SelectContent><SelectItem value="comprador" disabled={signatures.some(s=>s.signer_role==="comprador")}>Comprador</SelectItem><SelectItem value="vendedor" disabled={signatures.some(s=>s.signer_role==="vendedor")}>Vendedor</SelectItem><SelectItem value="testemunha_1" disabled={signatures.some(s=>s.signer_role==="testemunha_1")}>Testemunha 1</SelectItem><SelectItem value="testemunha_2" disabled={signatures.some(s=>s.signer_role==="testemunha_2")}>Testemunha 2</SelectItem></SelectContent></Select></div><div className="space-y-2"><Label>Nome completo</Label><Input value={signerName} onChange={e=>setSignerName(e.target.value)} maxLength={180}/></div><div className="space-y-2"><Label>CPF/RG (opcional)</Label><Input value={signerDocument} onChange={e=>setSignerDocument(e.target.value)} maxLength={40}/></div><div className="space-y-2"><Label>Desenhe a assinatura na área abaixo</Label><SignaturePad onChange={setSignatureData}/></div><label className="flex items-start gap-2 text-sm"><input type="checkbox" checked={consent} onChange={e=>setConsent(e.target.checked)} className="mt-1"/><span>Confirmo que tive oportunidade de ler o documento exibido, compreendi seu conteúdo e concordo em registrar esta assinatura eletrônica vinculada ao hash acima.</span></label></div><DialogFooter><Button variant="outline" onClick={()=>setSignOpen(false)}>Cancelar</Button><Button onClick={()=>void saveSignature()} disabled={saving||!consent||!signatureData||!signerName.trim()}>{saving?<Loader2 className="h-4 w-4 mr-2 animate-spin"/>:<PenLine className="h-4 w-4 mr-2"/>}Registrar assinatura</Button></DialogFooter></DialogContent></Dialog>
  </div>;
}
