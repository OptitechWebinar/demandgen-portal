import { useEffect, useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { supabase } from '../../lib/supabase'
import { fetchStatsForCampaigns } from '../../lib/clientData'
import type { Campaign, CampaignStatsDaily } from '../../types/database'
import { StatCard } from '../../components/StatCard'
import { StatusBadge } from '../../components/StatusBadge'

export function CampaignDetailPage() {
  const { id } = useParams<{ id: string }>()
  const [campaign, setCampaign] = useState<Campaign | null>(null)
  const [stats, setStats] = useState<CampaignStatsDaily[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!id) return
    let cancelled = false

    async function load(campaignId: string) {
      try {
        const { data, error } = await supabase
          .from('campaigns')
          .select('*')
          .eq('id', campaignId)
          .maybeSingle()
        if (error) throw error
        if (cancelled) return
        setCampaign(data)

        const statRows = await fetchStatsForCampaigns([campaignId], 90)
        if (cancelled) return
        setStats(statRows)
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Failed to load campaign')
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    load(id)
    return () => {
      cancelled = true
    }
  }, [id])

  const funnel = useMemo(() => {
    return stats.reduce(
      (acc, row) => {
        acc.sent += row.sent
        acc.opened += row.opened
        acc.replied += row.replied
        acc.clicked += row.clicked
        acc.bounced += row.bounced
        acc.unsubscribed += row.unsubscribed
        acc.meetings_booked += row.meetings_booked
        return acc
      },
      { sent: 0, opened: 0, replied: 0, clicked: 0, bounced: 0, unsubscribed: 0, meetings_booked: 0 },
    )
  }, [stats])

  const funnelChartData = [
    { stage: 'Sent', value: funnel.sent },
    { stage: 'Opened', value: funnel.opened },
    { stage: 'Clicked', value: funnel.clicked },
    { stage: 'Replied', value: funnel.replied },
    { stage: 'Meetings', value: funnel.meetings_booked },
  ]

  if (loading) return <p className="text-sm text-slate-500">Loading campaign…</p>
  if (error) return <p className="text-sm text-red-600">{error}</p>
  if (!campaign) return <p className="text-sm text-slate-500">Campaign not found.</p>

  return (
    <div className="space-y-8">
      <div>
        <Link to="/" className="text-sm text-indigo-600 hover:text-indigo-500">
          ← Back to overview
        </Link>
        <div className="mt-2 flex items-center gap-3">
          <h1 className="text-2xl font-semibold text-slate-900">{campaign.name}</h1>
          <StatusBadge status={campaign.status} />
        </div>
        {campaign.vertical && <p className="mt-1 text-sm text-slate-500">{campaign.vertical}</p>}
      </div>

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
        <StatCard label="Sent" value={funnel.sent.toLocaleString()} />
        <StatCard label="Opened" value={funnel.opened.toLocaleString()} />
        <StatCard label="Clicked" value={funnel.clicked.toLocaleString()} />
        <StatCard label="Replied" value={funnel.replied.toLocaleString()} />
        <StatCard label="Bounced" value={funnel.bounced.toLocaleString()} />
        <StatCard label="Meetings" value={funnel.meetings_booked.toLocaleString()} />
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <h2 className="text-sm font-medium text-slate-700">Funnel (last 90 days)</h2>
        <div className="mt-4 h-64">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={funnelChartData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
              <XAxis dataKey="stage" tick={{ fontSize: 12 }} stroke="#94a3b8" />
              <YAxis tick={{ fontSize: 12 }} stroke="#94a3b8" allowDecimals={false} />
              <Tooltip />
              <Bar dataKey="value" fill="#6366f1" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  )
}
