const { initializeApp } = require('firebase/app');
const { getAuth, signInWithEmailAndPassword } = require('firebase/auth');
const { getFirestore, doc, getDoc } = require('firebase/firestore');

// Firebase config (you'll need to replace with your actual config)
const firebaseConfig = {
  // Add your Firebase config here
  apiKey: "your-api-key",
  authDomain: "your-auth-domain", 
  projectId: "your-project-id",
  storageBucket: "your-storage-bucket",
  messagingSenderId: "your-messaging-sender-id",
  appId: "your-app-id"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

async function testAdminLogin() {
  try {
    console.log('Testing admin login...');
    
    // Test credentials
    const email = process.env.ADMIN_EMAIL || 'admin@example.com';
    const password = process.env.ADMIN_PASSWORD || 'your_secure_password';
    
    console.log(`Attempting login with: ${email}`);
    
    // Sign in
    const userCredential = await signInWithEmailAndPassword(auth, email, password);
    const user = userCredential.user;
    
    console.log('✅ Login successful!');
    console.log('User ID:', user.uid);
    console.log('User Email:', user.email);
    
    // Get user role from Firestore
    const userDoc = await getDoc(doc(db, 'users', user.uid));
    
    if (userDoc.exists()) {
      const userData = userDoc.data();
      console.log('✅ User data found in Firestore');
      console.log('Role:', userData.role);
      console.log('Full Name:', userData.fullName);
      console.log('Is Active:', userData.isActive);
      
      if (userData.role === 'admin') {
        console.log('🎉 ADMIN ACCESS CONFIRMED!');
        console.log('You will be redirected to AdminDashboard');
      } else {
        console.log('❌ Not an admin user');
      }
    } else {
      console.log('❌ User data not found in Firestore');
    }
    
  } catch (error) {
    console.error('❌ Login failed:', error.message);
    
    if (error.code === 'auth/user-not-found') {
      console.log('User does not exist');
    } else if (error.code === 'auth/wrong-password') {
      console.log('Incorrect password');
    } else if (error.code === 'auth/invalid-email') {
      console.log('Invalid email format');
    }
  }
}

// Run the test
testAdminLogin(); 