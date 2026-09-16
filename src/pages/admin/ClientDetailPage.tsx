import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import {
  fetchAllCampaigns,
  fetchClient,
  fetchClients,
  reassignCampaign,
  triggerSync,
  updateClient,
} from '../../lib/adminData'
import type { Campaign, Client, ClientStatus, ProvisioningStatus } from '../../types/database'
import { ProvisioningTracker } from '../../components/ProvisioningTracker'
import { StatusBadge } from '../../components/StatusBadge'

const CLIENT_STATUSES: ClientStatus[] = ['active', 'paused', 'offboarded']
const PROVISIONING_STATUSES: ProvisioningStatus[] = [
  'domain_pending',
  'domain_purchased',
  'mailbox_warming',
  'lemlist_connected',
  'live',
]

export function ClientDetailPage() {
  const { id } = useParams<{ id: string }>()
  const [client, setClient] = useState<Client | null>(null)
  const [allClients, setAllClients] = useState<Client[]>([])
  const [campaigns, setCampaigns] = useState<Campaign[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [syncing, setSyncing] = useState(false)
  const [apiKeyInput, setApiKeyInput] = useState('')

  async function load(clientId: string) {
    setLoading(true)
    try {
      const [clientRow, clientsList, campaignRows] = await Promise.all([
        fetchClient(clientId),
        fetchClients(),
        fetchAllCampaigns(),
      ])
      setClient(clientRow)
      setAllClients(clientsList)
      setCampaigns(campaignRows.filter((c) => c.client_id === clientId))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load client')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (id) load(id)
  }, [id])

  async function handleFieldSave(field: 'sending_domain' | 'sender_email', value: string) {
    if (!client) return
    setSaving(true)
    try {
      await updateClient(client.id, { [field]: value })
      setClient({ ...client, [field]: value })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save')
    } finally {
      setSaving(false)
    }
  }

  async function handleStatusChange(status: ClientStatus) {
    if (!client) return
    setSaving(true)
    try {
      await updateClient(client.id, { status })
      setClient({ ...client, status })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save')
    } finally {
      setSaving(false)
    }
  }

  async function handleProvisioningChange(provisioning_status: ProvisioningStatus) {
    if (!client) return
    setSaving(true)
    try {
      await updateClient(client.id, { provisioning_status })
      setClient({ ...client, provisioning_status })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save')
    } finally {
      setSaving(false)
    }
  }

  async function handleApiKeySave() {
    if (!client || !apiKeyInput) return
    setSaving(true)
    try {
      await updateClient(client.id, { lemlist_api_key: apiKeyInput })
      setApiKeyInput('')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save API key')
    } finally {
      setSaving(false)
    }
  }

  async function handleSync() {
    if (!client) return
    setSyncing(true)
    try {
      await triggerSync(client.id)
      await load(client.id)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Sync failed')
    } finally {
      setSyncing(false)
    }
  }

  async function handleReassign(campaignId: string, newClientId: string) {
    try {
      await reassignCampaign(campaignId, newClientId)
      setCampaigns((prev) => prev.filter((c) => c.id !== campaignId))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to reassign campaign')
    }
  }

  if (loading) return <p className="text-sm text-slate-500">Loading client…</p>
  if (error && !client) return <p className="text-sm text-red-600">{error}</p>
  if (!client) return <p className="text-sm text-slate-500">Client not found.</p>

  return (
    <div className="space-y-8">
      <div>
        <Link to="/admin" className="text-sm text-indigo-600 hover:text-indigo-500">
          ← Back to clients
        </Link>
        <div className="mt-2 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-semibold text-slate-900">{client.name}</h1>
            <select
              value={client.status}
              onChange={(e) => handleStatusChange(e.target.value as ClientStatus)}
              disabled={saving}
              className="rounded-lg border border-slate-300 px-2 py-1 text-xs font-medium"
            >
              {CLIENT_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </div>
          <button
            type="button"
            onClick={handleSync}
            disabled={syncing}
            className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-500 disabled:opacity-60"
          >
            {syncing ? 'Syncing…' : 'Sync now'}
          </button>
        </div>
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}

      <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="text-sm font-medium text-slate-700">Provisioning</h2>
        <div className="mt-4">
          <ProvisioningTracker status={client.provisioning_status} />
        </div>
        <select
          value={client.provisioning_status}
          onChange={(e) => handleProvisioningChange(e.target.value as ProvisioningStatus)}
          disabled={saving}
          className="mt-4 rounded-lg border border-slate-300 px-2 py-1.5 text-sm"
        >
          {PROVISIONING_STATUSES.map((s) => (
            <option key={s} value={s}>
              {s.replace(/_/g, ' ')}
            </option>
          ))}
        </select>
      </section>

      <section className="grid gap-6 sm:grid-cols-2">
        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="text-sm font-medium text-slate-700">Sending identity</h2>
          <div className="mt-4 space-y-3">
            <div>
              <label className="block text-xs font-medium text-slate-500">Sending domain</label>
              <input
                defaultValue={client.sending_domain ?? ''}
                onBlur={(e) => handleFieldSave('sending_domain', e.target.value)}
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-500">Sender email</label>
              <input
                defaultValue={client.sender_email ?? ''}
                onBlur={(e) => handleFieldSave('sender_email', e.target.value)}
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
              />
            </div>
          </div>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="text-sm font-medium text-slate-700">Lemlist API key</h2>
          <p className="mt-1 text-xs text-slate-400">
            This client's own Lemlist account key. Write-only — never displayed once saved.
          </p>
          <div className="mt-3 flex gap-2">
            <input
              type="password"
              value={apiKeyInput}
              onChange={(e) => setApiKeyInput(e.target.value)}
              placeholder="Enter new key to rotate"
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
            />
            <button
              type="button"
              onClick={handleApiKeySave}
              disabled={saving || !apiKeyInput}
              className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100 disabled:opacity-60"
            >
              Save
            </button>
          </div>
        </div>
      </section>

      <section className="rounded-xl border border-slate-200 bg-white shadow-sm">
        <h2 className="border-b border-slate-200 px-4 py-3 text-sm font-medium text-slate-700">Campaigns</h2>
        <ul className="divide-y divide-slate-100">
          {campaigns.map((campaign) => (
            <li key={campaign.id} className="flex items-center justify-between px-4 py-3">
              <div>
                <p className="text-sm font-medium text-slate-900">{campaign.name}</p>
                <p className="text-xs text-slate-400">{campaign.vertical ?? 'No vertical'}</p>
              </div>
              <div className="flex items-center gap-3">
                <StatusBadge status={campaign.status} />
                <select
                  defaultValue=""
                  onChange={(e) => {
                    if (e.target.value) handleReassign(campaign.id, e.target.value)
                  }}
                  className="rounded-lg border border-slate-300 px-2 py-1 text-xs"
                >
                  <option value="" disabled>
                    Reassign to…
                  </option>
                  {allClients
                    .filter((c) => c.id !== client.id)
                    .map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                </select>
              </div>
            </li>
          ))}
          {campaigns.length === 0 && (
            <li className="px-4 py-6 text-center text-sm text-slate-400">
              No campaigns synced for this client yet.
            </li>
          )}
        </ul>
      </section>
    </div>
  )
}
