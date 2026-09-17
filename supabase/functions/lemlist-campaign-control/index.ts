// Pause or resume a live Lemlist campaign.
import { CORS_HEADERS, getClientLemlistKey, json, requireAdmin } from '../_shared/adminAuth.ts'
import { setCampaignState } from '../_shared/lemlist.ts'

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: CORS_HEADERS })
  }

  const auth = await requireAdmin(req)
  if ('error' in auth) return auth.error
  const { admin } = auth

  const { campaign_id, action } = (await req.json().catch(() => ({}))) as {
    campaign_id?: string
    action?: 'pause' | 'resume'
  }
  if (!campaign_id || (action !== 'pause' && action !== 'resume')) {
    return json({ error: 'campaign_id and action ("pause" | "resume") are required' }, 400)
  }

  const { data: campaign, error: campaignError } = await admin
    .from('campaigns')
    .select('id, client_id, lemlist_campaign_id')
    .eq('id', campaign_id)
    .maybeSingle()
  if (campaignError) return json({ error: campaignError.message }, 500)
  if (!campaign?.lemlist_campaign_id) return json({ error: 'Campaign has not been launched yet' }, 400)

  const { data: client } = await admin
    .from('clients')
    .select('lemlist_api_key_secret_id')
    .eq('id', campaign.client_id)
    .maybeSingle()

  try {
    const apiKey = await getClientLemlistKey(admin, client?.lemlist_api_key_secret_id as string | null)
    await setCampaignState(apiKey, campaign.lemlist_campaign_id, action === 'pause' ? 'paused' : 'running')

    await admin
      .from('campaigns')
      .update({ status: action === 'pause' ? 'paused' : 'active' })
      .eq('id', campaign_id)

    return json({ status: action === 'pause' ? 'paused' : 'active' })
  } catch (err) {
    return json({ error: err instanceof Error ? err.message : 'Failed to update campaign state' }, 502)
  }
})
