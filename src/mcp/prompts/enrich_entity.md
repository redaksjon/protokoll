# Enrich Entity with Smart Assistance

I want to add or enrich a ${entityType} called: ${entityName}

## User Input Expected

**This prompt is typically invoked with additional freeform feedback from the user.** The user may provide:
- **Source URLs or resources** to analyze for enrichment:
  - "Use https://example.com/about to enrich this project"
  - "Analyze https://kubernetes.io/docs to generate metadata for this term"
  - "Read /path/to/project-spec.md to create the entity"
- **Specific metadata** they want to include:
  - "Add sounds_like variants 'kube nets' and 'kube netties'"
  - "Set the domain to 'cloud-native' and topics to 'containers', 'orchestration'"
- **Instructions about the enrichment process**:
  - "Focus on technical terminology when generating metadata"
  - "Include common misspellings in sounds_like"

**Use the user's feedback to determine which sources to analyze and what metadata to generate or include.**

## What This Does

This workflow uses AI to automatically generate metadata for entities by analyzing source content (URLs, files, or existing context).

## Step 1: Check If Entity Already Exists

```
protokoll_search_context
  query: "${entityName}"
```

If it exists, you may want to use `protokoll_edit_${entityType}` instead.

## Step 2: Choose Your Approach

### Option A: Add with Smart Assistance (Recommended)

For **projects** and **terms**, you can provide a source URL or file path, and Protokoll will:
- Generate phonetic variants (`sounds_like`) for transcription correction
- Extract relevant topics and keywords
- Create trigger phrases for classification
- Write a helpful description

```
protokoll_add_${entityType}
  name: "${entityName}"
  source: "https://example.com/about" or "/path/to/file.md"
```

### Option B: Add Manually

If you don't have a source or prefer manual control:

```
protokoll_add_${entityType}
  name: "${entityName}"
  sounds_like: ["phonetic", "variants"]
  (other fields as needed)
```

## What Gets Generated

### For Projects:
- `sounds_like` - How the project name might be transcribed
- `explicit_phrases` - Phrases that trigger routing to this project
- `topics` - Keywords for classification
- `description` - Summary of what the project is about

### For Terms:
- `sounds_like` - Phonetic variants
- `domain` - Technical domain (e.g., "kubernetes", "finance")
- `expansion` - Full form of acronyms
- `description` - What the term means

### For People:
- `sounds_like` - Name pronunciation variants
- Note: People don't support source-based enrichment yet

## Step 3: Review and Refine

After creation, check the generated metadata:

```
protokoll_get_entity
  entityType: "${entityType}"
  entityId: (the ID from the creation response)
```

If you need to adjust anything, use `protokoll_edit_${entityType}`.

## Related Tools

- `protokoll_suggest_project_metadata` - Preview metadata without creating
- `protokoll_suggest_term_metadata` - Preview term metadata without creating
- `protokoll_update_project` - Regenerate project metadata from updated source
- `protokoll_update_term` - Regenerate term metadata from updated source
