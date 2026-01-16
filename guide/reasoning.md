# Reasoning Integration

Protokoll uses reasoning models to enhance transcriptions.

## Overview

The reasoning system:

1. Takes raw Whisper transcript
2. Uses context to identify corrections
3. Applies tools to look up and verify
4. Produces enhanced transcript

## Supported Models

### OpenAI Models

| Model | Best For |
|-------|----------|
| `gpt-5.2` | **Default** - High reasoning capability |
| `gpt-5.1` | High reasoning, balanced |
| `gpt-5` | Fast and capable |
| `gpt-4o` | Previous gen, still capable |
| `gpt-4o-mini` | Fast, lower cost |
| `o1` | Complex reasoning |
| `o1-mini` | Reasoning, faster |

### Anthropic Models

| Model | Best For |
|-------|----------|
| `claude-3-5-sonnet` | Recommended for complex transcripts |
| `claude-3-opus` | Highest quality |
| `claude-3-haiku` | Fast, cost-effective |

### Google Models

| Model | Best For |
|-------|----------|
| `gemini-1.5-pro` | High quality |
| `gemini-1.5-flash` | Fast processing |

## Configuration

```yaml
# ~/.protokoll/config.yaml
model: "gpt-5.2"
reasoningLevel: "medium"  # low, medium, or high
```

Or via command line:

```bash
protokoll --model claude-3-5-sonnet --reasoning-level medium --input-directory ./recordings
```

## Reasoning Levels

For models that support the `reasoning_effort` parameter (gpt-5.1, gpt-5.2, o1, o1-mini, o3, o3-mini), you can control how much reasoning effort the model expends:

| Level | Description | Best For |
|-------|-------------|----------|
| `low` | Quick processing, minimal reasoning | Simple transcripts with few corrections needed |
| `medium` | **Default** - Balanced reasoning | Standard transcription with context lookup |
| `high` | Maximum reasoning effort | Unusual or highly technical content |

The default is `medium` because transcript enhancement benefits from balanced reasoning: looking up names, correcting spellings, and categorizing content requires moderate context analysis. Use `low` for simple transcripts with few corrections needed, or `high` for complex technical content.

## Reasoning Strategies

### Simple

Direct completion without iteration:

```typescript
strategy: "simple"
```

Best for: Short transcripts, fast processing

### Investigate-Then-Respond

Two-phase approach:

1. Investigation: Use tools to gather context
2. Response: Generate enhanced transcript

```typescript
strategy: "investigate-then-respond"
```

Best for: Transcripts with unknown names

### Multi-Pass

Multiple iterations refining output:

```typescript
strategy: "multi-pass"
```

Best for: Complex transcripts needing multiple corrections

### Adaptive

Automatically selects strategy based on content:

```typescript
strategy: "adaptive"  // default
```

Best for: General use

## Self-Reflection

Self-reflection is **enabled by default**. It generates reports showing:

- Processing duration
- Tool call counts
- Success rates
- Quality assessment
- Recommendations

### Disable Self-Reflection

```bash
protokoll --no-self-reflection --input-directory ./recordings
```

### Report Example

```markdown
# Protokoll - Self-Reflection Report

## Summary
- Duration: 8.3s
- Iterations: 12
- Tool Calls: 7
- Confidence: 92.5%

## Tool Effectiveness
| Tool | Calls | Success Rate |
|------|-------|--------------|
| lookup_person | 3 | 100% |
| route_note | 1 | 100% |

## Recommendations
- Consider adding more context for faster processing
```

## API

### ReasoningInstance

```typescript
interface ReasoningInstance {
  complete(request: ReasoningRequest): Promise<ReasoningResponse>;
  getRecommendedStrategy(model: string): ReasoningStrategy;
}

interface ReasoningRequest {
  model: string;
  messages: Message[];
  tools?: Tool[];
  temperature?: number;
}

interface ReasoningResponse {
  content: string;
  model: string;
  usage: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
}
```

## Best Practices

1. **Start with gpt-5.2**: Default model with high reasoning capability
2. **Use claude-3-5-sonnet for quality**: Better name handling
3. **Review self-reflection reports**: Track performance over time
4. **Add context**: More context = fewer iterations
5. **Use adaptive strategy**: Let Protokoll choose

## Troubleshooting

### Slow Processing

1. Use lower reasoning level: `--reasoning-level low`
2. Use faster model: `--model gpt-4o-mini`
3. Check self-reflection for bottlenecks
4. Add more context to reduce iterations

### Poor Quality

1. Use better model: `--model claude-3-5-sonnet`
2. Add more context entries
3. Check sounds_like mappings

### API Errors

1. Verify API key is set
2. Check rate limits
3. Use batch processing for many files

