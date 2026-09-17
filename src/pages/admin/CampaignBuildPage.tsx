import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { fetchClient } from '../../lib/adminData'
import {
  attachProspectsToCampaign,
  cloneSequenceForClient,
  controlCampaign,
  detachProspectFromCampaign,
  fetchCampaign,
  fetchProspectsForCampaign,
  fetchSequenceTemplates,
  fetchStagedProspects,
  launchCampaign,
  manageLeads,
  updateCampaign,
} from '../../lib/campaignWorkflow'
import type { Campaign, Client, Prospect, Sequence } from '../../types/database'
import { StatusBadge } from '../../components/StatusBadge'

export function CampaignBuildPage() {
  const { id } = useParams<{ id: string }>()
  const [campaign, setCampaign] = useState<Campaign | null>(null)
  const [client, setClient] = useState<Client | null>(null)
  const [templates, setTemplates] = useState<Sequence[]>([])
  const [attached, setAttached] = useState<Prospect[]>([])
  const [available, setAvailable] = useState<Prospect[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [selectedTemplateId, setSelectedTemplateId] = useState('')
  const [selectedAvailable, setSelectedAvailable] = useState<Set<string>>(new Set())

  async function load(campaignId: string) {
    setLoading(true)
    try {
      const campaignRow = await fetchCampaign(campaignId)
      if (!campaignRow) throw new Error('Campaign not found')
      const [clientRow, templateRows, attachedRows, availableRows] = await Promise.all([
        fetchClient(campaignRow.client_id),
        fetchSequenceTemplates(),
        fetchProspectsForCampaign(campaignId),
        fetchStagedProspects(campaignRow.client_id),
      ])
      setCampaign(campaignRow)
      setClient(clientRow)
      setTemplates(templateRows)
      setAttached(attachedRows.filter((p) => p.status !== 'rejected'))
      setAvailable(availableRows)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load campaign')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (id) load(id)
  }, [id])

  async function handleUseTemplate() {
    if (!campaign || !selectedTemplateId) return
    setBusy(true)
    try {
      const clone = await cloneSequenceForClient(selectedTemplateId, campaign.client_id)
      await updateCampaign(campaign.id, { sequence_id: clone.id })
      await load(campaign.id)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to attach sequence')
    } finally {
      setBusy(false)
    }
  }

  async function handleAttachSelected() {
    if (!campaign) return
    setBusy(true)
    try {
      await attachProspectsToCampaign(Array.from(selectedAvailable), campaign.id)
      setSelectedAvailable(new Set())
      await load(campaign.id)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to attach prospects')
    } finally {
      setBusy(false)
    }
  }

  async function handleDetach(prospectId: string) {
    try {
      await detachProspectFromCampaign(prospectId)
      if (campaign) await load(campaign.id)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to remove prospect')
    }
  }

  async function handleLaunch() {
    if (!campaign) return
    setBusy(true)
    setError(null)
    try {
      await launchCampaign(campaign.id)
      await load(campaign.id)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Launch failed')
      await load(campaign.id)
    } finally {
      setBusy(false)
    }
  }

  async function handlePauseResume(action: 'pause' | 'resume') {
    if (!campaign) return
    setBusy(true)
    try {
      await controlCampaign(campaign.id, action)
      await load(campaign.id)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update campaign')
    } finally {
      setBusy(false)
    }
  }

  async function handleRemoveLead(prospect: Prospect) {
    if (!campaign) return
    setBusy(true)
    try {
      await manageLeads(campaign.id, { remove: [prospect.id] })
      await load(campaign.id)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to remove lead')
    } finally {
      setBusy(false)
    }
  }

  async function handleAddLeads() {
    if (!campaign) return
    setBusy(true)
    try {
      await manageLeads(campaign.id, { add: Array.from(selectedAvailable) })
      setSelectedAvailable(new Set())
      await load(campaign.id)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to add leads')
    } finally {
      setBusy(false)
    }
  }

  if (loading) return <p className="text-sm text-slate-500">Loading campaign…</p>
  if (!campaign || !client) return <p className="text-sm text-slate-500">Campaign not found.</p>

  const isLaunched = Boolean(campaign.lemlist_campaign_id)

  return (
    <div className="space-y-6">
      <div>
        <Link to={`/admin/clients/${client.id}`} className="text-sm text-indigo-600 hover:text-indigo-500">
          ← Back to {client.name}
        </Link>
        <div className="mt-2 flex items-center gap-3">
          <h1 className="text-2xl font-semibold text-slate-900">{campaign.name}</h1>
          <StatusBadge status={campaign.status} />
        </div>
      </div>

      {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
      {campaign.launch_error && !error && (
        <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
          Last launch attempt failed: {campaign.launch_error}
        </p>
      )}

      {isLaunched && (
        <div className="flex items-center justify-between rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <p className="text-sm text-slate-600">
            Live in Lemlist as <span className="font-mono text-xs">{campaign.lemlist_campaign_id}</span>
          </p>
          <div className="flex gap-2">
            {campaign.status === 'active' ? (
              <button
                type="button"
                onClick={() => handlePauseResume('pause')}
                disabled={busy}
                className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-600 hover:bg-slate-100 disabled:opacity-60"
              >
                Pause
              </button>
            ) : (
              <button
                type="button"
                onClick={() => handlePauseResume('resume')}
                disabled={busy}
                className="rounded-lg bg-indigo-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-indigo-500 disabled:opacity-60"
              >
                Resume
              </button>
            )}
            {campaign.sequence_id && (
              <Link
                to={`/admin/sequences/${campaign.sequence_id}`}
                className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-600 hover:bg-slate-100"
              >
                Edit sequence
              </Link>
            )}
          </div>
        </div>
      )}

      {!isLaunched && (
        <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="text-sm font-medium text-slate-700">Sequence</h2>
          {campaign.sequence_id ? (
            <div className="mt-3 flex items-center justify-between">
              <p className="text-sm text-slate-600">Sequence attached.</p>
              <Link
                to={`/admin/sequences/${campaign.sequence_id}`}
                className="text-sm font-medium text-indigo-600 hover:text-indigo-500"
              >
                Edit steps
              </Link>
            </div>
          ) : (
            <div className="mt-3 flex items-end gap-3">
              <div className="flex-1">
                <label className="block text-xs font-medium text-slate-500">Start from a template</label>
                <select
                  value={selectedTemplateId}
                  onChange={(e) => setSelectedTemplateId(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                >
                  <option value="">Select a template…</option>
                  {templates.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name}
                    </option>
                  ))}
                </select>
              </div>
              <button
                type="button"
                onClick={handleUseTemplate}
                disabled={busy || !selectedTemplateId}
                className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-500 disabled:opacity-60"
              >
                Use template
              </button>
            </div>
          )}
        </section>
      )}

      <section className="rounded-xl border border-slate-200 bg-white shadow-sm">
        <h2 className="border-b border-slate-200 px-4 py-3 text-sm font-medium text-slate-700">
          {isLaunched ? 'Attached leads' : 'Attached prospects'} ({attached.length})
        </h2>
        <ul className="divide-y divide-slate-100">
          {attached.map((p) => (
            <li key={p.id} className="flex items-center justify-between px-4 py-3">
              <div>
                <p className="text-sm font-medium text-slate-900">
                  {p.first_name} {p.last_name}
                </p>
                <p className="text-xs text-slate-500">
                  {p.title} {p.company_name ? `@ ${p.company_name}` : ''} — {p.email}
                </p>
              </div>
              <button
                type="button"
                onClick={() => (isLaunched ? handleRemoveLead(p) : handleDetach(p.id))}
                className="text-xs font-medium text-red-600 hover:text-red-500"
              >
                Remove
              </button>
            </li>
          ))}
          {attached.length === 0 && (
            <li className="px-4 py-6 text-center text-sm text-slate-400">No prospects attached yet.</li>
          )}
        </ul>
      </section>

      <section className="rounded-xl border border-slate-200 bg-white shadow-sm">
        <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
          <h2 className="text-sm font-medium text-slate-700">Available staged prospects ({available.length})</h2>
          <div className="flex items-center gap-2">
            <Link
              to={`/admin/clients/${client.id}/prospecting`}
              className="text-xs font-medium text-indigo-600 hover:text-indigo-500"
            >
              Go prospecting
            </Link>
            <button
              type="button"
              onClick={isLaunched ? handleAddLeads : handleAttachSelected}
              disabled={busy || selectedAvailable.size === 0}
              className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-100 disabled:opacity-60"
            >
              {isLaunched ? 'Add selected as leads' : 'Attach selected'} ({selectedAvailable.size})
            </button>
          </div>
        </div>
        <ul className="divide-y divide-slate-100">
          {available.map((p) => (
            <li key={p.id} className="flex items-center gap-3 px-4 py-3">
              <input
                type="checkbox"
                checked={selectedAvailable.has(p.id)}
                onChange={(e) => {
                  const next = new Set(selectedAvailable)
                  if (e.target.checked) next.add(p.id)
                  else next.delete(p.id)
                  setSelectedAvailable(next)
                }}
              />
              <div>
                <p className="text-sm font-medium text-slate-900">
                  {p.first_name} {p.last_name}
                </p>
                <p className="text-xs text-slate-500">
                  {p.title} {p.company_name ? `@ ${p.company_name}` : ''} — {p.email}
                </p>
              </div>
            </li>
          ))}
          {available.length === 0 && (
            <li className="px-4 py-6 text-center text-sm text-slate-400">No unassigned staged prospects.</li>
          )}
        </ul>
      </section>

      {!isLaunched && (
        <div className="flex justify-end">
          <button
            type="button"
            onClick={handleLaunch}
            disabled={busy || !campaign.sequence_id || attached.length === 0}
            className="rounded-lg bg-indigo-600 px-6 py-2.5 text-sm font-medium text-white hover:bg-indigo-500 disabled:opacity-60"
          >
            {busy ? 'Launching…' : 'Launch campaign'}
          </button>
        </div>
      )}
    </div>
  )
}
