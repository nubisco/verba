/** One audit entry, as `/projects/:id/history` returns it. */
export interface HistoryEntry {
  id: string
  action: string
  entityType: string
  entityId: string
  createdAt: string
  user: { id: string; email: string; name?: string | null } | null
}

/** A row of the project history table. A type, not an interface, so it fits NbDataTable's row type. */
export type HistoryRow = {
  id: string
  action: string
  entityType: string
  user: string
  date: string
}

/** Who did it: the person's name, their email when they have none, or System. */
export function historyActor(user: HistoryEntry['user']): string {
  if (!user) return 'System'
  return user.name?.trim() || user.email
}

/** The table's rows, in the order the API returned them. */
export function historyRows(
  entries: HistoryEntry[],
  formatTime: (ts: string) => string = (ts) => new Date(ts).toLocaleString(),
): HistoryRow[] {
  return entries.map((e) => ({
    id: e.id,
    action: e.action,
    entityType: e.entityType,
    user: historyActor(e.user),
    date: formatTime(e.createdAt),
  }))
}
