import { Menu } from 'lucide-react'
import { ConnectionStatus } from '../common/ConnectionStatus'
import type { ConnectionState } from '../../api/websocket'

interface HeaderProps {
  onMenuClick: () => void
  connectionState: ConnectionState
  onReconnect: () => void
}

export function Header({ onMenuClick, connectionState, onReconnect }: HeaderProps) {
  return (
    <header className="bg-white border-b border-gray-200 px-4 py-3 flex items-center gap-3">
      <button
        onClick={onMenuClick}
        className="lg:hidden p-2 hover:bg-gray-100 rounded-md transition-colors"
        aria-label="Toggle menu"
      >
        <Menu className="w-6 h-6 text-gray-600" />
      </button>
      <div className="flex items-center gap-2">
        <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center">
          <span className="text-white font-bold text-sm">AG</span>
        </div>
        <h1 className="text-xl font-semibold text-gray-900">AgentGate</h1>
      </div>
      <div className="ml-auto">
        <ConnectionStatus
          connectionState={connectionState}
          onReconnect={onReconnect}
        />
      </div>
    </header>
  )
}
