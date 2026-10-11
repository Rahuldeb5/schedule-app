import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { api } from './api'
import { layoutDay } from './layout'
import { DAYS, axisRange, blockSpan, format12, nowPosition, toHHMM } from './time'
import BlockForm, { PRESET_COLORS } from './BlockForm'

const HOUR_PX = 52
const PX_PER_MIN = HOUR_PX / 60

function useNow(intervalMs = 30_000) {
  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    const tick = () => setNow(new Date())
    const id = setInterval(tick, intervalMs)
    // Phones suspend timers in the background; refresh as soon as the tab is visible again.
    document.addEventListener('visibilitychange', tick)
    return () => {
      clearInterval(id)
      document.removeEventListener('visibilitychange', tick)
    }
  }, [intervalMs])
  return now
}

/** Dark or light text, whichever reads better on the block color. */
function textColorFor(hex) {
  const n = parseInt(hex.slice(1), 16)
  const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255]
  return 0.299 * r + 0.587 * g + 0.114 * b > 160 ? '#18181b' : '#ffffff'
}

const newDraft = (day, start = '09:00', end = '10:00', color = PRESET_COLORS[0]) => ({
  day,
  start,
  end,
  description: '',
  color,
})

export default function WeekView() {
  const [blocks, setBlocks] = useState([])
  const [settings, setSettings] = useState(null)
  const [loadError, setLoadError] = useState(null)
  const [editing, setEditing] = useState(null)
  const [formKey, setFormKey] = useState(0)
  const [sheetOpen, setSheetOpen] = useState(false)
  const scrollRef = useRef(null)
  const now = useNow()

  useEffect(() => {
    Promise.all([api.blocks(), api.settings()])
      .then(([b, s]) => {
        setBlocks(b)
        setSettings(s)
      })
      .catch((e) => setLoadError(e.message))
  }, [])

  const axis = useMemo(() => settings && axisRange(settings), [settings])
  const nowPos = axis && nowPosition(now, axis)
  const today = nowPos?.day ?? (now.getDay() + 6) % 7

  useEffect(() => {
    if (!editing && settings) setEditing(newDraft(today))
  }, [editing, settings, today])

  // On first render, scroll so the current time and today's column are in view.
  const scrolled = useRef(false)
  useLayoutEffect(() => {
    const el = scrollRef.current
    if (!el || !axis || scrolled.current) return
    scrolled.current = true
    if (nowPos.min >= axis.start && nowPos.min <= axis.end) {
      el.scrollTop = Math.max(0, (nowPos.min - axis.start) * PX_PER_MIN - el.clientHeight / 3)
    }
    const col = el.querySelector(`[data-day="${today}"]`)
    if (col && el.scrollWidth > el.clientWidth) {
      el.scrollLeft = col.offsetLeft - el.querySelector('.axis').offsetWidth
    }
  })

  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && setSheetOpen(false)
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const days = useMemo(() => {
    if (!axis) return []
    return DAYS.map((_, d) =>
      layoutDay(
        blocks
          .filter((b) => b.day === d)
          .map((b) => ({ ...blockSpan(b, axis), block: b }))
          .filter((it) => it.top < axis.end && it.bottom > axis.start)
          .map((it) => ({ ...it, top: Math.max(it.top, axis.start), bottom: Math.min(it.bottom, axis.end) })),
      ),
    )
  }, [blocks, axis])

  if (loadError) return <p className="page-message">Couldn’t load: {loadError}</p>
  if (!axis || !editing) return <p className="page-message">Loading…</p>

  const hourMarks = []
  for (let m = Math.ceil(axis.start / 60) * 60; m <= axis.end; m += 60) hourMarks.push(m)

  const startEditing = (value) => {
    setEditing(value)
    setFormKey((k) => k + 1)
    setSheetOpen(true)
  }

  const resetForm = (keep = {}) => {
    setEditing(newDraft(keep.day ?? today, undefined, undefined, keep.color))
    setFormKey((k) => k + 1)
  }

  const onColumnClick = (e, day) => {
    if (e.target !== e.currentTarget) return
    const y = e.clientY - e.currentTarget.getBoundingClientRect().top
    const min = Math.floor((axis.start + y / PX_PER_MIN) / 30) * 30
    startEditing(newDraft(day, toHHMM(min), toHHMM(min + 60), editing.color))
  }

  const save = async (value) => {
    if (value.id) {
      const updated = await api.updateBlock(value.id, value)
      setBlocks((bs) => bs.map((b) => (b.id === updated.id ? updated : b)))
      resetForm(updated)
      setSheetOpen(false)
    } else {
      const created = await api.createBlock(value)
      setBlocks((bs) => [...bs, created])
      // Stay open with the same day/color so several blocks can be added in a row.
      resetForm(created)
    }
  }

  const remove = async (id) => {
    await api.deleteBlock(id)
    setBlocks((bs) => bs.filter((b) => b.id !== id))
    resetForm()
    setSheetOpen(false)
  }

  const saveSettings = async (s) => {
    setSettings(await api.saveSettings(s))
  }

  const bodyHeight = (axis.end - axis.start) * PX_PER_MIN

  return (
    <div className="week">
      <div className="week-scroll" ref={scrollRef}>
        <div className="week-grid" style={{ '--hour-px': `${HOUR_PX}px` }}>
          <div className="corner" />
          {DAYS.map((name, d) => (
            <div key={name} className={`day-head${d === today ? ' today' : ''}`}>
              <span className="long">{name}</span>
              <span className="short">{name.slice(0, 3)}</span>
            </div>
          ))}

          <div className="axis" style={{ height: bodyHeight }}>
            {hourMarks.map((m, i) => (
              <span
                key={m}
                className={`hour-label${i === 0 ? ' first' : ''}`}
                style={{ top: (m - axis.start) * PX_PER_MIN }}
              >
                {format12(toHHMM(m), { short: true })}
              </span>
            ))}
          </div>

          {days.map((items, d) => (
            <div
              key={d}
              data-day={d}
              className={`day-col${d === today ? ' today' : ''}`}
              style={{ height: bodyHeight }}
              onClick={(e) => onColumnClick(e, d)}
            >
              {items.map(({ block, top, bottom, col, cols }) => (
                <button
                  key={block.id}
                  className={`block${editing.id === block.id ? ' selected' : ''}`}
                  style={{
                    top: (top - axis.start) * PX_PER_MIN,
                    height: Math.max((bottom - top) * PX_PER_MIN, 18),
                    left: `calc(${(col / cols) * 100}% + 2px)`,
                    width: `calc(${100 / cols}% - 4px)`,
                    background: block.color,
                    color: textColorFor(block.color),
                  }}
                  onClick={() => startEditing(block)}
                  title={`${block.description || 'Untitled'}\n${format12(block.start)} – ${format12(block.end)}`}
                >
                  <span className="block-desc">{block.description || 'Untitled'}</span>
                  <span className="block-time">
                    {format12(block.start)} – {format12(block.end)}
                  </span>
                </button>
              ))}

              {nowPos && nowPos.day === d && nowPos.min >= axis.start && nowPos.min <= axis.end && (
                <div className="now-line" style={{ top: (nowPos.min - axis.start) * PX_PER_MIN }} />
              )}
            </div>
          ))}
        </div>
      </div>

      {sheetOpen && <div className="backdrop" onClick={() => setSheetOpen(false)} />}
      <aside className={`panel${sheetOpen ? ' open' : ''}`}>
        <BlockForm
          key={formKey}
          value={editing}
          axis={axis}
          onSubmit={save}
          onDelete={remove}
          onCancel={() => {
            resetForm(editing)
            setSheetOpen(false)
          }}
        />
        <RangeSettings settings={settings} onSave={saveSettings} />
      </aside>

      <button className="fab" aria-label="Add block" onClick={() => startEditing(newDraft(today, undefined, undefined, editing.color))}>
        +
      </button>
    </div>
  )
}

function RangeSettings({ settings, onSave }) {
  const hours = Array.from({ length: 24 }, (_, h) => toHHMM(h * 60))
  const set = (key) => (e) => onSave({ ...settings, [key]: e.target.value })
  // Keep a non-whole-hour value selectable if one was set through the API.
  const options = (current) => (hours.includes(current) ? hours : [current, ...hours])
  return (
    <details className="range-settings">
      <summary>Visible hours</summary>
      <div className="row">
        <label>
          From
          <select value={settings.day_start} onChange={set('day_start')}>
            {options(settings.day_start).map((h) => (
              <option key={h} value={h}>{format12(h, { short: true })}</option>
            ))}
          </select>
        </label>
        <label>
          To
          <select value={settings.day_end} onChange={set('day_end')}>
            {options(settings.day_end).map((h) => (
              <option key={h} value={h}>{format12(h, { short: true })}</option>
            ))}
          </select>
        </label>
      </div>
      <p className="hint">An end time earlier than the start means the next morning.</p>
    </details>
  )
}
