import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList,
} from "@/components/ui/command";
import {
  Popover, PopoverContent, PopoverTrigger,
} from "@/components/ui/popover";
import { ChevronsUpDown, Check, Smartphone, Hash, HardDrive, User, Users, Package } from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

interface Cliente {
  id: string;
  nome: string;
  parent_id: string | null;
}

interface Produto {
  id: string;
  nome: string;
  categoria: string | null;
  subcategoria: string | null;
}

interface DispositivoFormProps {
  clientes: Cliente[];
  onSuccess: () => void;
  onClose: () => void;
}

const maskIMEI = (v: string): string => v.replace(/\D/g, "").slice(0, 15);

const MEMORIA_OPTIONS = ["32GB", "64GB", "128GB", "256GB", "512GB", "1TB"];

const DispositivoForm = ({ clientes, onSuccess, onClose }: DispositivoFormProps) => {
  const [clientePopoverOpen, setClientePopoverOpen] = useState(false);
  const [subclientePopoverOpen, setSubclientePopoverOpen] = useState(false);
  const [produtoPopoverOpen, setProdutoPopoverOpen] = useState(false);
  const [produtos, setProdutos] = useState<Produto[]>([]);
  const [selectedProduto, setSelectedProduto] = useState<Produto | null>(null);
  const [form, setForm] = useState({
    imei_serial: "",
    imei2: "",
    serial_number: "",
    nome_dispositivo: "",
    modelo: "",
    memoria: "",
    cliente_id: "",
    subcliente_id: "",
    observacoes: "",
  });

  const mainClientes = clientes.filter((c) => !c.parent_id);
  const subclientes = clientes.filter((c) => c.parent_id === form.cliente_id);
  const selectedCliente = clientes.find((c) => c.id === form.cliente_id);
  const selectedSubcliente = clientes.find((c) => c.id === form.subcliente_id);

  useEffect(() => {
    fetchProdutos();
  }, []);

  useEffect(() => {
    setForm((prev) => ({ ...prev, subcliente_id: "" }));
  }, [form.cliente_id]);

  const fetchProdutos = async () => {
    const { data } = await supabase
      .from("produtos")
      .select("id, nome, categoria, subcategoria")
      .order("nome");
    setProdutos((data as Produto[]) || []);
  };

  const handleProdutoSelect = (produto: Produto) => {
    setSelectedProduto(produto);
    setForm((prev) => ({
      ...prev,
      nome_dispositivo: produto.nome,
      modelo: produto.subcategoria || produto.categoria || "",
    }));
    setProdutoPopoverOpen(false);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!form.imei_serial.trim()) {
      toast.error("IMEI 1 é obrigatório");
      return;
    }
    if (form.imei_serial.length < 15) {
      toast.error("IMEI 1 deve ter 15 dígitos");
      return;
    }
    if (form.imei2 && form.imei2.length < 15) {
      toast.error("IMEI 2 deve ter 15 dígitos");
      return;
    }

    const cliente = clientes.find((c) => c.id === form.cliente_id);
    const subcliente = clientes.find((c) => c.id === form.subcliente_id);

    const { error } = await supabase.from("dispositivos").insert({
      imei_serial: form.imei_serial.trim(),
      imei2: form.imei2.trim() || null,
      serial_number: form.serial_number.trim() || null,
      nome_dispositivo: form.nome_dispositivo.trim() || null,
      modelo: form.modelo.trim() || null,
      memoria: form.memoria || null,
      cliente_id: form.cliente_id || null,
      cliente_nome: cliente?.nome || null,
      subcliente_id: form.subcliente_id || null,
      subcliente_nome: subcliente?.nome || null,
      observacoes: form.observacoes.trim() || null,
    } as any);

    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Dispositivo cadastrado!");
    onClose();
    onSuccess();
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {/* Produto do catálogo */}
      <div className="space-y-1.5">
        <Label className="text-xs font-medium flex items-center gap-1.5">
          <Package className="w-3.5 h-3.5 text-primary" /> Selecionar do Catálogo
        </Label>
        <Popover open={produtoPopoverOpen} onOpenChange={setProdutoPopoverOpen}>
          <PopoverTrigger asChild>
            <Button variant="outline" role="combobox" className="w-full justify-between font-normal h-10">
              {selectedProduto ? selectedProduto.nome : "Buscar produto do catálogo..."}
              <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-full p-0" align="start">
            <Command>
              <CommandInput placeholder="Buscar produto..." />
              <CommandList>
                <CommandEmpty>Nenhum produto encontrado.</CommandEmpty>
                <CommandGroup>
                  {produtos.map((p) => (
                    <CommandItem
                      key={p.id}
                      value={p.nome}
                      onSelect={() => handleProdutoSelect(p)}
                    >
                      <Check className={cn("mr-2 h-4 w-4", selectedProduto?.id === p.id ? "opacity-100" : "opacity-0")} />
                      <div className="flex flex-col">
                        <span>{p.nome}</span>
                        {(p.categoria || p.subcategoria) && (
                          <span className="text-[10px] text-muted-foreground">
                            {[p.categoria, p.subcategoria].filter(Boolean).join(" › ")}
                          </span>
                        )}
                      </div>
                    </CommandItem>
                  ))}
                </CommandGroup>
              </CommandList>
            </Command>
          </PopoverContent>
        </Popover>
        <p className="text-[10px] text-muted-foreground">Selecione um produto para preencher nome e modelo automaticamente</p>
      </div>

      {/* Nome do Dispositivo */}
      <div className="space-y-1.5">
        <Label className="text-xs font-medium flex items-center gap-1.5">
          <Smartphone className="w-3.5 h-3.5 text-primary" /> Nome do Dispositivo
        </Label>
        <Input
          placeholder="Ex: iPhone 15 Pro - Marketing"
          value={form.nome_dispositivo}
          onChange={(e) => setForm({ ...form, nome_dispositivo: e.target.value })}
        />
      </div>

      {/* Grid 2 columns */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {/* IMEI 1 */}
        <div className="space-y-1.5">
          <Label className="text-xs font-medium flex items-center gap-1.5">
            <Hash className="w-3.5 h-3.5 text-primary" /> IMEI 1 *
          </Label>
          <Input
            placeholder="000000000000000"
            value={form.imei_serial}
            onChange={(e) => setForm({ ...form, imei_serial: maskIMEI(e.target.value) })}
            maxLength={15}
            inputMode="numeric"
            required
          />
        </div>

        {/* IMEI 2 */}
        <div className="space-y-1.5">
          <Label className="text-xs font-medium flex items-center gap-1.5">
            <Hash className="w-3.5 h-3.5 text-primary" /> IMEI 2 (Opcional)
          </Label>
          <Input
            placeholder="000000000000000"
            value={form.imei2}
            onChange={(e) => setForm({ ...form, imei2: maskIMEI(e.target.value) })}
            maxLength={15}
            inputMode="numeric"
          />
        </div>

        {/* Serial Number */}
        <div className="space-y-1.5">
          <Label className="text-xs font-medium">Serial Number (SN)</Label>
          <Input
            placeholder="Número de série"
            value={form.serial_number}
            onChange={(e) => setForm({ ...form, serial_number: e.target.value })}
          />
        </div>

        {/* Modelo */}
        <div className="space-y-1.5">
          <Label className="text-xs font-medium">Modelo</Label>
          <Input
            placeholder="Ex: A2849"
            value={form.modelo}
            onChange={(e) => setForm({ ...form, modelo: e.target.value })}
          />
        </div>

        {/* Memória */}
        <div className="space-y-1.5">
          <Label className="text-xs font-medium flex items-center gap-1.5">
            <HardDrive className="w-3.5 h-3.5 text-primary" /> Memória
          </Label>
          <Select value={form.memoria} onValueChange={(val) => setForm({ ...form, memoria: val })}>
            <SelectTrigger>
              <SelectValue placeholder="Selecione a capacidade" />
            </SelectTrigger>
            <SelectContent>
              {MEMORIA_OPTIONS.map((m) => (
                <SelectItem key={m} value={m}>{m}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Placeholder for grid alignment */}
        <div className="hidden sm:block" />

        {/* Cliente */}
        <div className="space-y-1.5">
          <Label className="text-xs font-medium flex items-center gap-1.5">
            <User className="w-3.5 h-3.5 text-primary" /> Cliente
          </Label>
          <Popover open={clientePopoverOpen} onOpenChange={setClientePopoverOpen}>
            <PopoverTrigger asChild>
              <Button variant="outline" role="combobox" className="w-full justify-between font-normal h-10">
                {selectedCliente ? selectedCliente.nome : "Selecione o Cliente"}
                <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-full p-0" align="start">
              <Command>
                <CommandInput placeholder="Buscar cliente..." />
                <CommandList>
                  <CommandEmpty>Nenhum cliente encontrado.</CommandEmpty>
                  <CommandGroup>
                    {mainClientes.map((c) => (
                      <CommandItem
                        key={c.id}
                        value={c.nome}
                        onSelect={() => {
                          setForm({ ...form, cliente_id: c.id });
                          setClientePopoverOpen(false);
                        }}
                      >
                        <Check className={cn("mr-2 h-4 w-4", form.cliente_id === c.id ? "opacity-100" : "opacity-0")} />
                        {c.nome}
                      </CommandItem>
                    ))}
                  </CommandGroup>
                </CommandList>
              </Command>
            </PopoverContent>
          </Popover>
        </div>

        {/* Subcliente */}
        <div className="space-y-1.5">
          <Label className="text-xs font-medium flex items-center gap-1.5">
            <Users className="w-3.5 h-3.5 text-primary" /> Subcliente
          </Label>
          <Popover open={subclientePopoverOpen} onOpenChange={setSubclientePopoverOpen}>
            <PopoverTrigger asChild>
              <Button
                variant="outline"
                role="combobox"
                className="w-full justify-between font-normal h-10"
                disabled={!form.cliente_id || subclientes.length === 0}
              >
                {selectedSubcliente ? selectedSubcliente.nome : (
                  !form.cliente_id ? "Selecione um cliente primeiro" :
                  subclientes.length === 0 ? "Nenhum subcliente" : "Selecione o Subcliente"
                )}
                <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-full p-0" align="start">
              <Command>
                <CommandInput placeholder="Buscar subcliente..." />
                <CommandList>
                  <CommandEmpty>Nenhum subcliente encontrado.</CommandEmpty>
                  <CommandGroup>
                    {subclientes.map((c) => (
                      <CommandItem
                        key={c.id}
                        value={c.nome}
                        onSelect={() => {
                          setForm({ ...form, subcliente_id: c.id });
                          setSubclientePopoverOpen(false);
                        }}
                      >
                        <Check className={cn("mr-2 h-4 w-4", form.subcliente_id === c.id ? "opacity-100" : "opacity-0")} />
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

      {/* Observações */}
      <div className="space-y-1.5">
        <Label className="text-xs font-medium">Observações</Label>
        <Input
          placeholder="Observações adicionais..."
          value={form.observacoes}
          onChange={(e) => setForm({ ...form, observacoes: e.target.value })}
        />
      </div>

      <Button type="submit" className="w-full font-semibold py-3 shadow-md">
        Salvar Dispositivo
      </Button>
    </form>
  );
};

export default DispositivoForm;
