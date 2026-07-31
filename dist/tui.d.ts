import type { TuiPlugin } from "@opencode-ai/plugin/tui";
export type OpenAIProvider = {
    id: string;
    models: Record<string, unknown>;
};
export type OpenAIModel = {
    providerID: string;
    modelID: string;
};
export declare function resolveOpenAIModel(providers: readonly OpenAIProvider[]): OpenAIModel | undefined;
declare const tui: TuiPlugin;
export { tui };
declare const _default: {
    id: string;
    tui: TuiPlugin;
};
export default _default;
