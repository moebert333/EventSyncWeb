export function Footer() {
  return (
    <footer
      className="border-t border-white/10 px-4 py-4 text-center text-sm text-zinc-500"
      style={{ paddingBottom: 'calc(1rem + env(safe-area-inset-bottom))' }}
    >
      EventSync · read-only companion to the track timing system
    </footer>
  )
}
