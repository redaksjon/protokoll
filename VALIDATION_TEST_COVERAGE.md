# MCP Server Validation Test Coverage

This document describes the comprehensive test suite that ensures the MCP server never generates malformed transcript files.

## Test Summary

**Total Tests: 70 passing**

- `tests/util/frontmatter.test.ts`: 30 tests
- `tests/mcp/statusTools.test.ts`: 24 tests  
- `tests/mcp/validation-integration.test.ts`: 16 tests

## What We Test

### 1. Core Frontmatter Functions (`frontmatter.test.ts` - 30 tests)

#### Parsing Tests
- ✅ Parse new format with all metadata in frontmatter
- ✅ Parse old format with entities in body
- ✅ Apply lifecycle defaults when missing
- ✅ Handle files with no frontmatter
- ✅ Prefer frontmatter entities over body entities
- ✅ Parse history arrays
- ✅ Remove entity references section
- ✅ Remove metadata section
- ✅ Handle body with no legacy sections

#### Stringification Tests
- ✅ Create valid YAML frontmatter output
- ✅ NOT have duplicate opening delimiters
- ✅ Remove leading `---` from body before stringifying
- ✅ Start with YAML frontmatter, not title
- ✅ Handle round-trip without introducing duplicate delimiters
- ✅ Handle multiple round-trips without corruption

#### Title Extraction and Placement Tests (8 new tests)
- ✅ Extract H1 title from body when not in frontmatter
- ✅ Remove H1 from body when title is in frontmatter
- ✅ Ensure title is only in frontmatter when stringifying
- ✅ Handle files with no title gracefully
- ✅ Extract title and remove from body in one operation
- ✅ Handle round-trip with title extraction
- ✅ Not remove H2 or other headings from body

### 2. Status Tools Validation (`statusTools.test.ts` - 24 tests)

#### Functional Tests (14 tests)
- ✅ Change status from reviewed to in_progress
- ✅ Record transition in history
- ✅ Not change anything if status is the same
- ✅ Apply default status when transcript has no status
- ✅ Reject invalid status
- ✅ Throw error for non-existent transcript
- ✅ Preserve existing history when adding new transition
- ✅ Create task with generated ID
- ✅ Add task to existing tasks
- ✅ Reject empty description
- ✅ Mark task as done
- ✅ Throw error for non-existent task (complete)
- ✅ Remove task from transcript
- ✅ Throw error for non-existent task (delete)

#### Format Validation Tests (10 new tests)
- ✅ Ensure title is in frontmatter, not in body (handleSetStatus)
- ✅ Ensure no duplicate opening delimiters (handleSetStatus)
- ✅ Ensure title is in frontmatter, not in body (handleCreateTask)
- ✅ Ensure no duplicate opening delimiters (handleCreateTask)
- ✅ Ensure title is in frontmatter, not in body (handleCompleteTask)
- ✅ Ensure no duplicate opening delimiters (handleCompleteTask)
- ✅ Ensure title is in frontmatter, not in body (handleDeleteTask)
- ✅ Ensure no duplicate opening delimiters (handleDeleteTask)
- ✅ Maintain format integrity through multiple operations
- ✅ Handle files that start with H1 title and migrate correctly

### 3. Validation Integration Tests (`validation-integration.test.ts` - 16 tests)

#### Valid Format Tests (3 tests)
- ✅ Accept properly formatted transcript with title in frontmatter
- ✅ Accept transcript with tasks
- ✅ Accept transcript with entities

#### Invalid Format Tests (5 tests)
- ✅ Reject content with duplicate opening delimiters
- ✅ Reject content with title as H1 in body
- ✅ Reject content with title before frontmatter
- ✅ Reject content without closing delimiter
- ✅ Reject content with malformed YAML

#### Stringification Tests (4 tests)
- ✅ Produce valid output with title in frontmatter
- ✅ Remove H1 from body when stringifying
- ✅ Not create duplicate delimiters
- ✅ Handle round-trip without corruption
- ✅ Handle multiple round-trips without corruption

#### Edge Cases and Migrations (4 tests)
- ✅ Handle file with H1 title and no frontmatter title
- ✅ Handle file with both frontmatter title and H1 in body
- ✅ Preserve H2 and H3 headings in body

## Validation Rules Enforced

All MCP server operations that write transcript files enforce these rules:

### 1. **Title Placement**
- Title MUST be in YAML frontmatter
- Title MUST NOT appear as H1 (`# Title`) in body
- H2, H3, etc. headings ARE allowed in body

### 2. **Frontmatter Structure**
- File MUST start with `---`
- File MUST NOT have duplicate opening delimiters (`---\n---`)
- Frontmatter MUST have closing delimiter (`---`)
- YAML MUST be parseable

### 3. **Round-Trip Integrity**
- Parse → Stringify → Parse must produce identical results
- Multiple round-trips must not introduce corruption
- No data loss during format conversions

### 4. **Migration Support**
- Files with H1 titles are automatically migrated
- Old format files are detected and converted
- Legacy sections are removed during stringification

## Where Validation Happens

Validation occurs in `src/mcp/tools/statusTools.ts` in the `validateTranscriptContent()` function, which is called before EVERY file write operation in:

- `handleSetStatus()` - Status changes
- `handleCreateTask()` - Task creation
- `handleCompleteTask()` - Task completion
- `handleDeleteTask()` - Task deletion

Additionally, all transcript creation and editing operations use:
- `parseTranscriptContent()` - Extracts H1 titles to frontmatter
- `stringifyTranscript()` - Removes H1 from body, ensures proper format

## Running the Tests

```bash
# Run all validation tests
npm test -- tests/mcp/statusTools.test.ts tests/mcp/validation-integration.test.ts tests/util/frontmatter.test.ts

# Run specific test suite
npm test -- tests/mcp/validation-integration.test.ts

# Run with coverage
npm test -- --coverage tests/mcp/statusTools.test.ts
```

## Continuous Integration

These tests should be run:
- ✅ On every commit (pre-commit hook)
- ✅ In CI/CD pipeline
- ✅ Before releasing new versions

## Future Enhancements

Consider adding:
- [ ] Property-based testing with random inputs
- [ ] Fuzzing tests for YAML parsing edge cases
- [ ] Performance tests for large files
- [ ] Concurrent write tests
