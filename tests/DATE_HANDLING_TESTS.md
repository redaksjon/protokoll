# Date Handling Tests

## Overview

This document describes the comprehensive date handling tests added to prevent bugs where audio recordings end up in the wrong month directory.

## Bug Report

**Issue**: A recording from January 20th, 2026 ended up in the `2026/3/` directory instead of `2026/1/`.

**Root Cause**: Potential off-by-one or off-by-N errors in month calculations when converting between:
- JavaScript's 0-indexed months (0 = January, 11 = December)
- Human-readable 1-indexed months (1 = January, 12 = December)

## Test Coverage

### File: `tests/date-handling.test.ts`

This test file contains 11 comprehensive tests organized into 4 test suites:

### 1. Date Handling - Directory Structure (3 tests)

Tests basic JavaScript Date handling:

- **should correctly format January date to month 1 directory**
  - Verifies `getMonth()` returns 0 for January
  - Verifies `getMonth() + 1` returns 1 for January

- **should correctly format all months to their 1-indexed directory numbers**
  - Tests all 12 months to ensure correct conversion
  - Prevents off-by-one errors across the entire year

- **should not add extra offsets to month values**
  - Specifically tests for the bug where `month + 3` was suspected
  - Verifies that only `month + 1` is the correct conversion

### 2. Date Handling - Dreadcabinet Integration (4 tests)

Tests the Dreadcabinet library integration:

- **should construct correct output directory for January date**
  - Tests with January 19, 2026 (the exact date from the bug report)
  - Verifies directory is `2026/1` not `2026/3`

- **should construct correct output directories for all months**
  - Tests January, February, March, and December
  - Ensures consistent behavior across all months

- **should handle timezone conversions without changing the date**
  - Tests with America/Los_Angeles timezone
  - Ensures UTC to PST conversion doesn't shift months

- **should handle edge case: date near timezone boundary**
  - Tests January 1, 2026 at 07:00 UTC (= December 31, 2025 at 23:00 PST)
  - Verifies timezone conversion correctly places file in December 2025

### 3. Date Handling - Filename Construction (2 tests)

Tests filename generation:

- **should construct correct filename with date for January recording**
  - Verifies filename starts with correct day (19-0943)
  - Ensures hash and subject are included

- **should construct consistent filenames across all months**
  - Tests that day-time prefix is consistent across months

### 4. Date Handling - Real World Scenario (2 tests)

Tests the exact bug scenario:

- **should handle the reported bug scenario: January 19 recording**
  - Recreates the exact scenario from the bug report
  - Audio file: January 19, 2026 at 17:43 UTC
  - Expected: `2026/1/19-xxxx-east-west-bank.md`
  - Verifies it does NOT go to `2026/3/`

- **should verify month calculation never adds extra offsets**
  - Tests January, February, and March specifically
  - Verifies `month + 1` is correct, `month + 3` is wrong

## Running the Tests

```bash
# Run only date handling tests
npm test -- date-handling.test.ts

# Run all tests
npm test
```

## Test Output

All 11 tests should pass:

```
✓ Date Handling - Directory Structure (3 tests)
✓ Date Handling - Dreadcabinet Integration (4 tests)
✓ Date Handling - Filename Construction (2 tests)
✓ Date Handling - Real World Scenario (2 tests)
```

## What These Tests Prevent

These tests will catch:

1. **Off-by-one errors**: Using `getMonth()` without adding 1
2. **Off-by-N errors**: Accidentally adding 2, 3, or any wrong offset
3. **Timezone bugs**: Date shifting across month boundaries
4. **Dreadcabinet integration issues**: Incorrect date formatting in the library
5. **Filename inconsistencies**: Day/time not matching directory structure

## Future Improvements

If the bug reoccurs, consider:

1. Adding debug logging to track date values through the pipeline
2. Adding integration tests that actually create files and verify their locations
3. Adding tests for edge cases like leap years, DST transitions, etc.
4. Adding tests for all supported timezones

## Related Files

- `src/phases/locate.ts` - Where `creationTime` is determined
- `src/phases/transcribe.ts` - Where files are created
- `src/util/dates.ts` - Date utility functions
- `node_modules/@theunwalked/dreadcabinet/dist/output.js` - Directory construction
- `node_modules/@theunwalked/dreadcabinet/dist/util/dates.js` - Date formatting
