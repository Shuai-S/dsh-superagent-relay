import { readFileSync, existsSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { homedir } from 'node:os'
const dir = process.argv[2] ?? join(homedir(), '.local/state/dsh-superagent-relay')
const file = join(dir, 'queue.jsonl')
const lines = existsSync(file) ? readFileSync(file, 'utf8').split('\n').filter(Boolean) : []
let last = null
for (const l of lines) { try { const j = JSON.parse(l); if (j.dir === 'in') last = j } catch {} }
if (!last) { console.log('no in-record'); process.exit(0) }
const headers = { 'x-orchestrator-request': '1' }
const api = 'http://127.0.0.1:3082/orchestrator/api'
const threadKey = 'relay:' + last.conversation + ':' + (last.thread ?? last.id)
let stage = '?'
let evaluating = null
try { const r = await fetch(api + '/threads/' + encodeURIComponent(threadKey), { headers }); const j = await r.json(); stage = j.stage; evaluating = j.evaluating ?? null } catch {}
let tickets = '?'
const ticketDetails = []
try { const r = await fetch(api + '/tickets?filter=all', { headers }); const j = await r.json(); tickets = j.total; ticketDetails = (j.items ?? []).map((t) => ({ id: String(t.id ?? '').slice(0, 14), title: String(t.title ?? '').slice(0, 30), stage: t.stage ?? t.state ?? '' })) } catch {}
const workRoot = '/Users/zs/relay-work'
let fileHit = 'no-file'
try {
  for (const d of readdirSync(workRoot)) {
    const p = join(workRoot, d, 'hello-relay.txt')
    if (existsSync(p)) fileHit = p + ' :: ' + readFileSync(p, 'utf8').trim()
  }
} catch {}
const replies = lines.map((l) => { try { return JSON.parse(l) } catch { return null } }).filter((r) => r && r.dir === 'out').slice(-3)
console.log(JSON.stringify({ pushed: last.id, thread: threadKey, stage, evaluating, tickets, ticketDetails, fileHit, recentReplies: replies }, null, 1))
