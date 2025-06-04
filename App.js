import React from 'react';
import { Platform } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import AppNavigator from './src/navigation/AppNavigator';
import ErrorBoundary from './src/components/ErrorBoundary';

export default function App() {
  // Disable error capture to prevent ERR_BLOCKED_BY_CLIENT errors
  React.useEffect(() => {
    console.log('🚀 App starting - Error capture disabled to prevent network blocking');
  }, []);

  return (
    <SafeAreaProvider>
      <ErrorBoundary>
        <AppNavigator />
      </ErrorBoundary>
      <StatusBar style="auto" />
    </SafeAreaProvider>
  );
} 