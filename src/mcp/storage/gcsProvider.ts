import { Storage } from '@google-cloud/storage';
import { parseGcsUri } from './gcsUri';
import type { FileStorageProvider } from './fileProviders';

function normalizePath(value: string): string {
    return value.replace(/^\/+/, '').replace(/\\/g, '/');
}

function joinObjectPath(basePrefix: string, objectPath: string): string {
    const normalizedBase = basePrefix.replace(/^\/+|\/+$/g, '');
    const normalizedObjectPath = normalizePath(objectPath);
    if (!normalizedBase) {
        return normalizedObjectPath;
    }
    if (!normalizedObjectPath) {
        return normalizedBase;
    }
    return `${normalizedBase}/${normalizedObjectPath}`;
}

export class GcsStorageProvider implements FileStorageProvider {
    readonly name = 'gcs' as const;

    constructor(
        private readonly storage: Storage,
        private readonly bucketName: string,
        private readonly basePrefix: string,
    ) {}

    private objectPath(pathValue: string): string {
        return joinObjectPath(this.basePrefix, pathValue);
    }

    async readFile(pathValue: string): Promise<Buffer> {
        const [contents] = await this.storage.bucket(this.bucketName).file(this.objectPath(pathValue)).download();
        return contents;
    }

    async writeFile(pathValue: string, data: Buffer | string): Promise<void> {
        await this.storage.bucket(this.bucketName).file(this.objectPath(pathValue)).save(data);
    }

    async listFiles(prefix: string, pattern?: string): Promise<string[]> {
        const fullPrefix = this.objectPath(prefix);
        const [files] = await this.storage.bucket(this.bucketName).getFiles({ prefix: fullPrefix });
        const normalizedBase = this.basePrefix.replace(/^\/+|\/+$/g, '');
        const relativePaths = files
            .map((fileRef) => fileRef.name)
            .filter((fileName) => !fileName.endsWith('/'))
            .map((fileName) => {
                if (!normalizedBase) {
                    return fileName;
                }
                const prefixWithSlash = `${normalizedBase}/`;
                if (fileName.startsWith(prefixWithSlash)) {
                    return fileName.slice(prefixWithSlash.length);
                }
                return fileName;
            });
        if (!pattern) {
            return relativePaths;
        }
        return relativePaths.filter((pathValue) => pathValue.includes(pattern));
    }

    async deleteFile(pathValue: string): Promise<void> {
        await this.storage.bucket(this.bucketName).file(this.objectPath(pathValue)).delete({ ignoreNotFound: true });
    }

    async exists(pathValue: string): Promise<boolean> {
        const [exists] = await this.storage.bucket(this.bucketName).file(this.objectPath(pathValue)).exists();
        return exists;
    }

    async mkdir(_pathValue: string): Promise<void> {
        // No-op: GCS uses object prefixes instead of directories.
    }

    async verifyBucketAccess(): Promise<void> {
        await this.storage.bucket(this.bucketName).getMetadata();
    }
}

export function createGcsStorageProvider(uri: string, credentialsFile?: string): GcsStorageProvider {
    const { bucket, prefix } = parseGcsUri(uri);
    const storage = credentialsFile
        ? new Storage({ keyFilename: credentialsFile })
        : new Storage();
    return new GcsStorageProvider(storage, bucket, prefix);
}
