import React, { createContext, useContext, useReducer, useEffect, useCallback, useRef } from 'react';
import BleService from '../services/BleService';
import { IndoorPositioningEngine } from '../utils/IndoorPositioningEngine';
import { BeaconParser } from '../utils/BeaconParser';
import { KalmanFilter } from '../utils/KalmanFilter';
import { CoordinateMapper } from '../utils/CoordinateMapper';
import { BeaconConfigManager } from '../config/beaconConfig';
import { getFirestore, doc, updateDoc } from 'firebase/firestore';

// Action types
const ACTIONS = {
  SET_POSITION: 'SET_POSITION',
  SET_BEACONS: 'SET_BEACONS',
  UPDATE_BEACON: 'UPDATE_BEACON',
  SET_CURRENT_ROOM: 'SET_CURRENT_ROOM',
  SET_TRACKING_STATUS: 'SET_TRACKING_STATUS',
  SET_ERROR: 'SET_ERROR',
  SET_DEBUG_INFO: 'SET_DEBUG_INFO',
  SET_BLUETOOTH_STATE: 'SET_BLUETOOTH_STATE',
  SET_FLOOR: 'SET_FLOOR',
  CLEAR_ERROR: 'CLEAR_ERROR',
  CLEAR_BEACONS: 'CLEAR_BEACONS'
};

// Initial state
const initialState = {
  position: { x: 0, y: 0, accuracy: 0, timestamp: null },
  svgPosition: { x: 0, y: 0 },
  beacons: [],
  currentRoom: null,
  currentFloor: 1,
  isTracking: false,
  bluetoothState: 'unknown',
  error: null,
  debugInfo: {
    rawBeacons: [],
    rssiValues: {},
    positioningMethod: null,
    kalmanState: null,
    lastUpdate: null,
    scanCount: 0,
    averageAccuracy: 0
  }
};

// Reducer
const indoorLocationReducer = (state, action) => {
  switch (action.type) {
    case ACTIONS.SET_POSITION:
      return {
        ...state,
        position: action.payload.position,
        svgPosition: action.payload.svgPosition,
        debugInfo: {
          ...state.debugInfo,
          positioningMethod: action.payload.method,
          kalmanState: action.payload.kalmanState,
          lastUpdate: new Date().toISOString(),
          averageAccuracy: action.payload.position.accuracy
        }
      };
    
    case ACTIONS.SET_BEACONS:
      return {
        ...state,
        beacons: action.payload,
        debugInfo: {
          ...state.debugInfo,
          rawBeacons: action.payload,
          rssiValues: action.payload.reduce((acc, beacon) => {
            acc[beacon.id] = beacon.rssi;
            return acc;
          }, {}),
          scanCount: state.debugInfo.scanCount + 1
        }
      };
    
    case ACTIONS.UPDATE_BEACON:
      const { beaconData } = action.payload;
      const existingBeacons = state.beacons.filter(b => b.id !== beaconData.id);
      const updatedBeacons = [...existingBeacons, { ...beaconData, lastSeen: Date.now() }];
      return {
        ...state,
        beacons: updatedBeacons,
        debugInfo: {
          ...state.debugInfo,
          rawBeacons: updatedBeacons,
          rssiValues: updatedBeacons.reduce((acc, beacon) => {
            acc[beacon.id] = beacon.rssi;
            return acc;
          }, {}),
          scanCount: state.debugInfo.scanCount + 1
        }
      };
    
    case ACTIONS.SET_CURRENT_ROOM:
      const previousRoom = state.currentRoom;
      const newRoom = action.payload;
      
      if (newRoom && (!previousRoom || previousRoom.id !== newRoom.id)) {
        console.log(`🎯 ROOM CHANGE: ${previousRoom ? previousRoom.name : 'None'} → ${newRoom.name}`);
      }
      
      return {
        ...state,
        currentRoom: action.payload
      };
    
    case ACTIONS.SET_TRACKING_STATUS:
      return {
        ...state,
        isTracking: action.payload
      };
    
    case ACTIONS.SET_ERROR:
      return {
        ...state,
        error: action.payload
      };
    
    case ACTIONS.SET_DEBUG_INFO:
      return {
        ...state,
        debugInfo: {
          ...state.debugInfo,
          ...action.payload
        }
      };
    
    case ACTIONS.SET_BLUETOOTH_STATE:
      return {
        ...state,
        bluetoothState: action.payload
      };
    
    case ACTIONS.SET_FLOOR:
      return {
        ...state,
        currentFloor: action.payload
      };
    
    case ACTIONS.CLEAR_ERROR:
      return {
        ...state,
        error: null
      };
    
    case ACTIONS.CLEAR_BEACONS:
      return {
        ...state,
        beacons: []
      };
    
    default:
      return state;
  }
};

// Context
const IndoorLocationContext = createContext();

// Provider component
export const IndoorLocationProvider = ({ children }) => {
  const [state, dispatch] = useReducer(indoorLocationReducer, initialState);
  
  // Configuration
  const config = BeaconConfigManager.getFloorPlan('building-1', state.currentFloor);
  const currentFloorConfig = config;
  
  // Initialize services
  const bleService = BleService;
  const positioningEngineRef = useRef(null);
  const kalmanFilter = new KalmanFilter();
  const coordinateMapperRef = useRef(null);
  const configManager = BeaconConfigManager;
  
  // Initialize positioning engine when floor config changes
  useEffect(() => {
    if (currentFloorConfig) {
      positioningEngineRef.current = new IndoorPositioningEngine(currentFloorConfig, currentFloorConfig);
      console.log('🔧 POSITIONING ENGINE INITIALIZED with floor config:', {
        dimensions: currentFloorConfig.dimensions,
        beaconCount: currentFloorConfig.beacons?.length || 0,
        roomCount: currentFloorConfig.rooms?.length || 0
      });
    }
  }, [currentFloorConfig]);
  
  // Store unsubscribe functions for cleanup
  const unsubscribeRefs = useRef({
    beaconScan: null,
    bluetoothStateChanged: null,
    error: null
  });
  
  // Store current beacons for positioning calculation
  const currentBeaconsRef = useRef([]);
  
  // Update current beacons ref when state changes
  useEffect(() => {
    currentBeaconsRef.current = state.beacons;
  }, [state.beacons]);

  // Initialize coordinate mapper when floor config is available
  const getCoordinateMapper = useCallback(() => {
    if (currentFloorConfig && !coordinateMapperRef.current) {
      coordinateMapperRef.current = new CoordinateMapper(currentFloorConfig);
    }
    return coordinateMapperRef.current;
  }, [currentFloorConfig]);

  // Refactored handleBeaconScan for simple nearest-beacon-to-room mapping
  const handleBeaconScan = useCallback((beaconData) => {
    try {
      if (!beaconData || !beaconData.rssi || beaconData.rssi <= -100) {
        return; // Filter weak signals
      }

      // Update beacons state with the new beacon data
      dispatch({
        type: ACTIONS.UPDATE_BEACON,
        payload: { beaconData }
      });

      // Get current beacons (recent)
      const currentBeacons = currentBeaconsRef.current.filter(beacon =>
        beacon.lastSeen && (Date.now() - beacon.lastSeen) < 10000
      );

      // Debug: print all beacons sorted by RSSI
      if (currentBeacons.length > 0) {
        const sorted = [...currentBeacons].sort((a, b) => b.rssi - a.rssi);
        console.log('🔍 Sorted beacons by RSSI:', sorted.map(b => ({ id: b.id, rssi: b.rssi, minor: b.minor })));
        const nearestBeacon = sorted[0];
        if (nearestBeacon) {
          console.log('⭐ Nearest beacon:', nearestBeacon);
          // Map beacon to room
          const room = BeaconConfigManager.getRoomForBeacon(nearestBeacon.id);
          console.log('🏠 Mapped room for nearest beacon:', room);
          if (room) {
            // Only update if room changed
            if (!state.currentRoom || state.currentRoom.id !== room.id) {
              dispatch({ type: ACTIONS.SET_CURRENT_ROOM, payload: room });
            }
          } else {
            // No room found for beacon
            if (state.currentRoom) {
              dispatch({ type: ACTIONS.SET_CURRENT_ROOM, payload: null });
            }
          }
        }
      } else {
        // No beacons detected
        if (state.currentRoom) {
          dispatch({ type: ACTIONS.SET_CURRENT_ROOM, payload: null });
        }
      }
    } catch (error) {
      console.error('Error processing beacon scan:', error);
      dispatch({
        type: ACTIONS.SET_ERROR,
        payload: `Positioning error: ${error.message}`
      });
    }
  }, [BeaconConfigManager, state.currentRoom]);

  // Handle Bluetooth state changes
  const handleBluetoothStateChange = useCallback((state) => {
    dispatch({ type: ACTIONS.SET_BLUETOOTH_STATE, payload: state });
    
    if (state !== 'PoweredOn' && state.isTracking) {
      dispatch({ type: ACTIONS.SET_TRACKING_STATUS, payload: false });
      dispatch({ 
        type: ACTIONS.SET_ERROR, 
        payload: 'Bluetooth is not available' 
      });
    }
  }, []);

  // Handle errors
  const handleError = useCallback((error) => {
    console.error('BLE Service Error:', error);
    dispatch({ 
      type: ACTIONS.SET_ERROR, 
      payload: error.message || 'Unknown error occurred' 
    });
  }, []);

  // Start tracking
  const startTracking = useCallback(async () => {
    try {
      dispatch({ type: ACTIONS.CLEAR_ERROR });
      // Initialize BLE service
      const initialized = await bleService.initialize();
      if (!initialized) {
        throw new Error('Failed to initialize BLE service');
      }
      // Set up event listeners using the correct methods and event names
      unsubscribeRefs.current.beaconScan = bleService.addListener('beaconDetected', handleBeaconScan);
      unsubscribeRefs.current.bluetoothStateChanged = bleService.addListener('bluetoothStateChanged', handleBluetoothStateChange);
      unsubscribeRefs.current.error = bleService.addListener('scanError', handleError);
      // Start burst scanning
      await bleService.startBurstScanning();
      dispatch({ type: ACTIONS.SET_TRACKING_STATUS, payload: true });
      // Initialize Kalman filter
      kalmanFilter.initialize(0, 0, 0, 0);
      console.log('🚀 INDOOR TRACKING STARTED');
      console.log('📡 Scanning for beacons...');
    } catch (error) {
      console.error('Error starting tracking:', error);
      dispatch({ 
        type: ACTIONS.SET_ERROR, 
        payload: error.message 
      });
    }
  }, [bleService, handleBeaconScan, handleBluetoothStateChange, handleError, kalmanFilter]);

  // Stop tracking
  const stopTracking = useCallback(async () => {
    try {
      await bleService.stopBurstScanning();
      // Remove event listeners using stored unsubscribe functions
      if (unsubscribeRefs.current.beaconScan) {
        unsubscribeRefs.current.beaconScan();
        unsubscribeRefs.current.beaconScan = null;
      }
      if (unsubscribeRefs.current.bluetoothStateChanged) {
        unsubscribeRefs.current.bluetoothStateChanged();
        unsubscribeRefs.current.bluetoothStateChanged = null;
      }
      if (unsubscribeRefs.current.error) {
        unsubscribeRefs.current.error();
        unsubscribeRefs.current.error = null;
      }
      dispatch({ type: ACTIONS.SET_TRACKING_STATUS, payload: false });
      dispatch({ type: ACTIONS.CLEAR_BEACONS });
      console.log('⏹️ INDOOR TRACKING STOPPED');
    } catch (error) {
      console.error('Error stopping tracking:', error);
      dispatch({ 
        type: ACTIONS.SET_ERROR, 
        payload: error.message 
      });
    }
  }, [bleService]);

  // Change floor
  const changeFloor = useCallback((floorId) => {
    dispatch({ type: ACTIONS.SET_FLOOR, payload: floorId });
    
    // Reset position when changing floors
    dispatch({
      type: ACTIONS.SET_POSITION,
      payload: {
        position: { x: 0, y: 0, accuracy: 0, timestamp: null },
        svgPosition: { x: 0, y: 0 },
        method: null,
        kalmanState: null
      }
    });
    
    dispatch({ type: ACTIONS.SET_CURRENT_ROOM, payload: null });
    
    // Reinitialize Kalman filter for new floor
    kalmanFilter.initialize(0, 0, 0, 0);
  }, [kalmanFilter]);

  // Clear error
  const clearError = useCallback(() => {
    dispatch({ type: ACTIONS.CLEAR_ERROR });
  }, []);

  // Get beacon by ID
  const getBeaconById = useCallback((beaconId) => {
    return state.beacons.find(beacon => beacon.id === beaconId);
  }, [state.beacons]);

  // Get positioning statistics
  const getPositioningStats = useCallback(() => {
    const recentBeacons = state.beacons.filter(beacon => 
      beacon.lastSeen && (Date.now() - beacon.lastSeen) < 10000
    );
    
    return {
      totalBeacons: state.beacons.length,
      activeBeacons: recentBeacons.length,
      averageRssi: recentBeacons.length > 0 
        ? recentBeacons.reduce((sum, b) => sum + b.rssi, 0) / recentBeacons.length 
        : 0,
      positionAccuracy: state.position.accuracy,
      lastUpdate: state.debugInfo.lastUpdate,
      scanCount: state.debugInfo.scanCount
    };
  }, [state.beacons, state.position.accuracy, state.debugInfo]);

  // Context value
  const contextValue = {
    // State
    ...state,
    currentFloorConfig,
    
    // Actions
    startTracking,
    stopTracking,
    changeFloor,
    clearError,
    
    // Utilities
    getBeaconById,
    getPositioningStats,
    
    // Services (for debugging)
    bleService,
    positioningEngineRef,
    getCoordinateMapper,
    configManager
  };

  return (
    <IndoorLocationContext.Provider value={contextValue}>
      {children}
    </IndoorLocationContext.Provider>
  );
};

// Hook to use the context
export const useIndoorLocation = () => {
  const context = useContext(IndoorLocationContext);
  if (!context) {
    throw new Error('useIndoorLocation must be used within an IndoorLocationProvider');
  }
  return context;
};

export default IndoorLocationContext;

/**
 * Updates the student's nearestBeacon in Firestore for real-time BLE tracking.
 * @param {string} userId - The student's UID
 * @param {object} beacon - The nearest beacon object (should include roomId, roomName, svgPosition, etc)
 */
export async function updateNearestBeacon(userId, beacon) {
  const db = getFirestore();
  const userRef = doc(db, 'users', userId);
  await updateDoc(userRef, { nearestBeacon: beacon });
}