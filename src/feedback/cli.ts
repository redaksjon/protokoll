/**
 * Feedback CLI
 * 
 * Command-line interface for providing feedback on classification decisions.
 * 
 * Usage:
 *   protokoll feedback --recent          # Review recent decisions
 *   protokoll feedback --file <path>     # Provide feedback on specific file
 *   protokoll feedback --learn           # Apply pending learning updates
 */

import { Command } from 'commander';
import * as Context from '../context';
import * as Feedback from './index';
import * as DecisionTracker from './decision-tracker';
import { getLogger, setLogLevel } from '../logging';
import { PROGRAM_NAME, VERSION, DEFAULT_CONFIG_DIR } from '../constants';

// CLI output helper - allowed for CLI tools
// eslint-disable-next-line no-console
const print = console.log;

export const createFeedbackCommand = (): Command => {
    const cmd = new Command('feedback')
        .description('Provide feedback on classification decisions to improve routing')
        .option('--recent', 'Review recent classification decisions')
        .option('--file <path>', 'Provide feedback on a specific transcript file')
        .option('--decision <id>', 'Provide feedback on a specific decision ID')
        .option('--learn', 'Apply pending learning updates')
        .option('--list-pending', 'List pending feedback that needs review')
        .option('--verbose', 'Enable verbose logging')
        .option('--debug', 'Enable debug logging')
        .option('--model <model>', 'Model to use for analysis', 'gpt-5.2')
        .option('--config-directory <dir>', 'Config directory', DEFAULT_CONFIG_DIR)
        .action(async (options) => {
            if (options.verbose) setLogLevel('verbose');
            if (options.debug) setLogLevel('debug');
            
            const logger = getLogger();
            
            try {
                // Initialize context
                const context = await Context.create({
                    startingDir: options.configDirectory || process.cwd(),
                });

                // Initialize decision tracker
                const tracker = DecisionTracker.create({
                    storageDir: `${options.configDirectory || DEFAULT_CONFIG_DIR}/decisions`,
                    maxInMemory: 50,
                });

                // Initialize feedback system
                const feedback = await Feedback.create({
                    feedbackDir: `${options.configDirectory || DEFAULT_CONFIG_DIR}/feedback`,
                    reasoningModel: options.model,
                    autoApplyThreshold: 0.8,
                }, context);

                if (options.recent) {
                    // Show recent decisions
                    const decisions = await tracker.getRecentDecisions(10);
                    
                    if (decisions.length === 0) {
                        print('No recent classification decisions found.');
                        print('Run protokoll on some audio files first to generate decisions.');
                        return;
                    }

                    print('\nRecent Classification Decisions:');
                    print('─'.repeat(60));
                    
                    for (let i = 0; i < decisions.length; i++) {
                        const d = decisions[i];
                        const status = d.feedbackStatus || 'pending';
                        const statusEmoji = status === 'correct' ? '✓' : status === 'incorrect' ? '✗' : '?';
                        
                        print(`\n${i + 1}. [${statusEmoji}] ${d.id}`);
                        print(`   File: ${d.audioFile}`);
                        print(`   Project: ${d.projectId || '(default)'}`);
                        print(`   Confidence: ${(d.confidence * 100).toFixed(1)}%`);
                        print(`   Date: ${d.timestamp.toLocaleString()}`);
                    }

                    print('\nTo provide feedback, run:');
                    print('  protokoll feedback --decision <id>');
                    
                } else if (options.decision) {
                    // Get specific decision
                    const decision = await tracker.getDecision(options.decision);
                    
                    if (!decision) {
                        logger.error('Decision not found: %s', options.decision);
                        process.exit(1);
                        return;
                    }

                    // Collect and process feedback
                    const result = await feedback.collectAndProcess(decision);
                    
                    if (result.feedback) {
                        logger.info('Feedback processed successfully');
                        if (result.appliedUpdates && result.appliedUpdates.length > 0) {
                            print(`\n${result.appliedUpdates.length} context updates applied.`);
                        }
                    }
                    
                } else if (options.file) {
                    // TODO: Look up decision by file path
                    print('Looking up decision for file:', options.file);
                    print('(Not yet implemented - use --decision <id> instead)');
                    
                } else if (options.listPending) {
                    // List decisions without feedback
                    const decisions = await tracker.getRecentDecisions(50);
                    const pending = decisions.filter(d => !d.feedbackStatus);
                    
                    print(`\n${pending.length} decisions pending feedback:`);
                    for (const d of pending.slice(0, 10)) {
                        print(`  - ${d.id}: ${d.audioFile}`);
                    }
                    
                } else {
                    // Show help
                    print('\nFeedback System Help');
                    print('─'.repeat(60));
                    print('\nUsage:');
                    print('  protokoll feedback --recent          Review recent decisions');
                    print('  protokoll feedback --decision <id>   Feedback on specific decision');
                    print('  protokoll feedback --list-pending    List decisions needing review');
                    print('\nThe feedback system helps protokoll learn from corrections.');
                    print('When you correct a misclassification, the system uses AI to');
                    print('analyze what went wrong and update its classification rules.');
                }
                
            } catch (error) {
                logger.error('Feedback command failed', { error });
                process.exit(1);
                return;
            }
        });

    return cmd;
};

// For direct execution
if (require.main === module) {
    const program = new Command()
        .name(PROGRAM_NAME)
        .version(VERSION);
    
    program.addCommand(createFeedbackCommand());
    program.parse();
}

