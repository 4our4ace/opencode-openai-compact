import type { Hooks } from "@opencode-ai/plugin/v1";
import { type OpenAICompactConfig } from "./schema.js";
import { CheckpointStore, type AnyRecord } from "./state.js";
import { type OpenAIOAuthAuth, type OAuthFetchLike } from "./oauth.js";
type FetchLike = typeof fetch;
export type FetchMiddleware = (next: FetchLike) => FetchLike;
export type FetchMiddlewareProtocol = {
    version: 1;
    attach?: (middleware: FetchMiddleware) => void;
    middleware?: FetchMiddleware;
    base?: FetchLike;
};
type CompactHookOptions = {
    setOpenAIAuth?: (auth: OpenAIOAuthAuth) => Promise<void>;
    tokenFetch?: OAuthFetchLike;
    authenticatedRequests?: boolean;
    forceFetchWrap?: boolean;
    stripSyntheticSummary?: boolean;
};
type V2HttpHook = {
    sessionID: string;
    agent: string;
    model: {
        providerID: string;
    };
    use: (middleware: (request: Request, next: (request: Request) => Promise<Response>) => Promise<Response>) => void;
};
export declare const fetchMiddlewareSymbol: unique symbol;
export declare function isResponsesUrl(url: URL, config: OpenAICompactConfig): boolean;
export declare function compactUrl(url: URL, config?: OpenAICompactConfig): string;
export declare function compactBody(body: AnyRecord, compactModel?: string, config?: OpenAICompactConfig): AnyRecord;
export declare function compactedItemsFrom(value: unknown): AnyRecord[] | undefined;
export declare function createCompactHooks(config: OpenAICompactConfig, store: CheckpointStore, baseFetch?: FetchLike, options?: CompactHookOptions): Hooks;
export declare function createCompactV2Runtime(config: OpenAICompactConfig, store: CheckpointStore): {
    register(input: V2HttpHook): void;
    dispose: () => Promise<void> | undefined;
};
export {};
