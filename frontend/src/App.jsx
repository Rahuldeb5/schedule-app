import { useEffect, useRef, useState } from 'react'
import { api } from './api'
import TodoPage from './TodoPage'
import WeekView from './WeekView'

const PAGES = [
  { path: '/', label: 'Week', Component: WeekView },
  { path: '/todo', label: 'To-do', Component: TodoPage },
]

function usePath() {
  const [path, setPath] = useState(window.location.pathname)
  useEffect(() => {
    const onPop = () => setPath(window.location.pathname)
    window.addEventListener('popstate', onPop)
    return () => window.removeEventListener('popstate', onPop)
  }, [])
  const navigate = (to) => {
    if (to === window.location.pathname) return
    window.history.pushState(null, '', to)
    setPath(to)
  }
  return [path, navigate]
}

const THEMES = { auto: 'light', light: 'dark', dark: 'auto' }
const THEME_ICONS = { auto: '◐', light: '☀', dark: '☾' }

function useTheme() {
  const [theme, setTheme] = useState(() => {
    try {
      return localStorage.getItem('theme') || 'auto'
    } catch {
      return 'auto'
    }
  })
  useEffect(() => {
    const root = document.documentElement
    if (theme === 'auto') delete root.dataset.theme
    else root.dataset.theme = theme
    try {
      if (theme === 'auto') localStorage.removeItem('theme')
      else localStorage.setItem('theme', theme)
    } catch {}
  }, [theme])
  return [theme, () => setTheme((t) => THEMES[t])]
}

export default function App() {
  const [path, navigate] = usePath()
  const [theme, cycleTheme] = useTheme()
  const fileRef = useRef(null)
  const page = PAGES.find((p) => p.path === path) ?? PAGES[0]

  const importFile = async (e) => {
    const file = e.target.files[0]
    e.target.value = ''
    if (!file) return
    try {
      const data = JSON.parse(await file.text())
      const counts = `${data.blocks?.length ?? 0} blocks and ${data.tasks?.length ?? 0} tasks`
      if (!confirm(`Replace ALL current data with ${counts} from ${file.name}?`)) return
      await api.importData(data)
      window.location.reload()
    } catch (err) {
      alert(`Import failed: ${err.message}`)
    }
  }

  return (
    <div className="app">
      <nav className="nav">
        <div className="tabs">
          {PAGES.map((p) => (
            <a
              key={p.path}
              href={p.path}
              className={p === page ? 'active' : ''}
              onClick={(e) => {
                e.preventDefault()
                navigate(p.path)
              }}
            >
              {p.label}
            </a>
          ))}
        </div>
        <div className="tools">
          <a className="btn" href="/api/export" download title="Download all data as JSON">Export</a>
          <button className="btn" onClick={() => fileRef.current.click()} title="Restore from an exported JSON file">
            Import
          </button>
          <input ref={fileRef} type="file" accept="application/json,.json" hidden onChange={importFile} />
          <button className="btn icon" onClick={cycleTheme} title={`Theme: ${theme}`} aria-label={`Theme: ${theme}`}>
            {THEME_ICONS[theme]}
          </button>
        </div>
      </nav>
      <main>
        <page.Component />
      </main>
    </div>
  )
}
