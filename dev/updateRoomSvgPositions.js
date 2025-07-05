const admin = require('firebase-admin');
const serviceAccount = require('./serviceAccountkey.json');

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});
const db = admin.firestore();

const DEFAULT_ROOM_ID = 'room03';

// Paste ROOM_DOT_POSITIONS here for Node.js compatibility
const ROOM_DOT_POSITIONS = {
  room01: { x: 157.5, y: 59 },
  room02: { x: 303.5, y: 59 },
  room03: { x: 439, y: 109 },
  room04: { x: 585, y: 59 },
  room05: { x: 106, y: 154 },
  room06: { x: 189, y: 153.5 },
  room07: { x: 80, y: 260 },
  room08: { x: 272.5, y: 277.25 },
  room09: { x: 260, y: 177 },
  room10: { x: 260, y: 235.5 },
  room11: { x: 293, y: 186 },
  room12: { x: 354, y: 183.25 },
  room13: { x: 521, y: 183.5 },
  room14: { x: 399, y: 252 },
  room15: { x: 501, y: 248 },
  room16: { x: 619.75, y: 193.5 },
  room17: { x: 660.25, y: 193.5 },
  room18: { x: 610, y: 284.75 },
  room19: { x: 708, y: 284.75 },
  room20: { x: 345.5, y: 291.25 },
  room21: { x: 438.25, y: 295.75 },
  room22: { x: 531, y: 295.75 },
  room23: { x: 335.5, y: 142.25 },
  room24: { x: 366.25, y: 142.25 },
  room25: { x: 511.25, y: 142.25 },
  room26: { x: 553, y: 142.25 },
  room27: { x: 568, y: 183.5 },
  room28: { x: 729, y: 131.75 },
  room29: { x: 562.25, y: 248 },
};

async function updateAllStudents() {
  const studentsRef = db.collection('users');
  const snapshot = await studentsRef.get();
  let updated = 0;
  let skipped = 0;
  for (const doc of snapshot.docs) {
    const data = doc.data();
    // Only update for students
    const role = (data.role || '').toLowerCase();
    if (role !== 'user' && role !== 'student') continue;
    let roomIdRaw = data.currentRoomId || '';
    if (!roomIdRaw) {
      roomIdRaw = DEFAULT_ROOM_ID;
      await doc.ref.update({ currentRoomId: DEFAULT_ROOM_ID });
      console.log(`Set default roomId for ${doc.id} (${data.fullName || data.email}) to '${DEFAULT_ROOM_ID}'`);
    }
    const roomId = roomIdRaw.toLowerCase();
    const svgPos = ROOM_DOT_POSITIONS[roomId];
    if (!svgPos) {
      console.log(`Skipped ${doc.id} (${data.fullName || data.email}): unmatched roomId '${roomIdRaw}'`);
      skipped++;
      continue;
    }
    if (!data.svgPosition || data.svgPosition.x !== svgPos.x || data.svgPosition.y !== svgPos.y) {
      await doc.ref.update({ svgPosition: svgPos });
      console.log(`Updated ${doc.id} (${data.fullName || data.email}) to svgPosition`, svgPos);
      updated++;
    }
  }
  console.log(`Done. Updated ${updated} students. Skipped ${skipped} students due to unmatched roomId.`);
}

async function setTestRoomHistory() {
  const uid = 'yygpCpeiVte5CT2k268x3d0VWih2';
  const userRef = db.collection('users').doc(uid);
  const now = new Date();
  const roomHistory = [
    {
      roomId: 'room03',
      roomName: 'Main Office',
      svgPosition: ROOM_DOT_POSITIONS['room03'],
      timestamp: now.toISOString(),
    },
    {
      roomId: 'room02',
      roomName: 'Library',
      svgPosition: ROOM_DOT_POSITIONS['room02'],
      timestamp: new Date(now.getTime() - 5 * 60000).toISOString(),
    },
    {
      roomId: 'room01',
      roomName: 'Lab',
      svgPosition: ROOM_DOT_POSITIONS['room01'],
      timestamp: new Date(now.getTime() - 10 * 60000).toISOString(),
    },
  ];
  await userRef.update({
    currentRoomId: 'room03',
    currentRoomName: 'Main Office',
    svgPosition: ROOM_DOT_POSITIONS['room03'],
    lastRoomUpdate: now.toISOString(),
    roomHistory,
  });
  console.log('Test roomHistory set for student:', uid);
}

updateAllStudents().then(() => process.exit(0));
setTestRoomHistory().catch(console.error); 