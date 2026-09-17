// Scheduled (and manually triggerable) sync of Lemlist campaign stats into
// campaign_stats_daily. One Lemlist account per client: each client's API
// key is looked up per-run from Supabase Vault via the client's
// lemlist_api_key_secret_id, so the key never touches the frontend.
//
// Invocation:
//   - Supabase Scheduled Functions (or pg_cron -> pg_net) call this with the
//     project's service role key and no body: syncs every client.
//   - The admin UI calls this via supabase.functions.invoke('lemlist-sync',
//     { body: { client_id } }) with the signed-in admin's session, forwarded
//     automatically as the Authorization header: syncs just that client.
import { CORS_HEADERS, getClientLemlistKey, json, requireAdmin } from '../_shared/adminAuth.ts'
import { getCampaignStatsForDay, listCampaigns, mapLemlistStatus } from '../_shared/lemlist.ts'

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: CORS_HEADERS })
  }

  const auth = await requireAdmin(req)
  if ('error' in auth) return auth.error
  const { admin } = auth

  const body = await req.json().catch(() => ({}) as { client_id?: string })
  const targetClientId = body.client_id

  let clientsQuery = admin
    .from('clients')
    .select('id, lemlist_api_key_secret_id')
    .not('lemlist_api_key_secret_id', 'is', null)

  if (targetClientId) {
    clientsQuery = clientsQuery.eq('id', targetClientId)
  }

  const { data: clients, error: clientsError } = await clientsQuery
  if (clientsError) {
    return json({ error: clientsError.message }, 500)
  }

  const today = new Date().toISOString().slice(0, 10)
  let syncedCampaigns = 0
  const errors: string[] = []

  for (const client of clients ?? []) {
    try {
      const apiKey = await getClientLemlistKey(admin, client.lemlist_api_key_secret_id as string | null)

      const lemlistCampaigns = await listCampaigns(apiKey)

      for (const lc of lemlistCampaigns) {
        const { data: campaignRow, error: campaignError } = await admin
          .from('campaigns')
          .upsert(
            {
              client_id: client.id,
              lemlist_campaign_id: lc._id,
              name: lc.name,
              status: mapLemlistStatus(lc.status),
            },
            { onConflict: 'client_id,lemlist_campaign_id' },
          )
          .select('id')
          .single()

        if (campaignError || !campaignRow) {
          errors.push(`campaign ${lc._id}: ${campaignError?.message}`)
          continue
        }

        const stats = await getCampaignStatsForDay(apiKey, lc._id, today)

        const { error: statsError } = await admin.from('campaign_stats_daily').upsert(
          {
            campaign_id: campaignRow.id,
            date: today,
            sent: stats.sent,
            opened: stats.opened,
            replied: stats.replied,
            clicked: stats.clicked,
            bounced: stats.bounced,
            unsubscribed: stats.unsubscribed,
            meetings_booked: stats.meetingsBooked,
            synced_at: new Date().toISOString(),
          },
          { onConflict: 'campaign_id,date' },
        )

        if (statsError) {
          errors.push(`stats for ${lc._id}: ${statsError.message}`)
          continue
        }

        syncedCampaigns++
      }

      await admin
        .from('clients')
        .update({ last_synced_at: new Date().toISOString() })
        .eq('id', client.id)
    } catch (err) {
      errors.push(`client ${client.id}: ${err instanceof Error ? err.message : String(err)}`)
    }
  }

  return json({ synced: syncedCampaigns, errors })
})
