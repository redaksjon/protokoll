# No Emoticons in Documentation

Do not use emoticons or emoji in documentation files including:

- README.md
- Guide files (guide/*.md)
- Documentation files (docs/*.md)
- Prompt files (src/prompt/**/*.md)
- Any other markdown or documentation files

## Exceptions

The only acceptable use of special characters in documentation is:

- Standard table checkmarks: ✅ (for completed/success status)
- Standard table X marks: ❌ (for failed/error status)

These should only be used in status tables, not in prose or headings.

## Examples

**Bad:**
```markdown
## 🚀 Getting Started
### 🎯 Features
- 📝 Smart transcription
```

**Good:**
```markdown
## Getting Started
### Features
- Smart transcription
```

**Acceptable (in status tables only):**
```markdown
| Step | Status |
|------|--------|
| Build | ✅ |
| Test | ❌ |
```

