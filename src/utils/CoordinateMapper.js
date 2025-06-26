// src/utils/CoordinateMapper.js

class CoordinateMapper {
  constructor(floorPlan) {
    this.floorPlan = floorPlan;
    this.svgDimensions = floorPlan.dimensions;
    this.realDimensions = floorPlan.scale;
    
    // Calculate scale factors
    this.scaleX = this.svgDimensions.width / this.realDimensions.realWidth;
    this.scaleY = this.svgDimensions.height / this.realDimensions.realHeight;
    
    // Origin point (top-left is 0,0 in SVG, bottom-left in real world)
    this.originX = 0;
    this.originY = this.svgDimensions.height; // Flip Y-axis
  }
  
  /**
   * Convert real-world coordinates to SVG coordinates
   * @param {Object} realCoords - {x, y} in meters
   * @returns {Object} - {x, y} in SVG pixels
   */
  realWorldToSvg(realCoords) {
    const svgX = this.originX + (realCoords.x * this.scaleX);
    const svgY = this.originY - (realCoords.y * this.scaleY); // Flip Y-axis
    
    return {
      x: Math.round(svgX),
      y: Math.round(svgY)
    };
  }
  
  /**
   * Convert SVG coordinates to real-world coordinates
   * @param {Object} svgCoords - {x, y} in SVG pixels
   * @returns {Object} - {x, y} in meters
   */
  svgToRealWorld(svgCoords) {
    const realX = (svgCoords.x - this.originX) / this.scaleX;
    const realY = (this.originY - svgCoords.y) / this.scaleY; // Flip Y-axis
    
    return {
      x: parseFloat(realX.toFixed(3)),
      y: parseFloat(realY.toFixed(3))
    };
  }
  
  /**
   * Convert distance from real-world to SVG scale
   * @param {number} realDistance - Distance in meters
   * @returns {number} - Distance in SVG pixels
   */
  realDistanceToSvg(realDistance) {
    // Use average scale factor for distance conversion
    const avgScale = (this.scaleX + this.scaleY) / 2;
    return realDistance * avgScale;
  }
  
  /**
   * Convert distance from SVG to real-world scale
   * @param {number} svgDistance - Distance in SVG pixels
   * @returns {number} - Distance in meters
   */
  svgDistanceToReal(svgDistance) {
    // Use average scale factor for distance conversion
    const avgScale = (this.scaleX + this.scaleY) / 2;
    return svgDistance / avgScale;
  }
  
  /**
   * Check if a position is within floor bounds
   * @param {Object} position - {x, y} in SVG coordinates
   * @returns {boolean} - True if within bounds
   */
  isWithinBounds(position) {
    return position.x >= 0 && 
           position.x <= this.svgDimensions.width &&
           position.y >= 0 && 
           position.y <= this.svgDimensions.height;
  }
  
  /**
   * Check if a real-world position is within floor bounds
   * @param {Object} realPosition - {x, y} in meters
   * @returns {boolean} - True if within bounds
   */
  isRealPositionWithinBounds(realPosition) {
    return realPosition.x >= 0 && 
           realPosition.x <= this.realDimensions.realWidth &&
           realPosition.y >= 0 && 
           realPosition.y <= this.realDimensions.realHeight;
  }
  
  /**
   * Clamp position to floor bounds
   * @param {Object} position - {x, y} in SVG coordinates
   * @returns {Object} - Clamped {x, y} position
   */
  clampToBounds(position) {
    return {
      x: Math.max(0, Math.min(this.svgDimensions.width, position.x)),
      y: Math.max(0, Math.min(this.svgDimensions.height, position.y))
    };
  }
  
  /**
   * Clamp real-world position to floor bounds
   * @param {Object} realPosition - {x, y} in meters
   * @returns {Object} - Clamped {x, y} position in meters
   */
  clampRealToBounds(realPosition) {
    return {
      x: Math.max(0, Math.min(this.realDimensions.realWidth, realPosition.x)),
      y: Math.max(0, Math.min(this.realDimensions.realHeight, realPosition.y))
    };
  }
  
  /**
   * Calculate distance between two positions in SVG coordinates
   * @param {Object} pos1 - {x, y} in SVG coordinates
   * @param {Object} pos2 - {x, y} in SVG coordinates
   * @returns {number} - Distance in SVG pixels
   */
  calculateSvgDistance(pos1, pos2) {
    const dx = pos2.x - pos1.x;
    const dy = pos2.y - pos1.y;
    return Math.sqrt(dx * dx + dy * dy);
  }
  
  /**
   * Calculate distance between two positions in real-world coordinates
   * @param {Object} pos1 - {x, y} in meters
   * @param {Object} pos2 - {x, y} in meters
   * @returns {number} - Distance in meters
   */
  calculateRealDistance(pos1, pos2) {
    const dx = pos2.x - pos1.x;
    const dy = pos2.y - pos1.y;
    return Math.sqrt(dx * dx + dy * dy);
  }
  
  /**
   * Get nearby rooms within a radius
   * @param {Object} position - {x, y} in SVG coordinates
   * @param {number} radius - Search radius in SVG pixels
   * @returns {Array} - Array of nearby rooms with distances
   */
  getNearbyRooms(position, radius) {
    if (!this.floorPlan.rooms) return [];
    
    return this.floorPlan.rooms
      .map(room => {
        const roomCenter = this.getRoomCenter(room.id);
        const distance = this.calculateSvgDistance(position, roomCenter);
        return {
          ...room,
          distance,
          center: roomCenter
        };
      })
      .filter(room => room.distance <= radius)
      .sort((a, b) => a.distance - b.distance);
  }
  
  /**
   * Get path between two rooms
   * @param {string} fromRoomId - Starting room ID
   * @param {string} toRoomId - Destination room ID
   * @returns {Array|null} - Array of room IDs representing path, or null if no path
   */
  getPathBetweenRooms(fromRoomId, toRoomId) {
    if (!this.floorPlan.paths) return null;
    
    // Simple direct path lookup
    const directPath = this.floorPlan.paths.find(path => 
      (path.from === fromRoomId && path.to === toRoomId) ||
      (path.from === toRoomId && path.to === fromRoomId)
    );
    
    if (directPath) {
      return [fromRoomId, toRoomId];
    }
    
    // TODO: Implement A* pathfinding for complex paths
    return null;
  }
  
  /**
   * Get floor plan statistics
   * @returns {Object} - Statistics about the floor plan
   */
  getFloorStats() {
    const rooms = this.floorPlan.rooms || [];
    const beacons = this.floorPlan.beacons || [];
    
    return {
      totalRooms: rooms.length,
      totalBeacons: beacons.length,
      activeBeacons: beacons.filter(b => b.active).length,
      floorArea: this.realDimensions.realWidth * this.realDimensions.realHeight,
      roomTypes: [...new Set(rooms.map(r => r.type))],
      averageRoomSize: rooms.reduce((sum, room) => {
        const svgArea = room.bounds.width * room.bounds.height;
        const realArea = this.svgDistanceToReal(room.bounds.width) * 
                        this.svgDistanceToReal(room.bounds.height);
        return sum + realArea;
      }, 0) / rooms.length,
      beaconDensity: beacons.length / (this.realDimensions.realWidth * this.realDimensions.realHeight)
    };
  }
  
  /**
   * Validate coordinate mapper configuration
   * @returns {Object} - Validation result
   */
  validate() {
    const errors = [];
    
    if (!this.floorPlan) {
      errors.push('Floor plan is required');
    }
    
    if (!this.svgDimensions || this.svgDimensions.width <= 0 || this.svgDimensions.height <= 0) {
      errors.push('Invalid SVG dimensions');
    }
    
    if (!this.realDimensions || this.realDimensions.realWidth <= 0 || this.realDimensions.realHeight <= 0) {
      errors.push('Invalid real world dimensions');
    }
    
    if (this.scaleX <= 0 || this.scaleY <= 0) {
      errors.push('Invalid scale factors');
    }
    
    return {
      isValid: errors.length === 0,
      errors,
      scaleX: this.scaleX,
      scaleY: this.scaleY,
      aspectRatio: {
        svg: this.svgDimensions.width / this.svgDimensions.height,
        real: this.realDimensions.realWidth / this.realDimensions.realHeight
      }
    };
  }
}

export { CoordinateMapper };