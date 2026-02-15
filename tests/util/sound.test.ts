/**
 * Tests for Sound Notification Utility
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as Sound from '../../src/util/sound';
import { spawn } from 'child_process';
import { EventEmitter } from 'events';

// Mock child_process
vi.mock('child_process', () => ({
    spawn: vi.fn(),
}));

// Mock logging
vi.mock('../../src/logging', () => ({
    getLogger: vi.fn(() => ({
        debug: vi.fn(),
        info: vi.fn(),
        error: vi.fn(),
    })),
}));

describe('sound', () => {
    let mockProcess: EventEmitter;
    let originalPlatform: string;

    beforeEach(() => {
        originalPlatform = process.platform;
        mockProcess = new EventEmitter();
        (mockProcess as any).unref = vi.fn();
        vi.mocked(spawn).mockReturnValue(mockProcess as any);
    });

    afterEach(() => {
        Object.defineProperty(process, 'platform', {
            value: originalPlatform,
        });
        vi.clearAllMocks();
    });

    describe('create', () => {
        it('should create a sound instance', () => {
            const sound = Sound.create({ silent: false });
            expect(sound).toBeDefined();
            expect(sound.playNotification).toBeDefined();
            expect(sound.isEnabled).toBeDefined();
        });

        it('should create a sound instance in silent mode', () => {
            const sound = Sound.create({ silent: true });
            expect(sound).toBeDefined();
            expect(sound.isEnabled()).toBe(false);
        });
    });

    describe('isEnabled', () => {
        it('should return true when not silent', () => {
            const sound = Sound.create({ silent: false });
            expect(sound.isEnabled()).toBe(true);
        });

        it('should return false when silent', () => {
            const sound = Sound.create({ silent: true });
            expect(sound.isEnabled()).toBe(false);
        });
    });

    describe('playNotification', () => {
        it('should skip notification in silent mode', async () => {
            const sound = Sound.create({ silent: true });
            await expect(sound.playNotification()).resolves.toBeUndefined();
            expect(spawn).not.toHaveBeenCalled();
        });

        it('should play sound on macOS', async () => {
            Object.defineProperty(process, 'platform', {
                value: 'darwin',
            });

            const sound = Sound.create({ silent: false });
            const playPromise = sound.playNotification();

            // Simulate successful spawn
            setTimeout(() => {
                mockProcess.emit('close', 0);
            }, 10);

            await expect(playPromise).resolves.toBeUndefined();
            expect(spawn).toHaveBeenCalledWith('afplay', ['/System/Library/Sounds/Glass.aiff'], expect.any(Object));
        });

        it('should handle afplay error on macOS', async () => {
            Object.defineProperty(process, 'platform', {
                value: 'darwin',
            });

            const sound = Sound.create({ silent: false });
            const playPromise = sound.playNotification();

            // Simulate spawn error
            setTimeout(() => {
                mockProcess.emit('error', new Error('spawn failed'));
            }, 10);

            await expect(playPromise).resolves.toBeUndefined();
        });

        it('should handle afplay close with non-zero code on macOS', async () => {
            Object.defineProperty(process, 'platform', {
                value: 'darwin',
            });

            const sound = Sound.create({ silent: false });
            const playPromise = sound.playNotification();

            // Simulate failed close
            setTimeout(() => {
                mockProcess.emit('close', 1);
            }, 10);

            await expect(playPromise).resolves.toBeUndefined();
        });

        it('should play sound on Windows', async () => {
            Object.defineProperty(process, 'platform', {
                value: 'win32',
            });

            const sound = Sound.create({ silent: false });
            const playPromise = sound.playNotification();

            // Simulate successful spawn
            setTimeout(() => {
                mockProcess.emit('close', 0);
            }, 10);

            await expect(playPromise).resolves.toBeUndefined();
            expect(spawn).toHaveBeenCalledWith(
                'powershell',
                ['-NoProfile', '-NonInteractive', '-Command', '[System.Media.SystemSounds]::Asterisk.Play()'],
                expect.objectContaining({ shell: true })
            );
        });

        it('should handle PowerShell error on Windows', async () => {
            Object.defineProperty(process, 'platform', {
                value: 'win32',
            });

            const sound = Sound.create({ silent: false });
            const playPromise = sound.playNotification();

            // Simulate spawn error
            setTimeout(() => {
                mockProcess.emit('error', new Error('spawn failed'));
            }, 10);

            await expect(playPromise).resolves.toBeUndefined();
        });

        it('should handle PowerShell close with non-zero code on Windows', async () => {
            Object.defineProperty(process, 'platform', {
                value: 'win32',
            });

            const sound = Sound.create({ silent: false });
            const playPromise = sound.playNotification();

            // Simulate failed close
            setTimeout(() => {
                mockProcess.emit('close', 1);
            }, 10);

            await expect(playPromise).resolves.toBeUndefined();
        });

        it('should play terminal bell on Linux', async () => {
            Object.defineProperty(process, 'platform', {
                value: 'linux',
            });

            const stdoutWrite = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);

            const sound = Sound.create({ silent: false });
            await sound.playNotification();

            expect(stdoutWrite).toHaveBeenCalledWith('\x07');
            stdoutWrite.mockRestore();
        });

        it('should play terminal bell on unknown platform', async () => {
            Object.defineProperty(process, 'platform', {
                value: 'freebsd',
            });

            const stdoutWrite = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);

            const sound = Sound.create({ silent: false });
            await sound.playNotification();

            expect(stdoutWrite).toHaveBeenCalledWith('\x07');
            stdoutWrite.mockRestore();
        });

        it('should handle exceptions gracefully', async () => {
            Object.defineProperty(process, 'platform', {
                value: 'darwin',
            });

            vi.mocked(spawn).mockImplementation(() => {
                throw new Error('spawn failed');
            });

            const stdoutWrite = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);

            const sound = Sound.create({ silent: false });
            await expect(sound.playNotification()).resolves.toBeUndefined();

            // Should fall back to terminal bell
            expect(stdoutWrite).toHaveBeenCalledWith('\x07');
            stdoutWrite.mockRestore();
        });

        it('should handle terminal bell failure silently', async () => {
            Object.defineProperty(process, 'platform', {
                value: 'darwin',
            });

            vi.mocked(spawn).mockImplementation(() => {
                throw new Error('spawn failed');
            });

            const stdoutWrite = vi.spyOn(process.stdout, 'write').mockImplementation(() => {
                throw new Error('stdout write failed');
            });

            const sound = Sound.create({ silent: false });
            await expect(sound.playNotification()).resolves.toBeUndefined();

            stdoutWrite.mockRestore();
        });

        it('should unref spawned process on macOS', async () => {
            Object.defineProperty(process, 'platform', {
                value: 'darwin',
            });

            const sound = Sound.create({ silent: false });
            const playPromise = sound.playNotification();

            setTimeout(() => {
                mockProcess.emit('close', 0);
            }, 10);

            await playPromise;

            expect((mockProcess as any).unref).toHaveBeenCalled();
        });

        it('should unref spawned process on Windows', async () => {
            Object.defineProperty(process, 'platform', {
                value: 'win32',
            });

            const sound = Sound.create({ silent: false });
            const playPromise = sound.playNotification();

            setTimeout(() => {
                mockProcess.emit('close', 0);
            }, 10);

            await playPromise;

            expect((mockProcess as any).unref).toHaveBeenCalled();
        });

        it('should use detached mode for spawned processes', async () => {
            Object.defineProperty(process, 'platform', {
                value: 'darwin',
            });

            const sound = Sound.create({ silent: false });
            const playPromise = sound.playNotification();

            setTimeout(() => {
                mockProcess.emit('close', 0);
            }, 10);

            await playPromise;

            expect(spawn).toHaveBeenCalledWith(
                'afplay',
                ['/System/Library/Sounds/Glass.aiff'],
                expect.objectContaining({ detached: true })
            );
        });

        it('should ignore stdio for spawned processes', async () => {
            Object.defineProperty(process, 'platform', {
                value: 'darwin',
            });

            const sound = Sound.create({ silent: false });
            const playPromise = sound.playNotification();

            setTimeout(() => {
                mockProcess.emit('close', 0);
            }, 10);

            await playPromise;

            expect(spawn).toHaveBeenCalledWith(
                'afplay',
                ['/System/Library/Sounds/Glass.aiff'],
                expect.objectContaining({ stdio: 'ignore' })
            );
        });
    });

    describe('platform-specific behavior', () => {
        it('should use Glass.aiff as default sound on macOS', async () => {
            Object.defineProperty(process, 'platform', {
                value: 'darwin',
            });

            const sound = Sound.create({ silent: false });
            const playPromise = sound.playNotification();

            setTimeout(() => {
                mockProcess.emit('close', 0);
            }, 10);

            await playPromise;

            expect(spawn).toHaveBeenCalledWith(
                'afplay',
                expect.arrayContaining(['/System/Library/Sounds/Glass.aiff']),
                expect.any(Object)
            );
        });

        it('should use PowerShell with Asterisk sound on Windows', async () => {
            Object.defineProperty(process, 'platform', {
                value: 'win32',
            });

            const sound = Sound.create({ silent: false });
            const playPromise = sound.playNotification();

            setTimeout(() => {
                mockProcess.emit('close', 0);
            }, 10);

            await playPromise;

            expect(spawn).toHaveBeenCalledWith(
                'powershell',
                expect.arrayContaining(['[System.Media.SystemSounds]::Asterisk.Play()']),
                expect.any(Object)
            );
        });

        it('should use ASCII bell character on Linux', async () => {
            Object.defineProperty(process, 'platform', {
                value: 'linux',
            });

            const stdoutWrite = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);

            const sound = Sound.create({ silent: false });
            await sound.playNotification();

            expect(stdoutWrite).toHaveBeenCalledWith('\x07');
            stdoutWrite.mockRestore();
        });
    });
});
