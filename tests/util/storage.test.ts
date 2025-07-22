import { describe, expect, test, beforeAll, beforeEach, vi } from 'vitest';
import crypto from 'crypto';

// Mock function declarations
const mockGlob = vi.fn();
const mockStat = vi.fn();
const mockAccess = vi.fn();
const mockMkdir = vi.fn();
const mockReadFile = vi.fn();
const mockWriteFile = vi.fn();
const mockLstatSync = vi.fn();
const mockReaddir = vi.fn();
const mockCreateReadStream = vi.fn();
const mockUnlink = vi.fn();

vi.mock('fs', () => ({
    __esModule: true,
    promises: {
        stat: mockStat,
        access: mockAccess,
        mkdir: mockMkdir,
        readFile: mockReadFile,
        writeFile: mockWriteFile,
        lstatSync: mockLstatSync,
        readdir: mockReaddir,
        unlink: mockUnlink
    },
    createReadStream: mockCreateReadStream,
    constants: {
        R_OK: 4,
        W_OK: 2
    }
}));

vi.mock('glob', () => ({
    __esModule: true,
    glob: mockGlob
}));

// Import the storage module after mocking fs
let storageModule: any;

describe('Storage Utility', () => {
    // Mock for console.log
    const mockLog = vi.fn();
    let storage: any;

    beforeAll(async () => {
        var fs = await import('fs');
        var glob = await import('glob');
        storageModule = await import('../../src/util/storage.js');
    });

    beforeEach(() => {
        vi.clearAllMocks();
        storage = storageModule.create({ log: mockLog });
    });

    describe('exists', () => {
        test('should return true if path exists', async () => {
            mockStat.mockResolvedValueOnce({ isDirectory: () => false, isFile: () => false });

            const result = await storage.exists('/test/path');

            expect(result).toBe(true);
            expect(mockStat).toHaveBeenCalledWith('/test/path');
        });

        test('should return false if path does not exist', async () => {
            mockStat.mockRejectedValueOnce(new Error('Path does not exist'));

            const result = await storage.exists('/test/path');

            expect(result).toBe(false);
            expect(mockStat).toHaveBeenCalledWith('/test/path');
        });
    });

    describe('isDirectory', () => {
        test('should return true if path is a directory', async () => {
            mockStat.mockResolvedValueOnce({
                isDirectory: () => true,
                isFile: () => false
            });

            const result = await storage.isDirectory('/test/dir');

            expect(result).toBe(true);
            expect(mockStat).toHaveBeenCalledWith('/test/dir');
            expect(mockLog).not.toHaveBeenCalled();
        });

        test('should return false if path is not a directory', async () => {
            mockStat.mockResolvedValueOnce({
                isDirectory: () => false,
                isFile: () => true
            });

            const result = await storage.isDirectory('/test/file');

            expect(result).toBe(false);
            expect(mockStat).toHaveBeenCalledWith('/test/file');
            expect(mockLog).toHaveBeenCalledWith('/test/file is not a directory');
        });
    });

    describe('isFile', () => {
        test('should return true if path is a file', async () => {
            mockStat.mockResolvedValueOnce({
                isFile: () => true,
                isDirectory: () => false
            });

            const result = await storage.isFile('/test/file.txt');

            expect(result).toBe(true);
            expect(mockStat).toHaveBeenCalledWith('/test/file.txt');
            expect(mockLog).not.toHaveBeenCalled();
        });

        test('should return false if path is not a file', async () => {
            mockStat.mockResolvedValueOnce({
                isFile: () => false,
                isDirectory: () => true
            });

            const result = await storage.isFile('/test/dir');

            expect(result).toBe(false);
            expect(mockStat).toHaveBeenCalledWith('/test/dir');
            expect(mockLog).toHaveBeenCalledWith('/test/dir is not a file');
        });
    });

    describe('isReadable', () => {
        test('should return true if path is readable', async () => {
            mockAccess.mockResolvedValueOnce(undefined);

            const result = await storage.isReadable('/test/file.txt');

            expect(result).toBe(true);
            expect(mockAccess).toHaveBeenCalledWith('/test/file.txt', 4);
        });

        test('should return false if path is not readable', async () => {
            mockAccess.mockRejectedValueOnce(new Error('Not readable'));

            const result = await storage.isReadable('/test/file.txt');

            expect(result).toBe(false);
            expect(mockAccess).toHaveBeenCalledWith('/test/file.txt', 4);
            expect(mockLog).toHaveBeenCalledWith(
                '/test/file.txt is not readable: %s %s',
                'Not readable',
                expect.any(String)
            );
        });
    });

    describe('isWritable', () => {
        test('should return true if path is writable', async () => {
            mockAccess.mockResolvedValueOnce(undefined);

            const result = await storage.isWritable('/test/file.txt');

            expect(result).toBe(true);
            expect(mockAccess).toHaveBeenCalledWith('/test/file.txt', 2);
        });

        test('should return false if path is not writable', async () => {
            mockAccess.mockRejectedValueOnce(new Error('Not writable'));

            const result = await storage.isWritable('/test/file.txt');

            expect(result).toBe(false);
            expect(mockAccess).toHaveBeenCalledWith('/test/file.txt', 2);
            expect(mockLog).toHaveBeenCalledWith(
                '/test/file.txt is not writable: %s %s',
                'Not writable',
                expect.any(String)
            );
        });
    });

    describe('isFileReadable', () => {
        test('should return true if path exists, is a file, and is readable', async () => {
            // Setup mocks for the chain of function calls
            mockStat.mockResolvedValueOnce({ isFile: () => false, isDirectory: () => false }); // exists
            mockStat.mockResolvedValueOnce({  // isFile
                isFile: () => true,
                isDirectory: () => false
            });
            mockAccess.mockResolvedValueOnce(undefined); // isReadable

            const result = await storage.isFileReadable('/test/file.txt');

            expect(result).toBe(true);
        });

        test('should return false if path does not exist', async () => {
            mockStat.mockRejectedValueOnce(new Error('Path does not exist'));

            const result = await storage.isFileReadable('/test/file.txt');

            expect(result).toBe(false);
        });

        test('should return false if path is not a file', async () => {
            mockStat.mockResolvedValueOnce({ isFile: () => false, isDirectory: () => false }); // exists
            mockStat.mockResolvedValueOnce({ // isFile
                isFile: () => false,
                isDirectory: () => true
            });

            const result = await storage.isFileReadable('/test/dir');

            expect(result).toBe(false);
        });

        test('should return false if path is not readable', async () => {
            mockStat.mockResolvedValueOnce({ isFile: () => false, isDirectory: () => false }); // exists
            mockStat.mockResolvedValueOnce({ // isFile
                isFile: () => true,
                isDirectory: () => false
            });
            mockAccess.mockRejectedValueOnce(new Error('Not readable')); // isReadable

            const result = await storage.isFileReadable('/test/file.txt');

            expect(result).toBe(false);
        });
    });

    describe('isDirectoryWritable', () => {
        test('should return true if path exists, is a directory, and is writable', async () => {
            // Setup mocks for the chain of function calls
            mockStat.mockResolvedValueOnce({ isFile: () => false, isDirectory: () => false }); // exists
            mockStat.mockResolvedValueOnce({ // isDirectory
                isDirectory: () => true,
                isFile: () => false
            });
            mockAccess.mockResolvedValueOnce(undefined); // isWritable

            const result = await storage.isDirectoryWritable('/test/dir');

            expect(result).toBe(true);
        });

        test('should return false if path does not exist', async () => {
            mockStat.mockRejectedValueOnce(new Error('Path does not exist'));

            const result = await storage.isDirectoryWritable('/test/dir');

            expect(result).toBe(false);
        });

        test('should return false if path is not a directory', async () => {
            mockStat.mockResolvedValueOnce({ isFile: () => false, isDirectory: () => false }); // exists
            mockStat.mockResolvedValueOnce({ // isDirectory
                isDirectory: () => false,
                isFile: () => true
            });

            const result = await storage.isDirectoryWritable('/test/file.txt');

            expect(result).toBe(false);
        });

        test('should return false if path is not writable', async () => {
            mockStat.mockResolvedValueOnce({ isFile: () => false, isDirectory: () => false }); // exists
            mockStat.mockResolvedValueOnce({ // isDirectory
                isDirectory: () => true,
                isFile: () => false
            });
            mockAccess.mockRejectedValueOnce(new Error('Not writable')); // isWritable

            const result = await storage.isDirectoryWritable('/test/dir');

            expect(result).toBe(false);
        });
    });

    describe('createDirectory', () => {
        test('should create directory successfully', async () => {
            mockMkdir.mockResolvedValueOnce(undefined);

            await storage.createDirectory('/test/dir');

            expect(mockMkdir).toHaveBeenCalledWith('/test/dir', { recursive: true });
        });

        test('should throw error if directory creation fails', async () => {
            mockMkdir.mockRejectedValueOnce(new Error('Failed to create directory'));

            await expect(storage.createDirectory('/test/dir')).rejects.toThrow(
                'Failed to create output directory /test/dir: Failed to create directory'
            );
        });
    });

    describe('readFile', () => {
        test('should read file successfully', async () => {
            mockReadFile.mockResolvedValueOnce('file content');

            const result = await storage.readFile('/test/file.txt', 'utf8');

            expect(result).toBe('file content');
            expect(mockReadFile).toHaveBeenCalledWith('/test/file.txt', { encoding: 'utf8' });
        });
    });

    describe('writeFile', () => {
        test('should write file successfully', async () => {
            mockWriteFile.mockResolvedValueOnce(undefined);

            await storage.writeFile('/test/file.txt', 'file content', 'utf8');

            expect(mockWriteFile).toHaveBeenCalledWith('/test/file.txt', 'file content', { encoding: 'utf8' });
        });

        test('should write file with Buffer data', async () => {
            mockWriteFile.mockResolvedValueOnce(undefined);
            const buffer = Buffer.from('file content');

            await storage.writeFile('/test/file.txt', buffer, 'utf8');

            expect(mockWriteFile).toHaveBeenCalledWith('/test/file.txt', buffer, { encoding: 'utf8' });
        });
    });

    describe('Default logger', () => {
        test('should use console.log as default logger', async () => {
            const originalConsoleLog = console.log;
            const mockConsoleLog = vi.fn();
            console.log = mockConsoleLog;

            try {
                const utilWithDefaultLogger = storageModule.create({});
                mockStat.mockResolvedValueOnce({
                    isDirectory: () => false,
                    isFile: () => true
                });

                await utilWithDefaultLogger.isDirectory('/test/file');

                expect(mockConsoleLog).toHaveBeenCalledWith('/test/file is not a directory');
            } finally {
                console.log = originalConsoleLog;
            }
        });
    });

    describe('forEachFileIn', () => {
        test('should iterate over files in a directory', async () => {
            // Setup mocks for the chain of function calls
            // @ts-ignore
            mockGlob.mockResolvedValueOnce(['file1.txt', 'file2.txt']);

            await storage.forEachFileIn('/test/dir', async (file: string) => {
                expect(file).toMatch(/^\/test\/dir\/file[12]\.txt$/)
            });
        });

        test('should throw error if glob fails', async () => {
            // @ts-ignore
            mockGlob.mockRejectedValueOnce(new Error('Glob failed'));

            await expect(storage.forEachFileIn('/test/dir', async () => { })).rejects.toThrow(
                'Failed to glob pattern *.* in /test/dir: Glob failed'
            );
        });
    });

    describe('readStream', () => {
        test('should return a read stream', async () => {
            const mockStream = { pipe: vi.fn() }; // Mock stream object
            // @ts-ignore
            mockCreateReadStream.mockReturnValueOnce(mockStream);

            const stream = await storage.readStream('/test/file.txt');

            expect(stream).toBe(mockStream);
            expect(mockCreateReadStream).toHaveBeenCalledWith('/test/file.txt');
        });
    });

    describe('hashFile', () => {
        test('should return the correct hash of the file content', async () => {
            const fileContent = 'this is the file content';
            const expectedHash = crypto.createHash('sha256').update(fileContent).digest('hex').slice(0, 10);
            mockReadFile.mockResolvedValueOnce(fileContent);

            const hash = await storage.hashFile('/test/file.txt', 10);

            expect(hash).toBe(expectedHash);
            expect(mockReadFile).toHaveBeenCalledWith('/test/file.txt', { encoding: 'utf8' });
        });
    });

    describe('listFiles', () => {
        test('should return a list of files in the directory', async () => {
            const expectedFiles = ['file1.txt', 'file2.js'];
            // @ts-ignore
            mockReaddir.mockResolvedValueOnce(expectedFiles);

            const files = await storage.listFiles('/test/dir');

            expect(files).toEqual(expectedFiles);
            expect(mockReaddir).toHaveBeenCalledWith('/test/dir');
        });
    });

    describe('isDirectoryReadable', () => {
        test('should return true if path exists, is a directory, and is readable', async () => {
            // Setup mocks for the chain of function calls
            mockStat.mockResolvedValueOnce({ isFile: () => false, isDirectory: () => false }); // exists
            mockStat.mockResolvedValueOnce({ // isDirectory
                isDirectory: () => true,
                isFile: () => false
            });
            mockAccess.mockResolvedValueOnce(undefined); // isReadable

            const result = await storage.isDirectoryReadable('/test/dir');

            expect(result).toBe(true);
        });

        test('should return false if path does not exist', async () => {
            mockStat.mockRejectedValueOnce(new Error('Path does not exist'));

            const result = await storage.isDirectoryReadable('/test/dir');

            expect(result).toBe(false);
        });

        test('should return false if path is not a directory', async () => {
            mockStat.mockResolvedValueOnce({ isFile: () => false, isDirectory: () => false }); // exists
            mockStat.mockResolvedValueOnce({ // isDirectory
                isDirectory: () => false,
                isFile: () => true
            });

            const result = await storage.isDirectoryReadable('/test/file.txt');

            expect(result).toBe(false);
        });

        test('should return false if path is not readable', async () => {
            mockStat.mockResolvedValueOnce({ isFile: () => false, isDirectory: () => false }); // exists
            mockStat.mockResolvedValueOnce({ // isDirectory
                isDirectory: () => true,
                isFile: () => false
            });
            mockAccess.mockRejectedValueOnce(new Error('Not readable')); // isReadable

            const result = await storage.isDirectoryReadable('/test/dir');

            expect(result).toBe(false);
        });
    });

    describe('deleteFile', () => {
        test('should delete a file', async () => {
            mockUnlink.mockResolvedValueOnce(undefined);

            await storage.deleteFile('/test/file.txt');

            expect(mockUnlink).toHaveBeenCalledWith('/test/file.txt');
        });
    });

    describe('getFileSize', () => {
        test('should return the size of a file', async () => {
            const fileStats = {
                size: 12345,
                isFile: () => true,
                isDirectory: () => false
            };
            mockStat.mockResolvedValueOnce(fileStats);

            const size = await storage.getFileSize('/test/file.txt');

            expect(size).toBe(12345);
            expect(mockStat).toHaveBeenCalledWith('/test/file.txt');
        });
    });
});
