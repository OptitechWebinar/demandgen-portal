import { supabase } from './supabase'
import type { Campaign, Client, ClientWrite } from '../types/database'

export async function fetchClients(): Promise<Client[]> {
  const { data, error } = await supabase.from('clients').select('*').order('name')
  if (error) throw error
  return data ?? []
}

export async function fetchClient(id: string): Promise<Client | null> {
  const { data, error } = await supabase.from('clients').select('*').eq('id', id).maybeSingle()
  if (error) throw error
  return data
}

export async function createClient(input: ClientWrite): Promise<Client> {
  const { lemlist_api_key, ...rest } = input
  const { data, error } = await supabase.from('clients').insert(rest).select('*').single()
  if (error) throw error

  if (lemlist_api_key) {
    await setClientLemlistKey(data.id, lemlist_api_key)
  }
  return data
}

export async function updateClient(id: string, input: Partial<ClientWrite>): Promise<void> {
  const { lemlist_api_key, ...rest } = input
  if (Object.keys(rest).length > 0) {
    const { error } = await supabase.from('clients').update(rest).eq('id', id)
    if (error) throw error
  }
  if (lemlist_api_key) {
    await setClientLemlistKey(id, lemlist_api_key)
  }
}

/** Stores the raw Lemlist API key in Supabase Vault via an admin-only RPC. */
export async function setClientLemlistKey(clientId: string, apiKey: string): Promise<void> {
  const { error } = await supabase.rpc('admin_set_client_lemlist_key', {
    p_client_id: clientId,
    p_api_key: apiKey,
  })
  if (error) throw error
}

export async function fetchAllCampaigns(): Promise<Campaign[]> {
  const { data, error } = await supabase.from('campaigns').select('*').order('name')
  if (error) throw error
  return data ?? []
}

export async function reassignCampaign(campaignId: string, clientId: string): Promise<void> {
  const { error } = await supabase.from('campaigns').update({ client_id: clientId }).eq('id', campaignId)
  if (error) throw error
}

/**
 * Invokes the lemlist-sync Edge Function for a single client (used by the
 * admin "Sync now" button) or, with no clientId, for every client (the same
 * path the scheduled sync uses).
 */
export async function triggerSync(clientId?: string): Promise<{ synced: number }> {
  const { data, error } = await supabase.functions.invoke('lemlist-sync', {
    body: clientId ? { client_id: clientId } : {},
  })
  if (error) throw error
  return data
}
