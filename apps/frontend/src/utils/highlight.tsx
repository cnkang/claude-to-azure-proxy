/**
 * Keyword Highlighting Utility
 *
 * Provides functions to highlight search keywords in text with WCAG AAA compliant colors.
 *
 * Requirements:
 * - 8.1: Highlight all occurrences of search keywords
 * - 4.1: WCAG AAA color contrast compliance
 */

import React from 'react';

/**
 * Highlights all occurrences of keywords in the given text.
 * Returns JSX with <mark> elements for highlighted keywords.
 *
 * @param text - The text to highlight keywords in
 * @param keywords - Array of keywords to highlight (case-insensitive)
 * @returns React nodes with highlighted keywords
 *
 * @example
 * highlightKeywords("Hello world", ["hello"]) 
 * // Returns: <><mark>Hello</mark> world</>
 */
export function highlightKeywords(
  text: string,
  keywords: string[]
): React.ReactNode {
  // Handle edge cases
  if (!text || keywords.length === 0) {
    return text;
  }

  // Filter out empty keywords and escape special regex characters
  const validKeywords = keywords
    .filter((k) => k.trim().length > 0)
    .map((k) => k.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));

  if (validKeywords.length === 0) {
    return text;
  }

  // Create regex pattern that matches any keyword (case-insensitive)
  // eslint-disable-next-line security/detect-non-literal-regexp -- validKeywords are sanitized above
  const pattern = new RegExp(`(${validKeywords.join('|')})`, 'gi');

  // Split text by pattern, keeping matched parts
  const parts = text.split(pattern);

  // Map parts to JSX, highlighting matches
  return parts.map((part, index) => {
    if (!part) {
      return null; // Skip empty strings
    }

    // Check if this part matches any keyword (case-insensitive)
    const isMatch = validKeywords.some(
      (k) => part.toLowerCase() === k.toLowerCase()
    );

    if (isMatch) {
      return (
        <mark
          key={index}
          className="bg-yellow-200 dark:bg-yellow-900/50 text-gray-900 dark:text-gray-100 font-medium px-0.5 rounded"
        >
          {part}
        </mark>
      );
    }

    return <React.Fragment key={index}>{part}</React.Fragment>;
  });
}

/**
 * Parses a search query into individual keywords.
 * Splits by whitespace and filters out empty strings.
 *
 * @param query - The search query string
 * @returns Array of individual keywords
 *
 * @example
 * parseSearchQuery("hello  world") // Returns: ["hello", "world"]
 */
export function parseSearchQuery(query: string): string[] {
  return query
    .trim()
    .split(/\s+/)
    .filter((k) => k.length > 0);
}
