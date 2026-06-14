// _v3/modules/shared/log.ts — append-only audit-trail transform (pure). An entry is only
// ever appended; existing entries are never mutated or removed.
export interface LogEntry {
  at: string
  kind: string
  note: string
}

export function appendLog(log: LogEntry[], entry: LogEntry): LogEntry[] {
  return [...log, entry]
}
