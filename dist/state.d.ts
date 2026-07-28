export type AnyRecord = Record<string, unknown>;
export type Checkpoint = {
    providerID: string;
    responseID: string;
    afterMessageID: string;
    afterCreatedAt: number;
    createdAt: number;
    items: AnyRecord[];
};
export declare class CheckpointStore {
    private readonly db;
    private constructor();
    static open(file: string): Promise<CheckpointStore>;
    static openMemory(): CheckpointStore;
    close(): void;
    loadAll(): {
        sessionID: string;
        checkpoint: Checkpoint;
    }[];
    upsert(sessionID: string, checkpoint: Checkpoint): void;
    deleteSession(sessionID: string): void;
    prune(retentionDays: number): void;
    count(): number;
    version(): number;
    private migrate;
    private schemaVersion;
}
export declare const currentSchemaVersion = 1;
