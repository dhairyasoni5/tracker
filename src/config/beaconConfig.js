// src/config/beaconConfig.js
 const BEACON_CONFIG = {
  buildings: {
    'building-1': {
      name: 'Main Building',
      floors: {
        1: {
          name: 'Ground Floor',
          svgPath: '/assets/floor-plans/ground-floor.svg',
          dimensions: { width: 784, height: 316 },
          scale: { 
            // Real world dimensions in meters
            realWidth: 50,  // 50 meters wide
            realHeight: 20.2 // 20.2 meters tall (adjusted for 784x316 ratio)
          },
          beacons: [
            {
              id: 'FDA50693-A4E2-4FB1-AFCF-C6EB07647825-10835-205',
              uuid: 'FDA50693-A4E2-4FB1-AFCF-C6EB07647825',
              major: 10835,
              minor: 205,
              position: { x: 12.0, y: 12.8 }, // Real-world coordinates in meters (center of room01)
              name: 'Beacon 1',
              room: 'room01',
              roomId: 'room01'
            },
            {
              id: 'FDA50693-A4E2-4FB1-AFCF-C6EB07647825-10835-208',
              uuid: 'FDA50693-A4E2-4FB1-AFCF-C6EB07647825',
              major: 10835,
              minor: 208,
              position: { x: 19.3, y: 12.8 }, // Real-world coordinates in meters (center of room02)
              name: 'Beacon 2',
              room: 'room02',
              roomId: 'room02'
            },
            {
              id: 'FDA50693-A4E2-4FB1-AFCF-C6EB07647825-10835-209',
              uuid: 'FDA50693-A4E2-4FB1-AFCF-C6EB07647825',
              major: 10835,
              minor: 209,
              position: { x: 27.9, y: 6.9 }, // Real-world coordinates in meters (center of room03)
              name: 'Beacon 3',
              room: 'room03',
              roomId: 'room03'
            }
          ],
          rooms: [
            {
              id: 'room01',
              name: 'Room 01',
              type: 'office',
              bounds: { x: 10.0, y: 0.1, width: 4.1, height: 6.9 }, // Real-world bounds in meters
              center: { x: 12.0, y: 3.6 }, // Real-world center in meters
              area: 28.3, // square meters
              capacity: 10,
              description: 'Office space'
            },
            {
              id: 'room02',
              name: 'Room 02',
              type: 'office',
              bounds: { x: 14.1, y: 0.1, width: 10.5, height: 6.9 }, // Real-world bounds in meters
              center: { x: 19.3, y: 3.6 }, // Real-world center in meters
              area: 72.5, // square meters
              capacity: 25,
              description: 'Large office space'
            },
            {
              id: 'room03',
              name: 'Room 03',
              type: 'meeting',
              bounds: { x: 24.6, y: 0.1, width: 6.7, height: 17.3 }, // Real-world bounds in meters
              center: { x: 27.9, y: 8.8 }, // Real-world center in meters
              area: 115.9, // square meters
              capacity: 30,
              description: 'Meeting room'
            }
          ]
        }
      }
    }
  },
  
  // Global beacon settings
  scanSettings: {
    scanInterval: 2000, // ms
    rssiThreshold: -90, // dBm
    proximityThreshold: 30, // meters
    minBeaconsForPositioning: 3,
    maxBeaconsForPositioning: 6,
    positionUpdateInterval: 3000, // ms
    kalmanFilterEnabled: true
  },
  
  // Positioning algorithm settings
  positioningSettings: {
    method: 'trilateration', // 'trilateration', 'centroid', 'closestBeacon'
    fallbackMethod: 'centroid',
    rssiToDistanceMethod: 'logarithmic', // 'logarithmic', 'linear'
    environmentFactor: 2.0, // Path loss exponent
    accuracyThreshold: 5.0, // meters
    outlierFilterEnabled: true,
    movingAverageWindow: 3
  }
};

// Utility functions for beacon configuration
class BeaconConfigManager {
  
  /**
   * Get all beacons for a specific floor
   */
  static getBeaconsForFloor(buildingId, floorId) {
    const building = BEACON_CONFIG.buildings[buildingId];
    if (!building || !building.floors[floorId]) {
      return [];
    }
    return building.floors[floorId].beacons || [];
  }
  
  /**
   * Get all rooms for a specific floor
   */
  static getRoomsForFloor(buildingId, floorId) {
    const building = BEACON_CONFIG.buildings[buildingId];
    if (!building || !building.floors[floorId]) {
      return [];
    }
    return building.floors[floorId].rooms || [];
  }
  
  /**
   * Find beacon by UUID, major, minor
   */
  static findBeacon(uuid, major, minor, buildingId = 'building-1') {
    const building = BEACON_CONFIG.buildings[buildingId];
    if (!building) return null;
    
    for (const floorId in building.floors) {
      const floor = building.floors[floorId];
      const beacon = floor.beacons.find(b => 
        b.uuid.toLowerCase() === uuid.toLowerCase() &&
        b.major === major &&
        b.minor === minor
      );
      if (beacon) {
        return { ...beacon, buildingId, floorId: parseInt(floorId) };
      }
    }
    return null;
  }
  
  /**
   * Get room for a specific beacon
   */
  static getRoomForBeacon(beaconId, buildingId = 'building-1') {
    const building = BEACON_CONFIG.buildings[buildingId];
    if (!building) return null;
    
    for (const floorId in building.floors) {
      const floor = building.floors[floorId];
      const beacon = floor.beacons.find(b => b.id === beaconId);
      
      if (beacon && beacon.roomId) {
        const room = floor.rooms.find(r => r.id === beacon.roomId);
        if (room) {
          return { ...room, buildingId, floorId: parseInt(floorId) };
        }
      }
    }
    return null;
  }
  
  /**
   * Get floor plan configuration
   */
  static getFloorPlan(buildingId, floorId) {
    const building = BEACON_CONFIG.buildings[buildingId];
    if (!building || !building.floors[floorId]) {
      return null;
    }
    return building.floors[floorId];
  }
  
  /**
   * Validate beacon configuration
   */
  static validateBeaconConfig() {
    const errors = [];
    
    for (const buildingId in BEACON_CONFIG.buildings) {
      const building = BEACON_CONFIG.buildings[buildingId];
      
      for (const floorId in building.floors) {
        const floor = building.floors[floorId];
        
        // Check for duplicate beacons
        const beaconIds = new Set();
        const beaconKeys = new Set();
        
        floor.beacons.forEach((beacon, index) => {
          if (beaconIds.has(beacon.id)) {
            errors.push(`Duplicate beacon ID: ${beacon.id} in ${buildingId}/${floorId}`);
          }
          beaconIds.add(beacon.id);
          
          const key = `${beacon.uuid}-${beacon.major}-${beacon.minor}`;
          if (beaconKeys.has(key)) {
            errors.push(`Duplicate beacon signature: ${key} in ${buildingId}/${floorId}`);
          }
          beaconKeys.add(key);
          
          // Validate beacon position within floor bounds
          if (beacon.position.x < 0 || beacon.position.x > floor.dimensions.width ||
              beacon.position.y < 0 || beacon.position.y > floor.dimensions.height) {
            errors.push(`Beacon ${beacon.id} position outside floor bounds`);
          }
        });
        
        // Check for minimum number of beacons
        if (floor.beacons.length < 3) {
          errors.push(`Floor ${buildingId}/${floorId} has fewer than 3 beacons (required for trilateration)`);
        }
      }
    }
    
    return {
      isValid: errors.length === 0,
      errors
    };
  }
  
  /**
   * Get active beacons only
   */
  static getActiveBeacons(buildingId, floorId) {
    return this.getBeaconsForFloor(buildingId, floorId)
      .filter(beacon => beacon.active);
  }
  
  /**
   * Update beacon position
   */
  static updateBeaconPosition(beaconId, newPosition, buildingId = 'building-1') {
    for (const floorId in BEACON_CONFIG.buildings[buildingId].floors) {
      const floor = BEACON_CONFIG.buildings[buildingId].floors[floorId];
      const beaconIndex = floor.beacons.findIndex(b => b.id === beaconId);
      
      if (beaconIndex !== -1) {
        floor.beacons[beaconIndex].position = newPosition;
        return true;
      }
    }
    return false;
  }
  
  /**
   * Get scan settings
   */
  static getScanSettings() {
    return BEACON_CONFIG.scanSettings;
  }
  
  /**
   * Get positioning settings
   */
  static getPositioningSettings() {
    return BEACON_CONFIG.positioningSettings;
  }
}

export { BEACON_CONFIG, BeaconConfigManager };