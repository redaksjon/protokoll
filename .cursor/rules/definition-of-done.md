# Definition of DONE

## Critical Requirement

**A feature, bugfix, or enhancement is NOT DONE until `npm run precommit` passes completely.**

### What `npm run precommit` Includes

The precommit script runs two critical checks sequentially:

1. **Linting** (`npm run lint`)
   - ESLint checks for code quality issues
   - No console statements without explicit `@typescript-eslint/no-unused-vars` disable comments
   - No unused imports or variables
   - Proper TypeScript types and no `any` unless explicitly needed
   - Code style consistency

2. **Testing** (`npm run test`)
   - All unit tests must pass
   - Test coverage must meet thresholds (currently 80%+ for statements/lines, 65%+ for branches)
   - No failing or skipped tests (except known skips that are documented)

### The Complete Success Criteria

For work to be considered complete:

```bash
npm run precommit  # Must exit with code 0 (success)
```

This single command encompasses:
- ✅ Linting passes (no errors or warnings)
- ✅ All tests pass
- ✅ Code coverage maintained or improved
- ✅ No console statements that violate style rules
- ✅ No unused imports or variables

### Common Issues and Fixes

#### console.log() Statements
If linting fails with "Unexpected console statement":

```typescript
// WRONG - fails linting
console.log("some output");

// RIGHT - use eslint-disable comment
// eslint-disable-next-line no-console
console.log("some output");
```

Or use logger instead:
```typescript
logger.info('message with %s', variable);
```

#### Unused Imports
If linting fails with "is defined but never used":
- Remove the unused import
- Don't leave imports just in case they might be needed

#### Test Failures
If tests fail:
- Run `npm test` to see detailed errors
- Fix the underlying issue, not the test
- Ensure edge cases are covered

### CI/CD Integration

When submitting PRs or merging code:
- The CI pipeline will run `npm run precommit`
- If it fails, the build is blocked
- This prevents broken code from reaching production

### Quality Bar

This definition of DONE ensures:
- Code quality is consistent across the project
- Tests catch regressions early
- Linting prevents common mistakes
- Coverage metrics track code reliability
- All code follows the same standards

### Remember

**Tests passing alone is not enough.** Linting must also pass.

Both are equally important to code quality.


