# Duplicate Question Prevention

## Problem
When processing long transcripts in interactive mode, protokoll was asking the same questions repeatedly about people and projects that had already been resolved during the same session.

## Root Cause
The lookup tools (`lookup_person`, `lookup_project`) were only checking the context files on disk, not the in-memory state of entities that were just resolved. When a user answered a question about "John Doe" early in the transcript, and the same name appeared again later, the tool would ask about it again because:

1. The newly created entity was saved to disk but not immediately available in subsequent searches
2. The tools didn't check if the entity was already resolved during this processing session

## Solution

### 1. Resolved Entities Tracking
Added `resolvedEntities` Map to the `ToolContext`:

```typescript
export interface ToolContext {
    // ... existing fields
    resolvedEntities?: Map<string, string>;  // Entities resolved during this session
}
```

This Map tracks all entity resolutions made during the current transcript processing session.

### 2. Check Before Prompting
Updated both `lookup_person` and `lookup_project` tools to check the resolved entities first:

```typescript
// First, check if this person was already resolved in this session
if (ctx.resolvedEntities?.has(args.name)) {
    const resolvedName = ctx.resolvedEntities.get(args.name);
    return {
        success: true,
        data: {
            found: true,
            suggestion: `Already resolved: use "${resolvedName}"`,
            cached: true,
        },
    };
}
```

### 3. Immediate Context Reload
After saving a new entity to disk, immediately reload the context:

```typescript
await ctx.contextInstance.saveEntity(newProject);
await ctx.contextInstance.reload();  // Reload so subsequent searches find this entity
```

This ensures that subsequent tool calls will find the newly created entity even before checking the resolved entities cache.

## Benefits

**No Duplicate Questions:** Users are only asked about each person/project/term once per transcript  
**Better UX:** Faster processing for long transcripts with repeated mentions  
**Maintains State:** The resolved entities Map is shared across all tool executions in the session  
**Backwards Compatible:** Works even if `resolvedEntities` is undefined (graceful fallback)

## Example

### Before (Annoying!)
```
Processing transcript with 20 mentions of "Trey Toulson"...

────────────────────────────────────────────────────────────
[Unknown Person Detected]
Name heard: "Trey Toulson"
...
────────────────────────────────────────────────────────────
Is the name spelled correctly? → User enters details

[... processing continues ...]

────────────────────────────────────────────────────────────
[Unknown Person Detected]
Name heard: "Trey Toulson"  ← SAME PERSON AGAIN!
...
────────────────────────────────────────────────────────────
Is the name spelled correctly? → User asked AGAIN!
```

### After (Fixed!)
```
Processing transcript with 20 mentions of "Trey Toulson"...

────────────────────────────────────────────────────────────
[Unknown Person Detected]
Name heard: "Trey Toulson"
...
────────────────────────────────────────────────────────────
Is the name spelled correctly? → User enters details

[... processing continues ...]

[Tool automatically uses cached resolution for "Trey Toulson"]
[No prompt - continues processing smoothly]
```

## Implementation Details

### Files Modified
- `src/agentic/types.ts` - Added `resolvedEntities` to `ToolContext`
- `src/agentic/executor.ts` - Wire up resolved entities and reload context after saves
- `src/agentic/tools/lookup-person.ts` - Check cache before prompting
- `src/agentic/tools/lookup-project.ts` - Check cache before prompting

### Test Coverage
Added 8 new tests in `tests/agentic/resolved-entities.test.ts`:
- Test that first lookup prompts
- Test that second lookup returns cached result
- Test that multiple lookups of same entity don't prompt again
- Test cross-tool entity sharing
- Test graceful handling when resolvedEntities is undefined

All 580 tests passing.
