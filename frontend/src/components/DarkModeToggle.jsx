import { useState, useEffect } from 'react'

export default function DarkModeToggle() {
  const [dark, setDark] = useState(false)

  useEffect(() => {
    const saved = localStorage.getItem('theme')
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches
    const isDark = saved ? saved === 'dark' : prefersDark
    setDark(isDark)
    document.documentElement.classList.toggle('dark', isDark)
  }, [])

  function toggle(e) {
    const next = !dark

    const apply = () => {
      setDark(next)
      document.documentElement.classList.toggle('dark', next)
      localStorage.setItem('theme', next ? 'dark' : 'light')
    }

    if (!document.startViewTransition) { apply(); return }

    // Pin the ripple origin to the button centre
    const rect = e.currentTarget.getBoundingClientRect()
    document.documentElement.style.setProperty('--toggle-x', `${Math.round(rect.left + rect.width / 2)}px`)
    document.documentElement.style.setProperty('--toggle-y', `${Math.round(rect.top  + rect.height / 2)}px`)

    document.startViewTransition(apply)
  }

  return (
    <button
      onClick={toggle}
      aria-label={dark ? 'Switch to light mode' : 'Switch to dark mode'}
      className="inline-flex items-center justify-center w-[34px] h-[34px] rounded-lg border border-slate-200 dark-toggle-btn transition-colors shrink-0"
    >
      <div className={`theme__icon${dark ? ' is-dark' : ''}`}>
        <div />
        <div>
          <span /><span /><span /><span />
        </div>
        <div />
      </div>
    </button>
  )
}
