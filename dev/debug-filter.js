#!/usr/bin/env node

// Enhanced error filter for React Native/Expo logs (Phone + Console)
// Usage: npx expo start --clear 2>&1 | node debug-filter.js

process.stdin.setEncoding('utf8');

let buffer = '';
const criticalErrors = [];
const firebaseErrors = [];
const navigationErrors = [];
const renderErrors = [];
const authErrors = [];
const generalErrors = [];

const ERROR_PATTERNS = {
  CRITICAL: [
    '🚨 Error [HIGH]',
    '🚨 Error [MEDIUM]',
    'Cannot read property',
    'TypeError:',
    'undefined is not',
    'null is not',
    'ReferenceError',
    'SyntaxError'
  ],
  FIREBASE: [
    'FirebaseError',
    'failed-precondition',
    'index.',
    'requires an index',
    'permission-denied',
    'not-found'
  ],
  NAVIGATION: [
    'navigation',
    'Navigator',
    'Screen',
    'Route'
  ],
  RENDER: [
    'Warning: Failed prop type',
    'Warning: Each child',
    'VirtualizedList',
    'FlatList',
    'ScrollView'
  ],
  AUTH: [
    'Auth',
    'login',
    'userData',
    'clearAuthState',
    'uid'
  ]
};

function categorizeError(line) {
  const lower = line.toLowerCase();
  
  for (const pattern of ERROR_PATTERNS.CRITICAL) {
    if (line.includes(pattern)) return 'CRITICAL';
  }
  for (const pattern of ERROR_PATTERNS.FIREBASE) {
    if (lower.includes(pattern.toLowerCase())) return 'FIREBASE';
  }
  for (const pattern of ERROR_PATTERNS.NAVIGATION) {
    if (lower.includes(pattern.toLowerCase())) return 'NAVIGATION';
  }
  for (const pattern of ERROR_PATTERNS.RENDER) {
    if (line.includes(pattern)) return 'RENDER';
  }
  for (const pattern of ERROR_PATTERNS.AUTH) {
    if (lower.includes(pattern.toLowerCase())) return 'AUTH';
  }
  
  if (line.includes('ERROR') || line.includes('Error') || line.includes('WARN')) {
    return 'GENERAL';
  }
  
  return null;
}

process.stdin.on('data', (chunk) => {
  buffer += chunk;
  const lines = buffer.split('\n');
  buffer = lines.pop();
  
  lines.forEach(line => {
    const trimmedLine = line.trim();
    
    if (!trimmedLine || 
        trimmedLine.includes('Remote debugger') ||
        trimmedLine.includes('Metro') ||
        trimmedLine.length < 10) {
      return;
    }
    
    const category = categorizeError(trimmedLine);
    
    switch (category) {
      case 'CRITICAL':
        criticalErrors.push(trimmedLine);
        console.log('🔴 CRITICAL:', trimmedLine.substring(0, 120) + '...');
        break;
      case 'FIREBASE':
        firebaseErrors.push(trimmedLine);
        console.log('🔥 FIREBASE:', trimmedLine.substring(0, 120) + '...');
        break;
      case 'NAVIGATION':
        navigationErrors.push(trimmedLine);
        console.log('🧭 NAV:', trimmedLine.substring(0, 120) + '...');
        break;
      case 'RENDER':
        renderErrors.push(trimmedLine);
        console.log('🎨 RENDER:', trimmedLine.substring(0, 120) + '...');
        break;
      case 'AUTH':
        authErrors.push(trimmedLine);
        console.log('🔐 AUTH:', trimmedLine.substring(0, 120) + '...');
        break;
      case 'GENERAL':
        generalErrors.push(trimmedLine);
        console.log('⚠️  OTHER:', trimmedLine.substring(0, 120) + '...');
        break;
    }
  });
});

function printSummary() {
  console.log('\n📊 ERROR SUMMARY:');
  console.log('==================');
  console.log(`🔴 Critical: ${criticalErrors.length}`);
  console.log(`🔥 Firebase: ${firebaseErrors.length}`);
  console.log(`🧭 Navigation: ${navigationErrors.length}`);
  console.log(`🎨 Render: ${renderErrors.length}`);
  console.log(`🔐 Auth: ${authErrors.length}`);
  console.log(`⚠️  Other: ${generalErrors.length}`);
  
  // Show top 3 of each category
  if (criticalErrors.length > 0) {
    console.log('\n🔴 TOP CRITICAL ERRORS:');
    criticalErrors.slice(0, 3).forEach((error, i) => {
      console.log(`${i + 1}. ${error.substring(0, 150)}...`);
    });
  }
  
  if (firebaseErrors.length > 0) {
    console.log('\n🔥 FIREBASE ISSUES:');
    firebaseErrors.slice(0, 2).forEach((error, i) => {
      console.log(`${i + 1}. ${error.substring(0, 150)}...`);
    });
  }
  
  if (authErrors.length > 0) {
    console.log('\n🔐 AUTH ISSUES:');
    authErrors.slice(0, 2).forEach((error, i) => {
      console.log(`${i + 1}. ${error.substring(0, 150)}...`);
    });
  }
}

process.stdin.on('end', printSummary);
process.on('SIGINT', () => {
  console.log('\n\n📊 FINAL SUMMARY:');
  console.log('==================');
  printSummary();
  process.exit(0);
}); 