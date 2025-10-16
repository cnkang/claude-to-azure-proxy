import { logger } from '../middleware/logging.js';
import type { SecurityLogEntry } from '../middleware/logging.js';

export interface SecurityEventContext {
  readonly correlationId: string;
  readonly operation?: string;
  readonly source?: string;
  readonly metadata?: Readonly<Record<string, unknown>>;
}

export interface StructuredSecurityEvent {
  readonly eventType: string;
  readonly severity: SecurityLogEntry['severity'];
  readonly clientInfo?: Readonly<Record<string, unknown>>;
  readonly outcome?: string;
  readonly details?: Readonly<Record<string, unknown>>;
}

const buildSecurityDetails = (
  context: Readonly<SecurityEventContext>,
  event: Readonly<StructuredSecurityEvent>
): Record<string, unknown> => {
  const details: Record<string, unknown> = {};

  if (context.metadata !== undefined) {
    details.context = context.metadata;
  }

  if (event.clientInfo !== undefined) {
    details.clientInfo = event.clientInfo;
  }

  if (event.outcome !== undefined) {
    details.outcome = event.outcome;
  }

  if (event.details !== undefined) {
    details.details = event.details;
  }

  return details;
};

export class StructuredLogger {
  public static logSecurityEvent(
    context: Readonly<SecurityEventContext>,
    event: Readonly<StructuredSecurityEvent>
  ): void {
    const correlationId =
      typeof context.correlationId === 'string' && context.correlationId.length > 0
        ? context.correlationId
        : 'unknown';

    const message =
      context.operation !== undefined && context.operation.length > 0
        ? `Security event recorded: ${context.operation}`
        : 'Security event recorded';

    const source =
      context.operation ??
      context.source ??
      'structured-logger';

    const details = buildSecurityDetails(context, event);

    logger.security(
      message,
      correlationId,
      event.eventType,
      event.severity,
      source,
      details
    );
  }
}
