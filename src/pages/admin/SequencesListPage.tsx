import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { createSequence, fetchSequenceTemplates } from '../../lib/campaignWorkflow'
import type { Sequence } from '../../types/database'

export function SequencesListPage() {
  const navigate = useNavigate()
  const [sequences, setSequences] = useState<Sequence[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [creating, setCreating] = useState(false)

  async function load() {
    setLoading(true)
    try {
      setSequences(await fetchSequenceTemplates())
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load sequences')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
  }, [])

  async function handleCreate() {
    setCreating(true)
    try {
      const sequence = await createSequence({ name: 'Untitled sequence' })
      navigate(`/admin/sequences/${sequence.id}`)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create sequence')
      setCreating(false)
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">Sequence templates</h1>
          <p className="mt-1 text-sm text-slate-500">Reusable outreach sequences, shared across every client.</p>
        </div>
        <button
          type="button"
          onClick={handleCreate}
          disabled={creating}
          className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-500 disabled:opacity-60"
        >
          {creating ? 'Creating…' : 'New sequence'}
        </button>
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}

      <div className="rounded-xl border border-slate-200 bg-white shadow-sm">
        <ul className="divide-y divide-slate-100">
          {sequences.map((seq) => (
            <li key={seq.id}>
              <Link to={`/admin/sequences/${seq.id}`} className="block px-4 py-3 hover:bg-slate-50">
                <p className="text-sm font-medium text-slate-900">{seq.name}</p>
                {seq.description && <p className="text-xs text-slate-500">{seq.description}</p>}
              </Link>
            </li>
          ))}
          {!loading && sequences.length === 0 && (
            <li className="px-4 py-8 text-center text-sm text-slate-400">
              No sequence templates yet. Create one to reuse across clients.
            </li>
          )}
        </ul>
      </div>
    </div>
  )
}
