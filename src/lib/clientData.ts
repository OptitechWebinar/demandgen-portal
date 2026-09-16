import { supabase } from './supabase'
import type { Campaign, CampaignStatsDaily, Report } from '../types/database'

export async function fetchCampaignsForClient(clientId: string): Promise<Campaign[]> {
  const { data, error } = await supabase
    .from('campaigns')
    .select('*')
    .eq('client_id', clientId)
    .order('created_at', { ascending: false })

  if (error) throw error
  return data ?? []
}

export async function fetchStatsForCampaigns(
  campaignIds: string[],
  days = 30,
): Promise<CampaignStatsDaily[]> {
  if (campaignIds.length === 0) return []

  const since = new Date()
  since.setDate(since.getDate() - days)

  const { data, error } = await supabase
    .from('campaign_stats_daily')
    .select('*')
    .in('campaign_id', campaignIds)
    .gte('date', since.toISOString().slice(0, 10))
    .order('date', { ascending: true })

  if (error) throw error
  return data ?? []
}

export async function fetchReportsForClient(clientId: string): Promise<Report[]> {
  const { data, error } = await supabase
    .from('reports')
    .select('*')
    .eq('client_id', clientId)
    .order('period_start', { ascending: false })

  if (error) throw error
  return data ?? []
}
