// Shared plumbing for every admin-only Edge Function in this project:
// CORS, a JSON response helper, a service-role client, and a caller check
// that accepts either a signed-in admin or the service role itself
// (scheduled jobs call functions directly with the service role key).
import { createClient, type SupabaseClient } from 'npm:@supabase/supabase-js@2'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

export const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

export function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...CORS_HEADERS },
  })
}

export function serviceClient(): SupabaseClient {
  return createClient(SUPABASE_URL, SERVICE_ROLE_KEY)
}

export async function requireAdmin(
  req: Request,
): Promise<{ admin: SupabaseClient } | { error: Response }> {
  const authHeader = req.headers.get('Authorization') ?? ''
  const admin = serviceClient()

  if (authHeader === `Bearer ${SERVICE_ROLE_KEY}`) {
    return { admin }
  }

  const callerClient = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    global: { headers: { Authorization: authHeader } },
  })
  const { data: userData, error: userError } = await callerClient.auth.getUser()
  if (userError || !userData.user) {
    return { error: json({ error: 'Missing or invalid session' }, 401) }
  }

  const { data: profile } = await admin
    .from('profiles')
    .select('role')
    .eq('id', userData.user.id)
    .maybeSingle()

  if (profile?.role !== 'admin') {
    return { error: json({ error: 'Admins only' }, 403) }
  }

  return { admin }
}

/** Reads a client's decrypted Lemlist API key out of Supabase Vault. */
export async function getClientLemlistKey(
  admin: SupabaseClient,
  lemlistApiKeySecretId: string | null,
): Promise<string> {
  if (!lemlistApiKeySecretId) {
    throw new Error('This client has no Lemlist API key configured yet')
  }
  const { data, error } = await admin
    .schema('vault')
    .from('decrypted_secrets')
    .select('decrypted_secret')
    .eq('id', lemlistApiKeySecretId)
    .maybeSingle()

  if (error || !data?.decrypted_secret) {
    throw new Error('Could not read this client\'s Lemlist API key')
  }
  return data.decrypted_secret as string
}
