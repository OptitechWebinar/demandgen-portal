// Pushes a campaign built in this app into the client's Lemlist account:
// creates the campaign, pushes its sequence steps, imports staged
// prospects as leads, and activates it. Idempotent-ish: if a previous
// attempt already created the Lemlist campaign (lemlist_campaign_id set)
// but failed partway through, retrying reuses it instead of creating a
// duplicate.
import { CORS_HEADERS, getClientLemlistKey, json, requireAdmin } from '../_shared/adminAuth.ts'
import { addLeads, createCampaign, setCampaignState, setSequenceSteps } from '../_shared/lemlist.ts'

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: CORS_HEADERS })
  }

  const auth = await requireAdmin(req)
  if ('error' in auth) return auth.error
  const { admin } = auth

  const { campaign_id } = (await req.json().catch(() => ({}))) as { campaign_id?: string }
  if (!campaign_id) return json({ error: 'campaign_id is required' }, 400)

  const { data: campaign, error: campaignError } = await admin
    .from('campaigns')
    .select('id, client_id, name, lemlist_campaign_id, sequence_id')
    .eq('id', campaign_id)
    .maybeSingle()
  if (campaignError) return json({ error: campaignError.message }, 500)
  if (!campaign) return json({ error: 'Campaign not found' }, 404)
  if (!campaign.sequence_id) return json({ error: 'Campaign has no sequence attached' }, 400)

  const { data: client, error: clientError } = await admin
    .from('clients')
    .select('lemlist_api_key_secret_id')
    .eq('id', campaign.client_id)
    .maybeSingle()
  if (clientError || !client) return json({ error: 'Client not found' }, 404)

  const recordFailure = async (message: string) => {
    await admin.from('campaigns').update({ launch_error: message }).eq('id', campaign_id)
  }

  try {
    const apiKey = await getClientLemlistKey(admin, client.lemlist_api_key_secret_id as string | null)

    // 1. Create (or reuse) the Lemlist campaign, persisting the id
    //    immediately so a later failure doesn't orphan it.
    let lemlistCampaignId = campaign.lemlist_campaign_id as string | null
    if (!lemlistCampaignId) {
      const created = await createCampaign(apiKey, campaign.name)
      lemlistCampaignId = created._id
      await admin.from('campaigns').update({ lemlist_campaign_id: lemlistCampaignId }).eq('id', campaign_id)
    }

    // 2. Push the sequence.
    const { data: steps, error: stepsError } = await admin
      .from('sequence_steps')
      .select('*')
      .eq('sequence_id', campaign.sequence_id)
      .order('step_order', { ascending: true })
    if (stepsError) throw new Error(`Loading sequence steps: ${stepsError.message}`)

    await setSequenceSteps(
      apiKey,
      lemlistCampaignId,
      (steps ?? []).map((s) => ({
        order: s.step_order,
        channel: s.channel,
        delay: s.delay_days,
        subject: s.subject ?? undefined,
        body: s.body,
      })),
    )

    // 3. Import staged prospects attached to this campaign as leads.
    const { data: prospects, error: prospectsError } = await admin
      .from('prospects')
      .select('*')
      .eq('campaign_id', campaign_id)
      .eq('status', 'staged')
    if (prospectsError) throw new Error(`Loading prospects: ${prospectsError.message}`)

    const leadsToAdd = (prospects ?? []).filter((p) => p.email)
    if (leadsToAdd.length > 0) {
      await addLeads(
        apiKey,
        lemlistCampaignId,
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
        .update({ status: 'attached' })
        .in(
          'id',
          leadsToAdd.map((p) => p.id),
        )
    }

    // 4. Activate.
    await setCampaignState(apiKey, lemlistCampaignId, 'running')

    await admin
      .from('campaigns')
      .update({
        status: 'active',
        launched_at: new Date().toISOString(),
        launch_error: null,
      })
      .eq('id', campaign_id)

    return json({ lemlist_campaign_id: lemlistCampaignId, leads_added: leadsToAdd.length })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Launch failed'
    await recordFailure(message)
    return json({ error: message }, 502)
  }
})
