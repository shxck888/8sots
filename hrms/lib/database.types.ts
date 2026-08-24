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
      audit_logs: {
        Row: {
          action: string
          actor_user_id: string | null
          after_data: Json | null
          before_data: Json | null
          entity_id: string | null
          entity_type: string
          id: number
          occurred_at: string
          request_id: string | null
          tenant_id: string
        }
        Insert: {
          action: string
          actor_user_id?: string | null
          after_data?: Json | null
          before_data?: Json | null
          entity_id?: string | null
          entity_type: string
          id?: never
          occurred_at?: string
          request_id?: string | null
          tenant_id: string
        }
        Update: {
          action?: string
          actor_user_id?: string | null
          after_data?: Json | null
          before_data?: Json | null
          entity_id?: string | null
          entity_type?: string
          id?: never
          occurred_at?: string
          request_id?: string | null
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "audit_logs_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      companies: {
        Row: {
          created_at: string
          id: string
          name: string
          status: Database["public"]["Enums"]["organization_status"]
          tax_id: string | null
          tenant_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
          status?: Database["public"]["Enums"]["organization_status"]
          tax_id?: string | null
          tenant_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          status?: Database["public"]["Enums"]["organization_status"]
          tax_id?: string | null
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "companies_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      departments: {
        Row: {
          created_at: string
          id: string
          name: string
          status: Database["public"]["Enums"]["organization_status"]
          tenant_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
          status?: Database["public"]["Enums"]["organization_status"]
          tenant_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          status?: Database["public"]["Enums"]["organization_status"]
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "departments_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      employee_auth_accounts: {
        Row: {
          auth_user_id: string
          employee_id: string
          provisioned_at: string
          provisioned_by: string | null
          status: Database["public"]["Enums"]["employee_auth_status"]
          tenant_id: string
          updated_at: string
          username: string
        }
        Insert: {
          auth_user_id: string
          employee_id: string
          provisioned_at?: string
          provisioned_by?: string | null
          status?: Database["public"]["Enums"]["employee_auth_status"]
          tenant_id: string
          updated_at?: string
          username: string
        }
        Update: {
          auth_user_id?: string
          employee_id?: string
          provisioned_at?: string
          provisioned_by?: string | null
          status?: Database["public"]["Enums"]["employee_auth_status"]
          tenant_id?: string
          updated_at?: string
          username?: string
        }
        Relationships: [
          {
            foreignKeyName: "employee_auth_accounts_tenant_id_employee_id_fkey"
            columns: ["tenant_id", "employee_id"]
            isOneToOne: false
            referencedRelation: "employee_master_current"
            referencedColumns: ["tenant_id", "id"]
          },
          {
            foreignKeyName: "employee_auth_accounts_tenant_id_employee_id_fkey"
            columns: ["tenant_id", "employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["tenant_id", "id"]
          },
          {
            foreignKeyName: "employee_auth_accounts_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      employee_contacts: {
        Row: {
          created_at: string
          email: string | null
          emergency_contact_name: string | null
          emergency_contact_phone: string | null
          employee_id: string
          mobile: string | null
          tenant_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          email?: string | null
          emergency_contact_name?: string | null
          emergency_contact_phone?: string | null
          employee_id: string
          mobile?: string | null
          tenant_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          email?: string | null
          emergency_contact_name?: string | null
          emergency_contact_phone?: string | null
          employee_id?: string
          mobile?: string | null
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "employee_contacts_tenant_id_employee_id_fkey"
            columns: ["tenant_id", "employee_id"]
            isOneToOne: false
            referencedRelation: "employee_master_current"
            referencedColumns: ["tenant_id", "id"]
          },
          {
            foreignKeyName: "employee_contacts_tenant_id_employee_id_fkey"
            columns: ["tenant_id", "employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["tenant_id", "id"]
          },
          {
            foreignKeyName: "employee_contacts_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      employee_profiles: {
        Row: {
          address: string | null
          birth_date: string | null
          created_at: string
          employee_id: string
          english_name: string | null
          gender: Database["public"]["Enums"]["gender_type"] | null
          national_id_ciphertext: string | null
          national_id_hash: string | null
          national_id_last4: string | null
          photo_path: string | null
          tenant_id: string
          updated_at: string
        }
        Insert: {
          address?: string | null
          birth_date?: string | null
          created_at?: string
          employee_id: string
          english_name?: string | null
          gender?: Database["public"]["Enums"]["gender_type"] | null
          national_id_ciphertext?: string | null
          national_id_hash?: string | null
          national_id_last4?: string | null
          photo_path?: string | null
          tenant_id: string
          updated_at?: string
        }
        Update: {
          address?: string | null
          birth_date?: string | null
          created_at?: string
          employee_id?: string
          english_name?: string | null
          gender?: Database["public"]["Enums"]["gender_type"] | null
          national_id_ciphertext?: string | null
          national_id_hash?: string | null
          national_id_last4?: string | null
          photo_path?: string | null
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "employee_profiles_tenant_id_employee_id_fkey"
            columns: ["tenant_id", "employee_id"]
            isOneToOne: false
            referencedRelation: "employee_master_current"
            referencedColumns: ["tenant_id", "id"]
          },
          {
            foreignKeyName: "employee_profiles_tenant_id_employee_id_fkey"
            columns: ["tenant_id", "employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["tenant_id", "id"]
          },
          {
            foreignKeyName: "employee_profiles_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      employees: {
        Row: {
          auth_user_id: string | null
          created_at: string
          created_by: string | null
          email: string | null
          employee_no: string
          full_name: string
          hire_date: string
          id: string
          notes: string | null
          phone: string | null
          preferred_name: string | null
          status: Database["public"]["Enums"]["employee_status"]
          tenant_id: string
          updated_at: string
        }
        Insert: {
          auth_user_id?: string | null
          created_at?: string
          created_by?: string | null
          email?: string | null
          employee_no: string
          full_name: string
          hire_date: string
          id?: string
          notes?: string | null
          phone?: string | null
          preferred_name?: string | null
          status?: Database["public"]["Enums"]["employee_status"]
          tenant_id: string
          updated_at?: string
        }
        Update: {
          auth_user_id?: string | null
          created_at?: string
          created_by?: string | null
          email?: string | null
          employee_no?: string
          full_name?: string
          hire_date?: string
          id?: string
          notes?: string | null
          phone?: string | null
          preferred_name?: string | null
          status?: Database["public"]["Enums"]["employee_status"]
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "employees_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      employment_records: {
        Row: {
          created_at: string
          created_by: string | null
          department_id: string | null
          effective_from: string
          effective_to: string | null
          employee_id: string
          employment_type: Database["public"]["Enums"]["employment_type"]
          hire_date: string
          id: string
          position_id: string | null
          probation_end_date: string | null
          status: Database["public"]["Enums"]["employee_status"]
          supervisor_employee_id: string | null
          tenant_id: string
          termination_date: string | null
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          department_id?: string | null
          effective_from: string
          effective_to?: string | null
          employee_id: string
          employment_type: Database["public"]["Enums"]["employment_type"]
          hire_date: string
          id?: string
          position_id?: string | null
          probation_end_date?: string | null
          status?: Database["public"]["Enums"]["employee_status"]
          supervisor_employee_id?: string | null
          tenant_id: string
          termination_date?: string | null
        }
        Update: {
          created_at?: string
          created_by?: string | null
          department_id?: string | null
          effective_from?: string
          effective_to?: string | null
          employee_id?: string
          employment_type?: Database["public"]["Enums"]["employment_type"]
          hire_date?: string
          id?: string
          position_id?: string | null
          probation_end_date?: string | null
          status?: Database["public"]["Enums"]["employee_status"]
          supervisor_employee_id?: string | null
          tenant_id?: string
          termination_date?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "employment_records_tenant_id_department_id_fkey"
            columns: ["tenant_id", "department_id"]
            isOneToOne: false
            referencedRelation: "departments"
            referencedColumns: ["tenant_id", "id"]
          },
          {
            foreignKeyName: "employment_records_tenant_id_employee_id_fkey"
            columns: ["tenant_id", "employee_id"]
            isOneToOne: false
            referencedRelation: "employee_master_current"
            referencedColumns: ["tenant_id", "id"]
          },
          {
            foreignKeyName: "employment_records_tenant_id_employee_id_fkey"
            columns: ["tenant_id", "employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["tenant_id", "id"]
          },
          {
            foreignKeyName: "employment_records_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "employment_records_tenant_id_position_id_fkey"
            columns: ["tenant_id", "position_id"]
            isOneToOne: false
            referencedRelation: "positions"
            referencedColumns: ["tenant_id", "id"]
          },
          {
            foreignKeyName: "employment_records_tenant_id_supervisor_employee_id_fkey"
            columns: ["tenant_id", "supervisor_employee_id"]
            isOneToOne: false
            referencedRelation: "employee_master_current"
            referencedColumns: ["tenant_id", "id"]
          },
          {
            foreignKeyName: "employment_records_tenant_id_supervisor_employee_id_fkey"
            columns: ["tenant_id", "supervisor_employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["tenant_id", "id"]
          },
        ]
      }
      locations: {
        Row: {
          code: string
          company_id: string
          created_at: string
          id: string
          name: string
          status: Database["public"]["Enums"]["organization_status"]
          tenant_id: string
          timezone: string
          updated_at: string
        }
        Insert: {
          code: string
          company_id: string
          created_at?: string
          id?: string
          name: string
          status?: Database["public"]["Enums"]["organization_status"]
          tenant_id: string
          timezone?: string
          updated_at?: string
        }
        Update: {
          code?: string
          company_id?: string
          created_at?: string
          id?: string
          name?: string
          status?: Database["public"]["Enums"]["organization_status"]
          tenant_id?: string
          timezone?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "locations_tenant_id_company_id_fkey"
            columns: ["tenant_id", "company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["tenant_id", "id"]
          },
          {
            foreignKeyName: "locations_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      membership_roles: {
        Row: {
          created_at: string
          id: string
          membership_id: string
          role_id: string
          scope_id: string | null
          scope_type: Database["public"]["Enums"]["role_scope_type"]
          tenant_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          membership_id: string
          role_id: string
          scope_id?: string | null
          scope_type?: Database["public"]["Enums"]["role_scope_type"]
          tenant_id: string
        }
        Update: {
          created_at?: string
          id?: string
          membership_id?: string
          role_id?: string
          scope_id?: string | null
          scope_type?: Database["public"]["Enums"]["role_scope_type"]
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "membership_roles_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "membership_roles_tenant_id_membership_id_fkey"
            columns: ["tenant_id", "membership_id"]
            isOneToOne: false
            referencedRelation: "tenant_memberships"
            referencedColumns: ["tenant_id", "id"]
          },
          {
            foreignKeyName: "membership_roles_tenant_id_role_id_fkey"
            columns: ["tenant_id", "role_id"]
            isOneToOne: false
            referencedRelation: "roles"
            referencedColumns: ["tenant_id", "id"]
          },
        ]
      }
      permissions: {
        Row: {
          code: string
          created_at: string
          description: string
          id: string
        }
        Insert: {
          code: string
          created_at?: string
          description: string
          id?: string
        }
        Update: {
          code?: string
          created_at?: string
          description?: string
          id?: string
        }
        Relationships: []
      }
      positions: {
        Row: {
          created_at: string
          id: string
          name: string
          status: Database["public"]["Enums"]["organization_status"]
          tenant_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
          status?: Database["public"]["Enums"]["organization_status"]
          tenant_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          status?: Database["public"]["Enums"]["organization_status"]
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "positions_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      role_permissions: {
        Row: {
          created_at: string
          permission_id: string
          role_id: string
          tenant_id: string
        }
        Insert: {
          created_at?: string
          permission_id: string
          role_id: string
          tenant_id: string
        }
        Update: {
          created_at?: string
          permission_id?: string
          role_id?: string
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "role_permissions_permission_id_fkey"
            columns: ["permission_id"]
            isOneToOne: false
            referencedRelation: "permissions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "role_permissions_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "role_permissions_tenant_id_role_id_fkey"
            columns: ["tenant_id", "role_id"]
            isOneToOne: false
            referencedRelation: "roles"
            referencedColumns: ["tenant_id", "id"]
          },
        ]
      }
      roles: {
        Row: {
          code: string
          created_at: string
          id: string
          is_system: boolean
          name: string
          tenant_id: string
          updated_at: string
        }
        Insert: {
          code: string
          created_at?: string
          id?: string
          is_system?: boolean
          name: string
          tenant_id: string
          updated_at?: string
        }
        Update: {
          code?: string
          created_at?: string
          id?: string
          is_system?: boolean
          name?: string
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "roles_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      tenant_memberships: {
        Row: {
          created_at: string
          id: string
          joined_at: string | null
          status: Database["public"]["Enums"]["membership_status"]
          tenant_id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          joined_at?: string | null
          status?: Database["public"]["Enums"]["membership_status"]
          tenant_id: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          joined_at?: string | null
          status?: Database["public"]["Enums"]["membership_status"]
          tenant_id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "tenant_memberships_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      tenants: {
        Row: {
          created_at: string
          id: string
          name: string
          slug: string
          status: Database["public"]["Enums"]["organization_status"]
          timezone: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
          slug: string
          status?: Database["public"]["Enums"]["organization_status"]
          timezone?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          slug?: string
          status?: Database["public"]["Enums"]["organization_status"]
          timezone?: string
          updated_at?: string
        }
        Relationships: []
      }
    }
    Views: {
      employee_master_current: {
        Row: {
          address: string | null
          auth_user_id: string | null
          birth_date: string | null
          created_at: string | null
          department_id: string | null
          department_name: string | null
          effective_from: string | null
          email: string | null
          emergency_contact_name: string | null
          emergency_contact_phone: string | null
          employee_no: string | null
          employment_record_id: string | null
          employment_type: Database["public"]["Enums"]["employment_type"] | null
          english_name: string | null
          full_name: string | null
          gender: Database["public"]["Enums"]["gender_type"] | null
          hire_date: string | null
          id: string | null
          mobile: string | null
          national_id_last4: string | null
          notes: string | null
          photo_path: string | null
          position_id: string | null
          position_name: string | null
          probation_end_date: string | null
          status: Database["public"]["Enums"]["employee_status"] | null
          supervisor_employee_id: string | null
          supervisor_name: string | null
          tenant_id: string | null
          termination_date: string | null
          updated_at: string | null
        }
        Relationships: [
          {
            foreignKeyName: "employees_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Functions: {
      create_employee: {
        Args: {
          p_email: string
          p_employee_no: string
          p_full_name: string
          p_hire_date: string
          p_notes: string
          p_phone: string
          p_preferred_name: string
          p_status: Database["public"]["Enums"]["employee_status"]
          p_tenant_id: string
        }
        Returns: string
      }
      create_employee_master: {
        Args: {
          p_address: string
          p_birth_date: string
          p_department_name: string
          p_email: string
          p_emergency_contact_name: string
          p_emergency_contact_phone: string
          p_employee_no: string
          p_employment_type: Database["public"]["Enums"]["employment_type"]
          p_english_name: string
          p_full_name: string
          p_gender: Database["public"]["Enums"]["gender_type"]
          p_hire_date: string
          p_mobile: string
          p_national_id_ciphertext: string
          p_national_id_hash: string
          p_national_id_last4: string
          p_notes: string
          p_position_name: string
          p_probation_end_date: string
          p_status: Database["public"]["Enums"]["employee_status"]
          p_supervisor_employee_id: string
          p_tenant_id: string
          p_termination_date: string
        }
        Returns: string
      }
      current_user_has_permission: {
        Args: { p_permission_code: string; p_tenant_id: string }
        Returns: boolean
      }
      current_user_tenant_ids: { Args: never; Returns: string[] }
      link_employee_auth_account: {
        Args: {
          p_auth_user_id: string
          p_employee_id: string
          p_tenant_id: string
          p_username: string
        }
        Returns: undefined
      }
      record_employee_password_reset: {
        Args: { p_employee_id: string; p_tenant_id: string }
        Returns: undefined
      }
      set_employee_auth_account_status: {
        Args: {
          p_employee_id: string
          p_status: Database["public"]["Enums"]["employee_auth_status"]
          p_tenant_id: string
        }
        Returns: undefined
      }
      set_employee_photo: {
        Args: {
          p_employee_id: string
          p_photo_path: string
          p_tenant_id: string
        }
        Returns: undefined
      }
      update_employee: {
        Args: {
          p_email: string
          p_employee_id: string
          p_employee_no: string
          p_full_name: string
          p_hire_date: string
          p_notes: string
          p_phone: string
          p_preferred_name: string
          p_status: Database["public"]["Enums"]["employee_status"]
          p_tenant_id: string
        }
        Returns: undefined
      }
      update_employee_master: {
        Args: {
          p_address: string
          p_birth_date: string
          p_department_name: string
          p_email: string
          p_emergency_contact_name: string
          p_emergency_contact_phone: string
          p_employee_id: string
          p_employee_no: string
          p_employment_type: Database["public"]["Enums"]["employment_type"]
          p_english_name: string
          p_full_name: string
          p_gender: Database["public"]["Enums"]["gender_type"]
          p_hire_date: string
          p_mobile: string
          p_national_id_ciphertext: string
          p_national_id_hash: string
          p_national_id_last4: string
          p_notes: string
          p_position_name: string
          p_probation_end_date: string
          p_status: Database["public"]["Enums"]["employee_status"]
          p_supervisor_employee_id: string
          p_tenant_id: string
          p_termination_date: string
        }
        Returns: undefined
      }
    }
    Enums: {
      employee_auth_status: "active" | "suspended"
      employee_status: "active" | "on_leave" | "terminated"
      employment_type:
        | "full_time"
        | "part_time"
        | "hourly"
        | "contract"
        | "temporary"
      gender_type: "male" | "female" | "non_binary" | "undisclosed"
      membership_status: "invited" | "active" | "suspended" | "revoked"
      organization_status: "active" | "inactive" | "archived"
      role_scope_type: "tenant" | "company" | "location" | "department" | "self"
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
      employee_auth_status: ["active", "suspended"],
      employee_status: ["active", "on_leave", "terminated"],
      employment_type: [
        "full_time",
        "part_time",
        "hourly",
        "contract",
        "temporary",
      ],
      gender_type: ["male", "female", "non_binary", "undisclosed"],
      membership_status: ["invited", "active", "suspended", "revoked"],
      organization_status: ["active", "inactive", "archived"],
      role_scope_type: ["tenant", "company", "location", "department", "self"],
    },
  },
} as const
