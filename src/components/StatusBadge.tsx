const STYLES: Record<string, string> = {
  active: 'bg-emerald-50 text-emerald-700',
  paused: 'bg-amber-50 text-amber-700',
  offboarded: 'bg-slate-100 text-slate-500',
  draft: 'bg-slate-100 text-slate-500',
  completed: 'bg-sky-50 text-sky-700',
  domain_pending: 'bg-slate-100 text-slate-500',
  domain_purchased: 'bg-amber-50 text-amber-700',
  mailbox_warming: 'bg-amber-50 text-amber-700',
  lemlist_connected: 'bg-sky-50 text-sky-700',
  live: 'bg-emerald-50 text-emerald-700',
}

export function StatusBadge({ status }: { status: string }) {
  const style = STYLES[status] ?? 'bg-slate-100 text-slate-500'
  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${style}`}>
      {status.replace(/_/g, ' ')}
    </span>
  )
}
