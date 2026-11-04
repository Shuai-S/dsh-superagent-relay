/** Minimal structural mirrors of the dsh-superagent source contracts.
 *  The engine validates everything at runtime (SourceRegistry.register,
 *  Settings validation); these types only shape our own code. */

export interface Localized { zh: string; en: string }

export interface Health {
  state: 'starting' | 'ready' | 'paused' | 'error'
  detail: string
  at?: string
  code?: string
  values?: Record<string, string>
}

export interface TriggerLike {
  id: string
  source: string
  threads: { source: string; id: string }[]
  actor: { source: string; id: string }
  human: boolean
  addressed?: 'mention' | 'direct'
  at: string
  text: string
  channel?: { source: string; thread: string; address: Record<string, string> }
  url?: string
  meta: Record<string, unknown>
}

export interface ContextMessage { id: string; from: string; at: string; text: string; bot?: true; url?: string }
export interface ContextPart { messages: ContextMessage[]; next?: string | undefined; body: Record<string, unknown>; status?: string }

export interface OutboundMessageLike {
  id: string
  channel: { source: string; thread: string; address: Record<string, string> }
  text: string
  kind: 'acknowledgement' | 'reply' | 'notice'
  ticketId?: string
}

export interface SourceContextLike {
  readonly deployment: { repository: string }
  configured(): boolean
  config<C>(kind: string): C | undefined
  receive(trigger: TriggerLike): unknown | Promise<unknown>
  state: { get<V>(key: string): V | undefined; set<V>(key: string, value: V | undefined): void }
  threads: {
    get(key: string): unknown | undefined
    subscribed(source: string): unknown[]
    describe(key: string, description: Record<string, unknown>): void
    patch(key: string, meta: Record<string, unknown>): void
  }
  notify(message: OutboundMessageLike): void
  report(entry: string, health: Health): void
}

export interface SourceRegistryLike {
  register(kind: unknown): () => void
}

export interface OrchestratorLike {
  sources: SourceRegistryLike
  context(kind: { kind: string; health: readonly string[] }): SourceContextLike
}
