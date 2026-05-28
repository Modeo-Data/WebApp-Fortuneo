import { useState, useEffect } from 'react'
import HomePage from './pages/HomePage.jsx'
import GraphPage from './pages/GraphPage.jsx'

// ── Simple History-API router ─────────────────────────────────────────────────
function parsePath(pathname) {
  const m = pathname.match(/^\/graph\/([^/]+)/)
  if (m) return { page: 'graph', sessionId: m[1] }
  return { page: 'home' }
}

export default function App() {
  const [location, setLocation] = useState(() => parsePath(window.location.pathname))

  // Handle browser back / forward
  useEffect(() => {
    const handler = () => setLocation(parsePath(window.location.pathname))
    window.addEventListener('popstate', handler)
    return () => window.removeEventListener('popstate', handler)
  }, [])

  function navigate(path) {
    window.history.pushState(null, '', path)
    setLocation(parsePath(path))
  }

  function goBack() {
    window.history.back()
  }

  if (location.page === 'graph') {
    return <GraphPage sessionId={location.sessionId} navigate={navigate} goBack={goBack} />
  }

  return <HomePage navigate={navigate} />
}
