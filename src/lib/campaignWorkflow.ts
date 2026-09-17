import { supabase } from './supabase'
import type {
  Campaign,
  CampaignWrite,
  IcpCriteria,
  IcpProfile,
  IcpProfileWrite,
  Prospect,
  ProspectWrite,
  Sequence,
  SequenceStep,
  SequenceStepWrite,
  SequenceWrite,
} from '../types/database'

// --- ICP profiles -----------------------------------------------------

export async function fetchIcpProfiles(clientId: string): Promise<IcpProfile[]> {
  const { data, error } = await supabase
    .from('icp_profiles')
    .select('*')
    .eq('client_id', clientId)
    .order('created_at', { ascending: false })
  if (error) throw error
  return data ?? []
}

export async function createIcpProfile(input: IcpProfileWrite): Promise<IcpProfile> {
  const { data, error } = await supabase.from('icp_profiles').insert(input).select('*').single()
  if (error) throw error
  return data
}

export async function updateIcpProfile(id: string, criteria: IcpCriteria, name: string): Promise<void> {
  const { error } = await supabase.from('icp_profiles').update({ name, criteria }).eq('id', id)
  if (error) throw error
}

export async function deleteIcpProfile(id: string): Promise<void> {
  const { error } = await supabase.from('icp_profiles').delete().eq('id', id)
  if (error) throw error
}

// --- Prospecting --------------------------------------------------------

export interface UpleadSearchResult {
  external_id: string
  first_name: string | null
  last_name: string | null
  email: string | null
  title: string | null
  company_name: string | null
  company_domain: string | null
  linkedin_url: string | null
  location: string | null
  raw: Record<string, unknown>
}

export async function searchUplead(params: {
  icpProfileId?: string
  criteria?: IcpCriteria
  limit?: number
}): Promise<UpleadSearchResult[]> {
  const { data, error } = await supabase.functions.invoke('uplead-search', {
    body: { icp_profile_id: params.icpProfileId, criteria: params.criteria, limit: params.limit },
  })
  if (error) throw error
  return data.prospects ?? []
}

/** The unassigned pool: staged prospects not yet attached to any campaign. */
export async function fetchStagedProspects(clientId: string): Promise<Prospect[]> {
  const { data, error } = await supabase
    .from('prospects')
    .select('*')
    .eq('client_id', clientId)
    .eq('status', 'staged')
    .is('campaign_id', null)
    .order('created_at', { ascending: false })
  if (error) throw error
  return data ?? []
}

export async function stageProspects(rows: ProspectWrite[]): Promise<void> {
  if (rows.length === 0) return
  const { error } = await supabase.from('prospects').insert(rows)
  if (error) throw error
}

export async function rejectProspect(id: string): Promise<void> {
  const { error } = await supabase.from('prospects').update({ status: 'rejected' }).eq('id', id)
  if (error) throw error
}

export async function attachProspectsToCampaign(prospectIds: string[], campaignId: string): Promise<void> {
  if (prospectIds.length === 0) return
  const { error } = await supabase.from('prospects').update({ campaign_id: campaignId }).in('id', prospectIds)
  if (error) throw error
}

export async function detachProspectFromCampaign(prospectId: string): Promise<void> {
  const { error } = await supabase.from('prospects').update({ campaign_id: null }).eq('id', prospectId)
  if (error) throw error
}

// --- Sequences ------------------------------------------------------------

/** Global reusable templates: client_id is null. */
export async function fetchSequenceTemplates(): Promise<Sequence[]> {
  const { data, error } = await supabase
    .from('sequences')
    .select('*')
    .is('client_id', null)
    .order('name')
  if (error) throw error
  return data ?? []
}

export async function fetchSequence(id: string): Promise<Sequence | null> {
  const { data, error } = await supabase.from('sequences').select('*').eq('id', id).maybeSingle()
  if (error) throw error
  return data
}

export async function fetchSequenceSteps(sequenceId: string): Promise<SequenceStep[]> {
  const { data, error } = await supabase
    .from('sequence_steps')
    .select('*')
    .eq('sequence_id', sequenceId)
    .order('step_order', { ascending: true })
  if (error) throw error
  return data ?? []
}

export async function createSequence(input: SequenceWrite): Promise<Sequence> {
  const { data, error } = await supabase.from('sequences').insert(input).select('*').single()
  if (error) throw error
  return data
}

export async function updateSequenceMeta(id: string, input: Partial<SequenceWrite>): Promise<void> {
  const { error } = await supabase.from('sequences').update(input).eq('id', id)
  if (error) throw error
}

export async function deleteSequence(id: string): Promise<void> {
  const { error } = await supabase.from('sequences').delete().eq('id', id)
  if (error) throw error
}

export async function saveSequenceSteps(sequenceId: string, steps: SequenceStepWrite[]): Promise<void> {
  const { error: deleteError } = await supabase.from('sequence_steps').delete().eq('sequence_id', sequenceId)
  if (deleteError) throw deleteError
  if (steps.length === 0) return
  const { error: insertError } = await supabase.from('sequence_steps').insert(steps)
  if (insertError) throw insertError
}

/** Clones a template's steps into a new campaign-owned sequence copy. */
export async function cloneSequenceForClient(templateId: string, clientId: string): Promise<Sequence> {
  const template = await fetchSequence(templateId)
  if (!template) throw new Error('Template not found')
  const steps = await fetchSequenceSteps(templateId)

  const clone = await createSequence({
    client_id: clientId,
    name: template.name,
    description: template.description,
  })

  if (steps.length > 0) {
    await saveSequenceSteps(
      clone.id,
      steps.map((s) => ({
        sequence_id: clone.id,
        step_order: s.step_order,
        channel: s.channel,
        delay_days: s.delay_days,
        subject: s.subject,
        body: s.body,
      })),
    )
  }
  return clone
}

// --- Campaign build & launch ------------------------------------------

export async function createDraftCampaign(input: CampaignWrite): Promise<Campaign> {
  const { data, error } = await supabase.from('campaigns').insert(input).select('*').single()
  if (error) throw error
  return data
}

export async function updateCampaign(id: string, input: Partial<CampaignWrite>): Promise<void> {
  const { error } = await supabase.from('campaigns').update(input).eq('id', id)
  if (error) throw error
}

export async function fetchCampaign(id: string): Promise<Campaign | null> {
  const { data, error } = await supabase.from('campaigns').select('*').eq('id', id).maybeSingle()
  if (error) throw error
  return data
}

/** A sequence is 1:1 with at most one campaign once cloned for a launch. */
export async function fetchCampaignBySequenceId(sequenceId: string): Promise<Campaign | null> {
  const { data, error } = await supabase.from('campaigns').select('*').eq('sequence_id', sequenceId).maybeSingle()
  if (error) throw error
  return data
}

export async function fetchProspectsForCampaign(campaignId: string): Promise<Prospect[]> {
  const { data, error } = await supabase
    .from('prospects')
    .select('*')
    .eq('campaign_id', campaignId)
    .order('created_at', { ascending: false })
  if (error) throw error
  return data ?? []
}

export async function launchCampaign(campaignId: string): Promise<{ lemlist_campaign_id: string; leads_added: number }> {
  const { data, error } = await supabase.functions.invoke('lemlist-launch-campaign', {
    body: { campaign_id: campaignId },
  })
  if (error) throw error
  if (data?.error) throw new Error(data.error)
  return data
}

export async function controlCampaign(campaignId: string, action: 'pause' | 'resume'): Promise<void> {
  const { data, error } = await supabase.functions.invoke('lemlist-campaign-control', {
    body: { campaign_id: campaignId, action },
  })
  if (error) throw error
  if (data?.error) throw new Error(data.error)
}

export async function manageLeads(
  campaignId: string,
  changes: { add?: string[]; remove?: string[] },
): Promise<{ added: number; removed: number }> {
  const { data, error } = await supabase.functions.invoke('lemlist-manage-leads', {
    body: { campaign_id: campaignId, ...changes },
  })
  if (error) throw error
  if (data?.error) throw new Error(data.error)
  return data
}

export async function syncSequenceToLemlist(campaignId: string, removedStepOrders: number[] = []): Promise<void> {
  const { data, error } = await supabase.functions.invoke('lemlist-edit-sequence', {
    body: { campaign_id: campaignId, removed_step_orders: removedStepOrders },
  })
  if (error) throw error
  if (data?.error) throw new Error(data.error)
}
