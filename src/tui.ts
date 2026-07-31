import type { TuiPlugin } from "@opencode-ai/plugin/tui"

export type SelectedModel = {
  providerID?: string
  id?: string
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
  selected: SelectedModel | undefined,
  providers: readonly OpenAIProvider[],
): OpenAIModel | undefined {
  const providerID = selected?.providerID
  const modelID = selected?.id
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

          const selectedModel = api.state.session.get(sessionID)?.model
          const providerID = selectedModel?.providerID
          if (providerID && providerID !== "openai") {
            api.ui.toast({
              message: `Compaction is only available for OpenAI models (current provider: ${providerID})`,
              variant: "warning",
            })
            return
          }

          const model = resolveOpenAIModel(selectedModel, api.state.provider)
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
