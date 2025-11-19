# Streaming Flow Validation Script

## Overview

This script provides comprehensive validation of the complete streaming flow after implementing
fixes for SSE connection stability issues (Task 4.7.5).

## Purpose

Validates that:

- ✅ All chunk events are correctly received
- ✅ Usage statistics are properly returned
- ✅ Multiple consecutive requests work correctly
- ✅ No "canceled" errors occur

## Requirements

- Task 4.7.5: Verify complete streaming flow after fix
- Requirements: 9.1, 9.2, 9.3, 9.6

## Prerequisites

1. **Environment Variables**: Ensure `.env` file is configured with:

   ```bash
   AZURE_OPENAI_ENDPOINT=https://your-resource.openai.azure.com
   AZURE_OPENAI_API_KEY=your-api-key
   AZURE_OPENAI_MODEL=your-model-deployment
   ```

2. **Dependencies**: Install required packages:

   ```bash
   cd apps/backend
   pnpm install
   ```

3. **Azure OpenAI Access**: Ensure your Azure OpenAI resource is accessible and the model deployment
   is active.

## Usage

### Run the Validation Script

```bash
cd apps/backend
pnpm tsx scripts/test-streaming-flow-validation.ts
```

Or use the package script:

```bash
cd apps/backend
pnpm test:streaming-flow
```

## Test Scenarios

The script runs 5 comprehensive tests:

### Test 1: Single Message - Chunk Validation

- **Purpose**: Validate basic streaming functionality
- **Message**: "Hello! Please respond with a short greeting (2-3 sentences)."
- **Validates**:
  - Start event received
  - Chunks received correctly
  - End event received
  - Usage statistics returned
  - No canceled errors

### Test 2: Longer Response - Multiple Chunks

- **Purpose**: Test handling of longer responses with multiple chunks
- **Message**: "Please explain what TypeScript is in 3-4 sentences."
- **Validates**:
  - Multiple chunks processed correctly
  - Buffer management works properly
  - All content accumulated correctly

### Test 3-5: Consecutive Requests

- **Purpose**: Validate stability across multiple consecutive requests
- **Messages**:
  - "What is 2 + 2?"
  - "What is the capital of France?"
  - "Name one programming language."
- **Validates**:
  - Connection remains stable
  - No interference between requests
  - Consistent behavior across requests

## Expected Output

### Successful Test Run

```
================================================================================
STREAMING FLOW VALIDATION - Task 4.7.5
================================================================================

Configuration:
  Endpoint: https://your-resource.openai.azure.com
  Model: gpt-4o
  Conversation ID: test-conv-1699999999999

================================================================================

================================================================================
TEST 1: Single Message - Chunk Validation
================================================================================
Message: "Hello! Please respond with a short greeting (2-3 sentences)."

Response Status: 200 OK
Content-Type: text/event-stream; charset=utf-8

Processing stream...

[START] Message ID: msg-123, Model: gpt-4o
[CHUNK 1] 5 chars: "Hello"
[CHUNK 2] 6 chars: " there"
[CHUNK 3] 1 chars: "!"
[END] Usage: input=15, output=25, total=40

Stream completed!

Results:
  Duration: 2500ms
  Chunks received: 15
  Content length: 120 characters
  Start event: ✅
  End event: ✅
  Usage statistics: ✅
  Canceled error: ✅ None

Test Result: ✅ PASSED

[... Tests 2-5 ...]

================================================================================
TEST SUMMARY
================================================================================

Total Tests: 5
Passed: 5 ✅
Failed: 0 ✅
Canceled Errors: 0 ✅

Detailed Results:
--------------------------------------------------------------------------------
Test | Name                          | Status | Chunks | Usage | Canceled
--------------------------------------------------------------------------------
   1 | Single Message - Chunk Valid  | ✅ PASS |     15 |    ✅ | ✅ NO
   2 | Longer Response - Multiple C  | ✅ PASS |     25 |    ✅ | ✅ NO
   3 | Consecutive Request #1        | ✅ PASS |      8 |    ✅ | ✅ NO
   4 | Consecutive Request #2        | ✅ PASS |     10 |    ✅ | ✅ NO
   5 | Consecutive Request #3        | ✅ PASS |      6 |    ✅ | ✅ NO
--------------------------------------------------------------------------------

Performance Metrics:
  Average Duration: 2800ms
  Total Chunks: 64
  Total Content: 450 characters

Success Criteria Validation:
  ✓ All tests passed: ✅ YES
  ✓ No canceled errors: ✅ YES
  ✓ All chunks received: ✅ YES
  ✓ Usage statistics returned: ✅ YES
  ✓ Multiple consecutive requests: ✅ YES

================================================================================
FINAL VERDICT: ✅ ALL TESTS PASSED
================================================================================
```

### Failed Test Run (Example)

```
================================================================================
TEST 1: Single Message - Chunk Validation
================================================================================
Message: "Hello! Please respond with a short greeting (2-3 sentences)."

❌ Request Failed
  Error: canceled
  Code: ERR_CANCELED
  Canceled: YES
  Duration: 5000ms

================================================================================
TEST SUMMARY
================================================================================

Total Tests: 5
Passed: 0 ✅
Failed: 5 ❌
Canceled Errors: 5 ❌

[... detailed results ...]

================================================================================
FINAL VERDICT: ❌ SOME TESTS FAILED
================================================================================
```

## Success Criteria

The validation is considered successful when:

1. ✅ **All tests pass** (5/5)
2. ✅ **No canceled errors** occur in any test
3. ✅ **All chunks received** for each request
4. ✅ **Usage statistics returned** for each successful request
5. ✅ **Multiple consecutive requests** complete successfully

## Interpreting Results

### Test Status Indicators

- **✅ PASS**: Test completed successfully with all validations passing
- **❌ FAIL**: Test failed due to errors or missing data
- **✅ YES**: Criterion met
- **❌ NO**: Criterion not met

### Common Issues

#### Issue: Canceled Errors

**Symptom**: Tests fail with "ERR_CANCELED" or "canceled" error message

**Possible Causes**:

- AbortController being triggered prematurely
- Cleanup logic aborting before stream completes
- Race conditions in finally blocks

**Solution**: Review StreamingService cleanup logic and AbortController usage

#### Issue: No Chunks Received

**Symptom**: Tests complete but `chunksReceived: 0`

**Possible Causes**:

- SSE parsing issues
- Model not generating output
- Request format incorrect

**Solution**: Check SSE parser implementation and request format

#### Issue: Missing Usage Statistics

**Symptom**: Tests pass but `usageReturned: false`

**Possible Causes**:

- End event not including usage data
- Response format changed
- Parser not extracting usage correctly

**Solution**: Review end event handling and usage extraction logic

#### Issue: Timeout

**Symptom**: Tests fail with timeout error after 2 minutes

**Possible Causes**:

- Model taking too long to respond
- Network issues
- API throttling

**Solution**: Check Azure OpenAI service status and network connectivity

## Troubleshooting

### Enable Debug Logging

Set environment variable for detailed logging:

```bash
LOG_LEVEL=debug pnpm tsx scripts/test-streaming-flow-validation.ts
```

### Test Individual Scenarios

Modify the script to run only specific tests by commenting out others in the `runAllTests()` method.

### Check Azure OpenAI Status

Verify your Azure OpenAI resource is healthy:

```bash
curl -X GET "${AZURE_OPENAI_ENDPOINT}/openai/models?api-version=2024-10-01-preview" \
  -H "api-key: ${AZURE_OPENAI_API_KEY}"
```

### Compare with Direct Test

Run the direct Azure test to establish baseline:

```bash
pnpm test:azure-direct
```

If direct test passes but this validation fails, the issue is in the StreamingService
implementation.

## Integration with Task Workflow

This script is part of Task 4.7.5 validation:

1. **Task 4.7.1-4.7.3**: Added comprehensive logging and debugging
2. **Task 4.7.4**: Validated Azure OpenAI API works with direct calls
3. **Task 4.7.5** (This Script): Validate complete streaming flow after fixes

## Next Steps

### If All Tests Pass

1. ✅ Mark Task 4.7.5 as complete
2. ✅ Document validation results
3. ✅ Proceed to Task 5 (Error Classification and Reconnection)

### If Tests Fail

1. ❌ Analyze failure patterns
2. ❌ Review StreamingService implementation
3. ❌ Compare with Task 4.7.4 direct test results
4. ❌ Fix identified issues
5. ❌ Re-run validation

## Files Modified

- **Created**: `apps/backend/scripts/test-streaming-flow-validation.ts`
- **Created**: `apps/backend/scripts/README-streaming-flow-validation.md`
- **Modified**: `apps/backend/package.json` (add test script)

## Related Documentation

- Task 4.7.4 Validation Report:
  `.kiro/specs/fix-sse-connection-stability/task-4.7.4-validation-report.md`
- Task 4.7.3 Validation Guide:
  `.kiro/specs/fix-sse-connection-stability/task-4.7.3-validation-guide.md`
- Design Document: `.kiro/specs/fix-sse-connection-stability/design.md`
- Requirements Document: `.kiro/specs/fix-sse-connection-stability/requirements.md`

## Conclusion

This validation script provides comprehensive verification that the streaming flow works correctly
after implementing fixes for SSE connection stability issues. It tests all critical aspects
including chunk reception, usage statistics, and consecutive request handling, ensuring the system
meets all requirements before proceeding to the next phase of implementation.
