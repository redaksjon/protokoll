import { access } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import Logging from '@fjell/logging';

const logger = Logging.getLogger('@redaksjon/protokoll-mcp').get('engine-logging');
let configured = false;
let stdioBridgeInstalled = false;

function coerceMessage(args: unknown[]): string {
    return args
        .map((value) => {
            if (typeof value === 'string') {
                return value;
            }
            if (value instanceof Error) {
                return value.message;
            }
            try {
                return JSON.stringify(value);
            } catch {
                return String(value);
            }
        })
        .join(' ')
        .trim();
}

function stripAnsi(input: string): string {
    return input.split(String.fromCharCode(27)).join('');
}

function installStdIoBridge(): void {
    if (stdioBridgeInstalled) {
        return;
    }
    stdioBridgeInstalled = true;

    const engineLog = Logging.getLogger('@redaksjon/protokoll-mcp').get('engine');
    const originalStdoutWrite = process.stdout.write.bind(process.stdout);
    const originalStderrWrite = process.stderr.write.bind(process.stderr);

    let inBridgeWrite = false;
    let stdoutBuffer = '';
    let stderrBuffer = '';

    const flushBuffer = (
        buffer: string,
        writeOriginal: (chunk: string) => void,
    ): string => {
        let working = buffer;
        while (true) {
            const newlineIndex = working.indexOf('\n');
            if (newlineIndex < 0) {
                break;
            }
            const line = working.slice(0, newlineIndex).replace(/\r$/, '');
            working = working.slice(newlineIndex + 1);

            const normalized = stripAnsi(line).trim();
            const match = normalized.match(/^(info|debug|warn|warning|error):\s*(.*)$/i);
            if (match) {
                const rawLevel = match[1].toLowerCase();
                const message = match[2] || '';
                inBridgeWrite = true;
                try {
                    if (rawLevel === 'error') {
                        engineLog.error('engine.message', { message });
                    } else if (rawLevel === 'warn' || rawLevel === 'warning') {
                        engineLog.warning('engine.message', { message });
                    } else if (rawLevel === 'debug') {
                        engineLog.debug('engine.message', { message });
                    } else {
                        engineLog.info('engine.message', { message });
                    }
                } finally {
                    inBridgeWrite = false;
                }
                continue;
            }

            writeOriginal(`${line}\n`);
        }
        return working;
    };

    (process.stdout.write as unknown) = ((chunk: any, encoding?: BufferEncoding, cb?: (error?: Error | null) => void) => {
        if (inBridgeWrite) {
            return originalStdoutWrite(chunk, encoding as any, cb as any);
        }
        const text = typeof chunk === 'string' ? chunk : chunk?.toString(encoding || 'utf8');
        if (!text) {
            return originalStdoutWrite(chunk, encoding as any, cb as any);
        }
        stdoutBuffer += text;
        stdoutBuffer = flushBuffer(stdoutBuffer, (value) => {
            originalStdoutWrite(value);
        });
        if (typeof cb === 'function') cb(null);
        return true;
    }) as typeof process.stdout.write;

    (process.stderr.write as unknown) = ((chunk: any, encoding?: BufferEncoding, cb?: (error?: Error | null) => void) => {
        if (inBridgeWrite) {
            return originalStderrWrite(chunk, encoding as any, cb as any);
        }
        const text = typeof chunk === 'string' ? chunk : chunk?.toString(encoding || 'utf8');
        if (!text) {
            return originalStderrWrite(chunk, encoding as any, cb as any);
        }
        stderrBuffer += text;
        stderrBuffer = flushBuffer(stderrBuffer, (value) => {
            originalStderrWrite(value);
        });
        if (typeof cb === 'function') cb(null);
        return true;
    }) as typeof process.stderr.write;

    logger.info('bridge.stdio_installed');
}

/**
 * Route @redaksjon/protokoll-engine's internal winston logger through fjell/logging.
 * This prevents raw `info: ...` console lines and keeps a single structured log format.
 */
export async function configureEngineLoggingBridge(): Promise<void> {
    if (configured) {
        return;
    }

    installStdIoBridge();

    try {
        const candidates = new Set<string>();
        try {
            const resolvedEntryUrl = import.meta.resolve('@redaksjon/protokoll-engine');
            const resolvedEntryPath = fileURLToPath(resolvedEntryUrl);
            candidates.add(join(dirname(resolvedEntryPath), 'index47.js'));
        } catch {
            // fall through to additional discovery strategies
        }
        candidates.add(join(process.cwd(), 'node_modules', '@redaksjon', 'protokoll-engine', 'dist', 'index47.js'));

        let engineLoggerModulePath: string | null = null;
        for (const candidate of candidates) {
            try {
                await access(candidate);
                engineLoggerModulePath = candidate;
                break;
            } catch {
                // keep scanning candidates
            }
        }
        if (!engineLoggerModulePath) {
            logger.warning('bridge.unavailable', { reason: 'logger_module_not_found' });
            configured = true;
            return;
        }

        const engineLoggerModule = await import(pathToFileURL(engineLoggerModulePath).href) as {
            getLogger?: () => Record<string, any>;
        };

        const engineLogger = engineLoggerModule.getLogger?.();
        if (!engineLogger) {
            logger.warning('bridge.unavailable', { reason: 'missing_getLogger' });
            configured = true;
            return;
        }

        if (engineLogger.__protokollBridgeInstalled === true) {
            configured = true;
            return;
        }

        const engineLog = Logging.getLogger('@redaksjon/protokoll-mcp').get('engine');
        engineLogger.info = (...args: unknown[]) => {
            engineLog.info('engine.message', { message: coerceMessage(args) });
        };
        engineLogger.debug = (...args: unknown[]) => {
            engineLog.debug('engine.message', { message: coerceMessage(args) });
        };
        engineLogger.warn = (...args: unknown[]) => {
            engineLog.warning('engine.message', { message: coerceMessage(args) });
        };
        engineLogger.error = (...args: unknown[]) => {
            engineLog.error('engine.message', { message: coerceMessage(args) });
        };

        engineLogger.__protokollBridgeInstalled = true;
        configured = true;
        logger.info('bridge.installed');
    } catch (error) {
        configured = true;
        logger.warning('bridge.install_failed', {
            error: error instanceof Error ? error.message : String(error),
        });
    }
}
