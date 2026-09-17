import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import {
  deleteSequence,
  fetchCampaignBySequenceId,
  fetchSequence,
  fetchSequenceSteps,
  saveSequenceSteps,
  syncSequenceToLemlist,
  updateSequenceMeta,
} from '../../lib/campaignWorkflow'
import type { Campaign, Sequence, SequenceChannel, SequenceStepWrite } from '../../types/database'

const CHANNELS: SequenceChannel[] = ['email', 'linkedin', 'sms', 'whatsapp']

const VARIABLE_HINT = '{{firstName}} {{lastName}} {{companyName}} {{title}}'

interface EditableStep extends SequenceStepWrite {
  key: string
}

function withOrders(steps: EditableStep[]): EditableStep[] {
  return steps.map((s, i) => ({ ...s, step_order: i + 1 }))
}

export function SequenceEditorPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const [sequence, setSequence] = useState<Sequence | null>(null)
  const [steps, setSteps] = useState<EditableStep[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // A client-owned sequence copy belongs to exactly one campaign; if that
  // campaign has launched, edits here need pushing to the live Lemlist
  // sequence too.
  const [linkedCampaign, setLinkedCampaign] = useState<Campaign | null>(null)

  useEffect(() => {
    if (!id) return
    let cancelled = false

    async function load(sequenceId: string) {
      setLoading(true)
      try {
        const [seq, stepRows] = await Promise.all([fetchSequence(sequenceId), fetchSequenceSteps(sequenceId)])
        if (cancelled) return
        setSequence(seq)
        if (seq?.client_id) {
          const campaign = await fetchCampaignBySequenceId(sequenceId)
          if (!cancelled) setLinkedCampaign(campaign)
        }
        setSteps(
          stepRows.map((s) => ({
            key: s.id,
            sequence_id: sequenceId,
            step_order: s.step_order,
            channel: s.channel,
            delay_days: s.delay_days,
            subject: s.subject,
            body: s.body,
          })),
        )
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Failed to load sequence')
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    load(id)
    return () => {
      cancelled = true
    }
  }, [id])

  function addStep() {
    setSteps((prev) =>
      withOrders([
        ...prev,
        {
          key: `new-${Date.now()}`,
          sequence_id: id!,
          step_order: prev.length + 1,
          channel: 'email',
          delay_days: prev.length === 0 ? 0 : 2,
          subject: '',
          body: '',
        },
      ]),
    )
  }

  function updateStep(key: string, patch: Partial<EditableStep>) {
    setSteps((prev) => prev.map((s) => (s.key === key ? { ...s, ...patch } : s)))
  }

  function removeStep(key: string) {
    setSteps((prev) => withOrders(prev.filter((s) => s.key !== key)))
  }

  function moveStep(index: number, direction: -1 | 1) {
    setSteps((prev) => {
      const next = [...prev]
      const target = index + direction
      if (target < 0 || target >= next.length) return prev
      ;[next[index], next[target]] = [next[target], next[index]]
      return withOrders(next)
    })
  }

  async function handleSaveName(name: string, description: string) {
    if (!id) return
    try {
      await updateSequenceMeta(id, { name, description: description || null })
      setSequence((prev) => (prev ? { ...prev, name, description } : prev))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save')
    }
  }

  async function handleSaveSteps() {
    if (!id) return
    setSaving(true)
    setError(null)
    try {
      await saveSequenceSteps(
        id,
        steps.map(({ key: _key, ...rest }) => rest),
      )
      if (linkedCampaign?.lemlist_campaign_id) {
        await syncSequenceToLemlist(linkedCampaign.id)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save steps')
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete() {
    if (!id) return
    try {
      await deleteSequence(id)
      navigate('/admin/sequences')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete sequence')
    }
  }

  if (loading) return <p className="text-sm text-slate-500">Loading sequence…</p>
  if (!sequence) return <p className="text-sm text-slate-500">Sequence not found.</p>

  return (
    <div className="space-y-6">
      <div>
        <Link to="/admin/sequences" className="text-sm text-indigo-600 hover:text-indigo-500">
          ← Back to sequences
        </Link>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label className="block text-xs font-medium text-slate-500">Name</label>
            <input
              defaultValue={sequence.name}
              onBlur={(e) => handleSaveName(e.target.value, sequence.description ?? '')}
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-500">Description</label>
            <input
              defaultValue={sequence.description ?? ''}
              onBlur={(e) => handleSaveName(sequence.name, e.target.value)}
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
            />
          </div>
        </div>
        {linkedCampaign && (
          <p className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-700">
            {linkedCampaign.lemlist_campaign_id
              ? `This sequence belongs to the launched campaign "${linkedCampaign.name}" — saving will push step changes to the live Lemlist campaign.`
              : `This sequence belongs to campaign "${linkedCampaign.name}", which hasn't launched yet — changes here only affect that campaign's build.`}
          </p>
        )}
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}

      <div className="space-y-3">
        {steps.map((step, i) => (
          <div key={step.key} className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="flex items-center justify-between">
              <p className="text-sm font-medium text-slate-700">Step {i + 1}</p>
              <div className="flex items-center gap-2">
                <button type="button" onClick={() => moveStep(i, -1)} className="text-xs text-slate-500 hover:text-slate-700">
                  ↑
                </button>
                <button type="button" onClick={() => moveStep(i, 1)} className="text-xs text-slate-500 hover:text-slate-700">
                  ↓
                </button>
                <button
                  type="button"
                  onClick={() => removeStep(step.key)}
                  className="text-xs font-medium text-red-600 hover:text-red-500"
                >
                  Remove
                </button>
              </div>
            </div>

            <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
              <div>
                <label className="block text-xs font-medium text-slate-500">Channel</label>
                <select
                  value={step.channel}
                  onChange={(e) => updateStep(step.key, { channel: e.target.value as SequenceChannel })}
                  className="mt-1 w-full rounded-lg border border-slate-300 px-2 py-1.5 text-sm"
                >
                  {CHANNELS.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-500">Delay (days)</label>
                <input
                  type="number"
                  min={0}
                  value={step.delay_days}
                  onChange={(e) => updateStep(step.key, { delay_days: Number(e.target.value) })}
                  className="mt-1 w-full rounded-lg border border-slate-300 px-2 py-1.5 text-sm"
                />
              </div>
              {step.channel === 'email' && (
                <div className="col-span-2">
                  <label className="block text-xs font-medium text-slate-500">Subject</label>
                  <input
                    value={step.subject ?? ''}
                    onChange={(e) => updateStep(step.key, { subject: e.target.value })}
                    className="mt-1 w-full rounded-lg border border-slate-300 px-2 py-1.5 text-sm"
                  />
                </div>
              )}
            </div>

            <div className="mt-3">
              <label className="block text-xs font-medium text-slate-500">Message</label>
              <textarea
                value={step.body}
                onChange={(e) => updateStep(step.key, { body: e.target.value })}
                rows={4}
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
              />
              <p className="mt-1 text-xs text-slate-400">Variables: {VARIABLE_HINT}</p>
            </div>
          </div>
        ))}

        <button
          type="button"
          onClick={addStep}
          className="w-full rounded-xl border border-dashed border-slate-300 py-3 text-sm font-medium text-slate-500 hover:border-indigo-400 hover:text-indigo-600"
        >
          + Add step
        </button>
      </div>

      <div className="flex justify-between">
        <button
          type="button"
          onClick={handleDelete}
          className="rounded-lg px-4 py-2 text-sm font-medium text-red-600 hover:bg-red-50"
        >
          Delete sequence
        </button>
        <button
          type="button"
          onClick={handleSaveSteps}
          disabled={saving}
          className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-500 disabled:opacity-60"
        >
          {saving ? 'Saving…' : 'Save steps'}
        </button>
      </div>
    </div>
  )
}
