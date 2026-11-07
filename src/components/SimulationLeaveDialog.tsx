import { createPortal } from 'react-dom'

type SimulationLeaveDialogProps = {
  onOk: () => void
  onCancel: () => void
}

export function SimulationLeaveDialog({ onOk, onCancel }: SimulationLeaveDialogProps) {
  const panel = (
    <div
      className="fixed inset-0 z-[60] flex items-start justify-center overflow-y-auto bg-black/50 px-4 py-20"
      role="dialog"
      aria-modal="true"
      aria-label="Cancel simulation"
      onClick={(event) => {
        if (event.target === event.currentTarget) onCancel()
      }}
      onKeyDown={(event) => {
        if (event.key === 'Escape') {
          event.preventDefault()
          onCancel()
        }
      }}
    >
      <div className="grid w-full max-w-lg gap-3 border border-[#f5c518] bg-[#1a1a1a] p-4 shadow-lg">
        <p className="text-sm font-semibold uppercase tracking-wide text-zinc-400">Leave Active Race</p>
        <p className="text-sm text-zinc-300">Simulation will be Cancelled.</p>
        <div className="mt-1 flex flex-wrap gap-2">
          <button type="button" className="btn" title="Cancel simulation and leave this page" onClick={onOk}>
            Ok
          </button>
          <button
            type="button"
            className="btn btn-ghost"
            title="Stay on Active Race and keep simulating"
            onClick={onCancel}
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  )

  return createPortal(panel, document.body)
}
