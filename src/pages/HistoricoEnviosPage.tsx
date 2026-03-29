import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { MessageSquare, CheckCircle2, XCircle, Search, RefreshCw } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";

interface EnvioCobranca {
  id: string;
  cpf: string;
  telefone: string;
  data_envio: string;
  tipo_envio: string;
  status_fatura: string;
  mensagem: string;
  enviado_com_sucesso: boolean;
  criado_em: string;
}

const HistoricoEnviosPage = () => {
  const { isAdmin } = useAuth();
  const [envios, setEnvios] = useState<EnvioCobranca[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [filterTipo, setFilterTipo] = useState<string>("todos");
  const [filterStatus, setFilterStatus] = useState<string>("todos");

  const fetchEnvios = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("envio_cobranca")
      .select("*")
      .order("criado_em", { ascending: false })
      .limit(200);

    if (error) {
      console.error("Erro ao buscar envios:", error);
      toast.error("Erro ao carregar histórico");
    } else {
      setEnvios((data as any[]) || []);
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchEnvios();
  }, []);

  const filtered = envios.filter((e) => {
    const matchSearch =
      !search ||
      e.cpf?.toLowerCase().includes(search.toLowerCase()) ||
      e.telefone?.includes(search);
    const matchTipo = filterTipo === "todos" || e.tipo_envio === filterTipo;
    const matchStatus =
      filterStatus === "todos" ||
      (filterStatus === "sucesso" && e.enviado_com_sucesso) ||
      (filterStatus === "falha" && !e.enviado_com_sucesso);
    return matchSearch && matchTipo && matchStatus;
  });

  const totalSucesso = envios.filter((e) => e.enviado_com_sucesso).length;
  const totalFalha = envios.filter((e) => !e.enviado_com_sucesso).length;

  if (!isAdmin) {
    return (
      <div className="p-6 text-center text-muted-foreground">
        Acesso restrito a administradores.
      </div>
    );
  }

  return (
    <div className="p-4 md:p-6 space-y-4 pb-24 md:pb-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl md:text-2xl font-bold flex items-center gap-2">
            <MessageSquare className="w-6 h-6 text-primary" />
            Histórico de Envios WhatsApp
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Registro de todas as cobranças enviadas automaticamente
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={fetchEnvios} disabled={loading}>
          <RefreshCw className={`w-4 h-4 mr-1 ${loading ? "animate-spin" : ""}`} />
          Atualizar
        </Button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-3">
        <Card>
          <CardContent className="p-3 text-center">
            <p className="text-2xl font-bold">{envios.length}</p>
            <p className="text-xs text-muted-foreground">Total</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3 text-center">
            <p className="text-2xl font-bold text-green-600">{totalSucesso}</p>
            <p className="text-xs text-muted-foreground">Enviados</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3 text-center">
            <p className="text-2xl font-bold text-red-500">{totalFalha}</p>
            <p className="text-xs text-muted-foreground">Falhas</p>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Buscar por CPF ou telefone..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <Select value={filterTipo} onValueChange={setFilterTipo}>
          <SelectTrigger className="w-[130px]">
            <SelectValue placeholder="Tipo" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="todos">Todos</SelectItem>
            <SelectItem value="D-1">P (A pagar)</SelectItem>
            <SelectItem value="D0">V (Vencida)</SelectItem>
          </SelectContent>
        </Select>
        <Select value={filterStatus} onValueChange={setFilterStatus}>
          <SelectTrigger className="w-[130px]">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="todos">Todos</SelectItem>
            <SelectItem value="sucesso">Sucesso</SelectItem>
            <SelectItem value="falha">Falha</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Table */}
      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Data</TableHead>
                  <TableHead>CPF</TableHead>
                  <TableHead>Telefone</TableHead>
                  <TableHead>Tipo</TableHead>
                  <TableHead>Status Fatura</TableHead>
                  <TableHead>Envio</TableHead>
                  <TableHead className="max-w-[200px]">Mensagem</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                      Carregando...
                    </TableCell>
                  </TableRow>
                ) : filtered.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                      Nenhum envio encontrado
                    </TableCell>
                  </TableRow>
                ) : (
                  filtered.map((envio) => (
                    <TableRow key={envio.id}>
                      <TableCell className="whitespace-nowrap text-xs">
                        {new Date(envio.criado_em).toLocaleString("pt-BR", {
                          day: "2-digit",
                          month: "2-digit",
                          year: "2-digit",
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </TableCell>
                      <TableCell className="font-mono text-xs">{envio.cpf}</TableCell>
                      <TableCell className="font-mono text-xs">{envio.telefone}</TableCell>
                      <TableCell>
                        <Badge variant={envio.tipo_envio === "D-1" ? "secondary" : "default"}>
                          {envio.tipo_envio === "D-1" ? "P (A pagar)" : envio.tipo_envio === "D0" ? "V (Vencida)" : envio.tipo_envio}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className="text-xs capitalize">
                          {envio.status_fatura}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        {envio.enviado_com_sucesso ? (
                          <CheckCircle2 className="w-5 h-5 text-green-600" />
                        ) : (
                          <XCircle className="w-5 h-5 text-red-500" />
                        )}
                      </TableCell>
                      <TableCell className="max-w-[200px]">
                        <p className="text-xs text-muted-foreground truncate" title={envio.mensagem}>
                          {envio.mensagem?.slice(0, 80)}...
                        </p>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default HistoricoEnviosPage;
