import { useEffect, useState, useCallback, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { Plus, Search, Users, Edit, Trash2, ChevronDown, ChevronUp, Loader2, Camera, ChevronsUpDown, Check, UserPlus } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList,
} from "@/components/ui/command";
import {
  Popover, PopoverContent, PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { maskCPFOrCNPJ, maskPhone, maskCEP, validateCPFOrCNPJ } from "@/lib/masks";

interface Cliente {
  id: string;
  nome: string;
  cpf: string | null;
  telefone: string | null;
  email: string | null;
  endereco: string | null;
  observacoes: string | null;
  created_at: string;
  tipo: string | null;
  rg: string | null;
  rg_emissor: string | null;
  rg_data_emissao: string | null;
  inscricao_estadual: string | null;
  cep: string | null;
  complemento: string | null;
  bairro: string | null;
  cidade: string | null;
  uf: string | null;
  naturalidade: string | null;
  data_nascimento: string | null;
  estado_civil: string | null;
  nome_pai: string | null;
  nome_mae: string | null;
  parent_id: string | null;
}

const emptyForm = {
  nome: "",
  cpf: "",
  telefone: "",
  email: "",
  endereco: "",
  observacoes: "",
  tipo: "",
  rg: "",
  rg_emissor: "",
  rg_data_emissao: "",
  inscricao_estadual: "",
  cep: "",
  complemento: "",
  bairro: "",
  cidade: "",
  uf: "",
  naturalidade: "",
  data_nascimento: "",
  estado_civil: "",
  nome_pai: "",
  nome_mae: "",
  parent_id: "",
};

const ClientesPage = () => {
  const { isAdmin, isPrimaryAdmin, isReadOnly, user } = useAuth();
  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [search, setSearch] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Cliente | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [showExtra, setShowExtra] = useState(false);
  const [loadingCep, setLoadingCep] = useState(false);
  const [scanning, setScanning] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [parentPopoverOpen, setParentPopoverOpen] = useState(false);

  const handleScanDocument = async (file: File) => {
    setScanning(true);
    try {
      const reader = new FileReader();
      const base64 = await new Promise<string>((resolve, reject) => {
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });

      const { data, error } = await supabase.functions.invoke("scan-client-document", {
        body: { image: base64 },
      });

      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      const extracted = data?.data;
      if (!extracted) throw new Error("Nenhum dado extraído");

      setForm((prev) => ({
        ...prev,
        nome: extracted.nome || prev.nome,
        cpf: extracted.cpf || prev.cpf,
        telefone: extracted.telefone || prev.telefone,
        email: extracted.email || prev.email,
        rg: extracted.rg || prev.rg,
        rg_emissor: extracted.rg_emissor || prev.rg_emissor,
        rg_data_emissao: extracted.rg_data_emissao || prev.rg_data_emissao,
        data_nascimento: extracted.data_nascimento || prev.data_nascimento,
        naturalidade: extracted.naturalidade || prev.naturalidade,
        nome_pai: extracted.nome_pai || prev.nome_pai,
        nome_mae: extracted.nome_mae || prev.nome_mae,
        endereco: extracted.endereco || prev.endereco,
        complemento: extracted.complemento || prev.complemento,
        bairro: extracted.bairro || prev.bairro,
        cidade: extracted.cidade || prev.cidade,
        uf: extracted.uf || prev.uf,
        cep: extracted.cep || prev.cep,
        estado_civil: extracted.estado_civil || prev.estado_civil,
        tipo: extracted.tipo || prev.tipo,
        inscricao_estadual: extracted.inscricao_estadual || prev.inscricao_estadual,
        observacoes: extracted.observacoes || prev.observacoes,
      }));
      setShowExtra(true);
      toast.success("Dados extraídos da foto com sucesso!");
    } catch (err: any) {
      console.error("Scan error:", err);
      toast.error(err.message || "Erro ao escanear documento");
    } finally {
      setScanning(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const fetchCep = async (cep: string) => {
    const clean = cep.replace(/\D/g, "");
    if (clean.length !== 8) return;
    setLoadingCep(true);
    try {
      const res = await fetch(`https://viacep.com.br/ws/${clean}/json/`);
      const data = await res.json();
      if (data.erro) {
        toast.error("CEP não encontrado");
        return;
      }
      setForm((prev) => ({
        ...prev,
        endereco: data.logradouro || prev.endereco,
        bairro: data.bairro || prev.bairro,
        cidade: data.localidade || prev.cidade,
        uf: data.uf || prev.uf,
      }));
      toast.success("Endereço preenchido automaticamente");
    } catch {
      toast.error("Erro ao buscar CEP");
    } finally {
      setLoadingCep(false);
    }
  };

  useEffect(() => {
    fetchClientes();
  }, []);

  const fetchClientes = async () => {
    const { data } = await supabase.from("clientes").select("*").order("nome");
    setClientes((data as unknown as Cliente[]) || []);
  };

  const resetForm = () => {
    setForm(emptyForm);
    setEditing(null);
    setShowExtra(false);
  };

  const openEdit = (c: Cliente) => {
    setEditing(c);
    setForm({
      nome: c.nome,
      cpf: c.cpf || "",
      telefone: c.telefone || "",
      email: c.email || "",
      endereco: c.endereco || "",
      observacoes: c.observacoes || "",
      tipo: c.tipo || "",
      rg: c.rg || "",
      rg_emissor: c.rg_emissor || "",
      rg_data_emissao: c.rg_data_emissao || "",
      inscricao_estadual: c.inscricao_estadual || "",
      cep: c.cep || "",
      complemento: c.complemento || "",
      bairro: c.bairro || "",
      cidade: c.cidade || "",
      uf: c.uf || "",
      naturalidade: c.naturalidade || "",
      data_nascimento: c.data_nascimento || "",
      estado_civil: c.estado_civil || "",
      nome_pai: c.nome_pai || "",
      nome_mae: c.nome_mae || "",
      parent_id: c.parent_id || "",
    });
    setShowExtra(true);
    setDialogOpen(true);
  };

  const set = (field: string, value: string) => setForm((p) => ({ ...p, [field]: value }));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!form.nome.trim()) { toast.error("Nome é obrigatório"); return; }
    const isSubcliente = !!form.parent_id;
    if (!isSubcliente) {
      if (!form.telefone.trim()) { toast.error("Telefone é obrigatório"); return; }
      if (!form.cpf.trim()) { toast.error("CPF é obrigatório"); return; }
      if (!validateCPFOrCNPJ(form.cpf)) { toast.error("CPF/CNPJ inválido"); return; }
    }

    const payload: any = {
      nome: form.nome.trim(),
      cpf: form.cpf.trim(),
      telefone: form.telefone.trim(),
      email: form.email.trim() || null,
      endereco: form.endereco.trim() || null,
      observacoes: form.observacoes.trim() || null,
      tipo: form.tipo || null,
      rg: form.rg.trim() || null,
      rg_emissor: form.rg_emissor.trim() || null,
      rg_data_emissao: form.rg_data_emissao || null,
      inscricao_estadual: form.inscricao_estadual.trim() || null,
      cep: form.cep.trim() || null,
      complemento: form.complemento.trim() || null,
      bairro: form.bairro.trim() || null,
      cidade: form.cidade.trim() || null,
      uf: form.uf.trim() || null,
      naturalidade: form.naturalidade.trim() || null,
      data_nascimento: form.data_nascimento || null,
      estado_civil: form.estado_civil || null,
      nome_pai: form.nome_pai.trim() || null,
      nome_mae: form.nome_mae.trim() || null,
      parent_id: form.parent_id || null,
    } as any;

    if (!editing) payload.criado_por = user?.id;

    if (editing) {
      const { error } = await supabase.from("clientes").update(payload).eq("id", editing.id);
      if (error) { toast.error("Erro ao atualizar"); return; }
      toast.success("Cliente atualizado!");
    } else {
      const { error } = await supabase.from("clientes").insert(payload);
      if (error) { toast.error("Erro ao cadastrar"); return; }
      toast.success("Cliente cadastrado!");
    }

    setDialogOpen(false);
    resetForm();
    fetchClientes();
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Excluir este cliente?")) return;
    const { error } = await supabase.from("clientes").delete().eq("id", id);
    if (error) { toast.error("Erro ao excluir"); return; }
    toast.success("Cliente excluído");
    fetchClientes();
  };

  const filtered = clientes.filter(
    (c) =>
      c.nome.toLowerCase().includes(search.toLowerCase()) ||
      c.cpf?.includes(search) ||
      c.telefone?.includes(search) ||
      c.email?.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="page-container pb-24 md:pb-8">
      <div className="flex items-center justify-between mb-4 slide-up">
        <div>
          <h1 className="text-xl font-extrabold tracking-tight">Clientes</h1>
          <p className="text-sm text-muted-foreground">{clientes.length} cadastrados</p>
        </div>
        <Dialog open={dialogOpen} onOpenChange={(open) => { setDialogOpen(open); if (!open) resetForm(); }}>
          <DialogTrigger asChild>
            <Button size="sm">
              <Plus className="w-4 h-4 mr-1" /> Novo
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>{editing ? "Editar Cliente" : "Cadastro de Cliente"}</DialogTitle>
            </DialogHeader>
            
            {/* Scan document button */}
            <div className="flex items-center gap-2">
              <input
                type="file"
                accept="image/*"
                capture="environment"
                ref={fileInputRef}
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) handleScanDocument(file);
                }}
              />
              <Button
                type="button"
                variant="outline"
                className="w-full gap-2"
                disabled={scanning}
                onClick={() => fileInputRef.current?.click()}
              >
                {scanning ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Camera className="w-4 h-4" />
                )}
                {scanning ? "Escaneando documento..." : "Escanear documento com foto"}
              </Button>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              {/* Required fields */}
              <div className="space-y-3">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Dados obrigatórios</p>
                <div className="space-y-2">
                  <Label>Nome completo *</Label>
                  <Input placeholder="Nome do cliente" value={form.nome} onChange={(e) => set("nome", e.target.value)} required />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-2">
                    <Label>Celular *</Label>
                    <Input placeholder="(00) 00000-0000" value={form.telefone} onChange={(e) => set("telefone", maskPhone(e.target.value))} required />
                  </div>
                  <div className="space-y-2">
                    <Label>CPF / CNPJ *</Label>
                    <Input placeholder="000.000.000-00" value={form.cpf} onChange={(e) => set("cpf", maskCPFOrCNPJ(e.target.value))} required />
              </div>

              {/* Cliente Principal (Parent) */}
              <div className="space-y-2">
                <Label className="flex items-center gap-1.5">
                  <UserPlus className="w-3.5 h-3.5 text-primary" /> Cliente Principal (opcional)
                </Label>
                <p className="text-[11px] text-muted-foreground">Se este cliente for um subcliente, selecione o cliente principal.</p>
                <Popover open={parentPopoverOpen} onOpenChange={setParentPopoverOpen}>
                  <PopoverTrigger asChild>
                    <Button variant="outline" role="combobox" className="w-full justify-between font-normal h-10">
                      {form.parent_id
                        ? clientes.find((c) => c.id === form.parent_id)?.nome || "Cliente removido"
                        : "Nenhum (cliente principal)"}
                      <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-full p-0" align="start">
                    <Command>
                      <CommandInput placeholder="Buscar cliente principal..." />
                      <CommandList>
                        <CommandEmpty>Nenhum cliente encontrado.</CommandEmpty>
                        <CommandGroup>
                          <CommandItem
                            value="__none__"
                            onSelect={() => {
                              set("parent_id", "");
                              setParentPopoverOpen(false);
                            }}
                          >
                            <Check className={cn("mr-2 h-4 w-4", !form.parent_id ? "opacity-100" : "opacity-0")} />
                            Nenhum (cliente principal)
                          </CommandItem>
                          {clientes
                            .filter((c) => !c.parent_id && c.id !== editing?.id)
                            .map((c) => (
                              <CommandItem
                                key={c.id}
                                value={c.nome}
                                onSelect={() => {
                                  set("parent_id", c.id);
                                  setParentPopoverOpen(false);
                                }}
                              >
                                <Check className={cn("mr-2 h-4 w-4", form.parent_id === c.id ? "opacity-100" : "opacity-0")} />
                                {c.nome}
                              </CommandItem>
                            ))}
                        </CommandGroup>
                      </CommandList>
                    </Command>
                  </PopoverContent>
                </Popover>
              </div>
                </div>
              </div>

              {/* Toggle extra fields */}
              <button
                type="button"
                onClick={() => setShowExtra(!showExtra)}
                className="flex items-center gap-2 text-sm text-primary font-medium w-full justify-center py-2 rounded-lg hover:bg-primary/5 transition-colors"
              >
                {showExtra ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                {showExtra ? "Ocultar dados adicionais" : "Mostrar dados adicionais"}
              </button>

              {showExtra && (
                <div className="space-y-4">
                  {/* Tipo & Documentos */}
                  <div className="space-y-3">
                    <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Documentos</p>
                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-2">
                        <Label>Tipo</Label>
                        <Select value={form.tipo} onValueChange={(v) => set("tipo", v)}>
                          <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="fisica">Pessoa Física</SelectItem>
                            <SelectItem value="juridica">Pessoa Jurídica</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-2">
                        <Label>Inscrição Estadual</Label>
                        <Input placeholder="Inscrição Estadual" value={form.inscricao_estadual} onChange={(e) => set("inscricao_estadual", e.target.value)} />
                      </div>
                    </div>
                    <div className="grid grid-cols-3 gap-3">
                      <div className="space-y-2">
                        <Label>RG</Label>
                        <Input placeholder="RG" value={form.rg} onChange={(e) => set("rg", e.target.value)} />
                      </div>
                      <div className="space-y-2">
                        <Label>Emissor</Label>
                        <Input placeholder="SSP/UF" value={form.rg_emissor} onChange={(e) => set("rg_emissor", e.target.value)} />
                      </div>
                      <div className="space-y-2">
                        <Label>Dt. Emissão</Label>
                        <Input type="date" value={form.rg_data_emissao} onChange={(e) => set("rg_data_emissao", e.target.value)} />
                      </div>
                    </div>
                  </div>

                  {/* Endereço */}
                  <div className="space-y-3">
                    <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Endereço</p>
                    <div className="grid grid-cols-3 gap-3">
                      <div className="space-y-2">
                        <Label>CEP</Label>
                        <div className="relative">
                          <Input
                            placeholder="00000-000"
                            value={form.cep}
                            onChange={(e) => {
                              const masked = maskCEP(e.target.value);
                              set("cep", masked);
                              const clean = masked.replace(/\D/g, "");
                              if (clean.length === 8) fetchCep(clean);
                            }}
                          />
                          {loadingCep && (
                            <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 animate-spin text-muted-foreground" />
                          )}
                        </div>
                      </div>
                      <div className="col-span-2 space-y-2">
                        <Label>Endereço</Label>
                        <Input placeholder="Rua, número" value={form.endereco} onChange={(e) => set("endereco", e.target.value)} />
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-2">
                        <Label>Complemento</Label>
                        <Input placeholder="Apto, bloco..." value={form.complemento} onChange={(e) => set("complemento", e.target.value)} />
                      </div>
                      <div className="space-y-2">
                        <Label>Bairro</Label>
                        <Input placeholder="Bairro" value={form.bairro} onChange={(e) => set("bairro", e.target.value)} />
                      </div>
                    </div>
                    <div className="grid grid-cols-3 gap-3">
                      <div className="space-y-2">
                        <Label>Cidade</Label>
                        <Input placeholder="Cidade" value={form.cidade} onChange={(e) => set("cidade", e.target.value)} />
                      </div>
                      <div className="space-y-2">
                        <Label>UF</Label>
                        <Input placeholder="UF" maxLength={2} value={form.uf} onChange={(e) => set("uf", e.target.value.toUpperCase())} />
                      </div>
                      <div className="space-y-2">
                        <Label>Naturalidade</Label>
                        <Input placeholder="Naturalidade" value={form.naturalidade} onChange={(e) => set("naturalidade", e.target.value)} />
                      </div>
                    </div>
                  </div>

                  {/* Dados pessoais */}
                  <div className="space-y-3">
                    <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Dados pessoais</p>
                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-2">
                        <Label>Data de Nascimento</Label>
                        <Input type="date" value={form.data_nascimento} onChange={(e) => set("data_nascimento", e.target.value)} />
                      </div>
                      <div className="space-y-2">
                        <Label>Estado Civil</Label>
                        <Select value={form.estado_civil} onValueChange={(v) => set("estado_civil", v)}>
                          <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="solteiro">Solteiro(a)</SelectItem>
                            <SelectItem value="casado">Casado(a)</SelectItem>
                            <SelectItem value="divorciado">Divorciado(a)</SelectItem>
                            <SelectItem value="viuvo">Viúvo(a)</SelectItem>
                            <SelectItem value="outro">Outro</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                    <div className="space-y-2">
                      <Label>E-mail</Label>
                      <Input type="email" placeholder="email@exemplo.com" value={form.email} onChange={(e) => set("email", e.target.value)} />
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-2">
                        <Label>Nome do Pai</Label>
                        <Input placeholder="Nome do pai" value={form.nome_pai} onChange={(e) => set("nome_pai", e.target.value)} />
                      </div>
                      <div className="space-y-2">
                        <Label>Nome da Mãe</Label>
                        <Input placeholder="Nome da mãe" value={form.nome_mae} onChange={(e) => set("nome_mae", e.target.value)} />
                      </div>
                    </div>
                  </div>

                  {/* Observações */}
                  <div className="space-y-2">
                    <Label>Observações</Label>
                    <Textarea placeholder="Observações sobre o cliente..." value={form.observacoes} onChange={(e) => set("observacoes", e.target.value)} rows={3} />
                  </div>
                </div>
              )}

              <Button type="submit" className="w-full">
                {editing ? "Salvar Alterações" : "Cadastrar Cliente"}
              </Button>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      <div className="relative mb-4 slide-up delay-1">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input placeholder="Buscar por nome, CPF, telefone ou e-mail..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-10" />
      </div>

      <div className="space-y-2">
        {filtered.map((c, i) => (
          <Card key={c.id} className={`slide-up delay-${Math.min(i + 2, 6)}`}>
            <CardContent className="p-4 flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                <span className="text-sm font-bold text-primary">{c.nome.charAt(0).toUpperCase()}</span>
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <p className="font-semibold text-sm truncate">{c.nome}</p>
                  {c.parent_id && (
                    <span className="text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-accent text-accent-foreground shrink-0">
                      Sub: {clientes.find((p) => p.id === c.parent_id)?.nome || "—"}
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                  {c.cpf && <span className="text-xs text-muted-foreground">CPF: {c.cpf}</span>}
                  {c.telefone && <span className="text-xs text-muted-foreground">Tel: {c.telefone}</span>}
                  {c.email && <span className="text-xs text-muted-foreground">{c.email}</span>}
                  {c.cidade && c.uf && <span className="text-xs text-muted-foreground">{c.cidade}/{c.uf}</span>}
                </div>
              </div>
              <div className="flex items-center gap-1 shrink-0">
                <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openEdit(c)}>
                  <Edit className="w-4 h-4" />
                </Button>
                {isPrimaryAdmin && (
                  <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={() => handleDelete(c.id)}>
                    <Trash2 className="w-4 h-4" />
                  </Button>
                )}
              </div>
            </CardContent>
          </Card>
        ))}
        {filtered.length === 0 && (
          <div className="text-center py-12 text-muted-foreground">
            <Users className="w-12 h-12 mx-auto mb-3 opacity-30" />
            <p className="font-medium">Nenhum cliente encontrado</p>
            <p className="text-sm">Cadastre seu primeiro cliente</p>
          </div>
        )}
      </div>
    </div>
  );
};

export default ClientesPage;
