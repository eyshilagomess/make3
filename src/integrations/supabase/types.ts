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
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      allocation_config: {
        Row: {
          created_at: string
          expenses_pct: number
          id: string
          investment_pct: number
          prolabore_pct: number
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          created_at?: string
          expenses_pct?: number
          id?: string
          investment_pct?: number
          prolabore_pct?: number
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          created_at?: string
          expenses_pct?: number
          id?: string
          investment_pct?: number
          prolabore_pct?: number
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: []
      }
      customers: {
        Row: {
          address: string | null
          birthdate: string | null
          created_at: string
          created_by: string | null
          email: string | null
          id: string
          instagram: string | null
          name: string
          notes: string | null
          origin_channel: Database["public"]["Enums"]["sales_channel"] | null
          phone: string | null
          updated_at: string
        }
        Insert: {
          address?: string | null
          birthdate?: string | null
          created_at?: string
          created_by?: string | null
          email?: string | null
          id?: string
          instagram?: string | null
          name: string
          notes?: string | null
          origin_channel?: Database["public"]["Enums"]["sales_channel"] | null
          phone?: string | null
          updated_at?: string
        }
        Update: {
          address?: string | null
          birthdate?: string | null
          created_at?: string
          created_by?: string | null
          email?: string | null
          id?: string
          instagram?: string | null
          name?: string
          notes?: string | null
          origin_channel?: Database["public"]["Enums"]["sales_channel"] | null
          phone?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      daily_closings: {
        Row: {
          channel_fees: number
          closed_at: string
          closed_by: string | null
          closing_date: string
          cogs: number
          created_at: string
          discounts: number
          expenses: number
          gross_profit: number
          gross_revenue: number
          id: string
          machine_fees: number
          net_profit: number
          net_revenue: number
          notes: string | null
          orders_count: number
          shipping: number
          updated_at: string
          wallet_calculated: Json
          wallet_counted: Json
          wallet_diff: Json
        }
        Insert: {
          channel_fees?: number
          closed_at?: string
          closed_by?: string | null
          closing_date: string
          cogs?: number
          created_at?: string
          discounts?: number
          expenses?: number
          gross_profit?: number
          gross_revenue?: number
          id?: string
          machine_fees?: number
          net_profit?: number
          net_revenue?: number
          notes?: string | null
          orders_count?: number
          shipping?: number
          updated_at?: string
          wallet_calculated?: Json
          wallet_counted?: Json
          wallet_diff?: Json
        }
        Update: {
          channel_fees?: number
          closed_at?: string
          closed_by?: string | null
          closing_date?: string
          cogs?: number
          created_at?: string
          discounts?: number
          expenses?: number
          gross_profit?: number
          gross_revenue?: number
          id?: string
          machine_fees?: number
          net_profit?: number
          net_revenue?: number
          notes?: string | null
          orders_count?: number
          shipping?: number
          updated_at?: string
          wallet_calculated?: Json
          wallet_counted?: Json
          wallet_diff?: Json
        }
        Relationships: []
      }
      expenses: {
        Row: {
          amount: number
          category: string
          created_at: string
          created_by: string | null
          expense_date: string
          id: string
          kind: string
          notes: string | null
          photo_url: string | null
          status: string
          updated_at: string
        }
        Insert: {
          amount?: number
          category: string
          created_at?: string
          created_by?: string | null
          expense_date?: string
          id?: string
          kind?: string
          notes?: string | null
          photo_url?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          amount?: number
          category?: string
          created_at?: string
          created_by?: string | null
          expense_date?: string
          id?: string
          kind?: string
          notes?: string | null
          photo_url?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: []
      }
      order_items: {
        Row: {
          created_at: string
          id: string
          order_id: string
          product_id: string | null
          product_name: string
          quantity: number
          subtotal: number
          unit_cost: number
          unit_price: number
          variant_id: string | null
          variant_name: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          order_id: string
          product_id?: string | null
          product_name: string
          quantity: number
          subtotal?: number
          unit_cost?: number
          unit_price?: number
          variant_id?: string | null
          variant_name?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          order_id?: string
          product_id?: string | null
          product_name?: string
          quantity?: number
          subtotal?: number
          unit_cost?: number
          unit_price?: number
          variant_id?: string | null
          variant_name?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "order_items_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_items_variant_id_fkey"
            columns: ["variant_id"]
            isOneToOne: false
            referencedRelation: "product_variants"
            referencedColumns: ["id"]
          },
        ]
      }
      orders: {
        Row: {
          channel: Database["public"]["Enums"]["sales_channel"]
          closed_at: string | null
          created_at: string
          created_by: string | null
          customer_id: string | null
          customer_name_freeform: string | null
          discount: number
          external_reference: string | null
          guest_email: string | null
          guest_name: string | null
          guest_phone: string | null
          id: string
          notes: string | null
          order_code: string
          payment_amount_1: number | null
          payment_amount_2: number | null
          payment_link: string | null
          payment_method: Database["public"]["Enums"]["payment_method"] | null
          payment_method_2: Database["public"]["Enums"]["payment_method"] | null
          payment_proof_url: string | null
          payment_status: Database["public"]["Enums"]["payment_status"]
          seller_id: string | null
          shipping: number
          shipping_address: Json | null
          shipping_carrier: string | null
          shipping_cep: string | null
          shipping_deadline_days: number | null
          shipping_service: string | null
          source: string
          status: Database["public"]["Enums"]["order_status"]
          subtotal: number
          total: number
          updated_at: string
        }
        Insert: {
          channel?: Database["public"]["Enums"]["sales_channel"]
          closed_at?: string | null
          created_at?: string
          created_by?: string | null
          customer_id?: string | null
          customer_name_freeform?: string | null
          discount?: number
          external_reference?: string | null
          guest_email?: string | null
          guest_name?: string | null
          guest_phone?: string | null
          id?: string
          notes?: string | null
          order_code?: string
          payment_amount_1?: number | null
          payment_amount_2?: number | null
          payment_link?: string | null
          payment_method?: Database["public"]["Enums"]["payment_method"] | null
          payment_method_2?:
            | Database["public"]["Enums"]["payment_method"]
            | null
          payment_proof_url?: string | null
          payment_status?: Database["public"]["Enums"]["payment_status"]
          seller_id?: string | null
          shipping?: number
          shipping_address?: Json | null
          shipping_carrier?: string | null
          shipping_cep?: string | null
          shipping_deadline_days?: number | null
          shipping_service?: string | null
          source?: string
          status?: Database["public"]["Enums"]["order_status"]
          subtotal?: number
          total?: number
          updated_at?: string
        }
        Update: {
          channel?: Database["public"]["Enums"]["sales_channel"]
          closed_at?: string | null
          created_at?: string
          created_by?: string | null
          customer_id?: string | null
          customer_name_freeform?: string | null
          discount?: number
          external_reference?: string | null
          guest_email?: string | null
          guest_name?: string | null
          guest_phone?: string | null
          id?: string
          notes?: string | null
          order_code?: string
          payment_amount_1?: number | null
          payment_amount_2?: number | null
          payment_link?: string | null
          payment_method?: Database["public"]["Enums"]["payment_method"] | null
          payment_method_2?:
            | Database["public"]["Enums"]["payment_method"]
            | null
          payment_proof_url?: string | null
          payment_status?: Database["public"]["Enums"]["payment_status"]
          seller_id?: string | null
          shipping?: number
          shipping_address?: Json | null
          shipping_carrier?: string | null
          shipping_cep?: string | null
          shipping_deadline_days?: number | null
          shipping_service?: string | null
          source?: string
          status?: Database["public"]["Enums"]["order_status"]
          subtotal?: number
          total?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "orders_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
        ]
      }
      product_cost_history: {
        Row: {
          changed_at: string
          changed_by: string | null
          id: string
          new_cost: number
          old_cost: number
          product_id: string
          reason: string | null
        }
        Insert: {
          changed_at?: string
          changed_by?: string | null
          id?: string
          new_cost?: number
          old_cost?: number
          product_id: string
          reason?: string | null
        }
        Update: {
          changed_at?: string
          changed_by?: string | null
          id?: string
          new_cost?: number
          old_cost?: number
          product_id?: string
          reason?: string | null
        }
        Relationships: []
      }
      product_variants: {
        Row: {
          barcode: string | null
          created_at: string
          created_by: string | null
          extra_cost: number
          extra_price: number
          id: string
          min_stock: number
          name: string
          product_id: string
          sku: string | null
          status: Database["public"]["Enums"]["product_status"]
          stock: number
          updated_at: string
        }
        Insert: {
          barcode?: string | null
          created_at?: string
          created_by?: string | null
          extra_cost?: number
          extra_price?: number
          id?: string
          min_stock?: number
          name: string
          product_id: string
          sku?: string | null
          status?: Database["public"]["Enums"]["product_status"]
          stock?: number
          updated_at?: string
        }
        Update: {
          barcode?: string | null
          created_at?: string
          created_by?: string | null
          extra_cost?: number
          extra_price?: number
          id?: string
          min_stock?: number
          name?: string
          product_id?: string
          sku?: string | null
          status?: Database["public"]["Enums"]["product_status"]
          stock?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "product_variants_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      products: {
        Row: {
          avg_cost: number
          brand: string | null
          category: string | null
          cost: number
          created_at: string
          created_by: string | null
          description: string | null
          has_variants: boolean
          height_cm: number
          id: string
          length_cm: number
          min_stock: number
          name: string
          other_costs: number
          packaging_cost: number
          photo_url: string | null
          price: number
          price_shopee: number | null
          price_site: number | null
          price_tiktok: number | null
          sku: string | null
          status: Database["public"]["Enums"]["product_status"]
          stock: number
          supplier_id: string | null
          target_margin: number
          updated_at: string
          weight_g: number
          width_cm: number
        }
        Insert: {
          avg_cost?: number
          brand?: string | null
          category?: string | null
          cost?: number
          created_at?: string
          created_by?: string | null
          description?: string | null
          has_variants?: boolean
          height_cm?: number
          id?: string
          length_cm?: number
          min_stock?: number
          name: string
          other_costs?: number
          packaging_cost?: number
          photo_url?: string | null
          price?: number
          price_shopee?: number | null
          price_site?: number | null
          price_tiktok?: number | null
          sku?: string | null
          status?: Database["public"]["Enums"]["product_status"]
          stock?: number
          supplier_id?: string | null
          target_margin?: number
          updated_at?: string
          weight_g?: number
          width_cm?: number
        }
        Update: {
          avg_cost?: number
          brand?: string | null
          category?: string | null
          cost?: number
          created_at?: string
          created_by?: string | null
          description?: string | null
          has_variants?: boolean
          height_cm?: number
          id?: string
          length_cm?: number
          min_stock?: number
          name?: string
          other_costs?: number
          packaging_cost?: number
          photo_url?: string | null
          price?: number
          price_shopee?: number | null
          price_site?: number | null
          price_tiktok?: number | null
          sku?: string | null
          status?: Database["public"]["Enums"]["product_status"]
          stock?: number
          supplier_id?: string | null
          target_margin?: number
          updated_at?: string
          weight_g?: number
          width_cm?: number
        }
        Relationships: [
          {
            foreignKeyName: "products_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string
          email: string | null
          full_name: string | null
          id: string
          updated_at: string
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          email?: string | null
          full_name?: string | null
          id: string
          updated_at?: string
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          email?: string | null
          full_name?: string | null
          id?: string
          updated_at?: string
        }
        Relationships: []
      }
      stock_movements: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          movement_type: Database["public"]["Enums"]["stock_movement_type"]
          product_id: string
          quantity: number
          reason: string | null
          reference_order_id: string | null
          variant_id: string | null
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          movement_type: Database["public"]["Enums"]["stock_movement_type"]
          product_id: string
          quantity: number
          reason?: string | null
          reference_order_id?: string | null
          variant_id?: string | null
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          movement_type?: Database["public"]["Enums"]["stock_movement_type"]
          product_id?: string
          quantity?: number
          reason?: string | null
          reference_order_id?: string | null
          variant_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "stock_movements_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_movements_variant_id_fkey"
            columns: ["variant_id"]
            isOneToOne: false
            referencedRelation: "product_variants"
            referencedColumns: ["id"]
          },
        ]
      }
      store_settings: {
        Row: {
          id: string
          key: string
          updated_at: string
          value: Json
        }
        Insert: {
          id?: string
          key: string
          updated_at?: string
          value: Json
        }
        Update: {
          id?: string
          key?: string
          updated_at?: string
          value?: Json
        }
        Relationships: []
      }
      suppliers: {
        Row: {
          contact_name: string | null
          created_at: string
          created_by: string | null
          email: string | null
          id: string
          instagram: string | null
          lead_time_days: number | null
          name: string
          notes: string | null
          phone: string | null
          updated_at: string
          whatsapp: string | null
        }
        Insert: {
          contact_name?: string | null
          created_at?: string
          created_by?: string | null
          email?: string | null
          id?: string
          instagram?: string | null
          lead_time_days?: number | null
          name: string
          notes?: string | null
          phone?: string | null
          updated_at?: string
          whatsapp?: string | null
        }
        Update: {
          contact_name?: string | null
          created_at?: string
          created_by?: string | null
          email?: string | null
          id?: string
          instagram?: string | null
          lead_time_days?: number | null
          name?: string
          notes?: string | null
          phone?: string | null
          updated_at?: string
          whatsapp?: string | null
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
      is_team_member: { Args: { _user_id: string }; Returns: boolean }
      title_case_pt: { Args: { txt: string }; Returns: string }
    }
    Enums: {
      app_role: "admin" | "gerente" | "vendedor"
      order_status:
        | "pendente"
        | "em_preparacao"
        | "enviado"
        | "entregue"
        | "cancelado"
        | "devolvido"
      payment_method:
        | "pix"
        | "cartao_credito"
        | "cartao_debito"
        | "dinheiro"
        | "boleto"
        | "transferencia"
        | "outros"
      payment_status:
        | "pendente"
        | "aguardando_conferencia"
        | "confirmado"
        | "estornado"
      product_status: "ativo" | "inativo" | "descontinuado"
      sales_channel:
        | "presencial"
        | "site"
        | "instagram"
        | "shopee"
        | "tiktok_shop"
        | "woocommerce"
        | "whatsapp"
        | "outros"
      stock_movement_type:
        | "entrada"
        | "saida"
        | "ajuste"
        | "devolucao"
        | "perda"
        | "brinde"
        | "uso_interno"
        | "vencimento"
        | "erro_contagem"
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
      app_role: ["admin", "gerente", "vendedor"],
      order_status: [
        "pendente",
        "em_preparacao",
        "enviado",
        "entregue",
        "cancelado",
        "devolvido",
      ],
      payment_method: [
        "pix",
        "cartao_credito",
        "cartao_debito",
        "dinheiro",
        "boleto",
        "transferencia",
        "outros",
      ],
      payment_status: [
        "pendente",
        "aguardando_conferencia",
        "confirmado",
        "estornado",
      ],
      product_status: ["ativo", "inativo", "descontinuado"],
      sales_channel: [
        "presencial",
        "site",
        "instagram",
        "shopee",
        "tiktok_shop",
        "woocommerce",
        "whatsapp",
        "outros",
      ],
      stock_movement_type: [
        "entrada",
        "saida",
        "ajuste",
        "devolucao",
        "perda",
        "brinde",
        "uso_interno",
        "vencimento",
        "erro_contagem",
      ],
    },
  },
} as const
