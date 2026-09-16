import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { useAuth } from '../../context/AuthContext'
import { fetchCampaignsForClient, fetchStatsForCampaigns } from '../../lib/clientData'
import type { Campaign, CampaignStatsDaily } from '../../types/database'
import { StatCard } from '../../components/StatCard'
import { StatusBadge } from '../../components/StatusBadge'

export function OverviewPage() {
  const { profile } = useAuth()
  const [campaigns, setCampaigns] = useState<Campaign[]>([])
  const [stats, setStats] = useState<CampaignStatsDaily[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!profile?.client_id) {
      setLoading(false)
      return
    }
    let cancelled = false

    async function load(clientId: string) {
      try {
        const campaignRows = await fetchCampaignsForClient(clientId)
        if (cancelled) return
        setCampaigns(campaignRows)
        const statRows = await fetchStatsForCampaigns(campaignRows.map((c) => c.id))
        if (cancelled) return
        setStats(statRows)
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Failed to load data')
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    load(profile.client_id)
    return () => {
      cancelled = true
    }
  }, [profile?.client_id])

  const totals = useMemo(() => {
    return stats.reduce(
      (acc, row) => {
        acc.sent += row.sent
        acc.opened += row.opened
        acc.replied += row.replied
        acc.meetings_booked += row.meetings_booked
        return acc
      },
      { sent: 0, opened: 0, replied: 0, meetings_booked: 0 },
    )
  }, [stats])

  const trend = useMemo(() => {
    const byDate = new Map<string, { date: string; sent: number; opened: number; replied: number }>()
    for (const row of stats) {
      const entry = byDate.get(row.date) ?? { date: row.date, sent: 0, opened: 0, replied: 0 }
      entry.sent += row.sent
      entry.opened += row.opened
      entry.replied += row.replied
      byDate.set(row.date, entry)
    }
    return Array.from(byDate.values()).sort((a, b) => a.date.localeCompare(b.date))
  }, [stats])

  if (!profile?.client_id) {
    return (
      <p className="text-sm text-slate-500">
        Your account isn't linked to a client yet. Ask Optitech to finish setting up your access.
      </p>
    )
  }

  if (loading) return <p className="text-sm text-slate-500">Loading your campaigns…</p>
  if (error) return <p className="text-sm text-red-600">{error}</p>

  const activeCampaigns = campaigns.filter((c) => c.status === 'active')

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold text-slate-900">Overview</h1>
        <p className="mt-1 text-sm text-slate-500">Last 30 days across {activeCampaigns.length} active campaign(s).</p>
      </div>

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <StatCard label="Sent" value={totals.sent.toLocaleString()} />
        <StatCard label="Opened" value={totals.opened.toLocaleString()} />
        <StatCard label="Replied" value={totals.replied.toLocaleString()} />
        <StatCard label="Meetings booked" value={totals.meetings_booked.toLocaleString()} />
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <h2 className="text-sm font-medium text-slate-700">Sent / opened / replied trend</h2>
        <div className="mt-4 h-64">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={trend}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
              <XAxis dataKey="date" tick={{ fontSize: 12 }} stroke="#94a3b8" />
              <YAxis tick={{ fontSize: 12 }} stroke="#94a3b8" allowDecimals={false} />
              <Tooltip />
              <Line type="monotone" dataKey="sent" stroke="#6366f1" strokeWidth={2} dot={false} />
              <Line type="monotone" dataKey="opened" stroke="#0ea5e9" strokeWidth={2} dot={false} />
              <Line type="monotone" dataKey="replied" stroke="#10b981" strokeWidth={2} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white shadow-sm">
        <h2 className="border-b border-slate-200 px-4 py-3 text-sm font-medium text-slate-700">Campaigns</h2>
        <ul className="divide-y divide-slate-100">
          {campaigns.map((campaign) => (
            <li key={campaign.id}>
              <Link
                to={`/campaigns/${campaign.id}`}
                className="flex items-center justify-between px-4 py-3 hover:bg-slate-50"
              >
                <div>
                  <p className="text-sm font-medium text-slate-900">{campaign.name}</p>
                  {campaign.vertical && <p className="text-xs text-slate-500">{campaign.vertical}</p>}
                </div>
                <StatusBadge status={campaign.status} />
              </Link>
            </li>
          ))}
          {campaigns.length === 0 && (
            <li className="px-4 py-6 text-center text-sm text-slate-400">No campaigns yet.</li>
          )}
        </ul>
      </div>
    </div>
  )
}
