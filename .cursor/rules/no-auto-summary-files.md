# Do Not Create Automatic Summary Files

## Rule: No Automatic Documentation or Reflection Files

**NEVER** automatically create files that summarize, document, or reflect on actions taken during a conversation unless explicitly requested by the user.

### Prohibited Actions

Do NOT create files with names like:
- `agentic-reflection-*.md`
- `summary-*.md`
- `changelog-*.md`
- `session-notes-*.md`
- Any other automatically generated documentation files

### When This Rule Applies

This rule applies to ALL interactions unless the user explicitly says:
- "Create a summary file"
- "Document what you did"
- "Write a reflection"
- Or similar explicit requests

### What You Should Do Instead

1. **Communicate directly**: Explain what you did in your response to the user
2. **Only create necessary files**: Create only the files needed to complete the actual task (source code, configuration files, etc.)
3. **Ask first**: If you think documentation would be helpful, ASK the user if they want it before creating it

### Example Scenarios

❌ **WRONG**: User asks to fix a bug → You fix it AND create `agentic-reflection-commit-2026-01-10.md`

✅ **CORRECT**: User asks to fix a bug → You fix it and explain what you did in your response

❌ **WRONG**: User asks to add a feature → You add it AND create a summary document

✅ **CORRECT**: User asks to add a feature → You add it and describe the changes in your response

### Rationale

The user finds these automatically generated files cluttering the workspace. They prefer clean, focused changes that only include the files necessary for the actual task at hand.

