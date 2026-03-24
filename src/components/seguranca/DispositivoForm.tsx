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
import { ChevronsUpDown, Check } from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

interface Cliente {
  id: string;
  nome: string;
  parent_id: string | null;
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

  // Main clients = those without parent_id
  const mainClientes = clientes.filter((c) => !c.parent_id);

  // Subclientes filtered by selected cliente
  const subclientes = clientes.filter((c) => c.parent_id === form.cliente_id);

  const selectedCliente = clientes.find((c) => c.id === form.cliente_id);
  const selectedSubcliente = clientes.find((c) => c.id === form.subcliente_id);

  // Reset subcliente when cliente changes
  useEffect(() => {
    setForm((prev) => ({ ...prev, subcliente_id: "" }));
  }, [form.cliente_id]);

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
      {/* Grid 2 columns */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {/* IMEI 1 */}
        <div className="space-y-1.5">
          <Label className="text-xs font-medium">IMEI 1 *</Label>
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
          <Label className="text-xs font-medium">IMEI 2</Label>
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

        {/* Nome do Dispositivo */}
        <div className="space-y-1.5">
          <Label className="text-xs font-medium">Nome do Dispositivo</Label>
          <Input
            placeholder="Ex: iPhone 15 Pro Max"
            value={form.nome_dispositivo}
            onChange={(e) => setForm({ ...form, nome_dispositivo: e.target.value })}
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
          <Label className="text-xs font-medium">Memória</Label>
          <Select value={form.memoria} onValueChange={(val) => setForm({ ...form, memoria: val })}>
            <SelectTrigger>
              <SelectValue placeholder="Selecionar..." />
            </SelectTrigger>
            <SelectContent>
              {MEMORIA_OPTIONS.map((m) => (
                <SelectItem key={m} value={m}>{m}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Cliente */}
        <div className="space-y-1.5">
          <Label className="text-xs font-medium">Cliente</Label>
          <Popover open={clientePopoverOpen} onOpenChange={setClientePopoverOpen}>
            <PopoverTrigger asChild>
              <Button variant="outline" role="combobox" className="w-full justify-between font-normal h-10">
                {selectedCliente ? selectedCliente.nome : "Selecionar cliente..."}
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
          <Label className="text-xs font-medium">Subcliente</Label>
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
                  subclientes.length === 0 ? "Nenhum subcliente" : "Selecionar subcliente..."
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

      {/* Observações full width */}
      <div className="space-y-1.5">
        <Label className="text-xs font-medium">Observações</Label>
        <Input
          placeholder="Observações adicionais..."
          value={form.observacoes}
          onChange={(e) => setForm({ ...form, observacoes: e.target.value })}
        />
      </div>

      <Button type="submit" className="w-full">Cadastrar</Button>
    </form>
  );
};

export default DispositivoForm;
