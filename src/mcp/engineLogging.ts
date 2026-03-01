import { access } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import Logging from '@fjell/logging';

const logger = Logging.getLogger('@redaksjon/protokoll-mcp').get('engine-logging');
let configured = false;

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

/**
 * Route @redaksjon/protokoll-engine's internal winston logger through fjell/logging.
 * This prevents raw `info: ...` console lines and keeps a single structured log format.
 */
export async function configureEngineLoggingBridge(): Promise<void> {
    if (configured) {
        return;
    }

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
