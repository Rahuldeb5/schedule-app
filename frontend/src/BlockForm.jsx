import { useState } from 'react'
import { DAYS, blockSpan, format12 } from './time'

export const PRESET_COLORS = [
  '#6366f1', // indigo
  '#3b82f6', // blue
  '#14b8a6', // teal
  '#22c55e', // green
  '#f59e0b', // amber
  '#f97316', // orange
  '#ef4444', // red
  '#ec4899', // pink
  '#64748b', // slate
]

export default function BlockForm({ value, axis, onSubmit, onDelete, onCancel }) {
  const [form, setForm] = useState(value)
  const [error, setError] = useState(null)
  const [busy, setBusy] = useState(false)
  const isEdit = Boolean(form.id)

  const set = (key) => (e) => setForm({ ...form, [key]: key === 'day' ? Number(e.target.value) : e.target.value })

  const run = async (fn) => {
    setBusy(true)
    setError(null)
    try {
      await fn()
    } catch (e) {
      setError(e.message)
      setBusy(false)
    }
  }

  const submit = (e) => {
    e.preventDefault()
    if (form.start === form.end) return setError('End time must differ from start time.')
    run(() => onSubmit(form))
  }

  const span = form.start && form.end && blockSpan(form, axis)
  const wraps = span && span.bottom > 24 * 60 && span.top < 24 * 60
  const outside = span && (span.top >= axis.end || span.bottom > axis.end)

  return (
    <form className="block-form" onSubmit={submit}>
      <div className="form-head">
        <h2>{isEdit ? 'Edit block' : 'Add block'}</h2>
        <button type="button" className="sheet-close" aria-label="Close" onClick={onCancel}>✕</button>
      </div>

      <label>
        Day
        <select value={form.day} onChange={set('day')}>
          {DAYS.map((d, i) => (
            <option key={d} value={i}>{d}</option>
          ))}
        </select>
      </label>

      <div className="row">
        <label>
          Start
          <input type="time" required value={form.start} onChange={set('start')} />
        </label>
        <label>
          End
          <input type="time" required value={form.end} onChange={set('end')} />
        </label>
      </div>
      {wraps && <p className="hint">Runs past midnight; it shows at the bottom of {DAYS[form.day]}.</p>}
      {outside && <p className="hint warn">Part of this block is outside the visible hours.</p>}

      <label>
        Description
        <textarea rows={2} value={form.description} onChange={set('description')} placeholder="e.g. Calc lecture" autoFocus={isEdit} />
      </label>

      <fieldset className="colors">
        <legend>Color</legend>
        {PRESET_COLORS.map((c) => (
          <button
            key={c}
            type="button"
            className={`swatch${form.color.toLowerCase() === c ? ' active' : ''}`}
            style={{ background: c }}
            aria-label={`Color ${c}`}
            onClick={() => setForm({ ...form, color: c })}
          />
        ))}
        <label
          className={`swatch custom${PRESET_COLORS.includes(form.color.toLowerCase()) ? '' : ' active'}`}
          style={{ background: PRESET_COLORS.includes(form.color.toLowerCase()) ? undefined : form.color }}
          title="Custom color"
        >
          <input type="color" value={form.color} onChange={set('color')} aria-label="Custom color" />
        </label>
      </fieldset>

      {error && <p className="error">{error}</p>}

      <div className="actions">
        <button type="submit" className="primary" disabled={busy}>
          {isEdit ? 'Save' : 'Add'}
        </button>
        {isEdit && (
          <>
            <button type="button" onClick={onCancel} disabled={busy}>Cancel</button>
            <button
              type="button"
              className="danger"
              disabled={busy}
              onClick={() => confirm(`Delete “${form.description || 'Untitled'}” (${format12(form.start)})?`) && run(() => onDelete(form.id))}
            >
              Delete
            </button>
          </>
        )}
      </div>
    </form>
  )
}
