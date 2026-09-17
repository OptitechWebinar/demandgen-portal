import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { createIcpProfile, deleteIcpProfile, fetchIcpProfiles, updateIcpProfile } from '../../lib/campaignWorkflow'
import { fetchClient } from '../../lib/adminData'
import type { Client, IcpCriteria, IcpProfile } from '../../types/database'
import { TagListInput } from '../../components/TagListInput'

const EMPTY_CRITERIA: IcpCriteria = {
  industries: [],
  companySizeMin: undefined,
  companySizeMax: undefined,
  titles: [],
  seniority: [],
  geographies: [],
  signals: [],
}

export function IcpBuilderPage() {
  const { id } = useParams<{ id: string }>()
  const [client, setClient] = useState<Client | null>(null)
  const [profiles, setProfiles] = useState<IcpProfile[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  const [editingId, setEditingId] = useState<string | 'new' | null>(null)
  const [name, setName] = useState('')
  const [criteria, setCriteria] = useState<IcpCriteria>(EMPTY_CRITERIA)

  async function load(clientId: string) {
    setLoading(true)
    try {
      const [clientRow, profileRows] = await Promise.all([fetchClient(clientId), fetchIcpProfiles(clientId)])
      setClient(clientRow)
      setProfiles(profileRows)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load ICP profiles')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (id) load(id)
  }, [id])

  function startNew() {
    setEditingId('new')
    setName('')
    setCriteria(EMPTY_CRITERIA)
  }

  function startEdit(profile: IcpProfile) {
    setEditingId(profile.id)
    setName(profile.name)
    setCriteria({ ...EMPTY_CRITERIA, ...profile.criteria })
  }

  async function handleSave() {
    if (!id || !name.trim()) return
    setSaving(true)
    try {
      if (editingId === 'new') {
        await createIcpProfile({ client_id: id, name, criteria })
      } else if (editingId) {
        await updateIcpProfile(editingId, criteria, name)
      }
      setEditingId(null)
      await load(id)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save ICP profile')
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete(profileId: string) {
    try {
      await deleteIcpProfile(profileId)
      setProfiles((prev) => prev.filter((p) => p.id !== profileId))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete ICP profile')
    }
  }

  if (loading) return <p className="text-sm text-slate-500">Loading ICP profiles…</p>
  if (!client) return <p className="text-sm text-slate-500">Client not found.</p>

  return (
    <div className="space-y-6">
      <div>
        <Link to={`/admin/clients/${id}`} className="text-sm text-indigo-600 hover:text-indigo-500">
          ← Back to {client.name}
        </Link>
        <div className="mt-2 flex items-center justify-between">
          <h1 className="text-2xl font-semibold text-slate-900">ICP Profiles</h1>
          <button
            type="button"
            onClick={startNew}
            className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-500"
          >
            New ICP profile
          </button>
        </div>
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}

      <div className="grid gap-6 lg:grid-cols-2">
        <div className="rounded-xl border border-slate-200 bg-white shadow-sm">
          <h2 className="border-b border-slate-200 px-4 py-3 text-sm font-medium text-slate-700">Saved profiles</h2>
          <ul className="divide-y divide-slate-100">
            {profiles.map((profile) => (
              <li key={profile.id} className="px-4 py-3">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-medium text-slate-900">{profile.name}</p>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => startEdit(profile)}
                      className="text-xs font-medium text-indigo-600 hover:text-indigo-500"
                    >
                      Edit
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDelete(profile.id)}
                      className="text-xs font-medium text-red-600 hover:text-red-500"
                    >
                      Delete
                    </button>
                  </div>
                </div>
                <div className="mt-1 flex flex-wrap gap-1">
                  {(profile.criteria.industries ?? []).map((tag) => (
                    <span key={tag} className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-500">
                      {tag}
                    </span>
                  ))}
                </div>
              </li>
            ))}
            {profiles.length === 0 && (
              <li className="px-4 py-6 text-center text-sm text-slate-400">No ICP profiles yet.</li>
            )}
          </ul>
        </div>

        {editingId && (
          <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
            <h2 className="text-sm font-medium text-slate-700">
              {editingId === 'new' ? 'New ICP profile' : 'Edit ICP profile'}
            </h2>
            <div className="mt-4 space-y-4">
              <div>
                <label className="block text-xs font-medium text-slate-500">Profile name</label>
                <input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g. Manufacturing plant managers"
                  className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                />
              </div>

              <TagListInput
                label="Industries"
                values={criteria.industries ?? []}
                onChange={(v) => setCriteria({ ...criteria, industries: v })}
                placeholder="Manufacturing, Distribution"
              />

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-500">Company size (min)</label>
                  <input
                    type="number"
                    value={criteria.companySizeMin ?? ''}
                    onChange={(e) =>
                      setCriteria({ ...criteria, companySizeMin: e.target.value ? Number(e.target.value) : undefined })
                    }
                    className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-500">Company size (max)</label>
                  <input
                    type="number"
                    value={criteria.companySizeMax ?? ''}
                    onChange={(e) =>
                      setCriteria({ ...criteria, companySizeMax: e.target.value ? Number(e.target.value) : undefined })
                    }
                    className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                  />
                </div>
              </div>

              <TagListInput
                label="Titles"
                values={criteria.titles ?? []}
                onChange={(v) => setCriteria({ ...criteria, titles: v })}
                placeholder="Plant Manager, VP Operations"
              />
              <TagListInput
                label="Seniority"
                values={criteria.seniority ?? []}
                onChange={(v) => setCriteria({ ...criteria, seniority: v })}
                placeholder="Director, VP, C-level"
              />
              <TagListInput
                label="Geography"
                values={criteria.geographies ?? []}
                onChange={(v) => setCriteria({ ...criteria, geographies: v })}
                placeholder="United States, Canada"
              />
              <TagListInput
                label="Signals"
                values={criteria.signals ?? []}
                onChange={(v) => setCriteria({ ...criteria, signals: v })}
                placeholder="Recently funded, hiring surge"
              />

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setEditingId(null)}
                  className="rounded-lg px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleSave}
                  disabled={saving || !name.trim()}
                  className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-500 disabled:opacity-60"
                >
                  {saving ? 'Saving…' : 'Save profile'}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
