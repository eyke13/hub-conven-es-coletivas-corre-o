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
    PostgrestVersion: "14.15"
  }
  public: {
    Tables: {
      convencoes: {
        Row: {
          abrangencia: string
          ano: number | null
          cidade: string | null
          colaboradores: number | null
          created_at: string
          data_base: string
          data_contato: string
          empresa_cnpj: string
          empresa_codigo: string
          empresa_nome: string
          funcionarios_contemplados: number
          historico_documentos: Json
          id: string
          mes: string | null
          observacoes: string
          pessoa_contato: string
          prazo_oposicao: string
          responsavel: string | null
          segmento: string | null
          sindicato_cnpj: string
          sindicato_codigo: string
          sindicato_nome: string
          status: string
          uf: string | null
          ultimo_contacto: string
          updated_at: string
          vigencia_fim: string
          vigencia_inicio: string
        }
        Insert: {
          abrangencia?: string
          ano?: number | null
          cidade?: string | null
          colaboradores?: number | null
          created_at?: string
          data_base?: string
          data_contato?: string
          empresa_cnpj?: string
          empresa_codigo?: string
          empresa_nome?: string
          funcionarios_contemplados?: number
          historico_documentos?: Json
          id?: string
          mes?: string | null
          observacoes?: string
          pessoa_contato?: string
          prazo_oposicao?: string
          responsavel?: string | null
          segmento?: string | null
          sindicato_cnpj?: string
          sindicato_codigo?: string
          sindicato_nome?: string
          status?: string
          uf?: string | null
          ultimo_contacto?: string
          updated_at?: string
          vigencia_fim?: string
          vigencia_inicio?: string
        }
        Update: {
          abrangencia?: string
          ano?: number | null
          cidade?: string | null
          colaboradores?: number | null
          created_at?: string
          data_base?: string
          data_contato?: string
          empresa_cnpj?: string
          empresa_codigo?: string
          empresa_nome?: string
          funcionarios_contemplados?: number
          historico_documentos?: Json
          id?: string
          mes?: string | null
          observacoes?: string
          pessoa_contato?: string
          prazo_oposicao?: string
          responsavel?: string | null
          segmento?: string | null
          sindicato_cnpj?: string
          sindicato_codigo?: string
          sindicato_nome?: string
          status?: string
          uf?: string | null
          ultimo_contacto?: string
          updated_at?: string
          vigencia_fim?: string
          vigencia_inicio?: string
        }
        Relationships: []
      }
      empresa_sindicatos: {
        Row: {
          categoria: string | null
          created_at: string
          empresa_id: string
          funcionarios_contemplados: number
          id: string
          observacoes: string
          principal: boolean
          sindicato_id: string
          updated_at: string
        }
        Insert: {
          categoria?: string | null
          created_at?: string
          empresa_id: string
          funcionarios_contemplados?: number
          id?: string
          observacoes?: string
          principal?: boolean
          sindicato_id: string
          updated_at?: string
        }
        Update: {
          categoria?: string | null
          created_at?: string
          empresa_id?: string
          funcionarios_contemplados?: number
          id?: string
          observacoes?: string
          principal?: boolean
          sindicato_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "empresa_sindicatos_empresa_id_fkey"
            columns: ["empresa_id"]
            isOneToOne: false
            referencedRelation: "empresas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "empresa_sindicatos_sindicato_id_fkey"
            columns: ["sindicato_id"]
            isOneToOne: false
            referencedRelation: "sindicatos"
            referencedColumns: ["id"]
          },
        ]
      }
      empresas: {
        Row: {
          cidade: string | null
          cnpj: string
          codigo: string
          colaboradores: number | null
          created_at: string
          data_contato: string
          funcionarios_contemplados: number
          id: string
          integra_publicada: boolean
          nome: string
          observacoes: string
          pessoa_contato: string
          publicado_em: string | null
          responsavel: string | null
          resumo_publicado: boolean
          sindicato_id: string | null
          uf: string | null
          updated_at: string
        }
        Insert: {
          cidade?: string | null
          cnpj?: string
          codigo?: string
          colaboradores?: number | null
          created_at?: string
          data_contato?: string
          funcionarios_contemplados?: number
          id?: string
          integra_publicada?: boolean
          nome?: string
          observacoes?: string
          pessoa_contato?: string
          publicado_em?: string | null
          responsavel?: string | null
          resumo_publicado?: boolean
          sindicato_id?: string | null
          uf?: string | null
          updated_at?: string
        }
        Update: {
          cidade?: string | null
          cnpj?: string
          codigo?: string
          colaboradores?: number | null
          created_at?: string
          data_contato?: string
          funcionarios_contemplados?: number
          id?: string
          integra_publicada?: boolean
          nome?: string
          observacoes?: string
          pessoa_contato?: string
          publicado_em?: string | null
          responsavel?: string | null
          resumo_publicado?: boolean
          sindicato_id?: string | null
          uf?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "empresas_sindicato_id_fkey"
            columns: ["sindicato_id"]
            isOneToOne: false
            referencedRelation: "sindicatos"
            referencedColumns: ["id"]
          },
        ]
      }
      resumos_cct: {
        Row: {
          ano: number
          created_at: string
          erro_msg: string | null
          ia_json: Json | null
          id: string
          iniciado_em: string | null
          integra_path: string | null
          oficial_em: string | null
          oficial_nome: string | null
          oficial_path: string | null
          processando: boolean
          publicado_em: string | null
          publicado_por: string | null
          responsavel: string | null
          resumo_docx_path: string | null
          resumo_pdf_path: string | null
          sindicato_id: string
          status: Database["public"]["Enums"]["resumo_status"]
          updated_at: string
          versao: number
        }
        Insert: {
          ano: number
          created_at?: string
          erro_msg?: string | null
          ia_json?: Json | null
          id?: string
          iniciado_em?: string | null
          integra_path?: string | null
          oficial_em?: string | null
          oficial_nome?: string | null
          oficial_path?: string | null
          processando?: boolean
          publicado_em?: string | null
          publicado_por?: string | null
          responsavel?: string | null
          resumo_docx_path?: string | null
          resumo_pdf_path?: string | null
          sindicato_id: string
          status?: Database["public"]["Enums"]["resumo_status"]
          updated_at?: string
          versao?: number
        }
        Update: {
          ano?: number
          created_at?: string
          erro_msg?: string | null
          ia_json?: Json | null
          id?: string
          iniciado_em?: string | null
          integra_path?: string | null
          oficial_em?: string | null
          oficial_nome?: string | null
          oficial_path?: string | null
          processando?: boolean
          publicado_em?: string | null
          publicado_por?: string | null
          responsavel?: string | null
          resumo_docx_path?: string | null
          resumo_pdf_path?: string | null
          sindicato_id?: string
          status?: Database["public"]["Enums"]["resumo_status"]
          updated_at?: string
          versao?: number
        }
        Relationships: [
          {
            foreignKeyName: "resumos_cct_sindicato_id_fkey"
            columns: ["sindicato_id"]
            isOneToOne: false
            referencedRelation: "sindicatos"
            referencedColumns: ["id"]
          },
        ]
      }
      resumos_cct_historico: {
        Row: {
          created_at: string
          id: string
          observacao: string | null
          resumo_id: string
          status_de: Database["public"]["Enums"]["resumo_status"] | null
          status_para: Database["public"]["Enums"]["resumo_status"]
          usuario_email: string | null
          usuario_id: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          observacao?: string | null
          resumo_id: string
          status_de?: Database["public"]["Enums"]["resumo_status"] | null
          status_para: Database["public"]["Enums"]["resumo_status"]
          usuario_email?: string | null
          usuario_id?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          observacao?: string | null
          resumo_id?: string
          status_de?: Database["public"]["Enums"]["resumo_status"] | null
          status_para?: Database["public"]["Enums"]["resumo_status"]
          usuario_email?: string | null
          usuario_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "resumos_cct_historico_resumo_id_fkey"
            columns: ["resumo_id"]
            isOneToOne: false
            referencedRelation: "resumos_cct"
            referencedColumns: ["id"]
          },
        ]
      }
      resumos_cct_versoes: {
        Row: {
          created_at: string
          criado_por: string | null
          id: string
          nome: string
          origem: string
          path: string
          resumo_id: string
          versao: number
        }
        Insert: {
          created_at?: string
          criado_por?: string | null
          id?: string
          nome?: string
          origem?: string
          path: string
          resumo_id: string
          versao?: number
        }
        Update: {
          created_at?: string
          criado_por?: string | null
          id?: string
          nome?: string
          origem?: string
          path?: string
          resumo_id?: string
          versao?: number
        }
        Relationships: [
          {
            foreignKeyName: "resumos_cct_versoes_resumo_id_fkey"
            columns: ["resumo_id"]
            isOneToOne: false
            referencedRelation: "resumos_cct"
            referencedColumns: ["id"]
          },
        ]
      }
      sindicatos: {
        Row: {
          abrangencia: string
          cnpj: string
          codigo: string
          created_at: string
          data_base: string
          data_contato: string
          historico_documentos: Json
          id: string
          integra_publicada: boolean
          nome: string
          observacoes: string
          pessoa_contato: string
          prazo_oposicao: string
          publicado_em: string | null
          resumo_publicado: boolean
          segmento: string | null
          status: string
          ultimo_contacto: string
          updated_at: string
          vigencia_fim: string
          vigencia_inicio: string
        }
        Insert: {
          abrangencia?: string
          cnpj?: string
          codigo?: string
          created_at?: string
          data_base?: string
          data_contato?: string
          historico_documentos?: Json
          id?: string
          integra_publicada?: boolean
          nome?: string
          observacoes?: string
          pessoa_contato?: string
          prazo_oposicao?: string
          publicado_em?: string | null
          resumo_publicado?: boolean
          segmento?: string | null
          status?: string
          ultimo_contacto?: string
          updated_at?: string
          vigencia_fim?: string
          vigencia_inicio?: string
        }
        Update: {
          abrangencia?: string
          cnpj?: string
          codigo?: string
          created_at?: string
          data_base?: string
          data_contato?: string
          historico_documentos?: Json
          id?: string
          integra_publicada?: boolean
          nome?: string
          observacoes?: string
          pessoa_contato?: string
          prazo_oposicao?: string
          publicado_em?: string | null
          resumo_publicado?: boolean
          segmento?: string | null
          status?: string
          ultimo_contacto?: string
          updated_at?: string
          vigencia_fim?: string
          vigencia_inicio?: string
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
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
      show_limit: { Args: never; Returns: number }
      show_trgm: { Args: { "": string }; Returns: string[] }
    }
    Enums: {
      app_role: "admin" | "user"
      resumo_status:
        | "nao_iniciado"
        | "em_andamento"
        | "em_conferencia"
        | "publicado"
        | "erro"
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
      app_role: ["admin", "user"],
      resumo_status: [
        "nao_iniciado",
        "em_andamento",
        "em_conferencia",
        "publicado",
        "erro",
      ],
    },
  },
} as const
