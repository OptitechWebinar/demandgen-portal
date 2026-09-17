// Thin wrapper around the UpLead API (https://developer.uplead.com).
// Single shared org-wide key (UPLEAD_API_KEY Edge Function secret) — one
// UpLead seat used across every client's prospecting, unlike the
// per-client Lemlist keys.
//
// UNVERIFIED, same caveat as the Lemlist write operations: network egress
// to UpLead's docs is blocked in the sandbox this was written in. The
// search endpoint/payload below is the best-effort mapping to UpLead's
// documented "Search" API — verify against developer.uplead.com and
// adjust the request/response shape here before relying on it.

import type { IcpCriteria } from './types.ts'

const UPLEAD_API_BASE = 'https://api.uplead.com/v2'

export interface UpLeadProspect {
  id: string
  first_name?: string
  last_name?: string
  email?: string
  title?: string
  company_name?: string
  company_domain?: string
  linkedin_url?: string
  location?: string
  [key: string]: unknown
}

export async function searchProspects(
  apiKey: string,
  criteria: IcpCriteria,
  limit = 50,
): Promise<UpLeadProspect[]> {
  const res = await fetch(`${UPLEAD_API_BASE}/search/people`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      industries: criteria.industries,
      company_size_min: criteria.companySizeMin,
      company_size_max: criteria.companySizeMax,
      titles: criteria.titles,
      seniority: criteria.seniority,
      locations: criteria.geographies,
      signals: criteria.signals,
      limit,
    }),
  })

  if (!res.ok) {
    throw new Error(`UpLead search failed (${res.status}): ${await res.text()}`)
  }

  const data = await res.json()
  return Array.isArray(data) ? data : (data.results ?? data.people ?? [])
}
