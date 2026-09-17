// Add or remove leads on an already-launched campaign. `add` takes staged
// prospect ids (must belong to the same client, not yet attached anywhere);
// `remove` takes prospect ids currently attached to this campaign.
import { CORS_HEADERS, getClientLemlistKey, json, requireAdmin } from '../_shared/adminAuth.ts'
import { addLeads, removeLead } from '../_shared/lemlist.ts'

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: CORS_HEADERS })
  }

  const auth = await requireAdmin(req)
  if ('error' in auth) return auth.error
  const { admin } = auth

  const { campaign_id, add, remove } = (await req.json().catch(() => ({}))) as {
    campaign_id?: string
    add?: string[]
    remove?: string[]
  }
  if (!campaign_id) return json({ error: 'campaign_id is required' }, 400)

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
    let added = 0
    let removed = 0

    if (add?.length) {
      const { data: prospects, error } = await admin
        .from('prospects')
        .select('*')
        .in('id', add)
        .eq('client_id', campaign.client_id)
        .eq('status', 'staged')
      if (error) throw new Error(error.message)

      const leadsToAdd = (prospects ?? []).filter((p) => p.email)
      if (leadsToAdd.length > 0) {
        await addLeads(
          apiKey,
          campaign.lemlist_campaign_id,
          leadsToAdd.map((p) => ({
            email: p.email as string,
            firstName: p.first_name ?? undefined,
            lastName: p.last_name ?? undefined,
            companyName: p.company_name ?? undefined,
            linkedinUrl: p.linkedin_url ?? undefined,
            title: p.title ?? undefined,
          })),
        )
        await admin
          .from('prospects')
          .update({ campaign_id, status: 'attached' })
          .in(
            'id',
            leadsToAdd.map((p) => p.id),
          )
        added = leadsToAdd.length
      }
    }

    if (remove?.length) {
      const { data: prospects, error } = await admin
        .from('prospects')
        .select('*')
        .in('id', remove)
        .eq('campaign_id', campaign_id)
      if (error) throw new Error(error.message)

      for (const p of prospects ?? []) {
        if (p.email) {
          await removeLead(apiKey, campaign.lemlist_campaign_id, p.email)
        }
        await admin.from('prospects').update({ status: 'rejected' }).eq('id', p.id)
        removed++
      }
    }

    return json({ added, removed })
  } catch (err) {
    return json({ error: err instanceof Error ? err.message : 'Failed to manage leads' }, 502)
  }
})
