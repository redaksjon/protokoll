import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
    findUploadedTranscripts: vi.fn(),
    markTranscriptAsTranscribing: vi.fn(),
    markTranscriptAsFailed: vi.fn(),
    pipelineProcess: vi.fn(),
    pipelineCreate: vi.fn(),
    loadFromFile: vi.fn(),
    builderBuild: vi.fn(),
    builderWriteToFile: vi.fn(),
    builderUpdateTranscript: vi.fn(),
    providerLoadModel: vi.fn(),
    providerGetModel: vi.fn(),
    fsStat: vi.fn(),
    fsUnlink: vi.fn(),
    glob: vi.fn(),
    enhancementLogStep: vi.fn(),
    setRawTranscript: vi.fn(),
    updateContent: vi.fn(),
    updateMetadata: vi.fn(),
    transcriptClose: vi.fn(),
}));

vi.mock('node:fs/promises', () => ({
    default: {
        stat: mocks.fsStat,
        unlink: mocks.fsUnlink,
    },
    stat: mocks.fsStat,
    unlink: mocks.fsUnlink,
}));

vi.mock('glob', () => ({
    glob: mocks.glob,
}));

vi.mock('@redaksjon/protokoll-engine', () => {
    class MockWeightModelBuilder {
        static loadFromFile = mocks.loadFromFile;

        constructor() {}

        build = mocks.builderBuild;
        writeToFile = mocks.builderWriteToFile;
        updateTranscript = mocks.builderUpdateTranscript;
    }

    class MockWeightModelProvider {
        loadModel = mocks.providerLoadModel;
        getModel = mocks.providerGetModel;
    }

    return {
        Pipeline: {
            create: mocks.pipelineCreate,
        },
        Transcript: {
            findUploadedTranscripts: mocks.findUploadedTranscripts,
            markTranscriptAsTranscribing: mocks.markTranscriptAsTranscribing,
            markTranscriptAsFailed: mocks.markTranscriptAsFailed,
        },
        Weighting: {
            WeightModelBuilder: MockWeightModelBuilder,
            WeightModelProvider: MockWeightModelProvider,
        },
    };
});

vi.mock('@redaksjon/protokoll-format', () => ({
    PklTranscript: {
        open: vi.fn(() => ({
            enhancementLog: {
                logStep: mocks.enhancementLogStep,
            },
            setRawTranscript: mocks.setRawTranscript,
            updateContent: mocks.updateContent,
            updateMetadata: mocks.updateMetadata,
            close: mocks.transcriptClose,
        })),
    },
}));

import { TranscriptionWorker } from '../../src/mcp/worker/transcription-worker';

describe('TranscriptionWorker', () => {
    beforeEach(() => {
        vi.clearAllMocks();

        mocks.loadFromFile.mockResolvedValue({
            metadata: { transcriptCount: 2, entityCount: 5 },
        });
        mocks.pipelineCreate.mockResolvedValue({ process: mocks.pipelineProcess });
        mocks.builderBuild.mockResolvedValue({
            metadata: { transcriptCount: 0, entityCount: 0 },
        });
        mocks.builderWriteToFile.mockResolvedValue(undefined);
        mocks.providerGetModel.mockReturnValue({
            metadata: { transcriptCount: 2, entityCount: 5 },
        });
        mocks.fsStat.mockResolvedValue(undefined);
        mocks.fsUnlink.mockResolvedValue(undefined);
        mocks.glob.mockResolvedValue([]);
        mocks.findUploadedTranscripts.mockResolvedValue([]);
        mocks.markTranscriptAsTranscribing.mockResolvedValue(undefined);
        mocks.markTranscriptAsFailed.mockResolvedValue(undefined);
    });

    it('starts and stops cleanly with an existing weight model', async () => {
        const worker = new TranscriptionWorker({
            outputDirectory: '/tmp/out',
            uploadDirectory: '/tmp/uploads',
            scanInterval: 1,
        });

        const processQueueSpy = vi
            .spyOn(worker as any, 'processQueue')
            .mockResolvedValue(undefined);

        await worker.start();

        expect(worker.isActive()).toBe(true);
        expect(mocks.loadFromFile).toHaveBeenCalled();
        expect(mocks.providerLoadModel).toHaveBeenCalled();
        expect(mocks.pipelineCreate).toHaveBeenCalledWith(
            expect.objectContaining({
                outputDirectory: '/tmp/out',
                maxAudioSize: 100 * 1024 * 1024,
            })
        );
        expect(processQueueSpy).toHaveBeenCalledTimes(1);

        await worker.start();
        expect(processQueueSpy).toHaveBeenCalledTimes(1);

        await worker.stop();
        expect(worker.isActive()).toBe(false);
    });

    it('processes transcript successfully and marks enhanced status', async () => {
        const worker = new TranscriptionWorker({
            outputDirectory: '/tmp/out',
            uploadDirectory: '/tmp/uploads',
        });

        (worker as any).pipeline = { process: mocks.pipelineProcess };
        mocks.pipelineProcess.mockResolvedValue({
            rawTranscript: 'raw transcript',
            enhancedText: 'x'.repeat(80),
            outputPath: '/tmp/out/routed.pkl',
            title: 'Enhanced title',
            routedProject: 'project-1',
            routedProjectName: 'Project One',
            routingConfidence: 0.92,
            entities: [{ id: 'person-1', type: 'person' }],
            toolsUsed: ['protokoll_list_people'],
            processingTime: 1234,
        });

        const item = {
            uuid: 'uuid-1',
            filePath: '/tmp/out/uploaded.pkl',
            metadata: {
                audioFile: '/tmp/uploads/audio.m4a',
                audioHash: 'abc123',
                date: new Date('2026-01-01T00:00:00.000Z'),
                title: 'Uploaded title',
            },
        } as any;

        await (worker as any).processNextTranscript(item);

        expect(mocks.markTranscriptAsTranscribing).toHaveBeenCalledWith('/tmp/out/uploaded.pkl');
        expect(mocks.pipelineProcess).toHaveBeenCalledWith(
            expect.objectContaining({
                audioFile: '/tmp/uploads/audio.m4a',
                hash: 'abc123',
            })
        );
        expect(mocks.fsUnlink).toHaveBeenCalledWith('/tmp/out/routed.pkl');
        expect(mocks.setRawTranscript).toHaveBeenCalled();
        expect(mocks.updateContent).toHaveBeenCalledWith('x'.repeat(80));
        expect(mocks.updateMetadata).toHaveBeenCalledWith(
            expect.objectContaining({
                status: 'enhanced',
                title: 'Enhanced title',
                project: 'Project One',
                projectId: 'project-1',
            })
        );
        expect(mocks.transcriptClose).toHaveBeenCalled();
        expect(worker.getProcessedCount()).toBe(1);
        expect(worker.getCurrentTask()).toBeUndefined();
    });

    it('falls back to hash lookup and marks initial when enhancement did not improve text', async () => {
        const worker = new TranscriptionWorker({
            outputDirectory: '/tmp/out',
            uploadDirectory: '/tmp/uploads',
        });

        (worker as any).pipeline = { process: mocks.pipelineProcess };
        mocks.fsStat.mockRejectedValueOnce(new Error('missing file'));
        mocks.glob.mockResolvedValueOnce(['/tmp/uploads/abc123.wav']);
        mocks.pipelineProcess.mockResolvedValue({
            rawTranscript: 'raw text',
            enhancedText: 'too short',
            outputPath: '/tmp/out/uploaded.pkl',
            title: undefined,
            routedProject: undefined,
            routedProjectName: undefined,
            routingConfidence: undefined,
            entities: [],
            toolsUsed: [],
            processingTime: 300,
        });

        const item = {
            uuid: 'uuid-2',
            filePath: '/tmp/out/uploaded.pkl',
            metadata: {
                audioFile: 'original-name.m4a',
                audioHash: 'abc123',
                date: new Date('2026-01-01T00:00:00.000Z'),
                title: 'Original title',
            },
        } as any;

        await (worker as any).processNextTranscript(item);

        expect(mocks.glob).toHaveBeenCalledWith('abc123.*', {
            cwd: '/tmp/uploads',
            absolute: true,
        });
        expect(mocks.updateMetadata).toHaveBeenCalledWith(
            expect.objectContaining({
                status: 'initial',
                title: 'Original title',
            })
        );
    });

    it('marks transcript as failed when processing throws', async () => {
        const worker = new TranscriptionWorker({
            outputDirectory: '/tmp/out',
            uploadDirectory: '/tmp/uploads',
        });

        (worker as any).pipeline = null;

        const item = {
            uuid: 'uuid-3',
            filePath: '/tmp/out/uploaded.pkl',
            metadata: {
                audioFile: '/tmp/uploads/audio.m4a',
            },
        } as any;

        await (worker as any).processNextTranscript(item);

        expect(mocks.markTranscriptAsFailed).toHaveBeenCalledWith(
            '/tmp/out/uploaded.pkl',
            'Pipeline not initialized'
        );
        expect(worker.getCurrentTask()).toBeUndefined();
    });

    it('exposes uptime and stats while idle', async () => {
        const worker = new TranscriptionWorker({
            outputDirectory: '/tmp/out',
            uploadDirectory: '/tmp/uploads',
        });

        await worker.stop();

        expect(worker.getUptime()).toBeGreaterThanOrEqual(0);
        expect(worker.getStats()).toEqual(
            expect.objectContaining({
                totalProcessed: 0,
            })
        );
        expect(worker.getLastProcessedTime()).toBeUndefined();
    });
});
