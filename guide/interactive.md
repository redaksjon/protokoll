# Interactive Mode

Interactive mode allows Protokoll to learn from you as it processes transcripts.

## Overview

When enabled, Protokoll will:

1. Pause when encountering unknown names
2. Ask for correct spellings
3. Offer to remember new entities
4. Request routing clarification

## Enabling Interactive Mode

```bash
protokoll --interactive --input-directory ./recordings
```

## Clarification Types

### Name Spelling

```
Name Clarification Needed

Context: "...meeting with pre a about..."
Detected: "pre a"
Suggested: "Priya"

? Enter correct spelling: Priya Sharma
? Remember this for future? Yes
```

### New Person

```
New Person Detected

Name: Priya Sharma

? Company (optional): Acme Corp
? Role (optional): Engineering Manager
? Add to context? Yes
```

### Routing Decision

```
Routing Clarification

Content mentions: "quarterly planning"

? Which project should this go to?
  > work
    personal
    quarterly-planning
    (default)
```

## Session Recording

All clarifications are recorded in the session file:

```json
// output/protokoll/260111-1245-abc123-session.json
{
  "requests": [
    {
      "type": "name_spelling",
      "term": "pre a",
      "suggestion": "Priya"
    }
  ],
  "responses": [
    {
      "type": "name_spelling",
      "term": "pre a",
      "response": "Priya Sharma",
      "shouldRemember": true
    }
  ]
}
```

## Non-Interactive Mode

For batch processing without prompts:

```bash
protokoll --batch --input-directory ./recordings
```

In batch mode:
- Uses suggestions when available
- Skips unknown entities
- Uses default routing

## First-Run Onboarding

On first run, Protokoll detects if you need setup:

```
Welcome to Protokoll!

It looks like this is your first time using Protokoll.
Let's set up some basics.

? Default notes directory: ~/notes
? Default structure: month
? Add any projects now? Yes

Project Setup

? Project name: Work
? Destination: ~/work/notes
? Trigger phrases: work, office, meeting
```

## API

### InteractiveInstance

```typescript
interface InteractiveInstance {
  // Session management
  startSession(): void;
  endSession(): InteractiveSession;
  getSession(): InteractiveSession | null;
  
  // Clarification handling
  handleClarification(request: ClarificationRequest): Promise<ClarificationResponse>;
  
  // State
  isEnabled(): boolean;
  
  // Onboarding
  checkNeedsOnboarding(): OnboardingState;
}
```

### ClarificationRequest

```typescript
interface ClarificationRequest {
  type: ClarificationType;
  context: string;
  term: string;
  suggestion?: string;
  options?: string[];
}

type ClarificationType = 
  | 'name_spelling'
  | 'new_person'
  | 'new_project'
  | 'new_company'
  | 'routing_decision'
  | 'first_run_onboarding'
  | 'general';
```

## Best Practices

1. **Start with interactive mode**: Build context quickly
2. **Review session files**: See what was learned
3. **Switch to batch**: Once context is established
4. **Periodic interactive runs**: Catch new names

## Troubleshooting

### No Prompts Appearing

1. Check `--interactive` flag is set
2. Ensure not also using `--batch`
3. Verify terminal supports prompts

### Too Many Prompts

1. Add more context entries
2. Use `--batch` for known content
3. Add sounds_like mappings

### Prompts Timing Out

1. Increase timeout in config
2. Use `--batch` with manual review

