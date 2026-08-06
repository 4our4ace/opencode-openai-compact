import { loadConfig } from "./config.js";
import { createCompactHooks } from "./compact.js";
import { getDatabasePath } from "./paths.js";
import { CheckpointStore } from "./state.js";
import { setup } from "./v2.js";
export const server = async ({ client, directory, worktree }) => {
    const config = await loadConfig({ directory, worktree });
    if (!config.enabled)
        return {};
    const store = await CheckpointStore.open(getDatabasePath());
    store.prune(config.state.retentionDays);
    return createCompactHooks(config, store, fetch, {
        async setOpenAIAuth(auth) {
            await client.auth.set({ path: { id: "openai" }, body: auth });
        },
    });
};
export default {
    id: "4our4ace-opencode-openai-compact",
    server,
    setup,
};
export { createCompactHooks, fetchMiddlewareSymbol } from "./compact.js";
export { loadConfig } from "./config.js";
export { CheckpointStore, currentSchemaVersion } from "./state.js";
