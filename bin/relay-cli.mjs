#!/usr/bin/env node
/**
 * Producer CLI for the dsh-superagent-relay queue.
 *
 *   relay-cli push --conversation desktop --actor Shuai-S --text "..." [--thread <id>] [--no-addressed] [--data-dir <dir>]
 *   relay-cli replies [--after <n>] [--data-dir <dir>]     # outbound agent replies (JSONL)
 *   relay-cli peek [--tail <n>] [--data-dir <dir>]          # last raw queue lines
 */
import { appendFileSync, existsSync, mkdirSync, readFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { isAbsolute, join, resolve } from 'node:path'

function dataDir() {
  const i = process.argv.indexOf('--data-dir')
  const raw = i >= 0 ? process.argv[i + 1] : null
  if (!raw) return join(homedir(), '.local/state/dsh-superagent-relay')
  return isAbsolute(raw) ? raw : resolve(raw)
}
function arg(name, fallback) {
  const i = process.argv.indexOf(name)
  return i >= 0 && process.argv[i + 1] !== undefined ? process.argv[i + 1] : fallback
}
function flag(name) { return process.argv.includes(name) }
function cmd() { const a = process.argv[2]; return a && !a.startsWith('--') ? a : 'help' }

const dir = dataDir()
const file = join(dir, 'queue.jsonl')
function append(record) {
  mkdirSync(dir, { recursive: true })
  appendFileSync(file, JSON.stringify(record) + '\n', 'utf8')
}
function lines() {
  if (!existsSync(file)) return []
  return readFileSync(file, 'utf8').split('\n').filter((l) => l.trim() !== '')
}

const command = cmd()
if (command === 'push') {
  const id = 'msg-' + Date.now() + '-' + Math.random().toString(36).slice(2, 8)
  const record = {
    dir: 'in',
    id,
    conversation: arg('--conversation', 'desktop'),
    ...(arg('--thread', null) ? { thread: arg('--thread') } : {}),
    sender: { id: arg('--actor', 'Shuai-S'), ...(arg('--name', null) ? { name: arg('--name') } : {}), ...(flag('--bot') ? { bot: true } : {}) },
    addressed: !flag('--no-addressed'),
    text: arg('--text', ''),
    at: new Date().toISOString(),
  }
  append(record)
  console.log(JSON.stringify({ pushed: id, thread: record.thread ?? id, file }))
} else if (command === 'replies') {
  const after = Number(arg('--after', '0'))
  const out = lines().map((l) => { try { return JSON.parse(l) } catch { return null } }).filter((r) => r && r.dir === 'out').slice(after)
  console.log(JSON.stringify(out, null, 2))
} else if (command === 'peek') {
  const tail = Number(arg('--tail', '10'))
  for (const l of lines().slice(-tail)) console.log(l)
} else {
  console.log('usage: relay-cli push|replies|peek [options]  (see file header)')
  process.exit(command === 'help' ? 0 : 1)
}
