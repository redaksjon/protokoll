import { describe, expect, test, beforeAll, beforeEach, vi } from 'vitest';
// Mock modules
const mockExec = vi.fn();
const mockPromisify = vi.fn();

vi.mock('child_process', () => ({
    exec: mockExec
}));

vi.mock('util', () => ({
    default: {
        promisify: mockPromisify
    }
}));

// Create the mock function to be returned by promisify with appropriate type assertion
const mockExecPromise = vi.fn() as ReturnType<typeof vi.fn>;

// Import the module under test (must be after mocks)
let run: any;

describe('child util', () => {
    beforeAll(async () => {
        // Set default mock implementation
        mockPromisify.mockReturnValue(mockExecPromise);

        // Default success case
        mockExecPromise.mockImplementation((_command: string, _options: any) => {
            return Promise.resolve({
                stdout: 'success output',
                stderr: ''
            });
        });

        // Import the module after mocks are set up
        const childModule = await import('../../src/util/child.js');
        run = childModule.run;
    });

    beforeEach(() => {
        vi.clearAllMocks();
    });

    describe('run', () => {
        test('should execute a command and return stdout/stderr', async () => {
            const result = await run('test command');

            // Verify promisify was called with exec
            expect(mockPromisify).toHaveBeenCalledWith(mockExec);

            // Verify the promisified exec was called with correct arguments
            expect(mockExecPromise).toHaveBeenCalledWith('test command', {});

            // Verify the result contains expected output
            expect(result).toEqual({
                stdout: 'success output',
                stderr: ''
            });
        });

        test('should pass options to exec', async () => {
            const options = { cwd: '/tmp', env: { NODE_ENV: 'test' } };
            await run('test command', options);

            expect(mockExecPromise).toHaveBeenCalledWith('test command', options);
        });

        test('should handle command failures', async () => {
            // Override the implementation for this test
            const error = new Error('Command failed');
            mockExecPromise.mockImplementationOnce(() => Promise.reject(error));

            await expect(run('failing command')).rejects.toThrow('Command failed');
        });
    });
});
