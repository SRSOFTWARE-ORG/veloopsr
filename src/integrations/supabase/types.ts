export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.4"
  }
  public: {
    Tables: {
      assistencias: {
        Row: {
          cliente_id: string | null
          cliente_nome: string
          cliente_telefone: string | null
          created_at: string | null
          defeito: string
          dispositivo_id: string | null
          id: string
          imei_serial: string | null
          modelo: string | null
          observacoes: string | null
          status: string
          updated_at: string | null
          vendedor_id: string
        }
        Insert: {
          cliente_id?: string | null
          cliente_nome: string
          cliente_telefone?: string | null
          created_at?: string | null
          defeito: string
          dispositivo_id?: string | null
          id?: string
          imei_serial?: string | null
          modelo?: string | null
          observacoes?: string | null
          status?: string
          updated_at?: string | null
          vendedor_id: string
        }
        Update: {
          cliente_id?: string | null
          cliente_nome?: string
          cliente_telefone?: string | null
          created_at?: string | null
          defeito?: string
          dispositivo_id?: string | null
          id?: string
          imei_serial?: string | null
          modelo?: string | null
          observacoes?: string | null
          status?: string
          updated_at?: string | null
          vendedor_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "assistencias_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "clientes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "assistencias_dispositivo_id_fkey"
            columns: ["dispositivo_id"]
            isOneToOne: false
            referencedRelation: "dispositivos"
            referencedColumns: ["id"]
          },
        ]
      }
      audit_log: {
        Row: {
          acao: string
          created_at: string | null
          detalhes: Json | null
          id: string
          registro_id: string | null
          tabela: string
          user_id: string | null
        }
        Insert: {
          acao: string
          created_at?: string | null
          detalhes?: Json | null
          id?: string
          registro_id?: string | null
          tabela: string
          user_id?: string | null
        }
        Update: {
          acao?: string
          created_at?: string | null
          detalhes?: Json | null
          id?: string
          registro_id?: string | null
          tabela?: string
          user_id?: string | null
        }
        Relationships: []
      }
      checklist_entrega: {
        Row: {
          acessorios_ok: boolean | null
          assinatura_cliente: string | null
          conectividade_ok: boolean | null
          conta_configurada: boolean | null
          created_at: string | null
          estetica_ok: boolean | null
          id: string
          imei_conferido: boolean | null
          software_seguranca_ok: boolean | null
          venda_id: string
          verificado_por: string | null
        }
        Insert: {
          acessorios_ok?: boolean | null
          assinatura_cliente?: string | null
          conectividade_ok?: boolean | null
          conta_configurada?: boolean | null
          created_at?: string | null
          estetica_ok?: boolean | null
          id?: string
          imei_conferido?: boolean | null
          software_seguranca_ok?: boolean | null
          venda_id: string
          verificado_por?: string | null
        }
        Update: {
          acessorios_ok?: boolean | null
          assinatura_cliente?: string | null
          conectividade_ok?: boolean | null
          conta_configurada?: boolean | null
          created_at?: string | null
          estetica_ok?: boolean | null
          id?: string
          imei_conferido?: boolean | null
          software_seguranca_ok?: boolean | null
          venda_id?: string
          verificado_por?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "checklist_entrega_venda_id_fkey"
            columns: ["venda_id"]
            isOneToOne: false
            referencedRelation: "vendas"
            referencedColumns: ["id"]
          },
        ]
      }
      clientes: {
        Row: {
          bairro: string | null
          cep: string | null
          cidade: string | null
          complemento: string | null
          cpf: string | null
          created_at: string | null
          criado_por: string | null
          data_nascimento: string | null
          email: string | null
          endereco: string | null
          estado_civil: string | null
          id: string
          inscricao_estadual: string | null
          naturalidade: string | null
          nome: string
          nome_mae: string | null
          nome_pai: string | null
          observacoes: string | null
          rg: string | null
          rg_data_emissao: string | null
          rg_emissor: string | null
          telefone: string | null
          tipo: string | null
          uf: string | null
          updated_at: string | null
        }
        Insert: {
          bairro?: string | null
          cep?: string | null
          cidade?: string | null
          complemento?: string | null
          cpf?: string | null
          created_at?: string | null
          criado_por?: string | null
          data_nascimento?: string | null
          email?: string | null
          endereco?: string | null
          estado_civil?: string | null
          id?: string
          inscricao_estadual?: string | null
          naturalidade?: string | null
          nome: string
          nome_mae?: string | null
          nome_pai?: string | null
          observacoes?: string | null
          rg?: string | null
          rg_data_emissao?: string | null
          rg_emissor?: string | null
          telefone?: string | null
          tipo?: string | null
          uf?: string | null
          updated_at?: string | null
        }
        Update: {
          bairro?: string | null
          cep?: string | null
          cidade?: string | null
          complemento?: string | null
          cpf?: string | null
          created_at?: string | null
          criado_por?: string | null
          data_nascimento?: string | null
          email?: string | null
          endereco?: string | null
          estado_civil?: string | null
          id?: string
          inscricao_estadual?: string | null
          naturalidade?: string | null
          nome?: string
          nome_mae?: string | null
          nome_pai?: string | null
          observacoes?: string | null
          rg?: string | null
          rg_data_emissao?: string | null
          rg_emissor?: string | null
          telefone?: string | null
          tipo?: string | null
          uf?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      cobranca_pagamentos: {
        Row: {
          cobranca_id: string
          created_at: string | null
          data_vencimento: string
          id: string
          pago_em: string | null
          pago_por: string | null
          status: string
        }
        Insert: {
          cobranca_id: string
          created_at?: string | null
          data_vencimento: string
          id?: string
          pago_em?: string | null
          pago_por?: string | null
          status?: string
        }
        Update: {
          cobranca_id?: string
          created_at?: string | null
          data_vencimento?: string
          id?: string
          pago_em?: string | null
          pago_por?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "cobranca_pagamentos_cobranca_id_fkey"
            columns: ["cobranca_id"]
            isOneToOne: false
            referencedRelation: "cobrancas"
            referencedColumns: ["id"]
          },
        ]
      }
      cobrancas: {
        Row: {
          cliente_id: string
          cliente_nome: string
          created_at: string | null
          criado_por: string
          data_fim: string
          data_inicio: string
          frequencia: string
          id: string
          observacoes: string | null
          updated_at: string | null
          valor_parcela: number
        }
        Insert: {
          cliente_id: string
          cliente_nome: string
          created_at?: string | null
          criado_por: string
          data_fim: string
          data_inicio: string
          frequencia?: string
          id?: string
          observacoes?: string | null
          updated_at?: string | null
          valor_parcela: number
        }
        Update: {
          cliente_id?: string
          cliente_nome?: string
          created_at?: string | null
          criado_por?: string
          data_fim?: string
          data_inicio?: string
          frequencia?: string
          id?: string
          observacoes?: string | null
          updated_at?: string | null
          valor_parcela?: number
        }
        Relationships: [
          {
            foreignKeyName: "cobrancas_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "clientes"
            referencedColumns: ["id"]
          },
        ]
      }
      dispositivos: {
        Row: {
          cliente_id: string | null
          cliente_nome: string | null
          created_at: string | null
          data_ativacao: string | null
          id: string
          imei_serial: string
          modelo: string | null
          observacoes: string | null
          status_seguranca: string | null
          updated_at: string | null
          venda_id: string | null
        }
        Insert: {
          cliente_id?: string | null
          cliente_nome?: string | null
          created_at?: string | null
          data_ativacao?: string | null
          id?: string
          imei_serial: string
          modelo?: string | null
          observacoes?: string | null
          status_seguranca?: string | null
          updated_at?: string | null
          venda_id?: string | null
        }
        Update: {
          cliente_id?: string | null
          cliente_nome?: string | null
          created_at?: string | null
          data_ativacao?: string | null
          id?: string
          imei_serial?: string
          modelo?: string | null
          observacoes?: string | null
          status_seguranca?: string | null
          updated_at?: string | null
          venda_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "dispositivos_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "clientes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dispositivos_venda_id_fkey"
            columns: ["venda_id"]
            isOneToOne: false
            referencedRelation: "vendas"
            referencedColumns: ["id"]
          },
        ]
      }
      documentos: {
        Row: {
          cliente_nome: string | null
          created_at: string | null
          id: string
          nome_arquivo: string
          processado: boolean | null
          tipo: string
          uploaded_by: string | null
          url_arquivo: string
          venda_id: string | null
        }
        Insert: {
          cliente_nome?: string | null
          created_at?: string | null
          id?: string
          nome_arquivo: string
          processado?: boolean | null
          tipo: string
          uploaded_by?: string | null
          url_arquivo: string
          venda_id?: string | null
        }
        Update: {
          cliente_nome?: string | null
          created_at?: string | null
          id?: string
          nome_arquivo?: string
          processado?: boolean | null
          tipo?: string
          uploaded_by?: string | null
          url_arquivo?: string
          venda_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "documentos_venda_id_fkey"
            columns: ["venda_id"]
            isOneToOne: false
            referencedRelation: "vendas"
            referencedColumns: ["id"]
          },
        ]
      }
      estoque_movimentacao: {
        Row: {
          created_at: string | null
          id: string
          motivo: string | null
          produto_id: string
          quantidade: number
          tipo: string
          usuario_id: string | null
        }
        Insert: {
          created_at?: string | null
          id?: string
          motivo?: string | null
          produto_id: string
          quantidade: number
          tipo: string
          usuario_id?: string | null
        }
        Update: {
          created_at?: string | null
          id?: string
          motivo?: string | null
          produto_id?: string
          quantidade?: number
          tipo?: string
          usuario_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "estoque_movimentacao_produto_id_fkey"
            columns: ["produto_id"]
            isOneToOne: false
            referencedRelation: "produtos"
            referencedColumns: ["id"]
          },
        ]
      }
      permissions: {
        Row: {
          created_at: string | null
          id: string
          limite_desconto: number | null
          pode_dar_desconto: boolean | null
          pode_editar_preco: boolean | null
          pode_excluir_venda: boolean | null
          pode_ver_faturamento: boolean | null
          tipo_comissao: string | null
          updated_at: string | null
          user_id: string
          valor_comissao: number | null
        }
        Insert: {
          created_at?: string | null
          id?: string
          limite_desconto?: number | null
          pode_dar_desconto?: boolean | null
          pode_editar_preco?: boolean | null
          pode_excluir_venda?: boolean | null
          pode_ver_faturamento?: boolean | null
          tipo_comissao?: string | null
          updated_at?: string | null
          user_id: string
          valor_comissao?: number | null
        }
        Update: {
          created_at?: string | null
          id?: string
          limite_desconto?: number | null
          pode_dar_desconto?: boolean | null
          pode_editar_preco?: boolean | null
          pode_excluir_venda?: boolean | null
          pode_ver_faturamento?: boolean | null
          tipo_comissao?: string | null
          updated_at?: string | null
          user_id?: string
          valor_comissao?: number | null
        }
        Relationships: []
      }
      produtos: {
        Row: {
          atualizado_por: string | null
          categoria: string | null
          codigo_barras: string | null
          created_at: string | null
          estoque_atual: number | null
          estoque_minimo: number | null
          id: string
          imagem_url: string | null
          nome: string
          preco_boleto: number | null
          preco_carne: number | null
          preco_credito: number | null
          preco_custo: number | null
          preco_pix: number | null
          preco_venda: number
          subcategoria: string | null
          updated_at: string | null
        }
        Insert: {
          atualizado_por?: string | null
          categoria?: string | null
          codigo_barras?: string | null
          created_at?: string | null
          estoque_atual?: number | null
          estoque_minimo?: number | null
          id?: string
          imagem_url?: string | null
          nome: string
          preco_boleto?: number | null
          preco_carne?: number | null
          preco_credito?: number | null
          preco_custo?: number | null
          preco_pix?: number | null
          preco_venda: number
          subcategoria?: string | null
          updated_at?: string | null
        }
        Update: {
          atualizado_por?: string | null
          categoria?: string | null
          codigo_barras?: string | null
          created_at?: string | null
          estoque_atual?: number | null
          estoque_minimo?: number | null
          id?: string
          imagem_url?: string | null
          nome?: string
          preco_boleto?: number | null
          preco_carne?: number | null
          preco_credito?: number | null
          preco_custo?: number | null
          preco_pix?: number | null
          preco_venda?: number
          subcategoria?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      profiles: {
        Row: {
          created_at: string | null
          id: string
          nome: string
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          id: string
          nome: string
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          id?: string
          nome?: string
          updated_at?: string | null
        }
        Relationships: []
      }
      saidas_caixa: {
        Row: {
          created_at: string | null
          id: string
          motivo: string
          registrado_por: string
          responsavel_id: string
          valor: number
        }
        Insert: {
          created_at?: string | null
          id?: string
          motivo: string
          registrado_por: string
          responsavel_id: string
          valor: number
        }
        Update: {
          created_at?: string | null
          id?: string
          motivo?: string
          registrado_por?: string
          responsavel_id?: string
          valor?: number
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
      venda_itens: {
        Row: {
          id: string
          preco_unitario: number
          produto_id: string
          quantidade: number
          subtotal: number
          venda_id: string
        }
        Insert: {
          id?: string
          preco_unitario: number
          produto_id: string
          quantidade?: number
          subtotal: number
          venda_id: string
        }
        Update: {
          id?: string
          preco_unitario?: number
          produto_id?: string
          quantidade?: number
          subtotal?: number
          venda_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "venda_itens_produto_id_fkey"
            columns: ["produto_id"]
            isOneToOne: false
            referencedRelation: "produtos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "venda_itens_venda_id_fkey"
            columns: ["venda_id"]
            isOneToOne: false
            referencedRelation: "vendas"
            referencedColumns: ["id"]
          },
        ]
      }
      vendas: {
        Row: {
          cliente_cpf: string | null
          cliente_nome: string
          cliente_telefone: string | null
          created_at: string | null
          data_inicio_pagamento: string | null
          desconto_percentual: number | null
          forma_pagamento: string | null
          frequencia_parcela: string | null
          id: string
          num_parcelas: number | null
          observacoes: string | null
          status: string | null
          updated_at: string | null
          valor_entrada: number | null
          valor_parcela: number | null
          valor_total: number
          vendedor_id: string
        }
        Insert: {
          cliente_cpf?: string | null
          cliente_nome: string
          cliente_telefone?: string | null
          created_at?: string | null
          data_inicio_pagamento?: string | null
          desconto_percentual?: number | null
          forma_pagamento?: string | null
          frequencia_parcela?: string | null
          id?: string
          num_parcelas?: number | null
          observacoes?: string | null
          status?: string | null
          updated_at?: string | null
          valor_entrada?: number | null
          valor_parcela?: number | null
          valor_total?: number
          vendedor_id: string
        }
        Update: {
          cliente_cpf?: string | null
          cliente_nome?: string
          cliente_telefone?: string | null
          created_at?: string | null
          data_inicio_pagamento?: string | null
          desconto_percentual?: number | null
          forma_pagamento?: string | null
          frequencia_parcela?: string | null
          id?: string
          num_parcelas?: number | null
          observacoes?: string | null
          status?: string | null
          updated_at?: string | null
          valor_entrada?: number | null
          valor_parcela?: number | null
          valor_total?: number
          vendedor_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
    }
    Enums: {
      app_role: "admin" | "vendedor"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      app_role: ["admin", "vendedor"],
    },
  },
} as const
