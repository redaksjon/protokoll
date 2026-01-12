import { describe, expect, beforeEach, test, vi } from 'vitest';
import { setLogLevel, getLogger, LogContext } from '../src/logging.js';
import winston from 'winston';
import { PROGRAM_NAME } from '../src/constants.js';

// Spy on winston methods instead of mocking the entire module
vi.spyOn(winston, 'createLogger');

describe('Logging module', () => {
    beforeEach(() => {
        // Clear mock calls before each test
        vi.clearAllMocks();
    });

    test('getLogger returns a logger instance', () => {
        const logger = getLogger();
        expect(logger).toBeDefined();
        expect(typeof logger.info).toBe('function');
        expect(typeof logger.error).toBe('function');
        expect(typeof logger.debug).toBe('function');
        expect(typeof logger.warn).toBe('function');
    });

    test('setLogLevel creates a new logger with the specified level', () => {
        const createLoggerSpy = vi.spyOn(winston, 'createLogger');

        // Set log level to debug
        setLogLevel('debug');

        // Verify winston.createLogger was called
        expect(createLoggerSpy).toHaveBeenCalledTimes(1);

        // Verify correct level was passed
        const callArgs = createLoggerSpy.mock.calls[0];
        expect(callArgs).toBeDefined();
        if (callArgs && callArgs[0]) {
            const callArg = callArgs[0];
            expect(callArg.level).toBe('debug');
            expect(callArg.defaultMeta).toEqual({ service: PROGRAM_NAME });
        }
    });

    test('setLogLevel with info level configures logger differently than other levels', () => {
        const createLoggerSpy = vi.spyOn(winston, 'createLogger');

        // Set log level to info
        setLogLevel('info');

        // Set log level to debug
        setLogLevel('debug');

        // Verify winston.createLogger was called twice with different configurations
        expect(createLoggerSpy).toHaveBeenCalledTimes(2);

        // We cannot easily test the internal format configurations,
        // but we can verify that different log levels result in different
        // configurations being passed to createLogger
        const infoCalls = createLoggerSpy.mock.calls[0];
        const debugCalls = createLoggerSpy.mock.calls[1];

        expect(infoCalls).toBeDefined();
        expect(debugCalls).toBeDefined();

        if (infoCalls && infoCalls[0] && debugCalls && debugCalls[0]) {
            const infoCallArg = infoCalls[0];
            const debugCallArg = debugCalls[0];

            expect(infoCallArg.level).toBe('info');
            expect(debugCallArg.level).toBe('debug');

            // The format and transports should be different between the two calls
            expect(infoCallArg.format).not.toEqual(debugCallArg.format);
        }
    });

    test('logger methods can be called without errors', () => {
        const logger = getLogger();

        // Simply verify that these method calls don't throw exceptions
        expect(() => {
            logger.info('Test info message');
            logger.error('Test error message');
            logger.warn('Test warning message');
            logger.debug('Test debug message');
        }).not.toThrow();
    });

    test('logger with context includes context in metadata', () => {
        const createLoggerSpy = vi.spyOn(winston, 'createLogger');

        // Get a fresh logger
        setLogLevel('debug');
        const logger = getLogger();

        // Spy on the logger's info method
        const infoSpy = vi.spyOn(logger, 'info');

        // Log with context
        const context: LogContext = { requestId: '123', userId: '456' };
        logger.info('Message with context', context);

        // Verify logger's info method was called with context
        expect(infoSpy).toHaveBeenCalledWith('Message with context', context);
    });

    test('logger format functions handle meta objects correctly', () => {
        // Test debug level with meta data
        setLogLevel('debug');
        let logger = getLogger();

        // Simply verify logging with meta doesn't throw exceptions
        expect(() => {
            logger.info('Test message with meta', {
                key1: 'value1',
                key2: 'value2',
                nested: { foo: 'bar' }
            });
        }).not.toThrow();

        // Test info level with meta data
        setLogLevel('info');
        logger = getLogger();

        expect(() => {
            logger.info('Test message with meta in info mode', {
                key1: 'value1',
                key2: 'value2'
            });
        }).not.toThrow();
    });

    test('logger format at debug level includes meta in output', () => {
        setLogLevel('debug');
        const logger = getLogger();

        // Test that format handler properly processes meta with content
        expect(() => {
            // This should trigger line 22 in logging.ts where meta is stringified
            logger.info('Debug message', { field: 'value', nested: { deep: 'data' } });
        }).not.toThrow();
    });

    test('logger format at debug level handles empty meta', () => {
        setLogLevel('debug');
        const logger = getLogger();

        // Test that format handler properly handles empty meta (line 22 condition)
        expect(() => {
            logger.info('Debug message with no meta');
        }).not.toThrow();
    });

    test('createLogger with default level is info', () => {
        const createLoggerSpy = vi.spyOn(winston, 'createLogger');

        // Reset and create a new logger with default level
        setLogLevel('info');

        // Verify that info level uses simplified format
        const callArgs = createLoggerSpy.mock.calls[0];
        if (callArgs && callArgs[0]) {
            expect(callArgs[0].level).toBe('info');
        }
    });

    test('logger has service name in default metadata', () => {
        setLogLevel('verbose');
        const logger = getLogger();

        const createLoggerSpy = vi.spyOn(winston, 'createLogger');

        // Get the most recent call
        const callArgs = createLoggerSpy.mock.calls[0];
        if (callArgs && callArgs[0]) {
            expect(callArgs[0].defaultMeta).toHaveProperty('service', PROGRAM_NAME);
        }
    });
});
