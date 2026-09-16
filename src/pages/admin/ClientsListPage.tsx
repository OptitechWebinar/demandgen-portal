import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { fetchClients, triggerSync } from '../../lib/adminData'
import type { Client } from '../../types/database'
import { StatusBadge } from '../../components/StatusBadge'
import { ProvisioningTracker } from '../../components/ProvisioningTracker'
import { AddClientDialog } from '../../components/AddClientDialog'

function formatLastSync(value: string | null | undefined) {
  if (!value) return 'Never'
  return new Date(value).toLocaleString(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  })
}

export function ClientsListPage() {
  const [clients, setClients] = useState<Client[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [showAddDialog, setShowAddDialog] = useState(false)
  const [syncingId, setSyncingId] = useState<string | null>(null)

  async function load() {
    setLoading(true)
    try {
      setClients(await fetchClients())
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load clients')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
  }, [])

  async function handleSync(clientId: string) {
    setSyncingId(clientId)
    try {
      await triggerSync(clientId)
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Sync failed')
    } finally {
      setSyncingId(null)
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">Clients</h1>
          <p className="mt-1 text-sm text-slate-500">All Optitech demand-gen clients in one place.</p>
        </div>
        <button
          type="button"
          onClick={() => setShowAddDialog(true)}
          className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-500"
        >
          Add client
        </button>
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}

      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        <table className="min-w-full divide-y divide-slate-200">
          <thead className="bg-slate-50">
            <tr>
              <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wide text-slate-500">
                Client
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wide text-slate-500">
                Status
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wide text-slate-500">
                Provisioning
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wide text-slate-500">
                Last sync
              </th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {clients.map((client) => (
              <tr key={client.id} className="hover:bg-slate-50">
                <td className="px-4 py-3">
                  <Link to={`/admin/clients/${client.id}`} className="text-sm font-medium text-indigo-600 hover:text-indigo-500">
                    {client.name}
                  </Link>
                  {client.sending_domain && <p className="text-xs text-slate-400">{client.sending_domain}</p>}
                </td>
                <td className="px-4 py-3">
                  <StatusBadge status={client.status} />
                </td>
                <td className="px-4 py-3">
                  <ProvisioningTracker status={client.provisioning_status} compact />
                </td>
                <td className="px-4 py-3 text-sm text-slate-500">{formatLastSync(client.last_synced_at)}</td>
                <td className="px-4 py-3 text-right">
                  <button
                    type="button"
                    onClick={() => handleSync(client.id)}
                    disabled={syncingId === client.id}
                    className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-100 disabled:opacity-60"
                  >
                    {syncingId === client.id ? 'Syncing…' : 'Sync now'}
                  </button>
                </td>
              </tr>
            ))}
            {!loading && clients.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-sm text-slate-400">
                  No clients yet. Add your first client to get started.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {showAddDialog && (
        <AddClientDialog
          onClose={() => setShowAddDialog(false)}
          onCreated={() => {
            setShowAddDialog(false)
            load()
          }}
        />
      )}
    </div>
  )
}
