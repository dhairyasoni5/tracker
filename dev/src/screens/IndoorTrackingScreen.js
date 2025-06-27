import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  Alert,
  Switch,
  Dimensions
} from 'react-native';
import { useIndoorLocation } from '../context/IndoorLocationContext';
import SVGFloorPlan from '../components/SVGFloorPlan';

const { width: screenWidth } = Dimensions.get('window');

const IndoorTrackingScreen = () => {
  const {
    // State
    position,
    svgPosition,
    beacons,
    currentRoom,
    currentFloor,
    currentFloorConfig,
    isTracking,
    bluetoothState,
    error,
    debugInfo,
    
    // Actions
    startTracking,
    stopTracking,
    changeFloor,
    clearError,
    getPositioningStats,
    
    // Services
    configManager
  } = useIndoorLocation();

  const [showDebugInfo, setShowDebugInfo] = useState(false);
  const [autoRefresh, setAutoRefresh] = useState(true);

  // Auto refresh timer
  useEffect(() => {
    if (!autoRefresh || !isTracking) return;

    const interval = setInterval(() => {
      // Force re-render to update timestamps and status
    }, 2000);

    return () => clearInterval(interval);
  }, [autoRefresh, isTracking]);

  // Handle start/stop tracking
  const handleToggleTracking = async () => {
    if (isTracking) {
      await stopTracking();
    } else {
      await startTracking();
    }
  };

  // Handle floor change
  const handleFloorChange = (floorId) => {
    changeFloor(floorId);
  };

  // Handle room press
  const handleRoomPress = (room) => {
    Alert.alert(
      'Room Information',
      `Room: ${room.name}\nID: ${room.id}\nType: ${room.type || 'Unknown'}`,
      [{ text: 'OK' }]
    );
  };

  // Handle beacon press
  const handleBeaconPress = (beaconConfig, beaconData) => {
    const info = [
      `Beacon: ${beaconConfig.name || beaconConfig.id}`,
      `ID: ${beaconConfig.id}`,
      beaconData ? `RSSI: ${beaconData.rssi} dBm` : 'Not detected',
      beaconData ? `Distance: ${beaconData.distance?.toFixed(1)}m` : '',
      `Position: (${beaconConfig.x}, ${beaconConfig.y})`
    ].filter(Boolean).join('\n');

    Alert.alert('Beacon Information', info, [{ text: 'OK' }]);
  };

  // Get positioning statistics
  const stats = getPositioningStats();

  // Get available floors
  const config = configManager.getConfig();
  const availableFloors = config.floors || [];

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.title}>Indoor Tracking</Text>
        <TouchableOpacity
          style={[
            styles.trackingButton,
            isTracking ? styles.trackingButtonActive : styles.trackingButtonInactive
          ]}
          onPress={handleToggleTracking}
        >
          <Text style={styles.trackingButtonText}>
            {isTracking ? 'Stop' : 'Start'}
          </Text>
        </TouchableOpacity>
      </View>

      {/* Error Display */}
      {error && (
        <View style={styles.errorContainer}>
          <Text style={styles.errorText}>{error}</Text>
          <TouchableOpacity onPress={clearError} style={styles.clearErrorButton}>
            <Text style={styles.clearErrorButtonText}>Clear</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Status Bar */}
      <View style={styles.statusBar}>
        <Text style={styles.statusText}>
          Bluetooth: {bluetoothState} | Beacons: {beacons.length} | Room: {currentRoom?.name || 'Unknown'}
        </Text>
      </View>

      {/* Floor Selection */}
      {availableFloors.length > 1 && (
        <View style={styles.floorSelector}>
          <Text style={styles.floorLabel}>Floor:</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            {availableFloors.map((floor) => (
              <TouchableOpacity
                key={floor.id}
                style={[
                  styles.floorButton,
                  currentFloor === floor.id && styles.floorButtonActive
                ]}
                onPress={() => handleFloorChange(floor.id)}
              >
                <Text style={[
                  styles.floorButtonText,
                  currentFloor === floor.id && styles.floorButtonTextActive
                ]}>
                  {floor.name}
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>
      )}

      {/* Main Content */}
      <View style={styles.content}>
        {/* Floor Plan */}
        <View style={styles.floorPlanContainer}>
          <SVGFloorPlan
            floorPlan={currentFloorConfig}
            userPosition={svgPosition}
            beaconPositions={currentFloorConfig?.beacons || []}
            beacons={beacons}
            currentRoom={currentRoom}
            onRoomPress={handleRoomPress}
            onBeaconPress={handleBeaconPress}
            showBeacons={true}
            showUserPosition={true}
            showRoomLabels={true}
          />
        </View>

        {/* Position Information */}
        <View style={styles.infoPanel}>
          <ScrollView>
            {/* Current Position */}
            <View style={styles.infoSection}>
              <Text style={styles.infoTitle}>Current Position</Text>
              <Text style={styles.infoText}>
                X: {position.x?.toFixed(2) || '0.00'}m, Y: {position.y?.toFixed(2) || '0.00'}m
              </Text>
              <Text style={styles.infoText}>
                Accuracy: ±{position.accuracy?.toFixed(1) || '0.0'}m
              </Text>
              <Text style={styles.infoText}>
                Last Update: {position.timestamp ? new Date(position.timestamp).toLocaleTimeString() : 'Never'}
              </Text>
            </View>

            {/* Statistics */}
            <View style={styles.infoSection}>
              <Text style={styles.infoTitle}>Statistics</Text>
              <Text style={styles.infoText}>Active Beacons: {stats.activeBeacons}/{stats.totalBeacons}</Text>
              <Text style={styles.infoText}>Average RSSI: {stats.averageRssi.toFixed(0)} dBm</Text>
              <Text style={styles.infoText}>Scan Count: {stats.scanCount}</Text>
            </View>

            {/* Debug Toggle */}
            <View style={styles.debugToggle}>
              <Text style={styles.infoTitle}>Debug Information</Text>
              <Switch
                value={showDebugInfo}
                onValueChange={setShowDebugInfo}
              />
            </View>

            {/* Debug Information */}
            {showDebugInfo && (
              <View style={styles.infoSection}>
                <Text style={styles.infoTitle}>Debug Data</Text>
                <Text style={styles.debugText}>
                  Method: {debugInfo.positioningMethod || 'None'}
                </Text>
                <Text style={styles.debugText}>
                  Raw Beacons: {debugInfo.rawBeacons?.length || 0}
                </Text>
                <Text style={styles.debugText}>
                  Kalman State: {debugInfo.kalmanState ? 
                    `(${debugInfo.kalmanState.x?.toFixed(2)}, ${debugInfo.kalmanState.y?.toFixed(2)})` : 
                    'Not initialized'}
                </Text>
                <Text style={styles.debugText}>
                  RSSI Values: {Object.keys(debugInfo.rssiValues || {}).length} beacons
                </Text>
                
                {/* Individual Beacon Data */}
                {beacons.map((beacon, index) => (
                  <Text key={index} style={styles.debugText}>
                    {beacon.id}: {beacon.rssi}dBm ({beacon.distance?.toFixed(1)}m)
                  </Text>
                ))}
              </View>
            )}

            {/* Auto Refresh Toggle */}
            <View style={styles.debugToggle}>
              <Text style={styles.infoTitle}>Auto Refresh</Text>
              <Switch
                value={autoRefresh}
                onValueChange={setAutoRefresh}
              />
            </View>
          </ScrollView>
        </View>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: 'white',
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
  },
  title: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#000',
  },
  trackingButton: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8,
    minWidth: 60,
    alignItems: 'center',
  },
  trackingButtonActive: {
    backgroundColor: '#FF3B30',
  },
  trackingButtonInactive: {
    backgroundColor: '#34C759',
  },
  trackingButtonText: {
    color: 'white',
    fontWeight: 'bold',
  },
  errorContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FF3B30',
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  errorText: {
    flex: 1,
    color: 'white',
    fontSize: 14,
  },
  clearErrorButton: {
    paddingHorizontal: 12,
    paddingVertical: 4,
    backgroundColor: 'rgba(255, 255, 255, 0.3)',
    borderRadius: 4,
  },
  clearErrorButtonText: {
    color: 'white',
    fontSize: 12,
    fontWeight: 'bold',
  },
  statusBar: {
    backgroundColor: '#007AFF',
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  statusText: {
    color: 'white',
    fontSize: 12,
    textAlign: 'center',
  },
  floorSelector: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'white',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
  },
  floorLabel: {
    fontSize: 14,
    fontWeight: 'bold',
    marginRight: 12,
    color: '#000',
  },
  floorButton: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    marginRight: 8,
    borderRadius: 6,
    backgroundColor: '#f0f0f0',
  },
  floorButtonActive: {
    backgroundColor: '#007AFF',
  },
  floorButtonText: {
    fontSize: 12,
    color: '#333',
  },
  floorButtonTextActive: {
    color: 'white',
    fontWeight: 'bold',
  },
  content: {
    flex: 1,
    flexDirection: 'row',
  },
  floorPlanContainer: {
    flex: 2,
    backgroundColor: 'white',
    margin: 8,
    borderRadius: 8,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
  },
  infoPanel: {
    flex: 1,
    backgroundColor: 'white',
    margin: 8,
    borderRadius: 8,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
  },
  infoSection: {
    padding: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  infoTitle: {
    fontSize: 14,
    fontWeight: 'bold',
    marginBottom: 8,
    color: '#000',
  },
  infoText: {
    fontSize: 12,
    color: '#666',
    marginBottom: 4,
  },
  debugToggle: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  debugText: {
    fontSize: 10,
    color: '#888',
    marginBottom: 2,
    fontFamily: 'monospace',
  },
});

export default IndoorTrackingScreen;