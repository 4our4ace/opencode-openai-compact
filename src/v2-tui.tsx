/** @jsxImportSource @opentui/solid */

import { Plugin } from "@opencode-ai/plugin/tui"
import type { Context } from "@opencode-ai/plugin/tui/context"

function CompactCommand(props: { ctx: Context }) {
  const { ctx } = props
  ctx.keymap.layer(() => ({
    priority: 1,
    commands: [
      {
        id: "session.compact",
        title: "Compact session",
        description: "Compact the active session",
        group: "Session",
        palette: true,
        slash: { name: "compact", aliases: ["summarize"] },
        async run() {
          const route = ctx.ui.router.current()
          if (route.type !== "session") {
            ctx.ui.toast.show({ message: "No active session to compact", variant: "warning" })
            return
          }

          try {
            ctx.ui.toast.show({ message: "Compaction started", variant: "info" })
            await ctx.client.session.compact({ sessionID: route.sessionID })
            await ctx.client.session.wait({ sessionID: route.sessionID })
            ctx.ui.toast.show({ message: "Compaction successful", variant: "success" })
          } catch (error) {
            ctx.ui.toast.show({
              message: error instanceof Error ? `Compaction failed: ${error.message}` : "Compaction failed",
              variant: "error",
            })
          }
        },
      },
    ],
  }))
  return null
}

export default Plugin.define({
  id: "4our4ace-opencode-openai-compact",
  setup: (ctx) => ctx.ui.slot("app", () => <CompactCommand ctx={ctx} />),
})
