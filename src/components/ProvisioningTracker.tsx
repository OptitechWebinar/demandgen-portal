import type { ProvisioningStatus } from '../types/database'

const STEPS: { key: ProvisioningStatus; label: string }[] = [
  { key: 'domain_pending', label: 'Domain pending' },
  { key: 'domain_purchased', label: 'Domain purchased' },
  { key: 'mailbox_warming', label: 'Mailbox warming' },
  { key: 'lemlist_connected', label: 'Lemlist connected' },
  { key: 'live', label: 'Live' },
]

export function ProvisioningTracker({
  status,
  compact = false,
}: {
  status: ProvisioningStatus
  compact?: boolean
}) {
  const currentIndex = STEPS.findIndex((s) => s.key === status)

  return (
    <div className={`flex items-center ${compact ? 'gap-1' : 'gap-2'}`}>
      {STEPS.map((step, i) => {
        const done = i <= currentIndex
        return (
          <div key={step.key} className="flex items-center">
            <div
              title={step.label}
              className={`flex items-center justify-center rounded-full border text-[10px] font-semibold ${
                compact ? 'h-4 w-4' : 'h-6 w-6'
              } ${
                done
                  ? 'border-indigo-600 bg-indigo-600 text-white'
                  : 'border-slate-300 bg-white text-slate-400'
              }`}
            >
              {compact ? '' : i + 1}
            </div>
            {!compact && (
              <span className={`ml-1.5 mr-3 text-xs ${done ? 'text-slate-700' : 'text-slate-400'}`}>
                {step.label}
              </span>
            )}
            {i < STEPS.length - 1 && (
              <div className={`${compact ? 'w-2' : 'w-6'} h-px ${done ? 'bg-indigo-600' : 'bg-slate-300'}`} />
            )}
          </div>
        )
      })}
    </div>
  )
}
