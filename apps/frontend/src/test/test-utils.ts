/**
 * Test utilities for happy-dom environment
 *
 * This file provides custom matchers and utilities that work with happy-dom
 * instead of jest-dom, providing similar functionality for testing.
 */

/**
 * Check if an element is in the document
 */
export function isInDocument(_element: Element | null): boolean {
  if (!_element) {
    return false;
  }
  return document.contains(_element);
}

/**
 * Check if an element has a specific attribute
 */
export function hasAttribute(
  element: Element | null,
  attribute: string,
  value?: string
): boolean {
  if (!element) {
    return false;
  }
  if (value !== undefined) {
    return element.getAttribute(attribute) === value;
  }
  return element.hasAttribute(attribute);
}

/**
 * Check if an element has a specific class
 */
export function hasClass(element: Element | null, className: string): boolean {
  if (!element) {
    return false;
  }
  return element.classList.contains(className);
}

/**
 * Check if an element has specific text content
 */
export function hasTextContent(
  element: Element | null,
  text: string | RegExp
): boolean {
  if (!element) {
    return false;
  }
  const textContent = element.textContent || '';
  if (typeof text === 'string') {
    return textContent.includes(text);
  }
  return text.test(textContent);
}

/**
 * Check if an element has focus
 */
export function hasFocus(element: Element | null): boolean {
  if (!element) {
    return false;
  }
  return document.activeElement === element;
}

/**
 * Check if an element is disabled
 */
export function isDisabled(element: Element | null): boolean {
  if (!element) {
    return false;
  }
  return (element as HTMLInputElement | HTMLButtonElement).disabled === true;
}

/**
 * Check if an element has specific styles
 */
export function hasStyle(
  element: Element | null,
  styles: Record<string, string>
): boolean {
  if (!element) {
    return false;
  }
  const computedStyle = window.getComputedStyle(element);
  return Object.entries(styles).every(([property, value]) => {
    return computedStyle.getPropertyValue(property) === value;
  });
}

/**
 * Helper function to wait for element to appear
 */
export async function waitForElement(
  selector: string,
  timeout = 1000
): Promise<Element | null> {
  return new Promise((resolve) => {
    const element = document.querySelector(selector);
    if (element) {
      resolve(element);
      return;
    }

    const observer = new MutationObserver(() => {
      const candidate = document.querySelector(selector);
      if (candidate) {
        observer.disconnect();
        resolve(candidate);
      }
    });

    observer.observe(document.body, {
      childList: true,
      subtree: true,
    });

    setTimeout(() => {
      observer.disconnect();
      resolve(null);
    }, timeout);
  });
}
