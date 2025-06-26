// src/utils/IndoorPositioning.js
import { KalmanFilter } from './KalmanFilter';

class IndoorPositioningEngine {
  constructor(floorPlan, beaconConfig) {
    this.floorPlan = floorPlan;
    this.beaconConfig = beaconConfig;
    this.kalmanFilter = new KalmanFilter();
    this.fingerprintDatabase = new Map();
    this.lastPosition = null;
    this.positionHistory = [];
    this.maxHistorySize = 10;
    this.debugMode = false;
  }

  // Main positioning method - combines multiple techniques
  calculatePosition(beaconReadings) {
    if (!beaconReadings || beaconReadings.length === 0) {
      return null;
    }

    // Filter and validate beacon readings
    const validReadings = this.filterValidReadings(beaconReadings);
    if (validReadings.length === 0) {
      return null;
    }

    let position = null;
    let method = 'unknown';
    let confidence = 0;

    try {
      // Try trilateration first (requires at least 3 beacons)
      if (validReadings.length >= 3) {
        const trilaterationResult = this.calculateTrilateration(validReadings);
        if (trilaterationResult && trilaterationResult.confidence > 0.6) {
          position = trilaterationResult.position;
          method = 'trilateration';
          confidence = trilaterationResult.confidence;
        }
      }

      // Fall back to weighted centroid (requires at least 2 beacons)
      if (!position && validReadings.length >= 2) {
        const centroidResult = this.calculateWeightedCentroid(validReadings);
        if (centroidResult) {
          position = centroidResult.position;
          method = 'weighted_centroid';
          confidence = centroidResult.confidence;
        }
      }

      // Fall back to closest beacon
      if (!position && validReadings.length >= 1) {
        const closestResult = this.calculateClosestBeacon(validReadings);
        if (closestResult) {
          position = closestResult.position;
          method = 'closest_beacon';
          confidence = closestResult.confidence;
        }
      }

      if (position) {
        // Apply Kalman filtering for smooth positioning
        const filteredPosition = this.applyKalmanFilter(position);
        
        // Detect floor level
        const floor = this.detectFloorLevel(validReadings);
        
        // Calculate accuracy estimate
        const accuracy = this.estimateAccuracy(validReadings, filteredPosition);
        
        // Create result object
        const result = {
          position: filteredPosition,
          floor,
          accuracy,
          confidence,
          method,
          beaconCount: validReadings.length,
          timestamp: Date.now(),
          beaconReadings: validReadings.map(r => ({
            id: r.id,
            rssi: r.rssi,
            distance: r.distance
          }))
        };

        // Update position history
        this.updatePositionHistory(result);
        this.lastPosition = result;

        return result;
      }
    } catch (error) {
      console.error('Error calculating position:', error);
    }

    return null;
  }

  // Filter and validate beacon readings
  filterValidReadings(beaconReadings) {
    return beaconReadings
      .filter(reading => {
        // Check if beacon exists in configuration
        const beaconConfig = this.getBeaconConfig(reading);
        if (!beaconConfig) return false;

        // Filter by signal strength (too weak signals are unreliable)
        if (reading.rssi < -100) return false;

        // Filter by distance (too far readings are unreliable)
        if (reading.distance && reading.distance > 50) return false;

        return true;
      })
      .map(reading => ({
        ...reading,
        config: this.getBeaconConfig(reading)
      }));
  }

  // Get beacon configuration
  getBeaconConfig(reading) {
    if (!this.beaconConfig || !this.beaconConfig.beacons) return null;

    return this.beaconConfig.beacons.find(beacon => {
      if (reading.type === 'iBeacon') {
        return beacon.uuid === reading.uuid &&
               beacon.major === reading.major &&
               beacon.minor === reading.minor;
      }
      return beacon.id === reading.deviceId;
    });
  }

  // Trilateration positioning algorithm
  calculateTrilateration(beaconReadings) {
    if (beaconReadings.length < 3) return null;

    try {
      // Select the 3 strongest beacons
      const sortedBeacons = beaconReadings
        .sort((a, b) => b.rssi - a.rssi)
        .slice(0, 3);

      const [beacon1, beacon2, beacon3] = sortedBeacons;

      // Get beacon positions
      const p1 = beacon1.config.position;
      const p2 = beacon2.config.position;
      const p3 = beacon3.config.position;

      // Get distances
      const r1 = beacon1.distance || this.rssiToDistance(beacon1.rssi);
      const r2 = beacon2.distance || this.rssiToDistance(beacon2.rssi);
      const r3 = beacon3.distance || this.rssiToDistance(beacon3.rssi);

      // Trilateration calculation
      const A = 2 * (p2.x - p1.x);
      const B = 2 * (p2.y - p1.y);
      const C = Math.pow(r1, 2) - Math.pow(r2, 2) - Math.pow(p1.x, 2) + Math.pow(p2.x, 2) - Math.pow(p1.y, 2) + Math.pow(p2.y, 2);
      const D = 2 * (p3.x - p2.x);
      const E = 2 * (p3.y - p2.y);
      const F = Math.pow(r2, 2) - Math.pow(r3, 2) - Math.pow(p2.x, 2) + Math.pow(p3.x, 2) - Math.pow(p2.y, 2) + Math.pow(p3.y, 2);

      const denominator = A * E - B * D;
      if (Math.abs(denominator) < 0.0001) {
        // Beacons are collinear, trilateration not possible
        return null;
      }

      const x = (C * E - F * B) / denominator;
      const y = (A * F - D * C) / denominator;

      // Calculate confidence based on geometric dilution of precision
      const confidence = this.calculateTrilaterationConfidence(sortedBeacons, { x, y });

      return {
        position: { x, y },
        confidence: Math.max(0, Math.min(1, confidence))
      };
    } catch (error) {
      console.error('Trilateration calculation error:', error);
      return null;
    }
  }

  // Calculate trilateration confidence
  calculateTrilaterationConfidence(beacons, position) {
    try {
      // Calculate predicted distances vs actual distances
      let totalError = 0;
      for (const beacon of beacons) {
        const predictedDistance = Math.sqrt(
          Math.pow(position.x - beacon.config.position.x, 2) +
          Math.pow(position.y - beacon.config.position.y, 2)
        );
        const actualDistance = beacon.distance || this.rssiToDistance(beacon.rssi);
        totalError += Math.abs(predictedDistance - actualDistance);
      }

      const averageError = totalError / beacons.length;
      const confidence = Math.max(0, 1 - (averageError / 10)); // Normalize to 0-1

      return confidence;
    } catch (error) {
      return 0.5; // Default confidence
    }
  }

  // Weighted centroid positioning
  calculateWeightedCentroid(beaconReadings) {
    try {
      let totalWeight = 0;
      let weightedX = 0;
      let weightedY = 0;

      for (const reading of beaconReadings) {
        const position = reading.config.position;
        const distance = reading.distance || this.rssiToDistance(reading.rssi);
        
        // Weight inversely proportional to distance
        const weight = 1 / (distance + 1);
        
        totalWeight += weight;
        weightedX += position.x * weight;
        weightedY += position.y * weight;
      }

      if (totalWeight === 0) return null;

      const centroid = {
        x: weightedX / totalWeight,
        y: weightedY / totalWeight
      };

      // Calculate confidence based on beacon distribution
      const confidence = this.calculateCentroidConfidence(beaconReadings, centroid);

      return {
        position: centroid,
        confidence: Math.max(0, Math.min(1, confidence))
      };
    } catch (error) {
      console.error('Weighted centroid calculation error:', error);
      return null;
    }
  }

  // Calculate centroid confidence
  calculateCentroidConfidence(beacons, centroid) {
    try {
      // Calculate variance in beacon positions
      let variance = 0;
      for (const beacon of beacons) {
        const dx = beacon.config.position.x - centroid.x;
        const dy = beacon.config.position.y - centroid.y;
        variance += dx * dx + dy * dy;
      }
      variance /= beacons.length;

      // Higher variance means better geometric distribution
      const geometricFactor = Math.min(1, variance / 100);
      
      // Signal strength factor
      const avgRssi = beacons.reduce((sum, b) => sum + b.rssi, 0) / beacons.length;
      const signalFactor = Math.max(0, Math.min(1, (avgRssi + 100) / 50));

      return (geometricFactor + signalFactor) / 2;
    } catch (error) {
      return 0.5;
    }
  }

  // Closest beacon positioning
  calculateClosestBeacon(beaconReadings) {
    try {
      const closest = beaconReadings.reduce((prev, current) => {
        const prevDistance = prev.distance || this.rssiToDistance(prev.rssi);
        const currentDistance = current.distance || this.rssiToDistance(current.rssi);
        return currentDistance < prevDistance ? current : prev;
      });

      return {
        position: closest.config.position,
        confidence: 0.3 // Low confidence for single beacon
      };
    } catch (error) {
      return null;
    }
  }

  // Apply Kalman filter for smooth positioning
  applyKalmanFilter(position) {
    if (!this.lastPosition) {
      this.kalmanFilter.initialize(position.x, position.y);
      return position;
    }

    // Predict next position based on movement
    const dt = 1.0; // Time step
    const velocity = this.estimateVelocity();
    
    this.kalmanFilter.predict(velocity.vx, velocity.vy, dt);
    
    // Update with measurement
    const filtered = this.kalmanFilter.update(position.x, position.y);
    
    return {
      x: filtered.x,
      y: filtered.y
    };
  }

  // Estimate velocity from position history
  estimateVelocity() {
    if (this.positionHistory.length < 2) {
      return { vx: 0, vy: 0 };
    }

    const recent = this.positionHistory.slice(-2);
    const dt = (recent[1].timestamp - recent[0].timestamp) / 1000; // Convert to seconds
    
    if (dt === 0) return { vx: 0, vy: 0 };

    const vx = (recent[1].position.x - recent[0].position.x) / dt;
    const vy = (recent[1].position.y - recent[0].position.y) / dt;

    return { vx, vy };
  }

  // Detect floor level from beacon readings
  detectFloorLevel(beaconReadings) {
    const floorCounts = {};
    
    for (const reading of beaconReadings) {
      const floor = reading.config.floor || 1;
      floorCounts[floor] = (floorCounts[floor] || 0) + 1;
    }

    // Return floor with most beacons
    let maxCount = 0;
    let detectedFloor = 1;
    
    for (const [floor, count] of Object.entries(floorCounts)) {
      if (count > maxCount) {
        maxCount = count;
        detectedFloor = parseInt(floor);
      }
    }

    return detectedFloor;
  }

  // Estimate position accuracy
  estimateAccuracy(beaconReadings, position) {
    if (beaconReadings.length === 0) return 50; // Default high uncertainty

    try {
      let totalError = 0;
      for (const reading of beaconReadings) {
        const beaconPos = reading.config.position;
        const calculatedDistance = Math.sqrt(
          Math.pow(position.x - beaconPos.x, 2) +
          Math.pow(position.y - beaconPos.y, 2)
        );
        const measuredDistance = reading.distance || this.rssiToDistance(reading.rssi);
        totalError += Math.abs(calculatedDistance - measuredDistance);
      }

      const averageError = totalError / beaconReadings.length;
      
      // Convert error to accuracy estimate (meters)
      const baseAccuracy = 2.0; // Base accuracy in meters
      const errorFactor = Math.min(3.0, averageError / 5.0);
      
      return baseAccuracy + errorFactor;
    } catch (error) {
      return 10; // Default moderate uncertainty
    }
  }

  // Convert RSSI to distance estimate
  rssiToDistance(rssi, txPower = -59) {
    if (rssi === 0) return -1;

    const ratio = (txPower - rssi) / 20.0;
    if (ratio < 1.0) {
      return Math.pow(ratio, 10);
    } else {
      const accuracy = (0.89976) * Math.pow(ratio, 7.7095) + 0.111;
      return accuracy;
    }
  }

  // Update position history
  updatePositionHistory(positionResult) {
    this.positionHistory.push(positionResult);
    
    if (this.positionHistory.length > this.maxHistorySize) {
      this.positionHistory.shift();
    }
  }

  // Get position smoothness score
  getPositionSmoothness() {
    if (this.positionHistory.length < 3) return 1.0;

    let totalVariation = 0;
    for (let i = 1; i < this.positionHistory.length - 1; i++) {
      const prev = this.positionHistory[i - 1].position;
      const curr = this.positionHistory[i].position;
      const next = this.positionHistory[i + 1].position;

      const dx1 = curr.x - prev.x;
      const dy1 = curr.y - prev.y;
      const dx2 = next.x - curr.x;
      const dy2 = next.y - curr.y;

      const variation = Math.abs(dx2 - dx1) + Math.abs(dy2 - dy1);
      totalVariation += variation;
    }

    const averageVariation = totalVariation / (this.positionHistory.length - 2);
    return Math.max(0, 1 - (averageVariation / 10));
  }

  // Fingerprinting methods
  addFingerprint(position, beaconReadings) {
    const key = `${Math.round(position.x)}_${Math.round(position.y)}`;
    
    if (!this.fingerprintDatabase.has(key)) {
      this.fingerprintDatabase.set(key, []);
    }
    
    this.fingerprintDatabase.get(key).push({
      timestamp: Date.now(),
      beacons: beaconReadings.map(b => ({
        id: this.getBeaconId(b),
        rssi: b.rssi
      }))
    });
  }

  // Calculate position using fingerprinting
  calculateFingerprinting(currentSignals) {
    if (this.fingerprintDatabase.size === 0) return null;

    let bestMatch = null;
    let bestScore = -1;

    for (const [positionKey, fingerprints] of this.fingerprintDatabase) {
      for (const fingerprint of fingerprints) {
        const score = this.compareSignalFingerprints(currentSignals, fingerprint.beacons);
        if (score > bestScore) {
          bestScore = score;
          const [x, y] = positionKey.split('_').map(Number);
          bestMatch = { x, y };
        }
      }
    }

    if (bestMatch && bestScore > 0.5) {
      return {
        position: bestMatch,
        confidence: bestScore
      };
    }

    return null;
  }

  // Compare signal fingerprints
  compareSignalFingerprints(signals1, signals2) {
    const map1 = new Map(signals1.map(s => [this.getBeaconId(s), s.rssi]));
    const map2 = new Map(signals2.map(s => [s.id, s.rssi]));

    const commonBeacons = [...map1.keys()].filter(id => map2.has(id));
    if (commonBeacons.length === 0) return 0;

    let totalDifference = 0;
    for (const beaconId of commonBeacons) {
      const diff = Math.abs(map1.get(beaconId) - map2.get(beaconId));
      totalDifference += diff;
    }

    const averageDifference = totalDifference / commonBeacons.length;
    const similarity = Math.max(0, 1 - (averageDifference / 50)); // Normalize

    return similarity;
  }

  // Get beacon ID for fingerprinting
  getBeaconId(beacon) {
    if (beacon.type === 'iBeacon') {
      return `${beacon.uuid}-${beacon.major}-${beacon.minor}`;
    }
    return beacon.deviceId || beacon.id;
  }

  // Reset positioning engine
  reset() {
    this.kalmanFilter = new KalmanFilter();
    this.lastPosition = null;
    this.positionHistory = [];
  }

  // Enable/disable debug mode
  setDebugMode(enabled) {
    this.debugMode = enabled;
  }

  // Get debug information
  getDebugInfo() {
    return {
      lastPosition: this.lastPosition,
      positionHistory: this.positionHistory,
      fingerprintCount: this.fingerprintDatabase.size,
      smoothness: this.getPositionSmoothness()
    };
  }
}

export { IndoorPositioningEngine };