# Direct Azure OpenAI API Test Script

## Purpose

This test script (`test-azure-direct.ts`) makes direct axios calls to the Azure OpenAI Responses API
to isolate and debug the "canceled" error issue discovered during Task 4.7 validation. It bypasses
the streaming service complexity to test the API directly with minimal configuration.

## Task Reference

- **Task**: 4.7.4 - Test direct Azure OpenAI API calls
- **Requirements**: 9.1, 9.2, 9.3
- **Goal**: Isolate the root cause of "canceled" errors by testing with and without AbortController

## Test Scenarios

The script runs three independent tests:

### Test 1: Without AbortController

- Makes a direct axios call to Azure OpenAI Responses API
- **No AbortController** signal provided
- Uses configured timeout from environment
- Tests baseline behavior without abort signal

### Test 2: With AbortController (Not Aborted)

- Makes a direct axios call with AbortController
- AbortController is created but **never aborted**
- Monitors signal state throughout the request lifecycle
- Compares behavior with Test 1 to identify if AbortController presence causes issues

### Test 3: Minimal Configuration

- Absolute minimal axios configuration
- **No timeout** configured
- **No AbortController** signal
- Tests if configuration complexity contributes to the issue

## Prerequisites

1. **Environment Variables**: Ensure the following are set in `.env`:

   ```bash
   AZURE_OPENAI_ENDPOINT=https://your-resource.openai.azure.com
   AZURE_OPENAI_API_KEY=your-azure-api-key
   AZURE_OPENAI_MODEL=your-model-deployment-name
   AZURE_OPENAI_TIMEOUT=120000  # Optional, defaults to 120000ms
   ```

2. **Dependencies**: All dependencies should be installed via `pnpm install`

## Running the Test

From the backend directory:

```bash
# Using pnpm script (recommended)
pnpm test:azure-direct

# Or directly with tsx
tsx scripts/test-azure-direct.ts
```

## Expected Output

The script provides detailed logging for each test:

```
╔════════════════════════════════════════════════════════════════╗
║  Direct Azure OpenAI API Test Script                          ║
║  Task 4.7.4: Test direct Azure OpenAI API calls               ║
╚════════════════════════════════════════════════════════════════╝

=== TEST 1: Direct Azure OpenAI Call WITHOUT AbortController ===

Configuration:
  Endpoint: https://your-resource.openai.azure.com/openai/v1/responses
  Model: gpt-4o
  Timeout: 120000ms
  Correlation ID: <uuid>

[timestamp] Making axios request...
[timestamp] Response received (XXXms)
  Status: 200 OK
  Content-Type: text/event-stream

<streaming response content>

[timestamp] Stream completed
  Total chunks: XX
  Content length: XXX characters
  Total duration: XXXms
  Completed: true

✅ TEST 1 PASSED: Request completed successfully without AbortController

<similar output for Test 2 and Test 3>
```

## Interpreting Results

### Success Indicators

- ✅ All three tests complete without errors
- ✅ Streaming responses are received and parsed correctly
- ✅ No "canceled" errors occur
- ✅ Signal state remains `aborted=false` throughout Test 2

### Failure Indicators

- ❌ "ERR_CANCELED" error code appears
- ❌ Signal becomes aborted unexpectedly in Test 2
- ❌ Timeout errors occur
- ❌ Different behavior between tests

### Key Comparisons

1. **Test 1 vs Test 2**: If Test 1 succeeds but Test 2 fails, the AbortController presence is
   causing the issue
2. **Test 2 vs Test 3**: If Test 3 succeeds but Test 2 fails, the timeout configuration may interact
   poorly with AbortController
3. **All Tests Fail**: The issue is with the Azure OpenAI API endpoint or configuration
4. **All Tests Succeed**: The issue is in the streaming service implementation, not the API calls

## Debugging Information

The script logs:

- Request configuration and timing
- Response headers and status
- Signal state at critical points (Test 2)
- Chunk reception and parsing
- Error details with classification (canceled, timeout, etc.)
- Total duration and completion status

## Next Steps Based on Results

### If All Tests Pass

- The Azure OpenAI API is working correctly
- The issue is in the streaming service implementation
- Review how AbortController is managed in `streaming-service.ts`
- Check for race conditions in cleanup logic

### If Test 2 Fails (With AbortController)

- AbortController presence causes the issue
- Investigate axios + AbortController interaction
- Consider alternative cancellation mechanisms
- Review Node.js version compatibility

### If All Tests Fail

- Verify Azure OpenAI endpoint configuration
- Check API key validity
- Verify model deployment name
- Test network connectivity to Azure

## Related Files

- `apps/backend/src/services/streaming-service.ts` - Main streaming service implementation
- `apps/backend/src/config/index.ts` - Configuration management
- `.kiro/specs/fix-sse-connection-stability/tasks.md` - Task list and requirements

## Troubleshooting

### "Missing required environment variables"

- Ensure `.env` file exists in `apps/backend/`
- Verify all required variables are set
- Check for typos in variable names

### "ECONNREFUSED" or network errors

- Verify Azure OpenAI endpoint URL is correct
- Check network connectivity
- Verify firewall rules allow outbound HTTPS

### "401 Unauthorized"

- Verify API key is correct and not expired
- Check API key has proper permissions
- Ensure endpoint URL matches the API key's resource

### Parse errors

- Azure OpenAI API may have changed response format
- Check API version compatibility
- Review Azure OpenAI documentation for updates

## Additional Notes

- The script uses a simple test prompt to minimize response time
- Each test waits 2 seconds between runs to avoid rate limiting
- All tests are independent and can be run separately if needed
- The script exits with code 0 on success, 1 on failure
