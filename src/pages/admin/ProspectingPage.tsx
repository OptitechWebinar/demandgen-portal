import { useEffect, useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import Papa from 'papaparse'
import { fetchClient } from '../../lib/adminData'
import {
  fetchIcpProfiles,
  fetchStagedProspects,
  rejectProspect,
  searchUplead,
  stageProspects,
  type UpleadSearchResult,
} from '../../lib/campaignWorkflow'
import type { Client, IcpProfile, Prospect, ProspectWrite } from '../../types/database'

const TARGET_FIELDS: { key: keyof ProspectWrite; label: string }[] = [
  { key: 'first_name', label: 'First name' },
  { key: 'last_name', label: 'Last name' },
  { key: 'email', label: 'Email' },
  { key: 'title', label: 'Title' },
  { key: 'company_name', label: 'Company' },
  { key: 'company_domain', label: 'Company domain' },
  { key: 'linkedin_url', label: 'LinkedIn URL' },
  { key: 'location', label: 'Location' },
]

type Tab = 'uplead' | 'csv'

export function ProspectingPage() {
  const { id } = useParams<{ id: string }>()
  const [client, setClient] = useState<Client | null>(null)
  const [icpProfiles, setIcpProfiles] = useState<IcpProfile[]>([])
  const [staged, setStaged] = useState<Prospect[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [tab, setTab] = useState<Tab>('uplead')

  // UpLead search state
  const [selectedIcpId, setSelectedIcpId] = useState('')
  const [searching, setSearching] = useState(false)
  const [results, setResults] = useState<UpleadSearchResult[]>([])
  const [selectedResults, setSelectedResults] = useState<Set<string>>(new Set())

  // CSV import state
  const [csvHeaders, setCsvHeaders] = useState<string[]>([])
  const [csvRows, setCsvRows] = useState<Record<string, string>[]>([])
  const [mapping, setMapping] = useState<Record<string, string>>({})
  const [importing, setImporting] = useState(false)

  async function load(clientId: string) {
    setLoading(true)
    try {
      const [clientRow, icps, stagedRows] = await Promise.all([
        fetchClient(clientId),
        fetchIcpProfiles(clientId),
        fetchStagedProspects(clientId),
      ])
      setClient(clientRow)
      setIcpProfiles(icps)
      setStaged(stagedRows)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load prospecting data')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (id) load(id)
  }, [id])

  async function handleSearch() {
    setSearching(true)
    setError(null)
    try {
      const rows = await searchUplead({ icpProfileId: selectedIcpId || undefined })
      setResults(rows)
      setSelectedResults(new Set())
    } catch (err) {
      setError(err instanceof Error ? err.message : 'UpLead search failed')
    } finally {
      setSearching(false)
    }
  }

  async function handleStageSelected() {
    if (!id) return
    const rows: ProspectWrite[] = results
      .filter((r) => selectedResults.has(r.external_id))
      .map((r) => ({
        client_id: id,
        icp_profile_id: selectedIcpId || undefined,
        source: 'uplead',
        external_id: r.external_id,
        first_name: r.first_name,
        last_name: r.last_name,
        email: r.email,
        title: r.title,
        company_name: r.company_name,
        company_domain: r.company_domain,
        linkedin_url: r.linkedin_url,
        location: r.location,
        raw: r.raw,
      }))
    try {
      await stageProspects(rows)
      setResults((prev) => prev.filter((r) => !selectedResults.has(r.external_id)))
      setSelectedResults(new Set())
      await load(id)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to stage prospects')
    }
  }

  function handleCsvFile(file: File) {
    Papa.parse<Record<string, string>>(file, {
      header: true,
      skipEmptyLines: true,
      complete: (result) => {
        const headers = result.meta.fields ?? []
        setCsvHeaders(headers)
        setCsvRows(result.data)
        // Best-effort auto-map by matching header names.
        const auto: Record<string, string> = {}
        for (const field of TARGET_FIELDS) {
          const match = headers.find((h) => h.toLowerCase().replace(/[^a-z]/g, '') === field.key.replace(/_/g, ''))
          if (match) auto[field.key] = match
        }
        setMapping(auto)
      },
      error: (err) => setError(err.message),
    })
  }

  async function handleCsvImport() {
    if (!id) return
    setImporting(true)
    try {
      const rows: ProspectWrite[] = csvRows.map((row) => {
        const get = (key: keyof ProspectWrite) => (mapping[key] ? row[mapping[key]] || null : null)
        return {
          client_id: id,
          source: 'csv_import',
          first_name: get('first_name'),
          last_name: get('last_name'),
          email: get('email'),
          title: get('title'),
          company_name: get('company_name'),
          company_domain: get('company_domain'),
          linkedin_url: get('linkedin_url'),
          location: get('location'),
          raw: row,
        }
      })
      await stageProspects(rows)
      setCsvHeaders([])
      setCsvRows([])
      setMapping({})
      await load(id)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'CSV import failed')
    } finally {
      setImporting(false)
    }
  }

  async function handleReject(prospectId: string) {
    try {
      await rejectProspect(prospectId)
      setStaged((prev) => prev.filter((p) => p.id !== prospectId))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to remove prospect')
    }
  }

  const csvPreviewRows = useMemo(() => csvRows.slice(0, 5), [csvRows])

  if (loading) return <p className="text-sm text-slate-500">Loading…</p>
  if (!client) return <p className="text-sm text-slate-500">Client not found.</p>

  return (
    <div className="space-y-6">
      <div>
        <Link to={`/admin/clients/${id}`} className="text-sm text-indigo-600 hover:text-indigo-500">
          ← Back to {client.name}
        </Link>
        <h1 className="mt-2 text-2xl font-semibold text-slate-900">Prospecting</h1>
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}

      <div className="flex gap-1 border-b border-slate-200">
        <button
          type="button"
          onClick={() => setTab('uplead')}
          className={`px-4 py-2 text-sm font-medium ${tab === 'uplead' ? 'border-b-2 border-indigo-600 text-indigo-700' : 'text-slate-500'}`}
        >
          Search UpLead
        </button>
        <button
          type="button"
          onClick={() => setTab('csv')}
          className={`px-4 py-2 text-sm font-medium ${tab === 'csv' ? 'border-b-2 border-indigo-600 text-indigo-700' : 'text-slate-500'}`}
        >
          Import CSV
        </button>
      </div>

      {tab === 'uplead' && (
        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex items-end gap-3">
            <div className="flex-1">
              <label className="block text-xs font-medium text-slate-500">ICP profile</label>
              <select
                value={selectedIcpId}
                onChange={(e) => setSelectedIcpId(e.target.value)}
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
              >
                <option value="">Select an ICP profile…</option>
                {icpProfiles.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </div>
            <button
              type="button"
              onClick={handleSearch}
              disabled={searching || !selectedIcpId}
              className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-500 disabled:opacity-60"
            >
              {searching ? 'Searching…' : 'Search'}
            </button>
          </div>
          {icpProfiles.length === 0 && (
            <p className="mt-2 text-xs text-slate-400">
              No ICP profiles yet —{' '}
              <Link to={`/admin/clients/${id}/icp`} className="text-indigo-600 hover:text-indigo-500">
                create one first
              </Link>
              .
            </p>
          )}

          {results.length > 0 && (
            <div className="mt-4">
              <div className="mb-2 flex items-center justify-between">
                <p className="text-xs text-slate-500">{results.length} result(s)</p>
                <button
                  type="button"
                  onClick={handleStageSelected}
                  disabled={selectedResults.size === 0}
                  className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-100 disabled:opacity-60"
                >
                  Stage selected ({selectedResults.size})
                </button>
              </div>
              <div className="max-h-96 overflow-y-auto rounded-lg border border-slate-200">
                <table className="min-w-full divide-y divide-slate-200 text-sm">
                  <tbody className="divide-y divide-slate-100">
                    {results.map((r) => (
                      <tr key={r.external_id} className="hover:bg-slate-50">
                        <td className="w-8 px-3 py-2">
                          <input
                            type="checkbox"
                            checked={selectedResults.has(r.external_id)}
                            onChange={(e) => {
                              const next = new Set(selectedResults)
                              if (e.target.checked) next.add(r.external_id)
                              else next.delete(r.external_id)
                              setSelectedResults(next)
                            }}
                          />
                        </td>
                        <td className="px-3 py-2">
                          <p className="font-medium text-slate-900">
                            {r.first_name} {r.last_name}
                          </p>
                          <p className="text-xs text-slate-500">{r.title}</p>
                        </td>
                        <td className="px-3 py-2 text-slate-600">{r.company_name}</td>
                        <td className="px-3 py-2 text-slate-500">{r.email}</td>
                        <td className="px-3 py-2 text-slate-500">{r.location}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {tab === 'csv' && (
        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <label className="block text-xs font-medium text-slate-500">
            Upload a Sales Navigator / Manycrawl CSV export
          </label>
          <input
            type="file"
            accept=".csv"
            onChange={(e) => e.target.files?.[0] && handleCsvFile(e.target.files[0])}
            className="mt-1 text-sm"
          />

          {csvHeaders.length > 0 && (
            <div className="mt-4 space-y-4">
              <div>
                <p className="text-xs font-medium text-slate-500">Map columns</p>
                <div className="mt-2 grid grid-cols-2 gap-3 sm:grid-cols-4">
                  {TARGET_FIELDS.map((field) => (
                    <div key={field.key}>
                      <label className="block text-xs text-slate-500">{field.label}</label>
                      <select
                        value={mapping[field.key] ?? ''}
                        onChange={(e) => setMapping({ ...mapping, [field.key]: e.target.value })}
                        className="mt-1 w-full rounded-lg border border-slate-300 px-2 py-1.5 text-xs"
                      >
                        <option value="">— None —</option>
                        {csvHeaders.map((h) => (
                          <option key={h} value={h}>
                            {h}
                          </option>
                        ))}
                      </select>
                    </div>
                  ))}
                </div>
              </div>

              <div>
                <p className="text-xs font-medium text-slate-500">Preview ({csvRows.length} rows total)</p>
                <div className="mt-2 overflow-x-auto rounded-lg border border-slate-200">
                  <table className="min-w-full divide-y divide-slate-200 text-xs">
                    <thead className="bg-slate-50">
                      <tr>
                        {csvHeaders.map((h) => (
                          <th key={h} className="px-2 py-1 text-left font-medium text-slate-500">
                            {h}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {csvPreviewRows.map((row, i) => (
                        <tr key={i}>
                          {csvHeaders.map((h) => (
                            <td key={h} className="px-2 py-1 text-slate-600">
                              {row[h]}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              <button
                type="button"
                onClick={handleCsvImport}
                disabled={importing}
                className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-500 disabled:opacity-60"
              >
                {importing ? 'Importing…' : `Import ${csvRows.length} prospects`}
              </button>
            </div>
          )}
        </div>
      )}

      <div className="rounded-xl border border-slate-200 bg-white shadow-sm">
        <h2 className="border-b border-slate-200 px-4 py-3 text-sm font-medium text-slate-700">
          Staged prospects ({staged.length})
        </h2>
        <ul className="divide-y divide-slate-100">
          {staged.map((p) => (
            <li key={p.id} className="flex items-center justify-between px-4 py-3">
              <div>
                <p className="text-sm font-medium text-slate-900">
                  {p.first_name} {p.last_name} <span className="text-xs text-slate-400">({p.source})</span>
                </p>
                <p className="text-xs text-slate-500">
                  {p.title} {p.company_name ? `@ ${p.company_name}` : ''} — {p.email}
                </p>
              </div>
              <button
                type="button"
                onClick={() => handleReject(p.id)}
                className="text-xs font-medium text-red-600 hover:text-red-500"
              >
                Remove
              </button>
            </li>
          ))}
          {staged.length === 0 && (
            <li className="px-4 py-6 text-center text-sm text-slate-400">No staged prospects yet.</li>
          )}
        </ul>
      </div>
    </div>
  )
}
