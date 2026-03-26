import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { FileText, Upload, Download, Trash2, Search, Filter, ScanLine, Loader2 } from "lucide-react";
import { Eye, X } from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

interface Documento {
  id: string;
  tipo: string;
  nome_arquivo: string;
  url_arquivo: string;
  cliente_nome: string | null;
  created_at: string;
  processado: boolean | null;
}

const tipoLabels: Record<string, string> = {
  nota_fiscal: "Nota Fiscal",
  carne: "Carnê",
  boleto: "Boleto",
  contrato: "Contrato",
  recibo_garantia: "Recibo Garantia",
  outro: "Outro",
};

const buildSafeStorageKey = (file: File, index: number) => {
  const normalizedName = file.name.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  const extension = normalizedName.includes(".") ? normalizedName.split(".").pop()?.toLowerCase() ?? "" : "";
  const baseName = normalizedName
    .replace(/\.[^.]+$/, "")
    .replace(/[^a-zA-Z0-9-_ ]/g, "")
    .trim()
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .toLowerCase();

  const safeBaseName = baseName || "documento";
  return `${Date.now()}_${index}_${safeBaseName}${extension ? `.${extension}` : ""}`;
};

const detectTipoFromFileName = (fileName: string): string => {
  const upper = fileName.toUpperCase();
  if (upper.startsWith("NOTA") || upper.includes("NOTA FISCAL")) return "nota_fiscal";
  if (upper.startsWith("CARN") || upper.includes("CARNÊ") || upper.includes("CARNE")) return "carne";
  if (upper.startsWith("BOLETO") || upper.includes("BOLETO")) return "boleto";
  if (upper.startsWith("CONTRATO") || upper.includes("CONTRATO")) return "contrato";
  if (upper.startsWith("RECIBO") || upper.includes("GARANTIA")) return "recibo_garantia";
  return "outro";
};

const DocumentosPage = () => {
  const { isAdmin, isPrimaryAdmin, isReadOnly, user } = useAuth();
  const [documentos, setDocumentos] = useState<Documento[]>([]);
  const [search, setSearch] = useState("");
  const [tipoFilter, setTipoFilter] = useState<string>("todos");
  const [uploading, setUploading] = useState(false);
  const [viewDoc, setViewDoc] = useState<Documento | null>(null);
  const [scanning, setScanning] = useState(false);
  const [scanProgress, setScanProgress] = useState({ current: 0, total: 0 });

  useEffect(() => {
    fetchDocumentos().then(() => {
      autoScanPending();
    });
  }, []);

  const autoScanPending = async () => {
    const { data: pendingData } = await supabase
      .from("documentos")
      .select("*")
      .in("tipo", ["carne", "boleto", "nota_fiscal"])
      .eq("processado", false)
      .order("created_at", { ascending: true });

    const pending = (pendingData || []) as Documento[];
    if (pending.length === 0) return;

    setScanning(true);
    setScanProgress({ current: 0, total: pending.length });
    toast.info(`Escaneando ${pending.length} documento(s) pendente(s)...`);

    let scanOk = 0;
    let scanFail = 0;
    for (let i = 0; i < pending.length; i++) {
      setScanProgress({ current: i + 1, total: pending.length });
      const ok = await scanDocumentAndProcess(pending[i]);
      if (ok) scanOk++;
      else scanFail++;
    }

    setScanning(false);
    if (scanOk > 0) toast.success(`${scanOk} documento(s) processado(s)!`);
    if (scanFail > 0) toast.error(`${scanFail} documento(s) com erro`);
    fetchDocumentos();
  };

  const fetchDocumentos = async () => {
    const { data } = await supabase.from("documentos").select("*").order("created_at", { ascending: false });
    setDocumentos((data as Documento[]) || []);
  };

  const scanDocumentAndProcess = async (doc: Documento) => {
    try {
      const { data: scanResult, error: scanError } = await supabase.functions.invoke("scan-document", {
        body: { pdf_url: doc.url_arquivo, nome_arquivo: doc.nome_arquivo },
      });

      if (scanError) throw scanError;
      if (scanResult?.error) throw new Error(scanResult.error);

      const extracted = scanResult?.data;
      if (!extracted?.cliente_nome) throw new Error("Dados insuficientes");

      const tipoDetectado = extracted.tipo_documento || "boleto";

      // Update document type if AI detected differently
      if (tipoDetectado !== doc.tipo) {
        await supabase.from("documentos").update({ tipo: tipoDetectado } as any).eq("id", doc.id);
      }

      if (tipoDetectado === "carne") {
        await processCarneData(doc, extracted);
      } else if (tipoDetectado === "boleto") {
        await processBoletoData(doc, extracted);
      } else if (tipoDetectado === "nota_fiscal") {
        await processNotaData(doc, extracted);
      }

      await supabase.from("documentos").update({ processado: true, cliente_nome: extracted.cliente_nome } as any).eq("id", doc.id);
      return true;
    } catch (err) {
      console.error(`Erro ao escanear ${doc.nome_arquivo}:`, err);
      return false;
    }
  };

  const findOrCreateCliente = async (nome: string, extraData: Record<string, any> = {}) => {
    // Try to find by CPF first (more reliable), then by name
    let existing: any[] | null = null;
    if (extraData.cpf || extraData.cliente_cpf) {
      const cpfVal = extraData.cpf || extraData.cliente_cpf;
      const { data } = await supabase.from("clientes").select("*").eq("cpf", cpfVal).limit(1);
      existing = data;
    }
    if (!existing || existing.length === 0) {
      const { data } = await supabase.from("clientes").select("*").ilike("nome", `%${nome}%`).limit(1);
      existing = data;
    }

    // Build client data from extracted fields
    const clienteData: Record<string, any> = {};
    const fieldMap: Record<string, string> = {
      cliente_cpf: "cpf", cpf: "cpf",
      cliente_telefone: "telefone", telefone: "telefone",
      email: "email",
      endereco: "endereco",
      complemento: "complemento",
      bairro: "bairro",
      cidade: "cidade",
      uf: "uf",
      cep: "cep",
      rg: "rg",
      rg_emissor: "rg_emissor",
      rg_data_emissao: "rg_data_emissao",
      data_nascimento: "data_nascimento",
      naturalidade: "naturalidade",
      estado_civil: "estado_civil",
      nome_pai: "nome_pai",
      nome_mae: "nome_mae",
      tipo: "tipo",
      inscricao_estadual: "inscricao_estadual",
      observacoes: "observacoes",
    };

    for (const [srcKey, destKey] of Object.entries(fieldMap)) {
      const val = extraData[srcKey];
      if (val && String(val).trim() && String(val).trim().toLowerCase() !== "null") {
        clienteData[destKey] = val;
      }
    }

    if (existing?.[0]?.id) {
      // Update existing client with any missing fields
      const updates: Record<string, any> = {};
      const current = existing[0];
      for (const [key, value] of Object.entries(clienteData)) {
        if (!current[key] && value) {
          updates[key] = value;
        }
      }
      if (Object.keys(updates).length > 0) {
        await supabase.from("clientes").update(updates).eq("id", current.id);
      }
      return current.id;
    }

    const { data: newCliente } = await supabase.from("clientes").insert({
      nome,
      ...clienteData,
      criado_por: user!.id,
    }).select("id").single();

    return newCliente?.id || null;
  };

  // Remove old vendas/cobrancas linked to a document filename
  const removeOldLinkedRecords = async (nomeArquivo: string) => {
    // Delete vendas that reference this document
    await supabase.from("vendas").delete().ilike("observacoes", `%${nomeArquivo}%`);
    // Delete cobrancas that reference this document
    const { data: oldCobrancas } = await supabase.from("cobrancas").select("id").ilike("observacoes", `%${nomeArquivo}%`);
    if (oldCobrancas && oldCobrancas.length > 0) {
      const ids = oldCobrancas.map((c) => c.id);
      await supabase.from("cobranca_pagamentos").delete().in("cobranca_id", ids);
      await supabase.from("cobrancas").delete().in("id", ids);
    }
  };

  const processCarneData = async (doc: Documento, extracted: any) => {
    await removeOldLinkedRecords(doc.nome_arquivo);

    const clienteNome = extracted.cliente_nome;
    const startDate = extracted.data_primeira_parcela || new Date().toISOString().split("T")[0];
    const numParcelas = extracted.num_parcelas || 1;
    const freq = extracted.frequencia || "mes";
    const valorParcela = extracted.valor_parcela || 0;
    const valorTotal = extracted.valor_total || (valorParcela * numParcelas);
    const valorEntrada = extracted.valor_entrada || 0;

    const start = new Date(startDate + "T00:00:00");
    const end = new Date(start);
    for (let p = 1; p < numParcelas; p++) {
      if (freq === "semana") end.setDate(end.getDate() + 7);
      else if (freq === "quinzena") end.setDate(end.getDate() + 15);
      else end.setMonth(end.getMonth() + 1);
    }
    const endDate = end.toISOString().split("T")[0];

    // Check if a venda already exists for this client (by CPF or name) to avoid duplicates
    let existingVendas: any[] | null = null;
    if (extracted.cliente_cpf) {
      const { data } = await supabase
        .from("vendas")
        .select("id")
        .eq("cliente_cpf", extracted.cliente_cpf)
        .eq("status", "concluida")
        .limit(1);
      existingVendas = data;
    }
    if (!existingVendas || existingVendas.length === 0) {
      const { data } = await supabase
        .from("vendas")
        .select("id")
        .ilike("cliente_nome", clienteNome)
        .eq("status", "concluida")
        .limit(1);
      existingVendas = data;
    }

    if (!existingVendas || existingVendas.length === 0) {
      await supabase.from("vendas").insert({
        cliente_nome: clienteNome,
        cliente_cpf: extracted.cliente_cpf || null,
        cliente_telefone: extracted.cliente_telefone || null,
        valor_total: valorTotal,
        valor_entrada: valorEntrada,
        num_parcelas: numParcelas,
        valor_parcela: valorParcela,
        vendedor_id: user!.id,
        forma_pagamento: "parcelado",
        frequencia_parcela: freq,
        data_inicio_pagamento: startDate,
        status: "concluida",
        observacoes: `Importado do carnê: ${doc.nome_arquivo}`,
      });
    }

    const clienteId = await findOrCreateCliente(clienteNome, extracted);

    if (clienteId) {
      // Check if a cobrança already exists for this client with same value/dates
      const { data: existingCob } = await supabase
        .from("cobrancas")
        .select("id")
        .eq("cliente_id", clienteId)
        .eq("valor_parcela", valorParcela)
        .eq("data_inicio", startDate)
        .limit(1);

      if (!existingCob || existingCob.length === 0) {
        await supabase.from("cobrancas").insert({
          cliente_id: clienteId,
          cliente_nome: clienteNome,
          valor_parcela: valorParcela,
          data_inicio: startDate,
          data_fim: endDate,
          frequencia: freq,
          criado_por: user!.id,
          observacoes: `Importado do carnê: ${doc.nome_arquivo}`,
        });
      }
    }
  };

  const processBoletoData = async (doc: Documento, extracted: any) => {
    await removeOldLinkedRecords(doc.nome_arquivo);

    const clienteNome = extracted.cliente_nome;
    const dataVencimento = extracted.data_vencimento || new Date().toISOString().split("T")[0];

    const clienteId = await findOrCreateCliente(clienteNome, extracted);

    if (clienteId) {
      // Check if a cobrança already exists for this client with same value/date
      const { data: existingCob } = await supabase
        .from("cobrancas")
        .select("id")
        .eq("cliente_id", clienteId)
        .eq("valor_parcela", extracted.valor || 0)
        .eq("data_inicio", dataVencimento)
        .limit(1);

      if (!existingCob || existingCob.length === 0) {
        await supabase.from("cobrancas").insert({
          cliente_id: clienteId,
          cliente_nome: clienteNome,
          valor_parcela: extracted.valor || 0,
          data_inicio: dataVencimento,
          data_fim: dataVencimento,
          frequencia: "mes",
          criado_por: user!.id,
          observacoes: `Boleto: ${doc.nome_arquivo}${extracted.beneficiario ? ` | Beneficiário: ${extracted.beneficiario}` : ""}${extracted.numero_documento ? ` | Doc: ${extracted.numero_documento}` : ""}`,
        });
      }
    }
  };

  const processNotaData = async (doc: Documento, extracted: any) => {
    await removeOldLinkedRecords(doc.nome_arquivo);

    const clienteNome = extracted.cliente_nome;
    await findOrCreateCliente(clienteNome, extracted);

    const valorNota = extracted.valor || extracted.valor_total || 0;

    // Check if a venda already exists for this client with similar value (from carnê import)
    const { data: existingVendas } = await supabase
      .from("vendas")
      .select("id")
      .ilike("cliente_nome", clienteNome)
      .eq("valor_total", valorNota)
      .eq("status", "concluida")
      .limit(1);

    if (!existingVendas || existingVendas.length === 0) {
      await supabase.from("vendas").insert({
        cliente_nome: clienteNome,
        cliente_cpf: extracted.cliente_cpf || null,
        valor_total: valorNota,
        vendedor_id: user!.id,
        forma_pagamento: "pix",
        status: "concluida",
        observacoes: `Nota Fiscal: ${doc.nome_arquivo}${extracted.numero_documento ? ` | NF: ${extracted.numero_documento}` : ""}${extracted.beneficiario ? ` | Emitente: ${extracted.beneficiario}` : ""}`,
      });
    }
  };

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    setUploading(true);
    let successCount = 0;
    let errorCount = 0;
    const docsToScan: Documento[] = [];

    for (let i = 0; i < files.length; i++) {
      const file = files[i];

      // Check for existing document with the same filename — replace it
      const { data: existingDocs } = await supabase
        .from("documentos")
        .select("id, nome_arquivo")
        .eq("nome_arquivo", file.name);

      if (existingDocs && existingDocs.length > 0) {
        for (const oldDoc of existingDocs) {
          // Remove linked vendas/cobrancas from the old document
          await removeOldLinkedRecords(oldDoc.nome_arquivo);
          // Delete the old document record
          await supabase.from("documentos").delete().eq("id", oldDoc.id);
        }
      }

      const fileName = buildSafeStorageKey(file, i);
      const { error: uploadError } = await supabase.storage.from("documentos_vendas").upload(fileName, file);

      if (uploadError) {
        console.error("Upload error:", uploadError.message);
        errorCount++;
        continue;
      }

      const { data: urlData } = supabase.storage.from("documentos_vendas").getPublicUrl(fileName);
      const tipo = detectTipoFromFileName(file.name);

      const { data: docData, error: insertError } = await supabase.from("documentos").insert({
        tipo,
        nome_arquivo: file.name,
        url_arquivo: urlData.publicUrl,
        uploaded_by: user?.id,
      }).select("*").single();

      if (insertError) {
        console.error("Document insert error:", insertError.message);
        errorCount++;
        continue;
      }

      successCount++;

      if (docData && ["carne", "boleto", "nota_fiscal"].includes(tipo)) {
        docsToScan.push(docData as Documento);
      }
    }

    if (successCount > 0) toast.success(`${successCount} arquivo(s) enviado(s)!`);
    if (errorCount > 0) toast.error(`${errorCount} arquivo(s) com erro`);

    fetchDocumentos();
    e.target.value = "";

    // Auto-scan uploaded documents
    if (docsToScan.length > 0) {
      setUploading(false);
      setScanning(true);
      setScanProgress({ current: 0, total: docsToScan.length });
      toast.info(`Escaneando ${docsToScan.length} documento(s)...`);

      let scanOk = 0;
      let scanFail = 0;
      for (let i = 0; i < docsToScan.length; i++) {
        setScanProgress({ current: i + 1, total: docsToScan.length });
        const ok = await scanDocumentAndProcess(docsToScan[i]);
        if (ok) scanOk++;
        else scanFail++;
      }

      setScanning(false);
      if (scanOk > 0) toast.success(`${scanOk} documento(s) processado(s)!`);
      if (scanFail > 0) toast.error(`${scanFail} documento(s) com erro`);
      fetchDocumentos();
      return;
    }

    setUploading(false);
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Excluir este documento?")) return;
    await supabase.from("documentos").delete().eq("id", id);
    toast.success("Documento excluído");
    fetchDocumentos();
  };

  const handleScanAll = async () => {
    const pending = documentos.filter((d) => !d.processado && ["carne", "boleto", "nota_fiscal"].includes(d.tipo));
    if (pending.length === 0) {
      toast.info("Todos os documentos já foram processados!");
      return;
    }

    if (!confirm(`Escanear ${pending.length} documento(s) pendente(s)?`)) return;

    setScanning(true);
    setScanProgress({ current: 0, total: pending.length });
    let successCount = 0;
    let errorCount = 0;

    for (let i = 0; i < pending.length; i++) {
      setScanProgress({ current: i + 1, total: pending.length });
      const ok = await scanDocumentAndProcess(pending[i]);
      if (ok) successCount++;
      else errorCount++;
    }

    setScanning(false);
    if (successCount > 0) toast.success(`${successCount} documento(s) processado(s)!`);
    if (errorCount > 0) toast.error(`${errorCount} documento(s) com erro`);
    fetchDocumentos();
  };

  const filtered = documentos.filter((d) => {
    const matchSearch = d.nome_arquivo.toLowerCase().includes(search.toLowerCase()) ||
      d.cliente_nome?.toLowerCase().includes(search.toLowerCase());
    const matchTipo = tipoFilter === "todos" || d.tipo === tipoFilter;
    return matchSearch && matchTipo;
  });

  const isImageFile = (name: string) => /\.(jpg|jpeg|png|gif|webp)$/i.test(name);
  const isPdfFile = (name: string) => /\.pdf$/i.test(name);
  const canPreview = (name: string) => isImageFile(name) || isPdfFile(name);

  return (
    <div className="page-container pb-24 md:pb-8">
      <div className="mb-4 slide-up">
        <div className="flex items-center justify-between mb-3">
          <div>
            <h1 className="text-xl font-extrabold tracking-tight">Documentos</h1>
            <p className="text-sm text-muted-foreground">{documentos.length} arquivos</p>
          </div>
        </div>
        <div className="-mx-4 overflow-x-auto px-4 md:mx-0 md:px-0" style={{ scrollbarWidth: 'none', msOverflowStyle: 'none', WebkitOverflowScrolling: 'touch' }}>
          <div className="flex w-max min-w-full gap-2 pb-1">
            <label className="cursor-pointer shrink-0">
              <Button size="sm" asChild disabled={uploading}>
                <span>
                  <Upload className="w-4 h-4 mr-1" />
                  {uploading ? "Enviando..." : "Upload"}
                </span>
              </Button>
              <input type="file" className="hidden" onChange={handleUpload} accept=".pdf,.jpg,.jpeg,.png,.doc,.docx" multiple />
            </label>
            {isPrimaryAdmin && (
              <Button
                size="sm"
                variant="outline"
                onClick={handleScanAll}
                disabled={scanning}
                className="gap-1 shrink-0"
              >
                {scanning ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <ScanLine className="w-4 h-4" />
                )}
                {scanning
                  ? `${scanProgress.current}/${scanProgress.total}`
                  : "Escanear"}
              </Button>
            )}
          </div>
        </div>
      </div>

      <div className="flex gap-2 mb-4 slide-up delay-1">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input placeholder="Buscar documentos..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-10" />
        </div>
        <Select value={tipoFilter} onValueChange={setTipoFilter}>
          <SelectTrigger className="w-36">
            <Filter className="w-4 h-4 mr-1" />
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="todos">Todos</SelectItem>
            <SelectItem value="nota_fiscal">Notas Fiscais</SelectItem>
            <SelectItem value="carne">Carnês</SelectItem>
            <SelectItem value="boleto">Boletos</SelectItem>
            <SelectItem value="contrato">Contratos</SelectItem>
            <SelectItem value="recibo_garantia">Recibos</SelectItem>
            <SelectItem value="outro">Outros</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-2">
        {filtered.map((d, i) => (
          <Card key={d.id} className={`slide-up delay-${Math.min(i + 2, 6)}`}>
            <CardContent className="p-4 flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-warning/10 flex items-center justify-center">
                <FileText className="w-5 h-5 text-warning" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-sm truncate">{d.nome_arquivo}</p>
                <div className="flex items-center gap-2 mt-0.5">
                  <span className="text-xs bg-secondary px-1.5 py-0.5 rounded">{tipoLabels[d.tipo] || d.tipo}</span>
                  {d.processado && (
                    <span className="text-xs bg-primary/10 text-primary px-1.5 py-0.5 rounded">✓ Processado</span>
                  )}
                  {d.cliente_nome && <span className="text-xs text-muted-foreground">{d.cliente_nome}</span>}
                  <span className="text-xs text-muted-foreground">
                    {new Date(d.created_at).toLocaleDateString("pt-BR")}
                  </span>
                </div>
              </div>
              <div className="flex items-center gap-1">
                {canPreview(d.nome_arquivo) && (
                  <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setViewDoc(d)}>
                    <Eye className="w-4 h-4" />
                  </Button>
                )}
                <Button variant="ghost" size="icon" className="h-8 w-8" asChild>
                  <a href={d.url_arquivo} target="_blank" rel="noopener noreferrer">
                    <Download className="w-4 h-4" />
                  </a>
                </Button>
                {isPrimaryAdmin && (
                  <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={() => handleDelete(d.id)}>
                    <Trash2 className="w-4 h-4" />
                  </Button>
                )}
              </div>
            </CardContent>
          </Card>
        ))}
        {filtered.length === 0 && (
          <div className="text-center py-12 text-muted-foreground">
            <FileText className="w-12 h-12 mx-auto mb-3 opacity-30" />
            <p className="font-medium">Nenhum documento encontrado</p>
            <p className="text-sm">Faça upload do primeiro documento</p>
          </div>
        )}
      </div>

      <Dialog open={!!viewDoc} onOpenChange={(open) => !open && setViewDoc(null)}>
        <DialogContent className="max-w-[95vw] max-h-[95vh] w-full h-[90vh] p-0 overflow-hidden">
          <DialogHeader className="p-4 pb-2 flex-row items-center justify-between">
            <DialogTitle className="text-sm font-semibold truncate pr-4">
              {viewDoc?.nome_arquivo}
            </DialogTitle>
          </DialogHeader>
          <div className="flex-1 overflow-auto px-4 pb-4 h-full">
            {viewDoc && isPdfFile(viewDoc.nome_arquivo) && (
              <iframe
                src={viewDoc.url_arquivo}
                className="w-full h-full min-h-[70vh] rounded-lg border"
                title={viewDoc.nome_arquivo}
              />
            )}
            {viewDoc && isImageFile(viewDoc.nome_arquivo) && (
              <img
                src={viewDoc.url_arquivo}
                alt={viewDoc.nome_arquivo}
                className="max-w-full max-h-[75vh] mx-auto rounded-lg object-contain"
              />
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default DocumentosPage;
