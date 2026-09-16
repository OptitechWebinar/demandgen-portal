// Thin wrapper around the Lemlist REST API (https://api.lemlist.com/api).
// Auth is HTTP Basic with an empty username and the account's API key as
// the password, per Lemlist's documented convention.
//
// Field mapping below was confirmed against a live account's campaign
// stats response: campaign ids are `cam_xxx`, and per-period stats live
// under `messageMetrics.{sent,opened,replied,clicked,bounced}` plus
// `channelMetrics.meetingBooked`. If Lemlist changes these field names,
// this is the one file that needs updating.

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
