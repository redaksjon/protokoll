# Bug Fix: Context Directory Discovery Issue

## Problem

The Protokoll MCP tools were not finding context entities (projects, people, terms) even though they existed in the repository.

### Symptoms

- Context files exist in: `/path/to/repo/context/projects/*.yaml`
- `.protokoll/config.yaml` exists but has no `contextDirectory` setting
- MCP tools look for context in: `/path/to/repo/.protokoll/` (the config directory)
- Result: `protokoll_list_projects` returns 0 projects even though 11 project YAML files exist

### Expected Behavior

The context discovery should default to looking in `./context/` relative to the repository root, NOT in `.protokoll/context/`.

## Root Cause

The context discovery logic in both `src/context/discovery.ts` and `src/overcontext/discovery.ts` was hardcoded to look for context in `.protokoll/context/`, but the actual context structure is:

```
repo/
  .protokoll/
    config.yaml          # Configuration file
  context/               # Context entities (should be default)
    projects/
    people/
    terms/
    companies/
```

## Solution

Changed the default context discovery logic to:

1. **Priority 1**: Use explicit `contextDirectory` from `config.yaml` if specified
2. **Priority 2**: Look for `./context/` at repository root (sibling to `.protokoll/`)
3. **Priority 3**: Fall back to `.protokoll/context/` for backward compatibility

### Configuration Option

Added support for `contextDirectory` in `.protokoll/config.yaml`:

```yaml
# Use a custom context directory
contextDirectory: ./my-custom-context

# Or use an absolute path
contextDirectory: /absolute/path/to/context
```

If not specified, defaults to `./context/` at the repository root.

## Changes Made

### Files Modified

1. **src/context/discovery.ts**
   - Added `resolveContextDirectory()` function to implement the new priority logic
   - Updated `loadHierarchicalConfig()` to use the new resolution logic

2. **src/overcontext/discovery.ts**
   - Added `resolveContextDirectory()` function (same implementation)
   - Updated `loadHierarchicalConfig()` to use the new resolution logic

3. **src/overcontext/adapter.ts**
   - Updated `load()` method to work with the new context directory resolution
   - Fixed import to include `redaksjonPluralNames`

### Tests Added

1. **tests/context/discovery.test.ts**
   - Added test: "should prefer ./context/ at repository root over .protokoll/context/"
   - Added test: "should use explicit contextDirectory from config.yaml"
   - Added test: "should handle absolute contextDirectory path in config.yaml"
   - Added test: "should fall back to default when explicit contextDirectory does not exist"
   - Added test: "should handle no context directory found"

2. **tests/context/bug-context-directory.test.ts** (new file)
   - Comprehensive end-to-end tests for the bug fix
   - Tests all three priority levels
   - Tests backward compatibility

## Test Results

All tests passing:
- 19/19 tests in `tests/context/discovery.test.ts`
- 4/4 tests in `tests/context/bug-context-directory.test.ts`
- All existing tests continue to pass (no regressions)

## Backward Compatibility

The fix maintains full backward compatibility:
- Existing repositories with context in `.protokoll/context/` will continue to work
- No configuration changes required for existing setups
- New repositories can use the simpler `./context/` structure

## Migration Guide

### For New Repositories

Create context at the repository root:

```bash
mkdir -p context/{projects,people,terms,companies}
```

### For Existing Repositories

Option 1: Move context to repository root (recommended):

```bash
mv .protokoll/context ./context
```

Option 2: Keep existing structure (no changes needed):

```bash
# Context remains in .protokoll/context/
# Everything continues to work as before
```

Option 3: Use custom location:

```yaml
# .protokoll/config.yaml
contextDirectory: ./my-custom-location
```

## Verification

To verify the fix works:

```bash
# List projects (should now find entities in ./context/)
protokoll list-projects

# Or via MCP
protokoll_list_projects()
```

## Related Issues

- Fixes context discovery for MCP tools
- Improves developer experience by supporting standard repository structure
- Maintains backward compatibility with existing setups
