class RobustRoomDetector {
  constructor(config = {}) {
    // Configuration with sensible defaults
    this.config = {
      // RSSI thresholds
      MIN_RSSI_THRESHOLD: config.minRssi || -85,           // Ignore very weak signals
      HYSTERESIS_MARGIN: config.hysteresisMargin || 8,      // dB difference needed to switch
      STRONG_SIGNAL_THRESHOLD: config.strongSignal || -60,  // Consider this a "strong" signal
      
      // Temporal stability
      CONFIRMATION_SCANS: config.confirmationScans || 3,    // Scans needed to confirm change
      BEACON_TIMEOUT: config.beaconTimeout || 30000,        // 30s to remove stale beacons
      SMOOTHING_WINDOW: config.smoothingWindow || 5,        // Moving average window
      
      // Switching logic
      MIN_DWELL_TIME: config.minDwellTime || 15000,         // 15s minimum in room
      CONFIDENCE_THRESHOLD: config.confidenceThreshold || 0.7, // Confidence needed for switch
      
      // Scanning
      SCAN_INTERVAL: config.scanInterval || 10000,          // 10s between scans
      SCAN_DURATION: config.scanDuration || 10000,          // 10s scan duration
    };
    
    // State management
    this.beacons = new Map();           // beacon data with history
    this.currentRoom = null;            // current confirmed room
    this.pendingRoom = null;            // room being considered
    this.pendingConfirmations = 0;      // confirmations for pending room
    this.lastRoomChangeTime = 0;        // timestamp of last room change
    this.scanHistory = [];              // history of scan results
    
    // Beacon metadata (you'd populate this from your backend)
    this.beaconMap = new Map();         // minor -> { roomId, position, range }
  }
  
  // Register beacon metadata
  registerBeacon(minor, roomId, position = null, range = 50) {
    this.beaconMap.set(minor, {
      roomId,
      position,    // {x, y} coordinates if available
      range,       // expected range in meters
      minor
    });
  }
  
  // Main method: process scan results
  processScanResults(scanResults) {
    const timestamp = Date.now();
    
    // Update beacon data with new scan results
    this.updateBeaconData(scanResults, timestamp);
    
    // Remove stale beacons
    this.pruneStaleBeacons(timestamp);
    
    // Calculate smoothed RSSI values
    this.calculateSmoothedRSSI();
    
    // Determine best room candidate
    const bestCandidate = this.determineBestRoomCandidate();
    
    // Apply switching logic
    const roomDecision = this.applyRoomSwitchingLogic(bestCandidate, timestamp);
    
    // Update room state
    if (roomDecision) {
      this.updateRoomState(roomDecision, timestamp);
    }
    
    return {
      currentRoom: this.currentRoom,
      confidence: this.calculateConfidence(),
      candidateRoom: bestCandidate?.roomId,
      activeBeacons: this.getActiveBeacons(),
      debug: this.getDebugInfo()
    };
  }
  
  updateBeaconData(scanResults, timestamp) {
    // Process each scanned beacon
    scanResults.forEach(beacon => {
      const { minor, rssi } = beacon;
      
      if (!this.beaconMap.has(minor)) {
        console.warn(`Unknown beacon minor: ${minor}`);
        return;
      }
      
      // Initialize beacon data if new
      if (!this.beacons.has(minor)) {
        this.beacons.set(minor, {
          minor,
          rssiHistory: [],
          lastSeen: timestamp,
          smoothedRSSI: rssi,
          detectionCount: 0,
          roomId: this.beaconMap.get(minor).roomId
        });
      }
      
      const beaconData = this.beacons.get(minor);
      
      // Update RSSI history (keep last N values for smoothing)
      beaconData.rssiHistory.push({ rssi, timestamp });
      if (beaconData.rssiHistory.length > this.config.SMOOTHING_WINDOW) {
        beaconData.rssiHistory.shift();
      }
      
      beaconData.lastSeen = timestamp;
      beaconData.detectionCount++;
    });
  }
  
  pruneStaleBeacons(timestamp) {
    for (const [minor, beaconData] of this.beacons) {
      if (timestamp - beaconData.lastSeen > this.config.BEACON_TIMEOUT) {
        this.beacons.delete(minor);
      }
    }
  }
  
  calculateSmoothedRSSI() {
    for (const [minor, beaconData] of this.beacons) {
      if (beaconData.rssiHistory.length > 0) {
        // Calculate weighted moving average (recent values weighted more)
        let weightedSum = 0;
        let totalWeight = 0;
        
        beaconData.rssiHistory.forEach((reading, index) => {
          const weight = index + 1; // Linear weighting favoring recent readings
          weightedSum += reading.rssi * weight;
          totalWeight += weight;
        });
        
        beaconData.smoothedRSSI = weightedSum / totalWeight;
      }
    }
  }
  
  determineBestRoomCandidate() {
    const validBeacons = Array.from(this.beacons.values())
      .filter(beacon => beacon.smoothedRSSI >= this.config.MIN_RSSI_THRESHOLD)
      .sort((a, b) => b.smoothedRSSI - a.smoothedRSSI);
    
    if (validBeacons.length === 0) {
      return null;
    }
    
    // Group beacons by room
    const roomSignals = new Map();
    validBeacons.forEach(beacon => {
      const roomId = beacon.roomId;
      if (!roomSignals.has(roomId)) {
        roomSignals.set(roomId, []);
      }
      roomSignals.get(roomId).push(beacon);
    });
    
    // Calculate room scores
    const roomScores = new Map();
    for (const [roomId, beacons] of roomSignals) {
      const score = this.calculateRoomScore(beacons);
      roomScores.set(roomId, { roomId, score, beacons });
    }
    
    // Get best room
    const bestRoom = Array.from(roomScores.values())
      .sort((a, b) => b.score - a.score)[0];
    
    return bestRoom;
  }
  
  calculateRoomScore(beacons) {
    // Multi-factor scoring
    const strongestRSSI = Math.max(...beacons.map(b => b.smoothedRSSI));
    const beaconCount = beacons.length;
    const consistency = this.calculateConsistency(beacons);
    
    // Weighted score combining factors
    const rssiScore = Math.max(0, (strongestRSSI + 100) / 100); // Normalize RSSI
    const countBonus = Math.min(beaconCount * 0.1, 0.3); // Bonus for multiple beacons
    const consistencyBonus = consistency * 0.2;
    
    return rssiScore + countBonus + consistencyBonus;
  }
  
  calculateConsistency(beacons) {
    // Measure how consistent the RSSI readings are
    const rssiValues = beacons.flatMap(b => b.rssiHistory.map(h => h.rssi));
    if (rssiValues.length < 2) return 0;
    
    const mean = rssiValues.reduce((a, b) => a + b, 0) / rssiValues.length;
    const variance = rssiValues.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / rssiValues.length;
    const stdDev = Math.sqrt(variance);
    
    // Convert to consistency score (lower std dev = higher consistency)
    return Math.max(0, 1 - (stdDev / 20)); // Normalize assuming max std dev of 20
  }
  
  applyRoomSwitchingLogic(bestCandidate, timestamp) {
    if (!bestCandidate) {
      // No valid beacons detected
      if (this.currentRoom) {
        console.log('No beacons detected, keeping current room');
      }
      return null;
    }
    
    const candidateRoom = bestCandidate.roomId;
    
    // If no current room, accept the best candidate
    if (!this.currentRoom) {
      console.log(`Setting initial room: ${candidateRoom}`);
      return candidateRoom;
    }
    
    // If candidate is same as current room, reset pending state
    if (candidateRoom === this.currentRoom) {
      this.pendingRoom = null;
      this.pendingConfirmations = 0;
      return null;
    }
    
    // Check minimum dwell time
    if (timestamp - this.lastRoomChangeTime < this.config.MIN_DWELL_TIME) {
      console.log('Within minimum dwell time, ignoring room change');
      return null;
    }
    
    // Apply hysteresis - candidate must be significantly better
    const currentRoomScore = this.getCurrentRoomScore();
    const candidateScore = bestCandidate.score;
    
    if (candidateScore - currentRoomScore < this.config.HYSTERESIS_MARGIN / 100) {
      console.log('Candidate not significantly better, staying in current room');
      return null;
    }
    
    // Handle pending room confirmation
    if (this.pendingRoom === candidateRoom) {
      this.pendingConfirmations++;
      console.log(`Confirming room ${candidateRoom}: ${this.pendingConfirmations}/${this.config.CONFIRMATION_SCANS}`);
      
      if (this.pendingConfirmations >= this.config.CONFIRMATION_SCANS) {
        console.log(`Room change confirmed: ${this.currentRoom} -> ${candidateRoom}`);
        return candidateRoom;
      }
    } else {
      // New candidate, start confirmation process
      this.pendingRoom = candidateRoom;
      this.pendingConfirmations = 1;
      console.log(`Starting room change confirmation for: ${candidateRoom}`);
    }
    
    return null;
  }
  
  getCurrentRoomScore() {
    if (!this.currentRoom) return 0;
    
    const currentRoomBeacons = Array.from(this.beacons.values())
      .filter(beacon => beacon.roomId === this.currentRoom);
    
    if (currentRoomBeacons.length === 0) return 0;
    
    return this.calculateRoomScore(currentRoomBeacons);
  }
  
  updateRoomState(newRoom, timestamp) {
    const previousRoom = this.currentRoom;
    this.currentRoom = newRoom;
    this.lastRoomChangeTime = timestamp;
    this.pendingRoom = null;
    this.pendingConfirmations = 0;
    
    // Trigger room change callback
    this.onRoomChange(newRoom, previousRoom);
  }
  
  calculateConfidence() {
    if (!this.currentRoom) return 0;
    
    const currentRoomBeacons = Array.from(this.beacons.values())
      .filter(beacon => beacon.roomId === this.currentRoom);
    
    if (currentRoomBeacons.length === 0) return 0;
    
    const avgRSSI = currentRoomBeacons.reduce((sum, b) => sum + b.smoothedRSSI, 0) / currentRoomBeacons.length;
    const confidence = Math.max(0, Math.min(1, (avgRSSI + 100) / 40)); // Normalize to 0-1
    
    return confidence;
  }
  
  getActiveBeacons() {
    return Array.from(this.beacons.entries()).map(([minor, data]) => ({
      minor,
      roomId: data.roomId,
      rssi: data.smoothedRSSI,
      lastSeen: data.lastSeen,
      detectionCount: data.detectionCount
    }));
  }
  
  getDebugInfo() {
    return {
      currentRoom: this.currentRoom,
      pendingRoom: this.pendingRoom,
      pendingConfirmations: this.pendingConfirmations,
      lastRoomChangeTime: this.lastRoomChangeTime,
      activeBeaconCount: this.beacons.size,
      config: this.config
    };
  }
  
  // Override this method to handle room changes
  onRoomChange(newRoom, previousRoom) {
    console.log(`Room changed: ${previousRoom} -> ${newRoom}`);
    // Here you would update Firestore
    // this.updateFirestore(newRoom);
  }
  
  // Method to update Firestore (implement based on your setup)
  async updateFirestore(roomId) {
    try {
      // Your Firestore update logic here
      console.log(`Updating Firestore with room: ${roomId}`);
    } catch (error) {
      console.error('Failed to update Firestore:', error);
    }
  }
}

// Usage example
export default class RoomTrackingManager {
  constructor() {
    this.roomDetector = new RobustRoomDetector({
      minRssi: -80,
      hysteresisMargin: 6,
      confirmationScans: 3,
      minDwellTime: 20000, // 20 seconds
    });
    
    // Register your beacons
    this.setupBeacons();
  }
  
  setupBeacons() {
    // Register beacons with their room mappings
    this.roomDetector.registerBeacon(1001, 'room-101', { x: 0, y: 0 }, 30);
    this.roomDetector.registerBeacon(1002, 'room-102', { x: 10, y: 0 }, 30);
    this.roomDetector.registerBeacon(1003, 'room-103', { x: 0, y: 10 }, 30);
    // ... register all your beacons
  }
  
  // Process scan results from react-native-ble-plx
  processScanResults(scanResults) {
    // Transform your scan results to the expected format
    const formattedResults = scanResults.map(device => ({
      minor: this.extractMinor(device), // Extract minor from your beacon data
      rssi: device.rssi,
      // ... other properties
    }));
    
    return this.roomDetector.processScanResults(formattedResults);
  }
  
  extractMinor(device) {
    // Implement based on how you identify beacons
    // This depends on your beacon configuration
    return device.manufacturerData || device.serviceData; // Example
  }
}
