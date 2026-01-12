# Development Guide

Guide for developing and extending Protokoll.

## Setup

### Prerequisites

- Node.js 18+
- npm 9+

### Clone and Install

```bash
git clone https://github.com/tobrien/redaksjon-protokoll.git
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
```

## Project Structure

```
protokoll/
├── src/
│   ├── agentic/           # Agentic tool system
│   │   ├── tools/         # Individual tools
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
│   ├── phases/            # Processing phases
│   ├── util/              # Utilities
│   ├── arguments.ts       # CLI arguments
│   ├── constants.ts       # Constants
│   ├── logging.ts         # Logging
│   └── protokoll.ts       # Main entry
├── tests/                 # Test files (mirrors src/)
├── guide/                 # AI guide documentation
├── docs/                  # User documentation
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
npm test -- --coverage
```

Coverage thresholds:
- Statements: 90%
- Branches: 75%
- Functions: 95%
- Lines: 90%

## Code Style

### ESLint

```bash
npm run lint
npm run lint -- --fix
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
| `@theunwalked/dreadcabinet` | Filesystem patterns |
| `@theunwalked/cardigantime` | Config discovery |
| `@riotprompt/riotprompt` | Agentic execution |
| `openai` | OpenAI API |
| `@anthropic-ai/sdk` | Anthropic API |

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
4. Commit: `git commit -m "Release vX.Y.Z"`
5. Tag: `git tag vX.Y.Z`
6. Push: `git push && git push --tags`
7. Publish: `npm publish`

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

### Node Debugging

```bash
node --inspect-brk dist/main.js --input-directory ./recordings
```

