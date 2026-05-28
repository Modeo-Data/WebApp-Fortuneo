import { useRef, useState, useEffect } from 'react'

/**
 * Reusable navigation stack + gesture interception for panel components.
 *
 * Manages a history stack of arbitrary items and intercepts trackpad swipes,
 * keyboard shortcuts (Alt/Cmd + arrows), and mouse side buttons — but only
 * while the mouse is hovering over the panel element.
 *
 * Usage:
 *   const nav = usePanelNav(initialItem)
 *   nav.onBackRef.current    = () => { const prev = nav.back(); if (prev != null) apply(prev) }
 *   nav.onForwardRef.current = () => { const next = nav.forward(); if (next != null) apply(next) }
 *   <div {...nav.panelProps}>...</div>
 */
export function usePanelNav(initialItem) {
  const stack = useRef(initialItem !== undefined ? [initialItem] : [])
  const pos   = useRef(initialItem !== undefined ? 0 : -1)

  const [canGoBack,    setCanGoBack]    = useState(false)
  const [canGoForward, setCanGoForward] = useState(false)

  // Reassigned every render by the consuming component so listeners always call fresh logic
  const onBackRef    = useRef(() => {})
  const onForwardRef = useRef(() => {})

  // Gesture interception — separate cooldown per direction so momentum in one
  // direction doesn't block the opposite swipe
  const isOverRef        = useRef(false)
  const cooldownBackRef  = useRef(false)
  const cooldownFwdRef   = useRef(false)
  const timerBackRef     = useRef(null)
  const timerFwdRef      = useRef(null)

  function syncFlags() {
    setCanGoBack(pos.current > 0)
    setCanGoForward(pos.current < stack.current.length - 1)
  }

  /** Return the item at the current position without moving. */
  function peek() {
    return pos.current >= 0 ? stack.current[pos.current] : undefined
  }

  /** Reset the stack, optionally seeding it with an initial item. */
  function reset(initial) {
    if (initial !== undefined) {
      stack.current = [initial]
      pos.current   = 0
    } else {
      stack.current = []
      pos.current   = -1
    }
    setCanGoBack(false)
    setCanGoForward(false)
  }

  /** Push a new item, truncating any forward history. */
  function push(item) {
    stack.current = stack.current.slice(0, pos.current + 1)
    stack.current.push(item)
    pos.current = stack.current.length - 1
    syncFlags()
  }

  /** Move one step back. Returns the item now at the top, or undefined if already at start. */
  function back() {
    if (pos.current <= 0) return undefined
    pos.current--
    syncFlags()
    return stack.current[pos.current]
  }

  /** Move one step forward. Returns the item now at the top, or undefined if at end. */
  function forward() {
    if (pos.current >= stack.current.length - 1) return undefined
    pos.current++
    syncFlags()
    return stack.current[pos.current]
  }

  // ── Gesture listeners — attached once on mount, gated by isOverRef ──────────
  // This avoids stale listeners when the panel's inner view changes (DOM swap)
  // while the mouse stays physically stationary over the panel area.

  useEffect(() => {
    const onWheel = (we) => {
      if (!isOverRef.current) return
      if (Math.abs(we.deltaX) <= Math.abs(we.deltaY)) return
      we.preventDefault()

      if (we.deltaX < -10) {
        clearTimeout(timerBackRef.current)
        timerBackRef.current = setTimeout(() => { cooldownBackRef.current = false }, 80)
        if (cooldownBackRef.current) return
        cooldownBackRef.current = true
        onBackRef.current()
      } else if (we.deltaX > 10) {
        clearTimeout(timerFwdRef.current)
        timerFwdRef.current = setTimeout(() => { cooldownFwdRef.current = false }, 80)
        if (cooldownFwdRef.current) return
        cooldownFwdRef.current = true
        onForwardRef.current()
      }
    }

    const onKey = (ke) => {
      if (!isOverRef.current) return
      const isBack    = (ke.altKey && ke.key === 'ArrowLeft')  || (ke.metaKey && ke.key === '[')
      const isForward = (ke.altKey && ke.key === 'ArrowRight') || (ke.metaKey && ke.key === ']')
      if (isBack || isForward) {
        ke.preventDefault(); ke.stopPropagation()
        if (isBack) onBackRef.current(); else onForwardRef.current()
      }
    }

    window.addEventListener('wheel', onWheel, { passive: false })
    window.addEventListener('keydown', onKey, true)
    return () => {
      window.removeEventListener('wheel', onWheel)
      window.removeEventListener('keydown', onKey, true)
    }
  }, [])

  function handleMouseEnter() {
    isOverRef.current = true
  }

  function handleMouseLeave() {
    isOverRef.current      = false
    cooldownBackRef.current = false
    cooldownFwdRef.current  = false
    clearTimeout(timerBackRef.current)
    clearTimeout(timerFwdRef.current)
  }

  function handleMouseDown(e) {
    if (!isOverRef.current) return
    if (e.button === 3) { e.preventDefault(); onBackRef.current() }
    if (e.button === 4) { e.preventDefault(); onForwardRef.current() }
  }

  return {
    onBackRef,
    onForwardRef,
    canGoBack,
    canGoForward,
    peek,
    reset,
    push,
    back,
    forward,
    panelProps: {
      onMouseEnter: handleMouseEnter,
      onMouseLeave: handleMouseLeave,
      onMouseDown:  handleMouseDown,
    },
  }
}
