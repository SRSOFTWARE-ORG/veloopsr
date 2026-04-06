import { useState, useEffect, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { AlertCircle, Send, TestTube, Clock, Users, CheckCircle2, XCircle, Megaphone, Trash2, Eye } from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

interface Comunicado {
  id: string;
  titulo: string;
  mensagem: string;
  formato: string;
  media_url: string | null;
  agendado_para: string | null;
  status: string;
  total_destinatarios: number;
  total_enviados: number;
  total_falhas: number;
  created_at: string;
}

interface Destinatario {
  id: string;
  nome: string;
  telefone: string;
  status: string;
  erro: string | null;
  enviado_em: string | null;
}

export default function ComunicadosPage() {
  const { user } = useAuth();
  const [tab, setTab] = useState("novo");

  // Form state
  const [titulo, setTitulo] = useState("");
  const [mensagem, setMensagem] = useState("");
  const [formato, setFormato] = useState("texto");
  const [mediaUrl, setMediaUrl] = useState("");
  const [agendamento, setAgendamento] = useState("");
  const [testPhone, setTestPhone] = useState("");
  const [filtroDestinatarios, setFiltroDestinatarios] = useState("todos");

  // Data
  const [comunicados, setComunicados] = useState<Comunicado[]>([]);
  const [clientCount, setClientCount] = useState(0);
  const [filteredCount, setFilteredCount] = useState<number | null>(null);
  const [loadingFilter, setLoadingFilter] = useState(false);
  const [blacklistCount, setBlacklistCount] = useState(0);
  const [sending, setSending] = useState(false);
  const [testSending, setTestSending] = useState(false);

  // Detail view
  const [detailId, setDetailId] = useState<string | null>(null);
  const [destinatarios, setDestinatarios] = useState<Destinatario[]>([]);

  useEffect(() => {
    loadData();
  }, []);

  // Realtime progress
  useEffect(() => {
    const channel = supabase
      .channel("comunicado-progress")
      .on("postgres_changes", { event: "*", schema: "public", table: "comunicado_destinatarios" }, () => {
        if (detailId) loadDestinatarios(detailId);
        loadComunicados();
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [detailId]);

  async function loadData() {
    await Promise.all([loadComunicados(), loadCounts()]);
  }

  async function loadComunicados() {
    const { data } = await supabase
      .from("comunicados")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(50);
    if (data) setComunicados(data as any);
  }

  async function loadCounts() {
    const [{ count: cc }, { count: bc }] = await Promise.all([
      supabase.from("clientes").select("id", { count: "exact", head: true }).not("telefone", "is", null),
      supabase.from("whatsapp_blacklist").select("id", { count: "exact", head: true }),
    ]);
    setClientCount(cc || 0);
    setBlacklistCount(bc || 0);
  }

  useEffect(() => {
    loadFilteredCount();
  }, [filtroDestinatarios]);

  async function loadFilteredCount() {
    if (filtroDestinatarios === "todos") {
      setFilteredCount(null);
      return;
    }
    setLoadingFilter(true);
    try {
      // Get clients with pending/overdue payments
      const { data: pagamentos } = await supabase
        .from("cobranca_pagamentos")
        .select("cobranca_id, status, data_vencimento");

      const { data: cobrancas } = await supabase
        .from("cobrancas")
        .select("id, cliente_id");

      const { data: clientes } = await supabase
        .from("clientes")
        .select("id")
        .not("telefone", "is", null);

      if (!pagamentos || !cobrancas || !clientes) {
        setFilteredCount(0);
        setLoadingFilter(false);
        return;
      }

      const cobrancaToCliente = new Map(cobrancas.map(c => [c.id, c.cliente_id]));
      const clienteIds = new Set(clientes.map(c => c.id));
      const hoje = new Date().toISOString().split("T")[0];

      // Categorize clients
      const clientesComPendente = new Set<string>();
      const clientesComAtraso = new Set<string>();
      const clientesComPagamento = new Set<string>();

      for (const p of pagamentos) {
        const clienteId = cobrancaToCliente.get(p.cobranca_id);
        if (!clienteId || !clienteIds.has(clienteId)) continue;
        clientesComPagamento.add(clienteId);
        if (p.status === "a_pagar" || p.status === "pendente") {
          clientesComPendente.add(clienteId);
          if (p.data_vencimento < hoje) {
            clientesComAtraso.add(clienteId);
          }
        }
      }

      let count = 0;
      if (filtroDestinatarios === "com_pendentes") {
        count = clientesComPendente.size;
      } else if (filtroDestinatarios === "com_atraso") {
        count = clientesComAtraso.size;
      } else if (filtroDestinatarios === "em_dia") {
        // Clients who have payments but none pending
        count = [...clientesComPagamento].filter(id => !clientesComPendente.has(id)).length;
      }
      setFilteredCount(count);
    } catch {
      setFilteredCount(0);
    }
    setLoadingFilter(false);
  }

  async function loadDestinatarios(cId: string) {
    const { data } = await supabase
      .from("comunicado_destinatarios")
      .select("id, nome, telefone, status, erro, enviado_em")
      .eq("comunicado_id", cId)
      .order("enviado_em", { ascending: true });
    if (data) setDestinatarios(data as any);
  }

  async function handleTestSend() {
    if (!mensagem.trim()) { toast.error("Escreva a mensagem"); return; }
    if (!testPhone.trim()) { toast.error("Informe o número de teste"); return; }

    setTestSending(true);
    try {
      const { data, error } = await supabase.functions.invoke("send-comunicado", {
        body: {
          test_phone: testPhone,
          test_name: "Teste",
          mensagem,
          formato,
          media_url: formato === "midia" ? mediaUrl : undefined,
        },
      });
      if (error) throw error;
      if (data?.success) toast.success("Mensagem de teste enviada!");
      else toast.error("Falha no envio de teste");
    } catch (e: any) {
      toast.error(e.message || "Erro ao enviar teste");
    } finally {
      setTestSending(false);
    }
  }

  async function handleSend() {
    if (!titulo.trim() || !mensagem.trim()) {
      toast.error("Preencha título e mensagem");
      return;
    }

    setSending(true);
    try {
      // Create comunicado record
      const { data: com, error: insertErr } = await supabase.from("comunicados").insert({
        criado_por: user!.id,
        titulo,
        mensagem,
        formato,
        media_url: formato === "midia" ? mediaUrl || null : null,
        agendado_para: agendamento || null,
        status: "enviando",
      }).select().single();

      if (insertErr || !com) throw insertErr || new Error("Erro ao criar comunicado");

      // If scheduled for later, just save
      if (agendamento && new Date(agendamento) > new Date()) {
        await supabase.from("comunicados").update({ status: "agendado" }).eq("id", (com as any).id);
        toast.success("Comunicado agendado com sucesso!");
        resetForm();
        loadComunicados();
        setSending(false);
        return;
      }

      // Invoke edge function for immediate sending
      toast.info("Disparo iniciado! Acompanhe o progresso no histórico.", { duration: 5000 });
      setTab("historico");
      loadComunicados();

      supabase.functions.invoke("send-comunicado", {
        body: { comunicado_id: (com as any).id, filtro: filtroDestinatarios },
      }).then(({ data, error }) => {
        if (error) console.error("send-comunicado error:", error);
        else console.log("send-comunicado result:", data);
        loadComunicados();
      });

      resetForm();
    } catch (e: any) {
      toast.error(e.message || "Erro ao iniciar disparo");
    } finally {
      setSending(false);
    }
  }

  function resetForm() {
    setTitulo("");
    setMensagem("");
    setFormato("texto");
    setMediaUrl("");
    setAgendamento("");
    setFiltroDestinatarios("todos");
    setFilteredCount(null);
  }

  async function handleDelete(id: string) {
    if (!confirm("Excluir este comunicado?")) return;
    await supabase.from("comunicados").delete().eq("id", id);
    setComunicados((prev) => prev.filter((c) => c.id !== id));
    if (detailId === id) setDetailId(null);
    toast.success("Comunicado excluído");
  }

  function viewDetails(c: Comunicado) {
    setDetailId(c.id);
    loadDestinatarios(c.id);
    setTab("detalhes");
  }

  const previewMsg = useMemo(() => {
    return mensagem.replace(/\{\{nome\}\}/gi, "João");
  }, [mensagem]);

  const statusBadge = (s: string) => {
    const map: Record<string, { variant: "default" | "secondary" | "destructive" | "outline"; label: string }> = {
      rascunho: { variant: "secondary", label: "Rascunho" },
      agendado: { variant: "outline", label: "Agendado" },
      enviando: { variant: "default", label: "Enviando..." },
      concluido: { variant: "default", label: "Concluído" },
      falha: { variant: "destructive", label: "Falha" },
      pendente: { variant: "secondary", label: "Pendente" },
      enviado: { variant: "default", label: "Enviado" },
    };
    const m = map[s] || { variant: "secondary" as const, label: s };
    return <Badge variant={m.variant}>{m.label}</Badge>;
  };

  return (
    <div className="p-4 md:p-6 space-y-4 pb-24 md:pb-6">
      <div className="flex items-center gap-3">
        <Megaphone className="w-6 h-6 text-primary" />
        <h1 className="text-2xl font-bold">Comunicados WhatsApp</h1>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card>
          <CardContent className="p-4 text-center">
            <Users className="w-5 h-5 mx-auto text-primary mb-1" />
            <p className="text-2xl font-bold">{clientCount}</p>
            <p className="text-xs text-muted-foreground">Clientes com telefone</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <AlertCircle className="w-5 h-5 mx-auto text-destructive mb-1" />
            <p className="text-2xl font-bold">{blacklistCount}</p>
            <p className="text-xs text-muted-foreground">Na blacklist</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <Send className="w-5 h-5 mx-auto text-primary mb-1" />
            <p className="text-2xl font-bold">{comunicados.filter((c) => c.status === "concluido").length}</p>
            <p className="text-xs text-muted-foreground">Campanhas enviadas</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <Clock className="w-5 h-5 mx-auto text-warning mb-1" />
            <p className="text-2xl font-bold">{comunicados.filter((c) => c.status === "agendado").length}</p>
            <p className="text-xs text-muted-foreground">Agendadas</p>
          </CardContent>
        </Card>
      </div>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="w-full grid grid-cols-3">
          <TabsTrigger value="novo">Novo Comunicado</TabsTrigger>
          <TabsTrigger value="historico">Histórico</TabsTrigger>
          <TabsTrigger value="detalhes" disabled={!detailId}>Detalhes</TabsTrigger>
        </TabsList>

        {/* New Comunicado */}
        <TabsContent value="novo" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Criar Comunicado</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <Label>Título da campanha</Label>
                <Input value={titulo} onChange={(e) => setTitulo(e.target.value)} placeholder="Ex: Promoção de Julho" />
              </div>

              <div>
                <Label>Mensagem</Label>
                <Textarea
                  value={mensagem}
                  onChange={(e) => setMensagem(e.target.value)}
                  placeholder="Use {{nome}} para inserir o primeiro nome do cliente automaticamente"
                  rows={5}
                />
                <p className="text-xs text-muted-foreground mt-1">
                  Variáveis disponíveis: <code className="bg-muted px-1 rounded">{"{{nome}}"}</code> = primeiro nome do cliente
                </p>
              </div>

              {mensagem && (
                <div className="p-3 bg-muted rounded-lg">
                  <p className="text-xs font-medium text-muted-foreground mb-1">Pré-visualização:</p>
                  <p className="text-sm whitespace-pre-wrap">{previewMsg}</p>
                </div>
              )}

              <div>
                <Label>Destinatários</Label>
                <Select value={filtroDestinatarios} onValueChange={setFiltroDestinatarios}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="todos">Todos os clientes com telefone</SelectItem>
                    <SelectItem value="com_pendentes">Clientes com parcelas pendentes</SelectItem>
                    <SelectItem value="com_atraso">Clientes com parcelas atrasadas</SelectItem>
                    <SelectItem value="em_dia">Clientes em dia (sem pendências)</SelectItem>
                  </SelectContent>
                </Select>
                {filtroDestinatarios !== "todos" && (
                  <p className="text-xs text-muted-foreground mt-1">
                    {loadingFilter ? "Calculando..." : `${filteredCount ?? 0} clientes neste filtro`}
                  </p>
                )}
              </div>

              <div>
                <Label>Formato</Label>
                <Select value={formato} onValueChange={setFormato}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="texto">Apenas Texto</SelectItem>
                    <SelectItem value="midia">Mídia (Imagem/Vídeo) + Legenda</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {formato === "midia" && (
                <div>
                  <Label>URL da Mídia</Label>
                  <Input value={mediaUrl} onChange={(e) => setMediaUrl(e.target.value)} placeholder="https://exemplo.com/imagem.jpg" />
                </div>
              )}

              <div>
                <Label>Agendamento (opcional)</Label>
                <Input type="datetime-local" value={agendamento} onChange={(e) => setAgendamento(e.target.value)} />
                <p className="text-xs text-muted-foreground mt-1">Deixe vazio para enviar agora</p>
              </div>

              <div className="p-3 bg-amber-50 dark:bg-amber-950/30 rounded-lg border border-amber-200 dark:border-amber-800 text-sm">
                <p className="font-medium text-amber-800 dark:text-amber-300 flex items-center gap-2">
                  <AlertCircle className="w-4 h-4" /> Lógica Anti-Banimento Ativa
                </p>
                <p className="text-amber-700 dark:text-amber-400 mt-1">
                  Mensagens serão enviadas individualmente com delay aleatório de 15-30s entre cada.
                  Números duplicados, inválidos e da blacklist são filtrados automaticamente.
                </p>
              </div>

              <div className="flex flex-col sm:flex-row gap-3">
                <div className="flex-1 flex gap-2 items-end">
                  <div className="flex-1">
                    <Label>Enviar teste para:</Label>
                    <Input value={testPhone} onChange={(e) => setTestPhone(e.target.value)} placeholder="27999177265" />
                  </div>
                  <Button variant="outline" onClick={handleTestSend} disabled={testSending}>
                    <TestTube className="w-4 h-4 mr-1" />
                    {testSending ? "Enviando..." : "Testar"}
                  </Button>
                </div>
              </div>

              <Button
                className="w-full"
                size="lg"
                onClick={handleSend}
                disabled={sending || !titulo.trim() || !mensagem.trim()}
              >
                <Send className="w-4 h-4 mr-2" />
                {agendamento && new Date(agendamento) > new Date()
                  ? "Agendar Comunicado"
                  : `Disparar para ${filtroDestinatarios !== "todos" ? (filteredCount ?? "...") : clientCount - blacklistCount} clientes`}
              </Button>

              <p className="text-xs text-muted-foreground text-center">
                Todas as mensagens incluem: "Responda 'SAIR' para não receber mais avisos."
              </p>
            </CardContent>
          </Card>
        </TabsContent>

        {/* History */}
        <TabsContent value="historico">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Histórico de Campanhas</CardTitle>
            </CardHeader>
            <CardContent>
              {comunicados.length === 0 ? (
                <p className="text-center text-muted-foreground py-8">Nenhum comunicado enviado ainda</p>
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Data</TableHead>
                        <TableHead>Título</TableHead>
                        <TableHead>Formato</TableHead>
                        <TableHead>Progresso</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead></TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {comunicados.map((c) => {
                        const pct = c.total_destinatarios > 0
                          ? Math.round(((c.total_enviados + c.total_falhas) / c.total_destinatarios) * 100)
                          : 0;
                        return (
                          <TableRow key={c.id}>
                            <TableCell className="text-xs whitespace-nowrap">
                              {format(new Date(c.created_at), "dd/MM/yy HH:mm", { locale: ptBR })}
                            </TableCell>
                            <TableCell className="font-medium">{c.titulo}</TableCell>
                            <TableCell>
                              <Badge variant="outline">{c.formato === "midia" ? "Mídia" : "Texto"}</Badge>
                            </TableCell>
                            <TableCell className="min-w-[120px]">
                              <div className="space-y-1">
                                <Progress value={pct} className="h-2" />
                                <p className="text-xs text-muted-foreground">
                                  {c.total_enviados}/{c.total_destinatarios}
                                  {c.total_falhas > 0 && <span className="text-destructive ml-1">({c.total_falhas} falhas)</span>}
                                </p>
                              </div>
                            </TableCell>
                            <TableCell>{statusBadge(c.status)}</TableCell>
                            <TableCell>
                              <div className="flex gap-1">
                                <Button variant="ghost" size="icon" onClick={() => viewDetails(c)}>
                                  <Eye className="w-4 h-4" />
                                </Button>
                                <Button variant="ghost" size="icon" onClick={() => handleDelete(c.id)}>
                                  <Trash2 className="w-4 h-4 text-destructive" />
                                </Button>
                              </div>
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Details */}
        <TabsContent value="detalhes">
          {detailId && (
            <Card>
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  Detalhes do Envio
                  <Button variant="ghost" size="sm" onClick={() => { setDetailId(null); setTab("historico"); }}>
                    Voltar
                  </Button>
                </CardTitle>
              </CardHeader>
              <CardContent>
                {destinatarios.length === 0 ? (
                  <p className="text-center text-muted-foreground py-4">Carregando destinatários...</p>
                ) : (
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Nome</TableHead>
                          <TableHead>Telefone</TableHead>
                          <TableHead>Status</TableHead>
                          <TableHead>Enviado em</TableHead>
                          <TableHead>Erro</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {destinatarios.map((d) => (
                          <TableRow key={d.id}>
                            <TableCell>{d.nome}</TableCell>
                            <TableCell className="text-xs font-mono">{d.telefone}</TableCell>
                            <TableCell>
                              {d.status === "enviado" ? (
                                <CheckCircle2 className="w-4 h-4 text-green-600" />
                              ) : d.status === "falha" ? (
                                <XCircle className="w-4 h-4 text-destructive" />
                              ) : (
                                <Clock className="w-4 h-4 text-muted-foreground animate-pulse" />
                              )}
                            </TableCell>
                            <TableCell className="text-xs">
                              {d.enviado_em ? format(new Date(d.enviado_em), "HH:mm:ss") : "-"}
                            </TableCell>
                            <TableCell className="text-xs text-destructive">{d.erro || "-"}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </CardContent>
            </Card>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
