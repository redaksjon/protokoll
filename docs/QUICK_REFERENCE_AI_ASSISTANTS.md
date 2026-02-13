# Quick Reference for AI Assistants

## 🚨 CRITICAL: Read This First

When working with Protokoll transcripts, you MUST use Protokoll MCP tools, NOT direct file editing tools.

## ✅ DO Use These Tools

| Operation | Correct Tool | URI/Resource |
|-----------|-------------|--------------|
| Read transcript | `protokoll_read_transcript` | `protokoll://transcript/{path}` |
| List transcripts | `protokoll_list_transcripts` | `protokoll://transcripts/list` |
| Edit content | `protokoll_provide_feedback` | - |
| Change title | `protokoll_edit_transcript` (with `title` param) | - |
| Update metadata | `protokoll_edit_transcript` (title/project/tags/status) | - |
| Change date | `protokoll_change_transcript_date` | - |
| Create transcript | `protokoll_create_note` | - |
| Combine transcripts | `protokoll_combine_transcripts` | - |

## ❌ DO NOT Use These Tools on Transcripts

- ❌ Read
- ❌ Write
- ❌ StrReplace
- ❌ Glob
- ❌ Grep

## 📖 Get Detailed Instructions

Invoke the `how_to_use_protokoll` prompt for comprehensive guidance:

```
Prompt: how_to_use_protokoll
Arguments: (none)
```

## 🔍 Common Scenarios

### User asks to read a transcript
```
✅ Use: protokoll_read_transcript
❌ Don't: Read tool on file path
```

### User asks to change title
```
✅ Use: protokoll_edit_transcript with title parameter
❌ Don't: StrReplace on file
```

### User asks to fix names/terms
```
✅ Use: protokoll_provide_feedback with natural language corrections
❌ Don't: StrReplace for each fix
```

### User asks to update metadata (project, tags, status)
```
✅ Use: protokoll_edit_transcript with appropriate parameters
❌ Don't: Write to rewrite file
```

## 🎯 Why This Matters

Using Protokoll tools ensures:
- ✅ Proper validation and formatting
- ✅ Metadata consistency
- ✅ File naming conventions
- ✅ Resource change notifications
- ✅ Context integration

## 🆘 If You're Unsure

1. Invoke `how_to_use_protokoll` prompt
2. Check tool descriptions with `tools/list`
3. Ask the user for clarification
4. When in doubt, use Protokoll tools!

## 📚 More Information

See `docs/CURSOR_INTEGRATION.md` for complete documentation.
