import type { Context } from "@opencode-ai/plugin/promise/plugin"
import { createCompactV2Runtime } from "./compact.js"
import { loadConfig } from "./config.js"
import { getDatabasePath } from "./paths.js"
import { CheckpointStore } from "./state.js"

export async function setup(ctx: Context) {
  const directory = process.cwd()
  const config = await loadConfig({ directory, worktree: directory })
  if (!config.enabled) return

  const store = await CheckpointStore.open(getDatabasePath())
  const runtime = createCompactV2Runtime(config, store)
  await ctx.session.hook("http", (input) => runtime.register(input))
  return () => runtime.dispose()
}
