import { useState } from 'react'
import { Outlet } from 'react-router-dom'
import { Header } from './Header'
import { Sidebar } from './Sidebar'
import { MainContent } from './MainContent'
import { useWebSocket } from '../../hooks/useWebSocket'

export function Layout() {
  const [isSidebarOpen, setIsSidebarOpen] = useState(false)
  const { connectionState, connect } = useWebSocket()

  const handleMenuClick = () => {
    setIsSidebarOpen(true)
  }

  const handleSidebarClose = () => {
    setIsSidebarOpen(false)
  }

  return (
    <div className="min-h-screen flex flex-col">
      <Header
        onMenuClick={handleMenuClick}
        connectionState={connectionState}
        onReconnect={connect}
      />
      <div className="flex flex-1 overflow-hidden">
        <Sidebar isOpen={isSidebarOpen} onClose={handleSidebarClose} />
        <MainContent>
          <Outlet />
        </MainContent>
      </div>
    </div>
  )
}
