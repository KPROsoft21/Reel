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
      movie_interaction_events: {
        Row: {
          created_at: string
          event_type: string
          event_value: Json
          id: number
          movie_id: number | null
          session_id: string | null
          user_id: string
        }
        Insert: {
          created_at?: string
          event_type: string
          event_value?: Json
          id?: number
          movie_id?: number | null
          session_id?: string | null
          user_id: string
        }
        Update: {
          created_at?: string
          event_type?: string
          event_value?: Json
          id?: number
          movie_id?: number | null
          session_id?: string | null
          user_id?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          avatar_url: string | null
          bio: string | null
          created_at: string
          display_name: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          avatar_url?: string | null
          bio?: string | null
          created_at?: string
          display_name?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          avatar_url?: string | null
          bio?: string | null
          created_at?: string
          display_name?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      recommendations: {
        Row: {
          algorithm_version: string
          context_score: number | null
          created_at: string
          discovery_score: number | null
          explanation: Json
          id: number
          model_version: string
          movie_id: number
          novelty_score: number | null
          preference_score: number | null
          rank_position: number
          score: number
          search_id: number | null
          semantic_score: number | null
          theme_score: number | null
          user_id: string
        }
        Insert: {
          algorithm_version?: string
          context_score?: number | null
          created_at?: string
          discovery_score?: number | null
          explanation?: Json
          id?: number
          model_version?: string
          movie_id: number
          novelty_score?: number | null
          preference_score?: number | null
          rank_position: number
          score: number
          search_id?: number | null
          semantic_score?: number | null
          theme_score?: number | null
          user_id: string
        }
        Update: {
          algorithm_version?: string
          context_score?: number | null
          created_at?: string
          discovery_score?: number | null
          explanation?: Json
          id?: number
          model_version?: string
          movie_id?: number
          novelty_score?: number | null
          preference_score?: number | null
          rank_position?: number
          score?: number
          search_id?: number | null
          semantic_score?: number | null
          theme_score?: number | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "recommendations_search_id_fkey"
            columns: ["search_id"]
            isOneToOne: false
            referencedRelation: "searches"
            referencedColumns: ["id"]
          },
        ]
      }
      searches: {
        Row: {
          created_at: string
          id: number
          intent_json: Json
          query_text: string
          temporary_intent: boolean
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: number
          intent_json?: Json
          query_text: string
          temporary_intent?: boolean
          user_id: string
        }
        Update: {
          created_at?: string
          id?: number
          intent_json?: Json
          query_text?: string
          temporary_intent?: boolean
          user_id?: string
        }
        Relationships: []
      }
      user_feedback: {
        Row: {
          created_at: string
          feedback_type: string
          id: number
          llm_model: string | null
          movie_id: number | null
          prompt_version: string | null
          raw_text: string | null
          recommendation_id: number | null
          sentiment: number | null
          structured_data: Json
          user_id: string
        }
        Insert: {
          created_at?: string
          feedback_type?: string
          id?: number
          llm_model?: string | null
          movie_id?: number | null
          prompt_version?: string | null
          raw_text?: string | null
          recommendation_id?: number | null
          sentiment?: number | null
          structured_data?: Json
          user_id: string
        }
        Update: {
          created_at?: string
          feedback_type?: string
          id?: number
          llm_model?: string | null
          movie_id?: number | null
          prompt_version?: string | null
          raw_text?: string | null
          recommendation_id?: number | null
          sentiment?: number | null
          structured_data?: Json
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_feedback_recommendation_id_fkey"
            columns: ["recommendation_id"]
            isOneToOne: false
            referencedRelation: "recommendations"
            referencedColumns: ["id"]
          },
        ]
      }
      user_movie_interactions: {
        Row: {
          first_seen_at: string
          id: number
          liked: boolean | null
          movie_id: number
          rated_at: string | null
          rating: number | null
          source: string | null
          updated_at: string
          user_id: string
          watched: boolean
          watched_at: string | null
        }
        Insert: {
          first_seen_at?: string
          id?: number
          liked?: boolean | null
          movie_id: number
          rated_at?: string | null
          rating?: number | null
          source?: string | null
          updated_at?: string
          user_id: string
          watched?: boolean
          watched_at?: string | null
        }
        Update: {
          first_seen_at?: string
          id?: number
          liked?: boolean | null
          movie_id?: number
          rated_at?: string | null
          rating?: number | null
          source?: string | null
          updated_at?: string
          user_id?: string
          watched?: boolean
          watched_at?: string | null
        }
        Relationships: []
      }
      user_preference_evidence: {
        Row: {
          confidence: number
          created_at: string
          evidence_type: string
          evidence_value: number
          feature_key: string
          id: number
          movie_id: number | null
          user_id: string
        }
        Insert: {
          confidence?: number
          created_at?: string
          evidence_type: string
          evidence_value: number
          feature_key: string
          id?: number
          movie_id?: number | null
          user_id: string
        }
        Update: {
          confidence?: number
          created_at?: string
          evidence_type?: string
          evidence_value?: number
          feature_key?: string
          id?: number
          movie_id?: number | null
          user_id?: string
        }
        Relationships: []
      }
      user_preferences: {
        Row: {
          confidence: number
          decay_class: string
          evidence_count: number
          feature_key: string
          importance: number
          last_updated: string
          preference_value: number
          user_id: string
          user_locked: boolean
        }
        Insert: {
          confidence?: number
          decay_class?: string
          evidence_count?: number
          feature_key: string
          importance?: number
          last_updated?: string
          preference_value?: number
          user_id: string
          user_locked?: boolean
        }
        Update: {
          confidence?: number
          decay_class?: string
          evidence_count?: number
          feature_key?: string
          importance?: number
          last_updated?: string
          preference_value?: number
          user_id?: string
          user_locked?: boolean
        }
        Relationships: []
      }
      watchlists: {
        Row: {
          added_at: string
          id: number
          movie_id: number
          removed_at: string | null
          status: string
          user_id: string
          watched_at: string | null
        }
        Insert: {
          added_at?: string
          id?: number
          movie_id: number
          removed_at?: string | null
          status?: string
          user_id: string
          watched_at?: string | null
        }
        Update: {
          added_at?: string
          id?: number
          movie_id?: number
          removed_at?: string | null
          status?: string
          user_id?: string
          watched_at?: string | null
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
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
  public: {
    Enums: {},
  },
} as const
