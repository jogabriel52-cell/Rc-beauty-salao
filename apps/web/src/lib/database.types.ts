
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
      referencedRelation: "client_units"
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
                },"bank_statement_lines": {
                  Row: {
                    "account_id": string,"amount_cents": number,"description": string,"id": string,"ignore_reason": string | null,"line_date": string,"line_number": number,"matched_at": string | null,"matched_by": string | null,"matched_entry_id": string | null,"statement_id": string,"status": string,"unit_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "account_id": string,"amount_cents": number,"description": string,"id"?: string,"ignore_reason"?: string | null,"line_date": string,"line_number": number,"matched_at"?: string | null,"matched_by"?: string | null,"matched_entry_id"?: string | null,"statement_id": string,"status"?: string,"unit_id": string
                  }
                  Update: {
                    "account_id"?: string,"amount_cents"?: number,"description"?: string,"id"?: string,"ignore_reason"?: string | null,"line_date"?: string,"line_number"?: number,"matched_at"?: string | null,"matched_by"?: string | null,"matched_entry_id"?: string | null,"statement_id"?: string,"status"?: string,"unit_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "bank_statement_lines_matched_entry_id_unit_id_fkey"
      columns: ["matched_entry_id","unit_id"]
isOneToOne: false
      referencedRelation: "finance_entries"
      referencedColumns: ["id","unit_id"]
    },{
      foreignKeyName: "bank_statement_lines_statement_id_unit_id_fkey"
      columns: ["statement_id","unit_id"]
isOneToOne: false
      referencedRelation: "bank_statements"
      referencedColumns: ["id","unit_id"]
    }
                  ]
                },"bank_statements": {
                  Row: {
                    "account_id": string,"created_at": string,"created_by": string | null,"file_name": string,"file_sha256": string,"id": string,"line_count": number,"unit_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "account_id": string,"created_at"?: string,"created_by"?: string | null,"file_name": string,"file_sha256": string,"id"?: string,"line_count": number,"unit_id": string
                  }
                  Update: {
                    "account_id"?: string,"created_at"?: string,"created_by"?: string | null,"file_name"?: string,"file_sha256"?: string,"id"?: string,"line_count"?: number,"unit_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "bank_statements_account_id_unit_id_fkey"
      columns: ["account_id","unit_id"]
isOneToOne: false
      referencedRelation: "finance_accounts"
      referencedColumns: ["id","unit_id"]
    },{
      foreignKeyName: "bank_statements_unit_id_fkey"
      columns: ["unit_id"]
isOneToOne: false
      referencedRelation: "units"
      referencedColumns: ["id"]
    }
                  ]
                },"client_duplicate_dismissals": {
                  Row: {
                    "client_a": string,"client_b": string,"created_at": string,"created_by": string | null,"reason": string,"unit_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "client_a": string,"client_b": string,"created_at"?: string,"created_by"?: string | null,"reason": string,"unit_id": string
                  }
                  Update: {
                    "client_a"?: string,"client_b"?: string,"created_at"?: string,"created_by"?: string | null,"reason"?: string,"unit_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "client_duplicate_dismissals_client_a_unit_id_fkey"
      columns: ["client_a","unit_id"]
isOneToOne: false
      referencedRelation: "client_units"
      referencedColumns: ["id","unit_id"]
    },{
      foreignKeyName: "client_duplicate_dismissals_client_b_unit_id_fkey"
      columns: ["client_b","unit_id"]
isOneToOne: false
      referencedRelation: "client_units"
      referencedColumns: ["id","unit_id"]
    },{
      foreignKeyName: "client_duplicate_dismissals_unit_id_fkey"
      columns: ["unit_id"]
isOneToOne: false
      referencedRelation: "units"
      referencedColumns: ["id"]
    }
                  ]
                },"client_identities": {
                  Row: {
                    "birth_date": string | null,"created_at": string,"created_by": string | null,"email": string | null,"full_name": string,"id": string,"merged_into_id": string | null,"phone": string | null,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "birth_date"?: string | null,"created_at"?: string,"created_by"?: string | null,"email"?: string | null,"full_name": string,"id"?: string,"merged_into_id"?: string | null,"phone"?: string | null,"updated_at"?: string
                  }
                  Update: {
                    "birth_date"?: string | null,"created_at"?: string,"created_by"?: string | null,"email"?: string | null,"full_name"?: string,"id"?: string,"merged_into_id"?: string | null,"phone"?: string | null,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "client_identities_merged_into_id_fkey"
      columns: ["merged_into_id"]
isOneToOne: false
      referencedRelation: "client_identities"
      referencedColumns: ["id"]
    }
                  ]
                },"client_units": {
                  Row: {
                    "archived_at": string | null,"archived_by": string | null,"created_at": string,"created_by": string | null,"external_ref": string | null,"id": string,"identity_id": string,"merged_into_id": string | null,"service_notes": string | null,"source": string,"unit_id": string,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "archived_at"?: string | null,"archived_by"?: string | null,"created_at"?: string,"created_by"?: string | null,"external_ref"?: string | null,"id"?: string,"identity_id": string,"merged_into_id"?: string | null,"service_notes"?: string | null,"source"?: string,"unit_id": string,"updated_at"?: string
                  }
                  Update: {
                    "archived_at"?: string | null,"archived_by"?: string | null,"created_at"?: string,"created_by"?: string | null,"external_ref"?: string | null,"id"?: string,"identity_id"?: string,"merged_into_id"?: string | null,"service_notes"?: string | null,"source"?: string,"unit_id"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "client_units_identity_fk"
      columns: ["identity_id"]
isOneToOne: false
      referencedRelation: "client_identities"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "client_units_merged_into_id_fkey"
      columns: ["merged_into_id"]
isOneToOne: false
      referencedRelation: "client_units"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "clients_unit_id_fkey"
      columns: ["unit_id"]
isOneToOne: false
      referencedRelation: "units"
      referencedColumns: ["id"]
    }
                  ]
                },"commission_goals": {
                  Row: {
                    "created_at": string,"created_by": string | null,"goal_cents": number,"id": string,"period_end": string,"period_start": string,"plan_id": string,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"created_by"?: string | null,"goal_cents": number,"id"?: string,"period_end": string,"period_start": string,"plan_id": string,"updated_at"?: string
                  }
                  Update: {
                    "created_at"?: string,"created_by"?: string | null,"goal_cents"?: number,"id"?: string,"period_end"?: string,"period_start"?: string,"plan_id"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "commission_goals_plan_id_fkey"
      columns: ["plan_id"]
isOneToOne: false
      referencedRelation: "commission_plans"
      referencedColumns: ["id"]
    }
                  ]
                },"commission_plan_tiers": {
                  Row: {
                    "min_achievement_pct": number,"plan_id": string,"rate_pct": number
                  }
                  ComputedFields: never
                  Insert: {
                    "min_achievement_pct": number,"plan_id": string,"rate_pct": number
                  }
                  Update: {
                    "min_achievement_pct"?: number,"plan_id"?: string,"rate_pct"?: number
                  }
                  Relationships: [
                    {
      foreignKeyName: "commission_plan_tiers_plan_id_fkey"
      columns: ["plan_id"]
isOneToOne: false
      referencedRelation: "commission_plans"
      referencedColumns: ["id"]
    }
                  ]
                },"commission_plans": {
                  Row: {
                    "activated_at": string | null,"activated_by": string | null,"amount_basis": string | null,"base_scope": string | null,"beneficiary_id": string,"created_at": string,"created_by": string | null,"goal_type": string,"id": string,"item_filter": string | null,"name": string,"period_start_day": number | null,"period_type": string | null,"preset_key": string | null,"refund_policy": string | null,"revenue_source": string | null,"status": string,"tier_mode": string | null,"unit_id": string,"updated_at": string,"commission_plan_pending": (string)[] | null
                  }
                  ComputedFields: "commission_plan_pending"
                  Insert: {
                    "activated_at"?: string | null,"activated_by"?: string | null,"amount_basis"?: string | null,"base_scope"?: string | null,"beneficiary_id": string,"created_at"?: string,"created_by"?: string | null,"goal_type": string,"id"?: string,"item_filter"?: string | null,"name": string,"period_start_day"?: number | null,"period_type"?: string | null,"preset_key"?: string | null,"refund_policy"?: string | null,"revenue_source"?: string | null,"status"?: string,"tier_mode"?: string | null,"unit_id": string,"updated_at"?: string
                  }
                  Update: {
                    "activated_at"?: string | null,"activated_by"?: string | null,"amount_basis"?: string | null,"base_scope"?: string | null,"beneficiary_id"?: string,"created_at"?: string,"created_by"?: string | null,"goal_type"?: string,"id"?: string,"item_filter"?: string | null,"name"?: string,"period_start_day"?: number | null,"period_type"?: string | null,"preset_key"?: string | null,"refund_policy"?: string | null,"revenue_source"?: string | null,"status"?: string,"tier_mode"?: string | null,"unit_id"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "commission_plans_beneficiary_id_fkey"
      columns: ["beneficiary_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "commission_plans_preset_key_fkey"
      columns: ["preset_key"]
isOneToOne: false
      referencedRelation: "commission_presets"
      referencedColumns: ["key"]
    },{
      foreignKeyName: "commission_plans_unit_id_fkey"
      columns: ["unit_id"]
isOneToOne: false
      referencedRelation: "units"
      referencedColumns: ["id"]
    }
                  ]
                },"commission_presets": {
                  Row: {
                    "goal_type": string,"key": string,"name": string,"notes": string,"tiers": NonNullable<Json>
                  }
                  ComputedFields: never
                  Insert: {
                    "goal_type": string,"key": string,"name": string,"notes": string,"tiers": NonNullable<Json>
                  }
                  Update: {
                    "goal_type"?: string,"key"?: string,"name"?: string,"notes"?: string,"tiers"?: NonNullable<Json>
                  }
                  Relationships: [
                    
                  ]
                },"commission_statements": {
                  Row: {
                    "achievement_pct": number,"adjustments_cents": number,"approved_at": string | null,"approved_by": string | null,"beneficiary_id": string,"calculated_at": string,"calculated_by": string | null,"cancel_reason": string | null,"commission_cents": number,"created_at": string,"finance_entry_id": string | null,"goal_cents": number,"id": string,"parameters": NonNullable<Json>,"period_end": string,"period_start": string,"plan_id": string,"rate_pct": number,"revenue_cents": number,"status": string,"unit_id": string,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "achievement_pct": number,"adjustments_cents"?: number,"approved_at"?: string | null,"approved_by"?: string | null,"beneficiary_id": string,"calculated_at"?: string,"calculated_by"?: string | null,"cancel_reason"?: string | null,"commission_cents": number,"created_at"?: string,"finance_entry_id"?: string | null,"goal_cents": number,"id"?: string,"parameters": NonNullable<Json>,"period_end": string,"period_start": string,"plan_id": string,"rate_pct": number,"revenue_cents": number,"status"?: string,"unit_id": string,"updated_at"?: string
                  }
                  Update: {
                    "achievement_pct"?: number,"adjustments_cents"?: number,"approved_at"?: string | null,"approved_by"?: string | null,"beneficiary_id"?: string,"calculated_at"?: string,"calculated_by"?: string | null,"cancel_reason"?: string | null,"commission_cents"?: number,"created_at"?: string,"finance_entry_id"?: string | null,"goal_cents"?: number,"id"?: string,"parameters"?: NonNullable<Json>,"period_end"?: string,"period_start"?: string,"plan_id"?: string,"rate_pct"?: number,"revenue_cents"?: number,"status"?: string,"unit_id"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "commission_statements_beneficiary_id_fkey"
      columns: ["beneficiary_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "commission_statements_finance_entry_id_unit_id_fkey"
      columns: ["finance_entry_id","unit_id"]
isOneToOne: false
      referencedRelation: "finance_entries"
      referencedColumns: ["id","unit_id"]
    },{
      foreignKeyName: "commission_statements_plan_id_unit_id_fkey"
      columns: ["plan_id","unit_id"]
isOneToOne: false
      referencedRelation: "commission_plans"
      referencedColumns: ["id","unit_id"]
    },{
      foreignKeyName: "commission_statements_unit_id_fkey"
      columns: ["unit_id"]
isOneToOne: false
      referencedRelation: "units"
      referencedColumns: ["id"]
    }
                  ]
                },"consent_events": {
                  Row: {
                    "action": string,"channel": string,"client_unit_id": string,"created_at": string,"created_by": string | null,"evidence": string | null,"id": string,"occurred_at": string,"purpose": string,"seq": number,"source": string,"unit_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "action": string,"channel"?: string,"client_unit_id": string,"created_at"?: string,"created_by"?: string | null,"evidence"?: string | null,"id"?: string,"occurred_at"?: string,"purpose": string,"seq"?: never,"source": string,"unit_id": string
                  }
                  Update: {
                    "action"?: string,"channel"?: string,"client_unit_id"?: string,"created_at"?: string,"created_by"?: string | null,"evidence"?: string | null,"id"?: string,"occurred_at"?: string,"purpose"?: string,"seq"?: never,"source"?: string,"unit_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "consent_events_client_unit_id_unit_id_fkey"
      columns: ["client_unit_id","unit_id"]
isOneToOne: false
      referencedRelation: "client_units"
      referencedColumns: ["id","unit_id"]
    },{
      foreignKeyName: "consent_events_unit_id_fkey"
      columns: ["unit_id"]
isOneToOne: false
      referencedRelation: "units"
      referencedColumns: ["id"]
    }
                  ]
                },"conversations": {
                  Row: {
                    "assigned_to": string | null,"client_unit_id": string | null,"contact_name": string | null,"contact_phone": string,"created_at": string,"id": string,"last_inbound_at": string | null,"last_message_at": string | null,"status": string,"unit_id": string,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "assigned_to"?: string | null,"client_unit_id"?: string | null,"contact_name"?: string | null,"contact_phone": string,"created_at"?: string,"id"?: string,"last_inbound_at"?: string | null,"last_message_at"?: string | null,"status"?: string,"unit_id": string,"updated_at"?: string
                  }
                  Update: {
                    "assigned_to"?: string | null,"client_unit_id"?: string | null,"contact_name"?: string | null,"contact_phone"?: string,"created_at"?: string,"id"?: string,"last_inbound_at"?: string | null,"last_message_at"?: string | null,"status"?: string,"unit_id"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "conversations_assigned_to_fkey"
      columns: ["assigned_to"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "conversations_client_unit_id_unit_id_fkey"
      columns: ["client_unit_id","unit_id"]
isOneToOne: false
      referencedRelation: "client_units"
      referencedColumns: ["id","unit_id"]
    },{
      foreignKeyName: "conversations_unit_id_fkey"
      columns: ["unit_id"]
isOneToOne: false
      referencedRelation: "units"
      referencedColumns: ["id"]
    }
                  ]
                },"crm_interactions": {
                  Row: {
                    "body": string,"client_unit_id": string,"created_at": string,"created_by": string | null,"id": string,"kind": string,"occurred_at": string,"unit_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "body": string,"client_unit_id": string,"created_at"?: string,"created_by"?: string | null,"id"?: string,"kind"?: string,"occurred_at"?: string,"unit_id": string
                  }
                  Update: {
                    "body"?: string,"client_unit_id"?: string,"created_at"?: string,"created_by"?: string | null,"id"?: string,"kind"?: string,"occurred_at"?: string,"unit_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "crm_interactions_client_fk"
      columns: ["client_unit_id","unit_id"]
isOneToOne: false
      referencedRelation: "client_units"
      referencedColumns: ["id","unit_id"]
    },{
      foreignKeyName: "crm_interactions_unit_id_fkey"
      columns: ["unit_id"]
isOneToOne: false
      referencedRelation: "units"
      referencedColumns: ["id"]
    }
                  ]
                },"finance_accounts": {
                  Row: {
                    "active": boolean,"created_at": string,"created_by": string | null,"id": string,"kind": string,"name": string,"opening_balance_cents": number,"unit_id": string,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "active"?: boolean,"created_at"?: string,"created_by"?: string | null,"id"?: string,"kind": string,"name": string,"opening_balance_cents"?: number,"unit_id": string,"updated_at"?: string
                  }
                  Update: {
                    "active"?: boolean,"created_at"?: string,"created_by"?: string | null,"id"?: string,"kind"?: string,"name"?: string,"opening_balance_cents"?: number,"unit_id"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "finance_accounts_unit_id_fkey"
      columns: ["unit_id"]
isOneToOne: false
      referencedRelation: "units"
      referencedColumns: ["id"]
    }
                  ]
                },"finance_categories": {
                  Row: {
                    "active": boolean,"created_at": string,"created_by": string | null,"id": string,"kind": string,"name": string,"unit_id": string,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "active"?: boolean,"created_at"?: string,"created_by"?: string | null,"id"?: string,"kind": string,"name": string,"unit_id": string,"updated_at"?: string
                  }
                  Update: {
                    "active"?: boolean,"created_at"?: string,"created_by"?: string | null,"id"?: string,"kind"?: string,"name"?: string,"unit_id"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "finance_categories_unit_id_fkey"
      columns: ["unit_id"]
isOneToOne: false
      referencedRelation: "units"
      referencedColumns: ["id"]
    }
                  ]
                },"finance_entries": {
                  Row: {
                    "account_id": string | null,"amount_cents": number,"cancel_reason": string | null,"category_id": string,"counterparty": string | null,"created_at": string,"created_by": string | null,"description": string,"document_ref": string | null,"due_date": string,"id": string,"kind": string,"notes": string | null,"paid_at": string | null,"source": string,"status": string,"unit_id": string,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "account_id"?: string | null,"amount_cents": number,"cancel_reason"?: string | null,"category_id": string,"counterparty"?: string | null,"created_at"?: string,"created_by"?: string | null,"description": string,"document_ref"?: string | null,"due_date": string,"id"?: string,"kind": string,"notes"?: string | null,"paid_at"?: string | null,"source"?: string,"status"?: string,"unit_id": string,"updated_at"?: string
                  }
                  Update: {
                    "account_id"?: string | null,"amount_cents"?: number,"cancel_reason"?: string | null,"category_id"?: string,"counterparty"?: string | null,"created_at"?: string,"created_by"?: string | null,"description"?: string,"document_ref"?: string | null,"due_date"?: string,"id"?: string,"kind"?: string,"notes"?: string | null,"paid_at"?: string | null,"source"?: string,"status"?: string,"unit_id"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "finance_entries_account_id_unit_id_fkey"
      columns: ["account_id","unit_id"]
isOneToOne: false
      referencedRelation: "finance_accounts"
      referencedColumns: ["id","unit_id"]
    },{
      foreignKeyName: "finance_entries_category_id_unit_id_fkey"
      columns: ["category_id","unit_id"]
isOneToOne: false
      referencedRelation: "finance_categories"
      referencedColumns: ["id","unit_id"]
    },{
      foreignKeyName: "finance_entries_unit_id_fkey"
      columns: ["unit_id"]
isOneToOne: false
      referencedRelation: "units"
      referencedColumns: ["id"]
    }
                  ]
                },"followups": {
                  Row: {
                    "assigned_to": string,"client_unit_id": string,"created_at": string,"created_by": string | null,"done_at": string | null,"done_by": string | null,"due_at": string,"id": string,"kind": string,"outcome": string | null,"reason": string,"status": string,"unit_id": string,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "assigned_to": string,"client_unit_id": string,"created_at"?: string,"created_by"?: string | null,"done_at"?: string | null,"done_by"?: string | null,"due_at": string,"id"?: string,"kind": string,"outcome"?: string | null,"reason": string,"status"?: string,"unit_id": string,"updated_at"?: string
                  }
                  Update: {
                    "assigned_to"?: string,"client_unit_id"?: string,"created_at"?: string,"created_by"?: string | null,"done_at"?: string | null,"done_by"?: string | null,"due_at"?: string,"id"?: string,"kind"?: string,"outcome"?: string | null,"reason"?: string,"status"?: string,"unit_id"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "followups_assigned_to_fkey"
      columns: ["assigned_to"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "followups_client_unit_id_unit_id_fkey"
      columns: ["client_unit_id","unit_id"]
isOneToOne: false
      referencedRelation: "client_units"
      referencedColumns: ["id","unit_id"]
    },{
      foreignKeyName: "followups_unit_id_fkey"
      columns: ["unit_id"]
isOneToOne: false
      referencedRelation: "units"
      referencedColumns: ["id"]
    }
                  ]
                },"import_batches": {
                  Row: {
                    "confirmed_at": string | null,"confirmed_by": string | null,"created_at": string,"created_by": string | null,"file_name": string,"file_sha256": string,"id": string,"mapping_id": string,"row_count": number,"status": string,"summary": Json | null,"unit_id": string,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "confirmed_at"?: string | null,"confirmed_by"?: string | null,"created_at"?: string,"created_by"?: string | null,"file_name": string,"file_sha256": string,"id"?: string,"mapping_id": string,"row_count": number,"status"?: string,"summary"?: Json | null,"unit_id": string,"updated_at"?: string
                  }
                  Update: {
                    "confirmed_at"?: string | null,"confirmed_by"?: string | null,"created_at"?: string,"created_by"?: string | null,"file_name"?: string,"file_sha256"?: string,"id"?: string,"mapping_id"?: string,"row_count"?: number,"status"?: string,"summary"?: Json | null,"unit_id"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "import_batches_mapping_id_fkey"
      columns: ["mapping_id"]
isOneToOne: false
      referencedRelation: "import_mappings"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "import_batches_unit_id_fkey"
      columns: ["unit_id"]
isOneToOne: false
      referencedRelation: "units"
      referencedColumns: ["id"]
    }
                  ]
                },"import_mappings": {
                  Row: {
                    "approved_at": string | null,"approved_by": string | null,"columns": NonNullable<Json>,"created_at": string,"created_by": string | null,"date_format": string,"entity": string,"id": string,"last_edited_by": string | null,"name": string,"source_headers": (string)[],"status": string,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "approved_at"?: string | null,"approved_by"?: string | null,"columns": NonNullable<Json>,"created_at"?: string,"created_by"?: string | null,"date_format"?: string,"entity"?: string,"id"?: string,"last_edited_by"?: string | null,"name": string,"source_headers"?: (string)[],"status"?: string,"updated_at"?: string
                  }
                  Update: {
                    "approved_at"?: string | null,"approved_by"?: string | null,"columns"?: NonNullable<Json>,"created_at"?: string,"created_by"?: string | null,"date_format"?: string,"entity"?: string,"id"?: string,"last_edited_by"?: string | null,"name"?: string,"source_headers"?: (string)[],"status"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    
                  ]
                },"import_rows": {
                  Row: {
                    "batch_id": string,"birth_date": string | null,"classification": string,"created_at": string,"decided_by": string | null,"decision": string | null,"email": string | null,"external_ref": string | null,"full_name": string | null,"id": string,"issues": (string)[],"match_client_unit_id": string | null,"match_hint": string | null,"match_identity_id": string | null,"notes": string | null,"phone": string | null,"phone_raw": string | null,"result_client_unit_id": string | null,"row_number": number,"unit_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "batch_id": string,"birth_date"?: string | null,"classification": string,"created_at"?: string,"decided_by"?: string | null,"decision"?: string | null,"email"?: string | null,"external_ref"?: string | null,"full_name"?: string | null,"id"?: string,"issues"?: (string)[],"match_client_unit_id"?: string | null,"match_hint"?: string | null,"match_identity_id"?: string | null,"notes"?: string | null,"phone"?: string | null,"phone_raw"?: string | null,"result_client_unit_id"?: string | null,"row_number": number,"unit_id": string
                  }
                  Update: {
                    "batch_id"?: string,"birth_date"?: string | null,"classification"?: string,"created_at"?: string,"decided_by"?: string | null,"decision"?: string | null,"email"?: string | null,"external_ref"?: string | null,"full_name"?: string | null,"id"?: string,"issues"?: (string)[],"match_client_unit_id"?: string | null,"match_hint"?: string | null,"match_identity_id"?: string | null,"notes"?: string | null,"phone"?: string | null,"phone_raw"?: string | null,"result_client_unit_id"?: string | null,"row_number"?: number,"unit_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "import_rows_batch_id_unit_id_fkey"
      columns: ["batch_id","unit_id"]
isOneToOne: false
      referencedRelation: "import_batches"
      referencedColumns: ["id","unit_id"]
    },{
      foreignKeyName: "import_rows_match_client_unit_id_fkey"
      columns: ["match_client_unit_id"]
isOneToOne: false
      referencedRelation: "client_units"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "import_rows_match_identity_id_fkey"
      columns: ["match_identity_id"]
isOneToOne: false
      referencedRelation: "client_identities"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "import_rows_result_client_unit_id_fkey"
      columns: ["result_client_unit_id"]
isOneToOne: false
      referencedRelation: "client_units"
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
                },"message_templates": {
                  Row: {
                    "active": boolean,"body": string,"created_at": string,"created_by": string | null,"id": string,"language": string,"name": string,"provider_status": string,"purpose": string,"unit_id": string,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "active"?: boolean,"body": string,"created_at"?: string,"created_by"?: string | null,"id"?: string,"language"?: string,"name": string,"provider_status"?: string,"purpose": string,"unit_id": string,"updated_at"?: string
                  }
                  Update: {
                    "active"?: boolean,"body"?: string,"created_at"?: string,"created_by"?: string | null,"id"?: string,"language"?: string,"name"?: string,"provider_status"?: string,"purpose"?: string,"unit_id"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "message_templates_unit_id_fkey"
      columns: ["unit_id"]
isOneToOne: false
      referencedRelation: "units"
      referencedColumns: ["id"]
    }
                  ]
                },"messages": {
                  Row: {
                    "ai_generated": boolean,"body": string | null,"conversation_id": string,"created_at": string,"created_by": string | null,"direction": string,"error": string | null,"id": string,"kind": string,"provider_message_id": string | null,"sent_by": string | null,"status": string,"template_id": string | null,"unit_id": string,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "ai_generated"?: boolean,"body"?: string | null,"conversation_id": string,"created_at"?: string,"created_by"?: string | null,"direction": string,"error"?: string | null,"id"?: string,"kind"?: string,"provider_message_id"?: string | null,"sent_by"?: string | null,"status"?: string,"template_id"?: string | null,"unit_id": string,"updated_at"?: string
                  }
                  Update: {
                    "ai_generated"?: boolean,"body"?: string | null,"conversation_id"?: string,"created_at"?: string,"created_by"?: string | null,"direction"?: string,"error"?: string | null,"id"?: string,"kind"?: string,"provider_message_id"?: string | null,"sent_by"?: string | null,"status"?: string,"template_id"?: string | null,"unit_id"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "messages_conversation_id_unit_id_fkey"
      columns: ["conversation_id","unit_id"]
isOneToOne: false
      referencedRelation: "conversations"
      referencedColumns: ["id","unit_id"]
    },{
      foreignKeyName: "messages_template_id_unit_id_fkey"
      columns: ["template_id","unit_id"]
isOneToOne: false
      referencedRelation: "message_templates"
      referencedColumns: ["id","unit_id"]
    }
                  ]
                },"messaging_channels": {
                  Row: {
                    "activated_at": string | null,"activated_by": string | null,"ai_enabled": boolean,"ai_enabled_at": string | null,"ai_enabled_by": string | null,"consent_text": string | null,"created_at": string,"created_by": string | null,"credentials_verified_at": string | null,"display_phone": string | null,"id": string,"phone_number_id": string | null,"provider": string,"status": string,"status_reason": string | null,"test_message_at": string | null,"unit_id": string,"updated_at": string,"waba_id": string | null,"webhook_verified_at": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "activated_at"?: string | null,"activated_by"?: string | null,"ai_enabled"?: boolean,"ai_enabled_at"?: string | null,"ai_enabled_by"?: string | null,"consent_text"?: string | null,"created_at"?: string,"created_by"?: string | null,"credentials_verified_at"?: string | null,"display_phone"?: string | null,"id"?: string,"phone_number_id"?: string | null,"provider"?: string,"status"?: string,"status_reason"?: string | null,"test_message_at"?: string | null,"unit_id": string,"updated_at"?: string,"waba_id"?: string | null,"webhook_verified_at"?: string | null
                  }
                  Update: {
                    "activated_at"?: string | null,"activated_by"?: string | null,"ai_enabled"?: boolean,"ai_enabled_at"?: string | null,"ai_enabled_by"?: string | null,"consent_text"?: string | null,"created_at"?: string,"created_by"?: string | null,"credentials_verified_at"?: string | null,"display_phone"?: string | null,"id"?: string,"phone_number_id"?: string | null,"provider"?: string,"status"?: string,"status_reason"?: string | null,"test_message_at"?: string | null,"unit_id"?: string,"updated_at"?: string,"waba_id"?: string | null,"webhook_verified_at"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "messaging_channels_unit_id_fkey"
      columns: ["unit_id"]
isOneToOne: true
      referencedRelation: "units"
      referencedColumns: ["id"]
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
                },"products": {
                  Row: {
                    "active": boolean,"cost_cents": number | null,"created_at": string,"created_by": string | null,"id": string,"min_quantity": number,"name": string,"sale_price_cents": number | null,"sku": string | null,"unit_id": string,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "active"?: boolean,"cost_cents"?: number | null,"created_at"?: string,"created_by"?: string | null,"id"?: string,"min_quantity"?: number,"name": string,"sale_price_cents"?: number | null,"sku"?: string | null,"unit_id": string,"updated_at"?: string
                  }
                  Update: {
                    "active"?: boolean,"cost_cents"?: number | null,"created_at"?: string,"created_by"?: string | null,"id"?: string,"min_quantity"?: number,"name"?: string,"sale_price_cents"?: number | null,"sku"?: string | null,"unit_id"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "products_unit_id_fkey"
      columns: ["unit_id"]
isOneToOne: false
      referencedRelation: "units"
      referencedColumns: ["id"]
    }
                  ]
                },"professionals": {
                  Row: {
                    "active": boolean,"created_at": string,"created_by": string | null,"display_name": string,"id": string,"specialty": string | null,"unit_id": string,"updated_at": string,"user_id": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "active"?: boolean,"created_at"?: string,"created_by"?: string | null,"display_name": string,"id"?: string,"specialty"?: string | null,"unit_id": string,"updated_at"?: string,"user_id"?: string | null
                  }
                  Update: {
                    "active"?: boolean,"created_at"?: string,"created_by"?: string | null,"display_name"?: string,"id"?: string,"specialty"?: string | null,"unit_id"?: string,"updated_at"?: string,"user_id"?: string | null
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
                },"sale_items": {
                  Row: {
                    "created_at": string,"created_by": string | null,"description": string,"discount_cents": number,"id": string,"kind": string,"product_id": string | null,"professional_id": string | null,"quantity": number,"sale_id": string,"service_id": string | null,"total_cents": number | null,"unit_id": string,"unit_price_cents": number,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"created_by"?: string | null,"description": string,"discount_cents"?: number,"id"?: string,"kind": string,"product_id"?: string | null,"professional_id"?: string | null,"quantity"?: number,"sale_id": string,"service_id"?: string | null,"total_cents"?: never,"unit_id": string,"unit_price_cents": number,"updated_at"?: string
                  }
                  Update: {
                    "created_at"?: string,"created_by"?: string | null,"description"?: string,"discount_cents"?: number,"id"?: string,"kind"?: string,"product_id"?: string | null,"professional_id"?: string | null,"quantity"?: number,"sale_id"?: string,"service_id"?: string | null,"total_cents"?: never,"unit_id"?: string,"unit_price_cents"?: number,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "sale_items_product_id_unit_id_fkey"
      columns: ["product_id","unit_id"]
isOneToOne: false
      referencedRelation: "product_stock"
      referencedColumns: ["id","unit_id"]
    },{
      foreignKeyName: "sale_items_product_id_unit_id_fkey"
      columns: ["product_id","unit_id"]
isOneToOne: false
      referencedRelation: "products"
      referencedColumns: ["id","unit_id"]
    },{
      foreignKeyName: "sale_items_professional_id_unit_id_fkey"
      columns: ["professional_id","unit_id"]
isOneToOne: false
      referencedRelation: "professionals"
      referencedColumns: ["id","unit_id"]
    },{
      foreignKeyName: "sale_items_sale_id_unit_id_fkey"
      columns: ["sale_id","unit_id"]
isOneToOne: false
      referencedRelation: "sales"
      referencedColumns: ["id","unit_id"]
    },{
      foreignKeyName: "sale_items_service_id_unit_id_fkey"
      columns: ["service_id","unit_id"]
isOneToOne: false
      referencedRelation: "services"
      referencedColumns: ["id","unit_id"]
    },{
      foreignKeyName: "sale_items_unit_id_fkey"
      columns: ["unit_id"]
isOneToOne: false
      referencedRelation: "units"
      referencedColumns: ["id"]
    }
                  ]
                },"sale_payments": {
                  Row: {
                    "amount_cents": number,"created_at": string,"created_by": string | null,"id": string,"installments": number,"method": string,"sale_id": string,"unit_id": string,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "amount_cents": number,"created_at"?: string,"created_by"?: string | null,"id"?: string,"installments"?: number,"method": string,"sale_id": string,"unit_id": string,"updated_at"?: string
                  }
                  Update: {
                    "amount_cents"?: number,"created_at"?: string,"created_by"?: string | null,"id"?: string,"installments"?: number,"method"?: string,"sale_id"?: string,"unit_id"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "sale_payments_sale_id_unit_id_fkey"
      columns: ["sale_id","unit_id"]
isOneToOne: false
      referencedRelation: "sales"
      referencedColumns: ["id","unit_id"]
    },{
      foreignKeyName: "sale_payments_unit_id_fkey"
      columns: ["unit_id"]
isOneToOne: false
      referencedRelation: "units"
      referencedColumns: ["id"]
    }
                  ]
                },"sales": {
                  Row: {
                    "appointment_id": string | null,"cancel_reason": string | null,"cancelled_at": string | null,"cancelled_by": string | null,"client_unit_id": string | null,"created_at": string,"created_by": string | null,"discount_cents": number,"finalized_at": string | null,"finalized_by": string | null,"id": string,"notes": string | null,"number": number,"opened_at": string,"opened_by": string,"sold_by": string | null,"status": Database["public"]['Enums']["sale_status"],"subtotal_cents": number,"total_cents": number,"unit_id": string,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "appointment_id"?: string | null,"cancel_reason"?: string | null,"cancelled_at"?: string | null,"cancelled_by"?: string | null,"client_unit_id"?: string | null,"created_at"?: string,"created_by"?: string | null,"discount_cents"?: number,"finalized_at"?: string | null,"finalized_by"?: string | null,"id"?: string,"notes"?: string | null,"number": number,"opened_at"?: string,"opened_by": string,"sold_by"?: string | null,"status"?: Database["public"]['Enums']["sale_status"],"subtotal_cents"?: number,"total_cents"?: number,"unit_id": string,"updated_at"?: string
                  }
                  Update: {
                    "appointment_id"?: string | null,"cancel_reason"?: string | null,"cancelled_at"?: string | null,"cancelled_by"?: string | null,"client_unit_id"?: string | null,"created_at"?: string,"created_by"?: string | null,"discount_cents"?: number,"finalized_at"?: string | null,"finalized_by"?: string | null,"id"?: string,"notes"?: string | null,"number"?: number,"opened_at"?: string,"opened_by"?: string,"sold_by"?: string | null,"status"?: Database["public"]['Enums']["sale_status"],"subtotal_cents"?: number,"total_cents"?: number,"unit_id"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "sales_appointment_id_unit_id_fkey"
      columns: ["appointment_id","unit_id"]
isOneToOne: false
      referencedRelation: "appointments"
      referencedColumns: ["id","unit_id"]
    },{
      foreignKeyName: "sales_client_unit_id_unit_id_fkey"
      columns: ["client_unit_id","unit_id"]
isOneToOne: false
      referencedRelation: "client_units"
      referencedColumns: ["id","unit_id"]
    },{
      foreignKeyName: "sales_sold_by_fkey"
      columns: ["sold_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "sales_unit_id_fkey"
      columns: ["unit_id"]
isOneToOne: false
      referencedRelation: "units"
      referencedColumns: ["id"]
    }
                  ]
                },"services": {
                  Row: {
                    "active": boolean,"category": string | null,"created_at": string,"created_by": string | null,"duration_minutes": number,"id": string,"name": string,"price_cents": number | null,"unit_id": string,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "active"?: boolean,"category"?: string | null,"created_at"?: string,"created_by"?: string | null,"duration_minutes": number,"id"?: string,"name": string,"price_cents"?: number | null,"unit_id": string,"updated_at"?: string
                  }
                  Update: {
                    "active"?: boolean,"category"?: string | null,"created_at"?: string,"created_by"?: string | null,"duration_minutes"?: number,"id"?: string,"name"?: string,"price_cents"?: number | null,"unit_id"?: string,"updated_at"?: string
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
                },"stock_movements": {
                  Row: {
                    "created_at": string,"created_by": string | null,"id": string,"kind": string,"product_id": string,"quantity_delta": number,"reason": string | null,"sale_id": string | null,"unit_cost_cents": number | null,"unit_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"created_by"?: string | null,"id"?: string,"kind": string,"product_id": string,"quantity_delta": number,"reason"?: string | null,"sale_id"?: string | null,"unit_cost_cents"?: number | null,"unit_id": string
                  }
                  Update: {
                    "created_at"?: string,"created_by"?: string | null,"id"?: string,"kind"?: string,"product_id"?: string,"quantity_delta"?: number,"reason"?: string | null,"sale_id"?: string | null,"unit_cost_cents"?: number | null,"unit_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "stock_movements_product_id_unit_id_fkey"
      columns: ["product_id","unit_id"]
isOneToOne: false
      referencedRelation: "product_stock"
      referencedColumns: ["id","unit_id"]
    },{
      foreignKeyName: "stock_movements_product_id_unit_id_fkey"
      columns: ["product_id","unit_id"]
isOneToOne: false
      referencedRelation: "products"
      referencedColumns: ["id","unit_id"]
    },{
      foreignKeyName: "stock_movements_unit_id_fkey"
      columns: ["unit_id"]
isOneToOne: false
      referencedRelation: "units"
      referencedColumns: ["id"]
    }
                  ]
                },"survey_responses": {
                  Row: {
                    "appointment_id": string | null,"channel": string,"client_unit_id": string,"comment": string | null,"created_at": string,"created_by": string | null,"id": string,"score": number,"survey_id": string,"unit_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "appointment_id"?: string | null,"channel"?: string,"client_unit_id": string,"comment"?: string | null,"created_at"?: string,"created_by"?: string | null,"id"?: string,"score": number,"survey_id": string,"unit_id": string
                  }
                  Update: {
                    "appointment_id"?: string | null,"channel"?: string,"client_unit_id"?: string,"comment"?: string | null,"created_at"?: string,"created_by"?: string | null,"id"?: string,"score"?: number,"survey_id"?: string,"unit_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "survey_responses_appointment_id_unit_id_fkey"
      columns: ["appointment_id","unit_id"]
isOneToOne: false
      referencedRelation: "appointments"
      referencedColumns: ["id","unit_id"]
    },{
      foreignKeyName: "survey_responses_client_unit_id_unit_id_fkey"
      columns: ["client_unit_id","unit_id"]
isOneToOne: false
      referencedRelation: "client_units"
      referencedColumns: ["id","unit_id"]
    },{
      foreignKeyName: "survey_responses_survey_id_unit_id_fkey"
      columns: ["survey_id","unit_id"]
isOneToOne: false
      referencedRelation: "surveys"
      referencedColumns: ["id","unit_id"]
    }
                  ]
                },"surveys": {
                  Row: {
                    "active": boolean,"created_at": string,"created_by": string | null,"id": string,"name": string,"question": string,"unit_id": string,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "active"?: boolean,"created_at"?: string,"created_by"?: string | null,"id"?: string,"name": string,"question"?: string,"unit_id": string,"updated_at"?: string
                  }
                  Update: {
                    "active"?: boolean,"created_at"?: string,"created_by"?: string | null,"id"?: string,"name"?: string,"question"?: string,"unit_id"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "surveys_unit_id_fkey"
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
                },"unit_sequences": {
                  Row: {
                    "last_value": number,"name": string,"unit_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "last_value"?: number,"name": string,"unit_id": string
                  }
                  Update: {
                    "last_value"?: number,"name"?: string,"unit_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "unit_sequences_unit_id_fkey"
      columns: ["unit_id"]
isOneToOne: false
      referencedRelation: "units"
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
            "product_stock": {
                  Row: {
                    "active": boolean,"cost_cents": number | null,"id": string,"min_quantity": number,"name": string,"quantity": number | null,"sale_price_cents": number | null,"sku": string | null,"unit_id": string
                  }
                  ComputedFields: never
                  Insert: {
                           "active"?: boolean | null,"cost_cents"?: number | null,"id"?: string | null,"min_quantity"?: number | null,"name"?: string | null,"quantity"?: never,"sale_price_cents"?: number | null,"sku"?: string | null,"unit_id"?: string | null
                         }
                        Update: {
                           "active"?: boolean | null,"cost_cents"?: number | null,"id"?: string | null,"min_quantity"?: number | null,"name"?: string | null,"quantity"?: never,"sale_price_cents"?: number | null,"sku"?: string | null,"unit_id"?: string | null
                         }
                        Relationships: [
                    {
      foreignKeyName: "products_unit_id_fkey"
      columns: ["unit_id"]
isOneToOne: false
      referencedRelation: "units"
      referencedColumns: ["id"]
    }
                  ]
                }
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
"apply_sale_stock":
{ Args: { "p_sale_id": string,"p_sign": number }; Returns: undefined
                           },
"can_import_any_unit":
{ Args: Record<PropertyKey, never>; Returns: boolean
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
"can_update_identity":
{ Args: { "p_identity_id": string }; Returns: boolean
                           },
"can_view_conversation":
{ Args: { "p_conversation_id": string }; Returns: boolean
                           },
"can_view_identity":
{ Args: { "p_identity_id": string }; Returns: boolean
                           },
"can_view_sale":
{ Args: { "p_sale_id": string }; Returns: boolean
                           },
"client_duplicate_candidates":
{ Args: { "p_unit_id": string }; Returns: {
              "client_a": string,"client_b": string,"email_a": string,"email_b": string,"name_a": string,"name_b": string,"phone_a": string,"phone_b": string,"reason": string
            }[]
                           },
"commission_base_cents":
{ Args: { "p": Omit<Database["public"]['Tables']["commission_plans"]['Row'], Database["public"]['Tables']["commission_plans"]['ComputedFields']>,"p_from": string,"p_to": string }; Returns: number
                           },
"commission_calculate":
{ Args: { "p_manual_revenue_cents"?: number,"p_period_start": string,"p_plan_id": string }; Returns: string
                           },
"commission_create_plan_from_preset":
{ Args: { "p_beneficiary_id": string,"p_name": string,"p_preset_key": string,"p_unit_id": string }; Returns: string
                           },
"commission_plan_beneficiary":
{ Args: { "p_plan_id": string }; Returns: string
                           },
"commission_plan_pending":
{ Args: { "p": Omit<Database["public"]['Tables']["commission_plans"]['Row'], Database["public"]['Tables']["commission_plans"]['ComputedFields']> }; Returns: (string)[]
                           },
"commission_plan_status":
{ Args: { "p_plan_id": string }; Returns: string
                           },
"commission_plan_unit":
{ Args: { "p_plan_id": string }; Returns: string
                           },
"commission_set_status":
{ Args: { "p_reason"?: string,"p_statement_id": string,"p_status": string }; Returns: undefined
                           },
"consent_status":
{ Args: { "p_client_unit_id": string,"p_purpose": string }; Returns: string
                           },
"create_client":
{ Args: { "p_birth_date"?: string,"p_email"?: string,"p_full_name": string,"p_identity_id"?: string,"p_phone"?: string,"p_service_notes"?: string,"p_unit_id": string }; Returns: string
                           },
"current_aal":
{ Args: Record<PropertyKey, never>; Returns: string
                           },
"current_actor_id":
{ Args: Record<PropertyKey, never>; Returns: string
                           },
"dismiss_client_duplicate":
{ Args: { "p_a": string,"p_b": string,"p_reason": string,"p_unit_id": string }; Returns: undefined
                           },
"finance_cash_flow":
{ Args: { "p_from": string,"p_include_sales": boolean,"p_to": string,"p_unit_id": string }; Returns: Json
                           },
"finance_category_kind":
{ Args: { "p_category_id": string }; Returns: string
                           },
"finance_create_from_line":
{ Args: { "p_category_id": string,"p_description": string,"p_line_id": string }; Returns: string
                           },
"finance_ignore_line":
{ Args: { "p_line_id": string,"p_reason": string }; Returns: undefined
                           },
"finance_import_statement":
{ Args: { "p_account_id": string,"p_file_name": string,"p_file_sha256": string,"p_lines": Json,"p_unit_id": string }; Returns: string
                           },
"finance_match_suggestions":
{ Args: { "p_line_id": string }; Returns: {
              "days_apart": number,"description": string,"due_date": string,"entry_id": string,"paid_at": string,"status": string
            }[]
                           },
"finance_reconcile":
{ Args: { "p_entry_id": string,"p_line_id": string }; Returns: undefined
                           },
"finance_unreconcile":
{ Args: { "p_line_id": string }; Returns: undefined
                           },
"find_client_candidates":
{ Args: { "p_email": string,"p_full_name": string,"p_phone": string,"p_unit_id": string }; Returns: {
              "archived": boolean,"client_unit_id": string,"display_name": string,"identity_id": string,"linked_here": boolean,"match": string,"phone_hint": string
            }[]
                           },
"get_my_agenda":
{ Args: { "p_from": string,"p_to": string }; Returns: {
              "appointment_id": string,"client_name": string,"ends_at": string,"notes": string,"professional_id": string,"service_name": string,"service_notes": string,"starts_at": string,"status": Database["public"]['Enums']["appointment_status"],"unit_id": string,"unit_name": string
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
"import_approve_mapping":
{ Args: { "p_id": string }; Returns: undefined
                           },
"import_batch_summary":
{ Args: { "p_batch_id": string }; Returns: Json
                           },
"import_commit_batch":
{ Args: { "p_batch_id": string }; Returns: Json
                           },
"import_create_batch":
{ Args: { "p_file_name": string,"p_file_sha256": string,"p_mapping_id": string,"p_row_count": number,"p_unit_id": string }; Returns: string
                           },
"import_decide_row":
{ Args: { "p_decision": string,"p_row_id": string }; Returns: undefined
                           },
"import_discard_batch":
{ Args: { "p_batch_id": string }; Returns: undefined
                           },
"import_purge_staging":
{ Args: { "p_days"?: number }; Returns: number
                           },
"import_save_mapping":
{ Args: { "p_columns": Json,"p_date_format": string,"p_id": string,"p_name": string,"p_source_headers": (string)[] }; Returns: string
                           },
"import_stage_rows":
{ Args: { "p_batch_id": string,"p_rows": Json }; Returns: number
                           },
"inactive_clients":
{ Args: { "p_days": number,"p_unit_id": string }; Returns: {
              "client_name": string,"client_unit_id": string,"consent_marketing": string,"last_visit": string,"open_followups": number
            }[]
                           },
"is_active_unit_member":
{ Args: { "p_unit_id": string,"p_user_id": string }; Returns: boolean
                           },
"is_entry_reconciled":
{ Args: { "p_entry_id": string }; Returns: boolean
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
"local_today":
{ Args: Record<PropertyKey, never>; Returns: string
                           },
"mask_name":
{ Args: { "p_name": string }; Returns: string
                           },
"merge_clients":
{ Args: { "p_keep": string,"p_merge": string,"p_unit_id": string }; Returns: string
                           },
"messaging_mark_channel":
{ Args: { "p_field": string,"p_unit_code": string }; Returns: undefined
                           },
"messaging_mark_result":
{ Args: { "p_error": string,"p_message_id": string,"p_provider_id": string }; Returns: undefined
                           },
"messaging_prepare_send":
{ Args: { "p_body": string,"p_conversation_id": string,"p_draft_id"?: string,"p_template_id": string }; Returns: Json
                           },
"messaging_start_conversation":
{ Args: { "p_client_unit_id": string }; Returns: string
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
"normalize_name":
{ Args: { "p_name": string }; Returns: string
                           },
"normalize_phone":
{ Args: { "p_phone": string }; Returns: string
                           },
"operational_dashboard":
{ Args: { "p_date"?: string,"p_unit_id": string }; Returns: Json
                           },
"parse_import_date":
{ Args: { "p_format": string,"p_value": string }; Returns: string
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
"recalc_sale_totals":
{ Args: { "p_sale_id": string }; Returns: undefined
                           },
"report_appointments":
{ Args: { "p_from": string,"p_to": string,"p_unit_id": string }; Returns: Json
                           },
"report_sales":
{ Args: { "p_from": string,"p_to": string,"p_unit_id": string }; Returns: Json
                           },
"sale_items_count":
{ Args: { "p_sale_id": string }; Returns: number
                           },
"sale_payments_total":
{ Args: { "p_sale_id": string }; Returns: number
                           },
"sale_status_of":
{ Args: { "p_sale_id": string }; Returns: Database["public"]['Enums']["sale_status"]
                           },
"sdr_context":
{ Args: { "p_conversation_id": string }; Returns: Json
                           },
"sdr_save_draft":
{ Args: { "p_actor": string,"p_body": string,"p_conversation_id": string }; Returns: string
                           },
"shares_unit_with":
{ Args: { "p_user_id": string }; Returns: boolean
                           },
"survey_candidates":
{ Args: { "p_days"?: number,"p_survey_id": string }; Returns: {
              "appointment_id": string,"client_name": string,"client_unit_id": string,"consent_atendimento": string,"service_name": string,"starts_at": string
            }[]
                           },
"survey_results":
{ Args: { "p_from": string,"p_survey_id": string,"p_to": string }; Returns: Json
                           },
"tg_templates_guard_common":
{ Args: { "p_profile_id": string }; Returns: undefined
                           },
"unit_people":
{ Args: { "p_unit_id": string }; Returns: {
              "full_name": string,"job_title": string,"user_id": string
            }[]
                           },
"whatsapp_ingest":
{ Args: { "p_payload": Json }; Returns: Json
                           }
          }
          Enums: {
            "access_scope": "own"|"unit","appointment_status": "agendado"|"confirmado"|"concluido"|"cancelado"|"nao_compareceu","permission_effect": "grant"|"revoke","sale_status": "aberta"|"finalizada"|"cancelada"
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
            "access_scope": ["own", "unit"],"appointment_status": ["agendado", "confirmado", "concluido", "cancelado", "nao_compareceu"],"permission_effect": ["grant", "revoke"],"sale_status": ["aberta", "finalizada", "cancelada"]
          }
        }
} as const
