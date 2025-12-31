import { Routes, Route } from 'react-router-dom'
import { Layout } from './components/layout'
import { Dashboard } from './pages/Dashboard'
import { WorkOrders } from './pages/WorkOrders'
import { WorkOrderDetail } from './pages/WorkOrderDetail'
import { Runs } from './pages/Runs'
import { RunDetail } from './pages/RunDetail'
import { Settings } from './pages/Settings'
import { NotFound } from './pages/NotFound'
import { ErrorBoundary } from './components/ErrorBoundary'

function App() {
  return (
    <ErrorBoundary>
      <Routes>
        <Route path="/" element={<Layout />}>
          <Route index element={<Dashboard />} />
          <Route path="work-orders" element={<WorkOrders />} />
          <Route path="work-orders/:id" element={<WorkOrderDetail />} />
          <Route path="runs" element={<Runs />} />
          <Route path="runs/:id" element={<RunDetail />} />
          <Route path="settings" element={<Settings />} />
        </Route>
        <Route path="*" element={<NotFound />} />
      </Routes>
    </ErrorBoundary>
  )
}

export default App
