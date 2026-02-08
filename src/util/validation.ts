/**
 * Transcript Validation Utilities
 * 
 * Shared validation logic for transcript content.
 * Used by both CLI commands and MCP server to ensure consistent validation.
 */

import { parseTranscriptContent, ParsedFrontmatter } from './frontmatter';

export interface ValidationResult {
    valid: boolean;
    parsed?: ParsedFrontmatter;
    errors: string[];
}

/**
 * Validate transcript content before writing to disk.
 * 
 * Checks:
 * 1. Content starts with YAML frontmatter delimiter (---)
 * 2. Content has closing frontmatter delimiter
 * 3. Metadata is parseable
 * 4. Basic metadata fields are present
 * 
 * @param content - The transcript content to validate
 * @returns ValidationResult with parsed content if valid, or errors if invalid
 */
export function validateTranscriptContent(content: string): ValidationResult {
    const errors: string[] = [];
    
    // Check that YAML frontmatter is at the start
    if (!content.trim().startsWith('---')) {
        errors.push('Content does not start with YAML frontmatter (---). Title may be placed before frontmatter.');
    }
    
    // Check that there's a closing frontmatter delimiter
    const lines = content.split('\n');
    const closingDelimiterIndex = lines.findIndex((line, idx) => idx > 0 && line.trim() === '---');
    if (closingDelimiterIndex === -1) {
        errors.push('Content is missing closing YAML frontmatter delimiter (---)');
    }
    
    // Try to parse the content
    let parsed: ParsedFrontmatter | undefined;
    try {
        parsed = parseTranscriptContent(content);
        
        // Check that we can extract basic metadata
        if (!parsed.metadata) {
            errors.push('Content has no parseable metadata');
        }
    } catch (parseError) {
        errors.push(`Failed to parse content: ${parseError instanceof Error ? parseError.message : String(parseError)}`);
    }
    
    return {
        valid: errors.length === 0,
        parsed,
        errors,
    };
}

/**
 * Validate and throw if invalid.
 * 
 * Convenience function that throws an error if validation fails.
 * Used when you want to abort an operation on invalid content.
 * 
 * @param content - The transcript content to validate
 * @throws Error if validation fails
 * @returns The parsed frontmatter if valid
 */
export function validateOrThrow(content: string): ParsedFrontmatter {
    const result = validateTranscriptContent(content);
    
    if (!result.valid) {
        throw new Error(
            `Transcript validation failed: ${result.errors.join('; ')}. ` +
            `The file was NOT saved to prevent corruption.`
        );
    }
    
    return result.parsed!;
}
