import React, { useEffect } from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createStackNavigator } from '@react-navigation/stack';
import { View, ActivityIndicator, StyleSheet, Text, TouchableOpacity } from 'react-native';
import { AuthProvider, useAuth } from '../utils/AuthContext';
import ErrorBoundary from '../components/ErrorBoundary';
import ErrorHandler from '../utils/ErrorHandler';

// Import screens
import LoginScreen from '../screens/LoginScreen';
import RegisterScreen from '../screens/RegisterScreen';
import AdminDashboard from '../screens/AdminDashboard';
import SupervisorDashboard from '../screens/SupervisorDashboard';
import UserTracker from '../screens/UserTracker';

// Import new visit screens
import CreateVisitScreen from '../screens/CreateVisitScreen';
import VisitListScreen from '../screens/VisitListScreen';
import VisitDetailScreen from '../screens/VisitDetailScreen';

const Stack = createStackNavigator();

// Enhanced loading component with error handling
const LoadingScreen = ({ error, retryAuth, canRetry }) => (
  <View style={styles.loadingContainer}>
    {error ? (
      <View style={styles.errorContainer}>
        <Text style={styles.errorEmoji}>⚠️</Text>
        <Text style={styles.errorTitle}>Connection Issue</Text>
        <Text style={styles.errorMessage}>
          {ErrorHandler.getUserFriendlyMessage(error)}
        </Text>
        {canRetry && (
          <TouchableOpacity style={styles.retryButton} onPress={retryAuth}>
            <Text style={styles.retryButtonText}>Retry</Text>
          </TouchableOpacity>
        )}
      </View>
    ) : (
      <>
        <ActivityIndicator size="large" color="#3498db" />
        <Text style={styles.loadingText}>Loading...</Text>
      </>
    )}
  </View>
);

// Navigation component that uses AuthContext
const AppNavigation = () => {
  const { 
    user, 
    userData, 
    loading, 
    error,
    isAuthenticated, 
    isAdmin, 
    isSupervisor,
    clearAuthState,
    forceCleanStart,
    retryAuth,
    canRetry,
    getAuthStatus
  } = useAuth();

  useEffect(() => {
    const authStatus = getAuthStatus();
    
    // Only log in development and for important state changes
    if (__DEV__ && (error || (!loading && !isAuthenticated && !user))) {
      console.log('AppNavigation state:', authStatus);
    }
  }, [loading, isAuthenticated, userData, user, error]);

  if (loading || error) {
    return (
      <LoadingScreen 
        error={error}
        retryAuth={retryAuth}
        canRetry={canRetry}
      />
    );
  }

  const getDashboardComponent = () => {
    if (isAdmin) {
      return AdminDashboard;
    } else if (isSupervisor) {
      return SupervisorDashboard;
    } else {
      return UserTracker;
    }
  };

  const getDashboardName = () => {
    if (isAdmin) {
      return 'AdminDashboard';
    } else if (isSupervisor) {
      return 'SupervisorDashboard';
    } else {
      return 'UserTracker';
    }
  };

  const getDashboardTitle = () => {
    if (isAdmin) {
      return 'Admin Dashboard';
    } else if (isSupervisor) {
      return 'Supervisor Dashboard';
    } else {
      return 'User Tracker';
    }
  };

  // Debug component to show current state
  const DebugInfo = () => (
    <View style={styles.debugContainer}>
      <Text style={styles.debugText}>
        Auth: {isAuthenticated ? 'Yes' : 'No'} | 
        Role: {userData?.role || 'None'} | 
        User: {user?.email || 'None'}
        {error && ` | Error: ${error.message}`}
      </Text>
      <View style={styles.debugButtons}>
        <TouchableOpacity style={styles.clearButton} onPress={clearAuthState}>
          <Text style={styles.clearButtonText}>Clear Auth</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.clearButton, styles.forceCleanButton]} onPress={forceCleanStart}>
          <Text style={styles.clearButtonText}>Force Clean Start</Text>
        </TouchableOpacity>
      </View>
    </View>
  );

  return (
    <NavigationContainer
      onError={(error) => {
        ErrorHandler.logError(error, { component: 'NavigationContainer' });
      }}
    >
      <Stack.Navigator
        screenOptions={{
          headerShown: true,
          headerStyle: {
            backgroundColor: '#3498db',
          },
          headerTintColor: '#fff',
          headerTitleStyle: {
            fontWeight: 'bold',
          },
        }}
      >
        {isAuthenticated && userData ? (
          // User is authenticated and has valid data
          <>
            <Stack.Screen 
              name={getDashboardName()} 
              component={getDashboardComponent()}
              options={{
                title: getDashboardTitle(),
                headerShown: false, // Dashboard handles its own header
              }}
            />
            <Stack.Screen 
              name="VisitList" 
              component={VisitListScreen}
              options={{
                title: 'Visits',
              }}
            />
            <Stack.Screen 
              name="CreateVisit" 
              component={CreateVisitScreen}
              options={{
                title: 'Create Visit',
              }}
            />
            <Stack.Screen 
              name="VisitDetail" 
              component={VisitDetailScreen}
              options={{
                title: 'Visit Details',
              }}
            />
          </>
        ) : (
          // User is not authenticated
          <>
            <Stack.Screen 
              name="Login" 
              component={LoginScreen}
              options={{
                headerShown: false,
              }}
            />
            <Stack.Screen 
              name="Register" 
              component={RegisterScreen}
              options={{
                headerShown: false,
              }}
            />
          </>
        )}
      </Stack.Navigator>
    </NavigationContainer>
  );
};

// Error boundary wrapped navigation
const ErrorBoundaryWrappedNavigation = () => (
  <ErrorBoundary componentName="AppNavigation">
    <AppNavigation />
  </ErrorBoundary>
);

// Main AppNavigator that wraps everything with AuthProvider and ErrorBoundary
const AppNavigator = () => {
  return (
    <ErrorBoundary componentName="AppNavigator">
      <AuthProvider>
        <ErrorBoundaryWrappedNavigation />
      </AuthProvider>
    </ErrorBoundary>
  );
};

const styles = StyleSheet.create({
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#f8f9fa',
    padding: 20,
  },
  loadingText: {
    marginTop: 10,
    fontSize: 16,
    color: '#7f8c8d',
  },
  errorContainer: {
    alignItems: 'center',
    padding: 20,
  },
  errorEmoji: {
    fontSize: 48,
    marginBottom: 16,
  },
  errorTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#e74c3c',
    marginBottom: 8,
    textAlign: 'center',
  },
  errorMessage: {
    fontSize: 14,
    color: '#7f8c8d',
    textAlign: 'center',
    marginBottom: 20,
  },
  retryButton: {
    backgroundColor: '#3498db',
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 6,
  },
  retryButtonText: {
    color: '#fff',
    fontWeight: '600',
  },
  debugContainer: {
    backgroundColor: '#34495e',
    padding: 10,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  debugText: {
    color: '#ecf0f1',
    fontSize: 12,
    flex: 1,
  },
  clearButton: {
    backgroundColor: '#e74c3c',
    padding: 5,
    borderRadius: 4,
  },
  clearButtonText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: 'bold',
  },
  debugButtons: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  forceCleanButton: {
    backgroundColor: '#2ecc71',
    padding: 5,
    borderRadius: 4,
    marginLeft: 5,
  },
});

export default AppNavigator; 