export interface GcsStorageConfig {
    inputUri: string;
    outputUri: string;
    contextUri: string;
    credentialsFile?: string;
}

export interface StorageConfig {
    backend: 'filesystem' | 'gcs';
    gcs?: GcsStorageConfig;
}

export const DEFAULT_STORAGE_CONFIG: StorageConfig = {
    backend: 'filesystem',
};
