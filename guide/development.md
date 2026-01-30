# Development Guide

Guide for developing and extending Protokoll.

## Setup

### Prerequisites

- Node.js 18+
- npm 9+

### Clone and Install

```bash
git clone https://github.com/redaksjon/protokoll.git
cd protokoll
npm install
```

### Build

```bash
npm run build
```

### Test

```bash
npm test
```

### Lint

```bash
npm run lint
npm run lint:fix  # Auto-fix issues
```

## Recent Fixes

### Tag Deduplication (2026-01-19)

Tags in transcript metadata are now automatically deduplicated. Previously, when the same entity (e.g., "xenocline") was identified through multiple classification signals (e.g., both as an explicit phrase and as an associated project), it would appear multiple times in the tags array. Now tags are deduplicated using Set, ensuring each tag appears only once regardless of how many signals identify it.

**Changed**: `src/util/metadata.ts` - `extractTagsFromSignals()` function
**Tests**: `tests/util/metadata.test.ts` - Added deduplication test case

## Project Structure

```
protokoll/
├── src/
│   ├── agentic/           # Agentic tool system
│   │   ├── tools/         # Individual tools
│   │   │   ├── lookup-person.ts
│   │   │   ├── lookup-project.ts
│   │   │   ├── route-note.ts
│   │   │   ├── store-context.ts
│   │   │   └── verify-spelling.ts
│   │   ├── registry.ts    # Tool registry
│   │   ├── executor.ts    # Execution loop
│   │   └── types.ts
│   ├── context/           # Context system
│   │   ├── discovery.ts   # Hierarchical discovery
│   │   ├── storage.ts     # Entity storage
│   │   └── types.ts
│   ├── interactive/       # Interactive mode
│   │   ├── handler.ts     # Clarification handling
│   │   ├── onboarding.ts  # First-run setup
│   │   └── types.ts
│   ├── output/            # Output management
│   │   ├── manager.ts     # File management
│   │   └── types.ts
│   ├── pipeline/          # Processing pipeline
│   │   ├── orchestrator.ts
│   │   └── types.ts
│   ├── phases/            # Processing phases
│   │   ├── locate.ts
│   │   ├── transcribe.ts
│   │   └── complete.ts
│   ├── prompt/            # Prompt templates
│   │   ├── personas/
│   │   │   └── transcriber.md
│   │   └── instructions/
│   │       └── transcribe.md
│   ├── reasoning/         # Reasoning integration
│   │   ├── client.ts      # LLM client
│   │   ├── strategy.ts    # Strategy selection
│   │   └── types.ts
│   ├── reflection/        # Self-reflection
│   │   ├── collector.ts   # Metrics collection
│   │   ├── reporter.ts    # Report generation
│   │   └── types.ts
│   ├── routing/           # Routing system
│   │   ├── classifier.ts  # Signal classification
│   │   ├── router.ts      # Path building
│   │   └── types.ts
│   ├── transcription/     # Transcription service
│   │   ├── service.ts     # Whisper integration
│   │   └── types.ts
│   ├── util/              # Utilities
│   │   ├── child.ts
│   │   ├── dates.ts
│   │   ├── general.ts
│   │   ├── media.ts
│   │   ├── metadata.ts
│   │   ├── openai.ts
│   │   └── storage.ts
│   ├── error/             # Error types
│   │   └── ArgumentError.ts
│   ├── arguments.ts       # CLI arguments
│   ├── constants.ts       # Constants
│   ├── logging.ts         # Logging
│   ├── main.ts            # Entry point
│   ├── processor.ts       # File processor
│   └── protokoll.ts       # Main types
├── tests/                 # Test files (mirrors src/)
├── guide/                 # AI guide documentation
├── docs/                  # User documentation site
└── output/                # Intermediate files (gitignored)
```

## Adding a New Tool

### 1. Create Tool File

```typescript
// src/agentic/tools/my-tool.ts
import { TranscriptionTool, ToolContext, ToolResult } from '../types';

export const createMyTool = (): TranscriptionTool => ({
  name: 'my_tool',
  description: 'Description for the reasoning model',
  parameters: {
    type: 'object',
    properties: {
      param1: { type: 'string', description: 'Parameter description' }
    },
    required: ['param1']
  },
  execute: async (args: { param1: string }, context: ToolContext): Promise<ToolResult> => {
    // Implementation
    return {
      success: true,
      data: { result: 'value' }
    };
  }
});
```

### 2. Register Tool

```typescript
// src/agentic/registry.ts
import { createMyTool } from './tools/my-tool';

export const create = (context: ToolContext): RegistryInstance => {
  const tools: TranscriptionTool[] = [
    // ... existing tools
    createMyTool(),
  ];
  // ...
};
```

### 3. Add Tests

```typescript
// tests/agentic/tools.test.ts
describe('my_tool', () => {
  it('should do something', async () => {
    const tool = createMyTool();
    const result = await tool.execute({ param1: 'test' }, mockContext);
    expect(result.success).toBe(true);
  });
});
```

## Testing

### Run All Tests

```bash
npm test
```

### Run Specific Tests

```bash
npm test -- tests/context/
npm test -- --grep "should discover"
```

### Coverage

```bash
npm run test:coverage
```

## Code Style

### ESLint

```bash
npm run lint
npm run lint:fix
```

### TypeScript

- Strict mode enabled
- No implicit any
- Use interfaces for public APIs
- Use types for internal structures

### Conventions

- Use `create()` factory functions
- Export interfaces from index files
- Keep modules focused
- Document public APIs

## Dependencies

### Core

| Package | Purpose |
|---------|---------|
| `@utilarium/dreadcabinet` | Filesystem patterns |
| `@utilarium/cardigantime` | Hierarchical config discovery |
| `@riotprompt/riotprompt` | Prompt building and agentic execution |
| `openai` | OpenAI API (Whisper and GPT) |
| `@anthropic-ai/sdk` | Anthropic API (Claude) |
| `@google/generative-ai` | Google API (Gemini) |

### Dev

| Package | Purpose |
|---------|---------|
| `vitest` | Testing |
| `typescript` | Type checking |
| `eslint` | Linting |
| `vite` | Building |

## Release Process

1. Update version in `package.json`
2. Run tests: `npm test`
3. Build: `npm run build`
4. **Verify documentation** (see checklist below)
5. Commit: `git commit -m "Release vX.Y.Z"`
6. Tag: `git tag vX.Y.Z`
7. Push: `git push && git push --tags`
8. Publish: `npm publish`

## Pre-Release Documentation Checklist

Before every release, verify documentation accuracy:

### 1. Configuration Options

Check that documented config options match the actual implementation:

```bash
# Compare documented options with code
grep -E "^\s+\w+:" guide/configuration.md  # Documented options
grep -E "z\.\w+\(\)" src/protokoll.ts       # Schema fields
grep -E "option\('--" src/arguments.ts      # CLI options
```

**Key files to cross-reference:**
- `guide/configuration.md` ↔ `src/protokoll.ts` (ConfigSchema)
- `guide/configuration.md` ↔ `src/constants.ts` (PROTOKOLL_DEFAULTS)
- `guide/configuration.md` ↔ `src/arguments.ts` (CLI options)

### 2. Default Values

Verify documented defaults match code:

| Check | Source File | Documentation |
|-------|-------------|---------------|
| Interactive default | `src/constants.ts` (DEFAULT_INTERACTIVE) | `guide/configuration.md`, `guide/index.md` |
| Self-reflection default | `src/constants.ts` (DEFAULT_SELF_REFLECTION) | `guide/configuration.md`, `guide/reasoning.md` |
| Reasoning level default | `src/constants.ts` (DEFAULT_REASONING_LEVEL) | `guide/configuration.md`, `guide/reasoning.md`, `guide/quickstart.md`, `guide/index.md` |
| Model defaults | `src/constants.ts` (DEFAULT_MODEL, DEFAULT_TRANSCRIPTION_MODEL) | All guide files |
| Output structure | `src/constants.ts` (DEFAULT_OUTPUT_STRUCTURE) | `guide/configuration.md`, `guide/routing.md` |

### 3. Config Structure

Ensure config examples use flat properties (not nested):

**Correct:**
```yaml
outputDirectory: "~/notes"
outputStructure: "month"
interactive: true
selfReflection: true
```

**Incorrect (legacy/aspirational):**
```yaml
routing:
  default:
    path: "~/notes"
features:
  interactive: true
```

### 4. Project Schema

Verify project file examples match `src/context/types.ts`:

- Uses `classification.explicit_phrases` (not `triggers`)
- Uses `routing.destination` (not top-level `destination`)
- Uses `routing.structure` and `routing.filename_options`
- Includes `type: project`

### 5. CLI Flags

Verify documented CLI flags exist in `src/arguments.ts`:

| Flag | Should Exist | Notes |
|------|--------------|-------|
| `--batch` | Yes | Disables interactive mode |
| `--interactive` | **No** | Interactive is default, use --batch to disable |
| `--self-reflection` | Yes | |
| `--no-self-reflection` | Yes | |
| `--silent` | Yes | |

### 6. Files to Review

Before release, scan these files for accuracy:

- [ ] `guide/configuration.md` - Main config reference
- [ ] `guide/quickstart.md` - Config examples, CLI examples
- [ ] `guide/interactive.md` - Interactive mode behavior
- [ ] `guide/routing.md` - Project file format
- [ ] `guide/context-system.md` - Entity schemas
- [ ] `guide/index.md` - Default values table
- [ ] `README.md` - All examples and CLI options

### 7. Automated Checks (Future)

Consider adding:

```bash
# Script to validate documentation accuracy
npm run docs:validate
```

This could:
- Parse config examples from markdown
- Validate against Zod schema
- Check CLI flags exist
- Verify default values match constants

## Debugging

### Verbose Mode

```bash
protokoll --verbose --input-directory ./recordings
```

### Debug Mode

```bash
protokoll --debug --input-directory ./recordings
```

Keeps intermediate files in `output/protokoll/`:
- `*-transcript.json` - Raw Whisper output
- `*-context.json` - Context snapshot
- `*-request.json` - LLM request
- `*-response.json` - LLM response
- `*-reflection.md` - Self-reflection report
- `*-session.json` - Interactive session log

### Node Debugging

```bash
node --inspect-brk dist/main.js --input-directory ./recordings
```

