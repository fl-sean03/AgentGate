import { ReactNode } from 'react'

interface MainContentProps {
  children: ReactNode
}

export function MainContent({ children }: MainContentProps) {
  return (
    <main className="flex-1 overflow-auto bg-gray-50">
      <div className="container mx-auto px-4 py-6 max-w-7xl">
        {children}
      </div>
    </main>
  )
}
