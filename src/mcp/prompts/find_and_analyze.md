# Find and Analyze Transcripts

I want to search for transcripts in: ${directory}

## Step 1: List Available Transcripts

Start by seeing what transcripts are available:

```
protokoll_list_transcripts
  directory: "${directory}"
  limit: 50
  sortBy: "date"  (or "filename", "title")
```

### Filtering Options

**By Date Range:**
```
protokoll_list_transcripts
  directory: "${directory}"
  startDate: "2026-01-01"
  endDate: "2026-01-31"
```

**By Content Search:**
```
protokoll_list_transcripts
  directory: "${directory}"
  search: "kubernetes"  (searches filename and content)
```

**Pagination:**
```
protokoll_list_transcripts
  directory: "${directory}"
  limit: 20
  offset: 20  (skip first 20, show next 20)
```

## Step 2: Read Specific Transcripts

Once you've found interesting transcripts, read them:

```
protokoll_read_transcript
  transcriptPath: "/path/from/list/result.md"
```

This returns:
- Full transcript content
- Metadata (date, time, title)
- Routing information (which project it was assigned to)
- Any tags or classifications

## Step 3: Analyze Patterns

Look for:
- **Common topics** - What are you talking about most?
- **Missing context** - Names/terms that weren't recognized
- **Routing issues** - Transcripts in wrong project folders
- **Quality problems** - Transcription errors that need feedback

## Step 4: Take Action

### Fix Transcription Errors
```
protokoll_provide_feedback
  transcriptPath: "/path/to/transcript.md"
  feedback: "Describe the issue"
```

### Update Transcript Metadata
```
protokoll_edit_transcript
  transcriptPath: "/path/to/transcript.md"
  title: "New Title"
  projectId: "correct-project-id"
```

### Add Missing Context
If you notice names/terms that weren't recognized:
```
protokoll_add_person
  name: "Person Name"
  sounds_like: ["how whisper heard it"]

protokoll_add_term
  name: "Technical Term"
  sounds_like: ["mishearing variant"]
```

### Combine Related Transcripts
```
protokoll_combine_transcripts
  transcriptPaths: ["/path/1.md", "/path/2.md"]
  outputPath: "/path/combined.md"
  title: "Combined Meeting Notes"
```

## Common Analysis Workflows

### Find All Transcripts About a Project
```
protokoll_list_transcripts
  directory: "${directory}"
  search: "project-name"
```

### Review Recent Transcripts for Quality
```
protokoll_list_transcripts
  directory: "${directory}"
  startDate: "2026-01-20"
  sortBy: "date"
```

### Find Transcripts with Specific People
```
protokoll_search_context
  query: "person-name"
```

Then check which transcripts mention them.

## Related Tools

- `protokoll_context_status` - See what context is being used
- `protokoll_list_projects` - View all projects for routing analysis
- `protokoll_search_context` - Search across entities and transcripts
