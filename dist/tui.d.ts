import type { TuiPlugin } from "@opencode-ai/plugin/tui";
export type SessionModelMessage = {
    role: "user" | "assistant";
    model?: {
        providerID?: string;
        modelID?: string;
    };
};
export type OpenAIProvider = {
    id: string;
    models: Record<string, unknown>;
};
export type OpenAIModel = {
    providerID: string;
    modelID: string;
};
export declare function resolveOpenAIModel(messages: readonly SessionModelMessage[], providers: readonly OpenAIProvider[]): OpenAIModel | undefined;
declare const tui: TuiPlugin;
export { tui };
declare const _default: {
    id: string;
    tui: TuiPlugin;
};
export default _default;
