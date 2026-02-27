export interface GcsStorageConfig {
    /**
     * Optional explicit GCP project id.
     * When set, this should take precedence over ambient environment values.
     */
    projectId?: string;

    /**
     * Legacy URI-based config (still supported for backwards compatibility).
     */
    inputUri?: string;
    outputUri?: string;
    contextUri?: string;

    /**
     * RiotPlan-style split config.
     */
    inputBucket?: string;
    inputPrefix?: string;
    outputBucket?: string;
    outputPrefix?: string;
    contextBucket?: string;
    contextPrefix?: string;

    credentialsFile?: string;
}

export interface StorageConfig {
    backend: 'filesystem' | 'gcs';
    gcs?: GcsStorageConfig;
}

export const DEFAULT_STORAGE_CONFIG: StorageConfig = {
    backend: 'filesystem',
};
