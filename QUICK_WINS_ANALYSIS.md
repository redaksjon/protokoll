# Quick Wins Workflow - Strategic Path to 90%+ Coverage

**Project**: `/Users/tobrien/gitw/redaksjon/protokoll`  
**Current Coverage**: Lines: 88.58% | Functions: 89.98% | Branches: 77.46%  
**Goal**: 90%+ across all metrics

## 🎯 Impact Analysis

### Projected Improvement (Top 16 Files)

| Metric | Current | Projected | Gain |
|--------|---------|-----------|------|
| **Lines** | 88.58% | **90.4%** | +1.82% ✅ |
| **Functions** | 89.98% | **91.6%** | +1.62% ✅ |
| **Branches** | 77.46% | **83.2%** | +5.8% ✅ |

**All three metrics would exceed 90%!** 🎉

## 📋 Quick Wins Priority List

### Tier 1: Super Quick Wins (1-2 uncovered items each)

| File | Lines | Funcs | Branches | Uncovered | Effort | Impact |
|------|-------|-------|----------|-----------|--------|--------|
| `src/mcp/uri.ts` | 98.44% | 100% | 83.02% | 1L, 9B | ⭐ | HIGH |
| `src/cli/feedback.ts` | 99.59% | 100% | 89.92% | 1L, 13B | ⭐ | HIGH |
| `src/logging.ts` | 100% | 100% | 80% | 0L, 1B | ⭐ | MEDIUM |
| `src/cli/term-context.ts` | 98.55% | 100% | 88.1% | 1L, 5B | ⭐ | MEDIUM |
| `src/feedback/cli.ts` | 95.45% | 100% | 89.47% | 3L, 4B | ⭐ | MEDIUM |

**Total Effort**: ~5-10 tests  
**Total Impact**: +2-3% on overall lines

### Tier 2: Quick Wins (4-7 uncovered items)

| File | Lines | Funcs | Branches | Uncovered | Effort | Impact |
|------|-------|-------|----------|-----------|--------|--------|
| `src/mcp/prompts.ts` | 94.44% | 100% | 84.85% | 4L, 5B | ⭐⭐ | MEDIUM |
| `src/cli/project-assist.ts` | 91.03% | 90% | 90.91% | 7L, 1F, 3B | ⭐⭐ | HIGH |
| `src/arguments.ts` | 92.63% | 100% | 82.86% | 7L, 12B | ⭐⭐ | MEDIUM |
| `src/feedback/index.ts` | 92.31% | 100% | 50% | 1L, 1B | ⭐⭐ | MEDIUM |

**Total Effort**: ~15-20 tests  
**Total Impact**: +2-3% on overall lines

### Tier 3: Medium Wins (6-20 uncovered items)

| File | Lines | Funcs | Branches | Uncovered | Effort | Impact |
|------|-------|-------|----------|-----------|--------|--------|
| `src/cli/action.ts` | 94.85% | 100% | 82.19% | 20L, 39B | ⭐⭐⭐ | HIGH |
| `src/processor.ts` | 92.74% | 100% | 85.51% | 9L, 10B | ⭐⭐ | MEDIUM |
| `src/util/media.ts` | 92.98% | 90% | 87.5% | 4L, 1F, 1B | ⭐⭐ | LOW |
| `src/cli/transcript.ts` | 96.84% | 77.78% | 91.23% | 6L, 4F, 10B | ⭐⭐ | MEDIUM |
| `src/agentic/tools/lookup-project.ts` | 92.63% | 90.91% | 81.03% | 7L, 1F, 11B | ⭐⭐ | MEDIUM |
| `src/cli/content-fetcher.ts` | 92.63% | 90% | 80.56% | 7L, 1F, 7B | ⭐⭐ | MEDIUM |
| `src/context/storage.ts` | 90.59% | 84.62% | 66.67% | 8L, 2F, 10B | ⭐⭐⭐ | HIGH |

**Total Effort**: ~40-50 tests  
**Total Impact**: +3-5% on overall lines and functions

## 📊 Recommended Sequence

### Phase 1: Quick Wins (30 min - 1 hour)
1. ✅ `src/mcp/uri.ts` - 1 branch fix
2. ✅ `src/logging.ts` - 1 branch fix
3. ✅ `src/cli/feedback.ts` - 1 line + 13 branches
4. ✅ `src/cli/term-context.ts` - 1 line + 5 branches

**Expected Result**: Lines 88.8%, Functions 90%, Branches 79%

### Phase 2: Easy Medium Wins (45 min - 1.5 hours)
5. ✅ `src/feedback/index.ts` - 1 line + 1 branch
6. ✅ `src/mcp/prompts.ts` - 4 lines + 5 branches
7. ✅ `src/feedback/cli.ts` - 3 lines + 4 branches
8. ✅ `src/arguments.ts` - 7 lines + 12 branches

**Expected Result**: Lines 89.5%, Functions 90%, Branches 81%

### Phase 3: Final Push (1 - 2 hours)
9. ✅ `src/cli/project-assist.ts` - 7 lines + 1 function + 3 branches
10. ✅ `src/util/media.ts` - 4 lines + 1 function + 1 branch
11. ✅ `src/processor.ts` - 9 lines + 10 branches
12. ✅ `src/cli/action.ts` - 20 lines + 39 branches

**Expected Result**: Lines 90%+, Functions 91%+, Branches 83%+

## 🎯 Test Approach by File Type

### For Branches (UI/CLI Logic)
- Focus on conditional branches: `if/else`, `ternary`, `switch`
- Test different input states
- Test error paths vs success paths

### For Missing Lines
- Trace which code paths aren't executed
- Create specific inputs to trigger those paths
- Often edge cases or error scenarios

### For Functions
- Identify untested function variants
- Test with different parameter combinations
- Check optional parameters

## 💡 Implementation Strategy

1. **Start with Phase 1** (~5 files) - Get quick wins and build momentum
2. **Move to Phase 2** (~4 files) - Maintain 90%+ functions, push lines
3. **Complete Phase 3** (~4 files) - Reach 90%+ across all metrics

## 🎊 Success Criteria

✅ **Lines**: 88.58% → **90%+**  
✅ **Functions**: 89.98% → **90%+**  
✅ **Branches**: 77.46% → **83%+**  

All achievable with focused effort on the 16 identified files!

---

**Estimated Total Effort**: 2-3 hours  
**Estimated Tests to Add**: 50-70 tests  
**Confidence Level**: Very High (based on Brennpunkt analysis)
