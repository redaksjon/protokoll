/**
 * Complete Phase
 * 
 * Handles post-processing completion: moving audio files to the processed directory
 * after successful transcription.
 */

import * as path from 'node:path';
import * as Logging from '@/logging';
import * as Storage from '@/util/storage';

export type FilesystemStructure = 'none' | 'year' | 'month' | 'day';

export interface CompleteConfig {
    processedDirectory: string;
    outputStructure?: FilesystemStructure;
    dryRun?: boolean;
}

export interface Instance {
    complete(audioFile: string, hash: string, creationTime: Date, subject?: string): Promise<string>;
}

export const create = (config: CompleteConfig): Instance => {
    const logger = Logging.getLogger();
    const storage = Storage.create({ log: logger.debug });

    // Build directory path matching output structure (year/month)
    const buildDirectoryPath = (date: Date): string => {
        const structure = config.outputStructure || 'month';
        const year = date.getFullYear().toString();
        const month = (date.getMonth() + 1).toString();
        const day = date.getDate().toString();

        switch (structure) {
            case 'none':
                return config.processedDirectory;
            case 'year':
                return path.join(config.processedDirectory, year);
            case 'month':
                return path.join(config.processedDirectory, year, month);
            case 'day':
                return path.join(config.processedDirectory, year, month, day);
        }
    };

    // Format date portion of filename based on directory structure
    // Don't repeat info already in the path
    const formatDateForFilename = (date: Date): string => {
        const structure = config.outputStructure || 'month';
        const pad = (n: number) => n.toString().padStart(2, '0');
        const year = date.getFullYear().toString();
        const month = pad(date.getMonth() + 1);
        const day = pad(date.getDate());
        const hours = pad(date.getHours());
        const minutes = pad(date.getMinutes());

        switch (structure) {
            case 'day':
                // Path has year/month/day - only time in filename
                return `${hours}${minutes}`;
            case 'month':
                // Path has year/month - day and time in filename
                return `${day}-${hours}${minutes}`;
            case 'year':
                // Path has year - month, day and time in filename
                return `${month}-${day}-${hours}${minutes}`;
            case 'none':
                // No date in path - full date in filename (YYYY-MM-DD-HHmm)
                return `${year}-${month}-${day}-${hours}${minutes}`;
        }
    };

    const complete = async (
        audioFile: string, 
        hash: string, 
        creationTime: Date, 
        subject?: string
    ): Promise<string> => {
        logger.debug('Completing file processing for %s', audioFile);

        if (config.dryRun) {
            logger.info('Dry run: would move %s to processed directory', audioFile);
            return audioFile;
        }

        if (!config.processedDirectory) {
            logger.debug('No processed directory configured, skipping file move');
            return audioFile;
        }

        // Build the target directory path with year/month structure
        const targetDir = buildDirectoryPath(creationTime);

        // Create the target directory if it doesn't exist
        if (!await storage.exists(targetDir)) {
            logger.debug('Creating processed directory %s', targetDir);
            await storage.createDirectory(targetDir);
        }

        // Get the file extension
        const fileExt = path.extname(audioFile);

        // Format date for filename (adjusted based on directory structure)
        const dateStr = formatDateForFilename(creationTime);

        // Create new filename: <date>-<subject>-<hash>
        // Hash is at the end for easier correlation with output files
        // Clean subject by removing special characters and spaces
        const shortHash = hash.substring(0, 6);
        let newFilename: string;
        if (subject) {
            const cleanSubject = subject
                .replace(/[^a-zA-Z0-9]/g, '-')
                .replace(/-+/g, '-')
                .replace(/^-|-$/g, '')
                .toLowerCase()
                .substring(0, 50);
            newFilename = `${dateStr}-${cleanSubject}-${shortHash}${fileExt}`;
        } else {
            newFilename = `${dateStr}-${shortHash}${fileExt}`;
        }
        
        const newFilePath = path.join(targetDir, newFilename);

        try {
            // Read the original file
            const fileContent = await storage.readFile(audioFile, 'binary');

            // Write to the new location
            logger.debug('Moving file from %s to %s', audioFile, newFilePath);
            await storage.writeFile(newFilePath, fileContent, 'binary');

            // Remove the original file
            await storage.deleteFile(audioFile);

            logger.info('Moved to processed: %s', newFilePath);
            return newFilePath;
        } catch (error) {
            logger.error('Failed to move file to processed directory: %s', error);
            // Don't fail the whole process, just log the error
            return audioFile;
        }
    };

    return {
        complete,
    };
};

