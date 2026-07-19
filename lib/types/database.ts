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
  graphql_public: {
    Tables: {
      [_ in never]: never
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      graphql: {
        Args: {
          extensions?: Json
          operationName?: string
          query?: string
          variables?: Json
        }
        Returns: Json
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
  public: {
    Tables: {
      accounts: {
        Row: {
          created_at: string
          default_home: string
          email: string
          id: string
          name: string
          stripe_customer_id: string | null
          subscription_status: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          default_home?: string
          email: string
          id: string
          name: string
          stripe_customer_id?: string | null
          subscription_status?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          default_home?: string
          email?: string
          id?: string
          name?: string
          stripe_customer_id?: string | null
          subscription_status?: string
          updated_at?: string
        }
        Relationships: []
      }
      ai_call_log: {
        Row: {
          cache_read_tokens: number
          cache_write_tokens: number
          created_at: string
          duration_ms: number
          id: string
          input_tokens: number
          model: string
          output_tokens: number
          tour_id: string
          trigger_case: string
        }
        Insert: {
          cache_read_tokens?: number
          cache_write_tokens?: number
          created_at?: string
          duration_ms?: number
          id?: string
          input_tokens?: number
          model: string
          output_tokens?: number
          tour_id: string
          trigger_case: string
        }
        Update: {
          cache_read_tokens?: number
          cache_write_tokens?: number
          created_at?: string
          duration_ms?: number
          id?: string
          input_tokens?: number
          model?: string
          output_tokens?: number
          tour_id?: string
          trigger_case?: string
        }
        Relationships: [
          {
            foreignKeyName: "ai_call_log_tour_id_fkey"
            columns: ["tour_id"]
            isOneToOne: false
            referencedRelation: "tours"
            referencedColumns: ["id"]
          },
        ]
      }
      artists: {
        Row: {
          account_id: string
          created_at: string
          id: string
          name: string
          slug: string | null
          updated_at: string
        }
        Insert: {
          account_id: string
          created_at?: string
          id?: string
          name: string
          slug?: string | null
          updated_at?: string
        }
        Update: {
          account_id?: string
          created_at?: string
          id?: string
          name?: string
          slug?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      attention_items: {
        Row: {
          created_at: string
          detail: string | null
          id: string
          kind: string
          related_id: string | null
          related_table: string | null
          resolved_at: string | null
          severity: number
          title: string
          tour_id: string
        }
        Insert: {
          created_at?: string
          detail?: string | null
          id?: string
          kind: string
          related_id?: string | null
          related_table?: string | null
          resolved_at?: string | null
          severity?: number
          title: string
          tour_id: string
        }
        Update: {
          created_at?: string
          detail?: string | null
          id?: string
          kind?: string
          related_id?: string | null
          related_table?: string | null
          resolved_at?: string | null
          severity?: number
          title?: string
          tour_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "attention_items_tour_id_fkey"
            columns: ["tour_id"]
            isOneToOne: false
            referencedRelation: "tours"
            referencedColumns: ["id"]
          },
        ]
      }
      broadcast_log: {
        Row: {
          change_type: string
          created_at: string
          delivered_at: string | null
          id: string
          message: string
          person_id: string
          read_at: string | null
          sent_at: string | null
          tour_id: string
          wamid: string | null
        }
        Insert: {
          change_type: string
          created_at?: string
          delivered_at?: string | null
          id?: string
          message: string
          person_id: string
          read_at?: string | null
          sent_at?: string | null
          tour_id: string
          wamid?: string | null
        }
        Update: {
          change_type?: string
          created_at?: string
          delivered_at?: string | null
          id?: string
          message?: string
          person_id?: string
          read_at?: string | null
          sent_at?: string | null
          tour_id?: string
          wamid?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "broadcast_log_person_id_fkey"
            columns: ["person_id"]
            isOneToOne: false
            referencedRelation: "people"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "broadcast_log_tour_id_fkey"
            columns: ["tour_id"]
            isOneToOne: false
            referencedRelation: "tours"
            referencedColumns: ["id"]
          },
        ]
      }
      contacts: {
        Row: {
          account_id: string
          allergies: string | null
          contact_email: string | null
          contact_phone: string | null
          created_at: string
          date_of_birth: string | null
          default_daily_wage_rate: number | null
          default_per_diem_currency: string | null
          default_per_diem_rate: number | null
          default_person_type: string
          default_role: string | null
          default_wage_currency: string | null
          dietary: string | null
          email_enabled: boolean
          emergency_contact_name: string | null
          emergency_contact_phone: string | null
          home_city: string | null
          id: string
          name: string
          notes: string | null
          operational_channel: string | null
          passport_country: string | null
          passport_expiry: string | null
          passport_first_names: string | null
          passport_number: string | null
          passport_surname: string | null
          photo_url: string | null
          sms_number: string | null
          telegram_chat_id: number | null
          telegram_username: string | null
          tshirt_size: string | null
          updated_at: string
          whatsapp_number: string | null
        }
        Insert: {
          account_id: string
          allergies?: string | null
          contact_email?: string | null
          contact_phone?: string | null
          created_at?: string
          date_of_birth?: string | null
          default_daily_wage_rate?: number | null
          default_per_diem_currency?: string | null
          default_per_diem_rate?: number | null
          default_person_type?: string
          default_role?: string | null
          default_wage_currency?: string | null
          dietary?: string | null
          email_enabled?: boolean
          emergency_contact_name?: string | null
          emergency_contact_phone?: string | null
          home_city?: string | null
          id?: string
          name: string
          notes?: string | null
          operational_channel?: string | null
          passport_country?: string | null
          passport_expiry?: string | null
          passport_first_names?: string | null
          passport_number?: string | null
          passport_surname?: string | null
          photo_url?: string | null
          sms_number?: string | null
          telegram_chat_id?: number | null
          telegram_username?: string | null
          tshirt_size?: string | null
          updated_at?: string
          whatsapp_number?: string | null
        }
        Update: {
          account_id?: string
          allergies?: string | null
          contact_email?: string | null
          contact_phone?: string | null
          created_at?: string
          date_of_birth?: string | null
          default_daily_wage_rate?: number | null
          default_per_diem_currency?: string | null
          default_per_diem_rate?: number | null
          default_person_type?: string
          default_role?: string | null
          default_wage_currency?: string | null
          dietary?: string | null
          email_enabled?: boolean
          emergency_contact_name?: string | null
          emergency_contact_phone?: string | null
          home_city?: string | null
          id?: string
          name?: string
          notes?: string | null
          operational_channel?: string | null
          passport_country?: string | null
          passport_expiry?: string | null
          passport_first_names?: string | null
          passport_number?: string | null
          passport_surname?: string | null
          photo_url?: string | null
          sms_number?: string | null
          telegram_chat_id?: number | null
          telegram_username?: string | null
          tshirt_size?: string | null
          updated_at?: string
          whatsapp_number?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "contacts_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      crew_detail: {
        Row: {
          created_at: string
          daily_wage_rate: number | null
          per_diem_currency: string | null
          per_diem_rate: number | null
          person_id: string
          tour_id: string
          updated_at: string
          wage_currency: string | null
        }
        Insert: {
          created_at?: string
          daily_wage_rate?: number | null
          per_diem_currency?: string | null
          per_diem_rate?: number | null
          person_id: string
          tour_id: string
          updated_at?: string
          wage_currency?: string | null
        }
        Update: {
          created_at?: string
          daily_wage_rate?: number | null
          per_diem_currency?: string | null
          per_diem_rate?: number | null
          person_id?: string
          tour_id?: string
          updated_at?: string
          wage_currency?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "crew_detail_person_id_fkey"
            columns: ["person_id"]
            isOneToOne: true
            referencedRelation: "people"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "crew_detail_tour_id_fkey"
            columns: ["tour_id"]
            isOneToOne: false
            referencedRelation: "tours"
            referencedColumns: ["id"]
          },
        ]
      }
      day_events: {
        Row: {
          created_at: string
          date: string
          ends_at: string | null
          id: string
          location: string | null
          notes: string | null
          show_id: string | null
          starts_at: string | null
          title: string
          tour_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          date: string
          ends_at?: string | null
          id?: string
          location?: string | null
          notes?: string | null
          show_id?: string | null
          starts_at?: string | null
          title: string
          tour_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          date?: string
          ends_at?: string | null
          id?: string
          location?: string | null
          notes?: string | null
          show_id?: string | null
          starts_at?: string | null
          title?: string
          tour_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "day_events_show_id_fkey"
            columns: ["show_id"]
            isOneToOne: false
            referencedRelation: "shows"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "day_events_tour_id_fkey"
            columns: ["tour_id"]
            isOneToOne: false
            referencedRelation: "tours"
            referencedColumns: ["id"]
          },
        ]
      }
      day_sheets: {
        Row: {
          catering_breakfast_end: string | null
          catering_breakfast_start: string | null
          catering_dinner_end: string | null
          catering_dinner_start: string | null
          catering_lunch_end: string | null
          catering_lunch_start: string | null
          catering_type: string
          changeover: string | null
          created_at: string
          curfew: string | null
          doors: string | null
          headliner_off: string | null
          headliner_on: string | null
          hotel_departure: string | null
          line_check: string | null
          load_in: string | null
          load_out: string | null
          lobby_call_at: string | null
          show_id: string
          soundcheck: string | null
          support_off: string | null
          support_on: string | null
          tour_id: string
          updated_at: string
          venue_access: string | null
          vip: string | null
        }
        Insert: {
          catering_breakfast_end?: string | null
          catering_breakfast_start?: string | null
          catering_dinner_end?: string | null
          catering_dinner_start?: string | null
          catering_lunch_end?: string | null
          catering_lunch_start?: string | null
          catering_type?: string
          changeover?: string | null
          created_at?: string
          curfew?: string | null
          doors?: string | null
          headliner_off?: string | null
          headliner_on?: string | null
          hotel_departure?: string | null
          line_check?: string | null
          load_in?: string | null
          load_out?: string | null
          lobby_call_at?: string | null
          show_id: string
          soundcheck?: string | null
          support_off?: string | null
          support_on?: string | null
          tour_id: string
          updated_at?: string
          venue_access?: string | null
          vip?: string | null
        }
        Update: {
          catering_breakfast_end?: string | null
          catering_breakfast_start?: string | null
          catering_dinner_end?: string | null
          catering_dinner_start?: string | null
          catering_lunch_end?: string | null
          catering_lunch_start?: string | null
          catering_type?: string
          changeover?: string | null
          created_at?: string
          curfew?: string | null
          doors?: string | null
          headliner_off?: string | null
          headliner_on?: string | null
          hotel_departure?: string | null
          line_check?: string | null
          load_in?: string | null
          load_out?: string | null
          lobby_call_at?: string | null
          show_id?: string
          soundcheck?: string | null
          support_off?: string | null
          support_on?: string | null
          tour_id?: string
          updated_at?: string
          venue_access?: string | null
          vip?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "day_sheets_show_id_fkey"
            columns: ["show_id"]
            isOneToOne: true
            referencedRelation: "shows"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "day_sheets_tour_id_fkey"
            columns: ["tour_id"]
            isOneToOne: false
            referencedRelation: "tours"
            referencedColumns: ["id"]
          },
        ]
      }
      document_shares: {
        Row: {
          acknowledged_at: string | null
          channel: string
          created_at: string
          document_id: string
          id: string
          opened_at: string | null
          recipient_person_id: string
          reminder_count: number
          sent_at: string | null
          share_token: string
          show_id: string | null
          tour_id: string
        }
        Insert: {
          acknowledged_at?: string | null
          channel: string
          created_at?: string
          document_id: string
          id?: string
          opened_at?: string | null
          recipient_person_id: string
          reminder_count?: number
          sent_at?: string | null
          share_token: string
          show_id?: string | null
          tour_id: string
        }
        Update: {
          acknowledged_at?: string | null
          channel?: string
          created_at?: string
          document_id?: string
          id?: string
          opened_at?: string | null
          recipient_person_id?: string
          reminder_count?: number
          sent_at?: string | null
          share_token?: string
          show_id?: string | null
          tour_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "document_shares_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "documents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "document_shares_recipient_person_id_fkey"
            columns: ["recipient_person_id"]
            isOneToOne: false
            referencedRelation: "people"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "document_shares_show_id_fkey"
            columns: ["show_id"]
            isOneToOne: false
            referencedRelation: "shows"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "document_shares_tour_id_fkey"
            columns: ["tour_id"]
            isOneToOne: false
            referencedRelation: "tours"
            referencedColumns: ["id"]
          },
        ]
      }
      documents: {
        Row: {
          created_at: string
          doc_type: string
          id: string
          is_current: boolean
          storage_path: string
          title: string
          tour_id: string
          updated_at: string
          version: number
        }
        Insert: {
          created_at?: string
          doc_type: string
          id?: string
          is_current?: boolean
          storage_path: string
          title: string
          tour_id: string
          updated_at?: string
          version?: number
        }
        Update: {
          created_at?: string
          doc_type?: string
          id?: string
          is_current?: boolean
          storage_path?: string
          title?: string
          tour_id?: string
          updated_at?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "documents_tour_id_fkey"
            columns: ["tour_id"]
            isOneToOne: false
            referencedRelation: "tours"
            referencedColumns: ["id"]
          },
        ]
      }
      forwarded_emails: {
        Row: {
          attachments_json: Json
          body_text: string | null
          created_at: string
          extraction_status: string
          from_address: string | null
          id: string
          proposed_rows: Json | null
          subject: string | null
          tour_id: string
        }
        Insert: {
          attachments_json?: Json
          body_text?: string | null
          created_at?: string
          extraction_status?: string
          from_address?: string | null
          id?: string
          proposed_rows?: Json | null
          subject?: string | null
          tour_id: string
        }
        Update: {
          attachments_json?: Json
          body_text?: string | null
          created_at?: string
          extraction_status?: string
          from_address?: string | null
          id?: string
          proposed_rows?: Json | null
          subject?: string | null
          tour_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "forwarded_emails_tour_id_fkey"
            columns: ["tour_id"]
            isOneToOne: false
            referencedRelation: "tours"
            referencedColumns: ["id"]
          },
        ]
      }
      hotel_stays: {
        Row: {
          address: string | null
          check_in_date: string | null
          check_in_time: string | null
          check_out_date: string | null
          check_out_time: string | null
          city: string | null
          confirmation_number: string | null
          created_at: string
          id: string
          incidentals_policy: string | null
          late_checkout: boolean | null
          name: string | null
          negotiated_rate: number | null
          parking_json: Json
          phone: string | null
          property_contact: string | null
          rate_currency: string | null
          room_block_size: number | null
          room_types_json: Json
          status: string
          tour_date_id: string | null
          tour_id: string
          updated_at: string
          wifi_network: string | null
          wifi_password: string | null
        }
        Insert: {
          address?: string | null
          check_in_date?: string | null
          check_in_time?: string | null
          check_out_date?: string | null
          check_out_time?: string | null
          city?: string | null
          confirmation_number?: string | null
          created_at?: string
          id?: string
          incidentals_policy?: string | null
          late_checkout?: boolean | null
          name?: string | null
          negotiated_rate?: number | null
          parking_json?: Json
          phone?: string | null
          property_contact?: string | null
          rate_currency?: string | null
          room_block_size?: number | null
          room_types_json?: Json
          status?: string
          tour_date_id?: string | null
          tour_id: string
          updated_at?: string
          wifi_network?: string | null
          wifi_password?: string | null
        }
        Update: {
          address?: string | null
          check_in_date?: string | null
          check_in_time?: string | null
          check_out_date?: string | null
          check_out_time?: string | null
          city?: string | null
          confirmation_number?: string | null
          created_at?: string
          id?: string
          incidentals_policy?: string | null
          late_checkout?: boolean | null
          name?: string | null
          negotiated_rate?: number | null
          parking_json?: Json
          phone?: string | null
          property_contact?: string | null
          rate_currency?: string | null
          room_block_size?: number | null
          room_types_json?: Json
          status?: string
          tour_date_id?: string | null
          tour_id?: string
          updated_at?: string
          wifi_network?: string | null
          wifi_password?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "hotel_stays_tour_date_id_fkey"
            columns: ["tour_date_id"]
            isOneToOne: false
            referencedRelation: "tour_dates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hotel_stays_tour_id_fkey"
            columns: ["tour_id"]
            isOneToOne: false
            referencedRelation: "tours"
            referencedColumns: ["id"]
          },
        ]
      }
      notification_log: {
        Row: {
          channel: string
          created_at: string
          dedup_dimension: string
          delivered_at: string | null
          error: string | null
          id: string
          notification_type: string
          person_id: string
          provider_message_id: string | null
          read_at: string | null
          sent_at: string | null
          status: string
          tour_id: string
          updated_at: string
        }
        Insert: {
          channel: string
          created_at?: string
          dedup_dimension: string
          delivered_at?: string | null
          error?: string | null
          id?: string
          notification_type: string
          person_id: string
          provider_message_id?: string | null
          read_at?: string | null
          sent_at?: string | null
          status?: string
          tour_id: string
          updated_at?: string
        }
        Update: {
          channel?: string
          created_at?: string
          dedup_dimension?: string
          delivered_at?: string | null
          error?: string | null
          id?: string
          notification_type?: string
          person_id?: string
          provider_message_id?: string | null
          read_at?: string | null
          sent_at?: string | null
          status?: string
          tour_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "notification_log_person_id_fkey"
            columns: ["person_id"]
            isOneToOne: false
            referencedRelation: "people"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notification_log_tour_id_fkey"
            columns: ["tour_id"]
            isOneToOne: false
            referencedRelation: "tours"
            referencedColumns: ["id"]
          },
        ]
      }
      people: {
        Row: {
          contact_id: string
          created_at: string
          id: string
          person_type: string
          role: string | null
          tour_id: string
          updated_at: string
        }
        Insert: {
          contact_id: string
          created_at?: string
          id?: string
          person_type: string
          role?: string | null
          tour_id: string
          updated_at?: string
        }
        Update: {
          contact_id?: string
          created_at?: string
          id?: string
          person_type?: string
          role?: string | null
          tour_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "people_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "people_tour_id_fkey"
            columns: ["tour_id"]
            isOneToOne: false
            referencedRelation: "tours"
            referencedColumns: ["id"]
          },
        ]
      }
      rehearsals: {
        Row: {
          address: string | null
          created_at: string
          end_at: string | null
          google_maps_url: string | null
          id: string
          location_name: string
          notes: string | null
          start_at: string | null
          tour_date_id: string
          tour_id: string
          updated_at: string
        }
        Insert: {
          address?: string | null
          created_at?: string
          end_at?: string | null
          google_maps_url?: string | null
          id?: string
          location_name: string
          notes?: string | null
          start_at?: string | null
          tour_date_id: string
          tour_id: string
          updated_at?: string
        }
        Update: {
          address?: string | null
          created_at?: string
          end_at?: string | null
          google_maps_url?: string | null
          id?: string
          location_name?: string
          notes?: string | null
          start_at?: string | null
          tour_date_id?: string
          tour_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "rehearsals_tour_date_id_fkey"
            columns: ["tour_date_id"]
            isOneToOne: false
            referencedRelation: "tour_dates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rehearsals_tour_id_fkey"
            columns: ["tour_id"]
            isOneToOne: false
            referencedRelation: "tours"
            referencedColumns: ["id"]
          },
        ]
      }
      room_assignments: {
        Row: {
          created_at: string
          hotel_stay_id: string
          id: string
          person_id: string
          room_tier: string
          room_type: string | null
          sharing_with: string | null
          tour_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          hotel_stay_id: string
          id?: string
          person_id: string
          room_tier: string
          room_type?: string | null
          sharing_with?: string | null
          tour_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          hotel_stay_id?: string
          id?: string
          person_id?: string
          room_tier?: string
          room_type?: string | null
          sharing_with?: string | null
          tour_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "room_assignments_hotel_stay_id_fkey"
            columns: ["hotel_stay_id"]
            isOneToOne: false
            referencedRelation: "hotel_stays"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "room_assignments_person_id_fkey"
            columns: ["person_id"]
            isOneToOne: false
            referencedRelation: "people"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "room_assignments_sharing_with_fkey"
            columns: ["sharing_with"]
            isOneToOne: false
            referencedRelation: "people"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "room_assignments_tour_id_fkey"
            columns: ["tour_id"]
            isOneToOne: false
            referencedRelation: "tours"
            referencedColumns: ["id"]
          },
        ]
      }
      show_advance: {
        Row: {
          created_at: string
          show_id: string
          status_audio: string
          status_hospitality: string
          status_lighting: string
          status_staging: string
          status_travel: string
          tour_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          show_id: string
          status_audio?: string
          status_hospitality?: string
          status_lighting?: string
          status_staging?: string
          status_travel?: string
          tour_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          show_id?: string
          status_audio?: string
          status_hospitality?: string
          status_lighting?: string
          status_staging?: string
          status_travel?: string
          tour_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "show_advance_show_id_fkey"
            columns: ["show_id"]
            isOneToOne: true
            referencedRelation: "shows"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "show_advance_tour_id_fkey"
            columns: ["tour_id"]
            isOneToOne: false
            referencedRelation: "tours"
            referencedColumns: ["id"]
          },
        ]
      }
      shows: {
        Row: {
          address: string | null
          capacity: number | null
          created_at: string
          curfew_at: string | null
          date: string
          dressing_rooms: string | null
          house_lighting_plot: string | null
          house_pa_spec: string | null
          hub_ground_minutes: number | null
          hub_resolved_at: string | null
          id: string
          load_in_at: string | null
          notes: string | null
          parking: string | null
          production_office: boolean | null
          shore_power: string | null
          showers: boolean | null
          stage_dimensions: string | null
          stagehands: number | null
          tech_pack_document_id: string | null
          tour_date_id: string
          tour_id: string
          transport_hub_iata: string | null
          transport_hub_rail: string | null
          union_stage: boolean | null
          updated_at: string
          venue_lat: number | null
          venue_lng: number | null
          venue_name: string
          venue_type: string | null
        }
        Insert: {
          address?: string | null
          capacity?: number | null
          created_at?: string
          curfew_at?: string | null
          date: string
          dressing_rooms?: string | null
          house_lighting_plot?: string | null
          house_pa_spec?: string | null
          hub_ground_minutes?: number | null
          hub_resolved_at?: string | null
          id?: string
          load_in_at?: string | null
          notes?: string | null
          parking?: string | null
          production_office?: boolean | null
          shore_power?: string | null
          showers?: boolean | null
          stage_dimensions?: string | null
          stagehands?: number | null
          tech_pack_document_id?: string | null
          tour_date_id: string
          tour_id: string
          transport_hub_iata?: string | null
          transport_hub_rail?: string | null
          union_stage?: boolean | null
          updated_at?: string
          venue_lat?: number | null
          venue_lng?: number | null
          venue_name: string
          venue_type?: string | null
        }
        Update: {
          address?: string | null
          capacity?: number | null
          created_at?: string
          curfew_at?: string | null
          date?: string
          dressing_rooms?: string | null
          house_lighting_plot?: string | null
          house_pa_spec?: string | null
          hub_ground_minutes?: number | null
          hub_resolved_at?: string | null
          id?: string
          load_in_at?: string | null
          notes?: string | null
          parking?: string | null
          production_office?: boolean | null
          shore_power?: string | null
          showers?: boolean | null
          stage_dimensions?: string | null
          stagehands?: number | null
          tech_pack_document_id?: string | null
          tour_date_id?: string
          tour_id?: string
          transport_hub_iata?: string | null
          transport_hub_rail?: string | null
          union_stage?: boolean | null
          updated_at?: string
          venue_lat?: number | null
          venue_lng?: number | null
          venue_name?: string
          venue_type?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "shows_tech_pack_document_id_fkey"
            columns: ["tech_pack_document_id"]
            isOneToOne: false
            referencedRelation: "documents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shows_tour_date_id_fkey"
            columns: ["tour_date_id"]
            isOneToOne: false
            referencedRelation: "tour_dates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shows_tour_id_fkey"
            columns: ["tour_id"]
            isOneToOne: false
            referencedRelation: "tours"
            referencedColumns: ["id"]
          },
        ]
      }
      telegram_link_tokens: {
        Row: {
          account_id: string
          contact_id: string
          created_at: string
          expires_at: string
          token: string
          used_at: string | null
        }
        Insert: {
          account_id: string
          contact_id: string
          created_at?: string
          expires_at?: string
          token?: string
          used_at?: string | null
        }
        Update: {
          account_id?: string
          contact_id?: string
          created_at?: string
          expires_at?: string
          token?: string
          used_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "telegram_link_tokens_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "telegram_link_tokens_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
        ]
      }
      tour_dates: {
        Row: {
          created_at: string
          custom_title: string | null
          date: string
          day_type: string
          id: string
          notes: string | null
          tour_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          custom_title?: string | null
          date: string
          day_type?: string
          id?: string
          notes?: string | null
          tour_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          custom_title?: string | null
          date?: string
          day_type?: string
          id?: string
          notes?: string | null
          tour_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "tour_dates_tour_id_fkey"
            columns: ["tour_id"]
            isOneToOne: false
            referencedRelation: "tours"
            referencedColumns: ["id"]
          },
        ]
      }
      tours: {
        Row: {
          account_id: string
          artist_id: string
          base_currency: string
          created_at: string
          end_date: string | null
          id: string
          inbound_qa_enabled: boolean
          morning_message_enabled: boolean
          name: string
          start_date: string | null
          status: string
          territory: string | null
          timezone: string | null
          updated_at: string
        }
        Insert: {
          account_id: string
          artist_id: string
          base_currency?: string
          created_at?: string
          end_date?: string | null
          id?: string
          inbound_qa_enabled?: boolean
          morning_message_enabled?: boolean
          name: string
          start_date?: string | null
          status?: string
          territory?: string | null
          timezone?: string | null
          updated_at?: string
        }
        Update: {
          account_id?: string
          artist_id?: string
          base_currency?: string
          created_at?: string
          end_date?: string | null
          id?: string
          inbound_qa_enabled?: boolean
          morning_message_enabled?: boolean
          name?: string
          start_date?: string | null
          status?: string
          territory?: string | null
          timezone?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "tours_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tours_artist_id_fkey"
            columns: ["artist_id"]
            isOneToOne: false
            referencedRelation: "artists"
            referencedColumns: ["id"]
          },
        ]
      }
      transport_assignments: {
        Row: {
          baggage: string | null
          boarding_pass_document_id: string | null
          created_at: string
          frequent_flyer_no: string | null
          id: string
          known_traveller_no: string | null
          meal_pref: string | null
          person_id: string
          seat: string | null
          segment_id: string
          ticket_reference: string | null
          tour_id: string
          updated_at: string
        }
        Insert: {
          baggage?: string | null
          boarding_pass_document_id?: string | null
          created_at?: string
          frequent_flyer_no?: string | null
          id?: string
          known_traveller_no?: string | null
          meal_pref?: string | null
          person_id: string
          seat?: string | null
          segment_id: string
          ticket_reference?: string | null
          tour_id: string
          updated_at?: string
        }
        Update: {
          baggage?: string | null
          boarding_pass_document_id?: string | null
          created_at?: string
          frequent_flyer_no?: string | null
          id?: string
          known_traveller_no?: string | null
          meal_pref?: string | null
          person_id?: string
          seat?: string | null
          segment_id?: string
          ticket_reference?: string | null
          tour_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "transport_assignments_boarding_pass_document_id_fkey"
            columns: ["boarding_pass_document_id"]
            isOneToOne: false
            referencedRelation: "documents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transport_assignments_person_id_fkey"
            columns: ["person_id"]
            isOneToOne: false
            referencedRelation: "people"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transport_assignments_segment_id_fkey"
            columns: ["segment_id"]
            isOneToOne: false
            referencedRelation: "transport_segments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transport_assignments_tour_id_fkey"
            columns: ["tour_id"]
            isOneToOne: false
            referencedRelation: "tours"
            referencedColumns: ["id"]
          },
        ]
      }
      transport_segments: {
        Row: {
          arrive_at: string | null
          book_url: string | null
          booking_reference: string | null
          carrier_operator: string | null
          company: string | null
          created_at: string
          depart_at: string | null
          destination: string | null
          details_json: Json
          door_to_site_at: string | null
          driver_contact: string | null
          id: string
          mode: string
          origin: string | null
          source_provider: string | null
          status: string
          tour_date_id: string | null
          tour_id: string
          updated_at: string
          vehicle_or_flight_no: string | null
        }
        Insert: {
          arrive_at?: string | null
          book_url?: string | null
          booking_reference?: string | null
          carrier_operator?: string | null
          company?: string | null
          created_at?: string
          depart_at?: string | null
          destination?: string | null
          details_json?: Json
          door_to_site_at?: string | null
          driver_contact?: string | null
          id?: string
          mode: string
          origin?: string | null
          source_provider?: string | null
          status?: string
          tour_date_id?: string | null
          tour_id: string
          updated_at?: string
          vehicle_or_flight_no?: string | null
        }
        Update: {
          arrive_at?: string | null
          book_url?: string | null
          booking_reference?: string | null
          carrier_operator?: string | null
          company?: string | null
          created_at?: string
          depart_at?: string | null
          destination?: string | null
          details_json?: Json
          door_to_site_at?: string | null
          driver_contact?: string | null
          id?: string
          mode?: string
          origin?: string | null
          source_provider?: string | null
          status?: string
          tour_date_id?: string | null
          tour_id?: string
          updated_at?: string
          vehicle_or_flight_no?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "transport_segments_tour_date_id_fkey"
            columns: ["tour_date_id"]
            isOneToOne: false
            referencedRelation: "tour_dates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transport_segments_tour_id_fkey"
            columns: ["tour_id"]
            isOneToOne: false
            referencedRelation: "tours"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      add_contact_to_tour: {
        Args: {
          p_contact_id: string
          p_person_type?: string
          p_role?: string
          p_tour_id: string
        }
        Returns: string
      }
      create_show_with_dependents: {
        Args: { p_show_data: Json; p_tour_id: string }
        Returns: string
      }
      owns_tour: { Args: { p_tour_id: string }; Returns: boolean }
    }
    Enums: {
      [_ in never]: never
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
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {},
  },
} as const
