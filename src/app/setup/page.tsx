import { auth } from '@/lib/auth/config'
import { redirect } from 'next/navigation'
import { prisma } from '@/lib/db/prisma'
import { SetupForm } from './SetupForm'

export default async function SetupPage() {
  const session = await auth()

  if (!session) {
    redirect('/login')
  }

  if (session.user.role !== 'SUPER_ADMIN') {
    redirect('/dashboard')
  }

  // Verifica se o usuário ainda é o admin padrão
  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { email: true },
  })

  // Se não é mais o admin padrão, redirecionar para dashboard
  if (user?.email !== 'admin@invetrix.local') {
    redirect('/dashboard')
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-dark-50 px-4 py-10 dark:bg-dark-900">
      <SetupForm />
    </div>
  )
}
