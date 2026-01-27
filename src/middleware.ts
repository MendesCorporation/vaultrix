import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { getToken } from 'next-auth/jwt'

export default async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl
  const token = await getToken({ req, secret: process.env.AUTH_SECRET })
  const isLoggedIn = !!token
  const userRole = token?.role as string | undefined

  const isAdmin = userRole === 'ADMIN' || userRole === 'SUPER_ADMIN'

  // Rotas publicas
  const publicPaths = ['/login', '/forgot-password', '/reset-password', '/api/auth', '/api/telemetry', '/api/backup/scheduler', '/agent', '/invite', '/setup']
  const isPublicPath = publicPaths.some((path) => pathname.startsWith(path))

  if (isPublicPath) {
    // Se ja esta logado e tenta acessar login, redirecionar para dashboard
    if (isLoggedIn && pathname === '/login') {
      return NextResponse.redirect(new URL('/dashboard', req.url))
    }
    return NextResponse.next()
  }

  // Proteger todas as outras rotas
  if (!isLoggedIn) {
    const loginUrl = new URL('/login', req.url)
    loginUrl.searchParams.set('callbackUrl', pathname)
    return NextResponse.redirect(loginUrl)
  }

  // Rotas de admin
  const adminPaths = ['/users', '/groups', '/audit']
  const isAdminPath = adminPaths.some((path) => pathname.startsWith(path))

  if (isAdminPath && !isAdmin) {
    return NextResponse.redirect(new URL('/dashboard', req.url))
  }

  return NextResponse.next()
}

export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * - public folder
     */
    '/((?!_next/static|_next/image|favicon.ico|.*\\..*|api/auth|api/telemetry|api/invites|api/backup/run-scheduled|api/backup/sync-cron|agent).*)',
  ],
}
