import { useEffect, useRef, useState } from 'react'

/**
 * Manages the suggestions panel state on top of the existing drawer state.
 *
 * - Opening pushes a history entry so the browser back button closes it.
 * - The previously-viewed drawerNode is preserved and restored on close,
 *   so users land back on the node they were inspecting.
 * - A popstate listener closes the panel on browser back without bubbling
 *   to other history handlers (e.g. URL→focusedNode sync).
 */
export function useSuggestionsState({ drawerNode, setDrawerNode, setDrawerOpen }) {
  const [showSuggestions, setShowSuggestions] = useState(false)
  const prevDrawerNodeRef = useRef(null)

  function openSuggestions() {
    prevDrawerNodeRef.current = drawerNode
    setShowSuggestions(true)
    setDrawerNode(null)
    setDrawerOpen(true)
    window.history.pushState({ suggestions: true }, '')
  }

  function closeSuggestions() {
    setShowSuggestions(false)
    if (prevDrawerNodeRef.current) {
      setDrawerNode(prevDrawerNodeRef.current)
      prevDrawerNodeRef.current = null
    }
  }

  useEffect(() => {
    function onPop(e) {
      if (showSuggestions) {
        setShowSuggestions(false)
        e.stopImmediatePropagation?.()
      }
    }
    window.addEventListener('popstate', onPop)
    return () => window.removeEventListener('popstate', onPop)
  }, [showSuggestions])

  return { showSuggestions, openSuggestions, closeSuggestions }
}
