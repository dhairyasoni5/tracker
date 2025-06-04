// ErrorCapture.js - Captures Expo Go red screen errors and makes them copyable
import { Alert, Platform } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import * as Sharing from 'expo-sharing';
import * as FileSystem from 'expo-file-system';

const isWeb = Platform.OS === 'web';

class ErrorCapture {
  constructor() {
    this.errors = [];
    this.isEnabled = __DEV__ && isWeb; // Only enable on web
    
    // Only setup error boundary if we're on web
    if (this.isEnabled) {
      this.setupErrorBoundary();
    }
  }

  setupErrorBoundary() {
    if (!this.isEnabled || !isWeb) return; // Double check - only run on web

    console.log('Setting up ErrorCapture for web environment');

    // Web-only error handling
    if (typeof window !== 'undefined') {
      // Web environment - use window object
      window.addEventListener('unhandledrejection', (event) => {
        this.capturePromiseRejection(event.reason);
      });
      
      // Also capture standard JS errors on web
      window.addEventListener('error', (event) => {
        this.captureWebError(event.error);
      });
    }

    // Override console.error to catch logged errors (web only)
    const originalConsoleError = console.error;
    console.error = (...args) => {
      this.captureConsoleError(args);
      originalConsoleError.apply(console, args);
    };
  }

  captureRedScreenError(error, isFatal) {
    if (!this.isEnabled) return; // Do nothing on React Native
    
    const errorData = {
      id: Date.now(),
      type: 'RED_SCREEN',
      isFatal,
      name: error.name || 'Error',
      message: error.message || 'Unknown error',
      stack: error.stack || 'No stack trace',
      timestamp: new Date().toLocaleString(),
      copyableText: this.formatErrorForCopy(error, 'Red Screen Error', isFatal)
    };

    this.errors.unshift(errorData);
    this.trimErrors();

    // Show immediate alert with copy option
    setTimeout(() => {
      this.showQuickCopyAlert(errorData);
    }, 1000);
  }

  capturePromiseRejection(error) {
    if (!this.isEnabled) return; // Do nothing on React Native
    
    const errorData = {
      id: Date.now(),
      timestamp: new Date().toISOString(),
      type: 'PROMISE_REJECTION',
      isFatal: false,
      name: 'Promise Rejection',
      message: error?.message || String(error),
      stack: error?.stack || 'No stack trace available',
      copyableText: this.formatErrorForCopy(error, 'Promise Rejection', false)
    };
    
    this.errors.unshift(errorData);
    this.trimErrors();
    this.showQuickCopyAlert(errorData);
  }

  captureConsoleError(args) {
    if (!this.isEnabled) return; // Do nothing on React Native
    
    const message = args.join(' ');
    const errorData = {
      id: Date.now(),
      type: 'CONSOLE_ERROR',
      isFatal: false,
      name: 'Console Error',
      message: message,
      stack: 'No stack trace',
      timestamp: new Date().toLocaleString(),
      copyableText: this.formatErrorForCopy({ message }, 'Console Error', false)
    };

    this.errors.unshift(errorData);
    this.trimErrors();
  }

  formatErrorForCopy(error, errorType, isFatal) {
    if (!this.isEnabled) return ''; // Do nothing on React Native
    
    const lines = [
      `=== ${errorType.toUpperCase()} ===`,
      `Time: ${new Date().toLocaleString()}`,
      `Fatal: ${isFatal ? 'YES' : 'NO'}`,
      ``,
      `Error: ${error?.name || 'Unknown'}`,
      `Message: ${error?.message || 'No message'}`,
      ``,
      `Stack Trace:`,
      error?.stack || 'No stack trace available',
      ``,
      `--- END ERROR ---`
    ];
    return lines.join('\n');
  }

  showQuickCopyAlert(errorData) {
    if (!this.isEnabled) return; // Do nothing on React Native
    
    Alert.alert(
      '🚨 Error Captured',
      `${errorData.name}: ${errorData.message.substring(0, 100)}...`,
      [
        { text: 'Dismiss', style: 'cancel' },
        { 
          text: 'Copy Error', 
          onPress: () => this.copyErrorToClipboard(errorData)
        },
        { 
          text: 'Share Error', 
          onPress: () => this.shareError(errorData)
        }
      ]
    );
  }

  async copyErrorToClipboard(errorData) {
    if (!this.isEnabled) return; // Do nothing on React Native
    
    try {
      await Clipboard.setStringAsync(errorData.copyableText);
      Alert.alert('✅ Copied!', 'Error details copied to clipboard');
    } catch (error) {
      Alert.alert('❌ Copy Failed', 'Could not copy to clipboard');
    }
  }

  async shareError(errorData) {
    if (!this.isEnabled) return; // Do nothing on React Native
    
    try {
      // On web, sharing is not available, so fallback to clipboard
      if (isWeb) {
        await this.copyErrorToClipboard(errorData);
        Alert.alert('📋 Copied to Clipboard', 'Error details have been copied since sharing is not available on web.');
        return;
      }
      
      if (await Sharing.isAvailableAsync()) {
        const fileName = `error_${Date.now()}.txt`;
        const fileUri = `${FileSystem.documentDirectory}${fileName}`;
        
        await FileSystem.writeAsStringAsync(fileUri, errorData.copyableText);
        await Sharing.shareAsync(fileUri, {
          mimeType: 'text/plain',
          dialogTitle: 'Share Error Report'
        });
      } else {
        // Fallback to clipboard
        await this.copyErrorToClipboard(errorData);
      }
    } catch (error) {
      Alert.alert('❌ Share Failed', 'Could not share error. Copying to clipboard instead.');
      await this.copyErrorToClipboard(errorData);
    }
  }

  showErrorHistory() {
    if (!this.isEnabled) return; // Do nothing on React Native
    
    if (this.errors.length === 0) {
      Alert.alert('📱 Error History', 'No errors captured yet');
      return;
    }

    const errorList = this.errors.slice(0, 10).map((error, i) => 
      `${i + 1}. [${error.type}] ${error.name}: ${error.message.substring(0, 50)}...`
    ).join('\n\n');

    Alert.alert(
      '📱 Error History',
      `Found ${this.errors.length} errors:\n\n${errorList}`,
      [
        { text: 'Close' },
        { 
          text: 'Copy All', 
          onPress: () => this.copyAllErrors()
        },
        { 
          text: 'Clear History', 
          onPress: () => this.clearErrors()
        }
      ]
    );
  }

  async copyAllErrors() {
    if (!this.isEnabled) return; // Do nothing on React Native
    
    const allErrors = this.errors.map(error => error.copyableText).join('\n\n' + '='.repeat(50) + '\n\n');
    
    try {
      await Clipboard.setStringAsync(allErrors);
      Alert.alert('✅ All Copied!', `${this.errors.length} errors copied to clipboard`);
    } catch (error) {
      Alert.alert('❌ Copy Failed', 'Could not copy all errors');
    }
  }

  clearErrors() {
    if (!this.isEnabled) return; // Do nothing on React Native
    
    this.errors = [];
    Alert.alert('🗑️ Cleared', 'Error history cleared');
  }

  trimErrors() {
    if (!this.isEnabled) return; // Do nothing on React Native
    
    if (this.errors.length > 50) {
      this.errors = this.errors.slice(0, 50);
    }
  }

  // Quick access method for buttons
  showQuickActions() {
    if (!this.isEnabled) return; // Do nothing on React Native
    
    const recentError = this.errors[0];
    
    if (!recentError) {
      Alert.alert('📱 Debug Info', 'No errors to show');
      return;
    }

    Alert.alert(
      '🔧 Error Debug',
      `Recent: ${recentError.name}\nTotal Errors: ${this.errors.length}`,
      [
        { text: 'Show History', onPress: () => this.showErrorHistory() },
        { text: 'Copy Recent', onPress: () => this.copyErrorToClipboard(recentError) },
        { text: 'Close' }
      ]
    );
  }

  captureWebError(error) {
    if (!this.isEnabled) return; // Do nothing on React Native
    
    const errorData = {
      id: Date.now(),
      timestamp: new Date().toISOString(),
      type: 'JAVASCRIPT_ERROR',
      isFatal: false,
      name: 'JavaScript Error',
      message: error?.message || String(error),
      stack: error?.stack || 'No stack trace available',
      copyableText: this.formatErrorForCopy(error, 'JavaScript Error', false)
    };
    
    this.errors.unshift(errorData);
    this.trimErrors();
    this.showQuickCopyAlert(errorData);
  }
}

// Create singleton - will be completely inactive on React Native
const errorCapture = new ErrorCapture();

export default errorCapture; 