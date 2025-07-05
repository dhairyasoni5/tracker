class KalmanRSSIFilter {
  constructor(processVariance = 1e-3, measurementVariance = 0.1) {
    // Kalman filter parameters
    this.processVariance = processVariance;     // How much we expect RSSI to change between measurements
    this.measurementVariance = measurementVariance; // How noisy our RSSI measurements are
    
    // Filter state
    this.positionEstimate = null;  // Current RSSI estimate
    this.velocityEstimate = 0;     // Rate of RSSI change
    this.errorCovariance = 1;      // Uncertainty in our estimate
    
    this.initialized = false;
  }
  
  // Process a new RSSI measurement
  update(measurement) {
    if (!this.initialized) {
      // Initialize filter with first measurement
      this.positionEstimate = measurement;
      this.velocityEstimate = 0;
      this.errorCovariance = 1;
      this.initialized = true;
      return measurement;
    }
    
    // Prediction step
    const predictedPosition = this.positionEstimate + this.velocityEstimate;
    const predictedErrorCovariance = this.errorCovariance + this.processVariance;
    
    // Update step
    const kalmanGain = predictedErrorCovariance / (predictedErrorCovariance + this.measurementVariance);
    
    this.positionEstimate = predictedPosition + kalmanGain * (measurement - predictedPosition);
    this.velocityEstimate = (1 - kalmanGain) * this.velocityEstimate;
    this.errorCovariance = (1 - kalmanGain) * predictedErrorCovariance;
    
    return this.positionEstimate;
  }
  
  // Get current filtered value
  getCurrentEstimate() {
    return this.positionEstimate;
  }
  
  // Get confidence in current estimate
  getConfidence() {
    if (!this.initialized) return 0;
    
    // Lower error covariance = higher confidence
    return Math.max(0, 1 - this.errorCovariance);
  }
  
  // Reset filter
  reset() {
    this.positionEstimate = null;
    this.velocityEstimate = 0;
    this.errorCovariance = 1;
    this.initialized = false;
  }
}

class KalmanRoomDetector {
  constructor() {
    // Maintain a Kalman filter for each beacon
    this.beaconFilters = new Map();
    this.beaconRooms = new Map();
    
    // Room detection parameters
    this.minRssi = -85;
    this.hysteresisMargin = 5;
    this.confirmationScans = 3;
    
    // Current state
    this.currentRoom = null;
    this.pendingRoom = null;
    this.pendingConfirmations = 0;
    
    // Configure beacon-to-room mapping
    this.setupBeaconRoomMapping();
  }
  
  setupBeaconRoomMapping() {
    // Configure your beacon-to-room mapping
    this.beaconRooms.set(1001, 'room-101');
    this.beaconRooms.set(1002, 'room-102');
    this.beaconRooms.set(1003, 'room-103');
    // ... add all your beacons
  }
  
  // Process scan results with Kalman filtering
  processScanResults(scanResults) {
    const filteredBeacons = [];
    
    // Apply Kalman filtering to each beacon
    scanResults.forEach(beacon => {
      const minor = beacon.minor;
      
      // Initialize filter for new beacons
      if (!this.beaconFilters.has(minor)) {
        this.beaconFilters.set(minor, new KalmanRSSIFilter());
      }
      
      // Get filtered RSSI
      const filter = this.beaconFilters.get(minor);
      const filteredRSSI = filter.update(beacon.rssi);
      
      // Only consider beacons above threshold
      if (filteredRSSI >= this.minRssi) {
        filteredBeacons.push({
          minor,
          originalRssi: beacon.rssi,
          filteredRssi: filteredRSSI,
          confidence: filter.getConfidence(),
          roomId: this.beaconRooms.get(minor)
        });
      }
    });
    
    // Find strongest filtered beacon
    if (filteredBeacons.length === 0) {
      return {
        currentRoom: this.currentRoom,
        filteredBeacons: [],
        decision: 'no-beacons-detected'
      };
    }
    
    // Sort by filtered RSSI
    filteredBeacons.sort((a, b) => b.filteredRssi - a.filteredRssi);
    const strongestBeacon = filteredBeacons[0];
    
    // Apply room switching logic
    const decision = this.applyRoomSwitchingLogic(strongestBeacon);
    
    return {
      currentRoom: this.currentRoom,
      candidateRoom: strongestBeacon.roomId,
      strongestBeacon,
      filteredBeacons,
      decision,
      debug: {
        pendingRoom: this.pendingRoom,
        pendingConfirmations: this.pendingConfirmations
      }
    };
  }
  
  applyRoomSwitchingLogic(strongestBeacon) {
    const candidateRoom = strongestBeacon.roomId;
    
    // If no current room, accept strongest
    if (!this.currentRoom) {
      this.currentRoom = candidateRoom;
      return 'initial-room-set';
    }
    
    // If same room, reset pending
    if (candidateRoom === this.currentRoom) {
      this.pendingRoom = null;
      this.pendingConfirmations = 0;
      return 'staying-in-current-room';
    }
    
    // Check if candidate is significantly stronger
    const currentRoomRssi = this.getCurrentRoomRssi();
    if (currentRoomRssi !== null && 
        strongestBeacon.filteredRssi - currentRoomRssi < this.hysteresisMargin) {
      return 'candidate-not-strong-enough';
    }
    
    // Handle confirmation logic
    if (this.pendingRoom === candidateRoom) {
      this.pendingConfirmations++;
      
      if (this.pendingConfirmations >= this.confirmationScans) {
        // Confirmed room change
        this.currentRoom = candidateRoom;
        this.pendingRoom = null;
        this.pendingConfirmations = 0;
        return 'room-changed';
      }
      
      return 'confirming-room-change';
    } else {
      // New candidate
      this.pendingRoom = candidateRoom;
      this.pendingConfirmations = 1;
      return 'new-room-candidate';
    }
  }
  
  getCurrentRoomRssi() {
    if (!this.currentRoom) return null;
    
    // Find strongest beacon in current room
    let strongestRssi = null;
    
    for (const [minor, filter] of this.beaconFilters) {
      const roomId = this.beaconRooms.get(minor);
      if (roomId === this.currentRoom) {
        const rssi = filter.getCurrentEstimate();
        if (rssi !== null && (strongestRssi === null || rssi > strongestRssi)) {
          strongestRssi = rssi;
        }
      }
    }
    
    return strongestRssi;
  }
  
  // Clean up old filters for beacons we haven't seen
  cleanupOldFilters(activeBeacons) {
    const activeMinors = new Set(activeBeacons.map(b => b.minor));
    
    for (const minor of this.beaconFilters.keys()) {
      if (!activeMinors.has(minor)) {
        this.beaconFilters.delete(minor);
      }
    }
  }
  
  // Get debug information
  getDebugInfo() {
    const filterStates = {};
    
    for (const [minor, filter] of this.beaconFilters) {
      filterStates[minor] = {
        currentEstimate: filter.getCurrentEstimate(),
        confidence: filter.getConfidence(),
        roomId: this.beaconRooms.get(minor)
      };
    }
    
    return {
      currentRoom: this.currentRoom,
      pendingRoom: this.pendingRoom,
      pendingConfirmations: this.pendingConfirmations,
      activeFilters: Object.keys(filterStates).length,
      filterStates
    };
  }
}

// Usage example
const roomDetector = new KalmanRoomDetector();

// Process scan results
const scanResults = [
  { minor: 1001, rssi: -65 },
  { minor: 1002, rssi: -72 },
  { minor: 1003, rssi: -78 }
];

const result = roomDetector.processScanResults(scanResults);
console.log('Room Detection Result:', result);
