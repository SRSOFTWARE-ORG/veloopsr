
-- Create role enum
CREATE TYPE public.app_role AS ENUM ('admin', 'vendedor');

-- Create profiles table
CREATE TABLE public.profiles (
  id UUID REFERENCES auth.users(id) ON DELETE CASCADE PRIMARY KEY,
  nome TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create user_roles table
CREATE TABLE public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  role app_role NOT NULL DEFAULT 'vendedor',
  UNIQUE (user_id, role)
);

-- Create permissions table
CREATE TABLE public.permissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL UNIQUE,
  pode_editar_preco BOOLEAN DEFAULT FALSE,
  pode_excluir_venda BOOLEAN DEFAULT FALSE,
  pode_dar_desconto BOOLEAN DEFAULT FALSE,
  limite_desconto NUMERIC(5,2) DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create produtos table
CREATE TABLE public.produtos (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  nome TEXT NOT NULL,
  preco_custo NUMERIC(10,2) DEFAULT 0,
  preco_venda NUMERIC(10,2) NOT NULL,
  estoque_atual INT DEFAULT 0,
  estoque_minimo INT DEFAULT 5,
  codigo_barras TEXT UNIQUE,
  categoria TEXT,
  atualizado_por UUID REFERENCES auth.users(id),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create vendas table
CREATE TABLE public.vendas (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  cliente_nome TEXT NOT NULL,
  cliente_telefone TEXT,
  cliente_cpf TEXT,
  valor_total NUMERIC(10,2) NOT NULL DEFAULT 0,
  valor_entrada NUMERIC(10,2) DEFAULT 0,
  num_parcelas INT DEFAULT 1,
  valor_parcela NUMERIC(10,2) DEFAULT 0,
  desconto_percentual NUMERIC(5,2) DEFAULT 0,
  status TEXT DEFAULT 'simulacao' CHECK (status IN ('simulacao', 'pendente', 'concluida', 'cancelada')),
  vendedor_id UUID REFERENCES auth.users(id) NOT NULL,
  observacoes TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create venda_itens table
CREATE TABLE public.venda_itens (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  venda_id UUID REFERENCES public.vendas(id) ON DELETE CASCADE NOT NULL,
  produto_id UUID REFERENCES public.produtos(id) NOT NULL,
  quantidade INT NOT NULL DEFAULT 1,
  preco_unitario NUMERIC(10,2) NOT NULL,
  subtotal NUMERIC(10,2) NOT NULL
);

-- Create dispositivos table
CREATE TABLE public.dispositivos (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  imei_serial TEXT UNIQUE NOT NULL,
  modelo TEXT,
  status_seguranca TEXT DEFAULT 'protegido' CHECK (status_seguranca IN ('protegido', 'bloqueado', 'liberado')),
  venda_id UUID REFERENCES public.vendas(id),
  cliente_nome TEXT,
  data_ativacao TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  observacoes TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create documentos table
CREATE TABLE public.documentos (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  tipo TEXT NOT NULL CHECK (tipo IN ('nota_fiscal', 'carne', 'contrato', 'recibo_garantia', 'outro')),
  nome_arquivo TEXT NOT NULL,
  url_arquivo TEXT NOT NULL,
  venda_id UUID REFERENCES public.vendas(id),
  cliente_nome TEXT,
  uploaded_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create checklist_entrega table
CREATE TABLE public.checklist_entrega (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  venda_id UUID REFERENCES public.vendas(id) ON DELETE CASCADE NOT NULL,
  estetica_ok BOOLEAN DEFAULT FALSE,
  software_seguranca_ok BOOLEAN DEFAULT FALSE,
  imei_conferido BOOLEAN DEFAULT FALSE,
  acessorios_ok BOOLEAN DEFAULT FALSE,
  conta_configurada BOOLEAN DEFAULT FALSE,
  conectividade_ok BOOLEAN DEFAULT FALSE,
  assinatura_cliente TEXT,
  verificado_por UUID REFERENCES auth.users(id),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create audit_log table
CREATE TABLE public.audit_log (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id),
  acao TEXT NOT NULL,
  tabela TEXT NOT NULL,
  registro_id UUID,
  detalhes JSONB,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create estoque_movimentacao table
CREATE TABLE public.estoque_movimentacao (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  produto_id UUID REFERENCES public.produtos(id) ON DELETE CASCADE NOT NULL,
  tipo TEXT NOT NULL CHECK (tipo IN ('entrada', 'saida', 'ajuste')),
  quantidade INT NOT NULL,
  motivo TEXT,
  usuario_id UUID REFERENCES auth.users(id),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Enable RLS on all tables
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.permissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.produtos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vendas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.venda_itens ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.dispositivos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.documentos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.checklist_entrega ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.estoque_movimentacao ENABLE ROW LEVEL SECURITY;

-- Security definer function to check roles
CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role app_role)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles
    WHERE user_id = _user_id
      AND role = _role
  )
$$;

-- Function to update timestamps
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

-- Triggers for updated_at
CREATE TRIGGER update_profiles_updated_at BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_permissions_updated_at BEFORE UPDATE ON public.permissions FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_produtos_updated_at BEFORE UPDATE ON public.produtos FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_vendas_updated_at BEFORE UPDATE ON public.vendas FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_dispositivos_updated_at BEFORE UPDATE ON public.dispositivos FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Auto-create profile on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, nome)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'nome', NEW.email));
  INSERT INTO public.user_roles (user_id, role)
  VALUES (NEW.id, 'vendedor');
  INSERT INTO public.permissions (user_id)
  VALUES (NEW.id);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- RLS Policies
CREATE POLICY "Profiles viewable by authenticated" ON public.profiles FOR SELECT TO authenticated USING (true);
CREATE POLICY "Users can update own profile" ON public.profiles FOR UPDATE TO authenticated USING (auth.uid() = id);
CREATE POLICY "Users can insert own profile" ON public.profiles FOR INSERT TO authenticated WITH CHECK (auth.uid() = id);

CREATE POLICY "Roles viewable by authenticated" ON public.user_roles FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admins can insert roles" ON public.user_roles FOR INSERT TO authenticated WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins can update roles" ON public.user_roles FOR UPDATE TO authenticated USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins can delete roles" ON public.user_roles FOR DELETE TO authenticated USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Permissions viewable by authenticated" ON public.permissions FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admins can insert permissions" ON public.permissions FOR INSERT TO authenticated WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins can update permissions" ON public.permissions FOR UPDATE TO authenticated USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins can delete permissions" ON public.permissions FOR DELETE TO authenticated USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Produtos viewable by authenticated" ON public.produtos FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated can insert produtos" ON public.produtos FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated can update produtos" ON public.produtos FOR UPDATE TO authenticated USING (true);
CREATE POLICY "Only admins can delete produtos" ON public.produtos FOR DELETE TO authenticated USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins see all vendas" ON public.vendas FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Vendedores see own vendas" ON public.vendas FOR SELECT TO authenticated USING (vendedor_id = auth.uid());
CREATE POLICY "Authenticated can insert vendas" ON public.vendas FOR INSERT TO authenticated WITH CHECK (vendedor_id = auth.uid());
CREATE POLICY "Vendedores can update own vendas" ON public.vendas FOR UPDATE TO authenticated USING (vendedor_id = auth.uid() OR public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Only admins can delete vendas" ON public.vendas FOR DELETE TO authenticated USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Venda itens viewable" ON public.venda_itens FOR SELECT TO authenticated USING (true);
CREATE POLICY "Can insert venda_itens" ON public.venda_itens FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Can update venda_itens" ON public.venda_itens FOR UPDATE TO authenticated USING (true);
CREATE POLICY "Only admins delete venda_itens" ON public.venda_itens FOR DELETE TO authenticated USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Dispositivos viewable" ON public.dispositivos FOR SELECT TO authenticated USING (true);
CREATE POLICY "Can insert dispositivos" ON public.dispositivos FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Only admins update dispositivos" ON public.dispositivos FOR UPDATE TO authenticated USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Only admins delete dispositivos" ON public.dispositivos FOR DELETE TO authenticated USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Documentos viewable" ON public.documentos FOR SELECT TO authenticated USING (true);
CREATE POLICY "Can insert documentos" ON public.documentos FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Only admins delete documentos" ON public.documentos FOR DELETE TO authenticated USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Checklist viewable" ON public.checklist_entrega FOR SELECT TO authenticated USING (true);
CREATE POLICY "Can insert checklist" ON public.checklist_entrega FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Can update checklist" ON public.checklist_entrega FOR UPDATE TO authenticated USING (true);

CREATE POLICY "Only admins view audit" ON public.audit_log FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Can insert audit" ON public.audit_log FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "Movimentacao viewable" ON public.estoque_movimentacao FOR SELECT TO authenticated USING (true);
CREATE POLICY "Can insert movimentacao" ON public.estoque_movimentacao FOR INSERT TO authenticated WITH CHECK (true);

-- Storage bucket
INSERT INTO storage.buckets (id, name, public) VALUES ('documentos_vendas', 'documentos_vendas', true);
CREATE POLICY "Can upload documents" ON storage.objects FOR INSERT TO authenticated WITH CHECK (bucket_id = 'documentos_vendas');
CREATE POLICY "Documents publicly accessible" ON storage.objects FOR SELECT USING (bucket_id = 'documentos_vendas');
CREATE POLICY "Only admins delete docs" ON storage.objects FOR DELETE TO authenticated USING (bucket_id = 'documentos_vendas' AND public.has_role(auth.uid(), 'admin'));
