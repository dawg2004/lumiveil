import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'
import { ADMIN_PANEL_COOKIE_NAME, isValidAdminPanelSessionToken } from "@/lib/admin-auth";

export async function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;

  // Stripe webhookはそのまま通す
  if (pathname.startsWith('/api/stripe/webhook')) {
    return NextResponse.next()
  }

  // 管理者APIはそのまま通す（独自認証）
  if (pathname.startsWith('/api/admin/')) {
    return NextResponse.next()
  }

  // /login, /admin-login はそのまま通す（/admin チェックより先に評価）
  if (pathname.startsWith('/login') || pathname.startsWith('/admin-login')) {
    return NextResponse.next();
  }

  // Admin routes: admin panel session cookie で認証
  if (pathname.startsWith('/admin')) {
    const token = request.cookies.get(ADMIN_PANEL_COOKIE_NAME)?.value;
    const isValid = await isValidAdminPanelSessionToken(token);
    if (!isValid) {
      const url = request.nextUrl.clone();
      url.pathname = '/admin-login';
      url.search = '';
      const nextValue = `${pathname}${search}`;
      if (nextValue && nextValue !== '/') {
        url.searchParams.set('next', nextValue);
      }
      return NextResponse.redirect(url);
    }
    return NextResponse.next();
  }

  // その他のルート: Supabase セッションのリフレッシュと認証チェック
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

  if (!user) {
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
