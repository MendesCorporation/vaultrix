export default function AuthLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-dark-50 dark:bg-dark-900">
      {children}
    </div>
  )
}
