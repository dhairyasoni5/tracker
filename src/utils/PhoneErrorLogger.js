// PhoneErrorLogger.js - Captures and displays errors on phone for easy debugging

import { Alert } from 'react-native';

class PhoneErrorLogger {
  constructor() {
    this.errors = [];
    this.maxErrors = 20; // Keep last 20 errors
    this.isEnabled = __DEV__; // Only in development
    
    if (this.isEnabled) {
      this.setupGlobalErrorHandler();
    }
  }

  setupGlobalErrorHandler() {
    // Capture unhandled promise rejections
    if (global.HermesInternal?.hasPromise) {
      global.addEventListener?.('unhandledrejection', (event) => {
        this.captureError({
          type: 'Unhandled Promise Rejection',
          error: event.reason,
          timestamp: new Date().toLocaleTimeString()
        });
      });
    }

    // Override console.error to capture errors
    const originalConsoleError = console.error;
    console.error = (...args) => {
      this.captureError({
        type: 'Console Error',
        error: args.join(' '),
        timestamp: new Date().toLocaleTimeString()
      });
      originalConsoleError.apply(console, args);
    };
  }

  captureError(errorInfo) {
    if (!this.isEnabled) return;

    const errorEntry = {
      id: Date.now() + Math.random(),
      ...errorInfo,
      summary: this.createErrorSummary(errorInfo.error)
    };

    this.errors.unshift(errorEntry);
    
    // Keep only recent errors
    if (this.errors.length > this.maxErrors) {
      this.errors = this.errors.slice(0, this.maxErrors);
    }

    // Log to console for our filter
    console.log(`📱 PHONE ERROR [${errorInfo.type}]:`, errorEntry.summary);
  }

  createErrorSummary(error) {
    if (typeof error === 'string') {
      return error.substring(0, 100);
    }
    
    if (error?.message) {
      return `${error.name || 'Error'}: ${error.message.substring(0, 100)}`;
    }
    
    return JSON.stringify(error).substring(0, 100);
  }

  logCustomError(message, context = {}) {
    this.captureError({
      type: 'Custom Error',
      error: message,
      context,
      timestamp: new Date().toLocaleTimeString()
    });
  }

  logAuthError(action, error) {
    this.captureError({
      type: 'Auth Error',
      error: `${action}: ${error.message || error}`,
      timestamp: new Date().toLocaleTimeString()
    });
  }

  logFirebaseError(action, error) {
    this.captureError({
      type: 'Firebase Error',
      error: `${action}: ${error.message || error}`,
      code: error.code,
      timestamp: new Date().toLocaleTimeString()
    });
  }

  logNavigationError(action, error) {
    this.captureError({
      type: 'Navigation Error',
      error: `${action}: ${error.message || error}`,
      timestamp: new Date().toLocaleTimeString()
    });
  }

  getErrorSummary() {
    if (this.errors.length === 0) {
      return 'No errors captured';
    }

    const summary = {
      total: this.errors.length,
      byType: {},
      recent: this.errors.slice(0, 5).map(e => ({
        type: e.type,
        summary: e.summary,
        time: e.timestamp
      }))
    };

    // Count by type
    this.errors.forEach(error => {
      summary.byType[error.type] = (summary.byType[error.type] || 0) + 1;
    });

    return summary;
  }

  showErrorDialog() {
    if (!this.isEnabled || this.errors.length === 0) {
      Alert.alert('Debug Info', 'No errors captured');
      return;
    }

    const summary = this.getErrorSummary();
    const recentErrors = summary.recent
      .map((e, i) => `${i + 1}. [${e.type}] ${e.summary}`)
      .join('\n\n');

    const message = `Errors Found: ${summary.total}\n\nTypes:\n${Object.entries(summary.byType)
      .map(([type, count]) => `• ${type}: ${count}`)
      .join('\n')}\n\nRecent Errors:\n${recentErrors}`;

    Alert.alert('Debug - Error Summary', message, [
      { text: 'OK' },
      { 
        text: 'Clear Errors', 
        onPress: () => {
          this.errors = [];
          Alert.alert('Cleared', 'Error log cleared');
        }
      }
    ]);
  }

  // Helper method to create shareable error report
  getShareableReport() {
    const summary = this.getErrorSummary();
    
    if (typeof summary === 'string') return summary;

    const report = [
      '=== PHONE ERROR REPORT ===',
      `Total Errors: ${summary.total}`,
      '',
      'Error Types:',
      ...Object.entries(summary.byType).map(([type, count]) => `• ${type}: ${count}`),
      '',
      'Recent Errors:',
      ...summary.recent.map((e, i) => `${i + 1}. [${e.time}] ${e.type}: ${e.summary}`),
      '',
      `Generated: ${new Date().toLocaleString()}`
    ].join('\n');

    return report;
  }
}

// Create singleton instance
const phoneErrorLogger = new PhoneErrorLogger();

export default phoneErrorLogger; 