const admin = require('firebase-admin');
const fs = require('fs');

// Initialize Firebase Admin
const serviceAccount = require('./serviceAccountkey.json'); // path to your service account key

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});

const db = admin.firestore();

// List of UIDs to update
const userUIDs = [
  
  'KMFl5PQSymNEZ4X1cD9JmgS30EA2',
  'o5sMo80hLkMUDrhBGlfo',
  
  'ABZ3zmKsoTeEAkohsSjiZ9PhWDX2',
  'Rld6xRcniIbWE9JiS8BlOP0s2Ht2',
];

// New roomId to set
const newRoomId = 'room06';

async function updateRoomIdForUsers() {
  for (const uid of userUIDs) {
    try {
      const userDocRef = db.collection('users').doc(uid); // change 'users' if your collection name is different
      const userDoc = await userDocRef.get();

      if (!userDoc.exists) {
        console.log(`User with UID ${uid} not found.`);
        continue;
      }

      const userData = userDoc.data();
      const nearestBeacon = userData.nearestBeacon || {};

      // Update roomId while preserving other fields
      nearestBeacon.roomId = newRoomId;

      await userDocRef.update({
        nearestBeacon: nearestBeacon,
      });

      console.log(`Updated roomId to "${newRoomId}" for UID: ${uid}`);
    } catch (error) {
      console.error(`Error updating UID ${uid}:`, error.message);
    }
  }

  console.log('✅ Update complete.');
}

updateRoomIdForUsers();
