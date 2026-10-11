async function request(method, url, body) {
  const res = await fetch(url, {
    method,
    headers: body !== undefined ? { 'Content-Type': 'application/json' } : {},
    body: body !== undefined ? JSON.stringify(body) : undefined,
  })
  if (!res.ok) {
    let msg = res.statusText
    try {
      const { detail } = await res.json()
      msg = typeof detail === 'string' ? detail : detail.map((d) => d.msg).join(', ')
    } catch {}
    throw new Error(msg)
  }
  return res.status === 204 ? null : res.json()
}

export const api = {
  blocks: () => request('GET', '/api/blocks'),
  createBlock: (b) => request('POST', '/api/blocks', b),
  updateBlock: (id, b) => request('PUT', `/api/blocks/${id}`, b),
  deleteBlock: (id) => request('DELETE', `/api/blocks/${id}`),

  tasks: () => request('GET', '/api/tasks'),
  createTask: (list, text) => request('POST', '/api/tasks', { list, text }),
  updateTask: (id, patch) => request('PATCH', `/api/tasks/${id}`, patch),
  deleteTask: (id) => request('DELETE', `/api/tasks/${id}`),
  reorderTasks: (list, ids) => request('PUT', '/api/tasks/reorder', { list, ids }),

  settings: () => request('GET', '/api/settings'),
  saveSettings: (s) => request('PUT', '/api/settings', s),

  importData: (data) => request('POST', '/api/import', data),
}
