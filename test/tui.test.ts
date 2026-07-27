import { describe, expect, test } from "vitest"
import { resolveOpenAIModel, tui } from "../src/tui.js"

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
  const createHarness = (summarize: () => Promise<{ data: boolean }>) => {
    const toasts: Array<{ message: string; variant?: string }> = []
    let command: { run: () => Promise<void> } | undefined
    let disposed = false
    let dispose!: () => void

    void tui({
      ui: { toast: (toast) => toasts.push(toast) },
      keymap: {
        registerLayer: (layer) => {
          command = layer.commands?.[0] as typeof command
          return () => {
            disposed = true
          }
        },
      },
      route: { current: { name: "session", params: { sessionID: "session" } } },
      state: {
        session: { messages: () => [{ role: "user", model: { providerID: "openai", modelID: "gpt" } }] },
        provider: [{ id: "openai", models: { gpt: {} } }],
      },
      client: { session: { summarize } },
      lifecycle: {
        onDispose: (handler) => {
          dispose = handler
          return () => {}
        },
      },
    } as never, undefined, undefined as never)

    return {
      command: command!,
      toasts,
      dispose,
      wasDisposed: () => disposed,
    }
  }

  test("treats a resolved true result as success without events", async () => {
    const harness = createHarness(async () => ({ data: true }))

    await harness.command.run()

    expect(harness.toasts.at(-1)).toEqual({ message: "Compaction successful", variant: "success" })
  })

  test("allows only one in-flight request and permits a later retry", async () => {
    let calls = 0
    let resolve!: (value: { data: boolean }) => void
    const pending = new Promise<{ data: boolean }>((res) => {
      resolve = res
    })
    const harness = createHarness(() => {
      calls += 1
      return calls === 1 ? pending : Promise.resolve({ data: true })
    })

    const first = harness.command.run()
    await Promise.resolve()
    await harness.command.run()
    expect(calls).toBe(1)
    expect(harness.toasts.at(-1)).toEqual({
      message: "Compaction already in progress for this session",
      variant: "warning",
    })

    resolve({ data: true })
    await first
    await harness.command.run()
    expect(calls).toBe(2)
  })

  test.each([
    ["false result", async () => ({ data: false }), "Compaction failed"],
    ["rejection", async () => Promise.reject(new Error("request rejected")), "Compaction failed: request rejected"],
  ])("reports %s as failure", async (_name, summarize, message) => {
    const harness = createHarness(summarize)

    await harness.command.run()

    expect(harness.toasts.at(-1)).toEqual({ message, variant: "error" })
  })

  test("cleans up the registered keymap on dispose", () => {
    const harness = createHarness(async () => ({ data: true }))

    harness.dispose()
    expect(harness.wasDisposed()).toBe(true)
  })
})
