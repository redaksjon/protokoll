/**
 * Audio Tools Tests
 *
 * Tests for handleProcessAudio and handleBatchProcess.
 * Mocks serverConfig, shared utilities, @redaksjon/protokoll-engine, fs/promises, and glob.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
    handleProcessAudio,
    handleBatchProcess,
    processAudioTool,
    batchProcessTool,
} from '../../../src/mcp/tools/audioTools';

// Hoisted mocks - must be defined before vi.mock factories
const mockFileExists = vi.hoisted(() => vi.fn());
const mockGetAudioMetadata = vi.hoisted(() => vi.fn());
const mockGetConfiguredDirectory = vi.hoisted(() => vi.fn());
const mockSanitizePath = vi.hoisted(() => vi.fn());
const mockPipelineProcess = vi.hoisted(() => vi.fn());
const mockPipelineCreate = vi.hoisted(() => vi.fn());
const mockReaddir = vi.hoisted(() => vi.fn());
const mockGlob = vi.hoisted(() => vi.fn());
const mockGetServerConfig = vi.hoisted(() => vi.fn());
const mockGetInputDirectory = vi.hoisted(() => vi.fn());

vi.mock('../../../src/mcp/serverConfig', () => ({
    getServerConfig: (...args: unknown[]) => mockGetServerConfig(...args),
    getInputDirectory: (...args: unknown[]) => mockGetInputDirectory(...args),
}));

vi.mock('../../../src/mcp/tools/shared', () => ({
    fileExists: (...args: unknown[]) => mockFileExists(...args),
    getAudioMetadata: (...args: unknown[]) => mockGetAudioMetadata(...args),
    getConfiguredDirectory: (...args: unknown[]) => mockGetConfiguredDirectory(...args),
    sanitizePath: (...args: unknown[]) => mockSanitizePath(...args),
}));

vi.mock('@redaksjon/protokoll-engine', () => ({
    Pipeline: {
        create: (...args: unknown[]) => mockPipelineCreate(...args),
    },
}));

vi.mock('node:fs/promises', () => ({
    readdir: (...args: unknown[]) => mockReaddir(...args),
}));

vi.mock('glob', () => ({
    glob: (...args: unknown[]) => mockGlob(...args),
}));

function createMockContext(overrides: Record<string, unknown> = {}) {
    return {
        getConfig: vi.fn().mockReturnValue({
            outputStructure: 'month',
            outputFilenameOptions: ['date', 'title'],
            ...overrides,
        }),
    };
}

function createMockPipeline() {
    return {
        process: mockPipelineProcess,
    };
}

describe('audioTools', () => {
    const inputDir = '/workspace/recordings';
    const outputDir = '/workspace/notes';
    const processedDir = '/workspace/processed';

    beforeEach(() => {
        vi.clearAllMocks();

        mockGetServerConfig.mockReturnValue({
            context: createMockContext(),
            workspaceRoot: '/workspace',
            outputDirectory: outputDir,
            processedDirectory: processedDir,
        });

        mockGetInputDirectory.mockReturnValue(inputDir);
        mockGetConfiguredDirectory.mockImplementation(async (key: string) => {
            if (key === 'inputDirectory') return inputDir;
            if (key === 'outputDirectory') return outputDir;
            return processedDir;
        });

        mockFileExists.mockResolvedValue(true);
        mockGetAudioMetadata.mockResolvedValue({
            creationTime: new Date('2026-02-14T12:00:00Z'),
            hash: 'abc12345',
        });
        mockSanitizePath.mockImplementation(async (p: string) => p);

        mockPipelineCreate.mockResolvedValue(createMockPipeline());
        mockPipelineProcess.mockResolvedValue({
            outputPath: '/workspace/notes/2026/02/14-test.pkl',
            enhancedText: 'Enhanced transcript text',
            rawTranscript: 'Raw transcript text',
            routedProject: 'test-project',
            routingConfidence: 0.95,
            processingTime: 5.2,
            toolsUsed: ['whisper', 'gpt'],
            correctionsApplied: 3,
        });
    });

    describe('handleProcessAudio', () => {
        it('should process audio file when given absolute path that exists', async () => {
            const absolutePath = '/workspace/recordings/recording.m4a';
            mockFileExists.mockResolvedValue(true);

            const result = await handleProcessAudio({
                audioFile: absolutePath,
            });

            expect(result).toMatchObject({
                outputPath: expect.any(String),
                enhancedText: 'Enhanced transcript text',
                rawTranscript: 'Raw transcript text',
                routedProject: 'test-project',
                routingConfidence: 0.95,
                processingTime: 5.2,
                toolsUsed: ['whisper', 'gpt'],
                correctionsApplied: 3,
            });
            expect(mockFileExists).toHaveBeenCalledWith(absolutePath);
            expect(mockGetAudioMetadata).toHaveBeenCalledWith(absolutePath);
            expect(mockPipelineProcess).toHaveBeenCalledWith({
                audioFile: absolutePath,
                creation: expect.any(Date),
                hash: 'abc12345',
            });
        });

        it('should process audio file when given filename (searches input directory)', async () => {
            mockFileExists.mockImplementation(async (path: string) => path.startsWith('/') && path === '/workspace/recordings/recording.m4a');
            mockReaddir.mockResolvedValue([
                { name: 'recording.m4a', isFile: () => true },
                { name: 'other.txt', isFile: () => true },
            ]);

            const result = await handleProcessAudio({
                audioFile: 'recording.m4a',
            });

            expect(result.enhancedText).toBe('Enhanced transcript text');
            expect(mockGetConfiguredDirectory).toHaveBeenCalledWith('inputDirectory');
            expect(mockReaddir).toHaveBeenCalledWith(inputDir, { withFileTypes: true });
        });

        it('should pass model and transcriptionModel to pipeline', async () => {
            await handleProcessAudio({
                audioFile: '/workspace/recordings/recording.m4a',
                model: 'gpt-4o',
                transcriptionModel: 'whisper-2',
            });

            expect(mockPipelineCreate).toHaveBeenCalledWith(
                expect.objectContaining({
                    model: 'gpt-4o',
                    transcriptionModel: 'whisper-2',
                })
            );
        });

        it('should use outputDirectory override when provided', async () => {
            const customOutput = '/custom/output';
            mockGetServerConfig.mockReturnValue({
                context: createMockContext(),
                workspaceRoot: '/workspace',
                outputDirectory: outputDir,
                processedDirectory: processedDir,
            });

            await handleProcessAudio({
                audioFile: '/workspace/recordings/recording.m4a',
                outputDirectory: customOutput,
            });

            expect(mockPipelineCreate).toHaveBeenCalledWith(
                expect.objectContaining({
                    outputDirectory: customOutput,
                })
            );
            expect(mockSanitizePath).toHaveBeenCalledWith(
                expect.any(String),
                customOutput
            );
        });

        it('should sanitize output path before returning', async () => {
            mockSanitizePath.mockResolvedValue('2026/02/14-test.pkl');

            const result = await handleProcessAudio({
                audioFile: '/workspace/recordings/recording.m4a',
            });

            expect(result.outputPath).toBe('2026/02/14-test.pkl');
            expect(mockSanitizePath).toHaveBeenCalled();
        });

        it('should throw when context is not available', async () => {
            mockGetServerConfig.mockReturnValue({
                context: null,
                workspaceRoot: '/workspace',
                outputDirectory: outputDir,
                processedDirectory: processedDir,
            });

            await expect(
                handleProcessAudio({
                    audioFile: '/workspace/recordings/recording.m4a',
                })
            ).rejects.toThrow('Protokoll context not available');
        });

        it('should throw when audio file not found (absolute path does not exist)', async () => {
            mockFileExists.mockResolvedValue(false);
            mockReaddir.mockResolvedValue([]);

            await expect(
                handleProcessAudio({
                    audioFile: '/nonexistent/recording.m4a',
                })
            ).rejects.toThrow('No audio file found matching');
        });

        it('should throw when filename matches no files in input directory', async () => {
            mockFileExists.mockResolvedValue(false);
            mockReaddir.mockResolvedValue([
                { name: 'other.m4a', isFile: () => true },
            ]);

            await expect(
                handleProcessAudio({
                    audioFile: 'nonexistent.m4a',
                })
            ).rejects.toThrow('No audio file found matching');
        });

        it('should throw when multiple files match filename', async () => {
            mockFileExists.mockResolvedValue(false);
            mockReaddir.mockResolvedValue([
                { name: 'recording1.m4a', isFile: () => true },
                { name: 'recording2.m4a', isFile: () => true },
            ]);

            await expect(
                handleProcessAudio({
                    audioFile: 'recording',
                })
            ).rejects.toThrow('Multiple audio files match');
        });

        it('should throw when pipeline processing fails', async () => {
            mockPipelineProcess.mockRejectedValue(new Error('Transcription failed'));

            await expect(
                handleProcessAudio({
                    audioFile: '/workspace/recordings/recording.m4a',
                })
            ).rejects.toThrow('Transcription failed');
        });

        it('should handle non-Error thrown from pipeline', async () => {
            mockPipelineProcess.mockRejectedValue('string error');

            await expect(
                handleProcessAudio({
                    audioFile: '/workspace/recordings/recording.m4a',
                })
            ).rejects.toBe('string error');
        });
    });

    describe('handleBatchProcess', () => {
        it('should return empty arrays when no audio files found', async () => {
            mockGlob.mockResolvedValue([]);

            const result = await handleBatchProcess({});

            expect(result).toEqual({ processed: [], errors: [] });
            expect(mockGetConfiguredDirectory).toHaveBeenCalledWith('inputDirectory');
            expect(mockGlob).toHaveBeenCalled();
        });

        it('should process multiple files successfully', async () => {
            const files = [
                '/workspace/recordings/file1.m4a',
                '/workspace/recordings/file2.mp3',
            ];
            mockGlob.mockResolvedValue(files);

            const result = await handleBatchProcess({});

            expect(result.processed).toHaveLength(2);
            expect(result.errors).toHaveLength(0);
            expect(result.processed[0].enhancedText).toBe('Enhanced transcript text');
            expect(result.processed[1].enhancedText).toBe('Enhanced transcript text');
            expect(mockPipelineProcess).toHaveBeenCalledTimes(2);
        });

        it('should collect errors when some files fail', async () => {
            const files = [
                '/workspace/recordings/file1.m4a',
                '/workspace/recordings/file2.m4a',
            ];
            mockGlob.mockResolvedValue(files);
            mockPipelineProcess
                .mockResolvedValueOnce({
                    outputPath: '/workspace/notes/out1.pkl',
                    enhancedText: 'First',
                    rawTranscript: 'Raw1',
                    routedProject: 'p1',
                    routingConfidence: 0.9,
                    processingTime: 1,
                    toolsUsed: [],
                    correctionsApplied: 0,
                })
                .mockRejectedValueOnce(new Error('Processing failed for file2'));

            mockSanitizePath.mockImplementation(async (p: string, base?: string) => {
                if (p.includes('file2')) return 'file2.m4a';
                return p;
            });

            const result = await handleBatchProcess({});

            expect(result.processed).toHaveLength(1);
            expect(result.errors).toHaveLength(1);
            expect(result.errors[0].file).toBe('file2.m4a');
            expect(result.errors[0].error).toBe('Processing failed for file2');
        });

        it('should throw when input directory does not exist', async () => {
            mockFileExists.mockResolvedValue(false);

            await expect(
                handleBatchProcess({})
            ).rejects.toThrow('Input directory not found');
        });

        it('should use custom inputDirectory when provided', async () => {
            const customDir = '/custom/recordings';
            mockGlob.mockResolvedValue([`${customDir}/file.m4a`]);

            await handleBatchProcess({
                inputDirectory: customDir,
            });

            expect(mockFileExists).toHaveBeenCalledWith(customDir);
            expect(mockGlob).toHaveBeenCalledWith(
                expect.any(Array),
                expect.objectContaining({ cwd: customDir })
            );
        });

        it('should use custom extensions when provided', async () => {
            mockGlob.mockResolvedValue([]);

            await handleBatchProcess({
                extensions: ['.ogg', '.flac'],
            });

            expect(mockGlob).toHaveBeenCalledWith(
                ['**/*.ogg', '**/*.flac'],
                expect.any(Object)
            );
        });

        it('should use default extensions when not provided', async () => {
            mockGlob.mockResolvedValue([]);

            await handleBatchProcess({});

            expect(mockGlob).toHaveBeenCalledWith(
                ['**/*.m4a', '**/*.mp3', '**/*.wav', '**/*.webm'],
                expect.any(Object)
            );
        });

        it('should pass outputDirectory to handleProcessAudio for each file', async () => {
            const customOutput = '/custom/output';
            mockGlob.mockResolvedValue(['/workspace/recordings/file.m4a']);

            await handleBatchProcess({
                outputDirectory: customOutput,
            });

            expect(mockPipelineCreate).toHaveBeenCalledWith(
                expect.objectContaining({
                    outputDirectory: customOutput,
                })
            );
        });

        it('should sanitize file paths in error messages', async () => {
            mockGlob.mockResolvedValue(['/workspace/recordings/failed.m4a']);
            mockPipelineProcess.mockRejectedValue(new Error('Failed'));
            mockSanitizePath.mockResolvedValue('failed.m4a');

            const result = await handleBatchProcess({});

            expect(result.errors[0].file).toBe('failed.m4a');
            expect(mockSanitizePath).toHaveBeenCalledWith(
                '/workspace/recordings/failed.m4a',
                inputDir
            );
        });

        it('should handle non-Error in batch processing', async () => {
            mockGlob.mockResolvedValue(['/workspace/recordings/file.m4a']);
            mockPipelineProcess.mockRejectedValue('string error');
            mockSanitizePath.mockResolvedValue('file.m4a');

            const result = await handleBatchProcess({});

            expect(result.errors[0].error).toBe('string error');
        });
    });

    describe('tool definitions', () => {
        it('processAudioTool should have correct schema', () => {
            expect(processAudioTool.name).toBe('protokoll_process_audio');
            expect(processAudioTool.inputSchema?.required).toContain('audioFile');
            expect(processAudioTool.inputSchema?.properties?.audioFile).toBeDefined();
        });

        it('batchProcessTool should have correct schema', () => {
            expect(batchProcessTool.name).toBe('protokoll_batch_process');
            expect(batchProcessTool.inputSchema?.required).toEqual([]);
            expect(batchProcessTool.inputSchema?.properties?.inputDirectory).toBeDefined();
        });
    });
});
