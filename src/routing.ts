export type PublicRoute = 'home' | 'privacy' | 'terms' | 'support' | 'studio'

export function routeFromLocation(pathname: string, search: string, hash: string): PublicRoute {
  if (hash.startsWith('#scene=') || new URLSearchParams(search).has('ui')) return 'studio'
  const path = pathname.replace(/\/+$/, '') || '/'
  if (path === '/studio' || path === '/app') return 'studio'
  if (path === '/privacy') return 'privacy'
  if (path === '/terms') return 'terms'
  if (path === '/support') return 'support'
  return 'home'
}

export function studioHref(mode?: 'mobile' | 'full') {
  return mode ? `/studio?ui=${mode}` : '/studio'
}
