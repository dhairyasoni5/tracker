import React, { useEffect, useRef, useState } from 'react';

import {
  Modal,
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Dimensions,
  Animated,
  Alert,
  Platform
} from 'react-native';
import { MaterialIcons as Icon } from '@expo/vector-icons';
import Svg, { G, Path, Circle, Text as SvgText, Defs, LinearGradient, Stop } from 'react-native-svg';
import { useIndoorLocation } from '../context/IndoorLocationContext';
import { BeaconConfigManager } from '../config/beaconConfig';
import { CoordinateMapper } from '../utils/CoordinateMapper';

const { width: screenWidth, height: screenHeight } = Dimensions.get('window');

// --- SVG Room Paths for 01, 02, 03 ---
const ROOM_SVG_PATHS = {
  room01: 'M156 4.5L94 113.5H221V112.5V4.5H156Z',
  room02: 'M386 4.5H221V6V113.5H386V4.5Z',
  room03: 'M491 4.5H386V103.5H404.5V156.5H417V214.5H389V223H417V275.5H458.5V223H487.5V214.5H458.5V156.5H472V103.5H491V4.5Z',
};

const ROOM_LABELS = {
  room01: 'Room 01',
  room02: 'Room 02',
  room03: 'Room 03',
};

// Hardcoded centers for pointer (approximate, based on SVG)
const ROOM_CENTERS = {
  room01: { x: 156 + (221-156)/2, y: 4.5 + (113.5-4.5)/2 },
  room02: { x: 221 + (386-221)/2, y: 4.5 + (113.5-4.5)/2 },
  room03: { x: 386 + (491-386)/2, y: 4.5 + (275.5-4.5)/2 },
};

const IndoorMapModal = ({ visible, onClose }) => {
  const {
    position,
    svgPosition,
    beacons,
    currentRoom,
    isTracking,
    bluetoothState,
    startTracking,
    stopTracking
  } = useIndoorLocation();

  const [floorConfig, setFloorConfig] = useState(null);
  const [mapScale, setMapScale] = useState(1);
  const [mapOffset, setMapOffset] = useState({ x: 0, y: 0 });
  const [coordinateMapper, setCoordinateMapper] = useState(null);
  
  // Animation for blinking user dot
  const blinkAnimation = useRef(new Animated.Value(1)).current;
  const pulseAnimation = useRef(new Animated.Value(1)).current;

  // Get floor configuration and initialize coordinate mapper
  useEffect(() => {
    const config = BeaconConfigManager.getFloorPlan('building-1', 1);
    setFloorConfig(config);
    
    if (config) {
      const mapper = new CoordinateMapper(config);
      setCoordinateMapper(mapper);
    }
  }, []);

  // Start blinking animation
  useEffect(() => {
    const blink = Animated.loop(
      Animated.sequence([
        Animated.timing(blinkAnimation, {
          toValue: 0.2,
          duration: 600,
          useNativeDriver: true,
        }),
        Animated.timing(blinkAnimation, {
          toValue: 1,
          duration: 600,
          useNativeDriver: true,
        }),
      ])
    );

    const pulse = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnimation, {
          toValue: 1.3,
          duration: 800,
          useNativeDriver: true,
        }),
        Animated.timing(pulseAnimation, {
          toValue: 1,
          duration: 800,
          useNativeDriver: true,
        }),
      ])
    );

    blink.start();
    pulse.start();

    return () => {
      blink.stop();
      pulse.stop();
    };
  }, [blinkAnimation, pulseAnimation]);

  // Calculate map dimensions and scale
  const calculateMapDimensions = () => {
    if (!floorConfig) return { width: 784, height: 316, scale: 1 };
    
    const svgWidth = floorConfig.dimensions.width;
    const svgHeight = floorConfig.dimensions.height;
    
    const maxWidth = screenWidth * 0.9;
    const maxHeight = screenHeight * 0.7;
    
    const scaleX = maxWidth / svgWidth;
    const scaleY = maxHeight / svgHeight;
    const scale = Math.min(scaleX, scaleY, 1.5); // Cap at 1.5x
    
    const width = svgWidth * scale;
    const height = svgHeight * scale;
    
    return { width, height, scale };
  };

  const mapDimensions = calculateMapDimensions();

  // Get room color based on current room
  const getRoomColor = (roomId) => {
    if (!currentRoom) return '#E5E7EB';
    if (roomId === currentRoom.id) return '#10B981'; // Green for current room
    return '#F3F4F6';
  };

  // Get beacon color based on signal strength
  const getBeaconColor = (rssi) => {
    if (rssi >= -60) return '#10B981'; // Strong signal - Green
    if (rssi >= -70) return '#F59E0B'; // Medium signal - Yellow
    if (rssi >= -80) return '#EF4444'; // Weak signal - Red
    return '#9CA3AF'; // Very weak signal - Gray
  };

  // Handle tracking toggle
  const handleTrackingToggle = async () => {
    try {
      if (isTracking) {
        await stopTracking();
      } else {
        await startTracking();
      }
    } catch (error) {
      Alert.alert('Error', 'Failed to toggle tracking');
    }
  };

  // Render beacon indicators
  const renderBeaconIndicators = () => {
    if (!floorConfig?.beacons || !coordinateMapper) return null;

    return floorConfig.beacons.map((beacon) => {
      const beaconData = beacons.find(b => 
        b.uuid === beacon.uuid && 
        b.major === beacon.major && 
        b.minor === beacon.minor
      );
      
      const isActive = beaconData && beaconData.rssi > -90;
      const color = isActive ? getBeaconColor(beaconData.rssi) : '#9CA3AF';
      
      // Convert real-world beacon position to SVG coordinates
      const svgBeaconPosition = coordinateMapper.realWorldToSvg(beacon.position);
      
      return (
        <Circle
          key={beacon.id}
          cx={svgBeaconPosition.x}
          cy={svgBeaconPosition.y}
          r={isActive ? 8 : 4}
          fill={color}
          stroke="#FFFFFF"
          strokeWidth={2}
          opacity={isActive ? 0.8 : 0.4}
        />
      );
    });
  };

  // Render room labels
  const renderRoomLabels = () => {
    if (!floorConfig?.rooms || !coordinateMapper) return null;

    return floorConfig.rooms.map((room) => {
      // Convert real-world room center to SVG coordinates
      const svgRoomCenter = coordinateMapper.realWorldToSvg(room.center);
      
      return (
        <SvgText
          key={room.id}
          x={svgRoomCenter.x}
          y={svgRoomCenter.y}
          fontSize="12"
          fontWeight="bold"
          textAnchor="middle"
          fill={currentRoom?.id === room.id ? '#FFFFFF' : '#374151'}
        >
          {room.name}
        </SvgText>
      );
    });
  };

  // Render user position
  const renderUserPosition = () => {
    if (!svgPosition || !isTracking) return null;
    
    // Only show user position if they are in a detected room
    if (!currentRoom) return null;

    return (
      <Animated.View
        style={{
          position: 'absolute',
          left: svgPosition.x - 12,
          top: svgPosition.y - 12,
          opacity: blinkAnimation,
          transform: [{ scale: pulseAnimation }],
        }}
      >
        {/* Main user dot */}
        <Circle
          cx={12}
          cy={12}
          r={10}
          fill="#2563EB"
          stroke="#FFFFFF"
          strokeWidth={3}
        />
        {/* Outer pulse ring */}
        <Circle
          cx={12}
          cy={12}
          r={20}
          fill="none"
          stroke="#2563EB"
          strokeWidth={2}
          opacity={0.4}
        />
        {/* Inner highlight */}
        <Circle
          cx={12}
          cy={12}
          r={6}
          fill="#FFFFFF"
          opacity={0.8}
        />
      </Animated.View>
    );
  };

  // Render the SVG map with interactive, animated rooms and user marker
  const renderSVGMap = () => (
    <Svg
      width={mapDimensions.width}
      height={mapDimensions.height}
      viewBox="0 0 784 316"
      style={{ borderRadius: 18, backgroundColor: 'rgba(255,255,255,0.12)', shadowColor: '#000', shadowOpacity: 0.08, shadowRadius: 8, elevation: 2 }}
      accessible={true}
      accessibilityLabel="Indoor floor plan"
    >
      {/* Main border */}
      <Path d="M2.99996 263L151 0.5L783.5 1V315.5L27 314.5C1.50603 298.569 -3.04906 287.111 2.99996 263Z" fill="#F9FAFB" stroke="#E5E7EB" strokeWidth={2} />

      {/* Render all rooms (interactive, animated) */}
      {Object.entries(ROOM_SVG_PATHS).map(([roomId, d]) => {
        const isCurrent = currentRoom?.id === roomId;
        return (
          <Path
            key={roomId}
            d={d}
            fill={isCurrent ? 'url(#room-gradient)' : '#F3F4F6'}
            stroke={isCurrent ? '#6366f1' : '#94a3b8'}
            strokeWidth={isCurrent ? 3 : 1}
            opacity={isCurrent ? 0.95 : 0.7}
            onPress={() => {
              // Show info card or set as destination in future
              // For now, just log
              console.log('Room pressed:', roomId);
            }}
            accessibilityLabel={ROOM_LABELS[roomId]}
            accessible={true}
          />
        );
      })}
      {/* Room labels */}
      {Object.entries(ROOM_CENTERS).map(([roomId, center]) => (
        <SvgText
          key={roomId}
          x={center.x}
          y={center.y}
          fontSize="16"
          fontWeight="bold"
          textAnchor="middle"
          fill={currentRoom?.id === roomId ? '#fff' : '#334155'}
          opacity={0.95}
          accessibilityLabel={ROOM_LABELS[roomId]}
          accessible={true}
        >
          {ROOM_LABELS[roomId]}
        </SvgText>
      ))}
      {/* Animated user position marker (pulsing) */}
      {currentRoom && ROOM_CENTERS[currentRoom.id] && (
        <G>
          {/* Outer ripple */}
          <Circle
            cx={ROOM_CENTERS[currentRoom.id].x}
            cy={ROOM_CENTERS[currentRoom.id].y}
            r={28}
            fill="#6366f1"
            opacity={0.18}
          />
          {/* Main pulsing marker */}
          <Circle
            cx={ROOM_CENTERS[currentRoom.id].x}
            cy={ROOM_CENTERS[currentRoom.id].y}
            r={16}
            fill="#6366f1"
            opacity={0.45}
          />
          <Circle
            cx={ROOM_CENTERS[currentRoom.id].x}
            cy={ROOM_CENTERS[currentRoom.id].y}
            r={9}
            fill="#2563EB"
            opacity={blinkAnimation}
          />
          {/* Inner highlight */}
          <Circle
            cx={ROOM_CENTERS[currentRoom.id].x}
            cy={ROOM_CENTERS[currentRoom.id].y}
            r={4}
            fill="#fff"
            opacity={0.9}
          />
        </G>
      )}
      {/* Gradient definition for room highlight */}
      <Defs>
        <LinearGradient id="room-gradient" x1="0" y1="0" x2="784" y2="316" gradientUnits="userSpaceOnUse">
          <Stop offset="0" stopColor="#6366f1" stopOpacity="0.95" />
          <Stop offset="1" stopColor="#2563EB" stopOpacity="0.85" />
        </LinearGradient>
      </Defs>
    </Svg>
  );

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent={true}
      onRequestClose={onClose}
    >
      <View style={{
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        backgroundColor: 'rgba(30,41,59,0.7)', // dark glass overlay
        // Tailwind: bg-slate-900/70
      }}>
        <View style={{
          width: '100%',
          height: '100%',
          borderRadius: 0,
          overflow: 'hidden',
          backgroundColor: 'rgba(255,255,255,0.15)', // glassmorphism
          // Tailwind: bg-white/15
          backdropFilter: 'blur(16px)', // glass blur
          shadowColor: '#000',
          shadowOffset: { width: 0, height: 8 },
          shadowOpacity: 0.2,
          shadowRadius: 24,
          elevation: 8,
        }}>
          {/* Gradient background */}
          <View style={{
            ...StyleSheet.absoluteFillObject,
            zIndex: 0,
            backgroundColor: 'transparent',
          }}>
            {/* Simulate a blue/purple gradient */}
            <View style={{
              flex: 1,
              backgroundColor: 'transparent',
              position: 'absolute',
              width: '100%',
              height: '100%',
              opacity: 0.8,
            }}>
              {/* Use a linear gradient if available, else fallback */}
            </View>
          </View>
          {/* Status bar */}
          <View style={{
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'space-between',
            paddingHorizontal: 20,
            paddingTop: Platform.OS === 'ios' ? 60 : 32,
            paddingBottom: 12,
            backgroundColor: 'rgba(255,255,255,0.25)',
            borderBottomWidth: 1,
            borderBottomColor: 'rgba(255,255,255,0.12)',
            zIndex: 2,
          }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: isTracking ? '#10B981' : '#EF4444', marginRight: 8 }} />
              <Text style={{ fontWeight: 'bold', fontSize: 20, color: '#1e293b', letterSpacing: 0.5 }}>Indoor Map</Text>
              <Text style={{ color: '#64748b', fontSize: 14, marginLeft: 12 }}>{isTracking ? 'Tracking Active' : 'Tracking Inactive'}</Text>
            </View>
            <TouchableOpacity
              style={{
                backgroundColor: 'rgba(255,255,255,0.7)',
                borderRadius: 9999,
                padding: 8,
                shadowColor: '#000',
                shadowOffset: { width: 0, height: 2 },
                shadowOpacity: 0.1,
                shadowRadius: 4,
                elevation: 2,
              }}
              onPress={onClose}
              accessibilityLabel="Close indoor map"
            >
              <Icon name="close" size={24} color="#334155" />
            </TouchableOpacity>
          </View>
          {/* Main SVG map content */}
          <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', zIndex: 1 }}>
            {renderSVGMap()}
          </View>
          {/* Main content (map, controls, etc.) will go here next */}
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
    backgroundColor: '#FFFFFF',
    ...Platform.select({
      ios: {
        paddingTop: 60,
      },
    }),
  },
  headerLeft: {
    flex: 1,
  },
  title: {
    fontSize: 20,
    fontWeight: '700',
    color: '#1F2937',
    marginBottom: 4,
  },
  statusContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  statusText: {
    fontSize: 14,
    color: '#6B7280',
  },
  closeButton: {
    padding: 8,
  },
  mapContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F9FAFB',
    padding: 16,
  },
  svg: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    ...Platform.select({
      web: {
        boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06)',
      },
      default: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.1,
        shadowRadius: 4,
        elevation: 4,
      },
    }),
  },
  controls: {
    padding: 16,
    backgroundColor: '#FFFFFF',
    borderTopWidth: 1,
    borderTopColor: '#E5E7EB',
  },
  trackButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: 12,
    marginBottom: 16,
    gap: 8,
  },
  trackButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
  statusInfo: {
    backgroundColor: '#F9FAFB',
    borderRadius: 12,
    padding: 16,
    gap: 8,
  },
  statusRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  statusLabel: {
    fontSize: 14,
    color: '#6B7280',
    fontWeight: '500',
  },
  statusValue: {
    fontSize: 14,
    color: '#1F2937',
    fontWeight: '600',
  },
  roomStatusContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  roomIndicator: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  legend: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    padding: 16,
    backgroundColor: '#FFFFFF',
    borderTopWidth: 1,
    borderTopColor: '#E5E7EB',
  },
  legendTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#1F2937',
    marginBottom: 16,
  },
  legendItems: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  legendDot: {
    width: 16,
    height: 16,
    borderRadius: 8,
  },
  legendText: {
    fontSize: 14,
    color: '#6B7280',
  },
});

export default IndoorMapModal; 