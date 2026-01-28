# Edit Entity Workflow

${userMessage}

I'll help you edit the ${entityType} "${entityId}".

## User Input Expected

**This prompt is typically invoked with additional freeform feedback from the user.** The user may provide instructions like:
- "Add phonetic variants 'pre a' and 'pria' to the sounds_like field"
- "Change the company to 'Acme Corp' and role to 'Senior Engineer'"
- "Remove the incorrect sounds_like variant 'john doe'"
- "Update the domain to 'kubernetes' and add topics 'containers', 'orchestration'"
- Any other specific edits to entity fields

**Use the user's feedback to determine which fields to update and what values to set.**

## Step 1: Get Current Entity Data

First, let's see what we're working with:

```
protokoll_get_entity
  entityType: "${entityType}"
  entityId: "${entityId}"
```

This shows the current values for all fields.

## Step 2: Make Your Edits

${entityGuidance}

## Common Editing Patterns

### Adding Phonetic Variants
When Whisper mishears a name/term, add how it sounds:
- Use `add_sounds_like: ["variant1", "variant2"]` to append
- Example: Person "Priya" → add_sounds_like: ["pre a", "pria"]

### Updating Associations
- For people: Change `company` or `role`
- For terms: Update `domain`, add to `topics` or `projects`
- For projects: Modify `destination`, `explicit_phrases`, `topics`

### Removing Bad Data
- Use `remove_sounds_like` to delete incorrect variants
- Use `remove_topics` or `remove_projects` for terms
- Use `remove_explicit_phrases` for projects

${modificationNote}

## Related Tools

- `protokoll_get_entity` - View current entity data
- `protokoll_search_context` - Find entities by name or content
- `protokoll_list_people` / `protokoll_list_terms` / `protokoll_list_projects` - Browse all entities
- `protokoll_delete_entity` - Remove an entity entirely
