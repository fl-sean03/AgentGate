import { Activity } from 'lucide-react'

export function Home() {
  return (
    <div className="container mx-auto px-4 py-8">
      <div className="flex items-center gap-3 mb-6">
        <Activity className="w-8 h-8 text-primary-600" />
        <h1 className="text-3xl font-bold text-gray-900">AgentGate Dashboard</h1>
      </div>
      <div className="bg-white rounded-lg shadow-md p-6">
        <p className="text-gray-600">
          Welcome to the AgentGate Dashboard. This is a React application built with
          Vite, TypeScript, and TailwindCSS.
        </p>
      </div>
    </div>
  )
}
