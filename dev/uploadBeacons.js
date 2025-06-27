const admin = require('firebase-admin');
const serviceAccount = require('./trackingapp-infochip-firebase-adminsdk-fbsvc-22e5bb0472.json');

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();

const beacons = [
  {
    id: '210',
    data: {
      uuid: 'FDA50693-A4E2-4FB1-AFCF-C6EB07647825',
      major: 10835,
      minor: 210,
      roomId: 'Room210',
      roomName: 'Conference Room',
      svgPosition: { x: 120, y: 80 }
    }
  },
  {
    id: '201',
    data: {
      uuid: 'FDA50693-A4E2-4FB1-AFCF-C6EB07647825',
      major: 10835,
      minor: 201,
      roomId: 'Room201',
      roomName: 'Main Office',
      svgPosition: { x: 60, y: 150 }
    }
  },
  {
    id: '206',
    data: {
      uuid: 'FDA50693-A4E2-4FB1-AFCF-C6EB07647825',
      major: 10835,
      minor: 206,
      roomId: 'Room206',
      roomName: 'Lab',
      svgPosition: { x: 200, y: 200 }
    }
  }
];

async function uploadBeacons() {
  for (const beacon of beacons) {
    await db.collection('beacons').doc(beacon.id).set(beacon.data);
    console.log(`Uploaded beacon ${beacon.id}`);
  }
  process.exit(0);
}

uploadBeacons();