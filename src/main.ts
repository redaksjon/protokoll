#!/usr/bin/env node
import { main } from '@/protokoll';
import { isContextCommand, runContextCLI } from '@/cli';

// Check if this is a context management command
if (isContextCommand()) {
    runContextCLI().catch((error) => {
        process.stderr.write(`Error: ${error.message}\n`);
        process.exit(1);
    });
} else {
    // Run the main transcription flow
    main();
}