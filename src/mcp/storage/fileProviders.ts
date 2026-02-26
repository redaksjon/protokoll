import { mkdir, readdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { dirname, isAbsolute, join, relative, resolve } from 'node:path';

export interface FileStorageProvider {
    readonly name: 'filesystem' | 'gcs';
    readFile(path: string): Promise<Buffer>;
    writeFile(path: string, data: Buffer | string): Promise<void>;
    listFiles(prefix: string, pattern?: string): Promise<string[]>;
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

    constructor(private readonly baseDirectory: string) {}

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
        const prefixPath = this.resolvePath(prefix || '.');
        const allFiles = await walkFilesRecursive(prefixPath);
        const relativeFiles = allFiles.map((filePath) => this.toRelativePath(filePath));
        if (!pattern) {
            return relativeFiles;
        }
        return relativeFiles.filter((filePath) => filePath.includes(pattern));
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
