// Admin-only proxy to UpLead's search API, so the shared org-wide UpLead
// key never reaches the browser. Returns candidates for the admin to
// review; it does NOT write to `prospects` itself — the frontend inserts
// whichever rows the admin chooses to stage (admin already bypasses RLS).
import { CORS_HEADERS, json, requireAdmin } from '../_shared/adminAuth.ts'
import { searchProspects } from '../_shared/uplead.ts'
import type { IcpCriteria } from '../_shared/types.ts'

const UPLEAD_API_KEY = Deno.env.get('UPLEAD_API_KEY')!

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: CORS_HEADERS })
  }

  const auth = await requireAdmin(req)
  if ('error' in auth) return auth.error
  const { admin } = auth

  const body = (await req.json().catch(() => ({}))) as {
    icp_profile_id?: string
    criteria?: IcpCriteria
    limit?: number
  }

  let criteria = body.criteria ?? {}
  if (body.icp_profile_id) {
    const { data: icp, error } = await admin
      .from('icp_profiles')
      .select('criteria')
      .eq('id', body.icp_profile_id)
      .maybeSingle()
    if (error) return json({ error: error.message }, 500)
    if (!icp) return json({ error: 'ICP profile not found' }, 404)
    criteria = icp.criteria as IcpCriteria
  }

  try {
    const results = await searchProspects(UPLEAD_API_KEY, criteria, body.limit ?? 50)
    const prospects = results.map((p) => ({
      external_id: p.id,
      first_name: p.first_name ?? null,
      last_name: p.last_name ?? null,
      email: p.email ?? null,
      title: p.title ?? null,
      company_name: p.company_name ?? null,
      company_domain: p.company_domain ?? null,
      linkedin_url: p.linkedin_url ?? null,
      location: p.location ?? null,
      raw: p,
    }))
    return json({ prospects })
  } catch (err) {
    return json({ error: err instanceof Error ? err.message : 'UpLead search failed' }, 502)
  }
})
