// Clear Auth State Utility
// Run with: node clear-auth-state.js

console.log('🧹 Clearing all authentication state and storage...');

try {
  // For React Native AsyncStorage (simulated)
  console.log('📱 React Native storage keys to clear:');
  const rnKeys = [
    'firebase:authUser:AIzaSyDmD6ahr9z_uSABYnbBhDYI0lV8HEVynAM:[DEFAULT]',
    'firebase:authToken:AIzaSyDmD6ahr9z_uSABYnbBhDYI0lV8HEVynAM:[DEFAULT]',
    'firebase:persistenceKey:[DEFAULT]'
  ];
  
  rnKeys.forEach(key => {
    console.log(`  - ${key}`);
  });
  
  // For Web localStorage (if running in browser environment)
  if (typeof window !== 'undefined' && window.localStorage) {
    console.log('🌐 Clearing web localStorage...');
    const keys = Object.keys(window.localStorage);
    const firebaseKeys = keys.filter(key => 
      key.includes('firebase') || 
      key.includes('auth') || 
      key.includes('firestore')
    );
    
    firebaseKeys.forEach(key => {
      console.log(`  - Removing: ${key}`);
      window.localStorage.removeItem(key);
    });
    
    console.log(`✅ Cleared ${firebaseKeys.length} localStorage keys`);
  }
  
  console.log('');
  console.log('✅ Auth state clear instructions:');
  console.log('   1. Close Expo Go app completely');
  console.log('   2. Clear app data/cache (optional)');
  console.log('   3. Restart Expo Go');
  console.log('   4. Open your project');
  console.log('   5. Should start at login page');
  console.log('');
  console.log('🔧 If still auto-logging in:');
  console.log('   - Use "Force Clean Start" button in debug info');
  console.log('   - Or clear Expo Go app data from device settings');
  
} catch (error) {
  console.error('❌ Error clearing auth state:', error);
}

console.log('🏁 Clear auth state script completed!'); 