/**
 * Session Management Service
 *
 * Provides secure session management with browser fingerprinting and isolation
 * to ensure conversation privacy between different browser sessions.
 *
 * Requirements: 13.2, 13.3, 13.5
 */

import type { SessionState, UserPreferences } from '../types/index';

// Session storage keys
const SESSION_STORAGE_KEY = 'claude-proxy-session';
const SESSION_PREFERENCES_KEY = 'claude-proxy-preferences';
const SESSION_VALIDATION_KEY = 'claude-proxy-validation';
const SHARED_SESSION_KEY = 'claude-proxy-shared-session';
const SHARED_SESSION_VALIDATION_KEY = 'claude-proxy-shared-validation';

// Session validation interval (5 minutes)
const SESSION_VALIDATION_INTERVAL = 5 * 60 * 1000;

/**
 * Browser fingerprint data for session validation
 */
interface BrowserFingerprint {
  userAgent: string;
  screenResolution: string;
  timezone: string;
  language: string;
  platform: string;
  cookieEnabled: boolean;
  doNotTrack: string | null;
  colorDepth: number;
  pixelRatio: number;
}

/**
 * Session validation data stored in sessionStorage
 */
interface SessionValidation {
  sessionId: string;
  fingerprint: BrowserFingerprint;
  createdAt: number;
  lastValidated: number;
  isValid: boolean;
}

/**
 * Session management class providing secure session handling
 */
export class SessionManager {
  private static instance: SessionManager | null = null;
  private currentSession: SessionState | null = null;
  private validationTimer: number | null = null;
  private readonly fingerprint: BrowserFingerprint;

  private constructor() {
    this.fingerprint = this.generateBrowserFingerprint();
    this.initializeSession();
    this.startValidationTimer();
  }

  /**
   * Get singleton instance of SessionManager
   */
  public static getInstance(): SessionManager {
    SessionManager.instance ??= new SessionManager();
    return SessionManager.instance;
  }

  /**
   * Generate a secure session ID with browser fingerprinting
   */
  private generateSessionId(): string {
    const timestamp = Date.now();
    const random = crypto.getRandomValues(new Uint8Array(16));
    const randomHex = Array.from(random, (byte) =>
      byte.toString(16).padStart(2, '0')
    ).join('');

    // Create fingerprint hash for session uniqueness
    const fingerprintData = JSON.stringify(this.fingerprint);
    const encoder = new TextEncoder();
    const data = encoder.encode(fingerprintData + timestamp);

    // Use a simple hash for fingerprint (crypto.subtle would be async)
    let hash = 0;
    for (let i = 0; i < data.length; i++) {
      hash = ((hash << 5) - hash + data[i]) & 0xffffffff;
    }

    return `session_${timestamp}_${Math.abs(hash).toString(36)}_${randomHex}`;
  }

  /**
   * Generate browser fingerprint for session validation
   */
  private generateBrowserFingerprint(): BrowserFingerprint {
    return {
      userAgent: navigator.userAgent.slice(0, 100), // Limit length for storage
      screenResolution: `${window.screen.width}x${window.screen.height}`,
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      language: navigator.language,
      platform: navigator.platform,
      cookieEnabled: navigator.cookieEnabled,
      doNotTrack: navigator.doNotTrack,
      colorDepth: window.screen.colorDepth,
      pixelRatio: window.devicePixelRatio,
    };
  }

  /**
   * Initialize session from storage or create new session
   */
  private initializeSession(): void {
    try {
      const storedSession = sessionStorage.getItem(SESSION_STORAGE_KEY);
      const storedValidation = sessionStorage.getItem(SESSION_VALIDATION_KEY);

      if (storedSession !== null && storedValidation !== null) {
        const sessionData = JSON.parse(storedSession) as SessionState;
        const validationData = JSON.parse(
          storedValidation
        ) as SessionValidation;

        // Validate session integrity
        if (this.validateSessionIntegrity(sessionData, validationData)) {
          this.currentSession = {
            ...sessionData,
            createdAt: new Date(sessionData.createdAt),
          };
          return;
        }
      }

      // Fallback: attempt to reuse a shared session for cross-tab continuity
      const sharedSession = localStorage.getItem(SHARED_SESSION_KEY);
      const sharedValidation = localStorage.getItem(
        SHARED_SESSION_VALIDATION_KEY
      );

      if (sharedSession !== null && sharedValidation !== null) {
        const sessionData = JSON.parse(sharedSession) as SessionState;
        const validationData = JSON.parse(
          sharedValidation
        ) as SessionValidation;

        if (this.validateSessionIntegrity(sessionData, validationData)) {
          this.currentSession = {
            ...sessionData,
            createdAt: new Date(sessionData.createdAt),
          };

          sessionStorage.setItem(
            SESSION_STORAGE_KEY,
            JSON.stringify(this.currentSession)
          );
          sessionStorage.setItem(
            SESSION_VALIDATION_KEY,
            JSON.stringify(validationData)
          );
          return;
        }
      }
    } catch (_error) {
      // Log error in development but continue with new session
      if (import.meta.env.DEV) {
        // console.warn('Failed to restore session from storage:', error);
      }
    }

    // Create new session if restoration failed or no session exists
    this.createNewSession();
  }

  /**
   * Create a new session
   */
  private createNewSession(): void {
    const sessionId = this.generateSessionId();
    const now = new Date();

    // Load preferences from localStorage (persistent across browser sessions)
    const preferences = this.loadPreferences();

    this.currentSession = {
      sessionId,
      preferences,
      createdAt: now,
    };

    // Store session in sessionStorage (cleared when browser tab closes)
    this.persistSession();

    // Create validation data
    const validation: SessionValidation = {
      sessionId,
      fingerprint: this.fingerprint,
      createdAt: now.getTime(),
      lastValidated: now.getTime(),
      isValid: true,
    };

    sessionStorage.setItem(SESSION_VALIDATION_KEY, JSON.stringify(validation));
    localStorage.setItem(
      SHARED_SESSION_VALIDATION_KEY,
      JSON.stringify(validation)
    );
  }

  /**
   * Validate session integrity using browser fingerprint
   */
  private validateSessionIntegrity(
    sessionData: SessionState,
    validationData: SessionValidation
  ): boolean {
    // Check if session IDs match
    if (sessionData.sessionId !== validationData.sessionId) {
      return false;
    }

    // Check if session is marked as valid
    if (!validationData.isValid) {
      return false;
    }

    // Check if fingerprint matches (allowing for minor variations)
    const currentFingerprint = this.fingerprint;
    const storedFingerprint = validationData.fingerprint;

    // Critical fingerprint components that must match exactly
    const criticalMatch =
      currentFingerprint.userAgent === storedFingerprint.userAgent &&
      currentFingerprint.timezone === storedFingerprint.timezone &&
      currentFingerprint.language === storedFingerprint.language &&
      currentFingerprint.platform === storedFingerprint.platform;

    if (!criticalMatch) {
      return false;
    }

    // Allow minor variations in screen resolution and pixel ratio
    // (user might have changed display settings)
    const screenMatch = this.isScreenResolutionSimilar(
      currentFingerprint.screenResolution,
      storedFingerprint.screenResolution
    );

    return screenMatch;
  }

  /**
   * Check if screen resolutions are similar (allowing for minor changes)
   */
  private isScreenResolutionSimilar(current: string, stored: string): boolean {
    if (current === stored) {
      return true;
    }

    // Parse resolutions
    const currentMatch = current.match(/(\d+)x(\d+)/);
    const storedMatch = stored.match(/(\d+)x(\d+)/);

    if (!currentMatch || !storedMatch) {
      return false;
    }

    const currentWidth = parseInt(currentMatch[1], 10);
    const currentHeight = parseInt(currentMatch[2], 10);
    const storedWidth = parseInt(storedMatch[1], 10);
    const storedHeight = parseInt(storedMatch[2], 10);

    // Allow 10% variation in screen resolution
    const widthDiff = Math.abs(currentWidth - storedWidth) / storedWidth;
    const heightDiff = Math.abs(currentHeight - storedHeight) / storedHeight;

    return widthDiff <= 0.1 && heightDiff <= 0.1;
  }

  /**
   * Load user preferences from localStorage
   */
  private loadPreferences(): UserPreferences {
    try {
      const stored = localStorage.getItem(SESSION_PREFERENCES_KEY);
      if (stored !== null) {
        return JSON.parse(stored) as UserPreferences;
      }
    } catch (_error) {
      if (import.meta.env.DEV) {
        // console.warn('Failed to load preferences:', error);
      }
    }

    // Return default preferences
    return {
      theme: 'auto',
      language: navigator.language.startsWith('zh') ? 'zh' : 'en',
      selectedModel: 'gpt-4', // Default model
    };
  }

  /**
   * Persist session to sessionStorage
   */
  private persistSession(): void {
    if (!this.currentSession) {
      return;
    }

    try {
      sessionStorage.setItem(
        SESSION_STORAGE_KEY,
        JSON.stringify(this.currentSession)
      );
      localStorage.setItem(
        SHARED_SESSION_KEY,
        JSON.stringify(this.currentSession)
      );
    } catch (_error) {
      if (import.meta.env.DEV) {
        // console.error('Failed to persist session:', error);
      }
    }
  }

  /**
   * Persist preferences to localStorage
   */
  private persistPreferences(): void {
    if (!this.currentSession) {
      return;
    }

    try {
      localStorage.setItem(
        SESSION_PREFERENCES_KEY,
        JSON.stringify(this.currentSession.preferences)
      );
    } catch (_error) {
      if (import.meta.env.DEV) {
        // console.error('Failed to persist preferences:', error);
      }
    }
  }

  /**
   * Start session validation timer
   */
  private startValidationTimer(): void {
    this.validationTimer = window.setInterval(() => {
      this.validateSession();
    }, SESSION_VALIDATION_INTERVAL);
  }

  /**
   * Validate current session
   */
  private validateSession(): void {
    if (!this.currentSession) {
      return;
    }

    try {
      const storedValidation = sessionStorage.getItem(SESSION_VALIDATION_KEY);
      if (storedValidation === null) {
        this.invalidateSession();
        return;
      }

      const validationData = JSON.parse(storedValidation) as SessionValidation;

      if (!this.validateSessionIntegrity(this.currentSession, validationData)) {
        this.invalidateSession();
        return;
      }

      // Update last validated timestamp
      validationData.lastValidated = Date.now();
      sessionStorage.setItem(
        SESSION_VALIDATION_KEY,
        JSON.stringify(validationData)
      );
      localStorage.setItem(
        SHARED_SESSION_VALIDATION_KEY,
        JSON.stringify(validationData)
      );
    } catch (_error) {
      if (import.meta.env.DEV) {
        // console.error('Session validation failed:', error);
      }
      this.invalidateSession();
    }
  }

  /**
   * Invalidate current session and create new one
   */
  private invalidateSession(): void {
    this.clearSessionStorage();
    this.createNewSession();

    // Dispatch session invalidated event
    window.dispatchEvent(
      new CustomEvent('sessionInvalidated', {
        detail: { sessionId: this.currentSession?.sessionId },
      })
    );
  }

  /**
   * Clear session storage
   */
  private clearSessionStorage(): void {
    try {
      sessionStorage.removeItem(SESSION_STORAGE_KEY);
      sessionStorage.removeItem(SESSION_VALIDATION_KEY);
      localStorage.removeItem(SHARED_SESSION_KEY);
      localStorage.removeItem(SHARED_SESSION_VALIDATION_KEY);
    } catch (_error) {
      if (import.meta.env.DEV) {
        // console.error('Failed to clear session storage:', error);
      }
    }
  }

  /**
   * Get current session
   */
  public getCurrentSession(): SessionState | null {
    return this.currentSession;
  }

  /**
   * Get current session ID
   */
  public getSessionId(): string | null {
    return this.currentSession?.sessionId ?? null;
  }

  /**
   * Update user preferences
   */
  public updatePreferences(preferences: Partial<UserPreferences>): void {
    if (this.currentSession === null) {
      return;
    }

    this.currentSession.preferences = {
      ...this.currentSession.preferences,
      ...preferences,
    };

    this.persistSession();
    this.persistPreferences();
  }

  /**
   * Reset session (create new session)
   */
  public resetSession(): void {
    this.clearSessionStorage();
    this.createNewSession();

    // Dispatch session reset event
    window.dispatchEvent(
      new CustomEvent('sessionReset', {
        detail: { sessionId: this.currentSession?.sessionId },
      })
    );
  }

  /**
   * Check if conversation belongs to current session
   */
  public validateConversationAccess(conversationSessionId: string): boolean {
    return this.currentSession?.sessionId === conversationSessionId;
  }

  /**
   * Generate conversation ID with session isolation
   */
  public generateConversationId(): string {
    if (this.currentSession === null) {
      throw new Error('No active session');
    }

    const timestamp = Date.now();
    const random = crypto.getRandomValues(new Uint8Array(8));
    const randomHex = Array.from(random, (byte) =>
      byte.toString(16).padStart(2, '0')
    ).join('');

    return `conv_${this.currentSession.sessionId}_${timestamp}_${randomHex}`;
  }

  /**
   * Get session isolation prefix for storage keys
   */
  public getSessionStoragePrefix(): string {
    if (this.currentSession === null) {
      throw new Error('No active session');
    }

    return `session_${this.currentSession.sessionId}`;
  }

  /**
   * Cleanup resources
   */
  public destroy(): void {
    if (this.validationTimer !== null) {
      clearInterval(this.validationTimer);
      this.validationTimer = null;
    }

    SessionManager.instance = null;
  }
}

/**
 * Get the global session manager instance
 */
export function getSessionManager(): SessionManager {
  return SessionManager.getInstance();
}

/**
 * Session management hooks and utilities
 */
export const sessionUtils = {
  /**
   * Check if session storage is available
   */
  isSessionStorageAvailable(): boolean {
    try {
      const test = '__session_storage_test__';
      sessionStorage.setItem(test, test);
      sessionStorage.removeItem(test);
      return true;
    } catch {
      return false;
    }
  },

  /**
   * Check if local storage is available
   */
  isLocalStorageAvailable(): boolean {
    try {
      const test = '__local_storage_test__';
      localStorage.setItem(test, test);
      localStorage.removeItem(test);
      return true;
    } catch {
      return false;
    }
  },

  /**
   * Get session storage usage
   */
  getSessionStorageUsage(): { used: number; quota: number } {
    try {
      let used = 0;
      for (let i = 0; i < sessionStorage.length; i++) {
        const key = sessionStorage.key(i);
        if (key !== null) {
          const value = sessionStorage.getItem(key);
          used += key.length + (value?.length ?? 0);
        }
      }

      // SessionStorage quota is typically 5-10MB, estimate 5MB
      const quota = 5 * 1024 * 1024;

      return { used, quota };
    } catch {
      return { used: 0, quota: 0 };
    }
  },

  /**
   * Clear all session-related storage
   */
  clearAllSessionData(): void {
    try {
      // Clear session storage
      sessionStorage.clear();

      // Clear session-related localStorage items
      const keysToRemove: string[] = [];
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (
          key &&
          (key.startsWith('claude-proxy-') || key.startsWith('session_'))
        ) {
          keysToRemove.push(key);
        }
      }

      keysToRemove.forEach((key) => localStorage.removeItem(key));
    } catch (_error) {
      if (import.meta.env.DEV) {
        // console.error('Failed to clear session data:', error);
      }
    }
  },
};
