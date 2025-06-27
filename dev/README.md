# Industrial Visit Tracking Mobile App

A React Native mobile application built with Expo SDK 50 for tracking individuals during industrial visits using GPS and Firebase.

## Features

- **Firebase Authentication**: Email/password login with role-based access
- **Role-based Navigation**: Admin dashboard and user tracker interfaces
- **Real-time Tracking**: GPS location tracking during visits
- **Offline Support**: Data syncing when connection is restored
- **Modern UI**: Clean, responsive design with React Native

## Tech Stack

- **React Native** with Expo SDK 50
- **Firebase** (Authentication + Firestore)
- **React Navigation** for navigation
- **Modern JavaScript** (ES6+)

## Setup Instructions

### 1. Install Dependencies

```bash
npm install
```

### 2. Configure Firebase

1. Create a Firebase project at [Firebase Console](https://console.firebase.google.com/)
2. Enable Authentication (Email/Password)
3. Create a Firestore database
4. Get your Firebase configuration
5. Update `src/firebase/firebaseConfig.js` with your Firebase config:

```javascript
const firebaseConfig = {
  apiKey: "your-api-key",
  authDomain: "your-auth-domain",
  projectId: "your-project-id",
  storageBucket: "your-storage-bucket",
  messagingSenderId: "your-messaging-sender-id",
  appId: "your-app-id"
};
```

### 3. Set up Firestore Database

Create a `users` collection in Firestore with documents containing:
```javascript
{
  email: "user@example.com",
  role: "admin" // or "user"
}
```

### 4. Run the App

```bash
# Start the development server
npm start

# Run on Android
npm run android

# Run on iOS
npm run ios

# Run on Web
npm run web
```

## Project Structure

```
src/
├── firebase/
│   └── firebaseConfig.js    # Firebase configuration
├── navigation/
│   └── AppNavigator.js      # Main navigation setup
├── screens/
│   ├── LoginScreen.js       # Authentication screen
│   ├── AdminDashboard.js    # Admin interface
│   └── UserTracker.js       # User tracking interface
├── components/              # Reusable components
└── utils/                   # Utility functions
```

## Authentication Flow

1. User enters email/password on LoginScreen
2. Firebase Auth validates credentials
3. App fetches user role from Firestore
4. Redirects to appropriate screen:
   - Admin → AdminDashboard
   - User → UserTracker

## Next Steps

- Implement GPS tracking functionality
- Add real-time location updates
- Create admin monitoring features
- Add QR code scanning for indoor tracking
- Implement offline data synchronization

## License

ISC 