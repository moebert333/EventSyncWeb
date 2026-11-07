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

  // `renotify` is supported by browsers but missing from TS DOM NotificationOptions.
  const options: NotificationOptions & { renotify?: boolean } = {
    body: message,
    tag: `eventsync-staging-${urgent}`,
    renotify: true,
  }
  const notification = new Notification(message, options)
  notification.onclick = () => {
    window.focus()
    notification.close()
  }
}
