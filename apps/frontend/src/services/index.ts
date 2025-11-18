/**
 * Services index
 *
 * Exports all service modules for the frontend application
 */

export * from './session';
export * from './storage';
export * from './models';
export * from './chat';
export * from './context';
export * from './conversations';
export * from './cross-tab-sync';
export * from './conversation-search';

// Export data-integrity with explicit re-export to avoid CleanupResult conflict
export {
  DataIntegrityService,
  getDataIntegrityService,
  type IntegrityReport,
  type CleanupResult as DataIntegrityCleanupResult,
} from './data-integrity';
