const admin = require('firebase-admin');
const serviceAccount = require('./serviceAccountkey.json');

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});

const db = admin.firestore();

async function fixRoomIds() {
  const snapshot = await db.collection('beacons').get();
  let updated = 0;
  for (const doc of snapshot.docs) {
    const data = doc.data();
    if (data.roomId && data.roomId !== data.roomId.toLowerCase()) {
      await doc.ref.update({ roomId: data.roomId.toLowerCase() });
      console.log(`Updated beacon ${doc.id}: roomId '${data.roomId}' -> '${data.roomId.toLowerCase()}'`);
      updated++;
    }
  }
  console.log(`Done. Updated ${updated} beacons.`);
}

fixRoomIds(); 