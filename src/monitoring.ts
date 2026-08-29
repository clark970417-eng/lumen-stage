type ErrorContext = {
  area?: string
  source?: string
  line?: number
  column?: number
}

const sent = new Set<string>()

export function reportError(error: unknown, context: ErrorContext = {}) {
  const value = error instanceof Error ? error : new Error(typeof error === 'string' ? error : 'Unknown error')
  const message = value.message.slice(0, 500)
  const fingerprint = `${context.area ?? ''}:${message}`
  if (sent.has(fingerprint)) return
  sent.add(fingerprint)

  const payload = JSON.stringify({
    message,
    name: value.name.slice(0, 80),
    stack: value.stack?.slice(0, 3000),
    area: context.area?.slice(0, 80),
    source: context.source?.slice(0, 180),
    line: context.line,
    column: context.column,
    route: `${location.pathname}${location.search}`.slice(0, 240),
    release: import.meta.env.VITE_RELEASE ?? 'development',
  })

  if (navigator.sendBeacon) navigator.sendBeacon('/api/error-report', new Blob([payload], { type: 'application/json' }))
  else void fetch('/api/error-report', { method: 'POST', headers: { 'content-type': 'application/json' }, body: payload, keepalive: true }).catch(() => undefined)
}

export function startErrorMonitoring() {
  window.addEventListener('error', (event) => reportError(event.error ?? event.message, {
    area: 'window', source: event.filename, line: event.lineno, column: event.colno,
  }))
  window.addEventListener('unhandledrejection', (event) => reportError(event.reason, { area: 'promise' }))
}
