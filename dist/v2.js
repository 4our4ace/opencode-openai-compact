import { createCompactV2Runtime } from "./compact.js";
import { loadConfig } from "./config.js";
import { getDatabasePath } from "./paths.js";
import { CheckpointStore } from "./state.js";
export async function setup(ctx) {
    const directory = process.cwd();
    const config = await loadConfig({ directory, worktree: directory });
    if (!config.enabled)
        return;
    const store = await CheckpointStore.open(getDatabasePath());
    const runtime = createCompactV2Runtime(config, store);
    await ctx.catalog.transform((catalog) => {
        for (const providerID of Object.keys(config.providers)) {
            if (!catalog.provider.get(providerID))
                continue;
            catalog.provider.update(providerID, (provider) => {
                const record = provider;
                const request = (record.request ??= {});
                const body = (request.body ??= {});
                const previous = typeof body.fetch === "function" ? body.fetch : fetch;
                body.fetch = runtime.wrap(providerID, previous);
            });
        }
    });
    await ctx.session.hook("http", (input) => runtime.register(input));
    return () => runtime.dispose();
}
