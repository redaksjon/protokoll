import { mkdir, readdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { dirname, isAbsolute, join, relative, resolve } from 'node:path';

export interface StorageFileMetadata {
    path: string;
    size: number;
    updatedAt: string | null;
    etag?: string;
    generation?: string;
}

export interface FileStorageProvider {
    readonly name: 'filesystem' | 'gcs';
    readonly cacheKey?: string;
    readFile(path: string): Promise<Buffer>;
    writeFile(path: string, data: Buffer | string): Promise<void>;
    listFiles(prefix: string, pattern?: string): Promise<string[]>;
    listFilesWithMetadata(prefix: string, pattern?: string): Promise<StorageFileMetadata[]>;
    deleteFile(path: string): Promise<void>;
    exists(path: string): Promise<boolean>;
    mkdir(path: string): Promise<void>;
}

async function walkFilesRecursive(directory: string): Promise<string[]> {
    const entries = await readdir(directory, { withFileTypes: true });
    const files: string[] = [];

    for (const entry of entries) {
        const absolutePath = join(directory, entry.name);
        if (entry.isDirectory()) {
            files.push(...await walkFilesRecursive(absolutePath));
        } else if (entry.isFile()) {
            files.push(absolutePath);
        }
    }

    return files;
}

export class FilesystemStorageProvider implements FileStorageProvider {
    readonly name = 'filesystem' as const;
    readonly cacheKey: string;

    constructor(private readonly baseDirectory: string) {
        this.cacheKey = `fs:${resolve(baseDirectory)}`;
    }

    private resolvePath(pathValue: string): string {
        if (isAbsolute(pathValue)) {
            return pathValue;
        }
        return resolve(this.baseDirectory, pathValue);
    }

    private toRelativePath(pathValue: string): string {
        return relative(this.baseDirectory, pathValue);
    }

    async readFile(pathValue: string): Promise<Buffer> {
        return readFile(this.resolvePath(pathValue));
    }

    async writeFile(pathValue: string, data: Buffer | string): Promise<void> {
        const resolvedPath = this.resolvePath(pathValue);
        await mkdir(dirname(resolvedPath), { recursive: true });
        await writeFile(resolvedPath, data);
    }

    async listFiles(prefix: string, pattern?: string): Promise<string[]> {
        const withMetadata = await this.listFilesWithMetadata(prefix, pattern);
        return withMetadata.map((entry) => entry.path);
    }

    async listFilesWithMetadata(prefix: string, pattern?: string): Promise<StorageFileMetadata[]> {
        const prefixPath = this.resolvePath(prefix || '.');
        let allFiles: string[] = [];
        try {
            allFiles = await walkFilesRecursive(prefixPath);
        } catch (error) {
            const code = (error as NodeJS.ErrnoException).code;
            if (code === 'ENOENT') {
                return [];
            }
            throw error;
        }
        const entries = await Promise.all(
            allFiles.map(async (filePath) => {
                const fileStat = await stat(filePath);
                return {
                    path: this.toRelativePath(filePath),
                    size: fileStat.size,
                    updatedAt: fileStat.mtime ? fileStat.mtime.toISOString() : null,
                } satisfies StorageFileMetadata;
            })
        );
        if (!pattern) {
            return entries;
        }
        return entries.filter((entry) => entry.path.includes(pattern));
    }

    async deleteFile(pathValue: string): Promise<void> {
        await rm(this.resolvePath(pathValue), { force: true });
    }

    async exists(pathValue: string): Promise<boolean> {
        try {
            await stat(this.resolvePath(pathValue));
            return true;
        } catch {
            return false;
        }
    }

    async mkdir(pathValue: string): Promise<void> {
        await mkdir(this.resolvePath(pathValue), { recursive: true });
    }
}
