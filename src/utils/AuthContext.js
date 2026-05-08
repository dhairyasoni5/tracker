import React, { createContext, useContext, useEffect, useState } from 'react';
import { onAuthStateChanged, signOut } from 'firebase/auth';
import { doc, getDoc } from 'firebase/firestore';
import { auth, db } from '../firebase/firebaseConfig';
import ErrorHandler, { ERROR_SEVERITY } from './ErrorHandler';
import AsyncStorage from '@react-native-async-storage/async-storage';

const AuthContext = createContext({});

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [userData, setUserData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [retryCount, setRetryCount] = useState(0);
  const [lastRetryTime, setLastRetryTime] = useState(null);

  const MAX_RETRIES = 3;
  const RETRY_DELAY = 2000; // 2 seconds

  // Force clear all auth state and storage
  const forceCleanStart = async () => {
    try {
      console.log('🧹 Force clearing all auth state and storage...');
      
      // Clear AsyncStorage
      await AsyncStorage.multiRemove([
        'firebase:authUser:[API_KEY]:[DEFAULT]',
        'firebase:authToken:[API_KEY]:[DEFAULT]',
        'firebase:persistenceKey:[DEFAULT]'
      ]);
      
      // Clear any remaining Firebase keys
      const keys = await AsyncStorage.getAllKeys();
      const firebaseKeys = keys.filter(key => key.includes('firebase') || key.includes('auth'));
      if (firebaseKeys.length > 0) {
        await AsyncStorage.multiRemove(firebaseKeys);
      }
      
      // Clear web localStorage if on web
      if (typeof window !== 'undefined' && window.localStorage) {
        const localStorageKeys = Object.keys(window.localStorage);
        localStorageKeys.forEach(key => {
          if (key.includes('firebase') || key.includes('auth')) {
            window.localStorage.removeItem(key);
          }
        });
      }
      
      // Sign out from Firebase
      if (auth.currentUser) {
        await signOut(auth);
      }
      
      // Reset local state
      setUser(null);
      setUserData(null);
      setError(null);
      setRetryCount(0);
      setLastRetryTime(null);
      
      console.log('✅ All auth state cleared successfully');
    } catch (error) {
      console.error('❌ Error clearing auth state:', error);
      ErrorHandler.logError(error, { action: 'forceCleanStart' }, ERROR_SEVERITY.MEDIUM);
    }
  };

  // Clear all auth state
  const clearAuthState = async () => {
    try {
      console.log('🚪 Clearing auth state...');
      await signOut(auth);
      setUser(null);
      setUserData(null);
      setError(null);
      setRetryCount(0);
      setLastRetryTime(null);
      console.log('✅ Auth state cleared');
    } catch (error) {
      ErrorHandler.logError(error, { action: 'clearAuthState' }, ERROR_SEVERITY.MEDIUM);
      console.error('Error clearing auth state:', error);
    }
  };

  // Retry mechanism for failed operations
  const retryOperation = async (operation, context = {}) => {
    if (retryCount >= MAX_RETRIES) {
      ErrorHandler.logError(
        new Error('Max retries exceeded'), 
        { ...context, retryCount }, 
        ERROR_SEVERITY.HIGH
      );
      return null;
    }

    const now = Date.now();
    if (lastRetryTime && (now - lastRetryTime) < RETRY_DELAY) {
      return null; // Too soon for retry
    }

    setRetryCount(prev => prev + 1);
    setLastRetryTime(now);

    try {
      return await operation();
    } catch (error) {
      ErrorHandler.logError(error, { ...context, retryAttempt: retryCount + 1 });
      throw error;
    }
  };

  // Fetch user data with error handling and retry
  const fetchUserData = async (firebaseUser) => {
    const operation = async () => {
      const userDoc = await getDoc(doc(db, 'users', firebaseUser.uid));
      
      if (!userDoc.exists()) {
        throw new Error('User data not found in Firestore');
      }

      return userDoc.data();
    };

    try {
      const userData = await retryOperation(operation, { 
        action: 'fetchUserData', 
        userId: firebaseUser.uid 
      });

      if (userData) {
        // Reset retry count on success
        setRetryCount(0);
        setLastRetryTime(null);
        setError(null);
        return userData;
      }
      
      return null;
    } catch (error) {
      ErrorHandler.logError(error, { 
        action: 'fetchUserData', 
        userId: firebaseUser.uid,
        retryCount 
      }, ERROR_SEVERITY.HIGH);
      
      setError(error);
      throw error;
    }
  };

  // Enhanced auth state change handler
  useEffect(() => {
    let unsubscribe;

    const initializeAuth = async () => {
      console.log('🚀 Initializing auth...');
      
      const handleAuthStateChange = async (firebaseUser) => {
        console.log('🔐 Auth state changed:', firebaseUser ? 'User logged in' : 'User logged out');
        
        try {
          if (firebaseUser) {
            console.log('👤 Fetching user data for:', firebaseUser.uid);
            
            // Fetch user data with error handling
            const userDataFromFirestore = await fetchUserData(firebaseUser);
            
            if (userDataFromFirestore) {
              console.log('✅ User data found:', userDataFromFirestore.role);
              
              // Validate user data
              if (!userDataFromFirestore.role) {
                throw new Error('User role not defined');
              }

              if (userDataFromFirestore.isActive === false) {
                throw new Error('User account is inactive');
              }

              setUser(firebaseUser);
              setUserData({
                ...userDataFromFirestore,
                uid: firebaseUser.uid
              });
              setError(null);
              console.log('🎉 Auth setup complete for:', userDataFromFirestore.role);
            } else {
              // If user data fetch failed, sign out
              console.log('❌ Failed to fetch user data, signing out');
              await signOut(auth);
              setUser(null);
              setUserData(null);
            }
          } else {
            // User is signed out
            console.log('👋 No user authenticated');
            setUser(null);
            setUserData(null);
            setError(null);
            setRetryCount(0);
          }
        } catch (error) {
          console.error('❌ Error in auth state change:', error);
          
          // Handle specific Firebase errors
          if (error.code === 'auth/already-initialized') {
            console.warn('⚠️ Firebase already initialized, ignoring error');
            return; // Don't treat this as a fatal error
          }
          
          ErrorHandler.logError(error, { 
            action: 'authStateChange',
            hasUser: !!firebaseUser,
            userId: firebaseUser?.uid 
          }, ERROR_SEVERITY.HIGH);

          // Handle specific error cases
          if (error.message === 'User account is inactive') {
            ErrorHandler.showErrorAlert(
              error, 
              'Account Disabled',
              { action: 'authStateChange' }
            );
          } else if (error.message === 'User data not found in Firestore') {
            ErrorHandler.showErrorAlert(
              error, 
              'Account Setup Required',
              { action: 'authStateChange' }
            );
          }

          // Sign out on error (except for already-initialized)
          if (error.code !== 'auth/already-initialized') {
            try {
              await signOut(auth);
            } catch (signOutError) {
              console.error('Failed to sign out on error:', signOutError);
              ErrorHandler.logError(signOutError, { action: 'signOutOnError' });
            }

            setUser(null);
            setUserData(null);
            setError(error);
          }
        } finally {
          console.log('🔄 Setting loading to false');
          setLoading(false);
        }
      };

      try {
        console.log('🚀 Setting up auth listener...');
        unsubscribe = onAuthStateChanged(auth, handleAuthStateChange);
      } catch (error) {
        console.error('❌ Error setting up auth listener:', error);
        ErrorHandler.logError(error, { action: 'setupAuthListener' }, ERROR_SEVERITY.CRITICAL);
        setLoading(false);
        setError(error);
      }
    };

    initializeAuth();

    // Cleanup subscription on unmount
    return () => {
      if (unsubscribe) {
        console.log('🧹 Cleaning up auth listener');
        unsubscribe();
      }
    };
  }, []);

  // Retry failed authentication operations
  const retryAuth = async () => {
    if (loading || !error) return;

    setLoading(true);
    setError(null);

    try {
      // Force re-evaluation of auth state
      const currentUser = auth.currentUser;
      if (currentUser) {
        await fetchUserData(currentUser);
      }
    } catch (error) {
      ErrorHandler.logError(error, { action: 'retryAuth' });
      setError(error);
    } finally {
      setLoading(false);
    }
  };

  const value = {
    user,
    userData,
    loading,
    error,
    retryCount,
    isAuthenticated: !!user && !!userData,
    isAdmin: userData?.role === 'admin',
    isSupervisor: userData?.role === 'supervisor',
    isUser: userData?.role === 'user',
    clearAuthState,
    forceCleanStart,
    retryAuth,
    
    // Helper function to get role hierarchy level
    getRoleLevel: () => {
      if (userData?.role === 'admin') return 3;
      if (userData?.role === 'supervisor') return 2;
      if (userData?.role === 'user') return 1;
      return 0;
    },
    
    // Helper function to check if user has permission level
    hasPermission: (requiredLevel) => {
      const userLevel = userData?.role === 'admin' ? 3 : 
                      userData?.role === 'supervisor' ? 2 :
                      userData?.role === 'user' ? 1 : 0;
      return userLevel >= requiredLevel;
    },

    // Enhanced helper methods
    canRetry: () => retryCount < MAX_RETRIES && !!error,
    getAuthStatus: () => ({
      isAuthenticated: !!user && !!userData,
      hasError: !!error,
      isLoading: loading,
      canRetry: retryCount < MAX_RETRIES && !!error,
      retryCount
    })
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
};

export default AuthContext; 