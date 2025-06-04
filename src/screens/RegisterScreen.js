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
} from 'react-native';
import { createUserWithEmailAndPassword } from 'firebase/auth';
import { doc, setDoc, getDoc, query, where, getDocs, collection } from 'firebase/firestore';
import { auth, db } from '../firebase/firebaseConfig';
import ErrorHandler, { ERROR_SEVERITY } from '../utils/ErrorHandler';

const RegisterScreen = ({ navigation }) => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [role, setRole] = useState('user'); // Default to user
  const [supervisorId, setSupervisorId] = useState('');
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState({});
  const [supervisorValidation, setSupervisorValidation] = useState({
    isValidating: false,
    isValid: null,
    supervisorName: null,
    error: null
  });
  const [supervisorCode, setSupervisorCode] = useState('');

  // Generate random 4-digit supervisor code
  const generateSupervisorCode = () => {
    return Math.floor(1000 + Math.random() * 9000).toString();
  };

  // Generate supervisor code when role changes to supervisor
  React.useEffect(() => {
    if (role === 'supervisor' && !supervisorCode) {
      setSupervisorCode(generateSupervisorCode());
    }
  }, [role]);

  // Real-time supervisor code validation for students - simplified
  React.useEffect(() => {
    let cancelled = false;
    
    const validateSupervisorCode = async () => {
      // Only validate for students with 4-digit codes
      if (role !== 'user' || supervisorId.trim().length !== 4 || !/^\d{4}$/.test(supervisorId.trim())) {
        setSupervisorValidation({ 
          isValidating: false, 
          isValid: null, 
          supervisorName: null, 
          error: null 
        });
        return;
      }

      setSupervisorValidation({ 
        isValidating: true, 
        isValid: null, 
        supervisorName: null, 
        error: null 
      });

      try {
        // Query for supervisor with this code
        const supervisorsQuery = query(
          collection(db, 'users'),
          where('role', '==', 'supervisor'),
          where('supervisorCode', '==', supervisorId.trim())
        );
        
        const querySnapshot = await getDocs(supervisorsQuery);
        
        if (cancelled) return;

        if (!querySnapshot.empty) {
          // Code exists - show green check
          const supervisorDoc = querySnapshot.docs[0];
          const supervisorData = supervisorDoc.data();
          setSupervisorValidation({
            isValidating: false,
            isValid: true,
            supervisorName: supervisorData.fullName,
            error: null
          });
        } else {
          // Code doesn't exist - show red cross
          setSupervisorValidation({
            isValidating: false,
            isValid: false,
            supervisorName: null,
            error: null
          });
        }
      } catch (error) {
        if (cancelled) return;
        
        console.error('Supervisor validation error:', error);
        setSupervisorValidation({
          isValidating: false,
          isValid: false,
          supervisorName: null,
          error: 'Validation error'
        });
      }
    };

    // Debounce the validation
    const timeoutId = setTimeout(validateSupervisorCode, 500);
    return () => {
      cancelled = true;
      clearTimeout(timeoutId);
    };
  }, [supervisorId, role]);

  // Validation functions
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

  const validateConfirmPassword = (password, confirmPassword) => {
    if (!confirmPassword) return 'Please confirm your password';
    if (password !== confirmPassword) return 'Passwords do not match';
    return null;
  };

  const validateFullName = (fullName) => {
    if (!fullName) return 'Full name is required';
    if (fullName.trim().length < 2) return 'Name must be at least 2 characters';
    return null;
  };

  const validateSupervisorId = (supervisorId, role) => {
    if (role === 'user') {
      if (!supervisorId.trim()) return 'Supervisor code is required for students';
      if (supervisorId.trim().length !== 4) return 'Supervisor code must be 4 digits';
      if (!/^\d{4}$/.test(supervisorId.trim())) return 'Supervisor code must contain only numbers';
    }
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
    const confirmPasswordError = validateConfirmPassword(password, confirmPassword);
    const fullNameError = validateFullName(fullName);
    const supervisorIdError = validateSupervisorId(supervisorId, role);
    
    if (emailError) newErrors.email = emailError;
    if (passwordError) newErrors.password = passwordError;
    if (confirmPasswordError) newErrors.confirmPassword = confirmPasswordError;
    if (fullNameError) newErrors.fullName = fullNameError;
    if (supervisorIdError) newErrors.supervisorId = supervisorIdError;
    
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleRegister = async () => {
    // Clear previous errors
    setErrors({});

    // Validate form
    if (!validateForm()) {
      ErrorHandler.logError(
        new Error('Registration form validation failed'),
        { 
          hasEmail: !!email,
          hasPassword: !!password,
          hasConfirmPassword: !!confirmPassword,
          hasFullName: !!fullName,
          role,
          hasSupervisorId: !!supervisorId
        },
        ERROR_SEVERITY.LOW
      );
      return;
    }

    // Additional validation for students - check if supervisor code is valid
    if (role === 'user' && !supervisorValidation.isValid) {
      setErrors({ supervisorId: 'Please enter a valid supervisor code' });
      return;
    }

    setLoading(true);

    const registrationOperation = async () => {
      try {
        // Double-check supervisor code exists for students at submit time
        if (role === 'user' && supervisorId.trim()) {
          const supervisorsQuery = query(
            collection(db, 'users'),
            where('role', '==', 'supervisor'),
            where('supervisorCode', '==', supervisorId.trim())
          );
          const querySnapshot = await getDocs(supervisorsQuery);
          if (querySnapshot.empty) {
            throw new Error(`Supervisor code ${supervisorId.trim()} not found. Please check with your supervisor.`);
          }
        }

        // Create user with Firebase Auth
        const userCredential = await createUserWithEmailAndPassword(
          auth, 
          email.trim().toLowerCase(), 
          password
        );
        const user = userCredential.user;

        // Prepare user data
        const userData = {
          uid: user.uid,
          email: email.trim().toLowerCase(),
          fullName: fullName.trim(),
          role: role,
          createdAt: new Date().toISOString(),
          isActive: true,
        };

        // Add supervisor code for supervisors
        if (role === 'supervisor') {
          userData.supervisorCode = supervisorCode;
        }

        // Add supervisor code for students
        if (role === 'user' && supervisorId.trim()) {
          userData.supervisorCode = supervisorId.trim();
        }

        // Save user data to Firestore
        await setDoc(doc(db, 'users', user.uid), userData);

        // Show success message with supervisor code for supervisors
        const successMessage = role === 'supervisor' 
          ? `Account created successfully!\n\nYour Supervisor Code is: ${supervisorCode}\n\nShare this 4-digit code with your students for registration.`
          : role === 'user'
          ? `Account created successfully!\n\nYou are registered under supervisor code: ${supervisorId.trim()}`
          : 'Account created successfully!';

        Alert.alert(
          'Success', 
          successMessage, 
          [{ text: 'OK', onPress: () => navigation.replace('Login') }]
        );

        return { success: true, userData };
      } catch (error) {
        ErrorHandler.logError(error, {
          action: 'registration',
          email: email.trim(),
          role,
          supervisorCode: role === 'supervisor' ? supervisorCode : supervisorId
        }, ERROR_SEVERITY.MEDIUM);
        
        throw error;
      }
    };

    try {
      await ErrorHandler.executeWithErrorHandling(
        registrationOperation,
        { action: 'registration' },
        false // Don't show automatic alert, we'll handle it
      );
    } catch (error) {
      // Handle specific error cases
      if (error.message.includes('Supervisor code') && error.message.includes('not found')) {
        // Specific supervisor code error
        Alert.alert(
          'Supervisor Code Not Found', 
          error.message + '\n\nPlease verify the code with your supervisor and try again.'
        );
      } else if (error.code === 'auth/network-request-failed') {
        ErrorHandler.showErrorWithRetry(
          error,
          () => handleRegister(),
          'Network Error',
          { action: 'registration' }
        );
      } else {
        // Other registration errors
        const errorMessage = ErrorHandler.getUserFriendlyMessage(error);
        Alert.alert('Registration Failed', errorMessage);
      }
    } finally {
      setLoading(false);
    }
  };

  const getRoleDescription = (roleType) => {
    switch(roleType) {
      case 'admin':
        return 'Full system access';
      case 'supervisor':
        return 'Manage students & visits';
      case 'user':
        return 'Student/Visitor';
      default:
        return '';
    }
  };

  const getSupervisorValidationIcon = () => {
    if (supervisorValidation.isValidating) return '⏳';
    if (supervisorValidation.isValid === true) return '✅';
    if (supervisorValidation.isValid === false) return '❌';
    return '';
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <ScrollView contentContainerStyle={styles.scrollContainer}>
        <View style={styles.header}>
          <Text style={styles.title}>Create Account</Text>
          <Text style={styles.subtitle}>Join Industrial Visit Tracker</Text>
        </View>

        <View style={styles.form}>
          <View style={styles.inputContainer}>
            <Text style={styles.label}>Full Name</Text>
            <TextInput
              style={[
                styles.input,
                errors.fullName && styles.inputError
              ]}
              placeholder="Enter your full name"
              value={fullName}
              onChangeText={(text) => {
                setFullName(text);
                clearFieldError('fullName');
              }}
              autoCapitalize="words"
              autoCorrect={false}
              editable={!loading}
            />
            {errors.fullName && (
              <Text style={styles.errorText}>{errors.fullName}</Text>
            )}
          </View>

          <View style={styles.inputContainer}>
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
              autoCorrect={false}
              editable={!loading}
            />
            {errors.email && (
              <Text style={styles.errorText}>{errors.email}</Text>
            )}
          </View>

          <View style={styles.inputContainer}>
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
              autoCorrect={false}
              editable={!loading}
            />
            {errors.password && (
              <Text style={styles.errorText}>{errors.password}</Text>
            )}
          </View>

          <View style={styles.inputContainer}>
            <Text style={styles.label}>Confirm Password</Text>
            <TextInput
              style={[
                styles.input,
                errors.confirmPassword && styles.inputError
              ]}
              placeholder="Confirm your password"
              value={confirmPassword}
              onChangeText={(text) => {
                setConfirmPassword(text);
                clearFieldError('confirmPassword');
              }}
              secureTextEntry
              autoCorrect={false}
              editable={!loading}
            />
            {errors.confirmPassword && (
              <Text style={styles.errorText}>{errors.confirmPassword}</Text>
            )}
          </View>

          <View style={styles.inputContainer}>
            <Text style={styles.label}>Role</Text>
            <View style={styles.roleContainer}>
              <TouchableOpacity
                style={[styles.roleButton, role === 'user' && styles.roleButtonActive]}
                onPress={() => setRole('user')}
                disabled={loading}
              >
                <Text style={[styles.roleButtonText, role === 'user' && styles.roleButtonTextActive]}>
                  Student
                </Text>
                <Text style={[styles.roleDescription, role === 'user' && styles.roleDescriptionActive]}>
                  {getRoleDescription('user')}
                </Text>
              </TouchableOpacity>
              
              <TouchableOpacity
                style={[styles.roleButton, role === 'supervisor' && styles.roleButtonActive]}
                onPress={() => setRole('supervisor')}
                disabled={loading}
              >
                <Text style={[styles.roleButtonText, role === 'supervisor' && styles.roleButtonTextActive]}>
                  Supervisor
                </Text>
                <Text style={[styles.roleDescription, role === 'supervisor' && styles.roleDescriptionActive]}>
                  {getRoleDescription('supervisor')}
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.roleButton, role === 'admin' && styles.roleButtonActive]}
                onPress={() => setRole('admin')}
                disabled={loading}
              >
                <Text style={[styles.roleButtonText, role === 'admin' && styles.roleButtonTextActive]}>
                  Admin
                </Text>
                <Text style={[styles.roleDescription, role === 'admin' && styles.roleDescriptionActive]}>
                  {getRoleDescription('admin')}
                </Text>
              </TouchableOpacity>
            </View>
          </View>

          {role === 'supervisor' && (
            <View style={styles.inputContainer}>
              <Text style={styles.label}>Your Supervisor Code</Text>
              <View style={styles.supervisorCodeContainer}>
                <TextInput
                  style={[styles.input, styles.supervisorCodeInput]}
                  value={supervisorCode}
                  onChangeText={setSupervisorCode}
                  placeholder="4-digit code"
                  maxLength={4}
                  keyboardType="numeric"
                  editable={!loading}
                />
                <TouchableOpacity 
                  style={styles.regenerateButton}
                  onPress={() => setSupervisorCode(generateSupervisorCode())}
                  disabled={loading}
                >
                  <Text style={styles.regenerateButtonText}>🎲</Text>
                </TouchableOpacity>
              </View>
              <Text style={styles.helperText}>
                Students will use this code to register under you
              </Text>
            </View>
          )}

          {role === 'user' && (
            <View style={styles.inputContainer}>
              <Text style={styles.label}>
                Supervisor Code *{' '}
                {supervisorValidation.isValidating ? '⏳' : supervisorValidation.isValid === true ? '✅' : supervisorValidation.isValid === false ? '❌' : ''}
              </Text>
              <TextInput
                style={[
                  styles.input,
                  errors.supervisorId && styles.inputError,
                  supervisorValidation.isValid === true && styles.inputSuccess
                ]}
                placeholder="Enter 4-digit supervisor code"
                value={supervisorId}
                onChangeText={(text) => {
                  setSupervisorId(text);
                  clearFieldError('supervisorId');
                }}
                maxLength={4}
                keyboardType="numeric"
                editable={!loading}
              />
              {supervisorValidation.isValid && supervisorValidation.supervisorName && (
                <Text style={styles.successText}>
                  Supervisor: {supervisorValidation.supervisorName}
                </Text>
              )}
              {errors.supervisorId && (
                <Text style={styles.errorText}>{errors.supervisorId}</Text>
              )}
              <Text style={styles.helperText}>
                Get this 4-digit code from your supervisor
              </Text>
            </View>
          )}

          <TouchableOpacity
            style={[styles.registerButton, loading && styles.registerButtonDisabled]}
            onPress={handleRegister}
            disabled={loading}
          >
            {loading ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.registerButtonText}>Create Account</Text>
            )}
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.loginLink}
            onPress={() => navigation.navigate('Login')}
            disabled={loading}
          >
            <Text style={styles.loginLinkText}>
              Already have an account? <Text style={styles.loginLinkBold}>Sign In</Text>
            </Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f8f9fa',
  },
  scrollContainer: {
    flexGrow: 1,
    justifyContent: 'center',
    padding: 20,
  },
  header: {
    alignItems: 'center',
    marginBottom: 40,
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#2c3e50',
    marginBottom: 8,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 16,
    color: '#7f8c8d',
    textAlign: 'center',
  },
  form: {
    backgroundColor: '#fff',
    padding: 30,
    borderRadius: 12,
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  inputContainer: {
    marginBottom: 20,
  },
  label: {
    fontSize: 16,
    fontWeight: '600',
    color: '#2c3e50',
    marginBottom: 8,
  },
  input: {
    borderWidth: 1,
    borderColor: '#e1e8ed',
    borderRadius: 8,
    padding: 15,
    fontSize: 16,
    backgroundColor: '#f8f9fa',
  },
  inputError: {
    borderColor: '#e74c3c',
    backgroundColor: '#fdedec',
  },
  inputSuccess: {
    borderColor: '#27ae60',
    backgroundColor: '#d5f4e6',
  },
  errorText: {
    color: '#e74c3c',
    fontSize: 12,
    marginTop: 5,
    marginLeft: 4,
  },
  successText: {
    color: '#27ae60',
    fontSize: 12,
    marginTop: 5,
    marginLeft: 4,
    fontWeight: '600',
  },
  helperText: {
    fontSize: 12,
    color: '#7f8c8d',
    marginTop: 5,
    fontStyle: 'italic',
  },
  roleContainer: {
    flexDirection: 'column',
    gap: 10,
  },
  roleButton: {
    padding: 15,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#e1e8ed',
    alignItems: 'center',
    backgroundColor: '#f8f9fa',
  },
  roleButtonActive: {
    backgroundColor: '#3498db',
    borderColor: '#3498db',
  },
  roleButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#7f8c8d',
  },
  roleButtonTextActive: {
    color: '#fff',
  },
  roleDescription: {
    fontSize: 12,
    color: '#95a5a6',
    marginTop: 2,
  },
  roleDescriptionActive: {
    color: '#ecf0f1',
  },
  registerButton: {
    backgroundColor: '#27ae60',
    padding: 15,
    borderRadius: 8,
    alignItems: 'center',
    marginTop: 10,
  },
  registerButtonDisabled: {
    backgroundColor: '#bdc3c7',
  },
  registerButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  loginLink: {
    marginTop: 20,
    alignItems: 'center',
  },
  loginLinkText: {
    fontSize: 14,
    color: '#7f8c8d',
  },
  loginLinkBold: {
    fontWeight: '600',
    color: '#3498db',
  },
  supervisorCodeContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  supervisorCodeInput: {
    flex: 1,
  },
  regenerateButton: {
    padding: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#e1e8ed',
    alignItems: 'center',
    backgroundColor: '#f8f9fa',
  },
  regenerateButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#7f8c8d',
  },
});

export default RegisterScreen; 