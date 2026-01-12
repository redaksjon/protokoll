# Protokoll Architecture

## System Overview

```
┌─────────────────────────────────────────────────────────────┐
│                        PROTOKOLL                            │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  ┌─────────┐   ┌──────────┐   ┌──────────┐   ┌──────────┐ │
│  │  INPUT  │──▶│ WHISPER  │──▶│ REASONING │──▶│  OUTPUT  │ │
│  │  Audio  │   │Transcript│   │  Model    │   │ Markdown │ │
│  └─────────┘   └──────────┘   └────┬─────┘   └──────────┘ │
│                                    │                        │
│                         ┌──────────┴──────────┐            │
│                         ▼                      ▼            │
│                    ┌─────────┐           ┌─────────┐       │
│                    │ CONTEXT │           │ ROUTING │       │
│                    │  System │           │ System  │       │
│                    └─────────┘           └─────────┘       │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

## Core Components

### 1. Context System (`src/context/`)

Manages the knowledge base using hierarchical configuration discovery:

- **Discovery**: Walks up directory tree finding `.protokoll/` directories
- **People**: Named individuals with phonetic aliases
- **Projects**: Work contexts with routing rules
- **Companies**: Organizations
- **Terms**: Domain-specific terminology

```typescript
interface ContextInstance {
  getConfig(): HierarchicalConfig;
  getPerson(id: string): Person | undefined;
  getProject(id: string): Project | undefined;
  getCompany(id: string): Company | undefined;
  getTerm(id: string): Term | undefined;
  findByPhonetic(sounds_like: string): Entity | undefined;
  hasContext(): boolean;
}
```

### 2. Routing System (`src/routing/`)

Determines where notes go using multi-signal classification:

- **Classifier**: Analyzes text for project signals
- **Router**: Builds output paths using Dreadcabinet patterns
- **Structures**: `none`, `year`, `month`, `day`

```typescript
interface RoutingInstance {
  classify(text: string): ProjectClassification[];
  route(text: string, config: RoutingConfig): RouteDestination;
}
```

### 3. Transcription Service (`src/transcription/`)

Handles audio-to-text conversion:

- **Models**: whisper-1, gpt-4o-transcribe
- **Capabilities**: Prompting support detection
- **Formats**: JSON, text, verbose JSON

```typescript
interface TranscriptionInstance {
  transcribe(request: TranscriptionRequest): Promise<TranscriptionResult>;
  getModelCapabilities(model: string): ModelCapabilities;
}
```

### 4. Reasoning System (`src/reasoning/`)

Integrates reasoning models for enhancement:

- **Models**: Claude, GPT-4o, GPT-5, GPT-5.2, O1
- **Strategies**: Simple, investigate-then-respond, multi-pass, adaptive
- **Token tracking**: Usage monitoring

```typescript
interface ReasoningInstance {
  complete(request: ReasoningRequest): Promise<ReasoningResponse>;
  getRecommendedStrategy(model: string): ReasoningStrategy;
}
```

### 5. Agentic System (`src/agentic/`)

Tool-based transcription enhancement:

| Tool | Purpose |
|------|---------|
| `lookup_person` | Find person context by name |
| `lookup_project` | Find routing rules |
| `verify_spelling` | Ask user for clarification |
| `route_note` | Determine destination |
| `store_context` | Remember new information |

```typescript
interface AgenticInstance {
  execute(state: TranscriptionState): Promise<TranscriptionState>;
  getAvailableTools(): TranscriptionTool[];
}
```

### 6. Interactive System (`src/interactive/`)

User interaction for learning:

- **Handler**: Manages clarification requests
- **Onboarding**: First-run detection
- **Session**: Tracks Q&A history

```typescript
interface InteractiveInstance {
  handleClarification(request: ClarificationRequest): Promise<ClarificationResponse>;
  checkNeedsOnboarding(): OnboardingState;
}
```

### 7. Output System (`src/output/`)

Manages intermediate and final files:

- **Intermediate**: transcript, context, request, response, reflection, session
- **Final**: Routed markdown file
- **Cleanup**: Optional intermediate removal

```typescript
interface OutputInstance {
  createOutputPaths(audioFile, destination, hash, date): OutputPaths;
  writeIntermediate(paths, type, content): Promise<string>;
  writeTranscript(paths, content): Promise<string>;
}
```

### 8. Reflection System (`src/reflection/`)

Self-assessment and reporting (enabled by default):

- **Collector**: Gathers metrics during processing
- **Reporter**: Generates quality reports
- **Recommendations**: Suggests improvements

```typescript
interface ReflectionInstance {
  collector: CollectorInstance;
  generate(audioFile, outputFile, history?, output?): ReflectionReport;
  save(report, path): Promise<void>;
}
```

### 9. Pipeline System (`src/pipeline/`)

Orchestrates the entire processing flow:

- **Orchestrator**: Coordinates all phases
- **Phases**: locate, transcribe, complete

```typescript
interface PipelineInstance {
  process(audioFile: string): Promise<ProcessingResult>;
}
```

## Data Flow

```
1. Audio File
   ↓
2. Whisper Transcription → Raw text with errors
   ↓
3. Context Discovery → Find .protokoll/ directories
   ↓
4. Context Analysis → Identify potential names, projects
   ↓
5. Tool Execution → lookup_person, lookup_project, etc.
   ↓
6. Interactive Clarification (if enabled) → Ask user about unknowns
   ↓
7. Route Detection → Determine destination
   ↓
8. Enhanced Transcript → Clean, corrected text
   ↓
9. Output → Write to routed destination
   ↓
10. Reflection (enabled by default) → Generate self-reflection report
```

## File Locations

| Component | Location |
|-----------|----------|
| Global context | `~/.protokoll/` |
| Project context | `./.protokoll/` |
| Configuration | `~/.protokoll/config.yaml` |
| Intermediate files | `./output/protokoll/` |
| Final transcripts | Routed destination |

## Dependencies

| Package | Purpose |
|---------|---------|
| `@theunwalked/dreadcabinet` | Filesystem structure patterns |
| `@theunwalked/cardigantime` | Hierarchical config discovery |
| `@riotprompt/riotprompt` | Prompt building and agentic execution |
| `openai` | Whisper and GPT APIs |
| `@anthropic-ai/sdk` | Claude API |
| `@google/generative-ai` | Gemini API |

