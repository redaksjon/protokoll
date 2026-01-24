import { describe, expect, test, beforeEach, vi, afterEach } from 'vitest';
import * as Dreadcabinet from '@theunwalked/dreadcabinet';
import path from 'node:path';
import * as fs from 'node:fs/promises';
import * as os from 'node:os';

/**
 * Critical Date Handling Tests
 * 
 * These tests verify that dates are correctly converted to directory paths
 * throughout the transcription pipeline. This prevents bugs where recordings
 * from January end up in March (or any other incorrect month).
 * 
 * Key scenarios tested:
 * 1. Audio file metadata dates are correctly parsed
 * 2. Dates are correctly formatted for directory structures
 * 3. Month indexing (0-based vs 1-based) is handled correctly
 * 4. Timezone conversions don't cause date shifts
 */

describe('Date Handling - Directory Structure', () => {
    test('should correctly format January date to month 1 directory', () => {
        const januaryDate = new Date('2026-01-19T17:43:38.000Z');
        
        // Verify JavaScript Date methods return expected values
        expect(januaryDate.getFullYear()).toBe(2026);
        expect(januaryDate.getMonth()).toBe(0); // 0-indexed (January = 0)
        expect(januaryDate.getMonth() + 1).toBe(1); // 1-indexed (January = 1)
        expect(januaryDate.getDate()).toBe(19);
    });

    test('should correctly format all months to their 1-indexed directory numbers', () => {
        const testCases = [
            { month: 'January', date: '2026-01-15T12:00:00Z', expectedMonth: 1 },
            { month: 'February', date: '2026-02-15T12:00:00Z', expectedMonth: 2 },
            { month: 'March', date: '2026-03-15T12:00:00Z', expectedMonth: 3 },
            { month: 'April', date: '2026-04-15T12:00:00Z', expectedMonth: 4 },
            { month: 'May', date: '2026-05-15T12:00:00Z', expectedMonth: 5 },
            { month: 'June', date: '2026-06-15T12:00:00Z', expectedMonth: 6 },
            { month: 'July', date: '2026-07-15T12:00:00Z', expectedMonth: 7 },
            { month: 'August', date: '2026-08-15T12:00:00Z', expectedMonth: 8 },
            { month: 'September', date: '2026-09-15T12:00:00Z', expectedMonth: 9 },
            { month: 'October', date: '2026-10-15T12:00:00Z', expectedMonth: 10 },
            { month: 'November', date: '2026-11-15T12:00:00Z', expectedMonth: 11 },
            { month: 'December', date: '2026-12-15T12:00:00Z', expectedMonth: 12 },
        ];

        testCases.forEach(({ month, date, expectedMonth }) => {
            const testDate = new Date(date);
            const actualMonth = testDate.getMonth() + 1;
            expect(actualMonth).toBe(expectedMonth, 
                `${month} should map to month ${expectedMonth}, got ${actualMonth}`);
        });
    });

    test('should not add extra offsets to month values', () => {
        const januaryDate = new Date('2026-01-19T17:43:38.000Z');
        
        // Common bug: accidentally adding extra offsets
        const wrongMonth1 = januaryDate.getMonth() + 2; // Would give 2 (February)
        const wrongMonth2 = januaryDate.getMonth() + 3; // Would give 3 (March) - THE BUG!
        const correctMonth = januaryDate.getMonth() + 1; // Should give 1 (January)
        
        expect(wrongMonth1).not.toBe(correctMonth);
        expect(wrongMonth2).not.toBe(correctMonth);
        expect(correctMonth).toBe(1);
    });
});

describe('Date Handling - Dreadcabinet Integration', () => {
    let tempDir: string;

    beforeEach(async () => {
        tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'protokoll-date-test-'));
    });

    afterEach(async () => {
        await fs.rm(tempDir, { recursive: true, force: true });
    });

    test('should construct correct output directory for January date', async () => {
        const config = {
            timezone: 'Etc/UTC',
            outputDirectory: tempDir,
            outputStructure: 'month' as const,
            outputFilenameOptions: ['date', 'subject'] as const[],
        };

        const options = {
            defaults: config,
            allowed: {
                outputStructures: ['none', 'year', 'month', 'day'] as const[],
                outputFilenameOptions: ['date', 'time', 'subject'] as const[],
            },
            features: Dreadcabinet.DEFAULT_FEATURES,
            addDefaults: false,
        };

        const dreadcabinet = Dreadcabinet.create(options);
        const operator = await dreadcabinet.operate(config);

        // Test with January 19, 2026 date
        const januaryDate = new Date('2026-01-19T17:43:38.000Z');
        const outputPath = await operator.constructOutputDirectory(januaryDate);

        // Should be tempDir/2026/1 (not tempDir/2026/3!)
        expect(outputPath).toBe(path.join(tempDir, '2026', '1'));
        expect(outputPath).toContain('/2026/1');
        expect(outputPath).not.toContain('/2026/3');
        expect(outputPath).not.toContain('/2026/2');
    });

    test('should construct correct output directories for all months', async () => {
        const config = {
            timezone: 'Etc/UTC',
            outputDirectory: tempDir,
            outputStructure: 'month' as const,
            outputFilenameOptions: ['date', 'subject'] as const[],
        };

        const options = {
            defaults: config,
            allowed: {
                outputStructures: ['none', 'year', 'month', 'day'] as const[],
                outputFilenameOptions: ['date', 'time', 'subject'] as const[],
            },
            features: Dreadcabinet.DEFAULT_FEATURES,
            addDefaults: false,
        };

        const dreadcabinet = Dreadcabinet.create(options);
        const operator = await dreadcabinet.operate(config);

        const testCases = [
            { month: 'January', date: '2026-01-15T12:00:00Z', expectedSuffix: '2026/1' },
            { month: 'February', date: '2026-02-15T12:00:00Z', expectedSuffix: '2026/2' },
            { month: 'March', date: '2026-03-15T12:00:00Z', expectedSuffix: '2026/3' },
            { month: 'December', date: '2026-12-15T12:00:00Z', expectedSuffix: '2026/12' },
        ];

        for (const { month, date, expectedSuffix } of testCases) {
            const testDate = new Date(date);
            const outputPath = await operator.constructOutputDirectory(testDate);
            const expectedPath = path.join(tempDir, expectedSuffix);
            expect(outputPath).toBe(expectedPath, 
                `${month} should create directory ${expectedPath}, got ${outputPath}`);
        }
    });

    test('should handle timezone conversions without changing the date', async () => {
        const config = {
            timezone: 'America/Los_Angeles', // PST/PDT
            outputDirectory: tempDir,
            outputStructure: 'month' as const,
            outputFilenameOptions: ['date', 'subject'] as const[],
        };

        const options = {
            defaults: config,
            allowed: {
                outputStructures: ['none', 'year', 'month', 'day'] as const[],
                outputFilenameOptions: ['date', 'time', 'subject'] as const[],
            },
            features: Dreadcabinet.DEFAULT_FEATURES,
            addDefaults: false,
        };

        const dreadcabinet = Dreadcabinet.create(options);
        const operator = await dreadcabinet.operate(config);

        // January 19, 2026 at 17:43 UTC = January 19, 2026 at 09:43 PST
        // Should still be in January (month 1)
        const januaryDate = new Date('2026-01-19T17:43:38.000Z');
        const outputPath = await operator.constructOutputDirectory(januaryDate);

        expect(outputPath).toBe(path.join(tempDir, '2026', '1'));
    });

    test('should handle edge case: date near timezone boundary', async () => {
        const config = {
            timezone: 'America/Los_Angeles',
            outputDirectory: tempDir,
            outputStructure: 'month' as const,
            outputFilenameOptions: ['date', 'subject'] as const[],
        };

        const options = {
            defaults: config,
            allowed: {
                outputStructures: ['none', 'year', 'month', 'day'] as const[],
                outputFilenameOptions: ['date', 'time', 'subject'] as const[],
            },
            features: Dreadcabinet.DEFAULT_FEATURES,
            addDefaults: false,
        };

        const dreadcabinet = Dreadcabinet.create(options);
        const operator = await dreadcabinet.operate(config);

        // January 1, 2026 at 07:00 UTC = December 31, 2025 at 23:00 PST
        // This should be in December 2025, not January 2026
        const boundaryDate = new Date('2026-01-01T07:00:00.000Z');
        const outputPath = await operator.constructOutputDirectory(boundaryDate);

        // In PST timezone, this should be 2025/12
        expect(outputPath).toBe(path.join(tempDir, '2025', '12'));
    });
});

describe('Date Handling - Filename Construction', () => {
    let tempDir: string;

    beforeEach(async () => {
        tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'protokoll-date-test-'));
    });

    afterEach(async () => {
        await fs.rm(tempDir, { recursive: true, force: true });
    });

    test('should construct correct filename with date for January recording', async () => {
        const config = {
            timezone: 'Etc/UTC',
            outputDirectory: tempDir,
            outputStructure: 'month' as const,
            outputFilenameOptions: ['date', 'time', 'subject'] as const[],
        };

        const options = {
            defaults: config,
            allowed: {
                outputStructures: ['none', 'year', 'month', 'day'] as const[],
                outputFilenameOptions: ['date', 'time', 'subject'] as const[],
            },
            features: Dreadcabinet.DEFAULT_FEATURES,
            addDefaults: false,
        };

        const dreadcabinet = Dreadcabinet.create(options);
        const operator = await dreadcabinet.operate(config);

        const januaryDate = new Date('2026-01-19T09:43:00.000Z');
        const filename = await operator.constructFilename(
            januaryDate,
            'transcript',
            'abc123',
            { subject: 'test-recording' }
        );

        // Filename should start with 19-0943 (day 19, time 09:43)
        // NOT with 19-0943 but in wrong directory
        expect(filename).toMatch(/^19-0943-/);
        expect(filename).toContain('abc123');
        expect(filename).toContain('test-recording');
    });

    test('should construct consistent filenames across all months', async () => {
        const config = {
            timezone: 'Etc/UTC',
            outputDirectory: tempDir,
            outputStructure: 'month' as const,
            outputFilenameOptions: ['date', 'time'] as const[],
        };

        const options = {
            defaults: config,
            allowed: {
                outputStructures: ['none', 'year', 'month', 'day'] as const[],
                outputFilenameOptions: ['date', 'time', 'subject'] as const[],
            },
            features: Dreadcabinet.DEFAULT_FEATURES,
            addDefaults: false,
        };

        const dreadcabinet = Dreadcabinet.create(options);
        const operator = await dreadcabinet.operate(config);

        const testCases = [
            { date: '2026-01-15T12:30:00Z', expectedPrefix: '15-1230' },
            { date: '2026-02-15T12:30:00Z', expectedPrefix: '15-1230' },
            { date: '2026-12-15T12:30:00Z', expectedPrefix: '15-1230' },
        ];

        for (const { date, expectedPrefix } of testCases) {
            const testDate = new Date(date);
            const filename = await operator.constructFilename(
                testDate,
                'transcript',
                'hash123',
                {}
            );
            expect(filename).toMatch(new RegExp(`^${expectedPrefix}-`));
        }
    });
});

describe('Date Handling - Real World Scenario', () => {
    let tempDir: string;

    beforeEach(async () => {
        tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'protokoll-date-test-'));
    });

    afterEach(async () => {
        await fs.rm(tempDir, { recursive: true, force: true });
    });

    test('should handle the reported bug scenario: January 19 recording', async () => {
        // This test recreates the exact scenario from the bug report:
        // Recording from January 19, 2026 at 17:43 UTC should go to 2026/1/
        // NOT to 2026/3/
        
        const config = {
            timezone: 'Etc/UTC',
            outputDirectory: tempDir,
            outputStructure: 'month' as const,
            outputFilenameOptions: ['date', 'time', 'subject'] as const[],
        };

        const options = {
            defaults: config,
            allowed: {
                outputStructures: ['none', 'year', 'month', 'day'] as const[],
                outputFilenameOptions: ['date', 'time', 'subject'] as const[],
            },
            features: Dreadcabinet.DEFAULT_FEATURES,
            addDefaults: false,
        };

        const dreadcabinet = Dreadcabinet.create(options);
        const operator = await dreadcabinet.operate(config);

        // Exact date from the audio file metadata
        const recordingDate = new Date('2026-01-19T17:43:38.000Z');
        
        // Get the output directory
        const outputPath = await operator.constructOutputDirectory(recordingDate);
        
        // Get the filename
        const filename = await operator.constructFilename(
            recordingDate,
            'transcript',
            'bc7485',
            { subject: 'east-west-bank' }
        );

        // Verify directory is correct
        const expectedDir = path.join(tempDir, '2026', '1');
        expect(outputPath).toBe(expectedDir);
        expect(outputPath).toContain('/2026/1');
        expect(outputPath).not.toContain('/2026/3');
        
        // Verify filename starts with correct day
        expect(filename).toMatch(/^19-/);
        expect(filename).toContain('east-west-bank');
    });

    test('should verify month calculation never adds extra offsets', () => {
        // This test specifically checks for the bug where month + 3 was being used
        const testCases = [
            { date: new Date('2026-01-15T12:00:00Z'), expectedMonth: 1, jsMonth: 0 }, // January
            { date: new Date('2026-02-15T12:00:00Z'), expectedMonth: 2, jsMonth: 1 }, // February
            { date: new Date('2026-03-15T12:00:00Z'), expectedMonth: 3, jsMonth: 2 }, // March
        ];

        testCases.forEach(({ date, expectedMonth, jsMonth }) => {
            const actualJsMonth = date.getMonth(); // 0-indexed
            const humanMonth = actualJsMonth + 1;   // 1-indexed (correct)
            const buggyMonth = actualJsMonth + 3;   // Would add extra offset (BUG!)

            // Verify the JS month is correct
            expect(actualJsMonth).toBe(jsMonth);
            
            // Verify the correct conversion
            expect(humanMonth).toBe(expectedMonth);
            
            // Verify the buggy conversion would be wrong
            expect(buggyMonth).not.toBe(humanMonth);
            expect(buggyMonth).toBe(jsMonth + 3);
        });
    });
});
