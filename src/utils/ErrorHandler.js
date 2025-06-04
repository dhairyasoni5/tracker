import { Alert } from 'react-native';

// Error types for categorization
export const ERROR_TYPES = {
  NETWORK: 'NETWORK',
  AUTH: 'AUTH',
  FIREBASE: 'FIREBASE',
  VALIDATION: 'VALIDATION',
  PERMISSION: 'PERMISSION',
  UNKNOWN: 'UNKNOWN'
};

// Error severity levels
export const ERROR_SEVERITY = {
  LOW: 'LOW',
  MEDIUM: 'MEDIUM',
  HIGH: 'HIGH',
  CRITICAL: 'CRITICAL'
};

// Firebase error code mapping
export const FIREBASE_ERROR_MESSAGES = {
  // Auth errors
  'auth/user-not-found': 'No account found with this email address.',
  'auth/wrong-password': 'Incorrect password. Please try again.',
  'auth/invalid-email': 'Please enter a valid email address.',
  'auth/user-disabled': 'This account has been disabled. Contact support.',
  'auth/email-already-in-use': 'An account with this email already exists.',
  'auth/weak-password': 'Password must be at least 6 characters long.',
  'auth/operation-not-allowed': 'This operation is not allowed.',
  'auth/too-many-requests': 'Too many failed attempts. Please try again later.',
  'auth/network-request-failed': 'Network error. Please check your connection.',
  'auth/invalid-credential': 'Invalid login credentials.',
  
  // Firestore errors
  'firestore/permission-denied': 'You don\'t have permission to perform this action.',
  'firestore/not-found': 'The requested data was not found.',
  'firestore/already-exists': 'This data already exists.',
  'firestore/resource-exhausted': 'Too many requests. Please try again later.',
  'firestore/failed-precondition': 'Operation failed due to invalid conditions.',
  'firestore/aborted': 'Operation was aborted. Please try again.',
  'firestore/out-of-range': 'Invalid data range provided.',
  'firestore/unimplemented': 'This feature is not yet implemented.',
  'firestore/internal': 'Internal server error. Please try again.',
  'firestore/unavailable': 'Service temporarily unavailable. Please try again.',
  'firestore/data-loss': 'Data loss detected. Please contact support.',
  'firestore/unauthenticated': 'Please login to continue.',
  'firestore/deadline-exceeded': 'Request timeout. Please try again.',
  'firestore/cancelled': 'Operation was cancelled.',
  'firestore/invalid-argument': 'Invalid data provided.',
};

// Network error messages
export const NETWORK_ERROR_MESSAGES = {
  'Network Error': 'No internet connection. Please check your network.',
  'timeout': 'Request timeout. Please try again.',
  'ENOTFOUND': 'Server not found. Please check your connection.',
  'ECONNREFUSED': 'Connection refused. Please try again later.',
  'ETIMEDOUT': 'Connection timeout. Please try again.',
};

class ErrorHandler {
  static logs = [];
  static maxLogs = 100;

  // Log error with metadata
  static logError(error, context = {}, severity = ERROR_SEVERITY.MEDIUM) {
    const logEntry = {
      timestamp: new Date().toISOString(),
      error: {
        message: error.message,
        stack: error.stack,
        code: error.code,
        name: error.name
      },
      context,
      severity,
      type: this.categorizeError(error)
    };

    // Add to logs array
    this.logs.unshift(logEntry);
    
    // Keep only recent logs
    if (this.logs.length > this.maxLogs) {
      this.logs = this.logs.slice(0, this.maxLogs);
    }

    // Console log for development
    if (__DEV__) {
      console.group(`🚨 Error [${severity}]`);
      console.error('Message:', error.message);
      console.error('Code:', error.code);
      console.error('Context:', context);
      console.error('Stack:', error.stack);
      console.groupEnd();
    }

    return logEntry;
  }

  // Categorize error type
  static categorizeError(error) {
    if (error.code?.startsWith('auth/')) return ERROR_TYPES.AUTH;
    if (error.code?.startsWith('firestore/') || error.code?.startsWith('firebase/')) return ERROR_TYPES.FIREBASE;
    if (error.message?.includes('Network') || error.message?.includes('fetch')) return ERROR_TYPES.NETWORK;
    if (error.name === 'ValidationError') return ERROR_TYPES.VALIDATION;
    if (error.message?.includes('permission') || error.message?.includes('unauthorized')) return ERROR_TYPES.PERMISSION;
    return ERROR_TYPES.UNKNOWN;
  }

  // Get user-friendly error message
  static getUserFriendlyMessage(error) {
    // Firebase auth errors
    if (error.code && FIREBASE_ERROR_MESSAGES[error.code]) {
      return FIREBASE_ERROR_MESSAGES[error.code];
    }

    // Network errors
    const networkError = Object.keys(NETWORK_ERROR_MESSAGES).find(key => 
      error.message?.includes(key)
    );
    if (networkError) {
      return NETWORK_ERROR_MESSAGES[networkError];
    }

    // Generic messages based on error type
    const errorType = this.categorizeError(error);
    switch (errorType) {
      case ERROR_TYPES.NETWORK:
        return 'Network connection error. Please check your internet connection.';
      case ERROR_TYPES.AUTH:
        return 'Authentication error. Please try logging in again.';
      case ERROR_TYPES.FIREBASE:
        return 'Server error. Please try again in a moment.';
      case ERROR_TYPES.VALIDATION:
        return 'Please check your input and try again.';
      case ERROR_TYPES.PERMISSION:
        return 'You don\'t have permission to perform this action.';
      default:
        return 'Something went wrong. Please try again.';
    }
  }

  // Show error alert to user
  static showErrorAlert(error, title = 'Error', context = {}) {
    const logEntry = this.logError(error, context);
    const userMessage = this.getUserFriendlyMessage(error);
    
    Alert.alert(
      title,
      userMessage,
      [
        { text: 'OK', style: 'cancel' },
        ...(logEntry.severity === ERROR_SEVERITY.CRITICAL ? [
          { text: 'Report Issue', onPress: () => this.reportIssue(logEntry) }
        ] : [])
      ]
    );
  }

  // Handle error with retry option
  static showErrorWithRetry(error, retryCallback, title = 'Error', context = {}) {
    this.logError(error, context);
    const userMessage = this.getUserFriendlyMessage(error);
    
    Alert.alert(
      title,
      userMessage,
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Retry', onPress: retryCallback }
      ]
    );
  }

  // Handle async operations with error handling
  static async handleAsyncOperation(operation, context = {}) {
    try {
      return await operation();
    } catch (error) {
      this.logError(error, context);
      throw error; // Re-throw so caller can handle UI
    }
  }

  // Wrap async operation with automatic error display
  static async executeWithErrorHandling(operation, context = {}, showAlert = true) {
    try {
      return await operation();
    } catch (error) {
      if (showAlert) {
        this.showErrorAlert(error, 'Operation Failed', context);
      } else {
        this.logError(error, context);
      }
      throw error;
    }
  }

  // Get error logs for debugging
  static getErrorLogs() {
    return this.logs;
  }

  // Clear error logs
  static clearLogs() {
    this.logs = [];
  }

  // Report issue (placeholder for future implementation)
  static reportIssue(logEntry) {
    // This could send logs to a crash reporting service
    console.log('Reporting issue:', logEntry);
    Alert.alert('Issue Reported', 'Thank you for reporting this issue.');
  }

  // Check network connectivity
  static async checkNetworkConnectivity() {
    try {
      // Simple fetch to check connectivity
      const response = await fetch('https://www.google.com/favicon.ico', {
        method: 'HEAD',
        timeout: 5000
      });
      return response.ok;
    } catch (error) {
      return false;
    }
  }

  // Format error for display
  static formatErrorForDisplay(error) {
    return {
      title: this.categorizeError(error),
      message: this.getUserFriendlyMessage(error),
      code: error.code || 'UNKNOWN',
      timestamp: new Date().toLocaleString()
    };
  }
}

export default ErrorHandler; 