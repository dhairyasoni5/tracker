// Quick script to fix admin accounts
// Run with: node fix-admin-accounts.js

const { initializeApp, getApps } = require('firebase/app');
const { getAuth, signInWithEmailAndPassword } = require('firebase/auth');
const { getFirestore, collection, query, where, getDocs, updateDoc, doc } = require('firebase/firestore');

// Your Firebase config
const firebaseConfig = {
  apiKey: "AIzaSyDmD6ahr9z_uSABYnbBhDYI0lV8HEVynAM",
  authDomain: "trackingapp-infochip.firebaseapp.com",
  projectId: "trackingapp-infochip",
  storageBucket: "trackingapp-infochip.firebasestorage.app",
  messagingSenderId: "247995086430",
  appId: "1:247995086430:android:027197ac420c0163ade6cf"
};

// Initialize Firebase only if not already initialized
let app;
if (getApps().length === 0) {
  app = initializeApp(firebaseConfig);
} else {
  app = getApps()[0];
}

const auth = getAuth(app);
const db = getFirestore(app);

async function fixAdminAccounts() {
  try {
    console.log('🔧 Starting admin account fix...');
    
    // First, sign in as an admin
    console.log('🔐 Signing in as admin...');
    const adminEmail = process.env.ADMIN_EMAIL || 'admin@trackingapp.com'; // Updated admin email
    const adminPassword = process.env.ADMIN_PASSWORD || 'einfochips'; // Updated admin password
    
    try {
      await signInWithEmailAndPassword(auth, adminEmail, adminPassword);
      console.log('✅ Admin authentication successful');
    } catch (authError) {
      console.error('❌ Admin authentication failed:', authError.message);
      console.log('Please provide correct admin credentials using environment variables:');
      console.log('ADMIN_EMAIL=your-admin-email ADMIN_PASSWORD=your-admin-password node fix-admin-accounts.js');
      return;
    }
    
    // Query all admin users
    console.log('🔍 Querying admin accounts...');
    const adminQuery = query(
      collection(db, 'users'),
      where('role', '==', 'admin')
    );
    
    const querySnapshot = await getDocs(adminQuery);
    
    if (querySnapshot.empty) {
      console.log('❌ No admin accounts found!');
      return;
    }
    
    console.log(`📋 Found ${querySnapshot.size} admin account(s)`);
    
    const promises = [];
    querySnapshot.forEach((docSnap) => {
      const userData = docSnap.data();
      console.log(`👤 Found admin: ${userData.email} (currently active: ${userData.isActive})`);
      
      // Update isActive to true
      const userRef = doc(db, 'users', docSnap.id);
      promises.push(updateDoc(userRef, { isActive: true }));
    });
    
    await Promise.all(promises);
    console.log('✅ All admin accounts have been activated!');
    console.log('🎉 You can now log in with admin credentials!');
    
  } catch (error) {
    console.error('❌ Error fixing admin accounts:', error);
  } finally {
    // Sign out after we're done
    try {
      await auth.signOut();
      console.log('👋 Signed out from admin account');
    } catch (signOutError) {
      console.error('Warning: Failed to sign out:', signOutError.message);
    }
  }
}

// Run the fix
fixAdminAccounts().then(() => {
  console.log('🏁 Script completed!');
}).catch((error) => {
  console.error('💥 Script failed:', error);
}); 