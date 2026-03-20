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
  const { isAdmin, user } = useAuth();
  const [documentos, setDocumentos] = useState<Documento[]>([]);
  const [search, setSearch] = useState("");
  const [tipoFilter, setTipoFilter] = useState<string>("todos");
  const [uploading, setUploading] = useState(false);
  const [viewDoc, setViewDoc] = useState<Documento | null>(null);
  const [scanningCarnes, setScanningCarnes] = useState(false);
  const [scanningBoletos, setScanningBoletos] = useState(false);
  const [scanProgress, setScanProgress] = useState({ current: 0, total: 0 });

  useEffect(() => {
    fetchDocumentos();
  }, []);

  const fetchDocumentos = async () => {
    const { data } = await supabase.from("documentos").select("*").order("created_at", { ascending: false });
    setDocumentos((data as Documento[]) || []);
  };

  const scanCarneAndCreateVenda = async (docId: string, pdfUrl: string, nomeArquivo: string) => {
    try {
      const { data: scanResult, error: scanError } = await supabase.functions.invoke("scan-carne", {
        body: { pdf_url: pdfUrl, nome_arquivo: nomeArquivo },
      });

      if (scanError) throw scanError;
      if (scanResult?.error) throw new Error(scanResult.error);

      const extracted = scanResult?.data;
      if (!extracted?.cliente_nome) throw new Error("Dados insuficientes");

      const clienteNome = extracted.cliente_nome;
      const startDate = extracted.data_primeira_parcela || new Date().toISOString().split("T")[0];
      const numParcelas = extracted.num_parcelas || 1;
      const freq = extracted.frequencia || "mes";

      const start = new Date(startDate + "T00:00:00");
      const end = new Date(start);
      for (let p = 1; p < numParcelas; p++) {
        if (freq === "semana") end.setDate(end.getDate() + 7);
        else if (freq === "quinzena") end.setDate(end.getDate() + 15);
        else end.setMonth(end.getMonth() + 1);
      }
      const endDate = end.toISOString().split("T")[0];

      await supabase.from("vendas").insert({
        cliente_nome: clienteNome,
        cliente_cpf: extracted.cliente_cpf || null,
        cliente_telefone: extracted.cliente_telefone || null,
        valor_total: extracted.valor_total || 0,
        valor_entrada: extracted.valor_entrada || 0,
        num_parcelas: numParcelas,
        valor_parcela: extracted.valor_parcela || 0,
        vendedor_id: user!.id,
        forma_pagamento: "parcelado",
        frequencia_parcela: freq,
        data_inicio_pagamento: startDate,
        status: "concluida",
      });

      // Create cobrança if client exists
      const { data: existingCliente } = await supabase
        .from("clientes")
        .select("id")
        .ilike("nome", `%${clienteNome}%`)
        .limit(1);

      if (existingCliente?.[0]?.id) {
        await supabase.from("cobrancas").insert({
          cliente_id: existingCliente[0].id,
          cliente_nome: clienteNome,
          valor_parcela: extracted.valor_parcela || 0,
          data_inicio: startDate,
          data_fim: endDate,
          frequencia: freq,
          criado_por: user!.id,
          observacoes: `Importado do carnê: ${nomeArquivo}`,
        });
      }

      // Mark as processed
      await supabase.from("documentos").update({ processado: true } as any).eq("id", docId);

      return true;
    } catch (err) {
      console.error(`Erro ao escanear carnê ${nomeArquivo}:`, err);
      return false;
    }
  };

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    setUploading(true);
    let successCount = 0;
    let errorCount = 0;
    const carnesToScan: { id: string; url: string; nome: string }[] = [];

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
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
      }).select("id").single();

      if (insertError) {
        console.error("Document insert error:", insertError.message);
        errorCount++;
        continue;
      }

      successCount++;

      // Queue carnês for automatic scanning
      if (tipo === "carne" && docData?.id) {
        carnesToScan.push({ id: docData.id, url: urlData.publicUrl, nome: file.name });
      }
    }

    if (successCount > 0) toast.success(`${successCount} arquivo(s) enviado(s)!`);
    if (errorCount > 0) toast.error(`${errorCount} arquivo(s) com erro`);
    
    fetchDocumentos();
    e.target.value = "";

    // Auto-scan carnês
    if (carnesToScan.length > 0) {
      setUploading(false);
      setScanningCarnes(true);
      setScanProgress({ current: 0, total: carnesToScan.length });
      toast.info(`Escaneando ${carnesToScan.length} carnê(s) automaticamente...`);

      let scanOk = 0;
      let scanFail = 0;
      for (let i = 0; i < carnesToScan.length; i++) {
        setScanProgress({ current: i + 1, total: carnesToScan.length });
        const ok = await scanCarneAndCreateVenda(carnesToScan[i].id, carnesToScan[i].url, carnesToScan[i].nome);
        if (ok) scanOk++;
        else scanFail++;
      }

      setScanningCarnes(false);
      if (scanOk > 0) toast.success(`${scanOk} venda(s) criada(s) a partir dos carnês!`);
      if (scanFail > 0) toast.error(`${scanFail} carnê(s) não puderam ser processados`);
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

  const handleScanAllCarnes = async () => {
    const carnes = documentos.filter((d) => d.tipo === "carne" && !d.processado);
    if (carnes.length === 0) {
      toast.info("Todos os carnês já foram processados!");
      return;
    }

    if (!confirm(`Escanear ${carnes.length} carnê(s) pendente(s) e criar vendas + cobranças?`)) return;

    setScanningCarnes(true);
    setScanProgress({ current: 0, total: carnes.length });
    let successCount = 0;
    let errorCount = 0;

    for (let i = 0; i < carnes.length; i++) {
      const carne = carnes[i];
      setScanProgress({ current: i + 1, total: carnes.length });
      const ok = await scanCarneAndCreateVenda(carne.id, carne.url_arquivo, carne.nome_arquivo);
      if (ok) successCount++;
      else errorCount++;
    }

    setScanningCarnes(false);
    if (successCount > 0) toast.success(`${successCount} carnê(s) processado(s) com sucesso!`);
    if (errorCount > 0) toast.error(`${errorCount} carnê(s) com erro no processamento`);
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
      <div className="flex items-center justify-between mb-4 slide-up">
        <div>
          <h1 className="text-xl font-extrabold tracking-tight">Documentos</h1>
          <p className="text-sm text-muted-foreground">{documentos.length} arquivos</p>
        </div>
        <div className="flex items-center gap-2">
          {isAdmin && (
            <Button
              size="sm"
              variant="outline"
              onClick={handleScanAllCarnes}
              disabled={scanningCarnes}
              className="gap-1"
            >
              {scanningCarnes ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <ScanLine className="w-4 h-4" />
              )}
              {scanningCarnes
                ? `${scanProgress.current}/${scanProgress.total}`
                : "Escanear Carnês"}
            </Button>
          )}
          <label className="cursor-pointer">
            <Button size="sm" asChild disabled={uploading}>
              <span>
                <Upload className="w-4 h-4 mr-1" />
                {uploading ? "Enviando..." : "Upload"}
              </span>
          </Button>
          <input type="file" className="hidden" onChange={handleUpload} accept=".pdf,.jpg,.jpeg,.png,.doc,.docx" multiple />
        </label>
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
                  {d.tipo === "carne" && d.processado && (
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
                {isAdmin && (
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
