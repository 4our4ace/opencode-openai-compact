import { describe, expect, test } from "vitest"
import { compactBody, compactUrl, createCompactHooks, createCompactV2Runtime, fetchMiddlewareSymbol } from "../src/compact.js"
import { defaultConfig, OpenAICompactConfigSchema } from "../src/schema.js"
import { CheckpointStore } from "../src/state.js"

function jsonBody(init: RequestInit | undefined) {
  return JSON.parse(typeof init?.body === "string" ? init.body : "{}")
}

const defaultCompactModel = defaultConfig.providers.openai.compactModel

describe("OpenAI compact hooks", () => {
  test("adapts V2 HTTP hooks to native compaction and checkpoint injection", async () => {
    const store = CheckpointStore.openMemory()
    const runtime = createCompactV2Runtime(defaultConfig, store)
    try {
      let compactMiddleware: any
      runtime.register({
        sessionID: "ses_v2",
        agent: "compaction",
        model: { providerID: "openai" },
        use: (middleware) => (compactMiddleware = middleware),
      })
      const compactResponse = await compactMiddleware(
        new Request("https://api.openai.com/v1/responses", {
          method: "POST",
          body: JSON.stringify({ model: "gpt", input: [{ role: "user", content: "history" }] }),
        }),
        async (request: Request) => {
          expect(request.url).toBe("https://api.openai.com/v1/responses/compact")
          return new Response(
            JSON.stringify({
              id: "resp_v2",
              model: "gpt",
              output: [{ type: "compaction_summary", encrypted_content: "encrypted" }],
            }),
            { headers: { "content-type": "application/json" } },
          )
        },
      )
      expect(compactResponse.headers.get("content-type")).toContain("text/event-stream")

      let normalMiddleware: any
      runtime.register({
        sessionID: "ses_v2",
        agent: "build",
        model: { providerID: "openai" },
        use: (middleware) => (normalMiddleware = middleware),
      })
      await normalMiddleware(
        new Request("https://api.openai.com/v1/responses", {
          method: "POST",
          body: JSON.stringify({
            model: "gpt",
            input: [
              { role: "assistant", content: [{ type: "output_text", text: defaultConfig.summary }] },
              { role: "user", content: "continue" },
            ],
          }),
        }),
        async (request: Request) => {
          const body = await request.json() as any
          expect(body.input).toEqual([
            { type: "compaction", encrypted_content: "encrypted" },
            { role: "user", content: "continue" },
          ])
          return new Response("ok")
        },
      )
    } finally {
      await runtime.dispose()
    }
  })

  test("wraps the configured provider fetch", async () => {
    const store = CheckpointStore.openMemory()
    try {
      const hooks = createCompactHooks(defaultConfig, store)
      const cfg: any = {}

      await hooks.config?.(cfg)

      const wrappedFetch = cfg.provider.openai.options.fetch as typeof fetch
      expect(typeof wrappedFetch).toBe("function")
      expect((wrappedFetch as any)[fetchMiddlewareSymbol].version).toBe(1)
    } finally {
      store.close()
    }
  })

  test("attaches through a compatible final fetch consumer", async () => {
    const store = CheckpointStore.openMemory()
    const calls: string[] = []
    const baseFetch = (async (input: RequestInfo | URL) => {
      calls.push(String(input))
      return new Response("ok")
    }) as typeof fetch
    let finalFetch = baseFetch
    const consumerFetch = ((input: RequestInfo | URL, init?: RequestInit) => finalFetch(input, init)) as typeof fetch
    Object.defineProperty(consumerFetch, fetchMiddlewareSymbol, {
      value: {
        version: 1,
        attach(middleware: (next: typeof fetch) => typeof fetch) {
          finalFetch = middleware(finalFetch)
        },
      },
    })

    try {
      const hooks = createCompactHooks(defaultConfig, store)
      const cfg: any = { provider: { openai: { options: { fetch: consumerFetch } } } }
      await hooks.config?.(cfg)

      await finalFetch("https://api.openai.com/v1/responses", {
        method: "POST",
        headers: {
          [defaultConfig.headers.compact]: "1",
          [defaultConfig.headers.session]: "ses_consumer",
        },
        body: JSON.stringify({ model: "gpt", input: [{ role: "user", content: "hello" }] }),
      })
      expect(calls[0]).toBe("https://api.openai.com/v1/responses/compact")
      expect(cfg.provider.openai.options.fetch).toBe(consumerFetch)
    } finally {
      store.close()
    }
  })

  test("leaves auth and transport to multi-auth while retaining compaction", async () => {
    const marker = Symbol.for("@4our4ace/opencode-openai-multi-auth/active")
    const previous = (globalThis as any)[marker]
    ;(globalThis as any)[marker] = true
    const store = CheckpointStore.openMemory()
    const calls: string[] = []
    const fakeFetch = (async (input: RequestInfo | URL) => {
      calls.push(String(input))
      return new Response(JSON.stringify({ id: "resp", output: [{ type: "compaction_summary", encrypted_content: "x" }] }), {
        headers: { "content-type": "application/json" },
      })
    }) as typeof fetch
    let finalFetch = fakeFetch
    const consumerFetch = ((input: RequestInfo | URL, init?: RequestInit) => finalFetch(input, init)) as typeof fetch
    Object.defineProperty(consumerFetch, fetchMiddlewareSymbol, {
      value: {
        version: 1,
        attach(middleware: (next: typeof fetch) => typeof fetch) {
          finalFetch = middleware(finalFetch)
        },
      },
    })

    try {
      const hooks = createCompactHooks(defaultConfig, store, fakeFetch)
      expect(hooks.auth).toBeUndefined()
      const cfg: any = { provider: { openai: { options: { fetch: consumerFetch } } } }
      await hooks.config?.(cfg)
      await finalFetch("https://api.openai.com/v1/responses", {
        method: "POST",
        headers: {
          authorization: "Bearer chatgpt-oauth",
          [defaultConfig.headers.compact]: "1",
          [defaultConfig.headers.session]: "ses_multi",
        },
        body: JSON.stringify({ model: "gpt-5.6", input: [] }),
      })
      expect(calls[0]).toBe("https://api.openai.com/v1/responses/compact")
    } finally {
      store.close()
      if (previous === undefined) delete (globalThis as any)[marker]
      else (globalThis as any)[marker] = previous
    }
  })

  test("builds compact URL and compact request body", () => {
    expect(compactUrl(new URL("https://api.openai.com/v1/responses?x=1"))).toBe(
      "https://api.openai.com/v1/responses/compact?x=1",
    )
    expect(compactUrl(new URL("https://proxy.test/openai/v1/responses"))).toBe(
      "https://proxy.test/openai/v1/responses/compact",
    )

    const body = compactBody({ model: "ignored", input: [], stream: true, tools: [] })
    expect(body).toEqual({ model: defaultCompactModel, input: [] })
  })

  test("builds standard compact input without OpenCode summarizer prompts", () => {
    const body = compactBody({
      model: "ignored",
      instructions: "You are an anchored context summarization assistant for coding sessions.\n\nSummarize only...",
      previous_response_id: "resp_previous",
      input: [
        { role: "developer", content: "Keep the user's coding preferences." },
        {
          role: "developer",
          content: "You are an anchored context summarization assistant for coding sessions.\n\nSummarize only...",
        },
        { role: "user", content: "Create a new anchored summary from the conversation history. This is quoted." },
        { role: "assistant", content: [{ type: "output_text", text: "quoted response" }] },
        { role: "user", content: "real request" },
        {
          role: "user",
          content: [
            { type: "input_text", text: "Create a new anchored summary from the conversation history.\n\nOutput exactly..." },
          ],
        },
      ],
    })

    expect(body).toEqual({
      model: defaultCompactModel,
      previous_response_id: "resp_previous",
      input: [
        { role: "developer", content: "Keep the user's coding preferences." },
        { role: "user", content: "Create a new anchored summary from the conversation history. This is quoted." },
        { role: "assistant", content: [{ type: "output_text", text: "quoted response" }] },
        { role: "user", content: "real request" },
      ],
    })
  })

  test("keeps session instructions when routing compaction", async () => {
    const store = CheckpointStore.openMemory()
    const calls: Array<{ url: string; init?: RequestInit }> = []
    const fakeFetch = (async (requestInput: RequestInfo | URL, init?: RequestInit) => {
      calls.push({ url: String(requestInput), init })
      return new Response(
        JSON.stringify({
          id: "resp_compacted",
          created_at: 1,
          output: [{ type: "compaction_summary", encrypted_content: "compacted" }],
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      )
    }) as typeof fetch

    try {
      const hooks = createCompactHooks(defaultConfig, store, fakeFetch)
      const cfg: any = {}
      await hooks.config?.(cfg)
      const wrappedFetch = cfg.provider.openai.options.fetch as typeof fetch

      await wrappedFetch("https://proxy.test/openai/v1/responses", {
        method: "POST",
        headers: { [defaultConfig.headers.session]: "ses_instructions" },
        body: JSON.stringify({
          model: "gpt",
          instructions: "You are OpenCode.",
          input: [{ role: "developer", content: "stable instructions" }, { role: "user", content: "hello" }],
        }),
      })

      await wrappedFetch("https://proxy.test/openai/v1/responses", {
        method: "POST",
        headers: { [defaultConfig.headers.session]: "ses_instructions" },
        body: JSON.stringify({
          model: "gpt",
          input: [{ role: "developer", content: "stable instructions" }, { role: "user", content: "next" }],
        }),
      })

      calls.length = 0
      await wrappedFetch("https://proxy.test/openai/v1/responses", {
        method: "POST",
        headers: {
          [defaultConfig.headers.compact]: "1",
          [defaultConfig.headers.session]: "ses_instructions",
        },
        body: JSON.stringify({
          model: "ignored",
          instructions: "You are an anchored context summarization assistant for coding sessions.\n\nSummarize only...",
          input: [
            {
              role: "developer",
              content: "You are an anchored context summarization assistant for coding sessions.\n\nSummarize only...",
            },
            { role: "user", content: "hello" },
            { role: "assistant", content: [{ type: "output_text", text: "done" }] },
            { role: "user", content: "Create a new anchored summary from the conversation history.\n\nOutput exactly..." },
          ],
        }),
      })

      expect(calls[0]?.url).toBe("https://proxy.test/openai/v1/responses/compact")
      expect(jsonBody(calls[0]?.init)).toEqual({
        model: defaultCompactModel,
        instructions: "You are OpenCode.",
        input: [
          { role: "developer", content: "stable instructions" },
          { role: "user", content: "hello" },
          { role: "assistant", content: [{ type: "output_text", text: "done" }] },
        ],
      })
    } finally {
      store.close()
    }
  })

  test("keeps rendered system instructions when routing compaction", async () => {
    const store = CheckpointStore.openMemory()
    const calls: Array<{ url: string; init?: RequestInit }> = []
    const fakeFetch = (async (requestInput: RequestInfo | URL, init?: RequestInit) => {
      calls.push({ url: String(requestInput), init })
      return new Response(
        JSON.stringify({
          id: "resp_compacted",
          created_at: 1,
          output: [{ type: "compaction_summary", encrypted_content: "compacted" }],
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      )
    }) as typeof fetch

    try {
      const hooks = createCompactHooks(defaultConfig, store, fakeFetch)
      const cfg: any = {}
      await hooks.config?.(cfg)
      const wrappedFetch = cfg.provider.openai.options.fetch as typeof fetch

      await hooks["experimental.chat.system.transform"]?.(
        { sessionID: "ses_rendered", model: { providerID: "openai" } } as any,
        { system: ["You are OpenCode.", " ", "AGENTS instructions"] },
      )
      await hooks["chat.headers"]?.(
        { sessionID: "ses_rendered", agent: "build", model: { providerID: "openai" } } as any,
        { headers: {} },
      )

      for (const agent of ["title", "summary"]) {
        const utilityHeaders = { headers: {} as Record<string, string> }
        await hooks["experimental.chat.system.transform"]?.(
          { sessionID: "ses_rendered", model: { providerID: "openai" } } as any,
          { system: [`${agent} prompt`] },
        )
        await hooks["chat.headers"]?.(
          { sessionID: "ses_rendered", agent, model: { providerID: "openai" } } as any,
          utilityHeaders,
        )
        expect(utilityHeaders.headers).toEqual({})
        await wrappedFetch("https://proxy.test/openai/v1/responses", {
          method: "POST",
          headers: utilityHeaders.headers,
          body: JSON.stringify({
            model: "gpt",
            instructions: `${agent} instructions`,
            input: [
              { role: "developer", content: `${agent} developer prompt` },
              { role: "user", content: `${agent} request` },
            ],
          }),
        })
      }
      calls.length = 0

      await hooks["experimental.chat.system.transform"]?.(
        { sessionID: "ses_rendered", model: { providerID: "openai" } } as any,
        { system: ["You are an anchored context summarization assistant for coding sessions.\n\nSummarize only..."] },
      )
      const compactHeaders = { headers: {} as Record<string, string> }
      await hooks["chat.headers"]?.(
        { sessionID: "ses_rendered", agent: "compaction", model: { providerID: "openai" } } as any,
        compactHeaders,
      )

      await wrappedFetch("https://proxy.test/openai/v1/responses", {
        method: "POST",
        headers: compactHeaders.headers,
        body: JSON.stringify({
          model: "ignored",
          instructions: "You are an anchored context summarization assistant for coding sessions.\n\nSummarize only...",
          input: [
            {
              role: "developer",
              content: "You are an anchored context summarization assistant for coding sessions.\n\nSummarize only...",
            },
            { role: "user", content: "hello" },
            { role: "assistant", content: [{ type: "output_text", text: "done" }] },
            { role: "user", content: "Create a new anchored summary from the conversation history.\n\nOutput exactly..." },
          ],
        }),
      })

      expect(calls[0]?.url).toBe("https://proxy.test/openai/v1/responses/compact")
      expect(jsonBody(calls[0]?.init)).toEqual({
        model: defaultCompactModel,
        instructions: "You are OpenCode.\n \nAGENTS instructions",
        input: [
          { role: "user", content: "hello" },
          { role: "assistant", content: [{ type: "output_text", text: "done" }] },
        ],
      })
    } finally {
      store.close()
    }
  })

  test("does not restore stable instructions when config omits instructions", async () => {
    const config = OpenAICompactConfigSchema.parse({ compactBodyKeys: ["input"] })
    const store = CheckpointStore.openMemory()
    const calls: Array<{ url: string; init?: RequestInit }> = []
    const fakeFetch = (async (requestInput: RequestInfo | URL, init?: RequestInit) => {
      calls.push({ url: String(requestInput), init })
      return new Response(
        JSON.stringify({
          id: "resp_compacted",
          created_at: 1,
          output: [{ type: "compaction_summary", encrypted_content: "compacted" }],
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      )
    }) as typeof fetch

    try {
      const hooks = createCompactHooks(config, store, fakeFetch)
      const cfg: any = {}
      await hooks.config?.(cfg)
      const wrappedFetch = cfg.provider.openai.options.fetch as typeof fetch

      await wrappedFetch("https://proxy.test/openai/v1/responses", {
        method: "POST",
        headers: { [config.headers.session]: "ses_no_instructions" },
        body: JSON.stringify({
          model: "gpt",
          instructions: "You are OpenCode.",
          input: [{ role: "developer", content: "stable instructions" }, { role: "user", content: "hello" }],
        }),
      })

      calls.length = 0
      await wrappedFetch("https://proxy.test/openai/v1/responses", {
        method: "POST",
        headers: {
          [config.headers.compact]: "1",
          [config.headers.session]: "ses_no_instructions",
        },
        body: JSON.stringify({
          model: "ignored",
          instructions: "You are an anchored context summarization assistant for coding sessions.",
          input: [
            { role: "developer", content: "You are an anchored context summarization assistant for coding sessions." },
            { role: "user", content: "hello" },
            { role: "user", content: "Create a new anchored summary from the conversation history.\n\nOutput exactly..." },
          ],
        }),
      })

      expect(jsonBody(calls[0]?.init)).toEqual({
        model: defaultCompactModel,
        input: [{ role: "developer", content: "stable instructions" }, { role: "user", content: "hello" }],
      })
    } finally {
      store.close()
    }
  })

  test("wraps multiple providers with their own compact models", async () => {
    const config = OpenAICompactConfigSchema.parse({
      providers: {
        openai: { compactModel: "openai-compact" },
        "custom-openai": { compactModel: "custom-compact" },
      },
    })
    const store = CheckpointStore.openMemory()
    const calls: Array<{ url: string; init?: RequestInit }> = []
    const fakeFetch = (async (requestInput: RequestInfo | URL, init?: RequestInit) => {
      calls.push({ url: String(requestInput), init })
      return new Response(
        JSON.stringify({
          id: "resp_compacted",
          created_at: 1,
          output: [{ type: "compaction_summary", encrypted_content: "compacted" }],
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      )
    }) as typeof fetch

    try {
      const hooks = createCompactHooks(config, store, fakeFetch)
      const cfg: any = {}
      await hooks.config?.(cfg)

      await cfg.provider["custom-openai"].options.fetch("https://proxy.test/openai/v1/responses", {
        method: "POST",
        headers: {
          [config.headers.compact]: "1",
          [config.headers.session]: "ses_custom",
        },
        body: JSON.stringify({ model: "ignored", input: [] }),
      })

      expect(typeof cfg.provider.openai.options.fetch).toBe("function")
      expect(typeof cfg.provider["custom-openai"].options.fetch).toBe("function")
      expect(jsonBody(calls[0]?.init).model).toBe("custom-compact")
    } finally {
      store.close()
    }
  })

  test("routes compaction fetch and prepends stored checkpoint on the next request", async () => {
    const store = CheckpointStore.openMemory()
    const calls: Array<{ url: string; init?: RequestInit }> = []
    const fakeFetch = (async (requestInput: RequestInfo | URL, init?: RequestInit) => {
      calls.push({ url: String(requestInput), init })
      return new Response(
        JSON.stringify({
          id: "resp_compacted",
          model: defaultCompactModel,
          created_at: 1,
          output: [{ type: "compaction_summary", encrypted_content: "compacted" }],
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      )
    }) as typeof fetch

    try {
      const hooks = createCompactHooks(defaultConfig, store, fakeFetch)
      const cfg: any = {}
      await hooks.config?.(cfg)
      const wrappedFetch = cfg.provider.openai.options.fetch as typeof fetch

      await wrappedFetch("https://proxy.test/openai/v1/responses", {
        method: "POST",
        headers: {
          [defaultConfig.headers.compact]: "1",
          [defaultConfig.headers.session]: "ses_request",
        },
        body: JSON.stringify({ model: "ignored", input: [{ role: "user", content: "hello" }], stream: true }),
      })

      expect(calls[0]?.url).toBe("https://proxy.test/openai/v1/responses/compact")
      expect(jsonBody(calls[0]?.init)).toEqual({
        model: defaultCompactModel,
        input: [{ role: "user", content: "hello" }],
      })
      expect(new Headers(calls[0]?.init?.headers).has(defaultConfig.headers.compact)).toBe(false)
      expect(new Headers(calls[0]?.init?.headers).has(defaultConfig.headers.session)).toBe(false)

      await hooks.event?.({
        event: {
          type: "message.part.updated",
          properties: {
            sessionID: "ses_request",
            part: { messageID: "msg_checkpoint", type: "text", text: defaultConfig.summary },
            time: 2,
          },
        } as any,
      })

      calls.length = 0
      await wrappedFetch("https://proxy.test/openai/v1/responses", {
        method: "POST",
        headers: { [defaultConfig.headers.session]: "ses_request" },
        body: JSON.stringify({
          model: "gpt",
          input: [
            { role: "developer", content: "stable instructions" },
            { role: "system", content: "more stable instructions" },
            { role: "user", content: "after compact" },
          ],
        }),
      })

      const followupBody = jsonBody(calls[0]?.init)
      expect(calls[0]?.url).toBe("https://proxy.test/openai/v1/responses")
      expect(followupBody.input).toEqual([
        { role: "developer", content: "stable instructions" },
        { role: "system", content: "more stable instructions" },
        { type: "compaction", encrypted_content: "compacted" },
        { role: "user", content: "after compact" },
      ])

      const unknownProviderMessages = [
        { info: { id: "msg_checkpoint", sessionID: "ses_request" } },
        { info: { id: "msg_after", sessionID: "ses_request" } },
      ]
      await hooks["experimental.chat.messages.transform"]?.({}, { messages: unknownProviderMessages } as any)
      expect(unknownProviderMessages.map((message) => message.info.id)).toEqual(["msg_checkpoint", "msg_after"])

      await hooks["chat.message"]?.(
        { model: { providerID: "openai" }, sessionID: "ses_request", messageID: "msg_after" } as any,
        { message: { id: "msg_after" }, parts: [] } as any,
      )
      const inferredProviderMessages = [
        { info: { id: "msg_checkpoint", sessionID: "ses_request" } },
        { info: { id: "msg_after", sessionID: "ses_request" } },
      ]
      await hooks["experimental.chat.messages.transform"]?.({}, { messages: inferredProviderMessages } as any)
      expect(inferredProviderMessages.map((message) => message.info.id)).toEqual(["msg_after"])
    } finally {
      store.close()
    }
  })

  test("adds compaction headers only for OpenAI compaction agent", async () => {
    const store = CheckpointStore.openMemory()
    try {
      const hooks = createCompactHooks(defaultConfig, store)
      const output = { headers: {} as Record<string, string> }

      await hooks["chat.headers"]?.(
        { model: { providerID: "openai" }, sessionID: "ses", agent: "compaction" } as any,
        output,
      )

      expect(output.headers[defaultConfig.headers.session]).toBe("ses")
      expect(output.headers[defaultConfig.headers.compact]).toBe("1")

      const unsupported = { headers: {} as Record<string, string> }
      await hooks["chat.headers"]?.(
        { model: { providerID: "anthropic" }, sessionID: "ses", agent: "compaction" } as any,
        unsupported,
      )
      expect(unsupported.headers).toEqual({})
    } finally {
      store.close()
    }
  })
})
