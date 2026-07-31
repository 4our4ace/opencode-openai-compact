import type { TuiPlugin } from "@opencode-ai/plugin/tui";
export type SelectedModel = {
    providerID?: string;
    id?: string;
};
export type OpenAIProvider = {
    id: string;
    models: Record<string, unknown>;
};
export type OpenAIModel = {
    providerID: string;
    modelID: string;
};
export declare function resolveOpenAIModel(selected: SelectedModel | undefined, providers: readonly OpenAIProvider[]): OpenAIModel | undefined;
declare const tui: TuiPlugin;
export { tui };
declare const _default: {
    id: string;
    tui: TuiPlugin;
};
export default _default;
