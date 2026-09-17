// Thin wrapper around the Lemlist REST API (https://api.lemlist.com/api).
// Auth is HTTP Basic with an empty username and the account's API key as
// the password, per Lemlist's documented convention.
//
// Field mapping for reads was confirmed against a live account's campaign
// stats response: campaign ids are `cam_xxx`, and per-period stats live
// under `messageMetrics.{sent,opened,replied,clicked,bounced}` plus
// `channelMetrics.meetingBooked`. If Lemlist changes these field names,
// this is the one file that needs updating.
//
// WRITE OPERATIONS BELOW ARE UNVERIFIED. Network egress to
// developer.lemlist.com is blocked in the sandbox this was written in, so
// the create/lead/sequence/pause endpoints are the best-effort mapping to
// Lemlist's long-documented REST conventions, not confirmed against a live
// call the way the read path above was. Before launching a real client
// campaign through this code, do one dry run against a disposable/test
// Lemlist campaign and fix any endpoint or payload mismatch here first —
// a wrong path here fails a real client launch, not just a stats number.

const LEMLIST_API_BASE = 'https://api.lemlist.com/api'

export interface LemlistCampaign {
  _id: string
  name: string
  status?: string
}

export interface LemlistDayStats {
  sent: number
  opened: number
  replied: number
  clicked: number
  bounced: number
  unsubscribed: number
  meetingsBooked: number
}

function authHeaders(apiKey: string): HeadersInit {
  return { Authorization: `Basic ${btoa(':' + apiKey)}` }
}

export async function listCampaigns(apiKey: string): Promise<LemlistCampaign[]> {
  const res = await fetch(`${LEMLIST_API_BASE}/campaigns`, { headers: authHeaders(apiKey) })
  if (!res.ok) {
    throw new Error(`Lemlist campaigns list failed (${res.status}): ${await res.text()}`)
  }
  const data = await res.json()
  return Array.isArray(data) ? data : (data.campaigns ?? [])
}

/** Maps a Lemlist campaign status to our internal campaign status. */
export function mapLemlistStatus(status?: string): 'draft' | 'active' | 'paused' | 'completed' {
  switch (status) {
    case 'running':
      return 'active'
    case 'paused':
      return 'paused'
    case 'ended':
    case 'archived':
      return 'completed'
    default:
      return 'draft'
  }
}

export async function getCampaignStatsForDay(
  apiKey: string,
  campaignId: string,
  date: string, // YYYY-MM-DD
): Promise<LemlistDayStats> {
  const url = `${LEMLIST_API_BASE}/campaigns/${campaignId}/stats?startDate=${date}&endDate=${date}`
  const res = await fetch(url, { headers: authHeaders(apiKey) })
  if (!res.ok) {
    throw new Error(
      `Lemlist stats fetch failed for campaign ${campaignId} on ${date} (${res.status}): ${await res.text()}`,
    )
  }
  const data = await res.json()
  const messageMetrics = data.messageMetrics ?? {}
  const channelMetrics = data.channelMetrics ?? {}

  return {
    sent: messageMetrics.sent ?? 0,
    opened: messageMetrics.opened ?? 0,
    replied: messageMetrics.replied ?? 0,
    clicked: messageMetrics.clicked ?? 0,
    bounced: messageMetrics.bounced ?? 0,
    unsubscribed:
      messageMetrics.perChannel?.email?.unsubscribed ?? data.leadMetrics?.unsubscribed ?? 0,
    meetingsBooked: channelMetrics.meetingBooked ?? 0,
  }
}

// --- Write operations (see the file-header warning) ------------------------

export interface LemlistLead {
  email: string
  firstName?: string
  lastName?: string
  companyName?: string
  linkedinUrl?: string
  title?: string
  [key: string]: unknown
}

export interface LemlistSequenceStepInput {
  order: number
  channel: 'email' | 'linkedin' | 'sms' | 'whatsapp'
  delay: number // days
  subject?: string
  body: string
}

async function lemlistFetch(apiKey: string, path: string, init: RequestInit = {}) {
  const res = await fetch(`${LEMLIST_API_BASE}${path}`, {
    ...init,
    headers: {
      ...authHeaders(apiKey),
      'Content-Type': 'application/json',
      ...(init.headers ?? {}),
    },
  })
  if (!res.ok) {
    throw new Error(`Lemlist ${init.method ?? 'GET'} ${path} failed (${res.status}): ${await res.text()}`)
  }
  const text = await res.text()
  return text ? JSON.parse(text) : null
}

export async function createCampaign(apiKey: string, name: string): Promise<LemlistCampaign> {
  return lemlistFetch(apiKey, '/campaigns', {
    method: 'POST',
    body: JSON.stringify({ name }),
  })
}

/** Replaces a campaign's sequence with the given ordered steps. */
export async function setSequenceSteps(
  apiKey: string,
  campaignId: string,
  steps: LemlistSequenceStepInput[],
): Promise<void> {
  for (const step of steps) {
    await lemlistFetch(apiKey, `/campaigns/${campaignId}/sequences`, {
      method: 'POST',
      body: JSON.stringify({
        order: step.order,
        type: step.channel,
        delay: step.delay,
        subject: step.subject,
        text: step.body,
      }),
    })
  }
}

/** Adds or updates a single sequence step on a (possibly live) campaign. */
export async function upsertSequenceStep(
  apiKey: string,
  campaignId: string,
  step: LemlistSequenceStepInput,
): Promise<void> {
  await lemlistFetch(apiKey, `/campaigns/${campaignId}/sequences`, {
    method: 'POST',
    body: JSON.stringify({
      order: step.order,
      type: step.channel,
      delay: step.delay,
      subject: step.subject,
      text: step.body,
    }),
  })
}

export async function removeSequenceStep(
  apiKey: string,
  campaignId: string,
  stepOrder: number,
): Promise<void> {
  await lemlistFetch(apiKey, `/campaigns/${campaignId}/sequences/${stepOrder}`, {
    method: 'DELETE',
  })
}

export async function addLead(apiKey: string, campaignId: string, lead: LemlistLead): Promise<void> {
  const { email, ...rest } = lead
  await lemlistFetch(apiKey, `/campaigns/${campaignId}/leads/${encodeURIComponent(email)}`, {
    method: 'POST',
    body: JSON.stringify(rest),
  })
}

export async function addLeads(apiKey: string, campaignId: string, leads: LemlistLead[]): Promise<void> {
  for (const lead of leads) {
    await addLead(apiKey, campaignId, lead)
  }
}

export async function removeLead(apiKey: string, campaignId: string, email: string): Promise<void> {
  await lemlistFetch(apiKey, `/campaigns/${campaignId}/leads/${encodeURIComponent(email)}`, {
    method: 'DELETE',
  })
}

export async function setCampaignState(
  apiKey: string,
  campaignId: string,
  state: 'paused' | 'running',
): Promise<void> {
  await lemlistFetch(apiKey, `/campaigns/${campaignId}/${state === 'paused' ? 'pause' : 'start'}`, {
    method: 'POST',
  })
}
