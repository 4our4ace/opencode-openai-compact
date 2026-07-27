import type { TuiPlugin } from "@opencode-ai/plugin/tui"

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

const tui: TuiPlugin = async (api) => {
  const inFlight = new Set<string>()

  const start = (sessionID: string) => {
    if (inFlight.has(sessionID)) return false
    inFlight.add(sessionID)
    api.ui.toast({ message: "Compaction started", variant: "info" })
    return true
  }

  const keymapDisposer = api.keymap.registerLayer({
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

          if (inFlight.has(sessionID)) {
            api.ui.toast({ message: "Compaction already in progress for this session", variant: "warning" })
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

          if (!start(sessionID)) return
          try {
            const result = await api.client.session.summarize(
              { sessionID, providerID: model.providerID, modelID: model.modelID, auto: false },
              { throwOnError: true },
            )
            if (result.data === true) {
              api.ui.toast({ message: "Compaction successful", variant: "success" })
              return
            }
            api.ui.toast({ message: "Compaction failed", variant: "error" })
          } catch (error) {
            api.ui.toast({
              message: error instanceof Error ? `Compaction failed: ${error.message}` : "Compaction failed",
              variant: "error",
            })
          } finally {
            inFlight.delete(sessionID)
          }
        },
      },
    ],
  })

  api.lifecycle.onDispose(() => {
    if (typeof keymapDisposer === "function") keymapDisposer()
    inFlight.clear()
  })
}

export { tui }

export default {
  id: "4our4ace-opencode-openai-compact",
  tui,
}
