import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
    buildAndWrite: vi.fn(),
    writeToFile: vi.fn(),
    updateTranscript: vi.fn(),
    providerLoadModel: vi.fn(),
}));

vi.mock('@redaksjon/protokoll-engine', () => {
    class MockWeightModelBuilder {
        buildAndWrite = mocks.buildAndWrite;
        writeToFile = mocks.writeToFile;
        updateTranscript = mocks.updateTranscript;
        constructor() {}
    }

    class MockWeightModelProvider {
        loadModel = mocks.providerLoadModel;
        constructor() {}
    }

    return {
        Weighting: {
            WeightModelBuilder: MockWeightModelBuilder,
            WeightModelProvider: MockWeightModelProvider,
        },
    };
});

describe('weightModel service', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        vi.useRealTimers();
    });

    it('initializes successfully and updates transcript with debounced write', async () => {
        const model = {
            metadata: {
                transcriptCount: 2,
                entityCount: 5,
                builtAt: '2026-01-01T00:00:00.000Z',
                lastUpdatedAt: '2026-01-01T00:00:00.000Z',
                version: '1.0.0',
            },
            cooccurrence: {},
            byProject: {},
            transcriptSnapshots: {},
        };
        mocks.buildAndWrite.mockResolvedValue(model);
        mocks.writeToFile.mockResolvedValue(undefined);

        const service = await import('../../src/mcp/services/weightModel');
        const initialized = await service.initializeWeightModel('/tmp/workspace');

        expect(initialized.isReady).toBe(true);
        expect(service.isWeightModelReady()).toBe(true);
        expect(service.getWeightModelService()).toBeTruthy();

        vi.useFakeTimers();
        service.updateTranscriptInWeightModel('tx-1', ['person-1', 'project-1'], 'project-1');
        expect(mocks.updateTranscript).toHaveBeenCalledWith(
            model,
            'tx-1',
            ['person-1', 'project-1'],
            'project-1'
        );
        expect(mocks.providerLoadModel).toHaveBeenCalledWith(model);

        vi.advanceTimersByTime(2100);
        await Promise.resolve();
        expect(mocks.writeToFile).toHaveBeenCalled();
    });

    it('falls back to not-ready service when build fails', async () => {
        mocks.buildAndWrite.mockRejectedValue(new Error('boom'));

        const service = await import('../../src/mcp/services/weightModel');
        const initialized = await service.initializeWeightModel('/tmp/workspace');

        expect(initialized.isReady).toBe(false);
        expect(service.isWeightModelReady()).toBe(false);
        service.updateTranscriptInWeightModel('tx-2', ['person-2'], 'project-2');
        expect(mocks.updateTranscript).not.toHaveBeenCalled();
    });
});
