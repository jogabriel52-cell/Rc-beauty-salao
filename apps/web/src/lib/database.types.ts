
export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[]

export type Database = {
  
  "graphql_public": {
          Tables: {
            [_ in never]: never
          }
          Views: {
            [_ in never]: never
          }
          Functions: {
            "graphql":
{ Args: { "extensions"?: Json,"operationName"?: string,"query"?: string,"variables"?: Json }; Returns: Json
                           }
          }
          Enums: {
            [_ in never]: never
          }
          CompositeTypes: {
            [_ in never]: never
          }
        },"public": {
          Tables: {
            "access_profile_permissions": {
                  Row: {
                    "created_at": string,"created_by": string | null,"permission_code": string,"profile_id": string,"scope": Database["public"]['Enums']["access_scope"]
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"created_by"?: string | null,"permission_code": string,"profile_id": string,"scope"?: Database["public"]['Enums']["access_scope"]
                  }
                  Update: {
                    "created_at"?: string,"created_by"?: string | null,"permission_code"?: string,"profile_id"?: string,"scope"?: Database["public"]['Enums']["access_scope"]
                  }
                  Relationships: [
                    {
      foreignKeyName: "access_profile_permissions_permission_code_fkey"
      columns: ["permission_code"]
isOneToOne: false
      referencedRelation: "permissions"
      referencedColumns: ["code"]
    },{
      foreignKeyName: "access_profile_permissions_profile_id_fkey"
      columns: ["profile_id"]
isOneToOne: false
      referencedRelation: "access_profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"access_profiles": {
                  Row: {
                    "active": boolean,"created_at": string,"created_by": string | null,"description": string | null,"id": string,"key": string | null,"name": string,"requires_mfa": boolean,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "active"?: boolean,"created_at"?: string,"created_by"?: string | null,"description"?: string | null,"id"?: string,"key"?: string | null,"name": string,"requires_mfa"?: boolean,"updated_at"?: string
                  }
                  Update: {
                    "active"?: boolean,"created_at"?: string,"created_by"?: string | null,"description"?: string | null,"id"?: string,"key"?: string | null,"name"?: string,"requires_mfa"?: boolean,"updated_at"?: string
                  }
                  Relationships: [
                    
                  ]
                },"appointments": {
                  Row: {
                    "cancel_reason": string | null,"cancelled_at": string | null,"cancelled_by": string | null,"client_id": string,"created_at": string,"created_by": string | null,"ends_at": string,"id": string,"notes": string | null,"professional_id": string,"service_id": string,"starts_at": string,"status": Database["public"]['Enums']["appointment_status"],"unit_id": string,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "cancel_reason"?: string | null,"cancelled_at"?: string | null,"cancelled_by"?: string | null,"client_id": string,"created_at"?: string,"created_by"?: string | null,"ends_at": string,"id"?: string,"notes"?: string | null,"professional_id": string,"service_id": string,"starts_at": string,"status"?: Database["public"]['Enums']["appointment_status"],"unit_id": string,"updated_at"?: string
                  }
                  Update: {
                    "cancel_reason"?: string | null,"cancelled_at"?: string | null,"cancelled_by"?: string | null,"client_id"?: string,"created_at"?: string,"created_by"?: string | null,"ends_at"?: string,"id"?: string,"notes"?: string | null,"professional_id"?: string,"service_id"?: string,"starts_at"?: string,"status"?: Database["public"]['Enums']["appointment_status"],"unit_id"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "appointments_client_id_unit_id_fkey"
      columns: ["client_id","unit_id"]
isOneToOne: false
      referencedRelation: "clients"
      referencedColumns: ["id","unit_id"]
    },{
      foreignKeyName: "appointments_professional_id_unit_id_fkey"
      columns: ["professional_id","unit_id"]
isOneToOne: false
      referencedRelation: "professionals"
      referencedColumns: ["id","unit_id"]
    },{
      foreignKeyName: "appointments_service_id_unit_id_fkey"
      columns: ["service_id","unit_id"]
isOneToOne: false
      referencedRelation: "services"
      referencedColumns: ["id","unit_id"]
    },{
      foreignKeyName: "appointments_unit_id_fkey"
      columns: ["unit_id"]
isOneToOne: false
      referencedRelation: "units"
      referencedColumns: ["id"]
    }
                  ]
                },"audit_log": {
                  Row: {
                    "action": string,"actor_id": string | null,"db_role": string,"id": number,"new_data": Json | null,"occurred_at": string,"old_data": Json | null,"record_id": string | null,"table_name": string,"unit_id": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "action": string,"actor_id"?: string | null,"db_role"?: string,"id"?: never,"new_data"?: Json | null,"occurred_at"?: string,"old_data"?: Json | null,"record_id"?: string | null,"table_name": string,"unit_id"?: string | null
                  }
                  Update: {
                    "action"?: string,"actor_id"?: string | null,"db_role"?: string,"id"?: never,"new_data"?: Json | null,"occurred_at"?: string,"old_data"?: Json | null,"record_id"?: string | null,"table_name"?: string,"unit_id"?: string | null
                  }
                  Relationships: [
                    
                  ]
                },"clients": {
                  Row: {
                    "archived_at": string | null,"archived_by": string | null,"birth_date": string | null,"created_at": string,"created_by": string | null,"email": string | null,"external_ref": string | null,"full_name": string,"id": string,"notes": string | null,"phone": string | null,"source": string,"unit_id": string,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "archived_at"?: string | null,"archived_by"?: string | null,"birth_date"?: string | null,"created_at"?: string,"created_by"?: string | null,"email"?: string | null,"external_ref"?: string | null,"full_name": string,"id"?: string,"notes"?: string | null,"phone"?: string | null,"source"?: string,"unit_id": string,"updated_at"?: string
                  }
                  Update: {
                    "archived_at"?: string | null,"archived_by"?: string | null,"birth_date"?: string | null,"created_at"?: string,"created_by"?: string | null,"email"?: string | null,"external_ref"?: string | null,"full_name"?: string,"id"?: string,"notes"?: string | null,"phone"?: string | null,"source"?: string,"unit_id"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "clients_unit_id_fkey"
      columns: ["unit_id"]
isOneToOne: false
      referencedRelation: "units"
      referencedColumns: ["id"]
    }
                  ]
                },"membership_permission_overrides": {
                  Row: {
                    "created_at": string,"created_by": string | null,"effect": Database["public"]['Enums']["permission_effect"],"membership_id": string,"permission_code": string,"reason": string,"scope": Database["public"]['Enums']["access_scope"] | null
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"created_by"?: string | null,"effect": Database["public"]['Enums']["permission_effect"],"membership_id": string,"permission_code": string,"reason": string,"scope"?: Database["public"]['Enums']["access_scope"] | null
                  }
                  Update: {
                    "created_at"?: string,"created_by"?: string | null,"effect"?: Database["public"]['Enums']["permission_effect"],"membership_id"?: string,"permission_code"?: string,"reason"?: string,"scope"?: Database["public"]['Enums']["access_scope"] | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "membership_permission_overrides_membership_id_fkey"
      columns: ["membership_id"]
isOneToOne: false
      referencedRelation: "unit_memberships"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "membership_permission_overrides_permission_code_fkey"
      columns: ["permission_code"]
isOneToOne: false
      referencedRelation: "permissions"
      referencedColumns: ["code"]
    }
                  ]
                },"permissions": {
                  Row: {
                    "action": string,"allowed_scopes": (Database["public"]['Enums']["access_scope"])[],"code": string,"description": string,"module": string,"module_label": string,"sort_order": number
                  }
                  ComputedFields: never
                  Insert: {
                    "action": string,"allowed_scopes"?: (Database["public"]['Enums']["access_scope"])[],"code": string,"description": string,"module": string,"module_label": string,"sort_order"?: number
                  }
                  Update: {
                    "action"?: string,"allowed_scopes"?: (Database["public"]['Enums']["access_scope"])[],"code"?: string,"description"?: string,"module"?: string,"module_label"?: string,"sort_order"?: number
                  }
                  Relationships: [
                    
                  ]
                },"platform_admins": {
                  Row: {
                    "created_at": string,"created_by": string | null,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"created_by"?: string | null,"user_id": string
                  }
                  Update: {
                    "created_at"?: string,"created_by"?: string | null,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "platform_admins_user_id_fkey"
      columns: ["user_id"]
isOneToOne: true
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"professionals": {
                  Row: {
                    "active": boolean,"created_at": string,"created_by": string | null,"display_name": string,"id": string,"unit_id": string,"updated_at": string,"user_id": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "active"?: boolean,"created_at"?: string,"created_by"?: string | null,"display_name": string,"id"?: string,"unit_id": string,"updated_at"?: string,"user_id"?: string | null
                  }
                  Update: {
                    "active"?: boolean,"created_at"?: string,"created_by"?: string | null,"display_name"?: string,"id"?: string,"unit_id"?: string,"updated_at"?: string,"user_id"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "professionals_unit_id_fkey"
      columns: ["unit_id"]
isOneToOne: false
      referencedRelation: "units"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "professionals_user_id_fkey"
      columns: ["user_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"profiles": {
                  Row: {
                    "active": boolean,"created_at": string,"deactivated_at": string | null,"deactivation_reason": string | null,"full_name": string,"id": string,"job_title": string | null,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "active"?: boolean,"created_at"?: string,"deactivated_at"?: string | null,"deactivation_reason"?: string | null,"full_name": string,"id": string,"job_title"?: string | null,"updated_at"?: string
                  }
                  Update: {
                    "active"?: boolean,"created_at"?: string,"deactivated_at"?: string | null,"deactivation_reason"?: string | null,"full_name"?: string,"id"?: string,"job_title"?: string | null,"updated_at"?: string
                  }
                  Relationships: [
                    
                  ]
                },"services": {
                  Row: {
                    "active": boolean,"created_at": string,"created_by": string | null,"duration_minutes": number,"id": string,"name": string,"price_cents": number | null,"unit_id": string,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "active"?: boolean,"created_at"?: string,"created_by"?: string | null,"duration_minutes": number,"id"?: string,"name": string,"price_cents"?: number | null,"unit_id": string,"updated_at"?: string
                  }
                  Update: {
                    "active"?: boolean,"created_at"?: string,"created_by"?: string | null,"duration_minutes"?: number,"id"?: string,"name"?: string,"price_cents"?: number | null,"unit_id"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "services_unit_id_fkey"
      columns: ["unit_id"]
isOneToOne: false
      referencedRelation: "units"
      referencedColumns: ["id"]
    }
                  ]
                },"unit_memberships": {
                  Row: {
                    "access_profile_id": string,"active": boolean,"created_at": string,"created_by": string | null,"id": string,"unit_id": string,"updated_at": string,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "access_profile_id": string,"active"?: boolean,"created_at"?: string,"created_by"?: string | null,"id"?: string,"unit_id": string,"updated_at"?: string,"user_id": string
                  }
                  Update: {
                    "access_profile_id"?: string,"active"?: boolean,"created_at"?: string,"created_by"?: string | null,"id"?: string,"unit_id"?: string,"updated_at"?: string,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "unit_memberships_access_profile_id_fkey"
      columns: ["access_profile_id"]
isOneToOne: false
      referencedRelation: "access_profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "unit_memberships_unit_id_fkey"
      columns: ["unit_id"]
isOneToOne: false
      referencedRelation: "units"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "unit_memberships_user_id_fkey"
      columns: ["user_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"units": {
                  Row: {
                    "active": boolean,"code": string,"created_at": string,"id": string,"name": string,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "active"?: boolean,"code": string,"created_at"?: string,"id"?: string,"name": string,"updated_at"?: string
                  }
                  Update: {
                    "active"?: boolean,"code"?: string,"created_at"?: string,"id"?: string,"name"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    
                  ]
                }
          }
          Views: {
            [_ in never]: never
          }
          Functions: {
            "actor_covers":
{ Args: { "p_permission": string,"p_scope": Database["public"]['Enums']["access_scope"],"p_unit_id": string }; Returns: boolean
                           },
"actor_holds_profile":
{ Args: { "p_profile_id": string }; Returns: boolean
                           },
"actor_manages_person":
{ Args: { "p_user_id": string }; Returns: boolean
                           },
"admin_find_user_id_by_email":
{ Args: { "p_email": string }; Returns: string
                           },
"admin_list_people":
{ Args: Record<PropertyKey, never>; Returns: {
              "active": boolean,"deactivated_at": string,"deactivation_reason": string,"email": string,"full_name": string,"invited_at": string,"is_platform_admin": boolean,"job_title": string,"last_sign_in_at": string,"memberships": Json,"mfa_enabled": boolean,"user_id": string
            }[]
                           },
"admin_provision_person":
{ Args: { "p_full_name": string,"p_job_title": string,"p_memberships": Json,"p_user_id": string }; Returns: string
                           },
"can_manage_access":
{ Args: { "p_unit_id": string }; Returns: boolean
                           },
"can_manage_any_unit":
{ Args: Record<PropertyKey, never>; Returns: boolean
                           },
"can_manage_templates":
{ Args: Record<PropertyKey, never>; Returns: boolean
                           },
"current_aal":
{ Args: Record<PropertyKey, never>; Returns: string
                           },
"current_actor_id":
{ Args: Record<PropertyKey, never>; Returns: string
                           },
"get_my_agenda":
{ Args: { "p_from": string,"p_to": string }; Returns: {
              "appointment_id": string,"client_name": string,"ends_at": string,"notes": string,"service_name": string,"starts_at": string,"status": Database["public"]['Enums']["appointment_status"],"unit_id": string
            }[]
                           },
"has_permission":
{ Args: { "p_permission": string,"p_unit_id": string }; Returns: boolean
                           },
"has_permission_all_units":
{ Args: { "p_permission": string }; Returns: boolean
                           },
"has_unit_scope":
{ Args: { "p_permission": string,"p_unit_id": string }; Returns: boolean
                           },
"is_own_professional":
{ Args: { "p_professional_id": string }; Returns: boolean
                           },
"is_platform_admin":
{ Args: Record<PropertyKey, never>; Returns: boolean
                           },
"is_server_context":
{ Args: Record<PropertyKey, never>; Returns: boolean
                           },
"is_target_platform_admin":
{ Args: { "p_user_id": string }; Returns: boolean
                           },
"is_unit_member":
{ Args: { "p_unit_id": string }; Returns: boolean
                           },
"mfa_required_for":
{ Args: { "p_user_id": string }; Returns: boolean
                           },
"mfa_satisfied":
{ Args: Record<PropertyKey, never>; Returns: boolean
                           },
"my_access":
{ Args: Record<PropertyKey, never>; Returns: Json
                           },
"my_permissions":
{ Args: { "p_unit_id": string }; Returns: {
              "code": string,"scope": Database["public"]['Enums']["access_scope"]
            }[]
                           },
"permission_scope":
{ Args: { "p_permission": string,"p_unit_id": string }; Returns: Database["public"]['Enums']["access_scope"]
                           },
"profile_exists":
{ Args: { "p_user_id": string }; Returns: boolean
                           },
"profile_in_use":
{ Args: { "p_profile_id": string }; Returns: boolean
                           },
"profile_used_by_platform_admin":
{ Args: { "p_profile_id": string }; Returns: boolean
                           },
"shares_unit_with":
{ Args: { "p_user_id": string }; Returns: boolean
                           },
"tg_templates_guard_common":
{ Args: { "p_profile_id": string }; Returns: undefined
                           }
          }
          Enums: {
            "access_scope": "own"|"unit","appointment_status": "agendado"|"confirmado"|"concluido"|"cancelado"|"nao_compareceu","permission_effect": "grant"|"revoke"
          }
          CompositeTypes: {
            [_ in never]: never
          }
        }
}

type DatabaseWithoutInternals = Omit<Database, '__InternalSupabase'>

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
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
  ? (DefaultSchema["Tables"] & DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
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
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
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
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
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
    : never = never
> = DefaultSchemaEnumNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
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
    : never = never
> = PublicCompositeTypeNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
  ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
  : never

export const Constants = {
  "graphql_public": {
          Enums: {
            
          }
        },"public": {
          Enums: {
            "access_scope": ["own", "unit"],"appointment_status": ["agendado", "confirmado", "concluido", "cancelado", "nao_compareceu"],"permission_effect": ["grant", "revoke"]
          }
        }
} as const
