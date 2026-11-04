function canNotify(): boolean {
  return typeof window !== 'undefined' && 'Notification' in window
}

/** Request permission on first need, then show an OS/browser notification if allowed. */
export async function notifyStaging(
  message: string,
  urgent: 0 | 1 | 2 | 'inThisRace',
): Promise<void> {
  if (!canNotify()) return

  let permission = Notification.permission
  if (permission === 'default') {
    permission = await Notification.requestPermission()
  }
  if (permission !== 'granted') return

  const notification = new Notification(message, {
    body: message,
    tag: `eventsync-staging-${urgent}`,
    renotify: true,
  })
  notification.onclick = () => {
    window.focus()
    notification.close()
  }
}
