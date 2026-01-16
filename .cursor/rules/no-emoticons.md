# No Emoticons in Documentation

Do not use emoticons, emoji, or unicode symbols as grammatical decoration in documentation. This includes:

- README.md
- Guide files (guide/*.md)
- Documentation files (docs/*.md)
- Prompt files (src/prompt/**/*.md)
- Any other markdown or documentation files

## What to Avoid

**Never use emoticons or symbols for:**

- Decorating headings (🚀, 🎯, 📝, etc.)
- Bullet point prefixes (✅, ⭐, 👉, etc.)
- Emphasis or flair in prose
- Making lists look "fun" or "engaging"

Emoticons add visual noise without semantic value. Professional documentation communicates through clear language, not decorative symbols.

## Acceptable Uses

The following are acceptable because they convey actual meaning:

- ASCII checkmarks in feature comparison tables: ✓ and ✗
- Status indicators in CI/build tables where visual scanning matters

These should only appear in structured data tables, never in prose, headings, or list items.

## Examples

**Bad:**

```markdown
## 🚀 Getting Started
### 🎯 Features
- 📝 Smart transcription
- ✅ **For Developers**: Great tooling
```

**Good:**

```markdown
## Getting Started
### Features
- Smart transcription
- **For Developers**: Great tooling
```

**Acceptable (feature comparison tables only):**

```markdown
| Feature | Protokoll | Other |
|---------|-----------|-------|
| Name Recognition | ✓ | ✗ |
```
