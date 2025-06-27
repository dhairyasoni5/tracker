import { initializeApp } from 'firebase/app';
import { initializeAuth, getReactNativePersistence, browserLocalPersistence, setPersistence } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';

// Firebase configuration
// TODO: Replace with your Firebase project configuration
const firebaseConfig = {
  apiKey: "AIzaSyDmD6ahr9z_uSABYnbBhDYI0lV8HEVynAM",
  authDomain: "trackingapp-infochip.firebaseapp.com",
  projectId: "trackingapp-infochip",
  storageBucket: "trackingapp-infochip.firebasestorage.app",
  messagingSenderId: "247995086430",
  appId: "1:247995086430:android:027197ac420c0163ade6cf"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);

// Initialize Firebase Authentication with platform-specific persistence
let auth;
if (Platform.OS === 'web') {
  auth = initializeAuth(app);
  setPersistence(auth, browserLocalPersistence);
} else {
  auth = initializeAuth(app, {
    persistence: getReactNativePersistence(AsyncStorage)
  });
}

// Initialize Cloud Firestore and get a reference to the service
export const db = getFirestore(app);

export { auth };
export default app; 