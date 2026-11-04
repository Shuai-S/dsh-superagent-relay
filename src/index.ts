/**
 * dsh-superagent-relay — a queue-backed Source kind for dsh-superagent.
 *
 * Registers the 'relay' Source kind with the engine's SourceRegistry through
 * the same extension seam the bundled github/feishu watchers use
 * (inject 'orchestrator' -> ctx.orchestrator.sources.register(kind)), then
 * polls the local queue file for in-records pushed by producers such as the
 * desktop conversation and the dingtalk-cli bridge.
 *
 * @module dsh-superagent-relay
 */
import type { Context } from '@deepseek-ai/cordis'
import type { OrchestratorLike } from './types.ts'
import { relayKind, channelDataDir } from './relay-kind.ts'
import { watch } from './watch.ts'

export const name: string = 'dsh-superagent-relay'
export const inject: string[] = ['orchestrator']

export function apply(ctx: Context): void {
  const orchestrator = (ctx as unknown as { orchestrator: OrchestratorLike }).orchestrator
  ctx.effect(() => orchestrator.sources.register(relayKind), 'relay: source kind')
  ctx.effect(() => {
    const source = orchestrator.context(relayKind)
    const controller = new AbortController()
    const running = watch(source, controller.signal).catch((error: unknown) => {
      source.report('relayQueue', { state: 'error', detail: String(error) })
    })
    return async () => { controller.abort(); await running }
  })
}
export { relayKind, RelayConfigSchema } from './relay-kind.ts'
