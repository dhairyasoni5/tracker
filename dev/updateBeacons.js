const admin = require('firebase-admin');
const serviceAccount = require('./serviceAccountkey.json');

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});

const db = admin.firestore();

const uuid = 'FDA50693-A4E2-4FB1-AFCF-C6EB07647825';
const major = 10835;
const newBeacons = [
  { minor: 205, roomId: 'roomXX', roomName: 'Room 205', svgPosition: { x: 0, y: 0 } },
  { minor: 208, roomId: 'roomXX', roomName: 'Room 208', svgPosition: { x: 0, y: 0 } },
  { minor: 209, roomId: 'roomXX', roomName: 'Room 209', svgPosition: { x: 0, y: 0 } },
];

async function addBeacons() {
  for (const beacon of newBeacons) {
    await db.collection('beacons').add({
      uuid,
      major,
      minor: beacon.minor,
      roomId: beacon.roomId,
      roomName: beacon.roomName,
      svgPosition: beacon.svgPosition,
    });
    console.log(`Added beacon minor ${beacon.minor}`);
  }
  console.log('Done.');
}

addBeacons(); 