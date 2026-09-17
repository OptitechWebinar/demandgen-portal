// Pushes the current state of a campaign's sequence_steps (our DB is the
// source of truth — the admin edits steps there via the Sequence/Campaign
// UI) to the live Lemlist campaign. Steps are matched to Lemlist's side by
// `order`, so reordering, editing, and adding new step_order values are
// all just an upsertSequenceStep call; deleting a step calls
// removeSequenceStep for the order values no longer present.
//
// Known limitation: we don't track Lemlist-side step identity beyond
// `order`, so if Lemlist itself doesn't treat `order` as a stable slot key
// for upsert-by-order, this needs adjusting once tested against a real
// campaign (see the write-operations warning in _shared/lemlist.ts).
import { CORS_HEADERS, getClientLemlistKey, json, requireAdmin } from '../_shared/adminAuth.ts'
import { removeSequenceStep, upsertSequenceStep } from '../_shared/lemlist.ts'

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: CORS_HEADERS })
  }

  const auth = await requireAdmin(req)
  if ('error' in auth) return auth.error
  const { admin } = auth

  const { campaign_id, removed_step_orders } = (await req.json().catch(() => ({}))) as {
    campaign_id?: string
    removed_step_orders?: number[]
  }
  if (!campaign_id) return json({ error: 'campaign_id is required' }, 400)

  const { data: campaign, error: campaignError } = await admin
    .from('campaigns')
    .select('id, client_id, lemlist_campaign_id, sequence_id')
    .eq('id', campaign_id)
    .maybeSingle()
  if (campaignError) return json({ error: campaignError.message }, 500)
  if (!campaign?.lemlist_campaign_id) return json({ error: 'Campaign has not been launched yet' }, 400)
  if (!campaign.sequence_id) return json({ error: 'Campaign has no sequence attached' }, 400)

  const { data: client } = await admin
    .from('clients')
    .select('lemlist_api_key_secret_id')
    .eq('id', campaign.client_id)
    .maybeSingle()

  try {
    const apiKey = await getClientLemlistKey(admin, client?.lemlist_api_key_secret_id as string | null)

    const { data: steps, error: stepsError } = await admin
      .from('sequence_steps')
      .select('*')
      .eq('sequence_id', campaign.sequence_id)
      .order('step_order', { ascending: true })
    if (stepsError) throw new Error(stepsError.message)

    for (const step of steps ?? []) {
      await upsertSequenceStep(apiKey, campaign.lemlist_campaign_id, {
        order: step.step_order,
        channel: step.channel,
        delay: step.delay_days,
        subject: step.subject ?? undefined,
        body: step.body,
      })
    }

    for (const order of removed_step_orders ?? []) {
      await removeSequenceStep(apiKey, campaign.lemlist_campaign_id, order)
    }

    return json({ synced_steps: (steps ?? []).length })
  } catch (err) {
    return json({ error: err instanceof Error ? err.message : 'Failed to sync sequence' }, 502)
  }
})
