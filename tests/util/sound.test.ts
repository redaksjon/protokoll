import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as childProcess from 'child_process';
import * as Sound from '../../src/util/sound';

// Mock child_process
vi.mock('child_process', () => ({
    spawn: vi.fn(),
}));

// Mock logging
vi.mock('../../src/logging', () => ({
    getLogger: vi.fn(() => ({
        debug: vi.fn(),
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
    })),
}));

describe('Sound Utility', () => {
    const mockSpawn = vi.mocked(childProcess.spawn);
    let originalPlatform: PropertyDescriptor | undefined;
    let stdoutWriteSpy: ReturnType<typeof vi.spyOn>;

    beforeEach(() => {
        vi.clearAllMocks();
        
        // Store original platform
        originalPlatform = Object.getOwnPropertyDescriptor(process, 'platform');
        
        // Mock stdout.write for terminal bell testing
        stdoutWriteSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    });

    afterEach(() => {
        // Restore platform
        if (originalPlatform) {
            Object.defineProperty(process, 'platform', originalPlatform);
        }
        stdoutWriteSpy.mockRestore();
    });

    describe('create', () => {
        it('should create a sound instance', () => {
            const sound = Sound.create({ silent: false });
            
            expect(sound).toBeDefined();
            expect(sound.playNotification).toBeDefined();
            expect(sound.isEnabled).toBeDefined();
        });

        it('should report enabled when not silent', () => {
            const sound = Sound.create({ silent: false });
            expect(sound.isEnabled()).toBe(true);
        });

        it('should report disabled when silent', () => {
            const sound = Sound.create({ silent: true });
            expect(sound.isEnabled()).toBe(false);
        });
    });

    describe('playNotification', () => {
        it('should not play sound when silent mode is enabled', async () => {
            const sound = Sound.create({ silent: true });
            
            await sound.playNotification();
            
            expect(mockSpawn).not.toHaveBeenCalled();
            expect(stdoutWriteSpy).not.toHaveBeenCalled();
        });

        it('should use afplay on macOS', async () => {
            // Mock as darwin
            Object.defineProperty(process, 'platform', { value: 'darwin', configurable: true });
            
            // Mock successful spawn
            const mockProcess = {
                on: vi.fn((event: string, callback: (arg?: any) => void) => {
                    if (event === 'close') {
                        setTimeout(() => callback(0), 10);
                    }
                }),
                unref: vi.fn(),
            };
            mockSpawn.mockReturnValue(mockProcess as any);
            
            const sound = Sound.create({ silent: false });
            await sound.playNotification();
            
            expect(mockSpawn).toHaveBeenCalledWith(
                'afplay',
                ['/System/Library/Sounds/Glass.aiff'],
                expect.any(Object)
            );
        });

        it('should use PowerShell on Windows', async () => {
            // Mock as win32
            Object.defineProperty(process, 'platform', { value: 'win32', configurable: true });
            
            // Mock successful spawn
            const mockProcess = {
                on: vi.fn((event: string, callback: (arg?: any) => void) => {
                    if (event === 'close') {
                        setTimeout(() => callback(0), 10);
                    }
                }),
                unref: vi.fn(),
            };
            mockSpawn.mockReturnValue(mockProcess as any);
            
            const sound = Sound.create({ silent: false });
            await sound.playNotification();
            
            expect(mockSpawn).toHaveBeenCalledWith(
                'powershell',
                expect.arrayContaining(['-Command', '[System.Media.SystemSounds]::Asterisk.Play()']),
                expect.any(Object)
            );
        });

        it('should fall back to terminal bell on Linux', async () => {
            // Mock as linux
            Object.defineProperty(process, 'platform', { value: 'linux', configurable: true });
            
            const sound = Sound.create({ silent: false });
            await sound.playNotification();
            
            expect(mockSpawn).not.toHaveBeenCalled();
            expect(stdoutWriteSpy).toHaveBeenCalledWith('\x07');
        });

        it('should fall back to terminal bell if PowerShell fails on Windows', async () => {
            // Mock as win32
            Object.defineProperty(process, 'platform', { value: 'win32', configurable: true });
            
            // Mock failed spawn (error event)
            const mockProcess = {
                on: vi.fn((event: string, callback: (arg?: any) => void) => {
                    if (event === 'error') {
                        setTimeout(() => callback(new Error('spawn failed')), 5);
                    }
                }),
                unref: vi.fn(),
            };
            mockSpawn.mockReturnValue(mockProcess as any);
            
            const sound = Sound.create({ silent: false });
            await sound.playNotification();
            
            // Should have tried PowerShell
            expect(mockSpawn).toHaveBeenCalled();
            
            // And fallen back to terminal bell
            expect(stdoutWriteSpy).toHaveBeenCalledWith('\x07');
        });

        it('should fall back to terminal bell if afplay fails', async () => {
            // Mock as darwin
            Object.defineProperty(process, 'platform', { value: 'darwin', configurable: true });
            
            // Mock failed spawn (error event)
            const mockProcess = {
                on: vi.fn((event: string, callback: (arg?: any) => void) => {
                    if (event === 'error') {
                        setTimeout(() => callback(new Error('spawn failed')), 5);
                    }
                }),
                unref: vi.fn(),
            };
            mockSpawn.mockReturnValue(mockProcess as any);
            
            const sound = Sound.create({ silent: false });
            await sound.playNotification();
            
            // Should have tried afplay
            expect(mockSpawn).toHaveBeenCalled();
            
            // And fallen back to terminal bell
            expect(stdoutWriteSpy).toHaveBeenCalledWith('\x07');
        });

        it('should fall back to terminal bell if afplay exits with non-zero code', async () => {
            // Mock as darwin
            Object.defineProperty(process, 'platform', { value: 'darwin', configurable: true });
            
            // Mock spawn that exits with error code
            const mockProcess = {
                on: vi.fn((event: string, callback: (arg?: any) => void) => {
                    if (event === 'close') {
                        setTimeout(() => callback(1), 5); // Non-zero exit code
                    }
                }),
                unref: vi.fn(),
            };
            mockSpawn.mockReturnValue(mockProcess as any);
            
            const sound = Sound.create({ silent: false });
            await sound.playNotification();
            
            // Should have tried afplay
            expect(mockSpawn).toHaveBeenCalled();
            
            // And fallen back to terminal bell
            expect(stdoutWriteSpy).toHaveBeenCalledWith('\x07');
        });

        it('should fall back to terminal bell if PowerShell exits with non-zero code', async () => {
            // Mock as win32
            Object.defineProperty(process, 'platform', { value: 'win32', configurable: true });
            
            // Mock spawn that exits with error code
            const mockProcess = {
                on: vi.fn((event: string, callback: (arg?: any) => void) => {
                    if (event === 'close') {
                        setTimeout(() => callback(1), 5); // Non-zero exit code
                    }
                }),
                unref: vi.fn(),
            };
            mockSpawn.mockReturnValue(mockProcess as any);
            
            const sound = Sound.create({ silent: false });
            await sound.playNotification();
            
            // Should have tried PowerShell
            expect(mockSpawn).toHaveBeenCalled();
            
            // And fallen back to terminal bell
            expect(stdoutWriteSpy).toHaveBeenCalledWith('\x07');
        });

        it('should handle exceptions gracefully and try terminal bell', async () => {
            // Mock as darwin
            Object.defineProperty(process, 'platform', { value: 'darwin', configurable: true });
            
            // Mock spawn to throw an exception
            mockSpawn.mockImplementation(() => {
                throw new Error('spawn completely failed');
            });
            
            const sound = Sound.create({ silent: false });
            
            // Should not throw
            await expect(sound.playNotification()).resolves.toBeUndefined();
            
            // Should have attempted terminal bell as fallback
            expect(stdoutWriteSpy).toHaveBeenCalledWith('\x07');
        });

        it('should silently handle terminal bell failures', async () => {
            // Mock as linux (goes straight to terminal bell)
            Object.defineProperty(process, 'platform', { value: 'linux', configurable: true });
            
            // Make terminal bell throw
            stdoutWriteSpy.mockImplementation(() => {
                throw new Error('stdout write failed');
            });
            
            const sound = Sound.create({ silent: false });
            
            // Should not throw even if terminal bell fails
            await expect(sound.playNotification()).resolves.toBeUndefined();
        });

        it('should pass correct spawn options for macOS afplay', async () => {
            Object.defineProperty(process, 'platform', { value: 'darwin', configurable: true });
            
            const mockProcess = {
                on: vi.fn((event: string, callback: (arg?: any) => void) => {
                    if (event === 'close') {
                        setTimeout(() => callback(0), 10);
                    }
                }),
                unref: vi.fn(),
            };
            mockSpawn.mockReturnValue(mockProcess as any);
            
            const sound = Sound.create({ silent: false });
            await sound.playNotification();
            
            expect(mockSpawn).toHaveBeenCalledWith(
                'afplay',
                ['/System/Library/Sounds/Glass.aiff'],
                {
                    stdio: 'ignore',
                    detached: true,
                }
            );
            expect(mockProcess.unref).toHaveBeenCalled();
        });

        it('should pass correct spawn options for Windows PowerShell', async () => {
            Object.defineProperty(process, 'platform', { value: 'win32', configurable: true });
            
            const mockProcess = {
                on: vi.fn((event: string, callback: (arg?: any) => void) => {
                    if (event === 'close') {
                        setTimeout(() => callback(0), 10);
                    }
                }),
                unref: vi.fn(),
            };
            mockSpawn.mockReturnValue(mockProcess as any);
            
            const sound = Sound.create({ silent: false });
            await sound.playNotification();
            
            expect(mockSpawn).toHaveBeenCalledWith(
                'powershell',
                ['-NoProfile', '-NonInteractive', '-Command', '[System.Media.SystemSounds]::Asterisk.Play()'],
                {
                    stdio: 'ignore',
                    detached: true,
                    shell: true,
                }
            );
            expect(mockProcess.unref).toHaveBeenCalled();
        });

        it('should work on FreeBSD (other Unix-like) with terminal bell', async () => {
            Object.defineProperty(process, 'platform', { value: 'freebsd', configurable: true });
            
            const sound = Sound.create({ silent: false });
            await sound.playNotification();
            
            expect(mockSpawn).not.toHaveBeenCalled();
            expect(stdoutWriteSpy).toHaveBeenCalledWith('\x07');
        });
    });

    describe('isEnabled', () => {
        it('should return true when silent is false', () => {
            const sound = Sound.create({ silent: false });
            expect(sound.isEnabled()).toBe(true);
        });

        it('should return false when silent is true', () => {
            const sound = Sound.create({ silent: true });
            expect(sound.isEnabled()).toBe(false);
        });
    });
});

