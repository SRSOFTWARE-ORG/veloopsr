import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { FileText, Upload, Download, Trash2, Search, Filter } from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface Documento {
  id: string;
  tipo: string;
  nome_arquivo: string;
  url_arquivo: string;
  cliente_nome: string | null;
  created_at: string;
}

const tipoLabels: Record<string, string> = {
  nota_fiscal: "Nota Fiscal",
  carne: "Carnê",
  contrato: "Contrato",
  recibo_garantia: "Recibo Garantia",
  outro: "Outro",
};

const DocumentosPage = () => {
  const { isAdmin, user } = useAuth();
  const [documentos, setDocumentos] = useState<Documento[]>([]);
  const [search, setSearch] = useState("");
  const [tipoFilter, setTipoFilter] = useState<string>("todos");
  const [uploading, setUploading] = useState(false);

  useEffect(() => {
    fetchDocumentos();
  }, []);

  const fetchDocumentos = async () => {
    const { data } = await supabase.from("documentos").select("*").order("created_at", { ascending: false });
    setDocumentos((data as Documento[]) || []);
  };

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploading(true);
    const fileName = `${Date.now()}_${file.name}`;
    const { error: uploadError } = await supabase.storage.from("documentos_vendas").upload(fileName, file);

    if (uploadError) {
      toast.error("Erro no upload");
      setUploading(false);
      return;
    }

    const { data: urlData } = supabase.storage.from("documentos_vendas").getPublicUrl(fileName);

    await supabase.from("documentos").insert({
      tipo: "outro",
      nome_arquivo: file.name,
      url_arquivo: urlData.publicUrl,
      uploaded_by: user?.id,
    });

    toast.success("Documento enviado!");
    setUploading(false);
    fetchDocumentos();
    e.target.value = "";
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Excluir este documento?")) return;
    await supabase.from("documentos").delete().eq("id", id);
    toast.success("Documento excluído");
    fetchDocumentos();
  };

  const filtered = documentos.filter((d) => {
    const matchSearch = d.nome_arquivo.toLowerCase().includes(search.toLowerCase()) ||
      d.cliente_nome?.toLowerCase().includes(search.toLowerCase());
    const matchTipo = tipoFilter === "todos" || d.tipo === tipoFilter;
    return matchSearch && matchTipo;
  });

  return (
    <div className="page-container">
      <div className="flex items-center justify-between mb-4 slide-up">
        <div>
          <h1 className="text-xl font-extrabold tracking-tight">Documentos</h1>
          <p className="text-sm text-muted-foreground">{documentos.length} arquivos</p>
        </div>
        <label className="cursor-pointer">
          <Button size="sm" asChild disabled={uploading}>
            <span>
              <Upload className="w-4 h-4 mr-1" />
              {uploading ? "Enviando..." : "Upload"}
            </span>
          </Button>
          <input type="file" className="hidden" onChange={handleUpload} accept=".pdf,.jpg,.jpeg,.png,.doc,.docx" />
        </label>
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
                  {d.cliente_nome && <span className="text-xs text-muted-foreground">{d.cliente_nome}</span>}
                  <span className="text-xs text-muted-foreground">
                    {new Date(d.created_at).toLocaleDateString("pt-BR")}
                  </span>
                </div>
              </div>
              <div className="flex items-center gap-1">
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
    </div>
  );
};

export default DocumentosPage;
