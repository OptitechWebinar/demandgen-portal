import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { fetchClients } from '../../lib/adminData'
import type { Campaign, CampaignStatsDaily, Client } from '../../types/database'
import { StatCard } from '../../components/StatCard'

interface RollupRow {
  client: Client
  sent: number
  opened: number
  replied: number
  meetingsBooked: number
  activeCampaigns: number
}

export function RollupPage() {
  const [rows, setRows] = useState<RollupRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false

    async function load() {
      try {
        const clients = await fetchClients()
        const { data: campaigns, error: campaignsError } = await supabase
          .from('campaigns')
          .select('*')
        if (campaignsError) throw campaignsError

        const campaignIds = (campaigns ?? []).map((c) => c.id)
        let stats: CampaignStatsDaily[] = []
        if (campaignIds.length > 0) {
          const since = new Date()
          since.setDate(since.getDate() - 30)
          const { data: statRows, error: statsError } = await supabase
            .from('campaign_stats_daily')
            .select('*')
            .in('campaign_id', campaignIds)
            .gte('date', since.toISOString().slice(0, 10))
          if (statsError) throw statsError
          stats = statRows ?? []
        }

        if (cancelled) return

        const campaignsByClient = new Map<string, Campaign[]>()
        for (const campaign of campaigns ?? []) {
          const list = campaignsByClient.get(campaign.client_id) ?? []
          list.push(campaign)
          campaignsByClient.set(campaign.client_id, list)
        }

        const statsByCampaign = new Map<string, CampaignStatsDaily[]>()
        for (const stat of stats) {
          const list = statsByCampaign.get(stat.campaign_id) ?? []
          list.push(stat)
          statsByCampaign.set(stat.campaign_id, list)
        }

        const computed: RollupRow[] = clients.map((client) => {
          const clientCampaigns = campaignsByClient.get(client.id) ?? []
          let sent = 0
          let opened = 0
          let replied = 0
          let meetingsBooked = 0
          for (const campaign of clientCampaigns) {
            for (const stat of statsByCampaign.get(campaign.id) ?? []) {
              sent += stat.sent
              opened += stat.opened
              replied += stat.replied
              meetingsBooked += stat.meetings_booked
            }
          }
          return {
            client,
            sent,
            opened,
            replied,
            meetingsBooked,
            activeCampaigns: clientCampaigns.filter((c) => c.status === 'active').length,
          }
        })

        setRows(computed)
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Failed to load rollup')
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    load()
    return () => {
      cancelled = true
    }
  }, [])

  const totals = useMemo(
    () =>
      rows.reduce(
        (acc, row) => {
          acc.sent += row.sent
          acc.opened += row.opened
          acc.replied += row.replied
          acc.meetingsBooked += row.meetingsBooked
          return acc
        },
        { sent: 0, opened: 0, replied: 0, meetingsBooked: 0 },
      ),
    [rows],
  )

  if (loading) return <p className="text-sm text-slate-500">Loading rollup…</p>
  if (error) return <p className="text-sm text-red-600">{error}</p>

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-slate-900">Cross-client rollup</h1>
        <p className="mt-1 text-sm text-slate-500">Last 30 days across all clients.</p>
      </div>

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <StatCard label="Total sent" value={totals.sent.toLocaleString()} />
        <StatCard label="Total opened" value={totals.opened.toLocaleString()} />
        <StatCard label="Total replied" value={totals.replied.toLocaleString()} />
        <StatCard label="Meetings booked" value={totals.meetingsBooked.toLocaleString()} />
      </div>

      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        <table className="min-w-full divide-y divide-slate-200">
          <thead className="bg-slate-50">
            <tr>
              <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wide text-slate-500">Client</th>
              <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wide text-slate-500">Active campaigns</th>
              <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wide text-slate-500">Sent</th>
              <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wide text-slate-500">Opened</th>
              <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wide text-slate-500">Replied</th>
              <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wide text-slate-500">Meetings</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {rows.map((row) => (
              <tr key={row.client.id} className="hover:bg-slate-50">
                <td className="px-4 py-3 text-sm font-medium text-slate-900">{row.client.name}</td>
                <td className="px-4 py-3 text-sm text-slate-500">{row.activeCampaigns}</td>
                <td className="px-4 py-3 text-sm text-slate-500">{row.sent.toLocaleString()}</td>
                <td className="px-4 py-3 text-sm text-slate-500">{row.opened.toLocaleString()}</td>
                <td className="px-4 py-3 text-sm text-slate-500">{row.replied.toLocaleString()}</td>
                <td className="px-4 py-3 text-sm text-slate-500">{row.meetingsBooked.toLocaleString()}</td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-sm text-slate-400">
                  No clients yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
