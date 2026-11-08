import { useEffect, useState } from 'react'
import {
  dismissInstallOffer,
  isIosDevice,
  isStandalone,
  wasInstallOfferDismissed,
  type BeforeInstallPromptEvent,
} from '../lib/pwaInstall'

/**
 * Offers installing the PWA when browsing in a normal tab (not already installed).
 * Chrome/Android: uses beforeinstallprompt. iOS: Share → Add to Home Screen hint.
 */
export function InstallAppBanner() {
  const [installEvent, setInstallEvent] = useState<BeforeInstallPromptEvent | null>(null)
  const [hidden, setHidden] = useState(() => isStandalone() || wasInstallOfferDismissed())
  const iosHint = isIosDevice() && !isStandalone()

  useEffect(() => {
    if (isStandalone()) {
      setHidden(true)
      return
    }
    const onPrompt = (event: Event) => {
      event.preventDefault()
      setInstallEvent(event as BeforeInstallPromptEvent)
      if (!wasInstallOfferDismissed()) setHidden(false)
    }
    const onInstalled = () => {
      setInstallEvent(null)
      setHidden(true)
    }
    window.addEventListener('beforeinstallprompt', onPrompt)
    window.addEventListener('appinstalled', onInstalled)
    return () => {
      window.removeEventListener('beforeinstallprompt', onPrompt)
      window.removeEventListener('appinstalled', onInstalled)
    }
  }, [])

  if (hidden || isStandalone()) return null
  if (!installEvent && !iosHint) return null

  async function onInstall() {
    if (!installEvent) return
    await installEvent.prompt()
    const choice = await installEvent.userChoice
    setInstallEvent(null)
    if (choice.outcome === 'accepted') setHidden(true)
  }

  function onDismiss() {
    dismissInstallOffer()
    setHidden(true)
  }

  return (
    <div
      className="border-b border-[#f5c518]/40 bg-[#1a1a1a] px-4 py-3"
      role="region"
      aria-label="Install EventSync"
    >
      <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-3">
        <img src="/rider.svg" alt="" className="h-9 w-12 shrink-0" />
        <div className="min-w-0 flex-1">
          <p className="font-display text-lg font-bold uppercase leading-tight text-[#f5c518]">
            Install EventSync
          </p>
          <p className="text-sm text-zinc-300">
            {iosHint && !installEvent
              ? 'Share → Add to Home Screen for a full-screen app icon.'
              : 'Add to your home screen for faster access to live timing and results.'}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {installEvent ? (
            <button
              type="button"
              className="btn !min-h-9 px-3 py-1.5 text-base"
              title="Install EventSync on this device"
              onClick={() => void onInstall()}
            >
              Install
            </button>
          ) : null}
          <button
            type="button"
            className="btn-ghost !min-h-9 border border-white/20 px-3 py-1.5 text-sm font-semibold uppercase text-zinc-300"
            title="Dismiss install offer"
            onClick={onDismiss}
          >
            Not now
          </button>
        </div>
      </div>
    </div>
  )
}
