/**
 * Tests for Constants Module
 */

import { describe, it, expect } from 'vitest';
import * as Constants from '../src/constants';
import { FilesystemStructure } from '@utilarium/dreadcabinet';

describe('Constants', () => {
    describe('Version Info', () => {
        it('should define version constant', () => {
            expect(Constants.VERSION).toBeDefined();
            expect(typeof Constants.VERSION).toBe('string');
        });

        it('should define program name', () => {
            expect(Constants.PROGRAM_NAME).toBe('protokoll');
        });
    });

    describe('Encoding Defaults', () => {
        it('should define character encoding', () => {
            expect(Constants.DEFAULT_CHARACTER_ENCODING).toBe('utf-8');
        });

        it('should define binary to text encoding', () => {
            expect(Constants.DEFAULT_BINARY_TO_TEXT_ENCODING).toBe('base64');
        });
    });

    describe('Common Defaults', () => {
        it('should define boolean defaults', () => {
            expect(Constants.DEFAULT_DIFF).toBe(true);
            expect(Constants.DEFAULT_LOG).toBe(false);
            expect(Constants.DEFAULT_VERBOSE).toBe(false);
            expect(Constants.DEFAULT_DRY_RUN).toBe(false);
            expect(Constants.DEFAULT_DEBUG).toBe(false);
        });

        it('should define timezone', () => {
            expect(Constants.DEFAULT_TIMEZONE).toBe('Etc/UTC');
        });

        it('should define directories', () => {
            expect(Constants.DEFAULT_INPUT_DIRECTORY).toBe('./');
            expect(Constants.DEFAULT_OUTPUT_DIRECTORY).toBe('./');
        });
    });

    describe('Date Formats', () => {
        it('should define all date format constants', () => {
            expect(Constants.DATE_FORMAT_MONTH_DAY).toBe('M-D');
            expect(Constants.DATE_FORMAT_YEAR).toBe('YYYY');
            expect(Constants.DATE_FORMAT_YEAR_MONTH).toBe('YYYY-M');
            expect(Constants.DATE_FORMAT_YEAR_MONTH_DAY).toBe('YYYY-M-D');
        });

        it('should have detailed timestamp formats', () => {
            expect(Constants.DATE_FORMAT_YEAR_MONTH_DAY_HOURS_MINUTES).toBeDefined();
            expect(Constants.DATE_FORMAT_YEAR_MONTH_DAY_HOURS_MINUTES_SECONDS).toBeDefined();
            expect(Constants.DATE_FORMAT_YEAR_MONTH_DAY_HOURS_MINUTES_SECONDS_MILLISECONDS).toBeDefined();
        });

        it('should have individual component formats', () => {
            expect(Constants.DATE_FORMAT_MONTH).toBe('M');
            expect(Constants.DATE_FORMAT_DAY).toBe('D');
            expect(Constants.DATE_FORMAT_HOURS).toBe('HHmm');
            expect(Constants.DATE_FORMAT_MINUTES).toBe('mm');
            expect(Constants.DATE_FORMAT_SECONDS).toBe('ss');
            expect(Constants.DATE_FORMAT_MILLISECONDS).toBe('SSS');
        });
    });

    describe('Audio Extensions', () => {
        it('should define default audio extensions', () => {
            const extensions = Constants.DEFAULT_AUDIO_EXTENSIONS;
            expect(extensions).toContain('mp3');
            expect(extensions).toContain('m4a');
            expect(extensions).toContain('wav');
            expect(extensions).toContain('webm');
        });

        it('should define allowed audio extensions', () => {
            expect(Constants.ALLOWED_AUDIO_EXTENSIONS).toEqual(Constants.DEFAULT_AUDIO_EXTENSIONS);
        });
    });

    describe('Content Types', () => {
        it('should define default content types', () => {
            expect(Constants.DEFAULT_CONTENT_TYPES).toContain('diff');
        });

        it('should define allowed content types', () => {
            expect(Constants.ALLOWED_CONTENT_TYPES).toContain('log');
            expect(Constants.ALLOWED_CONTENT_TYPES).toContain('diff');
        });
    });

    describe('Output Configuration', () => {
        it('should define output structure', () => {
            expect(Constants.DEFAULT_OUTPUT_STRUCTURE).toBe('month' as FilesystemStructure);
        });

        it('should define output filename options', () => {
            expect(Constants.DEFAULT_OUTPUT_FILENAME_OPTIONS).toContain('date');
            expect(Constants.DEFAULT_OUTPUT_FILENAME_OPTIONS).toContain('time');
            expect(Constants.DEFAULT_OUTPUT_FILENAME_OPTIONS).toContain('subject');
        });

        it('should define allowed structures', () => {
            const structures = Constants.ALLOWED_OUTPUT_STRUCTURES;
            expect(structures).toContain('none');
            expect(structures).toContain('year');
            expect(structures).toContain('month');
            expect(structures).toContain('day');
        });

        it('should define allowed filename options', () => {
            expect(Constants.ALLOWED_OUTPUT_FILENAME_OPTIONS).toContain('date');
            expect(Constants.ALLOWED_OUTPUT_FILENAME_OPTIONS).toContain('time');
            expect(Constants.ALLOWED_OUTPUT_FILENAME_OPTIONS).toContain('subject');
        });
    });

    describe('Configuration Directories', () => {
        it('should define config directory', () => {
            expect(Constants.DEFAULT_CONFIG_DIR).toBe('./.protokoll');
        });

        it('should define processed directory', () => {
            expect(Constants.DEFAULT_PROCESSED_DIR).toBe('./processed');
        });
    });

    describe('Context System', () => {
        it('should define context directory name', () => {
            expect(Constants.DEFAULT_CONTEXT_DIR_NAME).toBe('.protokoll');
        });

        it('should define context config file name', () => {
            expect(Constants.DEFAULT_CONTEXT_CONFIG_FILE_NAME).toBe('config.yaml');
        });

        it('should define max discovery levels', () => {
            expect(Constants.DEFAULT_MAX_DISCOVERY_LEVELS).toBe(10);
        });

        it('should define context subdirectories', () => {
            expect(Constants.CONTEXT_SUBDIRECTORIES.people).toBe('people');
            expect(Constants.CONTEXT_SUBDIRECTORIES.projects).toBe('projects');
            expect(Constants.CONTEXT_SUBDIRECTORIES.companies).toBe('companies');
            expect(Constants.CONTEXT_SUBDIRECTORIES.terms).toBe('terms');
        });
    });

    describe('Personas and Instructions', () => {
        it('should define personas directory', () => {
            expect(Constants.DEFAULT_PERSONAS_DIR).toBe('/personas');
        });

        it('should define persona transcriber file', () => {
            expect(Constants.DEFAULT_PERSONA_TRANSCRIBER_FILE).toContain('transcriber.md');
        });

        it('should define instructions directory', () => {
            expect(Constants.DEFAULT_INSTRUCTIONS_DIR).toBe('/instructions');
        });

        it('should define transcribe instructions file', () => {
            expect(Constants.DEFAULT_INSTRUCTIONS_TRANSCRIBE_FILE).toContain('transcribe.md');
        });
    });

    describe('Model Configuration', () => {
        it('should define transcription model', () => {
            expect(Constants.DEFAULT_TRANSCRIPTION_MODEL).toBe('whisper-1');
        });

        it('should define default model', () => {
            expect(Constants.DEFAULT_MODEL).toBe('gpt-5.2');
        });

        it('should define reasoning level', () => {
            expect(Constants.DEFAULT_REASONING_LEVEL).toBe('medium');
        });
    });

    describe('Smart Assistance', () => {
        it('should enable smart assistance by default', () => {
            expect(Constants.DEFAULT_SMART_ASSISTANCE).toBe(true);
        });

        it('should define phonetic model', () => {
            expect(Constants.DEFAULT_PHONETIC_MODEL).toBe('gpt-5-nano');
        });

        it('should define analysis model', () => {
            expect(Constants.DEFAULT_ANALYSIS_MODEL).toBe('gpt-5-mini');
        });

        it('should enable project assistance by default', () => {
            expect(Constants.DEFAULT_SOUNDS_LIKE_ON_ADD).toBe(true);
            expect(Constants.DEFAULT_TRIGGER_PHRASES_ON_ADD).toBe(true);
            expect(Constants.DEFAULT_PROMPT_FOR_SOURCE).toBe(true);
        });

        it('should enable term assistance by default', () => {
            expect(Constants.DEFAULT_TERMS_ENABLED).toBe(true);
            expect(Constants.DEFAULT_TERM_SOUNDS_LIKE_ON_ADD).toBe(true);
            expect(Constants.DEFAULT_TERM_DESCRIPTION_ON_ADD).toBe(true);
            expect(Constants.DEFAULT_TERM_TOPICS_ON_ADD).toBe(true);
            expect(Constants.DEFAULT_TERM_PROJECT_SUGGESTIONS).toBe(true);
        });
    });

    describe('Content Limits', () => {
        it('should define content length limits', () => {
            expect(Constants.MAX_CONTENT_LENGTH).toBe(15000);
            expect(Constants.MAX_TERM_CONTEXT_LENGTH).toBe(10000);
        });

        it('should define timeout values', () => {
            expect(Constants.ASSIST_TIMEOUT_MS).toBe(30000);
            expect(Constants.TERM_ASSIST_TIMEOUT_MS).toBe(20000);
        });
    });

    describe('Miscellaneous Defaults', () => {
        it('should define overrides default', () => {
            expect(Constants.DEFAULT_OVERRIDES).toBe(false);
        });

        it('should define max audio size', () => {
            expect(Constants.DEFAULT_MAX_AUDIO_SIZE).toBe(26214400); // 25MB
        });

        it('should define temp directory', () => {
            expect(Constants.DEFAULT_TEMP_DIRECTORY).toBeDefined();
        });

        it('should enable interactive mode by default', () => {
            expect(Constants.DEFAULT_INTERACTIVE).toBe(true);
        });

        it('should enable self reflection by default', () => {
            expect(Constants.DEFAULT_SELF_REFLECTION).toBe(true);
        });

        it('should disable silent mode by default', () => {
            expect(Constants.DEFAULT_SILENT).toBe(false);
        });
    });

    describe('Output Management', () => {
        it('should define intermediate directory', () => {
            expect(Constants.DEFAULT_INTERMEDIATE_DIRECTORY).toBe('./output/protokoll');
        });

        it('should keep intermediates by default', () => {
            expect(Constants.DEFAULT_KEEP_INTERMEDIATES).toBe(true);
        });

        it('should define output file types', () => {
            expect(Constants.OUTPUT_FILE_TYPES).toContain('transcript');
            expect(Constants.OUTPUT_FILE_TYPES).toContain('context');
            expect(Constants.OUTPUT_FILE_TYPES).toContain('request');
            expect(Constants.OUTPUT_FILE_TYPES).toContain('response');
            expect(Constants.OUTPUT_FILE_TYPES).toContain('reflection');
            expect(Constants.OUTPUT_FILE_TYPES).toContain('session');
        });
    });

    describe('Protokoll Defaults Object', () => {
        it('should define protokoll defaults', () => {
            expect(Constants.PROTOKOLL_DEFAULTS).toBeDefined();
        });

        it('should include all expected defaults', () => {
            expect(Constants.PROTOKOLL_DEFAULTS.dryRun).toBe(Constants.DEFAULT_DRY_RUN);
            expect(Constants.PROTOKOLL_DEFAULTS.verbose).toBe(Constants.DEFAULT_VERBOSE);
            expect(Constants.PROTOKOLL_DEFAULTS.debug).toBe(Constants.DEFAULT_DEBUG);
            expect(Constants.PROTOKOLL_DEFAULTS.transcriptionModel).toBe(Constants.DEFAULT_TRANSCRIPTION_MODEL);
            expect(Constants.PROTOKOLL_DEFAULTS.model).toBe(Constants.DEFAULT_MODEL);
        });

        it('should fallback temp directory correctly', () => {
            // Verifies the branch coverage: DEFAULT_TEMP_DIRECTORY || os.tmpdir()
            expect(Constants.PROTOKOLL_DEFAULTS.tempDirectory).toBeDefined();
            expect(typeof Constants.PROTOKOLL_DEFAULTS.tempDirectory).toBe('string');
            expect(Constants.PROTOKOLL_DEFAULTS.tempDirectory.length).toBeGreaterThan(0);
        });

        it('should include interactive and reflection settings', () => {
            expect(Constants.PROTOKOLL_DEFAULTS.interactive).toBe(Constants.DEFAULT_INTERACTIVE);
            expect(Constants.PROTOKOLL_DEFAULTS.selfReflection).toBe(Constants.DEFAULT_SELF_REFLECTION);
            expect(Constants.PROTOKOLL_DEFAULTS.silent).toBe(Constants.DEFAULT_SILENT);
        });
    });
});
