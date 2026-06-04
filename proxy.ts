import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'
import { ADMIN_ACCESS_COOKIE } from '@/lib/admin-access'

export async function proxy(request: NextRequest) {
  const isAdminPage = request.nextUrl.pathname === '/admin' || request.nextUrl.pathname.startsWith('/admin/')
  const isAdminAccessRoute = request.nextUrl.pathname === '/admin/access'
  const hasAdminAccess = request.cookies.get(ADMIN_ACCESS_COOKIE)?.value === 'granted'

  if (isAdminPage && !isAdminAccessRoute && !hasAdminAccess && request.nextUrl.pathname !== '/admin') {
    const url = request.nextUrl.clone()
    url.pathname = '/admin'
    url.search = ''
    url.searchParams.set('next', request.nextUrl.pathname)
    return NextResponse.redirect(url)
  }

  const publicPaths = ['/', '/events', '/articles', '/videos', '/admin', '/login']
  const isPublicPath = publicPaths.some((path) => (
    path === '/'
      ? request.nextUrl.pathname === '/'
      : request.nextUrl.pathname === path || request.nextUrl.pathname.startsWith(`${path}/`)
  ))

  // Stripe webhookはそのまま通す
  if (request.nextUrl.pathname.startsWith('/api/stripe/webhook')) {
    return NextResponse.next()
  }

  let supabaseResponse = NextResponse.next({ request })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
          supabaseResponse = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  const { data: { user } } = await supabase.auth.getUser()

  if (!user && !isPublicPath) {
    const url = request.nextUrl.clone()
    url.pathname = '/login'
    const redirect = NextResponse.redirect(url)
    redirect.headers.set('Cache-Control', 'no-store, max-age=0')
    return redirect
  }

  supabaseResponse.headers.set('Cache-Control', 'no-store, max-age=0')
  supabaseResponse.headers.set('CDN-Cache-Control', 'no-store')
  supabaseResponse.headers.set('Vercel-CDN-Cache-Control', 'no-store')

  return supabaseResponse
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)'],
}
