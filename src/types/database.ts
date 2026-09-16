export type ClientStatus = 'active' | 'paused' | 'offboarded'

export type ProvisioningStatus =
  | 'domain_pending'
  | 'domain_purchased'
  | 'mailbox_warming'
  | 'lemlist_connected'
  | 'live'

export type UserRole = 'admin' | 'client_user'

export type CampaignStatus = 'draft' | 'active' | 'paused' | 'completed'

/**
 * `lemlist_api_key` is intentionally omitted from the row shape used by the
 * app: it should never round-trip through a `select *`. Writes go through
 * `ClientWrite` below, and the key is read only inside the sync Edge Function
 * (service-role access, never shipped to the browser).
 */
// These row shapes are plain `type` object literals rather than
// `interface`s on purpose: supabase-js's generics check each table's
// Row/Insert/Update against `Record<string, unknown>`, and TypeScript only
// considers closed object-literal types (not open/extendable interfaces)
// structurally compatible with that check.
export type Client = {
  id: string
  name: string
  status: ClientStatus
  sending_domain: string | null
  sender_email: string | null
  provisioning_status: ProvisioningStatus
  created_at: string
  last_synced_at?: string | null
}

export type ClientWrite = {
  name: string
  status?: ClientStatus
  sending_domain?: string | null
  sender_email?: string | null
  provisioning_status?: ProvisioningStatus
  lemlist_api_key?: string
}

export type Profile = {
  id: string
  client_id: string | null
  role: UserRole
  email: string
}

export type Campaign = {
  id: string
  client_id: string
  lemlist_campaign_id: string
  name: string
  vertical: string | null
  status: CampaignStatus
  created_at: string
}

export type CampaignStatsDaily = {
  id: string
  campaign_id: string
  date: string
  sent: number
  opened: number
  replied: number
  clicked: number
  bounced: number
  unsubscribed: number
  meetings_booked: number
  synced_at: string
}

export type Report = {
  id: string
  client_id: string
  period_start: string
  period_end: string
  summary_text: string
  created_at: string
}

export type Database = {
  public: {
    Tables: {
      clients: {
        Row: Client
        Insert: ClientWrite
        Update: Partial<ClientWrite>
        Relationships: []
      }
      profiles: {
        Row: Profile
        Insert: Partial<Profile> & { id: string; role: UserRole; email: string }
        Update: Partial<Profile>
        Relationships: []
      }
      campaigns: {
        Row: Campaign
        Insert: Partial<Campaign> & {
          client_id: string
          lemlist_campaign_id: string
          name: string
        }
        Update: Partial<Campaign>
        Relationships: []
      }
      campaign_stats_daily: {
        Row: CampaignStatsDaily
        Insert: Partial<CampaignStatsDaily> & { campaign_id: string; date: string }
        Update: Partial<CampaignStatsDaily>
        Relationships: []
      }
      reports: {
        Row: Report
        Insert: Partial<Report> & {
          client_id: string
          period_start: string
          period_end: string
          summary_text: string
        }
        Update: Partial<Report>
        Relationships: []
      }
    }
    Views: Record<string, never>
    Functions: {
      admin_set_client_lemlist_key: {
        Args: { p_client_id: string; p_api_key: string }
        Returns: undefined
      }
      is_admin: {
        Args: Record<string, never>
        Returns: boolean
      }
      current_client_id: {
        Args: Record<string, never>
        Returns: string
      }
    }
    Enums: Record<string, never>
    CompositeTypes: Record<string, never>
  }
}
