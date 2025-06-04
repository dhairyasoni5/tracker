# 📍 Industrial Visit Tracking Mobile App — PLAN.md

## 🎯 Project Overview
A mobile application designed to track and monitor individuals during industrial visits using GPS and BLE technologies. The app supports offline syncing, live admin monitoring, role-based navigation, and optional QR-based fallback for indoor location tracking.

---

## 📱 Core Features

### 👤 Authentication
- Firebase Auth (email/password)
- Role-based login (admin vs user)

### 🛰️ Outdoor Tracking (GPS)
- Fetch location using `expo-location`
- Store coordinates in Firestore every 30 seconds
- Sync unsent locations when network reconnects using AsyncStorage

### 🏢 Indoor Tracking (BLE + QR)
- Detect entry into rooms via BLE beacons (`react-native-ble-manager`)
- Optional fallback: QR code scanning with `expo-barcode-scanner`

### 🗺️ Admin Dashboard (Inside Mobile App)
- Visualize all tracked users on Google Map (`react-native-maps`)
- Real-time updates using Firestore snapshot listeners
- Admin login redirects to dashboard; users redirect to tracking

### 🔔 Push Notifications
- Firebase Cloud Messaging via `expo-notifications`
- Admin-triggered alerts or emergency triggers from users

### 📴 Offline Support
- AsyncStorage to queue data while offline
- Sync queued data to Firestore once online
- Firestore’s native offline cache used for admin read-only fallback

---

## 🧱 Tech Stack

### 📦 Mobile App
- **React Native (Expo SDK 50)**
- Navigation: `@react-navigation/native` + `native-stack`
- UI: `react-native-paper` (material design) + `nativewind` (optional)

### 🔐 Authentication & DB
- **Firebase Auth**
- **Firestore** (for user locations, roles, rooms)
- Custom claims optional for secure role checks

### 🛰️ GPS
- `expo-location` for continuous location tracking

### 📡 BLE & QR
- `react-native-ble-manager` for beacon detection
- `expo-barcode-scanner` as fallback method

### 🗺️ Maps
- `react-native-maps` with Google Maps as provider
- GCP Maps SDK key required for iOS and custom features

### 🔔 Notifications
- `expo-notifications` + Firebase Cloud Messaging

### 💾 Offline Handling
- `@react-native-async-storage/async-storage`
- Manual sync logic for GPS + BLE logs

---

## 📁 Folder Structure (Expo App)
```
/mobile-app
├── src
│   ├── firebase
│   │   └── firebaseConfig.js
│   ├── screens
│   │   ├── LoginScreen.js
│   │   ├── TrackerScreen.js
│   │   └── AdminDashboardScreen.js
│   ├── components
│   ├── utils
│   ├── navigation
│   │   └── AppNavigator.js
├── app.json (contains GCP keys)
├── .cursor-rules.json
├── PLAN.md
├── README.md
```

---

## 🧪 MVP Milestones

### Phase 1: Core Functionality
- Firebase Auth setup
- Login screen with role redirect
- TrackerScreen: GPS → Firestore
- AdminDashboardScreen: Google Map + live locations
- Navigation

### Phase 2: BLE + QR + Offline
- BLE scan + Firestore update
- QR fallback
- Offline queue with AsyncStorage

### Phase 3: Enhancements
- Push notifications
- Emergency trigger
- Admin filtering
- Performance optimization and caching

---

## 🔐 GCP Setup Notes
1. Enable:
   - Maps SDK for Android
   - Maps SDK for iOS
2. Generate API Key
3. Add to `app.json`:
```json
  "android": {"config": {"googleMaps": {"apiKey": "YOUR_KEY"}}},
  "ios": {"config": {"googleMapsApiKey": "YOUR_KEY"}}
```
4. Secure the key via referrer restrictions

---

## 🤖 AI & Tooling
- **Cursor Pro**: Inline coding + full-project prompting
- **ChatGPT**: Planning, architecture, content creation
- **VSCode**: Alternate code editing
- **Firebase Console**: Manage DB, Auth, roles
- **Expo Go / EAS**: Run and deploy mobile builds

---

## ✅ Next Steps
- [ ] Finalize Firebase config with real keys
- [ ] Implement Login + role-based navigation
- [ ] Start with GPS tracking logic
- [ ] Scaffold BLE + Admin screens
- [ ] Test on real device

---

This file will evolve as we implement more features. Keep synced with `.cursor-rules.json` and actual file structure.