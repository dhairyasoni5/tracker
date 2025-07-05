class TrilaterationRoomDetector {
  constructor() {
    // Beacon positions (you'd configure these for your space)
    this.beaconPositions = new Map([
      [1001, { x: 0, y: 0, roomId: 'room-101' }],
      [1002, { x: 10, y: 0, roomId: 'room-102' }],
      [1003, { x: 0, y: 10, roomId: 'room-103' }],
      [1004, { x: 10, y: 10, roomId: 'room-104' }]
    ]);
    
    // Room boundaries (rectangles for simplicity)
    this.roomBoundaries = new Map([
      ['room-101', { x1: -5, y1: -5, x2: 5, y2: 5 }],
      ['room-102', { x1: 5, y1: -5, x2: 15, y2: 5 }],
      ['room-103', { x1: -5, y1: 5, x2: 5, y2: 15 }],
      ['room-104', { x1: 5, y1: 5, x2: 15, y2: 15 }]
    ]);
  }
  
  // Convert RSSI to distance estimate
  rssiToDistance(rssi, txPower = -59) {
    // Simple path loss model: RSSI = TxPower - 20*log10(distance) - environmentalFactor
    // Rearranged: distance = 10^((TxPower - RSSI - environmentalFactor) / 20)
    
    const environmentalFactor = 2; // Adjust based on your environment
    const distance = Math.pow(10, (txPower - rssi - environmentalFactor) / 20);
    
    return Math.max(0.1, distance); // Minimum distance to avoid division by zero
  }
  
  // Trilateration calculation
  calculatePosition(beaconDistances) {
    // Need at least 3 beacons for trilateration
    if (beaconDistances.length < 3) {
      return null;
    }
    
    // Use first 3 beacons for basic trilateration
    const [beacon1, beacon2, beacon3] = beaconDistances.slice(0, 3);
    
    const pos1 = this.beaconPositions.get(beacon1.minor);
    const pos2 = this.beaconPositions.get(beacon2.minor);
    const pos3 = this.beaconPositions.get(beacon3.minor);
    
    if (!pos1 || !pos2 || !pos3) {
      return null;
    }
    
    // Solve trilateration equations
    const position = this.solveTrilateration(
      pos1, beacon1.distance,
      pos2, beacon2.distance,
      pos3, beacon3.distance
    );
    
    return position;
  }
  
  solveTrilateration(p1, r1, p2, r2, p3, r3) {
    // Trilateration math - solving system of circle equations
    const A = 2 * (p2.x - p1.x);
    const B = 2 * (p2.y - p1.y);
    const C = Math.pow(r1, 2) - Math.pow(r2, 2) - Math.pow(p1.x, 2) + Math.pow(p2.x, 2) - Math.pow(p1.y, 2) + Math.pow(p2.y, 2);
    const D = 2 * (p3.x - p2.x);
    const E = 2 * (p3.y - p2.y);
    const F = Math.pow(r2, 2) - Math.pow(r3, 2) - Math.pow(p2.x, 2) + Math.pow(p3.x, 2) - Math.pow(p2.y, 2) + Math.pow(p3.y, 2);
    
    const denominator = A * E - B * D;
    if (Math.abs(denominator) < 0.0001) {
      return null; // Beacons are collinear
    }
    
    const x = (C * E - F * B) / denominator;
    const y = (A * F - D * C) / denominator;
    
    return { x, y };
  }
  
  // Determine room from position
  getRoomFromPosition(position) {
    for (const [roomId, bounds] of this.roomBoundaries) {
      if (position.x >= bounds.x1 && position.x <= bounds.x2 &&
          position.y >= bounds.y1 && position.y <= bounds.y2) {
        return roomId;
      }
    }
    return null;
  }
  
  // Main processing method
  processBeacons(scanResults) {
    // Convert RSSI to distances
    const beaconDistances = scanResults.map(beacon => ({
      minor: beacon.minor,
      distance: this.rssiToDistance(beacon.rssi),
      rssi: beacon.rssi
    }));
    
    // Calculate position
    const position = this.calculatePosition(beaconDistances);
    
    if (!position) {
      return { room: null, position: null, confidence: 0 };
    }
    
    // Determine room
    const room = this.getRoomFromPosition(position);
    
    // Calculate confidence based on geometry
    const confidence = this.calculateConfidence(beaconDistances, position);
    
    return {
      room,
      position,
      confidence,
      beaconDistances,
      debug: {
        calculatedPosition: position,
        usedBeacons: beaconDistances.length
      }
    };
  }
  
  calculateConfidence(beaconDistances, calculatedPosition) {
    // Confidence based on how well the calculated position matches expected distances
    let totalError = 0;
    let validBeacons = 0;
    
    beaconDistances.forEach(beacon => {
      const beaconPos = this.beaconPositions.get(beacon.minor);
      if (beaconPos) {
        const expectedDistance = Math.sqrt(
          Math.pow(calculatedPosition.x - beaconPos.x, 2) +
          Math.pow(calculatedPosition.y - beaconPos.y, 2)
        );
        
        const error = Math.abs(expectedDistance - beacon.distance);
        totalError += error;
        validBeacons++;
      }
    });
    
    if (validBeacons === 0) return 0;
    
    const avgError = totalError / validBeacons;
    // Convert error to confidence (lower error = higher confidence)
    return Math.max(0, 1 - (avgError / 10)); // Normalize assuming max error of 10m
  }
}
