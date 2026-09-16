import { useEffect, useState } from 'react'
import { useAuth } from '../../context/AuthContext'
import { fetchReportsForClient } from '../../lib/clientData'
import type { Report } from '../../types/database'

function formatDate(value: string) {
  return new Date(value).toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  })
}

export function ReportsPage() {
  const { profile } = useAuth()
  const [reports, setReports] = useState<Report[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!profile?.client_id) {
      setLoading(false)
      return
    }
    let cancelled = false

    fetchReportsForClient(profile.client_id)
      .then((rows) => {
        if (!cancelled) setReports(rows)
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Failed to load reports')
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [profile?.client_id])

  if (loading) return <p className="text-sm text-slate-500">Loading reports…</p>
  if (error) return <p className="text-sm text-red-600">{error}</p>

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-slate-900">Reports</h1>
        <p className="mt-1 text-sm text-slate-500">Weekly and monthly summaries from your Optitech team.</p>
      </div>

      <div className="space-y-4">
        {reports.map((report) => (
          <article key={report.id} className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
            <h2 className="text-sm font-medium text-slate-900">
              {formatDate(report.period_start)} – {formatDate(report.period_end)}
            </h2>
            <p className="mt-3 whitespace-pre-wrap text-sm text-slate-600">{report.summary_text}</p>
          </article>
        ))}
        {reports.length === 0 && (
          <p className="rounded-xl border border-dashed border-slate-300 p-6 text-center text-sm text-slate-400">
            No reports yet. Check back after your first reporting period.
          </p>
        )}
      </div>
    </div>
  )
}
