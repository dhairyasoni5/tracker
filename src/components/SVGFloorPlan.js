import React, { useState, useCallback } from 'react';
import { View, Dimensions, Alert } from 'react-native';
import Svg, { 
  G, 
  Path, 
  Circle, 
  Text as SvgText, 
  Rect,
  Use,
  Defs,
  ClipPath
} from 'react-native-svg';

const { width: screenWidth, height: screenHeight } = Dimensions.get('window');

const SVGFloorPlan = ({ 
  floorPlan,
  userPosition = { x: 0, y: 0 },
  beaconPositions = [],
  beacons = [],
  currentRoom = null,
  onRoomPress = null,
  onBeaconPress = null,
  showBeacons = true,
  showUserPosition = true,
  showRoomLabels = true,
  style = {}
}) => {
  const [svgDimensions, setSvgDimensions] = useState({ width: 400, height: 400 });
  const [isLoaded, setIsLoaded] = useState(false);

  // Calculate SVG viewBox and scaling
  const calculateViewBox = useCallback(() => {
    if (!floorPlan || !isLoaded) {
      return "0 0 400 400";
    }

    // Default viewBox based on floor plan configuration
    const defaultViewBox = floorPlan.viewBox || "0 0 400 400";
    return defaultViewBox;
  }, [floorPlan, isLoaded]);

  // Handle SVG load
  const handleSvgLoad = useCallback(() => {
    setIsLoaded(true);
  }, []);

  // Render user position marker
  const renderUserPosition = () => {
    if (!showUserPosition || !userPosition || (userPosition.x === 0 && userPosition.y === 0)) {
      return null;
    }

    return (
      <G key="user-position">
        {/* User position circle with pulsing effect */}
        <Circle
          cx={userPosition.x}
          cy={userPosition.y}
          r="8"
          fill="rgba(0, 122, 255, 0.3)"
          stroke="#007AFF"
          strokeWidth="2"
        />
        <Circle
          cx={userPosition.x}
          cy={userPosition.y}
          r="4"
          fill="#007AFF"
        />
        {/* Accuracy circle */}
        <Circle
          cx={userPosition.x}
          cy={userPosition.y}
          r="20"
          fill="none"
          stroke="rgba(0, 122, 255, 0.2)"
          strokeWidth="1"
          strokeDasharray="5,5"
        />
      </G>
    );
  };

  // Render beacon positions
  const renderBeacons = () => {
    if (!showBeacons || !beaconPositions || beaconPositions.length === 0) {
      return null;
    }

    return beaconPositions.map((beacon, index) => {
      // Find matching beacon data from scan results
      const beaconData = beacons.find(b => b.id === beacon.id);
      const isActive = beaconData && beaconData.rssi > -100;
      const signalStrength = beaconData ? Math.max(0, (100 + beaconData.rssi) / 100) : 0;

      return (
        <G key={`beacon-${beacon.id || index}`}>
          {/* Beacon circle */}
          <Circle
            cx={beacon.x}
            cy={beacon.y}
            r="6"
            fill={isActive ? "#34C759" : "#8E8E93"}
            stroke={isActive ? "#30D158" : "#C7C7CC"}
            strokeWidth="2"
            onPress={() => onBeaconPress && onBeaconPress(beacon, beaconData)}
          />
          
          {/* Signal strength indicator */}
          {isActive && (
            <Circle
              cx={beacon.x}
              cy={beacon.y}
              r={6 + (signalStrength * 10)}
              fill="none"
              stroke="rgba(52, 199, 89, 0.3)"
              strokeWidth="1"
            />
          )}
          
          {/* Beacon label */}
          <SvgText
            x={beacon.x}
            y={beacon.y - 12}
            fontSize="10"
            fill="#000000"
            textAnchor="middle"
            fontWeight="bold"
          >
            {beacon.name || beacon.id || `B${index + 1}`}
          </SvgText>
        </G>
      );
    });
  };

  // Render room areas
  const renderRooms = () => {
    if (!floorPlan || !floorPlan.rooms) {
      return null;
    }

    return floorPlan.rooms.map((room, index) => {
      const isCurrentRoom = currentRoom && currentRoom.id === room.id;
      
      return (
        <G key={`room-${room.id || index}`}>
          {/* Room boundary (if defined) */}
          {room.boundary && (
            <Path
              d={room.boundary}
              fill={isCurrentRoom ? "rgba(0, 122, 255, 0.1)" : "transparent"}
              stroke={isCurrentRoom ? "#007AFF" : "rgba(142, 142, 147, 0.3)"}
              strokeWidth={isCurrentRoom ? "2" : "1"}
              strokeDasharray={isCurrentRoom ? "none" : "5,5"}
              onPress={() => onRoomPress && onRoomPress(room)}
            />
          )}
          
          {/* Room label */}
          {showRoomLabels && room.center && (
            <SvgText
              x={room.center.x}
              y={room.center.y}
              fontSize="12"
              fill={isCurrentRoom ? "#007AFF" : "#8E8E93"}
              textAnchor="middle"
              fontWeight={isCurrentRoom ? "bold" : "normal"}
            >
              {room.name}
            </SvgText>
          )}
        </G>
      );
    });
  };

  // Render floor plan paths
  const renderFloorPlan = () => {
    if (!floorPlan || !floorPlan.paths) {
      return null;
    }

    return floorPlan.paths.map((path, index) => (
      <Path
        key={`path-${index}`}
        d={path.d}
        fill={path.fill || "none"}
        stroke={path.stroke || "#000000"}
        strokeWidth={path.strokeWidth || "1"}
        strokeDasharray={path.strokeDasharray}
        opacity={path.opacity || 1}
      />
    ));
  };

  // Handle SVG press (for room detection)
  const handleSvgPress = useCallback((event) => {
    if (!onRoomPress) return;

    const { locationX, locationY } = event.nativeEvent;
    
    // Convert screen coordinates to SVG coordinates
    // This is a simplified conversion - you might need to adjust based on your SVG setup
    const svgX = (locationX / screenWidth) * svgDimensions.width;
    const svgY = (locationY / screenHeight) * svgDimensions.height;
    
    // Find room at this position (simplified room detection)
    if (floorPlan && floorPlan.rooms) {
      const room = floorPlan.rooms.find(r => {
        if (r.bounds) {
          return svgX >= r.bounds.x && svgX <= r.bounds.x + r.bounds.width &&
                 svgY >= r.bounds.y && svgY <= r.bounds.y + r.bounds.height;
        }
        return false;
      });
      
      if (room) {
        onRoomPress(room);
      }
    }
  }, [onRoomPress, floorPlan, svgDimensions, screenWidth, screenHeight]);

  // Default floor plan if none provided
  const defaultFloorPlan = {
    viewBox: "0 0 400 300",
    paths: [
      {
        d: "M 10 10 L 390 10 L 390 290 L 10 290 Z",
        fill: "none",
        stroke: "#000000",
        strokeWidth: "2"
      }
    ],
    rooms: [
      {
        id: "default",
        name: "Main Area",
        center: { x: 200, y: 150 },
        bounds: { x: 10, y: 10, width: 380, height: 280 }
      }
    ]
  };

  const currentFloorPlan = floorPlan || defaultFloorPlan;
  const viewBox = calculateViewBox();

  return (
    <View style={[{ flex: 1, backgroundColor: '#f5f5f5' }, style]}>
      <Svg
        width="100%"
        height="100%"
        viewBox={viewBox}
        style={{ backgroundColor: 'white' }}
        onLoad={handleSvgLoad}
        onPress={handleSvgPress}
      >
        {/* Background */}
        <Rect
          x="0"
          y="0"
          width="100%"
          height="100%"
          fill="white"
        />
        
        {/* Floor plan paths */}
        {renderFloorPlan()}
        
        {/* Room areas */}
        {renderRooms()}
        
        {/* Beacon positions */}
        {renderBeacons()}
        
        {/* User position */}
        {renderUserPosition()}
      </Svg>
    </View>
  );
};

export default SVGFloorPlan;