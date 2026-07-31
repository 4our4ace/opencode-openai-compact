import { describe, expect, test } from "vitest"
import { tui } from "../src/tui.js"

describe("TUI compaction request", () => {
  const createHarness = (
    summarize: (input: { sessionID: string; providerID: string; modelID: string; auto: boolean }) => Promise<{ data: boolean }>,
    model: { providerID: string; id: string } | null = { providerID: "openai", id: "gpt" },
  ) => {
    const toasts: Array<{ message: string; variant?: string }> = []
    const requestedSessionIDs: string[] = []
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
        session: {
          get: (sessionID) => {
            requestedSessionIDs.push(sessionID)
            return { model }
          },
        },
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
      requestedSessionIDs,
      dispose,
      wasDisposed: () => disposed,
    }
  }

  test("treats a resolved true result as success without events", async () => {
    const requests: Array<{ sessionID: string; providerID: string; modelID: string; auto: boolean }> = []
    const harness = createHarness(async (input) => {
      requests.push(input)
      return { data: true }
    })

    await harness.command.run()

    expect(harness.requestedSessionIDs).toEqual(["session"])
    expect(requests).toEqual([{ sessionID: "session", providerID: "openai", modelID: "gpt", auto: false }])
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

  test("uses the session's last requested non-OpenAI model for default compaction", async () => {
    const requests: Array<{ sessionID: string; providerID: string; modelID: string; auto: boolean }> = []
    const harness = createHarness(async (input) => {
      requests.push(input)
      return { data: true }
    }, { providerID: "xai", id: "grok" })

    await harness.command.run()

    expect(requests).toEqual([{ sessionID: "session", providerID: "xai", modelID: "grok", auto: false }])
  })

  test("does not compact when the session has no submitted model", async () => {
    const harness = createHarness(async () => ({ data: true }), null)

    await harness.command.run()

    expect(harness.toasts.at(-1)).toEqual({ message: "No model found for this session", variant: "warning" })
  })
})
