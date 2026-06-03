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

    const rect = e.currentTarget.closest('.st-sunMoonThemeToggleBtn').getBoundingClientRect()
    document.documentElement.style.setProperty('--toggle-x', `${Math.round(rect.left + rect.width / 2)}px`)
    document.documentElement.style.setProperty('--toggle-y', `${Math.round(rect.top  + rect.height / 2)}px`)

    document.startViewTransition(apply)
  }

  return (
    <div className="themeToggle" aria-label={dark ? 'Passer en mode clair' : 'Passer en mode sombre'}>
      <label className="st-sunMoonThemeToggleBtn">
        <input
          className="themeToggleInput"
          type="checkbox"
          checked={!dark}
          onChange={toggle}
        />
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" stroke="none">
          <defs>
            <mask id="themeToggleMask">
              <rect width="100%" height="100%" fill="white" />
              <circle r="6" cx="15" cy="9" fill="black" />
            </mask>
          </defs>
          {/* Moon/sun orb */}
          <circle className="sunMoon" cx="12" cy="12" r="6" mask="url(#themeToggleMask)" />
          {/* Sun rays — hidden in moon mode, animated in for sun mode */}
          <g stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <line className="sunRay"        x1="12"    y1="1"     x2="12"    y2="4"    />
            <line className="sunRay sunRay2" x1="17.66" y1="6.34"  x2="19.78" y2="4.22" />
            <line className="sunRay sunRay3" x1="20"    y1="12"    x2="23"    y2="12"   />
            <line className="sunRay sunRay4" x1="17.66" y1="17.66" x2="19.78" y2="19.78"/>
            <line className="sunRay sunRay5" x1="12"    y1="20"    x2="12"    y2="23"   />
            <line className="sunRay"        x1="6.34"  y1="17.66" x2="4.22"  y2="19.78"/>
            <line className="sunRay"        x1="4"     y1="12"    x2="1"     y2="12"   />
            <line className="sunRay"        x1="6.34"  y1="6.34"  x2="4.22"  y2="4.22" />
          </g>
        </svg>
      </label>
    </div>
  )
}
