/** Poll loop: read queue lines past the cursor, turn in-records into Triggers,
 *  await receive() per trigger, then advance the cursor. Duplicate trigger ids
 *  are deduplicated by the engine, so a crash between receive and cursor
 *  advance only re-offers the same work. */
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import type { SourceContextLike, TriggerLike } from './types.ts'
import type { RelayConfig } from './relay-kind.ts'
import { channelDataDir } from './relay-kind.ts'
import { expandDir, readCursor, writeCursor } from './queue.ts'

export function pause(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    if (signal.aborted) { resolve(); return }
    const timer = setTimeout(() => { signal.removeEventListener('abort', stop); resolve() }, ms)
    const stop = () => { clearTimeout(timer); resolve() }
    signal.addEventListener('abort', stop, { once: true })
  })
}

interface InLine { dir: 'in'; id: string; conversation: string; thread?: string; sender: { id: string; name?: string; bot?: boolean }; addressed: boolean; text: string; at: string }

export async function ingest(source: SourceContextLike, config: RelayConfig): Promise<number> {
  const file = join(expandDir(config.dataDir), 'queue.jsonl')
  if (!existsSync(file)) return 0
  const cursor = readCursor(config.dataDir)
  const lines = readFileSync(file, 'utf8').split('\n').filter((l) => l.trim() !== '')
  if (lines.length <= cursor.line) return 0
  let processed = cursor.line
  for (let i = cursor.line; i < lines.length; i++) {
    processed = i + 1
    let rec: InLine | undefined
    try { const parsed = JSON.parse(lines[i]) as InLine; if (parsed && parsed.dir === 'in') rec = parsed } catch { continue }
    if (!rec) continue
    if (!config.conversations.some((c) => c.id === rec.conversation)) continue
    const root = rec.thread ?? rec.id
    const trigger: TriggerLike = {
      id: 'relay:' + rec.id,
      source: 'relay',
      threads: [{ source: 'relay', id: root }],
      actor: { source: 'relay', id: rec.sender.id },
      human: !rec.sender.bot,
      ...(rec.addressed ? { addressed: 'mention' as const } : {}),
      at: rec.at,
      text: rec.text,
      channel: { source: 'relay', thread: 'relay:' + rec.conversation + ':' + root, address: { conversation: rec.conversation, message: rec.id } },
      meta: { conversation: rec.conversation, messageId: rec.id, root },
    }
    await source.receive(trigger)
  }
  writeCursor(config.dataDir, { line: processed })
  return processed - cursor.line
}

export async function watch(source: SourceContextLike, signal: AbortSignal): Promise<void> {
  let pollSeconds = 15
  while (!signal.aborted) {
    try {
      const config = source.config<RelayConfig>('relay')
      if (config && source.configured()) {
        channelDataDir.current = config.dataDir
        pollSeconds = config.pollSeconds
        await ingest(source, config)
        source.report('relayQueue', { state: 'ready', detail: '' })
      } else {
        source.report('relayQueue', { state: 'paused', detail: 'waiting for configuration' })
      }
    } catch (error) {
      source.report('relayQueue', { state: 'error', detail: String(error) })
    }
    await pause(pollSeconds * 1000, signal)
  }
}
