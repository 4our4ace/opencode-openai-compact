import type { Plugin } from "@opencode-ai/plugin/v1";
import { setup } from "./v2.js";
export declare const server: Plugin;
declare const _default: {
    id: string;
    server: Plugin;
    setup: typeof setup;
};
export default _default;
export { createCompactHooks, fetchMiddlewareSymbol } from "./compact.js";
export { loadConfig } from "./config.js";
export { CheckpointStore, currentSchemaVersion, type Checkpoint } from "./state.js";
export type { OpenAICompactConfig } from "./schema.js";
