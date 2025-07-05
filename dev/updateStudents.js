const admin = require('firebase-admin');
const serviceAccount = require('./serviceAccountkey.json'); // Update path if needed

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();

// Example beacon: Room201 (update as needed)
const beacon = {
  roomId: 'Room201',
  roomName: 'Main Office',
  svgPosition: { x: 60, y: 150 }
};

async function updateAllStudents() {
  const usersRef = db.collection('users');
  const snapshot = await usersRef.where('role', 'in', ['student', 'user']).get();

  if (snapshot.empty) {
    console.log('No matching students.');
    return;
  }

  const batch = db.batch();
  snapshot.forEach(doc => {
    batch.update(doc.ref, { nearestBeacon: beacon });
  });

  await batch.commit();
  console.log('All students updated with nearestBeacon!');
}

updateAllStudents().then(() => process.exit());