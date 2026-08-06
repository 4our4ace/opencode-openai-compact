import type { Plugin } from "@opencode-ai/plugin";
export declare const server: Plugin;
declare const _default: {
    id: string;
    server: Plugin;
};
export default _default;
export { createCompactHooks, fetchMiddlewareSymbol } from "./compact.js";
export { loadConfig } from "./config.js";
export { CheckpointStore, currentSchemaVersion, type Checkpoint } from "./state.js";
export type { OpenAICompactConfig } from "./schema.js";
