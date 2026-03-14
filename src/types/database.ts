/**
 * Reconstructed from the project's live Supabase PostgREST OpenAPI schema
 * (public schema) plus the report tables already used by the app.
 *
 * Source used for reconstruction:
 * GET https://<project-ref>.supabase.co/rest/v1/ with the project's anon key.
 */
export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export type Database = {
  public: {
    Tables: {
      admin_users: {
        Row: {
          email: string;
        };
        Insert: {
          email: string;
        };
        Update: {
          email?: string;
        };
        Relationships: [];
      };
      categories: {
        Row: {
          icon: string | null;
          id: number;
          level: number;
          name: string;
          parent_id: number | null;
          slug: string;
        };
        Insert: {
          icon?: string | null;
          id?: number;
          level?: number;
          name: string;
          parent_id?: number | null;
          slug: string;
        };
        Update: {
          icon?: string | null;
          id?: number;
          level?: number;
          name?: string;
          parent_id?: number | null;
          slug?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'categories_parent_id_fkey';
            columns: ['parent_id'];
            isOneToOne: false;
            referencedRelation: 'categories';
            referencedColumns: ['id'];
          },
        ];
      };
      conversations: {
        Row: {
          buyer_id: string;
          buyer_unread_count: number;
          created_at: string;
          id: string;
          last_message_at: string | null;
          last_message_preview: string | null;
          listing_id: string;
          seller_id: string;
          seller_unread_count: number;
          updated_at: string | null;
        };
        Insert: {
          buyer_id: string;
          buyer_unread_count?: number;
          created_at?: string;
          id?: string;
          last_message_at?: string | null;
          last_message_preview?: string | null;
          listing_id: string;
          seller_id: string;
          seller_unread_count?: number;
          updated_at?: string | null;
        };
        Update: {
          buyer_id?: string;
          buyer_unread_count?: number;
          created_at?: string;
          id?: string;
          last_message_at?: string | null;
          last_message_preview?: string | null;
          listing_id?: string;
          seller_id?: string;
          seller_unread_count?: number;
          updated_at?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: 'conversations_listing_id_fkey';
            columns: ['listing_id'];
            isOneToOne: false;
            referencedRelation: 'listings';
            referencedColumns: ['id'];
          },
        ];
      };
      favorites: {
        Row: {
          created_at: string;
          id: string;
          listing_id: string;
          user_id: string;
        };
        Insert: {
          created_at?: string;
          id?: string;
          listing_id: string;
          user_id: string;
        };
        Update: {
          created_at?: string;
          id?: string;
          listing_id?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'favorites_listing_id_fkey';
            columns: ['listing_id'];
            isOneToOne: false;
            referencedRelation: 'listings';
            referencedColumns: ['id'];
          },
        ];
      };
      listing_images: {
        Row: {
          created_at: string;
          full_path: string | null;
          id: string;
          listing_id: string | null;
          medium_path: string | null;
          position: number;
          sort_order: number | null;
          thumb_path: string | null;
          url: string;
        };
        Insert: {
          created_at?: string;
          full_path?: string | null;
          id?: string;
          listing_id?: string | null;
          medium_path?: string | null;
          position?: number;
          sort_order?: number | null;
          thumb_path?: string | null;
          url: string;
        };
        Update: {
          created_at?: string;
          full_path?: string | null;
          id?: string;
          listing_id?: string | null;
          medium_path?: string | null;
          position?: number;
          sort_order?: number | null;
          thumb_path?: string | null;
          url?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'listing_images_listing_id_fkey';
            columns: ['listing_id'];
            isOneToOne: false;
            referencedRelation: 'listings';
            referencedColumns: ['id'];
          },
        ];
      };
      listing_promotions: {
        Row: {
          created_at: string;
          ends_at: string;
          id: string;
          listing_id: string;
          starts_at: string;
          type: string;
        };
        Insert: {
          created_at?: string;
          ends_at: string;
          id?: string;
          listing_id: string;
          starts_at?: string;
          type?: string;
        };
        Update: {
          created_at?: string;
          ends_at?: string;
          id?: string;
          listing_id?: string;
          starts_at?: string;
          type?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'listing_promotions_listing_id_fkey';
            columns: ['listing_id'];
            isOneToOne: false;
            referencedRelation: 'listings';
            referencedColumns: ['id'];
          },
        ];
      };
      listing_reports: {
        Row: {
          created_at: string | null;
          id: string;
          listing_id: string;
          reason: string;
          user_id: string;
        };
        Insert: {
          created_at?: string | null;
          id?: string;
          listing_id: string;
          reason: string;
          user_id: string;
        };
        Update: {
          created_at?: string | null;
          id?: string;
          listing_id?: string;
          reason?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'listing_reports_listing_id_fkey';
            columns: ['listing_id'];
            isOneToOne: false;
            referencedRelation: 'listings';
            referencedColumns: ['id'];
          },
        ];
      };
      listings: {
        Row: {
          boosted: boolean;
          brand: string | null;
          category_id: number | null;
          city: string | null;
          condition: string | null;
          contact_clicks_count: number;
          created_at: string;
          description: string | null;
          district: string | null;
          id: string;
          model: string | null;
          price: number;
          status: Database['public']['Enums']['listing_status'];
          title: string;
          updated_at: string;
          urgent: boolean;
          user_id: string | null;
          views_count: number;
        };
        Insert: {
          boosted?: boolean;
          brand?: string | null;
          category_id?: number | null;
          city?: string | null;
          condition?: string | null;
          contact_clicks_count?: number;
          created_at?: string;
          description?: string | null;
          district?: string | null;
          id?: string;
          model?: string | null;
          price: number;
          status?: Database['public']['Enums']['listing_status'];
          title: string;
          updated_at?: string;
          urgent?: boolean;
          user_id?: string | null;
          views_count?: number;
        };
        Update: {
          boosted?: boolean;
          brand?: string | null;
          category_id?: number | null;
          city?: string | null;
          condition?: string | null;
          contact_clicks_count?: number;
          created_at?: string;
          description?: string | null;
          district?: string | null;
          id?: string;
          model?: string | null;
          price?: number;
          status?: Database['public']['Enums']['listing_status'];
          title?: string;
          updated_at?: string;
          urgent?: boolean;
          user_id?: string | null;
          views_count?: number;
        };
        Relationships: [
          {
            foreignKeyName: 'listings_category_id_fkey';
            columns: ['category_id'];
            isOneToOne: false;
            referencedRelation: 'categories';
            referencedColumns: ['id'];
          },
        ];
      };
      messages: {
        Row: {
          body: string;
          conversation_id: string;
          created_at: string;
          id: string;
          read_at: string | null;
          sender_id: string;
        };
        Insert: {
          body: string;
          conversation_id: string;
          created_at?: string;
          id?: string;
          read_at?: string | null;
          sender_id: string;
        };
        Update: {
          body?: string;
          conversation_id?: string;
          created_at?: string;
          id?: string;
          read_at?: string | null;
          sender_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'messages_conversation_id_fkey';
            columns: ['conversation_id'];
            isOneToOne: false;
            referencedRelation: 'conversations';
            referencedColumns: ['id'];
          },
        ];
      };
      profiles: {
        Row: {
          avatar_url: string | null;
          bio: string | null;
          city: string | null;
          created_at: string;
          full_name: string | null;
          id: string;
          is_banned: boolean;
          is_flagged: boolean;
          is_verified: boolean;
          phone: string | null;
          phone_verified: boolean;
          reports_count: number;
          trust_score: number;
          updated_at: string | null;
        };
        Insert: {
          avatar_url?: string | null;
          bio?: string | null;
          city?: string | null;
          created_at?: string;
          full_name?: string | null;
          id: string;
          is_banned?: boolean;
          is_flagged?: boolean;
          is_verified?: boolean;
          phone?: string | null;
          phone_verified?: boolean;
          reports_count?: number;
          trust_score?: number;
          updated_at?: string | null;
        };
        Update: {
          avatar_url?: string | null;
          bio?: string | null;
          city?: string | null;
          created_at?: string;
          full_name?: string | null;
          id?: string;
          is_banned?: boolean;
          is_flagged?: boolean;
          is_verified?: boolean;
          phone?: string | null;
          phone_verified?: boolean;
          reports_count?: number;
          trust_score?: number;
          updated_at?: string | null;
        };
        Relationships: [];
      };
      reports: {
        Row: {
          created_at: string;
          id: string;
          listing_id: string | null;
          message: string | null;
          reason: string;
          reporter_user_id: string | null;
          status: Database['public']['Enums']['report_status'];
        };
        Insert: {
          created_at?: string;
          id?: string;
          listing_id?: string | null;
          message?: string | null;
          reason?: string;
          reporter_user_id?: string | null;
          status?: Database['public']['Enums']['report_status'];
        };
        Update: {
          created_at?: string;
          id?: string;
          listing_id?: string | null;
          message?: string | null;
          reason?: string;
          reporter_user_id?: string | null;
          status?: Database['public']['Enums']['report_status'];
        };
        Relationships: [
          {
            foreignKeyName: 'reports_listing_id_fkey';
            columns: ['listing_id'];
            isOneToOne: false;
            referencedRelation: 'listings';
            referencedColumns: ['id'];
          },
        ];
      };
      user_reports: {
        Row: {
          created_at: string | null;
          id: string;
          reason: string;
          reported_user_id: string;
          reporter_user_id: string;
        };
        Insert: {
          created_at?: string | null;
          id?: string;
          reason: string;
          reported_user_id: string;
          reporter_user_id: string;
        };
        Update: {
          created_at?: string | null;
          id?: string;
          reason?: string;
          reported_user_id?: string;
          reporter_user_id?: string;
        };
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: {
      create_system_report_for_listing: {
        Args: {
          p_listing_id: string;
          p_message?: string | null;
          p_reason: string;
        };
        Returns: undefined;
      };
      get_seller_response_indicator: {
        Args: {
          p_seller_id: string;
        };
        Returns: boolean;
      };
      increment_listing_contact_clicks: {
        Args: {
          p_listing_id: string;
        };
        Returns: undefined;
      };
      increment_listing_views: {
        Args: {
          p_listing_id: string;
          p_viewer_id?: string | null;
        };
        Returns: undefined;
      };
      is_admin: {
        Args: Record<PropertyKey, never>;
        Returns: boolean;
      };
      rls_auto_enable: {
        Args: Record<PropertyKey, never>;
        Returns: Json;
      };
      storage_listing_owner: {
        Args: {
          listing_id: string;
        };
        Returns: string | null;
      };
    };
    Enums: {
      listing_status: 'active' | 'hidden' | 'suspended';
      report_status: 'open' | 'reviewed' | 'action_taken' | 'dismissed';
    };
    CompositeTypes: Record<string, never>;
  };
};

type PublicSchema = Database['public'];

export type Tables<
  TableName extends keyof PublicSchema['Tables']
> = PublicSchema['Tables'][TableName]['Row'];

export type TablesInsert<
  TableName extends keyof PublicSchema['Tables']
> = PublicSchema['Tables'][TableName]['Insert'];

export type TablesUpdate<
  TableName extends keyof PublicSchema['Tables']
> = PublicSchema['Tables'][TableName]['Update'];

export type Enums<
  EnumName extends keyof PublicSchema['Enums']
> = PublicSchema['Enums'][EnumName];
