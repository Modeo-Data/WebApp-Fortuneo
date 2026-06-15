import { useState, useEffect } from 'react'
import HomePage from './pages/HomePage.jsx'
import GraphPage from './pages/GraphPage.jsx'

// ── Simple History-API router ─────────────────────────────────────────────────
function parsePath(pathname, search = '') {
  const m = pathname.match(/^\/graph\/([^/]+)/)
  if (m) {
    const params = new URLSearchParams(search)
    return { page: 'graph', sessionId: m[1], nodeId: params.get('node') || null }
  }
  if (pathname === '/graph') {
    return { page: 'graph', sessionId: null, nodeId: null }
  }
  return { page: 'home' }
}

export default function App() {
  const [location, setLocation] = useState(() =>
    parsePath(window.location.pathname, window.location.search))

  // Handle browser back / forward
  useEffect(() => {
    const handler = () => setLocation(parsePath(window.location.pathname, window.location.search))
    window.addEventListener('popstate', handler)
    return () => window.removeEventListener('popstate', handler)
  }, [])

  function navigate(path) {
    if (path === window.location.pathname + window.location.search) return
    window.history.pushState(null, '', path)
    setLocation(parsePath(window.location.pathname, window.location.search))
  }

  function goBack() {
    window.history.back()
  }

  useEffect(() => {
    document.body.classList.toggle('page-graph', location.page === 'graph')
  }, [location.page])

  if (location.page === 'graph') {
    return <GraphPage sessionId={location.sessionId} nodeId={location.nodeId} navigate={navigate} goBack={goBack} />
  }

  return <HomePage navigate={navigate} />
}
