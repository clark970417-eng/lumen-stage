export type PublicRoute = 'home' | 'privacy' | 'terms' | 'support' | 'studio'

const viteBase = (import.meta as ImportMeta & { env?: { BASE_URL?: string } }).env?.BASE_URL ?? '/'
export const APP_BASE = `/${viteBase.replace(/^\/+|\/+$/g, '')}${viteBase === '/' ? '' : '/'}`

/** Resolve a file from Vite's deployment base, including a GitHub project path. */
export function assetHref(path: string) {
  return `${APP_BASE}${path.replace(/^\/+/, '')}`
}

/**
 * Keep clean paths on a root deployment. GitHub Pages cannot rewrite deep SPA
 * links, so project-path builds use a query route that always reaches index.
 */
export function routeHref(route: PublicRoute) {
  if (route === 'home') return APP_BASE
  if (APP_BASE === '/') return `/${route}`
  return `${APP_BASE}?route=${route}`
}

export function routeFromLocation(pathname: string, search: string, hash: string): PublicRoute {
  const params = new URLSearchParams(search)
  const queryRoute = params.get('route')
  if (queryRoute === 'privacy' || queryRoute === 'terms' || queryRoute === 'support' || queryRoute === 'studio') return queryRoute
  if (hash.startsWith('#scene=') || params.has('ui')) return 'studio'
  const path = pathname.replace(/\/+$/, '') || '/'
  const page = path.split('/').filter(Boolean).at(-1)
  if (page === 'studio' || page === 'app') return 'studio'
  if (page === 'privacy') return 'privacy'
  if (page === 'terms') return 'terms'
  if (page === 'support') return 'support'
  return 'home'
}

export function studioHref(mode?: 'mobile' | 'full') {
  const href = routeHref('studio')
  if (!mode) return href
  return `${href}${href.includes('?') ? '&' : '?'}ui=${mode}`
}
