import { describe, expect, test } from 'vitest';
import {
    ALLOWED_AUDIO_EXTENSIONS,
    ALLOWED_CONTENT_TYPES,
    ALLOWED_OUTPUT_FILENAME_OPTIONS,
    ALLOWED_OUTPUT_STRUCTURES,
    CONTEXT_SUBDIRECTORIES,
    DATE_FORMAT_DAY,
    DATE_FORMAT_HOURS,
    DATE_FORMAT_MILLISECONDS,
    DATE_FORMAT_MINUTES,
    DATE_FORMAT_MONTH,
    DATE_FORMAT_MONTH_DAY,
    DATE_FORMAT_SECONDS,
    DATE_FORMAT_YEAR,
    DATE_FORMAT_YEAR_MONTH,
    DATE_FORMAT_YEAR_MONTH_DAY,
    DATE_FORMAT_YEAR_MONTH_DAY_HOURS_MINUTES,
    DATE_FORMAT_YEAR_MONTH_DAY_HOURS_MINUTES_SECONDS,
    DATE_FORMAT_YEAR_MONTH_DAY_HOURS_MINUTES_SECONDS_MILLISECONDS,
    DATE_FORMAT_YEAR_MONTH_DAY_SLASH,
    DEFAULT_AUDIO_EXTENSIONS,
    DEFAULT_BINARY_TO_TEXT_ENCODING,
    DEFAULT_CHARACTER_ENCODING,
    DEFAULT_CONFIG_DIR,
    DEFAULT_CONTENT_TYPES,
    DEFAULT_DEBUG,
    DEFAULT_DRY_RUN,
    DEFAULT_INPUT_DIRECTORY,
    DEFAULT_INTERACTIVE,
    DEFAULT_LOG,
    DEFAULT_MAX_AUDIO_SIZE,
    DEFAULT_MODEL,
    DEFAULT_OUTPUT_DIRECTORY,
    DEFAULT_OUTPUT_FILENAME_OPTIONS,
    DEFAULT_OUTPUT_STRUCTURE,
    DEFAULT_OVERRIDES,
    DEFAULT_PROCESSED_DIR,
    DEFAULT_RECURSIVE,
    DEFAULT_SELF_REFLECTION,
    DEFAULT_TEMP_DIRECTORY,
    DEFAULT_TIMEZONE,
    DEFAULT_TRANSCRIPTION_MODEL,
    DEFAULT_VERBOSE,
    PROGRAM_NAME,
    PROTOKOLL_DEFAULTS,
    DEFAULT_CONTEXT_DIR_NAME,
    DEFAULT_CONTEXT_CONFIG_FILE_NAME,
    DEFAULT_MAX_DISCOVERY_LEVELS,
    DEFAULT_PERSONAS_DIR,
    DEFAULT_PERSONA_TRANSCRIBER_FILE,
    DEFAULT_INSTRUCTIONS_DIR,
    DEFAULT_INSTRUCTIONS_TRANSCRIBE_FILE,
    OUTPUT_FILE_TYPES,
    DEFAULT_INTERMEDIATE_DIRECTORY,
    DEFAULT_KEEP_INTERMEDIATES,
    DEFAULT_REASONING_LEVEL,
    DEFAULT_DIFF
} from '../src/constants.js';

describe('constants', () => {
    describe('basic string constants', () => {
        test('should have correct program name', () => {
            expect(PROGRAM_NAME).toBe('protokoll');
        });

        test('should have correct encoding constants', () => {
            expect(DEFAULT_CHARACTER_ENCODING).toBe('utf-8');
            expect(DEFAULT_BINARY_TO_TEXT_ENCODING).toBe('base64');
        });

        test('should have correct timezone', () => {
            expect(DEFAULT_TIMEZONE).toBe('Etc/UTC');
        });
    });

    describe('date format constants', () => {
        test('should have correct date format strings', () => {
            expect(DATE_FORMAT_MONTH_DAY).toBe('M-D');
            expect(DATE_FORMAT_YEAR).toBe('YYYY');
            expect(DATE_FORMAT_YEAR_MONTH).toBe('YYYY-M');
            expect(DATE_FORMAT_YEAR_MONTH_DAY).toBe('YYYY-M-D');
            expect(DATE_FORMAT_YEAR_MONTH_DAY_SLASH).toBe('YYYY/M/D');
            expect(DATE_FORMAT_YEAR_MONTH_DAY_HOURS_MINUTES).toBe('YYYY-M-D-HHmm');
            expect(DATE_FORMAT_YEAR_MONTH_DAY_HOURS_MINUTES_SECONDS).toBe('YYYY-M-D-HHmmss');
            expect(DATE_FORMAT_YEAR_MONTH_DAY_HOURS_MINUTES_SECONDS_MILLISECONDS).toBe('YYYY-M-D-HHmmss.SSS');
        });

        test('should have correct granular date formats', () => {
            expect(DATE_FORMAT_MONTH).toBe('M');
            expect(DATE_FORMAT_DAY).toBe('D');
            expect(DATE_FORMAT_HOURS).toBe('HHmm');
            expect(DATE_FORMAT_MINUTES).toBe('mm');
            expect(DATE_FORMAT_SECONDS).toBe('ss');
            expect(DATE_FORMAT_MILLISECONDS).toBe('SSS');
        });
    });

    describe('boolean defaults', () => {
        test('should have correct boolean defaults', () => {
            expect(DEFAULT_VERBOSE).toBe(false);
            expect(DEFAULT_DRY_RUN).toBe(false);
            expect(DEFAULT_DEBUG).toBe(false);
            expect(DEFAULT_LOG).toBe(false);
            expect(DEFAULT_RECURSIVE).toBe(false);
            expect(DEFAULT_DIFF).toBe(true);
            expect(DEFAULT_INTERACTIVE).toBe(true);  // Interactive mode enabled by default
            expect(DEFAULT_SELF_REFLECTION).toBe(true);
            expect(DEFAULT_OVERRIDES).toBe(false);
            expect(DEFAULT_KEEP_INTERMEDIATES).toBe(true);
        });
    });

    describe('directory and path constants', () => {
        test('should have correct directory constants', () => {
            expect(DEFAULT_INPUT_DIRECTORY).toBe('./');
            expect(DEFAULT_OUTPUT_DIRECTORY).toBe('./');
            expect(DEFAULT_CONFIG_DIR).toBe('./.protokoll');
            expect(DEFAULT_PROCESSED_DIR).toBe('./processed');
            expect(DEFAULT_INTERMEDIATE_DIRECTORY).toBe('./output/protokoll');
        });

        test('should have correct context directory constants', () => {
            expect(DEFAULT_CONTEXT_DIR_NAME).toBe('.protokoll');
            expect(DEFAULT_CONTEXT_CONFIG_FILE_NAME).toBe('config.yaml');
            expect(DEFAULT_MAX_DISCOVERY_LEVELS).toBe(10);
        });

        test('should have correct personas and instructions directories', () => {
            expect(DEFAULT_PERSONAS_DIR).toBe(`/personas`);
            expect(DEFAULT_PERSONA_TRANSCRIBER_FILE).toBe(`/personas/transcriber.md`);
            expect(DEFAULT_INSTRUCTIONS_DIR).toBe(`/instructions`);
            expect(DEFAULT_INSTRUCTIONS_TRANSCRIBE_FILE).toBe(`/instructions/transcribe.md`);
        });
    });

    describe('audio extensions', () => {
        test('should have default audio extensions', () => {
            expect(DEFAULT_AUDIO_EXTENSIONS).toEqual(['mp3', 'mp4', 'mpeg', 'mpga', 'm4a', 'wav', 'webm']);
        });

        test('should have allowed audio extensions', () => {
            expect(ALLOWED_AUDIO_EXTENSIONS).toEqual(['mp3', 'mp4', 'mpeg', 'mpga', 'm4a', 'wav', 'webm']);
        });

        test('should have default and allowed extensions match', () => {
            expect(DEFAULT_AUDIO_EXTENSIONS).toEqual(ALLOWED_AUDIO_EXTENSIONS);
        });
    });

    describe('content types', () => {
        test('should have default content types', () => {
            expect(DEFAULT_CONTENT_TYPES).toEqual(['diff']);
        });

        test('should have allowed content types', () => {
            expect(ALLOWED_CONTENT_TYPES).toEqual(['log', 'diff']);
        });
    });

    describe('output structure and filename options', () => {
        test('should have default output structure', () => {
            expect(DEFAULT_OUTPUT_STRUCTURE).toBe('month');
        });

        test('should have allowed output structures', () => {
            expect(ALLOWED_OUTPUT_STRUCTURES).toEqual(['none', 'year', 'month', 'day']);
        });

        test('should have default output filename options', () => {
            expect(DEFAULT_OUTPUT_FILENAME_OPTIONS).toEqual(['date', 'time', 'subject']);
        });

        test('should have allowed output filename options', () => {
            expect(ALLOWED_OUTPUT_FILENAME_OPTIONS).toEqual(['date', 'time', 'subject']);
        });
    });

    describe('model constants', () => {
        test('should have correct model defaults', () => {
            expect(DEFAULT_TRANSCRIPTION_MODEL).toBe('whisper-1');
            expect(DEFAULT_MODEL).toBe('gpt-5.2');
            expect(DEFAULT_REASONING_LEVEL).toBe('medium');
        });
    });

    describe('size and performance constants', () => {
        test('should have correct max audio size', () => {
            expect(DEFAULT_MAX_AUDIO_SIZE).toBe(26214400); // 25MB in bytes
        });

        test('should have correct temp directory', () => {
            expect(DEFAULT_TEMP_DIRECTORY).toBeTruthy();
            expect(typeof DEFAULT_TEMP_DIRECTORY).toBe('string');
        });
    });

    describe('context subdirectories', () => {
        test('should have correct context subdirectory structure', () => {
            expect(CONTEXT_SUBDIRECTORIES).toEqual({
                people: 'people',
                projects: 'projects',
                companies: 'companies',
                terms: 'terms',
            });
        });

        test('should have all required context subdirectories', () => {
            expect(CONTEXT_SUBDIRECTORIES.people).toBe('people');
            expect(CONTEXT_SUBDIRECTORIES.projects).toBe('projects');
            expect(CONTEXT_SUBDIRECTORIES.companies).toBe('companies');
            expect(CONTEXT_SUBDIRECTORIES.terms).toBe('terms');
        });
    });

    describe('output file types', () => {
        test('should have all output file types defined', () => {
            expect(OUTPUT_FILE_TYPES).toContain('transcript');
            expect(OUTPUT_FILE_TYPES).toContain('context');
            expect(OUTPUT_FILE_TYPES).toContain('request');
            expect(OUTPUT_FILE_TYPES).toContain('response');
            expect(OUTPUT_FILE_TYPES).toContain('reflection');
            expect(OUTPUT_FILE_TYPES).toContain('session');
        });

        test('should have exactly 6 output file types', () => {
            expect(OUTPUT_FILE_TYPES).toHaveLength(6);
        });
    });

    describe('protokoll defaults object', () => {
        test('should have complete protokoll defaults', () => {
            expect(PROTOKOLL_DEFAULTS).toHaveProperty('dryRun', DEFAULT_DRY_RUN);
            expect(PROTOKOLL_DEFAULTS).toHaveProperty('verbose', DEFAULT_VERBOSE);
            expect(PROTOKOLL_DEFAULTS).toHaveProperty('debug', DEFAULT_DEBUG);
            expect(PROTOKOLL_DEFAULTS).toHaveProperty('diff', DEFAULT_DIFF);
            expect(PROTOKOLL_DEFAULTS).toHaveProperty('log', DEFAULT_LOG);
            expect(PROTOKOLL_DEFAULTS).toHaveProperty('transcriptionModel', DEFAULT_TRANSCRIPTION_MODEL);
            expect(PROTOKOLL_DEFAULTS).toHaveProperty('model', DEFAULT_MODEL);
            expect(PROTOKOLL_DEFAULTS).toHaveProperty('contentTypes', DEFAULT_CONTENT_TYPES);
            expect(PROTOKOLL_DEFAULTS).toHaveProperty('overrides', DEFAULT_OVERRIDES);
            expect(PROTOKOLL_DEFAULTS).toHaveProperty('maxAudioSize', DEFAULT_MAX_AUDIO_SIZE);
            expect(PROTOKOLL_DEFAULTS).toHaveProperty('configDirectory', DEFAULT_CONFIG_DIR);
            expect(PROTOKOLL_DEFAULTS).toHaveProperty('interactive', DEFAULT_INTERACTIVE);
            expect(PROTOKOLL_DEFAULTS).toHaveProperty('selfReflection', DEFAULT_SELF_REFLECTION);
        });

        test('should have valid temp directory in protokoll defaults', () => {
            expect(PROTOKOLL_DEFAULTS.tempDirectory).toBeTruthy();
            expect(typeof PROTOKOLL_DEFAULTS.tempDirectory).toBe('string');
        });

        test('should ensure temp directory fallback works', () => {
            // This tests the fallback: tempDirectory: DEFAULT_TEMP_DIRECTORY || os.tmpdir()
            expect(PROTOKOLL_DEFAULTS.tempDirectory.length > 0).toBe(true);
        });

        test('should use DEFAULT_TEMP_DIRECTORY when available', () => {
            // Verify that if DEFAULT_TEMP_DIRECTORY exists, it's being used
            expect(PROTOKOLL_DEFAULTS.tempDirectory).toBe(DEFAULT_TEMP_DIRECTORY || require('os').tmpdir());
        });
    });
});
