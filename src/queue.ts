/** The relay queue: one append-only JSONL file of in/out records plus a read cursor.
 *  Producers append via bin/relay-cli.mjs; the engine reads past its cursor,
 *  turns in-records into Triggers, and appends out-records as channel replies. */
import { existsSync, readFileSync, appendFileSync, mkdirSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { isAbsolute, join, resolve } from 'node:path'

export interface InRecord {
  dir: 'in'
  id: string
  conversation: string
  thread?: string
  sender: { id: string; name?: string; bot?: boolean }
  addressed: boolean
  text: string
  at: string
}

export interface OutRecord {
  dir: 'out'
  id: string
  conversation: string
  to: string
  text: string
  kind: string
  at: string
}

export type QueueRecord = InRecord | OutRecord

export function expandDir(dataDir: string): string {
  const p = dataDir.startsWith('~') ? join(homedir(), dataDir.slice(1)) : dataDir
  return isAbsolute(p) ? p : resolve(p)
}

export function queueFile(dataDir: string): string { return join(expandDir(dataDir), 'queue.jsonl') }

export interface QueueSnapshot { records: QueueRecord[]; total: number }

export function readQueue(dataDir: string): QueueSnapshot {
  const file = queueFile(dataDir)
  if (!existsSync(file)) return { records: [], total: 0 }
  const lines = readFileSync(file, 'utf8').split('\n').filter((l) => l.trim() !== '')
  const records: QueueRecord[] = []
  for (const line of lines) {
    try { records.push(JSON.parse(line) as QueueRecord) } catch { /* skip torn tail line */ }
  }
  return { records, total: lines.length }
}

export function appendRecord(dataDir: string, record: QueueRecord): void {
  const dir = expandDir(dataDir)
  mkdirSync(dir, { recursive: true })
  appendFileSync(queueFile(dataDir), JSON.stringify(record) + '\n', { encoding: 'utf8' })
}

export interface Cursor { line: number }

export function readCursor(dataDir: string): Cursor {
  const file = join(expandDir(dataDir), 'cursor.json')
  if (!existsSync(file)) return { line: 0 }
  try { return JSON.parse(readFileSync(file, 'utf8')) as Cursor } catch { return { line: 0 } }
}

export function writeCursor(dataDir: string, cursor: Cursor): void {
  const dir = expandDir(dataDir)
  mkdirSync(dir, { recursive: true })
  writeFileSync(join(dir, 'cursor.json'), JSON.stringify(cursor), { encoding: 'utf8' })
}
