import { describe, expect, test } from "vitest"
import { compactionEventResult, resolveOpenAIModel, tui } from "../src/tui.js"

describe("TUI compaction event matching", () => {
  test("matches only the monitored session", () => {
    expect(compactionEventResult({ type: "session.compacted", properties: { sessionID: "other" } }, "session")).toBe(
      undefined,
    )
    expect(compactionEventResult({ type: "session.compacted", properties: { sessionID: "session" } }, "session")).toBe(
      "success",
    )
  })

  test("recognizes matching errors", () => {
    expect(
      compactionEventResult(
        { type: "session.error", properties: { sessionID: "session", error: {} as never } },
        "session",
      ),
    ).toBe("error")
  })
})

describe("TUI compaction model selection", () => {
  test("uses the latest user OpenAI model only when it is available", () => {
    const messages = [
      { role: "user" as const, model: { providerID: "openai", modelID: "older" } },
      { role: "user" as const, model: { providerID: "openai", modelID: "current" } },
    ]
    expect(resolveOpenAIModel(messages, [{ id: "openai", models: { current: {} } }])).toEqual({
      providerID: "openai",
      modelID: "current",
    })
    expect(resolveOpenAIModel(messages, [{ id: "anthropic", models: { current: {} } }])).toBeUndefined()
    expect(resolveOpenAIModel(messages, [{ id: "openai", models: { older: {} } }])).toBeUndefined()
  })
})

describe("TUI compaction request", () => {
  test("shows an immediate error when summarize rejects", async () => {
    const toasts: Array<{ message: string; variant?: string }> = []
    let command: { run: () => Promise<void> } | undefined
    await tui({
      ui: { toast: (toast) => toasts.push(toast) },
      keymap: { registerLayer: (layer) => (command = layer.commands?.[0] as typeof command) },
      route: { current: { name: "session", params: { sessionID: "session" } } },
      state: {
        session: { messages: () => [{ role: "user", model: { providerID: "openai", modelID: "gpt" } }] },
        provider: [{ id: "openai", models: { gpt: {} } }],
      },
      client: { session: { summarize: async () => Promise.reject(new Error("request rejected")) } },
      event: { on: () => () => {} },
      lifecycle: { onDispose: () => () => {} },
    } as never, undefined, undefined as never)

    await command?.run()
    expect(toasts.at(-1)).toEqual({ message: "Compaction failed: request rejected", variant: "error" })
  })
})
