import type { TuiPlugin } from "@opencode-ai/plugin/tui"

export const COMPACTION_TIMEOUT_MS = 30_000

export type CompactionEvent =
  | { type: "session.compacted"; properties: { sessionID: string } }
  | { type: "session.error"; properties: { sessionID?: string } }

export type SessionModelMessage = {
  role: "user" | "assistant"
  model?: {
    providerID?: string
    modelID?: string
  }
}

export type OpenAIProvider = {
  id: string
  models: Record<string, unknown>
}

export type OpenAIModel = {
  providerID: string
  modelID: string
}

export function resolveOpenAIModel(
  messages: readonly SessionModelMessage[],
  providers: readonly OpenAIProvider[],
): OpenAIModel | undefined {
  let latest: SessionModelMessage | undefined
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    if (messages[index]?.role === "user") {
      latest = messages[index]
      break
    }
  }
  const providerID = latest?.model?.providerID
  const modelID = latest?.model?.modelID
  if (providerID !== "openai" || !modelID) return undefined
  const provider = providers.find((item) => item.id === providerID)
  if (!provider || !provider.models[modelID]) return undefined
  return { providerID, modelID }
}

export function compactionEventResult(
  event: CompactionEvent,
  sessionID: string,
): "success" | "error" | undefined {
  if (event.type === "session.compacted") {
    return event.properties.sessionID === sessionID ? "success" : undefined
  }
  if (event.type === "session.error") {
    return event.properties.sessionID === sessionID ? "error" : undefined
  }
  return undefined
}

const tui: TuiPlugin = async (api) => {
  const monitors = new Map<string, () => void>()

  const stop = (sessionID: string) => {
    monitors.get(sessionID)?.()
  }

  const monitor = (sessionID: string) => {
    if (monitors.has(sessionID)) return undefined

    api.ui.toast({ message: "Compaction started", variant: "info" })
    let finished = false
    let timer: ReturnType<typeof setTimeout> | undefined
    const disposers = [
      api.event.on("session.compacted", (event) => {
        if (compactionEventResult(event, sessionID) !== "success") return
        api.ui.toast({ message: "Compaction successful", variant: "success" })
        cleanup()
      }),
      api.event.on("session.error", (event) => {
        if (compactionEventResult(event, sessionID) !== "error") return
        api.ui.toast({ message: "Compaction failed", variant: "error" })
        cleanup()
      }),
    ]

    const cleanup = () => {
      if (finished) return
      finished = true
      if (timer) clearTimeout(timer)
      for (const dispose of disposers) dispose()
      if (monitors.get(sessionID) === cleanup) monitors.delete(sessionID)
    }

    monitors.set(sessionID, cleanup)
    timer = setTimeout(() => {
      api.ui.toast({ message: "Compaction timed out without success", variant: "warning" })
      cleanup()
    }, COMPACTION_TIMEOUT_MS)
    return cleanup
  }

  api.keymap.registerLayer({
    priority: 1,
    commands: [
      {
        name: "session.compact",
        title: "Compact session",
        category: "Session",
        namespace: "palette",
        slashName: "compact",
        slashAliases: ["summarize"],
        async run() {
          const sessionID =
            api.route.current.name === "session" && typeof api.route.current.params?.sessionID === "string"
              ? api.route.current.params.sessionID
              : undefined
          if (!sessionID) {
            api.ui.toast({ message: "No active session to compact", variant: "warning" })
            return
          }

          const messages = api.state.session.messages(sessionID)
          const latestUser = [...messages].reverse().find((message) => message.role === "user")
          const providerID = latestUser?.model?.providerID
          if (providerID && providerID !== "openai") {
            api.ui.toast({
              message: `Compaction is only available for OpenAI models (current provider: ${providerID})`,
              variant: "warning",
            })
            return
          }

          const model = resolveOpenAIModel(messages, api.state.provider)
          if (!model) {
            api.ui.toast({ message: "No usable OpenAI model found for this session", variant: "warning" })
            return
          }

          const cleanup = monitor(sessionID)
          try {
            await api.client.session.summarize(
              { sessionID, providerID: model.providerID, modelID: model.modelID, auto: false },
              { throwOnError: true },
            )
          } catch (error) {
            cleanup?.()
            api.ui.toast({
              message: error instanceof Error ? `Compaction failed: ${error.message}` : "Compaction failed",
              variant: "error",
            })
          }
        },
      },
    ],
  })

  api.lifecycle.onDispose(() => {
    for (const sessionID of monitors.keys()) stop(sessionID)
  })
}

export { tui }

export default {
  id: "4our4ace-opencode-openai-compact",
  tui,
}
