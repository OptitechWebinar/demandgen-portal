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
  // Null until the campaign is launched into Lemlist.
  lemlist_campaign_id: string | null
  name: string
  vertical: string | null
  status: CampaignStatus
  sequence_id: string | null
  icp_profile_id: string | null
  launched_at: string | null
  launch_error: string | null
  created_at: string
}

export type CampaignWrite = {
  client_id: string
  name: string
  vertical?: string | null
  sequence_id?: string | null
  icp_profile_id?: string | null
}

export type IcpCriteria = {
  industries?: string[]
  companySizeMin?: number
  companySizeMax?: number
  titles?: string[]
  seniority?: string[]
  geographies?: string[]
  signals?: string[]
}

export type IcpProfile = {
  id: string
  client_id: string
  name: string
  criteria: IcpCriteria
  created_at: string
  updated_at: string
}

export type IcpProfileWrite = {
  client_id: string
  name: string
  criteria: IcpCriteria
}

export type SequenceChannel = 'email' | 'linkedin' | 'sms' | 'whatsapp'

export type Sequence = {
  id: string
  // Null = a reusable global template. Set = a campaign-owned copy, cloned
  // from a template before launch so later template edits don't
  // retroactively change already-built campaigns.
  client_id: string | null
  name: string
  description: string | null
  created_at: string
  updated_at: string
}

export type SequenceWrite = {
  client_id?: string | null
  name: string
  description?: string | null
}

export type SequenceStep = {
  id: string
  sequence_id: string
  step_order: number
  channel: SequenceChannel
  delay_days: number
  subject: string | null
  body: string
  created_at: string
}

export type SequenceStepWrite = {
  sequence_id: string
  step_order: number
  channel: SequenceChannel
  delay_days: number
  subject?: string | null
  body: string
}

export type ProspectSource = 'uplead' | 'csv_import'
export type ProspectStatus = 'staged' | 'attached' | 'rejected'

export type Prospect = {
  id: string
  client_id: string
  icp_profile_id: string | null
  campaign_id: string | null
  source: ProspectSource
  external_id: string | null
  first_name: string | null
  last_name: string | null
  email: string | null
  title: string | null
  company_name: string | null
  company_domain: string | null
  linkedin_url: string | null
  location: string | null
  raw: Record<string, unknown>
  status: ProspectStatus
  created_at: string
}

export type ProspectWrite = {
  client_id: string
  icp_profile_id?: string | null
  campaign_id?: string | null
  source: ProspectSource
  external_id?: string | null
  first_name?: string | null
  last_name?: string | null
  email?: string | null
  title?: string | null
  company_name?: string | null
  company_domain?: string | null
  linkedin_url?: string | null
  location?: string | null
  raw?: Record<string, unknown>
  status?: ProspectStatus
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
        Insert: CampaignWrite
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
      icp_profiles: {
        Row: IcpProfile
        Insert: IcpProfileWrite
        Update: Partial<IcpProfileWrite>
        Relationships: []
      }
      sequences: {
        Row: Sequence
        Insert: SequenceWrite
        Update: Partial<SequenceWrite>
        Relationships: []
      }
      sequence_steps: {
        Row: SequenceStep
        Insert: SequenceStepWrite
        Update: Partial<SequenceStepWrite>
        Relationships: []
      }
      prospects: {
        Row: Prospect
        Insert: ProspectWrite
        Update: Partial<ProspectWrite>
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
