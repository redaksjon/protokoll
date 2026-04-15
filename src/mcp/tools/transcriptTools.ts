/* eslint-disable import/extensions */
/**
 * Transcript Tools - Read, list, edit, combine, and provide feedback on transcripts
 */
 
import type { Tool } from '@modelcontextprotocol/sdk/types.js';
import { resolve, dirname } from 'node:path';
import { mkdir, mkdtemp, rm, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { randomUUID } from 'node:crypto';
import Logging from '@fjell/logging';
import { Agentic, Phases, Reasoning, Routing, Transcript } from '@redaksjon/protokoll-engine';
import { DEFAULT_MODEL, MAX_CONTENT_LENGTH } from '@/constants';
import { markTranscriptIndexDirtyForStorage, resolveTranscriptPathByFilename } from '../resources/transcriptIndexService';
import type { FileStorageProvider } from '../storage/fileProviders';
import { markContextEntityIndexDirty, findContextEntityInGcs } from '../resources/entityIndexService';

import { createToolContext, fileExists, getConfiguredDirectory, getContextDirectories, sanitizePath, validatePathWithinDirectory, validatePathWithinOutputDirectory, validateNotRemoteMode, resolveTranscriptPath } from './shared.js';
import * as Metadata from '@redaksjon/protokoll-engine';
import { Transcript as TranscriptUtils } from '@redaksjon/protokoll-engine';
const { ensurePklExtension, transcriptExists } = TranscriptUtils;
import { 
    PklTranscript, 
    readTranscript as readTranscriptFromStorage,
    listTranscripts as listTranscriptsFromStorage,
    type TranscriptMetadata,
} from '@redaksjon/protokoll-format';

const logger = Logging.getLogger('@redaksjon/protokoll-mcp').get('transcript-tools');

// ============================================================================
// Helper Functions
// ============================================================================

type CandidateConfidence = 'high' | 'medium' | 'low';

interface TaskCandidate {
    id: string;
    taskText: string;
    confidence: number;
    confidenceBucket: CandidateConfidence;
    rationale: string;
    sourceExcerpt: string;
    suggestedDueDate: string | null;
    suggestedProject: { id: string | null; name: string | null };
    suggestedEntities: Array<{ id: string; name: string; type: 'person' | 'project' | 'term' | 'company' }>;
    suggestedTags: string[];
}

interface SummaryStylePreset {
    label: string;
    instructions: string;
}

interface StoredSummary {
    id: string;
    title: string;
    audience: string;
    guidance: string;
    stylePreset: string;
    styleLabel: string;
    content: string;
    generatedAt: string;
}

interface TranscriptCommentInput {
    id: string;
    text: string;
    createdAt: string;
    updatedAt?: string;
}

type TranscriptMetadataWithComments = TranscriptMetadata & {
    comments?: TranscriptCommentInput[];
};

function normalizeTranscriptComments(comments: unknown): TranscriptCommentInput[] {
    if (!Array.isArray(comments)) {
        return [];
    }

    return comments
        .filter((entry) => !!entry && typeof entry === 'object')
        .map((entry) => {
            const candidate = entry as Record<string, unknown>;
            const id = typeof candidate.id === 'string' ? candidate.id.trim() : '';
            const text = typeof candidate.text === 'string' ? candidate.text.trim() : '';
            const createdAt = typeof candidate.createdAt === 'string' ? candidate.createdAt.trim() : '';
            const updatedAt = typeof candidate.updatedAt === 'string' ? candidate.updatedAt.trim() : undefined;
            return { id, text, createdAt, updatedAt };
        })
        .filter((entry) => entry.id.length > 0 && entry.text.length > 0 && entry.createdAt.length > 0)
        .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

function toStoragePathCandidates(transcriptPath: string): string[] {
    const normalizedInput = transcriptPath.trim();
    if (!normalizedInput) {
        return [];
    }

    let normalized = normalizedInput;
    if (normalized.startsWith('protokoll://transcript/')) {
        const rawPath = normalized
            .replace('protokoll://transcript/', '')
            .split('?')[0]
            .split('#')[0] || '';
        try {
            normalized = decodeURIComponent(rawPath);
        } catch {
            // Fall back to the undecoded path for malformed or partially encoded URIs.
            normalized = rawPath;
        }
    }

    normalized = normalized
        .replace(/^\/+/, '')
        .replace(/\\/g, '/')
        .replace(/^(\.\.\/)+/, '');
    if (!normalized) {
        return [];
    }

    const withoutExt = normalized.replace(/\.pkl$/i, '');
    const candidates = new Set<string>([
        withoutExt,
        `${withoutExt}.pkl`,
    ]);
    return Array.from(candidates);
}

async function resolveStorageTranscriptPath(
    transcriptPath: string,
    outputStorage: FileStorageProvider,
): Promise<string | null> {
    const candidates = toStoragePathCandidates(transcriptPath);
    for (const candidate of candidates) {
        if (await outputStorage.exists(candidate)) {
            return candidate;
        }
    }

    const normalizedRef = transcriptPath.startsWith('protokoll://transcript/')
        ? transcriptPath.replace('protokoll://transcript/', '').split('?')[0].split('#')[0]
        : transcriptPath;
    const isBasenameOnly = !normalizedRef.replace(/^\/+/, '').replace(/\\/g, '/').includes('/');
    if (!isBasenameOnly) {
        return null;
    }

    const basenameCandidates = new Set(
        candidates.map((candidate) => candidate.split('/').pop() || candidate)
    );

    const ServerConfig = await import('../serverConfig');
    const outputDirectory = ServerConfig.getOutputDirectory();
    const matches = await resolveTranscriptPathByFilename(
        outputStorage,
        outputDirectory,
        basenameCandidates,
    );
    if (matches.length === 1) {
        return matches[0];
    }
    if (matches.length > 1) {
        throw new Error(
            `Ambiguous transcript reference "${transcriptPath}": ${matches.length} matches found. ` +
            'Use full transcript URI or relative path with date folders.'
        );
    }
    return null;
}

async function getProjectLookupContext(contextDirectory?: string) {
    return createToolContext(contextDirectory);
}

export const transcriptResolutionTestHelpers = {
    toStoragePathCandidates,
    resolveStorageTranscriptPath,
};

interface ToolTranscriptAccess {
    pklPath: string;
    outputDirectory: string;
    storagePath?: string;
    isGcs: boolean;
    finalize: (persistChanges: boolean) => Promise<void>;
}

async function openToolTranscript(
    transcriptPath: string,
    contextDirectory: string | undefined,
): Promise<ToolTranscriptAccess> {
    const ServerConfig = await import('../serverConfig');
    const outputStorage = ServerConfig.getOutputStorage();
    const outputDirectory = await getConfiguredDirectory('outputDirectory', contextDirectory);

    if (outputStorage.name !== 'gcs') {
        const absolutePath = await resolveTranscriptPath(transcriptPath, contextDirectory);
        const pklPath = ensurePklExtension(absolutePath);
        return {
            pklPath,
            outputDirectory,
            isGcs: false,
            finalize: async () => {},
        };
    }

    if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(transcriptPath.trim())) {
        throw new Error(
            'UUID transcript references are not supported in GCS mode yet. ' +
            'Use a transcript URI (protokoll://transcript/...) or relative path.'
        );
    }

    const storagePath = await resolveStorageTranscriptPath(transcriptPath, outputStorage);
    if (!storagePath) {
        throw new Error(`Transcript not found: ${transcriptPath}`);
    }

    const tmpRoot = await mkdtemp(`${tmpdir()}/protokoll-mcp-transcript-`);
    const pklPath = resolve(tmpRoot, 'transcript.pkl');
    const source = await outputStorage.readFile(storagePath);
    await writeFile(pklPath, source);

    return {
        pklPath,
        outputDirectory,
        storagePath,
        isGcs: true,
        finalize: async (persistChanges: boolean) => {
            try {
                if (persistChanges) {
                    const updated = await readFile(pklPath);
                    await outputStorage.writeFile(storagePath, updated);
                    markTranscriptIndexDirtyForStorage(outputStorage, outputDirectory, storagePath);
                }
            } finally {
                await rm(tmpRoot, { recursive: true, force: true });
            }
        },
    };
}

function parseStoredSummaries(raw: string): StoredSummary[] {
    try {
        const parsed = JSON.parse(raw) as unknown;
        if (!Array.isArray(parsed)) {
            return [];
        }
        return parsed
            .map((item) => {
                if (!item || typeof item !== 'object') {
                    return null;
                }
                const record = item as Record<string, unknown>;
                const id = String(record.id || '').trim();
                const content = String(record.content || '').trim();
                if (!id || !content) {
                    return null;
                }
                return {
                    id,
                    title: String(record.title || '').trim(),
                    audience: String(record.audience || '').trim(),
                    guidance: String(record.guidance || '').trim(),
                    stylePreset: String(record.stylePreset || 'detailed').trim() || 'detailed',
                    styleLabel: String(record.styleLabel || 'Detailed summary').trim() || 'Detailed summary',
                    content,
                    generatedAt: String(record.generatedAt || '').trim() || new Date().toISOString(),
                } satisfies StoredSummary;
            })
            .filter((summary): summary is StoredSummary => summary !== null)
            .sort((a, b) => b.generatedAt.localeCompare(a.generatedAt));
    } catch {
        return [];
    }
}

const SUMMARY_STYLE_PRESETS: Record<string, SummaryStylePreset> = {
    quick_bullets: {
        label: 'Quick paragraph + bullet points',
        instructions: 'Write one concise paragraph followed by 4-8 bullets covering decisions, actions, and risks.',
    },
    detailed: {
        label: 'Detailed summary',
        instructions: 'Write a structured summary with context, key discussion points, decisions, open questions, and next steps.',
    },
    attendee_facing: {
        label: 'Attendee-facing summary',
        instructions: 'Write a professional external-facing summary suitable for attendees; avoid private/internal reflections unless explicitly approved.',
    },
};

function splitIntoCandidateSentences(content: string): string[] {
    return content
        .split(/\n+|(?<=[.!?])\s+/g)
        .map((sentence) => sentence.trim())
        .filter((sentence) => sentence.length >= 8);
}

function normalizeTaskText(sentence: string): string {
    const normalized = sentence
        .replace(/^(?:i need to|we need to|i should|we should|let'?s|remember to|todo:|action item:)\s+/i, '')
        .replace(/\s+/g, ' ')
        .trim();
    return normalized.charAt(0).toUpperCase() + normalized.slice(1);
}

function inferDueDate(sentence: string): string | null {
    const lower = sentence.toLowerCase();
    if (lower.includes('today')) {
        return 'today';
    }
    if (lower.includes('tomorrow')) {
        return 'tomorrow';
    }
    if (lower.includes('next week')) {
        return 'next week';
    }
    if (lower.includes('this week')) {
        return 'this week';
    }
    if (lower.includes('by friday')) {
        return 'by friday';
    }
    return null;
}

function extractHashtagTags(sentence: string): string[] {
    const matches = sentence.match(/#[a-z0-9_-]+/gi) || [];
    return Array.from(new Set(matches.map((tag) => tag.slice(1).toLowerCase())));
}

function toConfidenceBucket(score: number): CandidateConfidence {
    if (score >= 0.75) {
        return 'high';
    }
    if (score >= 0.5) {
        return 'medium';
    }
    return 'low';
}

function scoreTaskCandidate(sentence: string): { score: number; rationale: string } | null {
    const explicitActionPattern = /\b(i need to|we need to|i should|we should|let'?s|remember to|todo|action item|i will|i'll|must)\b/i;
    const inferredIntentPattern = /\b(follow up|check|review|investigate|confirm|decide|plan|schedule|reach out|send|draft|prepare|update|fix|create|write|call|email|look into|figure out)\b/i;

    let score = 0;
    const rationaleParts: string[] = [];

    if (explicitActionPattern.test(sentence)) {
        score += 0.55;
        rationaleParts.push('explicit action language');
    }

    if (inferredIntentPattern.test(sentence)) {
        score += 0.35;
        rationaleParts.push('inferred follow-up intent');
    }

    if (inferDueDate(sentence)) {
        score += 0.1;
        rationaleParts.push('time cue detected');
    }

    if (score < 0.3) {
        return null;
    }

    return {
        score: Math.min(1, Number(score.toFixed(2))),
        rationale: rationaleParts.join('; '),
    };
}

function getSuggestedEntities(
    entities: NonNullable<TranscriptMetadata['entities']> | undefined
): Array<{ id: string; name: string; type: 'person' | 'project' | 'term' | 'company' }> {
    if (!entities) {
        return [];
    }

    const people = (entities.people || []).map((entity) => ({ ...entity, type: 'person' as const }));
    const projects = (entities.projects || []).map((entity) => ({ ...entity, type: 'project' as const }));
    const terms = (entities.terms || []).map((entity) => ({ ...entity, type: 'term' as const }));
    const companies = (entities.companies || []).map((entity) => ({ ...entity, type: 'company' as const }));
    return [...people, ...projects, ...terms, ...companies];
}

// ============================================================================
// Tool Definitions
// ============================================================================

export const readTranscriptTool: Tool = {
    name: 'protokoll_read_transcript',
    description:
        'Read a transcript file and parse its metadata and content. ' +
        'Path is relative to the configured output directory. ' +
        'Returns structured data including title, metadata, routing info, and content.',
    inputSchema: {
        type: 'object',
        properties: {
            transcriptPath: {
                type: 'string',
                description: 
                    'Transcript URI (preferred) or relative path from output directory. ' +
                    'URI format: "protokoll://transcript/2026/2/12-1606-meeting" (no file extension). ' +
                    'Path format: "2026/2/12-1606-meeting" or "2026/2/12-1606-meeting.pkl"',
            },
            contextDirectory: {
                type: 'string',
                description: 'Optional: Path to the .protokoll context directory',
            },
        },
        required: ['transcriptPath'],
    },
};

export const listTranscriptsTool: Tool = {
    name: 'protokoll_list_transcripts',
    description:
        'List transcripts with pagination, filtering, and search. ' +
        'If no directory is specified, uses the configured output directory. ' +
        'Returns transcript metadata including date, time, title, and file path. ' +
        'Supports sorting by date (default), filename, or title. ' +
        'Can filter by date range and search within transcript content.',
    inputSchema: {
        type: 'object',
        properties: {
            directory: {
                type: 'string',
                description: 
                    'Optional: Directory to search for transcripts (searches recursively). ' +
                    'If not specified, uses the configured output directory.',
            },
            limit: {
                type: 'number',
                description: 'Maximum number of results to return (default: 50)',
                default: 50,
            },
            offset: {
                type: 'number',
                description: 'Number of results to skip for pagination (default: 0)',
                default: 0,
            },
            sortBy: {
                type: 'string',
                enum: ['date', 'filename', 'title'],
                description: 'Field to sort by (default: date)',
                default: 'date',
            },
            startDate: {
                type: 'string',
                description: 'Filter transcripts from this date onwards (YYYY-MM-DD format)',
            },
            endDate: {
                type: 'string',
                description: 'Filter transcripts up to this date (YYYY-MM-DD format)',
            },
            search: {
                type: 'string',
                description: 'Search for transcripts containing this text (searches filename and content)',
            },
            entityId: {
                type: 'string',
                description: 'Filter to transcripts that reference this entity ID',
            },
            entityType: {
                type: 'string',
                enum: ['person', 'project', 'term', 'company'],
                description: 'Entity type to filter by (used with entityId to narrow search)',
            },
            contextDirectory: {
                type: 'string',
                description: 'Optional: Path to the .protokoll context directory',
            },
        },
        required: [],
    },
};

export const identifyTasksFromTranscriptTool: Tool = {
    name: 'protokoll_identify_tasks_from_transcript',
    description:
        'Identify task candidates from transcript or note content without creating tasks. ' +
        'Returns structured candidates with confidence buckets, rationale, and metadata suggestions ' +
        'so users can review and choose which tasks to create.',
    inputSchema: {
        type: 'object',
        properties: {
            transcriptPath: {
                type: 'string',
                description:
                    'Transcript URI (preferred) or relative path from output directory. ' +
                    'URI format: "protokoll://transcript/2026/2/12-1606-meeting" (no file extension). ' +
                    'Path format: "2026/2/12-1606-meeting" or "2026/2/12-1606-meeting.pkl"',
            },
            maxCandidates: {
                type: 'number',
                description: 'Maximum number of candidates to return (default: 25, max: 50)',
                default: 25,
            },
            includeTagSuggestions: {
                type: 'boolean',
                description: 'Whether to include suggested tags based on transcript metadata and hashtags (default: true)',
                default: true,
            },
            contextDirectory: {
                type: 'string',
                description: 'Optional: Path to the .protokoll context directory',
            },
        },
        required: ['transcriptPath'],
    },
};

export const editTranscriptTool: Tool = {
    name: 'protokoll_edit_transcript',
    description:
        'Edit an existing transcript\'s title, project assignment, tags, and/or status. ' +
        'Path is relative to the configured output directory. ' +
        'IMPORTANT: When you change the title, this tool RENAMES THE FILE to match the new title (slugified). ' +
        'Always use this tool instead of directly editing transcript files when changing titles. ' +
        'Changing the project will update metadata and may move the file to a new location ' +
        'based on the project\'s routing configuration.',
    inputSchema: {
        type: 'object',
        properties: {
            transcriptPath: {
                type: 'string',
                description: 
                    'Transcript URI (preferred) or relative path from output directory. ' +
                    'URI format: "protokoll://transcript/2026/2/12-1606-meeting" (no file extension). ' +
                    'Path format: "2026/2/12-1606-meeting" or "2026/2/12-1606-meeting.pkl"',
            },
            title: {
                type: 'string',
                description: 'New title for the transcript. This will RENAME the file to match the slugified title.',
            },
            projectId: {
                type: 'string',
                description: 'New project ID to assign',
            },
            tagsToAdd: {
                type: 'array',
                items: { type: 'string' },
                description: 'Tags to add to the transcript (will be deduplicated with existing tags)',
            },
            tagsToRemove: {
                type: 'array',
                items: { type: 'string' },
                description: 'Tags to remove from the transcript',
            },
            comments: {
                type: 'array',
                description: 'Replace transcript comments metadata with this full list.',
                items: {
                    type: 'object',
                    properties: {
                        id: { type: 'string' },
                        text: { type: 'string' },
                        createdAt: { type: 'string', description: 'ISO-8601 timestamp' },
                        updatedAt: { type: 'string', description: 'ISO-8601 timestamp (optional)' },
                    },
                    required: ['id', 'text', 'createdAt'],
                },
            },
            status: {
                type: 'string',
                enum: ['initial', 'enhanced', 'reviewed', 'in_progress', 'closed', 'archived'],
                description: 'New lifecycle status. Status transitions are recorded in history.',
            },
            contextDirectory: {
                type: 'string',
                description: 'Optional: Path to the .protokoll context directory',
            },
        },
        required: ['transcriptPath'],
    },
};

export const summarizeTranscriptTool: Tool = {
    name: 'protokoll_summarize_transcript',
    description:
        'Generate an audience-aware summary for a transcript using privacy/sensitivity guardrails. ' +
        'Returns markdown summary text and does not modify transcript content.',
    inputSchema: {
        type: 'object',
        properties: {
            transcriptPath: {
                type: 'string',
                description:
                    'Transcript URI (preferred) or relative path from output directory. ' +
                    'URI format: "protokoll://transcript/2026/2/12-1606-meeting" (no file extension). ' +
                    'Path format: "2026/2/12-1606-meeting" or "2026/2/12-1606-meeting.pkl"',
            },
            audience: {
                type: 'string',
                description: 'Optional audience label (e.g. internal team, project attendees, external partner)',
            },
            stylePreset: {
                type: 'string',
                enum: ['quick_bullets', 'detailed', 'attendee_facing'],
                description: 'Summary style preset (default: detailed)',
                default: 'detailed',
            },
            guidance: {
                type: 'string',
                description: 'Optional extra instructions, especially for privacy/sensitivity constraints',
            },
            summaryTitle: {
                type: 'string',
                description: 'Optional title to use in the generated summary',
            },
            model: {
                type: 'string',
                description: `LLM model for summary generation (default: ${DEFAULT_MODEL})`,
            },
            contextDirectory: {
                type: 'string',
                description: 'Optional: Path to the .protokoll context directory',
            },
        },
        required: ['transcriptPath'],
    },
};

export const deleteTranscriptSummaryTool: Tool = {
    name: 'protokoll_delete_transcript_summary',
    description:
        'Delete a previously generated summary from transcript artifact storage by summary ID. ' +
        'Path is relative to the configured output directory.',
    inputSchema: {
        type: 'object',
        properties: {
            transcriptPath: {
                type: 'string',
                description:
                    'Transcript URI (preferred) or relative path from output directory. ' +
                    'URI format: "protokoll://transcript/2026/2/12-1606-meeting" (no file extension). ' +
                    'Path format: "2026/2/12-1606-meeting" or "2026/2/12-1606-meeting.pkl"',
            },
            summaryId: {
                type: 'string',
                description: 'Summary ID to remove (for example: "summary-174..." )',
            },
            contextDirectory: {
                type: 'string',
                description: 'Optional: Path to the .protokoll context directory',
            },
        },
        required: ['transcriptPath', 'summaryId'],
    },
};

export const changeTranscriptDateTool: Tool = {
    name: 'protokoll_change_transcript_date',
    description:
        'Change the date of an existing transcript. ' +
        'This will move the transcript file to a new location based on the new date and the project\'s routing configuration. ' +
        'The file will be moved to the appropriate YYYY/MM/ directory structure. ' +
        'Path is relative to the configured output directory. ' +
        'WARNING: This may remove the transcript from the current view if it moves to a different date folder.',
    inputSchema: {
        type: 'object',
        properties: {
            transcriptPath: {
                type: 'string',
                description: 
                    'Transcript URI (preferred) or relative path from output directory. ' +
                    'URI format: "protokoll://transcript/2026/2/12-1606-meeting" (no file extension). ' +
                    'Path format: "2026/2/12-1606-meeting" or "2026/2/12-1606-meeting.pkl"',
            },
            newDate: {
                type: 'string',
                description: 
                    'New date for the transcript in ISO 8601 format (YYYY-MM-DD or full ISO datetime). ' +
                    'Examples: "2026-01-15", "2026-01-15T10:30:00Z"',
            },
            contextDirectory: {
                type: 'string',
                description: 'Optional: Path to the .protokoll context directory',
            },
        },
        required: ['transcriptPath', 'newDate'],
    },
};

export const combineTranscriptsTool: Tool = {
    name: 'protokoll_combine_transcripts',
    description:
        'Combine multiple transcripts into a single document. ' +
        'Paths are relative to the configured output directory. ' +
        'Source files are automatically deleted after combining. ' +
        'Metadata from the first transcript is preserved, and content is organized into sections.',
    inputSchema: {
        type: 'object',
        properties: {
            transcriptPaths: {
                type: 'array',
                items: { type: 'string' },
                description: 
                    'Array of relative paths from the output directory. ' +
                    'Examples: ["meeting-1.pkl", "meeting-2.pkl"] or ["2026/2/01-1325.pkl", "2026/2/01-1400.pkl"]',
            },
            title: {
                type: 'string',
                description: 'Title for the combined transcript',
            },
            projectId: {
                type: 'string',
                description: 'Project ID to assign to the combined transcript',
            },
            contextDirectory: {
                type: 'string',
                description: 'Optional: Path to the .protokoll context directory',
            },
        },
        required: ['transcriptPaths'],
    },
};

export const provideFeedbackTool: Tool = {
    name: 'protokoll_provide_feedback',
    description:
        'Provide natural language feedback to correct a transcript. ' +
        'Path is relative to the configured output directory. ' +
        'The feedback is processed by an agentic model that can: ' +
        '- Fix spelling and term errors ' +
        '- Add new terms, people, or companies to context ' +
        '- Change project assignment ' +
        '- Update the title ' +
        'Example: "YB should be Wibey" or "San Jay Grouper is actually Sanjay Gupta"',
    inputSchema: {
        type: 'object',
        properties: {
            transcriptPath: {
                type: 'string',
                description: 
                    'Transcript URI (preferred) or relative path from output directory. ' +
                    'URI format: "protokoll://transcript/2026/2/12-1606-meeting" (no file extension). ' +
                    'Path format: "2026/2/12-1606-meeting" or "2026/2/12-1606-meeting.pkl"',
            },
            feedback: {
                type: 'string',
                description: 'Natural language feedback describing corrections needed',
            },
            model: {
                type: 'string',
                description: 'LLM model for processing feedback (default: gpt-5.2)',
            },
            contextDirectory: {
                type: 'string',
                description: 'Optional: Path to the .protokoll context directory',
            },
        },
        required: ['transcriptPath', 'feedback'],
    },
};

export const enhanceTranscriptTool: Tool = {
    name: 'protokoll_enhance_transcript',
    description:
        'Enhance an existing transcript using the same post-transcription pipeline flow ' +
        '(simple-replace + agentic tool-based enhancement) used after Whisper completes. ' +
        'Reads from originalText when provided, otherwise uses raw transcript text if available, ' +
        'falling back to current transcript content. Writes enhanced content and updates metadata/status.',
    inputSchema: {
        type: 'object',
        properties: {
            transcriptPath: {
                type: 'string',
                description:
                    'Transcript URI (preferred) or relative path from output directory. ' +
                    'URI format: "protokoll://transcript/2026/2/12-1606-meeting" (no file extension). ' +
                    'Path format: "2026/2/12-1606-meeting" or "2026/2/12-1606-meeting.pkl"',
            },
            originalText: {
                type: 'string',
                description:
                    'Optional explicit source text to enhance (usually the Original tab text). ' +
                    'If omitted, tool uses raw transcript text when present, else current content.',
            },
            model: {
                type: 'string',
                description: `LLM model for enhancement (default: ${DEFAULT_MODEL})`,
            },
            contextDirectory: {
                type: 'string',
                description: 'Optional: Path to the .protokoll context directory',
            },
        },
        required: ['transcriptPath'],
    },
};

export const updateTranscriptContentTool: Tool = {
    name: 'protokoll_update_transcript_content',
    description:
        'Update the content section of a transcript file while preserving all metadata. ' +
        'Path is relative to the configured output directory. ' +
        'This tool replaces only the content between the --- delimiters, keeping all metadata intact. ' +
        'IMPORTANT: The content parameter should contain ONLY the transcript body text (the text after the --- delimiter), ' +
        'NOT the full transcript file with headers and metadata. If the full transcript is provided, ' +
        'the tool will automatically extract only the content section to prevent duplication.',
    inputSchema: {
        type: 'object',
        properties: {
            transcriptPath: {
                type: 'string',
                description: 
                    'Transcript URI (preferred) or relative path from output directory. ' +
                    'URI format: "protokoll://transcript/2026/2/12-1606-meeting" (no file extension). ' +
                    'Path format: "2026/2/12-1606-meeting" or "2026/2/12-1606-meeting.pkl"',
            },
            content: {
                type: 'string',
                description: 
                    'New content to replace the transcript body. ' +
                    'Should contain ONLY the body text (content after the --- delimiter). ' +
                    'If the full transcript is provided, the tool will extract only the content section automatically.',
            },
            contentTarget: {
                type: 'string',
                enum: ['enhanced', 'original'],
                description:
                    'Which content stream to update. ' +
                    '"enhanced" updates transcript content (default). ' +
                    '"original" updates raw transcript text only and never modifies enhanced content.',
            },
            contextDirectory: {
                type: 'string',
                description: 'Optional: Path to the .protokoll context directory',
            },
        },
        required: ['transcriptPath', 'content'],
    },
};

export const updateTranscriptEntityReferencesTool: Tool = {
    name: 'protokoll_update_transcript_entity_references',
    description:
        'Update the Entity References section of a transcript file while preserving all other content. ' +
        'Path is relative to the configured output directory. ' +
        'This tool replaces only the Entity References section at the end of the transcript, ' +
        'preserving the title, metadata, and body content.',
    inputSchema: {
        type: 'object',
        properties: {
            transcriptPath: {
                type: 'string',
                description: 
                    'Transcript URI (preferred) or relative path from output directory. ' +
                    'URI format: "protokoll://transcript/2026/2/12-1606-meeting" (no file extension). ' +
                    'Path format: "2026/2/12-1606-meeting" or "2026/2/12-1606-meeting.pkl"',
            },
            entities: {
                type: 'object',
                description: 'Entity references to update',
                properties: {
                    people: {
                        type: 'array',
                        items: {
                            type: 'object',
                            properties: {
                                id: { type: 'string', description: 'Entity ID (slugified identifier)' },
                                name: { type: 'string', description: 'Display name' },
                            },
                            required: ['id', 'name'],
                        },
                    },
                    projects: {
                        type: 'array',
                        items: {
                            type: 'object',
                            properties: {
                                id: { type: 'string', description: 'Entity ID (slugified identifier)' },
                                name: { type: 'string', description: 'Display name' },
                            },
                            required: ['id', 'name'],
                        },
                    },
                    terms: {
                        type: 'array',
                        items: {
                            type: 'object',
                            properties: {
                                id: { type: 'string', description: 'Entity ID (slugified identifier)' },
                                name: { type: 'string', description: 'Display name' },
                            },
                            required: ['id', 'name'],
                        },
                    },
                    companies: {
                        type: 'array',
                        items: {
                            type: 'object',
                            properties: {
                                id: { type: 'string', description: 'Entity ID (slugified identifier)' },
                                name: { type: 'string', description: 'Display name' },
                            },
                            required: ['id', 'name'],
                        },
                    },
                },
            },
            contextDirectory: {
                type: 'string',
                description: 'Optional: Path to the .protokoll context directory',
            },
        },
        required: ['transcriptPath', 'entities'],
    },
};

export const createNoteTool: Tool = {
    name: 'protokoll_create_note',
    description:
        'Create a new note/transcript file in the configured output directory. ' +
        'The file will be created with proper metadata formatting and placed in a date-based directory structure (YYYY/MM/). ' +
        'Returns the relative path to the created file.',
    inputSchema: {
        type: 'object',
        properties: {
            title: {
                type: 'string',
                description: 'Title for the note/transcript',
            },
            content: {
                type: 'string',
                description: 'Content/body text for the note (optional, can be empty)',
                default: '',
            },
            projectId: {
                type: 'string',
                description: 'Optional: Project ID to assign to the note',
            },
            tags: {
                type: 'array',
                items: { type: 'string' },
                description: 'Optional: Tags to add to the note',
            },
            date: {
                type: 'string',
                description: 'Optional: Date for the note (ISO 8601 format, e.g., "2026-02-02"). Defaults to current date.',
            },
            contextDirectory: {
                type: 'string',
                description: 'Optional: Path to the .protokoll context directory',
            },
        },
        required: ['title'],
    },
};

export const getEnhancementLogTool: Tool = {
    name: 'protokoll_get_enhancement_log',
    description:
        'Get the enhancement log for a transcript. ' +
        'Returns a timestamped audit trail of enhancement pipeline steps (transcribe, enhance, simple-replace phases). ' +
        'Shows what happened during processing: entities found, corrections applied, tools called, etc.',
    inputSchema: {
        type: 'object',
        properties: {
            transcriptPath: {
                type: 'string',
                description: 
                    'Transcript URI (preferred) or relative path from output directory. ' +
                    'URI format: "protokoll://transcript/2026/2/12-1606-meeting" (no file extension). ' +
                    'Path format: "2026/2/12-1606-meeting" or "2026/2/12-1606-meeting.pkl"',
            },
            phase: {
                type: 'string',
                enum: ['transcribe', 'enhance', 'simple-replace'],
                description: 'Optional: Filter to a specific phase',
            },
            limit: {
                type: 'number',
                description: 'Maximum number of entries to return (default: 100)',
            },
            offset: {
                type: 'number',
                description: 'Number of entries to skip for pagination (default: 0)',
            },
            contextDirectory: {
                type: 'string',
                description: 'Optional: Path to the .protokoll context directory',
            },
        },
        required: ['transcriptPath'],
    },
};

export const correctToEntityTool: Tool = {
    name: 'protokoll_correct_to_entity',
    description:
        'Correct misheard text in transcript by mapping to existing or new entity. ' +
        'Atomically updates transcript content, adds misspelling to entity sounds_like array, ' +
        'updates entity references, and logs the correction to enhancement_log. ' +
        'This is the primary mechanism for training the transcription system. ' +
        'Context directory is resolved from server configuration.',
    inputSchema: {
        type: 'object',
        properties: {
            transcriptPath: {
                type: 'string',
                description:
                    'Transcript URI (preferred) or relative path from output directory. ' +
                    'URI format: "protokoll://transcript/2026/2/12-1606-meeting" (no file extension). ' +
                    'Path format: "2026/2/12-1606-meeting" or "2026/2/12-1606-meeting.pkl"',
            },
            selectedText: {
                type: 'string',
                description: 'The misheard text to correct',
            },
            entityType: {
                type: 'string',
                enum: ['person', 'project', 'term', 'company'],
                description: 'Type of entity',
            },
            entityId: {
                type: 'string',
                description: 'ID of existing entity (for map-to-existing flow)',
            },
            entityName: {
                type: 'string',
                description: 'Name of new entity to create (for create-new flow)',
            },
            firstName: {
                type: 'string',
                description: 'First name (person entities only)',
            },
            lastName: {
                type: 'string',
                description: 'Last name (person entities only)',
            },
            description: {
                type: 'string',
                description: 'Description/context for the new entity',
            },
            projectId: {
                type: 'string',
                description: 'Associated project ID (person entities only)',
            },
            contextDirectory: {
                type: 'string',
                description: 'Optional: Path to the .protokoll context directory',
            },
        },
        required: ['transcriptPath', 'selectedText', 'entityType'],
    },
};

export const rejectCorrectionTool: Tool = {
    name: 'protokoll_reject_correction',
    description:
        'Reject a previously applied enhancement correction and undo its text replacement in the transcript. ' +
        'Also logs the rejection in enhancement_log for auditability.',
    inputSchema: {
        type: 'object',
        properties: {
            transcriptPath: {
                type: 'string',
                description:
                    'Transcript URI (preferred) or relative path from output directory. ' +
                    'URI format: "protokoll://transcript/2026/2/12-1606-meeting" (no file extension). ' +
                    'Path format: "2026/2/12-1606-meeting" or "2026/2/12-1606-meeting.pkl"',
            },
            correctionEntryId: {
                type: 'number',
                description: 'Enhancement log entry id for the correction_applied event to reject',
            },
            contextDirectory: {
                type: 'string',
                description: 'Optional: Path to the .protokoll context directory',
            },
        },
        required: ['transcriptPath', 'correctionEntryId'],
    },
};

// ============================================================================
// Tool Handlers
// ============================================================================

export async function handleReadTranscript(args: { 
    transcriptPath: string;
    contextDirectory?: string;
}) {
    const access = await openToolTranscript(args.transcriptPath, args.contextDirectory);
    let summaries: StoredSummary[] = [];
    let transcriptData: Awaited<ReturnType<typeof readTranscriptFromStorage>>;
    try {
        // Use protokoll-format storage API directly - returns structured JSON
        transcriptData = await readTranscriptFromStorage(access.pklPath);

        const transcriptHandle = PklTranscript.open(access.pklPath, { readOnly: true });
        try {
            const historyArtifact = transcriptHandle.getArtifact('summary_history');
            const rawHistory = historyArtifact?.data?.toString('utf8') || '[]';
            summaries = parseStoredSummaries(rawHistory);
        } finally {
            transcriptHandle.close();
        }
    } finally {
        await access.finalize(false);
    }

    // Convert to relative path for response
    const relativePath = access.storagePath
        ? await sanitizePath(access.storagePath, access.outputDirectory)
        : await sanitizePath(access.pklPath, access.outputDirectory);

    // Return complete structured JSON for client display
    // Clients should NOT need to parse this - all data is ready to display
    return {
        filePath: relativePath,
        title: transcriptData.metadata.title || '',
        metadata: {
            date: transcriptData.metadata.date?.toISOString() || null,
            recordingTime: transcriptData.metadata.recordingTime || null,
            duration: transcriptData.metadata.duration || null,
            project: transcriptData.metadata.project || null,
            projectId: transcriptData.metadata.projectId || null,
            tags: transcriptData.metadata.tags || [],
            status: transcriptData.metadata.status || 'initial',
            confidence: transcriptData.metadata.confidence || null,
            routing: transcriptData.metadata.routing || null,
            history: transcriptData.metadata.history || [],
            tasks: transcriptData.metadata.tasks || [],
            comments: (transcriptData.metadata as TranscriptMetadataWithComments).comments || [],
            entities: transcriptData.metadata.entities || {},
        },
        content: transcriptData.content,
        hasRawTranscript: transcriptData.hasRawTranscript,
        contentLength: transcriptData.content.length,
        summaries,
    };
}

export async function handleListTranscripts(args: {
    directory?: string;
    limit?: number;
    offset?: number;
    sortBy?: 'date' | 'filename' | 'title';
    startDate?: string;
    endDate?: string;
    search?: string;
    entityId?: string;
    entityType?: 'person' | 'project' | 'term' | 'company';
    contextDirectory?: string;
}) {
    const ServerConfig = await import('../serverConfig');
    const outputStorage = ServerConfig.getOutputStorage();

    // Get directory from args or config
    const directory = args.directory 
        ? resolve(args.directory)
        : await getConfiguredDirectory('outputDirectory', args.contextDirectory);

    if (outputStorage.name !== 'gcs' && !await fileExists(directory)) {
        throw new Error(`Directory not found: ${directory}`);
    }

    // Use protokoll-format storage API directly
    const result = await listTranscriptsFromStorage({
        directory,
        limit: args.limit ?? 50,
        offset: args.offset ?? 0,
        sortBy: args.sortBy ?? 'date',
        startDate: args.startDate,
        endDate: args.endDate,
        search: args.search,
        entityId: args.entityId,
        entityType: args.entityType,
    });

    // Convert all paths to relative paths from output directory
    const outputDirectory = await getConfiguredDirectory('outputDirectory', args.contextDirectory);
    const relativeTranscripts = await Promise.all(
        result.transcripts.map(async (t) => ({
            path: await sanitizePath(t.filePath, outputDirectory),
            relativePath: t.relativePath,
            title: t.title,
            date: t.date?.toISOString() || null,
            project: t.project || null,
            tags: t.tags,
            status: t.status,
            duration: t.duration || null,
            contentPreview: t.contentPreview,
        }))
    );

    return {
        directory: await sanitizePath(directory, outputDirectory) || '.',
        transcripts: relativeTranscripts,
        pagination: {
            total: result.total,
            limit: args.limit ?? 50,
            offset: args.offset ?? 0,
            hasMore: result.hasMore,
            nextOffset: result.hasMore ? (args.offset ?? 0) + (args.limit ?? 50) : null,
        },
        filters: {
            sortBy: args.sortBy ?? 'date',
            startDate: args.startDate,
            endDate: args.endDate,
            search: args.search,
            entityId: args.entityId,
            entityType: args.entityType,
        },
    };
}

export async function handleIdentifyTasksFromTranscript(args: {
    transcriptPath: string;
    maxCandidates?: number;
    includeTagSuggestions?: boolean;
    contextDirectory?: string;
}) {
    const access = await openToolTranscript(args.transcriptPath, args.contextDirectory);
    let transcriptData: Awaited<ReturnType<typeof readTranscriptFromStorage>>;
    try {
        transcriptData = await readTranscriptFromStorage(access.pklPath);
    } finally {
        await access.finalize(false);
    }

    const content = transcriptData.content?.trim() || '';
    if (!content) {
        return {
            transcriptPath: args.transcriptPath,
            candidates: [] as TaskCandidate[],
            totalCandidates: 0,
            message: 'Transcript content is empty; no task candidates identified.',
        };
    }

    const limit = Math.max(1, Math.min(50, args.maxCandidates ?? 25));
    const includeTagSuggestions = args.includeTagSuggestions !== false;
    const existingTags = transcriptData.metadata.tags || [];
    const suggestedEntities = getSuggestedEntities(transcriptData.metadata.entities);
    const suggestedProject = {
        id: transcriptData.metadata.projectId || null,
        name: transcriptData.metadata.project || null,
    };

    const candidates = splitIntoCandidateSentences(content)
        .map((sentence, index) => {
            const scored = scoreTaskCandidate(sentence);
            if (!scored) {
                return null;
            }

            const sentenceTags = includeTagSuggestions ? extractHashtagTags(sentence) : [];
            const mergedTags = includeTagSuggestions
                ? Array.from(new Set([...existingTags.map((tag) => tag.toLowerCase()), ...sentenceTags]))
                : [];

            const candidate: TaskCandidate = {
                id: `candidate-${index + 1}`,
                taskText: normalizeTaskText(sentence),
                confidence: scored.score,
                confidenceBucket: toConfidenceBucket(scored.score),
                rationale: scored.rationale,
                sourceExcerpt: sentence,
                suggestedDueDate: inferDueDate(sentence),
                suggestedProject,
                suggestedEntities,
                suggestedTags: mergedTags,
            };

            return candidate;
        })
        .filter((candidate): candidate is TaskCandidate => candidate !== null)
        .sort((a, b) => b.confidence - a.confidence)
        .slice(0, limit);

    return {
        transcriptPath: args.transcriptPath,
        candidates,
        totalCandidates: candidates.length,
        message: candidates.length > 0
            ? `Identified ${candidates.length} task candidate(s).`
            : 'No likely task candidates found in transcript content.',
    };
}

export async function handleSummarizeTranscript(args: {
    transcriptPath: string;
    audience?: string;
    stylePreset?: 'quick_bullets' | 'detailed' | 'attendee_facing' | string;
    guidance?: string;
    summaryTitle?: string;
    model?: string;
    contextDirectory?: string;
}) {
    const startedAt = Date.now();
    const logSummary = (message: string, data: Record<string, unknown>) => {
        process.stdout.write(`Protokoll: [SUMMARY] ${message} ${JSON.stringify(data)}\n`);
    };

    logSummary('Tool call received', {
        transcriptPath: args.transcriptPath,
        audience: args.audience,
        stylePreset: args.stylePreset || 'detailed',
        hasGuidance: !!args.guidance?.trim(),
        hasSummaryTitle: !!args.summaryTitle?.trim(),
        model: args.model || DEFAULT_MODEL,
    });

    const access = await openToolTranscript(args.transcriptPath, args.contextDirectory);
    const absolutePath = access.pklPath;
    let persistSummaryHistory = false;
    try {
        logSummary('Resolved transcript path', {
            transcriptPath: args.transcriptPath,
            absolutePath,
        });

        const transcriptData = await readTranscriptFromStorage(absolutePath);

        const transcriptContent = (transcriptData.content || '').trim();
        if (!transcriptContent) {
            logSummary('Transcript content empty, cannot summarize', {
                transcriptPath: args.transcriptPath,
                absolutePath,
            });
            throw new Error('Transcript content is empty; cannot generate summary.');
        }

        const audience = (args.audience || '').trim() || 'General audience';

        const stylePreset = (args.stylePreset || 'detailed').trim();
        const selectedStyle = SUMMARY_STYLE_PRESETS[stylePreset] || SUMMARY_STYLE_PRESETS.detailed;
        const guidance = (args.guidance || '').trim();
        const model = args.model || DEFAULT_MODEL;

        const transcriptTitle = transcriptData.metadata.title || 'Untitled transcript';
        const transcriptDate = transcriptData.metadata.date instanceof Date
            ? transcriptData.metadata.date.toISOString().slice(0, 10)
            : 'unknown date';
        const preferredTitle = (args.summaryTitle || '').trim();

        const boundedContent = transcriptContent.length > MAX_CONTENT_LENGTH
            ? `${transcriptContent.slice(0, MAX_CONTENT_LENGTH)}\n\n[...transcript truncated for summarization input length...]`
            : transcriptContent;
        const truncated = transcriptContent.length > MAX_CONTENT_LENGTH;
        logSummary('Prepared summary input', {
            transcriptTitle,
            transcriptDate,
            transcriptLength: transcriptContent.length,
            boundedLength: boundedContent.length,
            truncated,
            stylePreset,
        });

        const reasoning = Reasoning.create({
            model,
            reasoningLevel: 'medium',
        });

        const prompt = [
            'Create an audience-aware summary for the transcript below.',
            '',
            `Transcript title: ${transcriptTitle}`,
            `Transcript date: ${transcriptDate}`,
            `Audience: ${audience}`,
            `Style preset: ${selectedStyle.label}`,
            preferredTitle ? `Preferred summary title: ${preferredTitle}` : 'Preferred summary title: (generate one)',
            '',
            'Style instructions:',
            selectedStyle.instructions,
            '',
            'Privacy and sensitivity guardrails:',
            '- Treat transcript content as potentially sensitive by default.',
            '- Exclude private internal reflections, personal judgments, or sensitive notes not appropriate for the audience.',
            '- If unsure whether a detail is audience-appropriate, exclude it or generalize safely.',
            '- Prefer factual and neutral language over speculative interpretation.',
            '',
            'Additional guidance:',
            guidance || 'No extra guidance provided.',
            '',
            'Required output shape:',
            '1) Title',
            '2) Summary body matching the selected style preset',
            '3) Optional "Redactions / Exclusions" section listing what was intentionally omitted for audience safety',
            '',
            'Transcript:',
            boundedContent,
        ].join('\n');

        const result = await reasoning.complete({
            prompt,
            systemPrompt: 'You are an expert meeting summarizer. Return markdown only.',
        });
        logSummary('Reasoning call completed', {
            transcriptPath: args.transcriptPath,
            model: result.model || model,
            durationMs: result.duration ?? null,
            finishReason: result.finishReason ?? null,
        });

        const summary = (result.content || '').trim();
        if (!summary) {
            logSummary('Empty summary response', {
                transcriptPath: args.transcriptPath,
                model: result.model || model,
            });
            throw new Error('No summary text generated.');
        }

        logSummary('Summary generated successfully', {
            transcriptPath: args.transcriptPath,
            summaryLength: summary.length,
            elapsedMs: Date.now() - startedAt,
        });

        const generatedAt = new Date().toISOString();
        const summaryId = `summary-${Date.now()}-${randomUUID().slice(0, 8)}`;
        const stylePresetKey = SUMMARY_STYLE_PRESETS[stylePreset] ? stylePreset : 'detailed';
        const storedSummary: StoredSummary = {
            id: summaryId,
            title: preferredTitle || `${transcriptTitle} Summary`,
            audience,
            guidance,
            stylePreset: stylePresetKey,
            styleLabel: selectedStyle.label,
            content: summary,
            generatedAt,
        };
        const transcriptHandle = PklTranscript.open(absolutePath, { readOnly: false });
        try {
            const existingHistory = transcriptHandle.getArtifact('summary_history');
            const existingSummaries = parseStoredSummaries(existingHistory?.data?.toString('utf8') || '[]');
            const nextSummaries = [storedSummary, ...existingSummaries.filter((entry) => entry.id !== summaryId)];

            transcriptHandle.addArtifact(
                'summary_history',
                Buffer.from(JSON.stringify(nextSummaries), 'utf8'),
                {
                    version: 1,
                    count: nextSummaries.length,
                    updatedAt: generatedAt,
                    model: result.model || model,
                }
            );
        } finally {
            transcriptHandle.close();
        }
        persistSummaryHistory = true;
        logSummary('Summary persisted to transcript artifact storage', {
            transcriptPath: args.transcriptPath,
            summaryId,
            generatedAt,
        });

        return {
            summary,
            audience,
            stylePreset: stylePresetKey,
            model: result.model || model,
            summaryId,
            generatedAt,
        };
    } finally {
        await access.finalize(persistSummaryHistory);
    }
}

export async function handleDeleteTranscriptSummary(args: {
    transcriptPath: string;
    summaryId: string;
    contextDirectory?: string;
}) {
    const summaryId = (args.summaryId || '').trim();
    if (!summaryId) {
        throw new Error('summaryId is required');
    }

    const access = await openToolTranscript(args.transcriptPath, args.contextDirectory);
    const transcriptHandle = PklTranscript.open(access.pklPath, { readOnly: false });
    try {
        const historyArtifact = transcriptHandle.getArtifact('summary_history');
        const existingSummaries = parseStoredSummaries(historyArtifact?.data?.toString('utf8') || '[]');
        const remainingSummaries = existingSummaries.filter((entry) => entry.id !== summaryId);

        if (remainingSummaries.length === existingSummaries.length) {
            throw new Error(`Summary not found: ${summaryId}`);
        }

        transcriptHandle.addArtifact(
            'summary_history',
            Buffer.from(JSON.stringify(remainingSummaries), 'utf8'),
            {
                version: 1,
                count: remainingSummaries.length,
                updatedAt: new Date().toISOString(),
                deletedSummaryId: summaryId,
            }
        );

        return {
            success: true,
            summaryId,
            remaining: remainingSummaries.length,
        };
    } finally {
        transcriptHandle.close();
        await access.finalize(true);
    }
}

export async function handleEditTranscript(args: {
    transcriptPath: string;
    title?: string;
    projectId?: string;
    tagsToAdd?: string[];
    tagsToRemove?: string[];
    comments?: TranscriptCommentInput[];
    status?: string;
    contextDirectory?: string;
}) {
    // Validate that contextDirectory is not provided in remote mode
    await validateNotRemoteMode(args.contextDirectory);
    
    // Get the output directory first to ensure consistent validation
    const outputDirectory = await getConfiguredDirectory('outputDirectory', args.contextDirectory);
    
    const ServerConfig = await import('../serverConfig');
    const outputStorage = ServerConfig.getOutputStorage();
    const serverContext = ServerConfig.getContext();

    if (outputStorage.name === 'gcs') {
        const access = await openToolTranscript(args.transcriptPath, args.contextDirectory);
        const resolvedStoragePath = access.storagePath || access.pklPath;
        let persistChanges = false;

        let statusChanged = false;
        let previousStatus: string | undefined;
        const changes: string[] = [];
        try {
            const transcript = PklTranscript.open(access.pklPath, { readOnly: false });
            try {
                const metadataUpdates: Partial<TranscriptMetadataWithComments> = {};

                if (args.title) {
                    metadataUpdates.title = args.title.trim();
                    changes.push('title updated');
                }
                if (args.projectId) {
                    const context = await getProjectLookupContext(args.contextDirectory);
                    const project = await context.getProject(args.projectId);
                    let resolvedId: string;
                    let resolvedName: string;
                    if (project) {
                        resolvedId = project.id;
                        resolvedName = project.name;
                    } else {
                        const gcsEntity = await findContextEntityInGcs('project', args.projectId);
                        if (gcsEntity && typeof gcsEntity.id === 'string' && typeof gcsEntity.name === 'string') {
                            resolvedId = gcsEntity.id;
                            resolvedName = gcsEntity.name;
                        } else {
                            throw new Error(`Project not found: ${args.projectId}`);
                        }
                    }

                    metadataUpdates.projectId = resolvedId;
                    metadataUpdates.project = resolvedName;

                    const existingEntities = transcript.metadata.entities || {
                        people: [],
                        projects: [],
                        terms: [],
                        companies: [],
                    };
                    metadataUpdates.entities = {
                        people: existingEntities.people || [],
                        projects: [{
                            id: resolvedId,
                            name: resolvedName,
                            type: 'project',
                        }],
                        terms: existingEntities.terms || [],
                        companies: existingEntities.companies || [],
                    };

                    changes.push('project changed');
                }
                if (args.tagsToAdd || args.tagsToRemove) {
                    const currentTags = transcript.metadata.tags || [];
                    let nextTags = [...currentTags];
                    if (args.tagsToAdd?.length) {
                        for (const tag of args.tagsToAdd) {
                            if (!nextTags.includes(tag)) {
                                nextTags.push(tag);
                            }
                        }
                        changes.push(`${args.tagsToAdd.length} tag(s) added`);
                    }
                    if (args.tagsToRemove?.length) {
                        nextTags = nextTags.filter(tag => !args.tagsToRemove!.includes(tag));
                        changes.push(`${args.tagsToRemove.length} tag(s) removed`);
                    }
                    metadataUpdates.tags = nextTags;
                }

                if (args.status) {
                    previousStatus = transcript.metadata.status || 'reviewed';
                    if (previousStatus !== args.status) {
                        metadataUpdates.status = args.status as Metadata.TranscriptStatus;
                        statusChanged = true;
                        changes.push(`status: ${previousStatus} → ${args.status}`);
                    } else {
                        changes.push(`status unchanged (already ${args.status})`);
                    }
                }
                if (args.comments) {
                    metadataUpdates.comments = normalizeTranscriptComments(args.comments);
                    changes.push(`comments updated (${metadataUpdates.comments.length})`);
                }

                if (Object.keys(metadataUpdates).length > 0) {
                    transcript.updateMetadata(metadataUpdates as Partial<TranscriptMetadata>);
                }
            } finally {
                transcript.close();
            }
            persistChanges = true;

            return {
                success: true,
                originalPath: await sanitizePath(resolvedStoragePath, outputDirectory),
                outputPath: await sanitizePath(resolvedStoragePath, outputDirectory),
                renamed: false,
                statusChanged,
                message: changes.length > 0 ? `Transcript updated: ${changes.join(', ')}` : 'No changes made',
            };
        } finally {
            await access.finalize(persistChanges);
        }
    }

    // Find the transcript (returns absolute path for file operations)
    const absolutePath = await resolveTranscriptPath(args.transcriptPath, args.contextDirectory);

    // Validate status if provided
    if (args.status && !Metadata.isValidStatus(args.status)) {
        throw new Error(
            `Invalid status "${args.status}". ` +
            `Valid statuses are: ${Metadata.VALID_STATUSES.join(', ')}`
        );
    }

    if (!args.title && !args.projectId && !args.tagsToAdd && !args.tagsToRemove && !args.comments && !args.status) {
        throw new Error('Must specify at least one of: title, projectId, tagsToAdd, tagsToRemove, comments, or status');
    }

    let finalOutputPath = absolutePath;
    let wasRenamed = false;
    
    // Handle title/project/tags changes via existing editTranscript function
    // The editTranscript function handles PKL files directly
    if (args.title || args.projectId || args.tagsToAdd || args.tagsToRemove) {
        // Resolve context directories from the running server context (preferred)
        // or fall back to protokoll-config.yaml. The engine's editTranscript creates
        // a fresh Context.create() — it needs explicit contextDirectories so it can
        // find entities without walking up from the transcript's deep output path.
        let contextDirectories = await getContextDirectories();
        if ((!contextDirectories || contextDirectories.length === 0) && serverContext?.hasContext()) {
            contextDirectories = serverContext.getContextDirs();
        }

        const result = await Transcript.editTranscript(absolutePath, {
            title: args.title,
            projectId: args.projectId,
            tagsToAdd: args.tagsToAdd,
            tagsToRemove: args.tagsToRemove,
            contextDirectory: args.contextDirectory,
            contextDirectories,
        });

        // Validate that the output path stays within the output directory
        validatePathWithinDirectory(result.outputPath, outputDirectory);

        // editTranscript handles file operations internally for PKL files
        if (result.outputPath !== absolutePath) {
            wasRenamed = true;
        }
        
        finalOutputPath = result.outputPath;
    }

    // Handle status change using PklTranscript
    let statusChanged = false;
    let previousStatus: string | undefined;
    
    if (args.status) {
        const pklPath = ensurePklExtension(finalOutputPath);
        const transcript = PklTranscript.open(pklPath, { readOnly: false });
        try {
            previousStatus = transcript.metadata.status || 'reviewed';
            
            if (previousStatus !== args.status) {
                transcript.updateMetadata({ status: args.status as Metadata.TranscriptStatus });
                statusChanged = true;
                logger.info('transcript.status.update.complete', {
                    transcriptPath: args.transcriptPath,
                    previousStatus,
                    nextStatus: args.status,
                });
            }
        } finally {
            transcript.close();
        }
    }

    if (args.comments) {
        const pklPath = ensurePklExtension(finalOutputPath);
        const transcript = PklTranscript.open(pklPath, { readOnly: false });
        try {
            transcript.updateMetadata({ comments: normalizeTranscriptComments(args.comments) } as Partial<TranscriptMetadata>);
        } finally {
            transcript.close();
        }
    }

    // Convert to relative paths for response
    const relativeOriginalPath = await sanitizePath(absolutePath || '', outputDirectory);
    const relativeOutputPath = await sanitizePath(finalOutputPath || '', outputDirectory);

    // Build message
    const changes: string[] = [];
    if (wasRenamed) changes.push(`moved to ${relativeOutputPath}`);
    if (args.title) changes.push(`title updated`);
    if (args.projectId) changes.push(`project changed`);
    if (args.tagsToAdd?.length) changes.push(`${args.tagsToAdd.length} tag(s) added`);
    if (args.tagsToRemove?.length) changes.push(`${args.tagsToRemove.length} tag(s) removed`);
    if (args.comments) changes.push(`comments updated (${normalizeTranscriptComments(args.comments).length})`);
    if (statusChanged) changes.push(`status: ${previousStatus} → ${args.status}`);
    if (!statusChanged && args.status) changes.push(`status unchanged (already ${args.status})`);

    return {
        success: true,
        originalPath: relativeOriginalPath,
        outputPath: relativeOutputPath,
        renamed: wasRenamed,
        statusChanged,
        message: changes.length > 0 ? `Transcript updated: ${changes.join(', ')}` : 'No changes made',
    };
}

export async function handleChangeTranscriptDate(args: {
    transcriptPath: string;
    newDate: string;
    contextDirectory?: string;
}) {
    const fsPromises = await import('node:fs/promises');
    const path = await import('node:path');
    
    // Parse the new date
    const newDate = new Date(args.newDate);
    if (isNaN(newDate.getTime())) {
        throw new Error(`Invalid date format: ${args.newDate}. Use ISO 8601 format (e.g., "2026-01-15" or "2026-01-15T10:30:00Z")`);
    }

    const access = await openToolTranscript(args.transcriptPath, args.contextDirectory);
    if (access.isGcs) {
        const transcript = PklTranscript.open(access.pklPath, { readOnly: false });
        try {
            transcript.updateMetadata({ date: newDate });
        } finally {
            transcript.close();
            await access.finalize(true);
        }

        const relativePath = access.storagePath
            ? await sanitizePath(access.storagePath, access.outputDirectory)
            : await sanitizePath(access.pklPath, access.outputDirectory);

        return {
            success: true,
            originalPath: relativePath,
            outputPath: relativePath,
            moved: false,
            message: 'Transcript date updated (GCS mode keeps the same object path).',
        };
    }

    // Get the output directory
    const outputDirectory = await getConfiguredDirectory('outputDirectory', args.contextDirectory);
    
    // Local mode: use already-resolved PKL path
    const absolutePath = access.pklPath;
    
    // Determine the new directory structure based on the date
    // Use YYYY/M structure (month-level organization, no zero-padding to match router convention)
    // Use UTC methods to avoid timezone issues with date-only strings
    const year = newDate.getUTCFullYear();
    const month = (newDate.getUTCMonth() + 1).toString(); // No zero-padding (e.g., "8" not "08")
    const newDirPath = path.join(outputDirectory, String(year), month);
    
    // Get the filename from the original path
    const filename = path.basename(absolutePath);
    const newAbsolutePath = path.join(newDirPath, filename);
    
    // Check if the file would move to a different location
    if (absolutePath === newAbsolutePath) {
        // Still update the date in metadata even if not moving
        const pklPath = ensurePklExtension(absolutePath);
        const transcript = PklTranscript.open(pklPath, { readOnly: false });
        try {
            transcript.updateMetadata({ date: newDate });
        } finally {
            transcript.close();
        }
        
        return {
            success: true,
            originalPath: await sanitizePath(pklPath, outputDirectory),
            outputPath: await sanitizePath(pklPath, outputDirectory),
            moved: false,
            message: 'Transcript date updated. No move needed (already in correct directory).',
        };
    }
    
    // Validate that the new path stays within the output directory
    validatePathWithinDirectory(newAbsolutePath, outputDirectory);
    
    // Create the new directory if it doesn't exist
    await mkdir(newDirPath, { recursive: true });
    
    // Check if a file already exists at the destination
    const destExists = await transcriptExists(newAbsolutePath);
    if (destExists.exists) {
        throw new Error(
            `A file already exists at the destination: ${await sanitizePath(destExists.path || newAbsolutePath, outputDirectory)}. ` +
            `Please rename the transcript first or choose a different date.`
        );
    }
    
    // Ensure we're working with PKL files
    const pklPath = ensurePklExtension(absolutePath);
    const newPklPath = ensurePklExtension(newAbsolutePath);
    
    // Update the date in metadata
    const transcript = PklTranscript.open(pklPath, { readOnly: false });
    try {
        transcript.updateMetadata({ date: newDate });
    } finally {
        transcript.close();
    }
    
    // Move the file to the new location
    await fsPromises.rename(pklPath, newPklPath);
    
    // Also move any associated WAL/SHM files if they exist
    const walPath = pklPath + '-wal';
    const shmPath = pklPath + '-shm';
    try {
        await fsPromises.rename(walPath, newPklPath + '-wal');
    } catch { /* ignore if doesn't exist */ }
    try {
        await fsPromises.rename(shmPath, newPklPath + '-shm');
    } catch { /* ignore if doesn't exist */ }
    
    // Convert to relative paths for response
    const relativeOriginalPath = await sanitizePath(pklPath, outputDirectory);
    const relativeOutputPath = await sanitizePath(newPklPath, outputDirectory);
    
    return {
        success: true,
        originalPath: relativeOriginalPath,
        outputPath: relativeOutputPath,
        moved: true,
        message: `Transcript moved from ${relativeOriginalPath} to ${relativeOutputPath}`,
    };
}

export async function handleCombineTranscripts(args: {
    transcriptPaths: string[];
    title?: string;
    projectId?: string;
    contextDirectory?: string;
}) {
    // Validate that contextDirectory is not provided in remote mode
    await validateNotRemoteMode(args.contextDirectory);

    const ServerConfig = await import('../serverConfig');
    const outputStorage = ServerConfig.getOutputStorage();
    if (outputStorage.name === 'gcs') {
        throw new Error(
            'Combining transcripts is not yet supported in GCS mode. ' +
            'Please run this operation against a filesystem-backed workspace.'
        );
    }
    
    if (args.transcriptPaths.length < 2) {
        throw new Error('At least 2 transcript files are required');
    }

    // Find all transcripts (returns absolute paths for file operations)
    const absolutePaths: string[] = [];
    for (const relativePath of args.transcriptPaths) {
        const absolute = await resolveTranscriptPath(relativePath, args.contextDirectory);
        absolutePaths.push(absolute);
    }

    // Resolve context directories from server config (preferred) and
    // fall back to active server context directories when available.
    const serverContext = ServerConfig.getContext();
    let contextDirectories = await getContextDirectories();
    if ((!contextDirectories || contextDirectories.length === 0) && serverContext?.hasContext()) {
        contextDirectories = serverContext.getContextDirs();
    }
    
    const result = await Transcript.combineTranscripts(absolutePaths, {
        title: args.title,
        projectId: args.projectId,
        contextDirectory: args.contextDirectory,
        contextDirectories,
    });

    // Validate that the output path stays within the output directory
    // This prevents project routing from writing files outside the allowed directory
    await validatePathWithinOutputDirectory(result.outputPath, args.contextDirectory);

    // The combineTranscripts function in operations.ts now creates the PKL file directly
    // No additional validation or writing needed here - the file is already saved

    // Delete source files
    const fsPromises = await import('node:fs/promises');
    const deletedFiles: string[] = [];
    for (const sourcePath of absolutePaths) {
        try {
            await fsPromises.unlink(sourcePath);
            deletedFiles.push(sourcePath);
        } catch {
            // Ignore deletion errors
        }
    }

    // Convert to relative paths for response
    const outputDirectory = await getConfiguredDirectory('outputDirectory', args.contextDirectory);
    const relativeOutputPath = await sanitizePath(result.outputPath || '', outputDirectory);
    const relativeSourceFiles = await Promise.all(
        absolutePaths.map(p => sanitizePath(p || '', outputDirectory))
    );
    const relativeDeletedFiles = await Promise.all(
        deletedFiles.map(p => sanitizePath(p || '', outputDirectory))
    );

    return {
        success: true,
        outputPath: relativeOutputPath,
        sourceFiles: relativeSourceFiles,
        deletedFiles: relativeDeletedFiles,
        message: `Combined ${absolutePaths.length} transcripts into: ${relativeOutputPath}`,
    };
}

export async function handleUpdateTranscriptContent(args: {
    transcriptPath: string;
    content: string;
    contentTarget?: 'enhanced' | 'original' | string;
    contextDirectory?: string;
}) {
    const updateRawTranscript = String(args.contentTarget || 'enhanced') === 'original';
    const access = await openToolTranscript(args.transcriptPath, args.contextDirectory);
    try {
        const transcript = PklTranscript.open(access.pklPath, { readOnly: false });
        try {
            if (updateRawTranscript) {
                const raw = transcript.hasRawTranscript ? transcript.rawTranscript : undefined;
                transcript.addArtifact(
                    'raw_transcript',
                    Buffer.from(args.content, 'utf8'),
                    {
                        model: raw?.model,
                        duration: raw?.duration,
                        transcribedAt: raw?.transcribedAt,
                        updatedAt: new Date().toISOString(),
                        updatedBy: 'protokoll_update_transcript_content',
                    }
                );
            } else {
                // Update the content - PklTranscript handles history tracking automatically
                transcript.updateContent(args.content);
            }
        } finally {
            transcript.close();
        }

        const relativePath = access.storagePath
            ? await sanitizePath(access.storagePath, access.outputDirectory)
            : await sanitizePath(access.pklPath, access.outputDirectory);

        return {
            success: true,
            filePath: relativePath,
            updatedTarget: updateRawTranscript ? 'original' : 'enhanced',
            message: updateRawTranscript
                ? 'Original transcript text updated successfully'
                : 'Transcript content updated successfully',
        };
    } finally {
        await access.finalize(true);
    }
}

export async function handleUpdateTranscriptEntityReferences(args: {
    transcriptPath: string;
    entities: {
        people?: Array<{ id: string; name: string }>;
        projects?: Array<{ id: string; name: string }>;
        terms?: Array<{ id: string; name: string }>;
        companies?: Array<{ id: string; name: string }>;
    };
    contextDirectory?: string;
}) {
    const access = await openToolTranscript(args.transcriptPath, args.contextDirectory);
    const absolutePath = access.pklPath;
    try {

        // Validate and sanitize entity IDs
        const validateEntityId = (id: string, name: string, type: string): string => {
            if (!id || typeof id !== 'string') {
                throw new Error(`Invalid entity ID for ${type} "${name}": ID must be a non-empty string`);
            }
        
            // Check for common JSON parsing errors
            if (id.includes('},') || id.includes('{') || id.includes('}') || id.includes(',')) {
                throw new Error(
                    `Invalid entity ID "${id}" for ${type} "${name}". ` +
                `Entity IDs should be UUIDs or slugified identifiers (e.g., "a1b2c3d4-...", "jack-smith"), ` +
                `not JSON syntax. Please provide a valid ID.`
                );
            }
        
            // Accept UUID format
            const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
            if (uuidRegex.test(id)) {
                return id.trim();
            }
        
            // Accept slug format for backward compatibility
            const slugRegex = /^[a-z0-9_-]+$/i;
            if (slugRegex.test(id)) {
                return id.trim();
            }
        
            throw new Error(
                `Invalid entity ID "${id}" for ${type} "${name}". ` +
            `Entity IDs should be UUIDs or slugified identifiers (letters, numbers, hyphens, underscores).`
            );
        };

        // Convert incoming entities to EntityReference format with validation
        const entityReferences: Metadata.EntityReference[] = [];
    
        if (args.entities.people) {
            entityReferences.push(...args.entities.people.map(e => ({
                id: validateEntityId(e.id, e.name, 'person'),
                name: e.name.trim(),
                type: 'person' as const,
            })));
        }
    
        if (args.entities.projects) {
            entityReferences.push(...args.entities.projects.map(e => ({
                id: validateEntityId(e.id, e.name, 'project'),
                name: e.name.trim(),
                type: 'project' as const,
            })));
        }
    
        if (args.entities.terms) {
            entityReferences.push(...args.entities.terms.map(e => ({
                id: validateEntityId(e.id, e.name, 'term'),
                name: e.name.trim(),
                type: 'term' as const,
            })));
        }
    
        if (args.entities.companies) {
            entityReferences.push(...args.entities.companies.map(e => ({
                id: validateEntityId(e.id, e.name, 'company'),
                name: e.name.trim(),
                type: 'company' as const,
            })));
        }

        // Group by type
        const entities: NonNullable<Metadata.TranscriptMetadata['entities']> = {
            people: entityReferences.filter(e => e.type === 'person'),
            projects: entityReferences.filter(e => e.type === 'project'),
            terms: entityReferences.filter(e => e.type === 'term'),
            companies: entityReferences.filter(e => e.type === 'company'),
        };

        // Ensure we're working with a PKL file
        const pklPath = ensurePklExtension(absolutePath);
    
        const transcript = PklTranscript.open(pklPath, { readOnly: false });
        const transcriptUuid = transcript.metadata.id;
        const projectId = transcript.metadata.project;
        try {
        // Update entities in metadata
            transcript.updateMetadata({ entities });
        } finally {
            transcript.close();
        }

        // Update weight model incrementally
        const { updateTranscriptInWeightModel } = await import('../services/weightModel');
        const allEntityIds = entityReferences.map(e => e.id);
        updateTranscriptInWeightModel(transcriptUuid, allEntityIds, projectId);

        // Convert to relative path for response
        const relativePath = access.storagePath
            ? await sanitizePath(access.storagePath, access.outputDirectory)
            : await sanitizePath(pklPath, access.outputDirectory);

        return {
            success: true,
            filePath: relativePath,
            message: 'Transcript entity references updated successfully',
        };
    } finally {
        await access.finalize(true);
    }
}

export async function handleProvideFeedback(args: {
    transcriptPath: string;
    feedback: string;
    model?: string;
    contextDirectory?: string;
}) {
    const access = await openToolTranscript(args.transcriptPath, args.contextDirectory);
    const absolutePath = access.pklPath;

    // Ensure we're working with a PKL file
    const pklPath = ensurePklExtension(absolutePath);
    
    const transcript = PklTranscript.open(pklPath, { readOnly: false });
    try {
        const transcriptContent = transcript.content;
        const context = await createToolContext(args.contextDirectory);
        const reasoning = Reasoning.create({ model: args.model || DEFAULT_MODEL });

        // Create a feedback context
        const feedbackCtx: Transcript.FeedbackContext = {
            transcriptPath: pklPath,
            transcriptContent,
            originalContent: transcriptContent,
            context,
            changes: [],
            verbose: false,
            dryRun: true, // Set to dry run so we can apply changes ourselves
        };

        await Transcript.processFeedback(args.feedback, feedbackCtx, reasoning);

        // Apply content changes to the PKL file
        if (feedbackCtx.changes.length > 0) {
            // Update content if it changed
            if (feedbackCtx.transcriptContent !== transcriptContent) {
                transcript.updateContent(feedbackCtx.transcriptContent);
            }
            
            // Handle title changes
            const titleChange = feedbackCtx.changes.find(c => c.type === 'title_changed');
            if (titleChange && titleChange.details.new_title) {
                transcript.updateMetadata({ title: titleChange.details.new_title as string });
            }
            
            // Handle project changes
            const projectChange = feedbackCtx.changes.find(c => c.type === 'project_changed');
            if (projectChange && projectChange.details.project_id) {
                transcript.updateMetadata({ 
                    projectId: projectChange.details.project_id as string,
                    project: projectChange.details.project_name as string | undefined,
                });
            }
        }

        // Convert to relative path for response
        const outputDirectory = await getConfiguredDirectory('outputDirectory', args.contextDirectory);
        const relativeOutputPath = await sanitizePath(pklPath, outputDirectory);

        return {
            success: true,
            changesApplied: feedbackCtx.changes.length,
            changes: feedbackCtx.changes.map(c => ({
                type: c.type,
                description: c.description,
            })),
            outputPath: relativeOutputPath,
            moved: false,
        };
    } finally {
        transcript.close();
        await access.finalize(true);
    }
}

export async function handleEnhanceTranscript(args: {
    transcriptPath: string;
    originalText?: string;
    model?: string;
    contextDirectory?: string;
}) {
    const access = await openToolTranscript(args.transcriptPath, args.contextDirectory);
    const pklPath = access.pklPath;
    const requestId = randomUUID();

    const transcript = PklTranscript.open(pklPath, { readOnly: false });

    let tempDir: string | null = null;

    try {
        const explicitOriginal = (args.originalText || '').trim();
        const rawOriginal = (transcript.rawTranscript?.text || '').trim();
        const currentContent = (transcript.content || '').trim();
        const sourceText = explicitOriginal || rawOriginal || currentContent;

        if (!sourceText) {
            throw new Error('No source text available to enhance. Save or provide Original content first.');
        }

        const model = args.model || DEFAULT_MODEL;
        const reasoningLevel = 'low' as const;
        const maxIterations = 20;
        const startedAt = Date.now();
        let toolCallCount = 0;
        logger.info('transcript.enhance.start', {
            requestId,
            transcriptPath: args.transcriptPath,
            model,
            sourceLength: sourceText.length,
            hasExplicitOriginal: explicitOriginal.length > 0,
            hasRawTranscript: rawOriginal.length > 0,
            contextDirectory: args.contextDirectory ?? null,
        });

        // Build context and routing similar to the standard pipeline.
        const context = await createToolContext(args.contextDirectory);
        const projectCount = context.getAllProjects().length;
        const peopleCount = context.getAllPeople().length;
        const termCount = context.getAllTerms().length;
        const companyCount = context.getAllCompanies().length;
        logger.info('transcript.enhance.context.loaded', {
            requestId,
            transcriptPath: args.transcriptPath,
            projectCount,
            peopleCount,
            termCount,
            companyCount,
        });
        const outputDirectory = await getConfiguredDirectory('outputDirectory', args.contextDirectory);
        const defaultStructure = 'month' as const;
        const defaultFilenameOptions = ['date', 'time', 'subject'] as const;
        const routingProjects: Routing.ProjectRoute[] = context.getAllProjects()
            .filter(project => project.active !== false)
            .map(project => ({
                projectId: project.id,
                destination: {
                    path: project.routing?.destination || outputDirectory,
                    structure: project.routing?.structure || defaultStructure,
                    filename_options: project.routing?.filename_options || [...defaultFilenameOptions],
                    createDirectories: true,
                },
                classification: project.classification,
                active: project.active,
                auto_tags: project.routing?.auto_tags,
            }));
        const routing = Routing.create({
            default: {
                path: outputDirectory,
                structure: defaultStructure,
                filename_options: [...defaultFilenameOptions],
                createDirectories: true,
            },
            projects: routingProjects,
            conflict_resolution: 'primary',
        }, context);

        const fallbackDate = transcript.metadata.date instanceof Date
            ? transcript.metadata.date
            : new Date();
        const fallbackHash = transcript.metadata.audioHash || transcript.metadata.id || '';
        const routingContext: Routing.RoutingContext = {
            transcriptText: sourceText,
            audioDate: fallbackDate,
            sourceFile: pklPath,
            hash: fallbackHash,
        };
        const routeResult = routing.route(routingContext);
        const projectForReplace = routeResult.projectId || transcript.metadata.projectId || transcript.metadata.project;

        transcript.enhancementLog.logStep(new Date(), 'enhance', 'enhancement_start', {
            model,
            reasoningLevel,
            maxIterations,
            transcriptPath: args.transcriptPath,
            hasExplicitOriginal: explicitOriginal.length > 0,
            source: explicitOriginal ? 'explicit_original_text' : (rawOriginal ? 'raw_transcript' : 'enhanced_content_fallback'),
            routedProject: routeResult.projectId || null,
            routedConfidence: routeResult.confidence,
            sourceLength: sourceText.length,
        });

        // Run simple-replace with the same engine phase used by audio processing.
        tempDir = await mkdtemp(resolve(tmpdir(), 'protokoll-enhance-'));
        const simpleReplace = Phases.createSimpleReplacePhase({ debug: false }, context);
        const simpleReplaceResult = await simpleReplace.replace(
            sourceText,
            {
                project: projectForReplace || undefined,
                confidence: routeResult.confidence,
            },
            tempDir,
            transcript.metadata.id || 'manual-enhancement'
        );
        logger.info('transcript.enhance.simple_replace.complete', {
            requestId,
            transcriptPath: args.transcriptPath,
            replacements: simpleReplaceResult.stats.totalReplacements,
            tier1Replacements: simpleReplaceResult.stats.tier1Replacements,
            tier2Replacements: simpleReplaceResult.stats.tier2Replacements,
            processingTimeMs: simpleReplaceResult.stats.processingTimeMs,
        });

        if (simpleReplaceResult.stats.totalReplacements > 0) {
            transcript.enhancementLog.logStep(new Date(), 'simple-replace', 'phase_complete', {
                totalReplacements: simpleReplaceResult.stats.totalReplacements,
                tier1Replacements: simpleReplaceResult.stats.tier1Replacements,
                tier2Replacements: simpleReplaceResult.stats.tier2Replacements,
                projectContext: simpleReplaceResult.stats.projectContext,
                processingTimeMs: simpleReplaceResult.stats.processingTimeMs,
            });
            for (const mapping of simpleReplaceResult.stats.appliedMappings) {
                transcript.enhancementLog.logStep(new Date(), 'simple-replace', 'correction_applied', {
                    original: mapping.soundsLike,
                    replacement: mapping.correctText,
                    tier: mapping.tier,
                    occurrences: mapping.occurrences,
                    entityId: mapping.entityId,
                    entityType: mapping.entityType,
                });
            }
        }

        const preIdentifiedEntities: Agentic.ToolContext['preIdentifiedEntities'] = {
            people: new Set<string>(),
            projects: new Set<string>(),
            terms: new Set<string>(),
            companies: new Set<string>(),
        };
        for (const mapping of simpleReplaceResult.stats.appliedMappings) {
            if (!mapping.entityId || !mapping.entityType) {
                continue;
            }
            if (mapping.entityType === 'person') {
                preIdentifiedEntities.people.add(mapping.entityId);
            } else if (mapping.entityType === 'project') {
                preIdentifiedEntities.projects.add(mapping.entityId);
            } else if (mapping.entityType === 'term') {
                preIdentifiedEntities.terms.add(mapping.entityId);
            }
        }

        logger.info('transcript.enhance.agentic.start', {
            requestId,
            transcriptPath: args.transcriptPath,
            routedProject: routeResult.projectId || null,
            routedConfidence: routeResult.confidence,
            preIdentifiedPeople: preIdentifiedEntities.people.size,
            preIdentifiedProjects: preIdentifiedEntities.projects.size,
            preIdentifiedTerms: preIdentifiedEntities.terms.size,
            sourceLength: simpleReplaceResult.text.length,
        });

        // Run agentic enhancement exactly like pipeline enhancement stage.
        const reasoning = Reasoning.create({ model, reasoningLevel });
        const toolContext: Agentic.ToolContext & {
            modelConfiguration?: { model: string; reasoningLevel?: string };
            onModelCallStart?: (entry: {
                callIndex: number;
                phase: string;
                request: Record<string, unknown>;
                timestamp: Date;
            }) => void;
            onModelCallComplete?: (entry: {
                callIndex: number;
                phase: string;
                durationMs: number;
                response: Record<string, unknown>;
                timestamp: Date;
            }) => void;
        } = {
            transcriptText: simpleReplaceResult.text,
            audioDate: fallbackDate,
            sourceFile: pklPath,
            contextInstance: context,
            routingInstance: routing,
            interactiveMode: false,
            preIdentifiedEntities,
            modelConfiguration: {
                model,
                reasoningLevel,
            },
            onToolCallStart: (tool, input) => {
                toolCallCount++;
                logger.info('transcript.enhance.agentic.tool_start', {
                    requestId,
                    transcriptPath: args.transcriptPath,
                    callIndex: toolCallCount,
                    tool,
                    input,
                });
                transcript.enhancementLog.logStep(new Date(), 'enhance', 'tool_start', {
                    callIndex: toolCallCount,
                    tool,
                    input,
                });
            },
            onToolCallComplete: (entry) => {
                logger.info('transcript.enhance.agentic.tool_complete', {
                    requestId,
                    transcriptPath: args.transcriptPath,
                    tool: entry.tool,
                    durationMs: entry.durationMs,
                    success: entry.success,
                });
                transcript.enhancementLog.logStep(entry.timestamp, 'enhance', 'tool_complete', {
                    tool: entry.tool,
                    input: entry.input,
                    output: entry.output,
                    durationMs: entry.durationMs,
                    success: entry.success,
                });
            },
            onModelCallStart: (entry) => {
                logger.info('transcript.enhance.agentic.model_call_start', {
                    requestId,
                    transcriptPath: args.transcriptPath,
                    callIndex: entry.callIndex,
                    phase: entry.phase,
                });
                transcript.enhancementLog.logStep(entry.timestamp, 'enhance', 'model_call_start', {
                    callIndex: entry.callIndex,
                    phase: entry.phase,
                    request: entry.request,
                });
            },
            onModelCallComplete: (entry: {
                callIndex: number;
                phase: string;
                durationMs: number;
                response: Record<string, unknown>;
                timestamp: Date;
            }) => {
                logger.info('transcript.enhance.agentic.model_call_complete', {
                    requestId,
                    transcriptPath: args.transcriptPath,
                    callIndex: entry.callIndex,
                    phase: entry.phase,
                    durationMs: entry.durationMs,
                });
                transcript.enhancementLog.logStep(entry.timestamp, 'enhance', 'model_call_complete', {
                    callIndex: entry.callIndex,
                    phase: entry.phase,
                    durationMs: entry.durationMs,
                    response: entry.response,
                });
            },
        };
        const executor = Agentic.create(reasoning, toolContext);

        const agenticResult = await executor.process(simpleReplaceResult.text);
        const enhancedText = (agenticResult.enhancedText || '').trim() || sourceText;
        const enhancementSucceeded = enhancedText.length > 50 && enhancedText !== sourceText;
        const finalStatus = enhancementSucceeded ? 'enhanced' : (transcript.metadata.status || 'initial');
        logger.info('transcript.enhance.agentic.complete', {
            requestId,
            transcriptPath: args.transcriptPath,
            toolsUsed: agenticResult.toolsUsed,
            iterations: agenticResult.iterations,
            totalToolCalls: toolCallCount,
            changed: enhancedText !== sourceText,
            enhancedLength: enhancedText.length,
            elapsedMs: Date.now() - startedAt,
        });

        const referenced = agenticResult.state.referencedEntities;
        const entities = {
            people: [] as Metadata.EntityReference[],
            projects: [] as Metadata.EntityReference[],
            terms: [] as Metadata.EntityReference[],
            companies: [] as Metadata.EntityReference[],
        };
        for (const personId of referenced.people) {
            const person = context.getPerson(personId);
            if (person) {
                entities.people.push({ id: person.id, name: person.name, type: 'person' });
            }
        }
        for (const projectId of referenced.projects) {
            const project = context.getProject(projectId);
            if (project) {
                entities.projects.push({ id: project.id, name: project.name, type: 'project' });
            } else {
                const gcsEntity = await findContextEntityInGcs('project', projectId);
                if (gcsEntity && typeof gcsEntity.id === 'string' && typeof gcsEntity.name === 'string') {
                    entities.projects.push({ id: gcsEntity.id, name: gcsEntity.name, type: 'project' });
                }
            }
        }
        for (const termId of referenced.terms) {
            const term = context.getTerm(termId);
            if (term) {
                entities.terms.push({ id: term.id, name: term.name, type: 'term' });
            }
        }
        for (const companyId of referenced.companies) {
            const company = context.getCompany(companyId);
            if (company) {
                entities.companies.push({ id: company.id, name: company.name, type: 'company' });
            }
        }
        const hasEntities = entities.people.length > 0
            || entities.projects.length > 0
            || entities.terms.length > 0
            || entities.companies.length > 0;

        const decidedProjectId = agenticResult.state.routeDecision?.projectId || routeResult.projectId || undefined;
        let decidedProjectName: string | undefined;
        if (decidedProjectId) {
            const decidedProject = context.getProject(decidedProjectId);
            if (decidedProject) {
                decidedProjectName = decidedProject.name;
            } else {
                const gcsEntity = await findContextEntityInGcs('project', decidedProjectId);
                if (gcsEntity && typeof gcsEntity.name === 'string') {
                    decidedProjectName = gcsEntity.name;
                }
            }
        }
        const decidedConfidence = agenticResult.state.routeDecision?.confidence ?? routeResult.confidence;

        transcript.updateContent(enhancedText);
        transcript.updateMetadata({
            status: finalStatus as TranscriptMetadata['status'],
            projectId: decidedProjectId || transcript.metadata.projectId,
            project: decidedProjectName || transcript.metadata.project,
            confidence: typeof decidedConfidence === 'number' ? decidedConfidence : transcript.metadata.confidence,
            entities: hasEntities ? entities : transcript.metadata.entities,
        });

        transcript.enhancementLog.logStep(new Date(), 'enhance', 'enhancement_complete', {
            status: finalStatus,
            model,
            reasoningLevel,
            maxIterations,
            toolsUsed: agenticResult.toolsUsed,
            totalToolCalls: toolCallCount,
            iterations: agenticResult.iterations,
            processingTimeMs: Date.now() - startedAt,
        });
        logger.info('transcript.enhance.complete', {
            requestId,
            transcriptPath: args.transcriptPath,
            status: finalStatus,
            projectId: decidedProjectId || null,
            totalToolCalls: toolCallCount,
            changed: enhancedText !== sourceText,
            processingTimeMs: Date.now() - startedAt,
        });

        return {
            success: true,
            transcriptPath: args.transcriptPath,
            status: finalStatus,
            projectId: decidedProjectId || null,
            projectName: decidedProjectName || null,
            toolsUsed: agenticResult.toolsUsed,
            totalToolCalls: toolCallCount,
            iterations: agenticResult.iterations,
            processingTimeMs: Date.now() - startedAt,
            sourceLength: sourceText.length,
            enhancedLength: enhancedText.length,
            changed: enhancedText !== sourceText,
        };
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        transcript.enhancementLog.logStep(new Date(), 'enhance', 'enhancement_failed', {
            transcriptPath: args.transcriptPath,
            model: args.model || DEFAULT_MODEL,
            reasoningLevel: 'medium',
            maxIterations: 20,
            error: message,
        });
        // Always emit a terminal completion event so clients waiting on
        // enhancement_complete can reliably exit "in progress" state.
        transcript.enhancementLog.logStep(new Date(), 'enhance', 'enhancement_complete', {
            status: 'error',
            failed: true,
            transcriptPath: args.transcriptPath,
            model: args.model || DEFAULT_MODEL,
            reasoningLevel: 'medium',
            maxIterations: 20,
            error: message,
        });
        logger.error('transcript.enhance.failed', {
            requestId,
            transcriptPath: args.transcriptPath,
            error: message,
            stack: error instanceof Error ? error.stack : undefined,
        });
        throw error;
    } finally {
        if (tempDir) {
            await rm(tempDir, { recursive: true, force: true });
        }
        transcript.close();
        await access.finalize(true);
    }
}

export async function handleCreateNote(args: {
    title: string;
    content?: string;
    projectId?: string;
    tags?: string[];
    date?: string;
    contextDirectory?: string;
}) {
    const ServerConfig = await import('../serverConfig');
    const outputStorage = ServerConfig.getOutputStorage();

    // Get the output directory
    const outputDirectory = await getConfiguredDirectory('outputDirectory', args.contextDirectory);
    
    // Parse the date or use current date
    const noteDate = args.date ? new Date(args.date) : new Date();
    const year = noteDate.getFullYear();
    const month = String(noteDate.getMonth() + 1).padStart(2, '0');
    const day = String(noteDate.getDate()).padStart(2, '0');
    const hours = String(noteDate.getHours()).padStart(2, '0');
    const minutes = String(noteDate.getMinutes()).padStart(2, '0');
    const timestamp = String(noteDate.getTime());
    
    // Create a slug from the title for the filename
    const titleSlug = args.title
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .substring(0, 50); // Limit length
    
    // Use .pkl extension for PKL format
    const filename = `${day}-${hours}${minutes}-${timestamp.substring(0, 14)}-${titleSlug}.pkl`;
    const relativePath = `${year}/${month}/${filename}`;
    const absolutePath = resolve(outputDirectory, relativePath);
    
    // Validate that the path stays within the output directory
    if (outputStorage.name !== 'gcs') {
        validatePathWithinDirectory(absolutePath, outputDirectory);
    }
    
    // Build metadata
    let projectName: string | undefined;
    
    // If projectId is provided, try to get project name from context
    if (args.projectId) {
        try {
            const context = await getProjectLookupContext(args.contextDirectory);
            const project = await context.getProject(args.projectId);
            if (project) {
                projectName = project.name;
            } else {
                const gcsEntity = await findContextEntityInGcs('project', args.projectId);
                if (gcsEntity && typeof gcsEntity.name === 'string') {
                    projectName = gcsEntity.name;
                }
            }
        } catch {
            // Ignore errors - project name is optional
        }
    }
    
    // Build entities
    const entities = {
        people: [] as Metadata.EntityReference[],
        projects: args.projectId && projectName ? [{
            id: args.projectId,
            name: projectName,
            type: 'project' as const,
        }] : [] as Metadata.EntityReference[],
        terms: [] as Metadata.EntityReference[],
        companies: [] as Metadata.EntityReference[],
    };
    
    // Build PKL metadata
    const pklMetadata = {
        id: '', // Will be auto-generated by PklTranscript.create()
        title: args.title,
        date: noteDate,
        projectId: args.projectId,
        project: projectName,
        tags: args.tags || [],
        entities,
        status: 'reviewed' as const, // Default status for new notes
    };
    
    if (outputStorage.name === 'gcs') {
        const tmpRoot = await mkdtemp(`${tmpdir()}/protokoll-mcp-note-`);
        const tmpPklPath = resolve(tmpRoot, filename);
        try {
            const transcript = PklTranscript.create(tmpPklPath, pklMetadata);
            try {
                if (args.content) {
                    transcript.updateContent(args.content);
                }
            } finally {
                transcript.close();
            }

            const created = await readFile(tmpPklPath);
            await outputStorage.writeFile(relativePath, created);
            markTranscriptIndexDirtyForStorage(outputStorage, outputDirectory, relativePath);
        } finally {
            await rm(tmpRoot, { recursive: true, force: true });
        }

        return {
            success: true,
            filePath: await sanitizePath(relativePath, outputDirectory),
            filename: filename,
            message: `Note "${args.title}" created successfully`,
        };
    }
    
    // Create directory if it doesn't exist
    await mkdir(dirname(absolutePath), { recursive: true });
    
    // Create PKL transcript
    const transcript = PklTranscript.create(absolutePath, pklMetadata);
    try {
        if (args.content) {
            transcript.updateContent(args.content);
        }
    } finally {
        transcript.close();
    }
    
    // Convert to relative path for response
    const relativeOutputPath = await sanitizePath(absolutePath, outputDirectory);
    
    return {
        success: true,
        filePath: relativeOutputPath,
        filename: filename,
        message: `Note "${args.title}" created successfully`,
    };
}

export async function handleGetEnhancementLog(args: {
    transcriptPath: string;
    phase?: 'transcribe' | 'enhance' | 'simple-replace';
    limit?: number;
    offset?: number;
    contextDirectory?: string;
}) {
    const access = await openToolTranscript(args.transcriptPath, args.contextDirectory);
    try {
        const transcript = PklTranscript.open(access.pklPath, { readOnly: true });
        try {
            // Get enhancement log with optional phase filter
            const allEntries = transcript.getEnhancementLog(args.phase ? { phase: args.phase } : undefined);

            // Apply pagination
            const limit = args.limit ?? 100;
            const offset = args.offset ?? 0;
            const total = allEntries.length;
            const entries = allEntries.slice(offset, offset + limit);

            // Convert entries to serializable format
            const serializedEntries = entries.map((entry: any) => ({
                id: entry.id,
                timestamp: entry.timestamp.toISOString(),
                phase: entry.phase,
                action: entry.action,
                details: entry.details,
                entities: entry.entities,
            }));

            return {
                entries: serializedEntries,
                total,
                limit,
                offset,
                hasMore: offset + limit < total,
            };
        } finally {
            transcript.close();
        }
    } finally {
        await access.finalize(false);
    }
}

/**
 * Apply text corrections using regex replacement
 */
function applyCorrections(
    transcriptText: string,
    corrections: Map<string, string>
): string {
    let correctedText = transcriptText;
    
    for (const [original, corrected] of corrections) {
        if (original !== corrected && corrected.trim() !== '') {
            // Replace all instances of the original with the corrected version
            const regex = new RegExp(original.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi');
            correctedText = correctedText.replace(regex, corrected);
        }
    }
    
    return correctedText;
}

function countOccurrencesCaseInsensitive(text: string, target: string): number {
    if (!target.trim()) {
        return 0;
    }
    const regex = new RegExp(target.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi');
    const matches = text.match(regex);
    return matches ? matches.length : 0;
}

export async function handleRejectCorrection(args: {
    transcriptPath: string;
    correctionEntryId: number;
    contextDirectory?: string;
}) {
    if (!Number.isInteger(args.correctionEntryId) || args.correctionEntryId < 1) {
        throw new Error('correctionEntryId must be a positive integer');
    }

    const access = await openToolTranscript(args.transcriptPath, args.contextDirectory);
    const transcript = PklTranscript.open(access.pklPath, { readOnly: false });

    try {
        const allEntries = transcript.getEnhancementLog();
        const correctionEntry = allEntries.find((entry) => entry.id === args.correctionEntryId);

        if (!correctionEntry) {
            throw new Error(`Correction entry not found: ${args.correctionEntryId}`);
        }
        if (correctionEntry.action !== 'correction_applied') {
            throw new Error(`Entry ${args.correctionEntryId} is not a correction_applied action`);
        }

        const details = (correctionEntry.details || {}) as Record<string, unknown>;
        const original = String(details.original || '').trim();
        const replacement = String(details.replacement || '').trim();
        if (!original || !replacement) {
            throw new Error(`Correction entry ${args.correctionEntryId} is missing original/replacement details`);
        }

        const alreadyRejected = allEntries.some((entry) => {
            if (entry.action !== 'correction_rejected') {
                return false;
            }
            const rejectDetails = (entry.details || {}) as Record<string, unknown>;
            return Number(rejectDetails.correctionEntryId) === args.correctionEntryId;
        });
        if (alreadyRejected) {
            return {
                success: true,
                alreadyRejected: true,
                correctionEntryId: args.correctionEntryId,
                original,
                replacement,
                revertedOccurrences: 0,
                message: `Correction #${args.correctionEntryId} is already rejected`,
            };
        }

        const originalContent = transcript.content || '';
        const beforeCount = countOccurrencesCaseInsensitive(originalContent, replacement);
        const revertedContent = applyCorrections(
            originalContent,
            new Map([[replacement, original]])
        );
        const afterCount = countOccurrencesCaseInsensitive(revertedContent, replacement);
        const revertedOccurrences = Math.max(0, beforeCount - afterCount);
        const rejectionPhase = correctionEntry.phase === 'transcribe'
            || correctionEntry.phase === 'enhance'
            || correctionEntry.phase === 'simple-replace'
            ? correctionEntry.phase
            : 'simple-replace';

        transcript.updateContent(revertedContent);
        transcript.enhancementLog.logStep(
            new Date(),
            rejectionPhase,
            'correction_rejected',
            {
                correctionEntryId: args.correctionEntryId,
                original,
                replacement,
                revertedOccurrences,
                sourceTimestamp: correctionEntry.timestamp.toISOString(),
            }
        );

        return {
            success: true,
            correctionEntryId: args.correctionEntryId,
            original,
            replacement,
            revertedOccurrences,
            message: `Rejected correction #${args.correctionEntryId} and restored "${replacement}" to "${original}"`,
        };
    } finally {
        transcript.close();
        await access.finalize(true);
    }
}

export async function handleCorrectToEntity(args: {
    transcriptPath: string;
    selectedText: string;
    entityType: 'person' | 'project' | 'term' | 'company';
    entityId?: string;
    entityName?: string;
    firstName?: string;
    lastName?: string;
    description?: string;
    projectId?: string;
    contextDirectory?: string;
}) {
    const { randomUUID } = await import('node:crypto');
    const { slugify } = await import('./shared.js');
    const ServerConfig = await import('../serverConfig');
    
    const context = ServerConfig.getContext();
    if (!context) {
        throw new Error('Server context not initialized. Check server configuration.');
    }
    
    const access = await openToolTranscript(args.transcriptPath, args.contextDirectory);
    const pklPath = access.pklPath;
    
    try {
        let finalEntityId: string;
        let finalEntityName: string;
        let isNewEntity = false;
    
        // Step 1: Create or look up entity using the server's pre-initialized context
        if (args.entityName) {
            const id = randomUUID();
            const slug = slugify(args.entityName);
        
            const entityBase = {
                id,
                slug,
                name: args.entityName,
            };
        
            let newEntity: any;
            switch (args.entityType) {
                case 'person':
                    newEntity = {
                        ...entityBase,
                        type: 'person' as const,
                        ...(args.firstName && { firstName: args.firstName }),
                        ...(args.lastName && { lastName: args.lastName }),
                        ...(args.description && { context: args.description }),
                    };
                    break;
                case 'project':
                    newEntity = { ...entityBase, type: 'project' as const };
                    break;
                case 'term':
                    newEntity = { ...entityBase, type: 'term' as const };
                    break;
                case 'company':
                    newEntity = { ...entityBase, type: 'company' as const };
                    break;
            }
        
            await context.saveEntity(newEntity);
            markContextEntityIndexDirty(args.entityType);
            finalEntityId = id;
            finalEntityName = args.entityName;
            isNewEntity = true;
        } else if (args.entityId) {
            finalEntityId = args.entityId;
            const { findPersonResilient, findProjectResilient, findTermResilient, findCompanyResilient } = await import('@redaksjon/protokoll-engine');
            let entity: any;
            switch (args.entityType) {
                case 'person': entity = findPersonResilient(context, finalEntityId); break;
                case 'project': entity = findProjectResilient(context, finalEntityId); break;
                case 'term': entity = findTermResilient(context, finalEntityId); break;
                case 'company': entity = findCompanyResilient(context, finalEntityId); break;
            }
            finalEntityName = entity.name;
        } else {
            throw new Error('Either entityId or entityName must be provided');
        }
    
        // Step 2: Update sounds_like on the entity (before opening transcript to avoid interleaving)
        if (args.selectedText.toLowerCase() !== finalEntityName.toLowerCase()) {
            const existingEntity = (() => {
                switch (args.entityType) {
                    case 'person': return context.getPerson(finalEntityId);
                    case 'project': return context.getProject(finalEntityId);
                    case 'term': return context.getTerm(finalEntityId);
                    case 'company': return context.getCompany(finalEntityId);
                }
            })();
        
            if (existingEntity) {
                const soundsLike = (existingEntity as any).sounds_like || [];
                if (!soundsLike.includes(args.selectedText)) {
                    await context.saveEntity(
                        { ...existingEntity, sounds_like: [...soundsLike, args.selectedText] },
                        true
                    );
                    markContextEntityIndexDirty(args.entityType);
                }
            }
        }
    
        // Step 3: All transcript operations in one block with guaranteed close
        const transcript = PklTranscript.open(pklPath, { readOnly: false });
        let transcriptId: string;
        let transcriptProject: string | undefined;
        let allEntityIds: string[];
    
        try {
        // Replace text in content
            const originalContent = transcript.content;
            const corrections = new Map([[args.selectedText, finalEntityName]]);
            const correctedContent = applyCorrections(originalContent, corrections);
            transcript.updateContent(correctedContent);
        
            // Build a fresh entities object (same pattern as handleUpdateTranscriptEntityReferences)
            const existing = transcript.metadata.entities;
            const newEntityRef: Metadata.EntityReference = { id: finalEntityId, name: finalEntityName, type: args.entityType };
        
            const addIfMissing = (arr: Metadata.EntityReference[] | undefined, ref: Metadata.EntityReference): Metadata.EntityReference[] => {
                const list = arr ? [...arr] : [];
                if (!list.some(e => e.id === ref.id)) {
                    list.push(ref);
                }
                return list;
            };
        
            const updatedEntities = {
                people: args.entityType === 'person' ? addIfMissing(existing?.people, newEntityRef) : [...(existing?.people || [])],
                projects: args.entityType === 'project' ? addIfMissing(existing?.projects, newEntityRef) : [...(existing?.projects || [])],
                terms: args.entityType === 'term' ? addIfMissing(existing?.terms, newEntityRef) : [...(existing?.terms || [])],
                companies: args.entityType === 'company' ? addIfMissing(existing?.companies, newEntityRef) : [...(existing?.companies || [])],
            };
        
            transcript.updateMetadata({ entities: updatedEntities });
        
            // Log to enhancement_log
            try {
                transcript.enhancementLog.logStep(
                    new Date(),
                    'enhance',
                    'correction_applied',
                    {
                        original: args.selectedText,
                        replacement: finalEntityName,
                        entityId: finalEntityId,
                        entityType: args.entityType,
                        isNewEntity
                    },
                    [{ id: finalEntityId, name: finalEntityName, type: args.entityType }]
                );
            } catch {
            // Enhancement log is not critical
            }
        
            // Capture metadata before closing
            transcriptId = transcript.metadata.id;
            transcriptProject = transcript.metadata.project;
            allEntityIds = [
                ...updatedEntities.people.map(e => e.id),
                ...updatedEntities.projects.map(e => e.id),
                ...updatedEntities.terms.map(e => e.id),
                ...updatedEntities.companies.map(e => e.id),
            ];
        } finally {
            transcript.close();
        }
    
        // Step 4: Trigger weight model update (best-effort, after transcript is closed)
        try {
            const { updateTranscriptInWeightModel } = await import('../services/weightModel');
            updateTranscriptInWeightModel(transcriptId, allEntityIds, transcriptProject);
        } catch {
        // Weight model update is best-effort
        }
    
        return {
            success: true,
            message: `Corrected "${args.selectedText}" to "${finalEntityName}"`,
            correction: { original: args.selectedText, replacement: finalEntityName },
            entity: { id: finalEntityId, name: finalEntityName, type: args.entityType },
            isNewEntity
        };
    } finally {
        await access.finalize(true);
    }
}
