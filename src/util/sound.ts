/**
 * Sound Notification Utility
 * 
 * Plays system sounds to notify the user when interactive input is needed.
 * Similar to Cursor's notification behavior.
 * 
 * Platform support:
 * - macOS: Uses afplay with system sounds (Glass.aiff)
 * - Windows: Uses PowerShell to play system notification sound
 * - Linux/Other: Falls back to terminal bell
 */

import { spawn } from 'child_process';
import * as Logging from '../logging';

export interface SoundConfig {
    /** Whether sounds are disabled (silent mode) */
    silent: boolean;
}

export interface SoundInstance {
    /** Play a notification sound to get user's attention */
    playNotification(): Promise<void>;
    /** Check if sounds are enabled */
    isEnabled(): boolean;
}

// macOS system sounds that work well for notifications
const MACOS_NOTIFICATION_SOUNDS = [
    '/System/Library/Sounds/Glass.aiff',
    '/System/Library/Sounds/Ping.aiff', 
    '/System/Library/Sounds/Pop.aiff',
    '/System/Library/Sounds/Tink.aiff',
];

// Default sound to use (Glass is similar to Cursor's notification)
const DEFAULT_MACOS_SOUND = MACOS_NOTIFICATION_SOUNDS[0];

/**
 * Play a sound file using afplay (macOS)
 */
const playWithAfplay = (soundPath: string): Promise<boolean> => {
    return new Promise((resolve) => {
        const afplay = spawn('afplay', [soundPath], {
            stdio: 'ignore',
            detached: true,
        });

        afplay.on('error', () => {
            resolve(false);
        });

        afplay.on('close', (code) => {
            resolve(code === 0);
        });

        // Don't wait for the sound to finish - just fire and forget
        afplay.unref();
        
        // Consider it successful if spawn didn't throw
        setTimeout(() => resolve(true), 50);
    });
};

/**
 * Play Windows system notification sound using PowerShell
 * Uses SystemSounds.Asterisk which is a pleasant notification tone
 */
const playWithPowerShell = (): Promise<boolean> => {
    return new Promise((resolve) => {
        // Use PowerShell to access .NET System.Media.SystemSounds
        // Asterisk is a pleasant notification sound, similar to macOS Glass
        const ps = spawn('powershell', [
            '-NoProfile',
            '-NonInteractive', 
            '-Command',
            '[System.Media.SystemSounds]::Asterisk.Play()'
        ], {
            stdio: 'ignore',
            detached: true,
            // On Windows, use shell to ensure PowerShell is found
            shell: true,
        });

        ps.on('error', () => {
            resolve(false);
        });

        ps.on('close', (code) => {
            resolve(code === 0);
        });

        ps.unref();
        
        // Consider it successful if spawn didn't throw
        setTimeout(() => resolve(true), 50);
    });
};

/**
 * Play terminal bell as fallback for Linux and other platforms
 */
const playTerminalBell = (): void => {
    // Write ASCII bell character to stdout
    process.stdout.write('\x07');
};

export const create = (config: SoundConfig): SoundInstance => {
    const logger = Logging.getLogger();
    
    const playNotification = async (): Promise<void> => {
        if (config.silent) {
            logger.debug('Sound notification skipped (silent mode)');
            return;
        }

        try {
            // macOS: use afplay with system sounds
            if (process.platform === 'darwin') {
                const success = await playWithAfplay(DEFAULT_MACOS_SOUND);
                if (success) {
                    logger.debug('Played notification sound: %s', DEFAULT_MACOS_SOUND);
                    return;
                }
            }
            
            // Windows: use PowerShell to play system sound
            if (process.platform === 'win32') {
                const success = await playWithPowerShell();
                if (success) {
                    logger.debug('Played Windows notification sound via PowerShell');
                    return;
                }
            }
            
            // Linux and others: fall back to terminal bell
            playTerminalBell();
            logger.debug('Played terminal bell notification');
        } catch (error) {
            // Sound failures should never interrupt the workflow
            logger.debug('Failed to play notification sound: %s', error);
            // Try terminal bell as last resort
            try {
                playTerminalBell();
            } catch {
                // Silently ignore - sound is not critical
            }
        }
    };

    const isEnabled = (): boolean => !config.silent;

    return {
        playNotification,
        isEnabled,
    };
};

