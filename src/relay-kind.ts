/** The 'relay' Source kind: conversations backed by the local queue file.
 *  See the dsh-superagent-prototype docs/008-cookbook.md for the contract this
 *  follows; the shape mirrors the bundled github/feishu kinds. */
import { z } from 'zod'
import type { Localized, OutboundMessageLike, SourceContextLike, TriggerLike } from './types.ts'
import { appendRecord, expandDir, readQueue, queueFile } from './queue.ts'

export interface RelayConversation { id: string; name: string }
export interface RelayConfig {
  dataDir: string
  pollSeconds: number
  conversations: RelayConversation[]
}

const QUEUEhealth = 'relayQueue'

export const RelayConfigSchema = z.object({
  dataDir: z.string().default('~/.local/state/dsh-superagent-relay'),
  pollSeconds: z.number().int().min(5).max(3600).default(15),
  conversations: z.array(z.object({
    id: z.string().min(1),
    name: z.string().default(''),
  })).default([{ id: 'desktop', name: 'Desktop' }]),
}).strict()
export type RelayConfigInput = z.input<typeof RelayConfigSchema>

const threadKeyOf = (conversation: string, root: string): string => 'relay:' + conversation + ':' + root

function contextMessages(dataDir: string, conversation: string, root: string) {
  const { records } = readQueue(dataDir)
  const messages = records
    .filter((r) => r.conversation === conversation)
    .filter((r) => (r.dir === 'in' ? (r.thread ?? r.id) === root || r.id === root : r.to === root || r.id === root))
    .map((r) => r.dir === 'in'
      ? { id: r.id, from: r.sender.id, at: r.at, text: r.text, ...(r.sender.bot ? { bot: true as const } : {}) }
      : { id: r.id, from: 'agent', at: r.at, text: r.text })
    .slice(-80)
  return messages
}

export const relayKind = {
  kind: 'relay',
  title: { zh: '中继队列', en: 'Relay queue' },
  description: { zh: '接收本地中继队列里所配会话的消息（桌面端派活、dingtalk-cli 桥）。', en: 'Receives messages of the configured conversations from the local relay queue (desktop dispatch, dingtalk-cli bridge).' },
  schema: RelayConfigSchema,
  fields: [
    { key: 'conversations', type: 'rows', label: { zh: '接收的会话', en: 'Conversations' }, columns: [
      { key: 'id', type: 'text', label: { zh: '会话 ID', en: 'Conversation' } },
      { key: 'name', type: 'text', label: { zh: '名称', en: 'Name' }, optional: true },
    ] },
    { key: 'dataDir', type: 'text', label: { zh: '队列目录', en: 'Queue directory' }, advanced: true },
    { key: 'pollSeconds', type: 'number', min: 5, max: 3600, label: { zh: '轮询间隔 / 秒', en: 'Poll interval (s)' }, advanced: true },
  ],
  health: [QUEUEhealth],
  scope(input: { meta: Record<string, unknown> }, config: RelayConfig) {
    const conversation = String(input.meta.conversation ?? '')
    const row = config.conversations.find((c) => c.id === conversation)
    if (!row) return { listened: false, reason: 'relay: conversation not configured: ' + conversation }
    return { listened: true, observed: false, row: row.id }
  },
  channel: {
    async send(_host: unknown, message: OutboundMessageLike): Promise<'sent' | 'gone'> {
      const address = message.channel.address as { conversation: string; message: string }
      appendRecord(expandDir((channelDataDir as { current?: string }).current ?? '~/.local/state/dsh-superagent-relay'), {
        dir: 'out',
        id: message.id,
        conversation: address.conversation,
        to: address.message,
        text: message.text,
        kind: message.kind,
        at: new Date().toISOString(),
      })
      return 'sent'
    },
    link(address: Record<string, string>) {
      return { url: '', label: { zh: '中继 ' + String(address.conversation ?? ''), en: 'Relay ' + String(address.conversation ?? '') } }
    },
  },
  threadContext: {
    messageId(trigger: TriggerLike): string {
      return String(trigger.meta.messageId ?? '')
    },
    async read(_commands: unknown, trigger: TriggerLike, part: 'thread' | 'root' | 'parent', _cursor: string | undefined, config: RelayConfig) {
      const conversation = String(trigger.meta.conversation ?? '')
      const root = String(trigger.meta.root ?? '')
      const messages = contextMessages(expandDir(config.dataDir), conversation, root)
      if (part === 'thread' || part === 'root') {
        return { messages, body: {}, status: undefined }
      }
      return { messages: messages.slice(0, 1), body: {}, status: undefined }
    },
  },
  policy: {
    schema: z.object({
      allowed: z.array(z.object({ id: z.string(), name: z.string().optional() })).default([]),
    }).strict(),
    fields: [
      { key: 'allowed', type: 'rows', label: { zh: '允许派活的人', en: 'Allowed senders' }, columns: [
        { key: 'id', type: 'text', label: { zh: 'ID', en: 'ID' } },
        { key: 'name', type: 'text', label: { zh: '名称', en: 'Name' }, optional: true },
      ] },
    ],
    explicit: { zh: 'push 时标记了 addressed（明确指派给 agent）', en: 'Pushed with the addressed flag (explicit assignment)' },
    rows(config: Record<string, unknown>) {
      const conversations = (Array.isArray(config.conversations) ? config.conversations : []) as RelayConversation[]
      return conversations.map((c) => ({
        id: c.id,
        label: c.name || c.id,
        note: { zh: '中继会话（本地队列）', en: 'Relay conversation (local queue)' },
        cells: { listedUnaddressed: true, unlistedAddressed: true, unlistedUnaddressed: true },
      }))
    },
  },
}

// The engine passes the resolved config to channel.send through its own host;
// the kind receives it via the watcher instead, so channel.send reads the
// current dataDir from this module-level holder set on every poll round.
export const channelDataDir: { current?: string } = {}
export { QUEUEhealth, threadKeyOf, queueFile }