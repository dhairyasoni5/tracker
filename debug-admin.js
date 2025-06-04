// Quick debug script for admin login issue
console.log('🔍 Debugging Admin Login Issue');
console.log('');

console.log('📝 Admin Credentials:');
console.log('Email: admin@trackingapp.com');
console.log('Password: einfochips');
console.log('');

console.log('🔧 Potential Issues:');
console.log('1. Admin user not created in Firebase Auth');
console.log('2. Admin user document missing in Firestore users collection');
console.log('3. Admin role not set correctly in Firestore');
console.log('4. AuthContext clearing state on app start');
console.log('');

console.log('✅ Steps to Fix:');
console.log('1. Check Firebase Console - Authentication tab');
console.log('2. Verify user admin@trackingapp.com exists');
console.log('3. Check Firestore - users collection');
console.log('4. Verify admin user document has:');
console.log('   - role: "admin"');
console.log('   - isActive: true');
console.log('   - fullName: "Admin User"');
console.log('');

console.log('🚀 Quick Test:');
console.log('Run: npm start');
console.log('Login with admin@trackingapp.com / einfochips');
console.log('Check console logs for auth state changes');
console.log('');

console.log('💡 Recent Fix Applied:');
console.log('- Removed automatic forceCleanStart() from AuthContext');
console.log('- This was signing out users immediately on app start');
console.log('- Should now allow admin to stay logged in'); 