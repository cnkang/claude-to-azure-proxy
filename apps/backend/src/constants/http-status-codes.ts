/**
 * HTTP Status Codes used in the application
 *
 * This module defines standard and non-standard HTTP status codes
 * with clear documentation on when to use each one.
 */

/**
 * 408 Request Timeout
 *
 * Standard HTTP status code (RFC 7231)
 *
 * Use when:
 * - Server-side timeout occurs (request processing takes too long)
 * - Server decides to close connection due to timeout
 * - Middleware timeout is triggered
 *
 * Do NOT use for:
 * - Client actively cancels/aborts request (use 499 instead)
 * - Client connection drops (use 499 instead)
 */
export const HTTP_STATUS_REQUEST_TIMEOUT = 408;

/**
 * 499 Client Closed Request
 *
 * Non-standard status code (Nginx convention, widely adopted)
 *
 * Use when:
 * - Client actively cancels/aborts the request
 * - Client closes connection before server completes response
 * - AbortController/AbortSignal triggers cancellation
 * - Network connection drops on client side
 *
 * Benefits:
 * - Distinguishes client-initiated cancellations from server timeouts
 * - Improves monitoring and alerting accuracy
 * - Helps identify user behavior vs performance issues
 * - Prevents false positives in timeout alerts
 *
 * Industry adoption:
 * - Nginx (original implementation)
 * - AWS CloudFront, Application Load Balancer
 * - Google Cloud Load Balancer
 * - Cloudflare
 */
export const HTTP_STATUS_CLIENT_CLOSED_REQUEST = 499;

/**
 * 500 Internal Server Error
 *
 * Standard HTTP status code (RFC 7231)
 *
 * Use when:
 * - Unexpected server error occurs
 * - Unhandled exception is caught
 * - Server cannot complete request due to internal failure
 */
export const HTTP_STATUS_INTERNAL_SERVER_ERROR = 500;

/**
 * 503 Service Unavailable
 *
 * Standard HTTP status code (RFC 7231)
 *
 * Use when:
 * - Service is temporarily unavailable
 * - Circuit breaker is open
 * - Dependency service is down
 * - Server is overloaded
 */
export const HTTP_STATUS_SERVICE_UNAVAILABLE = 503;
