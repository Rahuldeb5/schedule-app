/**
 * Lay out one day's blocks so overlapping ones sit side by side.
 * Input items have {top, bottom}; output adds {col, cols}.
 * Blocks that transitively overlap form a cluster and share its column count.
 */
export function layoutDay(items) {
  const sorted = [...items].sort((a, b) => a.top - b.top || b.bottom - a.bottom)
  const out = []
  let cluster = []
  let columnEnds = []
  let clusterEnd = -Infinity

  const flush = () => {
    for (const it of cluster) out.push({ ...it, cols: columnEnds.length })
    cluster = []
    columnEnds = []
  }

  for (const item of sorted) {
    if (item.top >= clusterEnd) {
      flush()
      clusterEnd = -Infinity
    }
    let col = columnEnds.findIndex((end) => end <= item.top)
    if (col === -1) col = columnEnds.length
    columnEnds[col] = item.bottom
    cluster.push({ ...item, col })
    clusterEnd = Math.max(clusterEnd, item.bottom)
  }
  flush()
  return out
}
