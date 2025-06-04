import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  ActivityIndicator,
  SafeAreaView,
} from 'react-native';
// import { LinearGradient } from 'expo-linear-gradient'; // Temporarily commented out
import { signInWithEmailAndPassword } from 'firebase/auth';
import { doc, getDoc } from 'firebase/firestore';
import { auth, db } from '../firebase/firebaseConfig';
import ErrorHandler, { ERROR_SEVERITY } from '../utils/ErrorHandler';
// import { Colors, Typography, Spacing, BorderRadius, Shadows, CommonStyles } from '../utils/DesignSystem'; // Not needed since we use hardcoded values

// Import vector icons - using Expo's vector icons for better compatibility
try {
  var { MaterialIcons } = require('@expo/vector-icons');
  var Icon = MaterialIcons;
} catch (e) {
  // Fallback component if vector icons aren't available
  var Icon = ({ name, size, color, style }) => (
    <View style={[{ width: size, height: size, backgroundColor: color || '#666', borderRadius: size/2 }, style]} />
  );
}

const LoginScreen = ({ navigation }) => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState('student');
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState({});
  const [retryCount, setRetryCount] = useState(0);

  const MAX_RETRIES = 3;

  // Role options matching v0.dev exactly
  const roleOptions = [
    { value: 'student', label: 'Student', icon: 'group' },
    { value: 'supervisor', label: 'Supervisor/Teacher', icon: 'security' },
    { value: 'admin', label: 'Administrator', icon: 'admin-panel-settings' },
  ];

  // Validation functions (preserved from original)
  const validateEmail = (email) => {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!email) return 'Email is required';
    if (!emailRegex.test(email)) return 'Please enter a valid email address';
    return null;
  };

  const validatePassword = (password) => {
    if (!password) return 'Password is required';
    if (password.length < 6) return 'Password must be at least 6 characters';
    return null;
  };

  // Clear specific field error
  const clearFieldError = (field) => {
    if (errors[field]) {
      setErrors(prev => {
        const newErrors = { ...prev };
        delete newErrors[field];
        return newErrors;
      });
    }
  };

  // Validate all fields
  const validateForm = () => {
    const newErrors = {};
    
    const emailError = validateEmail(email);
    const passwordError = validatePassword(password);
    
    if (emailError) newErrors.email = emailError;
    if (passwordError) newErrors.password = passwordError;
    
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleLogin = async () => {
    // Clear previous errors
    setErrors({});

    // Validate form
    if (!validateForm()) {
      ErrorHandler.logError(
        new Error('Form validation failed'),
        { email: !!email, password: !!password },
        ERROR_SEVERITY.LOW
      );
      return;
    }

    setLoading(true);
    
    const loginOperation = async () => {
      try {
        // Sign in with Firebase Auth
        const userCredential = await signInWithEmailAndPassword(auth, email.trim(), password);
        const user = userCredential.user;

        // Get user role from Firestore
        const userDoc = await getDoc(doc(db, 'users', user.uid));
        
        if (userDoc.exists()) {
          const userData = userDoc.data();
          
          // Check if user is active
          if (!userData.isActive) {
            const error = new Error('Account disabled');
            error.code = 'auth/user-disabled';
            throw error;
          }

          // Navigation will be handled by AppNavigator based on auth state
          console.log('Login successful for:', userData.role);
          
          // Reset retry count on success
          setRetryCount(0);
          
          return { success: true, userData };
        } else {
          const error = new Error('User data not found');
          error.code = 'firestore/not-found';
          throw error;
        }
      } catch (error) {
        ErrorHandler.logError(error, {
          action: 'login',
          email: email.trim(),
          retryAttempt: retryCount + 1
        }, ERROR_SEVERITY.MEDIUM);
        
        throw error;
      }
    };

    try {
      await loginOperation();
    } catch (error) {
      setRetryCount(prev => prev + 1);
      
      // Handle specific error cases
      const errorMessage = ErrorHandler.getUserFriendlyMessage(error);
      
      // Show retry option for network errors
      if (error.code === 'auth/network-request-failed' && retryCount < MAX_RETRIES) {
        ErrorHandler.showErrorWithRetry(
          error,
          () => handleLogin(),
          'Connection Error',
          { action: 'login', retryCount }
        );
      } else if (error.code === 'auth/too-many-requests') {
        Alert.alert(
          'Too Many Attempts',
          'Too many failed login attempts. Please wait a few minutes before trying again.',
          [{ text: 'OK' }]
        );
      } else {
        // Show regular error alert
        Alert.alert('Login Failed', errorMessage);
      }
    } finally {
      setLoading(false);
    }
  };

  const handleNavigateToRegister = () => {
    navigation.navigate('Register');
  };

  const handleForgotPassword = () => {
    Alert.alert(
      'Forgot Password',
      'Please contact your supervisor or administrator to reset your password.',
      [{ text: 'OK' }]
    );
  };

  return (
    <SafeAreaView style={styles.container}>
      {/* Gradient Background matching v0.dev exactly */}
      <View style={styles.gradientBackground}>
        <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} style={styles.keyboardView}>
          <ScrollView contentContainerStyle={styles.scrollContent}>
            
            {/* Card Container - Matching v0.dev layout exactly */}
            <View style={styles.cardContainer}>
              
              {/* Card Header - Logo and Title */}
              <View style={styles.cardHeader}>
                <View style={styles.logoCircle}>
                  <Icon name="location-on" size={32} color="#FFFFFF" />
                </View>
                <Text style={styles.cardTitle}>Industrial Visit Tracker</Text>
                <Text style={styles.cardDescription}>Secure GPS monitoring for educational visits</Text>
                {retryCount > 0 && (
                  <Text style={styles.retryText}>
                    Attempt {retryCount + 1} of {MAX_RETRIES + 1}
                  </Text>
                )}
              </View>

              {/* Card Content - Form */}
              <View style={styles.cardContent}>
                
                {/* Role Selector - Matching v0.dev exactly */}
                <View style={styles.formField}>
                  <Text style={styles.label}>Role</Text>
                  <View style={styles.roleSelector}>
                    {roleOptions.map((option) => (
                      <TouchableOpacity
                        key={option.value}
                        style={[
                          styles.roleOption,
                          role === option.value && styles.roleOptionSelected
                        ]}
                        onPress={() => setRole(option.value)}
                        disabled={loading}
                      >
                        <Icon 
                          name={option.icon} 
                          size={16} 
                          color={role === option.value ? '#2563EB' : '#64748B'} 
                        />
                        <Text style={[
                          styles.roleText,
                          role === option.value && styles.roleTextSelected
                        ]}>
                          {option.label}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                </View>

                {/* Email Input */}
                <View style={styles.formField}>
                  <Text style={styles.label}>Email</Text>
                  <TextInput
                    style={[
                      styles.input,
                      errors.email && styles.inputError
                    ]}
                    placeholder="Enter your email"
                    value={email}
                    onChangeText={(text) => {
                      setEmail(text);
                      clearFieldError('email');
                    }}
                    keyboardType="email-address"
                    autoCapitalize="none"
                    placeholderTextColor="#475569"
                    editable={!loading}
                  />
                  {errors.email && <Text style={styles.errorText}>{errors.email}</Text>}
                </View>

                {/* Password Input */}
                <View style={styles.formField}>
                  <Text style={styles.label}>Password</Text>
                  <TextInput
                    style={[
                      styles.input,
                      errors.password && styles.inputError
                    ]}
                    placeholder="Enter your password"
                    value={password}
                    onChangeText={(text) => {
                      setPassword(text);
                      clearFieldError('password');
                    }}
                    secureTextEntry
                    placeholderTextColor="#475569"
                    editable={!loading}
                  />
                  {errors.password && <Text style={styles.errorText}>{errors.password}</Text>}
                </View>

                {/* Sign In Button - Matching v0.dev */}
                <TouchableOpacity
                  style={[
                    styles.signInButton,
                    (loading || !email || !password || Object.keys(errors).length > 0) && styles.signInButtonDisabled
                  ]}
                  onPress={handleLogin}
                  disabled={loading || !email || !password || Object.keys(errors).length > 0}
                >
                  {loading ? (
                    <ActivityIndicator size="small" color="#FFFFFF" />
                  ) : (
                    <Text style={styles.signInButtonText}>Sign In</Text>
                  )}
                </TouchableOpacity>

                {/* Forgot Password Link */}
                <View style={styles.forgotPasswordContainer}>
                  <TouchableOpacity onPress={handleForgotPassword} disabled={loading}>
                    <Text style={styles.forgotPasswordText}>Forgot password?</Text>
                  </TouchableOpacity>
                </View>

              </View>
            </View>

          </ScrollView>
        </KeyboardAvoidingView>
      </View>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  gradientBackground: {
    flex: 1,
    backgroundColor: '#EFF6FF', // Light blue background similar to gradient
  },
  keyboardView: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
    justifyContent: 'center',
    padding: 16,
  },
  
  // Card Container - Matching v0.dev max-w-md
  cardContainer: {
    maxWidth: 448,
    width: '100%',
    alignSelf: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    ...Platform.select({
      web: {
        boxShadow: '0 1px 2px 0 rgba(0, 0, 0, 0.05)',
      },
      default: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.05,
        shadowRadius: 2,
        elevation: 1,
      },
    }),
  },
  
  // Card Header - Matching v0.dev exactly
  cardHeader: {
    alignItems: 'center',
    paddingTop: 24,
    paddingHorizontal: 24,
    paddingBottom: 0,
  },
  logoCircle: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: '#2563EB',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
  },
  cardTitle: {
    fontSize: 24,
    fontWeight: '700',
    color: '#0F172A',
    textAlign: 'center',
    marginBottom: 4,
  },
  cardDescription: {
    fontSize: 14,
    color: '#475569',
    textAlign: 'center',
    marginBottom: 8,
  },
  retryText: {
    fontSize: 12,
    color: '#EF4444',
    marginTop: 4,
    textAlign: 'center',
    fontWeight: '500',
  },
  
  // Card Content - Form section
  cardContent: {
    padding: 24,
    paddingTop: 24,
  },
  
  // Form Fields
  formField: {
    marginBottom: 16,
  },
  label: {
    fontSize: 14,
    fontWeight: '500',
    color: '#334155',
    marginBottom: 8,
  },
  
  // Role Selector - Matching v0.dev Select component
  roleSelector: {
    flexDirection: 'column',
    gap: 8,
  },
  roleOption: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 6,
    backgroundColor: '#FFFFFF',
    gap: 8,
  },
  roleOptionSelected: {
    borderColor: '#2563EB',
    backgroundColor: '#EFF6FF',
  },
  roleText: {
    fontSize: 14,
    color: '#0F172A',
    fontWeight: '500',
  },
  roleTextSelected: {
    color: '#2563EB',
  },
  
  // Input - Matching v0.dev Input component exactly
  input: {
    borderColor: '#E2E8F0',
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderRadius: 6,
    height: 48,
    paddingHorizontal: 12,
    fontSize: 16,
    color: '#0F172A',
  },
  inputError: {
    borderColor: '#EF4444',
  },
  errorText: {
    fontSize: 12,
    color: '#EF4444',
    marginTop: 4,
  },
  
  // Sign In Button - Matching v0.dev Button exactly
  signInButton: {
    height: 48,
    borderRadius: 6,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 16,
    backgroundColor: '#2563EB',
    marginTop: 8,
    marginBottom: 16,
  },
  signInButtonDisabled: {
    backgroundColor: '#64748B',
    opacity: 0.5,
  },
  signInButtonText: {
    fontSize: 16,
    fontWeight: '500',
    color: '#FFFFFF',
  },
  
  // Forgot Password - Matching v0.dev
  forgotPasswordContainer: {
    alignItems: 'center',
  },
  forgotPasswordText: {
    fontSize: 14,
    color: '#2563EB',
    textDecorationLine: 'underline',
  },
});

export default LoginScreen; 