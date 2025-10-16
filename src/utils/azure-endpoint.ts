/**
 * Utility helpers for working with Azure OpenAI endpoint URLs.
 *
 * Ensures consistent formatting for Azure OpenAI Responses API base URLs
 * by appending the required `/openai/v1/` suffix when missing.
 */

/**
 * Normalize an Azure OpenAI endpoint to the Responses API base URL.
 *
 * @param endpoint - Raw endpoint or base URL from configuration
 * @returns Endpoint guaranteed to end with `/openai/v1/`
 */
export const ensureResponsesBaseURL = (endpoint: string): string => {
  let normalized = endpoint.trim();

  if (!normalized.endsWith('/')) {
    normalized += '/';
  }

  if (!normalized.endsWith('openai/v1/')) {
    if (normalized.endsWith('openai/v1')) {
      normalized += '/';
    } else {
      normalized += 'openai/v1/';
    }
  }

  return normalized;
};
