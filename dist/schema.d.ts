import { z } from "zod";
export declare const defaultCompactBodyKeys: readonly ["input", "instructions", "previous_response_id", "prompt_cache_key", "prompt_cache_retention", "service_tier"];
export declare const defaultCompactSummary: string;
export declare const OpenAICompactConfigSchema: z.ZodDefault<z.ZodObject<{
    $schema: z.ZodOptional<z.ZodString>;
    enabled: z.ZodDefault<z.ZodBoolean>;
    providers: z.ZodDefault<z.ZodRecord<z.ZodString, z.ZodObject<{
        compactModel: z.ZodString;
    }, z.core.$strict>>>;
    headers: z.ZodDefault<z.ZodObject<{
        compact: z.ZodDefault<z.ZodString>;
        session: z.ZodDefault<z.ZodString>;
    }, z.core.$strip>>;
    responses: z.ZodDefault<z.ZodObject<{
        endpointPath: z.ZodDefault<z.ZodPipe<z.ZodString, z.ZodTransform<string, string>>>;
        compactEndpointPath: z.ZodDefault<z.ZodPipe<z.ZodString, z.ZodTransform<string, string>>>;
    }, z.core.$strip>>;
    compactBodyKeys: z.ZodDefault<z.ZodArray<z.ZodString>>;
    summary: z.ZodDefault<z.ZodString>;
    state: z.ZodDefault<z.ZodObject<{
        retentionDays: z.ZodDefault<z.ZodNumber>;
        deleteOnSessionDeleted: z.ZodDefault<z.ZodBoolean>;
    }, z.core.$strip>>;
}, z.core.$strict>>;
export type OpenAICompactConfig = z.infer<typeof OpenAICompactConfigSchema>;
export type OpenAICompactConfigInput = z.input<typeof OpenAICompactConfigSchema>;
export declare const defaultConfig: {
    enabled: boolean;
    providers: Record<string, {
        compactModel: string;
    }>;
    headers: {
        compact: string;
        session: string;
    };
    responses: {
        endpointPath: string;
        compactEndpointPath: string;
    };
    compactBodyKeys: string[];
    summary: string;
    state: {
        retentionDays: number;
        deleteOnSessionDeleted: boolean;
    };
    $schema?: string | undefined;
};
