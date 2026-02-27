import { Storage } from '@google-cloud/storage';
import Logging from '@fjell/logging';
import { parseGcsUri } from './gcsUri';
import type { FileStorageProvider } from './fileProviders';

const logger = Logging.getLogger('@redaksjon/protokoll-mcp').get('gcs-storage');

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
        const startedAt = Date.now();
        const objectPath = this.objectPath(pathValue);
        logger.debug('gcs.read.start', {
            bucket: this.bucketName,
            basePrefix: this.basePrefix,
            path: pathValue,
            objectPath,
        });
        const [contents] = await this.storage.bucket(this.bucketName).file(objectPath).download();
        logger.info('gcs.read.complete', {
            bucket: this.bucketName,
            objectPath,
            bytes: contents.length,
            elapsedMs: Date.now() - startedAt,
        });
        return contents;
    }

    async writeFile(pathValue: string, data: Buffer | string): Promise<void> {
        const startedAt = Date.now();
        const objectPath = this.objectPath(pathValue);
        const bytes = typeof data === 'string' ? Buffer.byteLength(data) : data.length;
        logger.debug('gcs.write.start', {
            bucket: this.bucketName,
            basePrefix: this.basePrefix,
            path: pathValue,
            objectPath,
            bytes,
        });
        await this.storage.bucket(this.bucketName).file(objectPath).save(data);
        logger.info('gcs.write.complete', {
            bucket: this.bucketName,
            objectPath,
            bytes,
            elapsedMs: Date.now() - startedAt,
        });
    }

    async listFiles(prefix: string, pattern?: string): Promise<string[]> {
        const startedAt = Date.now();
        const fullPrefix = this.objectPath(prefix);
        logger.debug('gcs.list.start', {
            bucket: this.bucketName,
            basePrefix: this.basePrefix,
            prefix,
            fullPrefix,
            pattern: pattern ?? null,
        });
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
            logger.info('gcs.list.complete', {
                bucket: this.bucketName,
                fullPrefix,
                matchedCount: relativePaths.length,
                elapsedMs: Date.now() - startedAt,
            });
            return relativePaths;
        }
        const filtered = relativePaths.filter((pathValue) => pathValue.includes(pattern));
        logger.info('gcs.list.complete', {
            bucket: this.bucketName,
            fullPrefix,
            pattern,
            matchedCount: filtered.length,
            elapsedMs: Date.now() - startedAt,
        });
        return filtered;
    }

    async deleteFile(pathValue: string): Promise<void> {
        const startedAt = Date.now();
        const objectPath = this.objectPath(pathValue);
        logger.debug('gcs.delete.start', {
            bucket: this.bucketName,
            basePrefix: this.basePrefix,
            path: pathValue,
            objectPath,
        });
        await this.storage.bucket(this.bucketName).file(objectPath).delete({ ignoreNotFound: true });
        logger.info('gcs.delete.complete', {
            bucket: this.bucketName,
            objectPath,
            elapsedMs: Date.now() - startedAt,
        });
    }

    async exists(pathValue: string): Promise<boolean> {
        const startedAt = Date.now();
        const objectPath = this.objectPath(pathValue);
        logger.debug('gcs.exists.start', {
            bucket: this.bucketName,
            basePrefix: this.basePrefix,
            path: pathValue,
            objectPath,
        });
        const [exists] = await this.storage.bucket(this.bucketName).file(objectPath).exists();
        logger.info('gcs.exists.complete', {
            bucket: this.bucketName,
            objectPath,
            exists,
            elapsedMs: Date.now() - startedAt,
        });
        return exists;
    }

    async mkdir(_pathValue: string): Promise<void> {
        // No-op: GCS uses object prefixes instead of directories.
    }

    async verifyBucketAccess(): Promise<void> {
        const startedAt = Date.now();
        logger.debug('gcs.verify_bucket_access.start', {
            bucket: this.bucketName,
            basePrefix: this.basePrefix,
        });
        await this.storage.bucket(this.bucketName).getMetadata();
        logger.info('gcs.verify_bucket_access.complete', {
            bucket: this.bucketName,
            elapsedMs: Date.now() - startedAt,
        });
    }
}

export function createGcsStorageProvider(uri: string, credentialsFile?: string, projectId?: string): GcsStorageProvider {
    const startedAt = Date.now();
    const { bucket, prefix } = parseGcsUri(uri);
    logger.debug('gcs.provider.create.start', {
        uri,
        bucket,
        prefix,
        hasCredentialsFile: Boolean(credentialsFile),
        hasProjectId: Boolean(projectId),
    });
    const storage = credentialsFile
        ? new Storage({ keyFilename: credentialsFile, projectId })
        : new Storage({ projectId });
    logger.info('gcs.provider.create.complete', {
        bucket,
        prefix,
        hasCredentialsFile: Boolean(credentialsFile),
        hasProjectId: Boolean(projectId),
        elapsedMs: Date.now() - startedAt,
    });
    return new GcsStorageProvider(storage, bucket, prefix);
}
