import { useEffect, useRef, useState } from 'react'
import { DndContext, KeyboardSensor, PointerSensor, closestCenter, useSensor, useSensors } from '@dnd-kit/core'
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { api } from './api'

const verticalOnly = ({ transform }) => ({ ...transform, x: 0 })

export default function TodoPage() {
  const [tasks, setTasks] = useState(null)
  const [loadError, setLoadError] = useState(null)

  const reload = () =>
    api
      .tasks()
      .then(setTasks)
      .catch((e) => setLoadError(e.message))

  useEffect(() => {
    reload()
  }, [])

  if (loadError) return <p className="page-message">Couldn’t load: {loadError}</p>
  if (!tasks) return <p className="page-message">Loading…</p>

  // Optimistic local change, then sync with the server; on failure, re-fetch the truth.
  const sync = async (localChange, request) => {
    if (localChange) setTasks(localChange)
    try {
      return await request()
    } catch (e) {
      alert(`Couldn’t save: ${e.message}`)
      reload()
    }
  }

  const replace = (task) => setTasks((ts) => ts.map((t) => (t.id === task.id ? task : t)))

  const actions = {
    add: async (list, text) => {
      const task = await sync(null, () => api.createTask(list, text))
      if (task) setTasks((ts) => [...ts, task])
    },
    edit: async (id, text) => {
      const task = await sync((ts) => ts.map((t) => (t.id === id ? { ...t, text } : t)), () => api.updateTask(id, { text }))
      if (task) replace(task)
    },
    toggle: async (id, done) => {
      const task = await sync(
        (ts) => ts.map((t) => (t.id === id ? { ...t, done, done_at: done ? new Date().toISOString() : null } : t)),
        () => api.updateTask(id, { done }),
      )
      if (task) replace(task)
    },
    remove: (id) => sync((ts) => ts.filter((t) => t.id !== id), () => api.deleteTask(id)),
    reorder: (list, ids) =>
      sync(
        (ts) => ts.map((t) => (t.list === list && ids.includes(t.id) ? { ...t, position: ids.indexOf(t.id) } : t)),
        () => api.reorderTasks(list, ids),
      ),
  }

  const listProps = (list, title) => ({ list, title, tasks: tasks.filter((t) => t.list === list), actions })

  return (
    <div className="todo-page">
      <div className="todo-main">
        <section className="card">
          <h2 className="group-title">School</h2>
          <div className="school-split">
            <TaskList {...listProps('tests', 'Tests')} />
            <TaskList {...listProps('hw', 'HW')} />
          </div>
        </section>
        <section className="card">
          <TaskList {...listProps('extracurriculars', 'Extracurriculars')} />
        </section>
      </div>
      <aside className="card todo-side">
        <TaskList {...listProps('misc', 'Misc')} />
      </aside>
    </div>
  )
}

function TaskList({ list, title, tasks, actions }) {
  const [adding, setAdding] = useState(false)
  const [draft, setDraft] = useState('')
  const inputRef = useRef(null)
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  )

  const active = tasks.filter((t) => !t.done).sort((a, b) => a.position - b.position || a.id - b.id)
  const done = tasks.filter((t) => t.done).sort((a, b) => (b.done_at ?? '').localeCompare(a.done_at ?? ''))

  // A freshly opened input focuses itself via autoFocus; an already-open one is focused here.
  const open = () => (adding ? inputRef.current?.focus() : setAdding(true))

  const onKeyDown = (e) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      const text = draft.trim()
      if (text) {
        actions.add(list, text)
        setDraft('')
      }
    } else if (e.key === 'Escape') {
      setDraft('')
      setAdding(false)
    }
  }

  const onDragEnd = ({ active: dragged, over }) => {
    if (!over || dragged.id === over.id) return
    const ids = active.map((t) => t.id)
    actions.reorder(list, arrayMove(ids, ids.indexOf(dragged.id), ids.indexOf(over.id)))
  }

  return (
    <div className="task-list">
      <button className="list-head" onClick={open} title={`Add to ${title}`}>
        <span>{title}</span>
        {active.length > 0 && <span className="count">{active.length}</span>}
        <span className="plus" aria-hidden>+</span>
      </button>

      <DndContext sensors={sensors} collisionDetection={closestCenter} modifiers={[verticalOnly]} onDragEnd={onDragEnd}>
        <SortableContext items={active.map((t) => t.id)} strategy={verticalListSortingStrategy}>
          <ul className="tasks">
            {active.map((t) => (
              <SortableTask key={t.id} task={t} actions={actions} />
            ))}
          </ul>
        </SortableContext>
      </DndContext>

      {adding && (
        <input
          ref={inputRef}
          autoFocus
          className="add-input"
          value={draft}
          placeholder={`Add to ${title}… (Enter to add, Esc to close)`}
          enterKeyHint="enter"
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={onKeyDown}
          onBlur={() => !draft.trim() && setAdding(false)}
        />
      )}

      {!adding && active.length === 0 && (
        <button className="empty" onClick={open}>
          Nothing here. Click to add.
        </button>
      )}

      {done.length > 0 && (
        <details className="done-section">
          <summary>Done ({done.length})</summary>
          <ul className="tasks">
            {done.map((t) => (
              <TaskRow key={t.id} task={t} actions={actions} />
            ))}
          </ul>
        </details>
      )}
    </div>
  )
}

function SortableTask({ task, actions }) {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } = useSortable({
    id: task.id,
  })
  return (
    <TaskRow
      task={task}
      actions={actions}
      rowRef={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      dragging={isDragging}
      handle={
        <button className="grip" ref={setActivatorNodeRef} {...attributes} {...listeners} aria-label="Drag to reorder">
          ⠿
        </button>
      }
    />
  )
}

function TaskRow({ task, actions, rowRef, style, dragging, handle }) {
  const [editing, setEditing] = useState(false)
  const [text, setText] = useState(task.text)
  const cancelled = useRef(false)

  const startEdit = () => {
    setText(task.text)
    cancelled.current = false
    setEditing(true)
  }

  const commit = () => {
    setEditing(false)
    if (cancelled.current) return
    const value = text.trim()
    if (value && value !== task.text) actions.edit(task.id, value)
  }

  return (
    <li
      ref={rowRef}
      style={style}
      className={`task${task.done ? ' done' : ''}${dragging ? ' dragging' : ''}`}
    >
      {handle ?? <span className="grip-spacer" />}
      <input
        type="checkbox"
        className="check"
        checked={task.done}
        onChange={(e) => actions.toggle(task.id, e.target.checked)}
        aria-label={task.done ? 'Mark not done' : 'Mark done'}
      />
      {editing ? (
        <input
          className="edit-input"
          autoFocus
          value={text}
          onChange={(e) => setText(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === 'Enter') e.currentTarget.blur()
            if (e.key === 'Escape') {
              cancelled.current = true
              setEditing(false)
            }
          }}
        />
      ) : (
        <span className="task-text" onClick={startEdit}>
          {task.text}
        </span>
      )}
      <button
        className="delete"
        onClick={() => actions.remove(task.id)}
        aria-label={`Delete “${task.text}”`}
        title="Delete"
      >
        ✕
      </button>
    </li>
  )
}
