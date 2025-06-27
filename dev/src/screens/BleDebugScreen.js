import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  RefreshControl,
  Alert,
  Switch,
  Platform,
} from 'react-native';

// Conditional import for Android-only PermissionsAndroid
let PermissionsAndroid;
if (Platform.OS === 'android') {
  PermissionsAndroid = require('react-native').PermissionsAndroid;
}

import { useIndoorLocation } from '../context/IndoorLocationContext';

const BleDebugScreen = () => {
  // Web compatibility check
  if (Platform.OS === 'web') {
    return (
      <View style={styles.container}>
        <View style={styles.header}>
          <Text style={styles.title}>BLE Debug</Text>
        </View>
        <View style={styles.webFallback}>
          <Text style={styles.webFallbackTitle}>⚠️ Web Platform Detected</Text>
          <Text style={styles.webFallbackText}>
            BLE (Bluetooth Low Energy) functionality is not available on web platforms.
            This debug screen is designed for mobile devices (Android/iOS) only.
          </Text>
          <Text style={styles.webFallbackText}>
            Please use the mobile app to test BLE beacon scanning and indoor positioning.
          </Text>
        </View>
      </View>
    );
  }

  const {
    // State
    beacons,
    isTracking,
    bluetoothState,
    error,
    debugInfo,
    currentFloorConfig,
    
    // Actions
    startTracking,
    stopTracking,
    clearError,
    getPositioningStats,
    
    // Services
    bleService,
    positioningEngine,
    configManager
  } = useIndoorLocation();

  const [refreshing, setRefreshing] = useState(false);
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [showRawData, setShowRawData] = useState(false);
  const [scanHistory, setScanHistory] = useState([]);
  const [permissionStatus, setPermissionStatus] = useState({});

  // Auto refresh every 2 seconds
  useEffect(() => {
    if (!autoRefresh) return;

    const interval = setInterval(() => {
      // Force component re-render to show updated data
      setRefreshing(false);
    }, 2000);

    return () => clearInterval(interval);
  }, [autoRefresh]);

  // Track scan history
  useEffect(() => {
    if (beacons.length > 0) {
      const timestamp = new Date().toISOString();
      setScanHistory(prev => [
        { timestamp, beacons: [...beacons], count: beacons.length },
        ...prev.slice(0, 9) // Keep last 10 scans
      ]);
    }
  }, [beacons]);

  // Check permissions on mount
  useEffect(() => {
    checkPermissions();
  }, []);

  // Check BLE permissions
  const checkPermissions = async () => {
    if (Platform.OS === 'android') {
      try {
        const permissions = [
          PermissionsAndroid.PERMISSIONS.ACCESS_COARSE_LOCATION,
          PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
        ];

        // Android 12+ permissions
        if (Platform.Version >= 31) {
          permissions.push(
            PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN,
            PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT
          );
        }

        const results = {};
        for (const permission of permissions) {
          results[permission] = await PermissionsAndroid.check(permission);
        }
        
        setPermissionStatus(results);
      } catch (error) {
        console.error('Error checking permissions:', error);
      }
    }
  };

  // Request missing permissions
  const requestPermissions = async () => {
    if (Platform.OS === 'android') {
      try {
        const permissions = Object.keys(permissionStatus).filter(
          permission => !permissionStatus[permission]
        );

        if (permissions.length > 0) {
          const granted = await PermissionsAndroid.requestMultiple(permissions);
          setPermissionStatus(prev => ({ ...prev, ...granted }));
        }
      } catch (error) {
        Alert.alert('Error', 'Failed to request permissions: ' + error.message);
      }
    }
  };

  // Handle refresh
  const handleRefresh = async () => {
    setRefreshing(true);
    await checkPermissions();
    setTimeout(() => setRefreshing(false), 1000);
  };

  // Handle start/stop scanning
  const handleToggleScanning = async () => {
    if (isTracking) {
      await stopTracking();
    } else {
      await startTracking();
    }
  };

  // Clear scan history
  const clearScanHistory = () => {
    setScanHistory([]);
  };

  // Test beacon detection
  const testBeaconDetection = () => {
    const config = configManager.getConfig();
    const configuredBeacons = currentFloorConfig?.beacons || [];
    const detectedBeacons = beacons;

    const results = configuredBeacons.map(configBeacon => {
      const detected = detectedBeacons.find(b => b.id === configBeacon.id);
      return {
        id: configBeacon.id,
        name: configBeacon.name,
        configured: true,
        detected: !!detected,
        rssi: detected?.rssi,
        distance: detected?.distance,
        lastSeen: detected?.lastSeen
      };
    });

    // Add detected but not configured beacons
    detectedBeacons.forEach(beacon => {
      if (!results.find(r => r.id === beacon.id)) {
        results.push({
          id: beacon.id,
          name: 'Unknown',
          configured: false,
          detected: true,
          rssi: beacon.rssi,
          distance: beacon.distance,
          lastSeen: beacon.lastSeen
        });
      }
    });

    const message = results.map(r => {
      const status = r.configured && r.detected ? '✅' : 
                    r.configured && !r.detected ? '❌' : 
                    !r.configured && r.detected ? '⚠️' : '❓';
      return `${status} ${r.name} (${r.id})${r.detected ? ` - ${r.rssi}dBm` : ''}`;
    }).join('\n');

    Alert.alert('Beacon Detection Test', message, [{ text: 'OK' }]);
  };

  // Get statistics
  const stats = getPositioningStats();

  // Calculate signal quality
  const getSignalQuality = (rssi) => {
    if (rssi > -50) return { text: 'Excellent', color: '#34C759' };
    if (rssi > -60) return { text: 'Good', color: '#34C759' };
    if (rssi > -70) return { text: 'Fair', color: '#FF9500' };
    if (rssi > -80) return { text: 'Poor', color: '#FF3B30' };
    return { text: 'Very Poor', color: '#FF3B30' };
  };

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.title}>BLE Debug</Text>
        <TouchableOpacity
          style={[
            styles.scanButton,
            isTracking ? styles.scanButtonActive : styles.scanButtonInactive
          ]}
          onPress={handleToggleScanning}
        >
          <Text style={styles.scanButtonText}>
            {isTracking ? 'Stop Scan' : 'Start Scan'}
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

      <ScrollView
        style={styles.content}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} />
        }
      >
        {/* System Status */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>System Status</Text>
          <View style={styles.statusRow}>
            <Text style={styles.statusLabel}>Bluetooth:</Text>
            <Text style={[
              styles.statusValue,
              { color: bluetoothState === 'on' ? '#34C759' : '#FF3B30' }
            ]}>
              {bluetoothState.toUpperCase()}
            </Text>
          </View>
          <View style={styles.statusRow}>
            <Text style={styles.statusLabel}>Scanning:</Text>
            <Text style={[
              styles.statusValue,
              { color: isTracking ? '#34C759' : '#8E8E93' }
            ]}>
              {isTracking ? 'ACTIVE' : 'STOPPED'}
            </Text>
          </View>
          <View style={styles.statusRow}>
            <Text style={styles.statusLabel}>Beacons Detected:</Text>
            <Text style={styles.statusValue}>{beacons.length}</Text>
          </View>
        </View>

        {/* Permissions Status */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Permissions</Text>
            <TouchableOpacity onPress={requestPermissions} style={styles.smallButton}>
              <Text style={styles.smallButtonText}>Request</Text>
            </TouchableOpacity>
          </View>
          {Object.entries(permissionStatus).map(([permission, granted]) => (
            <View key={permission} style={styles.statusRow}>
              <Text style={styles.permissionLabel}>
                {permission.split('.').pop().replace('_', ' ')}:
              </Text>
              <Text style={[
                styles.statusValue,
                { color: granted ? '#34C759' : '#FF3B30' }
              ]}>
                {granted ? 'GRANTED' : 'DENIED'}
              </Text>
            </View>
          ))}
        </View>

        {/* Statistics */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Statistics</Text>
          <View style={styles.statusRow}>
            <Text style={styles.statusLabel}>Active Beacons:</Text>
            <Text style={styles.statusValue}>{stats.activeBeacons}/{stats.totalBeacons}</Text>
          </View>
          <View style={styles.statusRow}>
            <Text style={styles.statusLabel}>Average RSSI:</Text>
            <Text style={styles.statusValue}>{stats.averageRssi.toFixed(0)} dBm</Text>
          </View>
          <View style={styles.statusRow}>
            <Text style={styles.statusLabel}>Scan Count:</Text>
            <Text style={styles.statusValue}>{stats.scanCount}</Text>
          </View>
          <View style={styles.statusRow}>
            <Text style={styles.statusLabel}>Last Update:</Text>
            <Text style={styles.statusValue}>
              {stats.lastUpdate ? new Date(stats.lastUpdate).toLocaleTimeString() : 'Never'}
            </Text>
          </View>
        </View>

        {/* Controls */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Controls</Text>
          <View style={styles.controlRow}>
            <Text style={styles.controlLabel}>Auto Refresh:</Text>
            <Switch value={autoRefresh} onValueChange={setAutoRefresh} />
          </View>
          <View style={styles.controlRow}>
            <Text style={styles.controlLabel}>Show Raw Data:</Text>
            <Switch value={showRawData} onValueChange={setShowRawData} />
          </View>
          <TouchableOpacity onPress={testBeaconDetection} style={styles.testButton}>
            <Text style={styles.testButtonText}>Test Beacon Detection</Text>
          </TouchableOpacity>
        </View>

        {/* Current Beacons */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Detected Beacons ({beacons.length})</Text>
          {beacons.length === 0 ? (
            <Text style={styles.noDataText}>No beacons detected</Text>
          ) : (
            beacons.map((beacon, index) => {
              const quality = getSignalQuality(beacon.rssi);
              return (
                <View key={`${beacon.id}-${index}`} style={styles.beaconItem}>
                  <View style={styles.beaconHeader}>
                    <Text style={styles.beaconId}>{beacon.id}</Text>
                    <Text style={[styles.signalQuality, { color: quality.color }]}>
                      {quality.text}
                    </Text>
                  </View>
                  <Text style={styles.beaconDetail}>
                    RSSI: {beacon.rssi} dBm | Distance: {beacon.distance?.toFixed(1) || 'N/A'}m
                  </Text>
                  {beacon.txPower && (
                    <Text style={styles.beaconDetail}>TX Power: {beacon.txPower} dBm</Text>
                  )}
                  {showRawData && (
                    <View style={styles.rawData}>
                      <Text style={styles.rawDataText}>
                        Raw: {JSON.stringify(beacon, null, 2)}
                      </Text>
                    </View>
                  )}
                </View>
              );
            })
          )}
        </View>

        {/* Scan History */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Scan History</Text>
            <TouchableOpacity onPress={clearScanHistory} style={styles.smallButton}>
              <Text style={styles.smallButtonText}>Clear</Text>
            </TouchableOpacity>
          </View>
          {scanHistory.length === 0 ? (
            <Text style={styles.noDataText}>No scan history</Text>
          ) : (
            scanHistory.map((scan, index) => (
              <View key={index} style={styles.historyItem}>
                <Text style={styles.historyTimestamp}>
                  {new Date(scan.timestamp).toLocaleTimeString()}
                </Text>
                <Text style={styles.historyCount}>
                  {scan.count} beacon{scan.count !== 1 ? 's' : ''}
                </Text>
              </View>
            ))
          )}
        </View>

        {/* Debug Information */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Debug Information</Text>
          <Text style={styles.debugText}>
            Positioning Method: {debugInfo.positioningMethod || 'None'}
          </Text>
          <Text style={styles.debugText}>
            Kalman Filter: {debugInfo.kalmanState ? 'Active' : 'Inactive'}
          </Text>
          <Text style={styles.debugText}>
            Raw Beacon Count: {debugInfo.rawBeacons?.length || 0}
          </Text>
          <Text style={styles.debugText}>
            RSSI Values: {JSON.stringify(debugInfo.rssiValues || {}, null, 2)}
          </Text>
        </View>
      </ScrollView>
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
  scanButton: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8,
    minWidth: 80,
    alignItems: 'center',
  },
  scanButtonActive: {
    backgroundColor: '#FF3B30',
  },
  scanButtonInactive: {
    backgroundColor: '#007AFF',
  },
  scanButtonText: {
    color: 'white',
    fontWeight: 'bold',
    fontSize: 12,
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
  content: {
    flex: 1,
  },
  section: {
    backgroundColor: 'white',
    margin: 8,
    borderRadius: 8,
    padding: 16,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    marginBottom: 12,
    color: '#000',
  },
  statusRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  statusLabel: {
    fontSize: 14,
    color: '#666',
  },
  statusValue: {
    fontSize: 14,
    fontWeight: 'bold',
  },
  permissionLabel: {
    fontSize: 12,
    color: '#666',
    flex: 1,
  },
  controlRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  controlLabel: {
    fontSize: 14,
    color: '#666',
  },
  testButton: {
    backgroundColor: '#007AFF',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 6,
    alignItems: 'center',
    marginTop: 8,
  },
  testButtonText: {
    color: 'white',
    fontWeight: 'bold',
    fontSize: 14,
  },
  smallButton: {
    backgroundColor: '#8E8E93',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 4,
  },
  smallButtonText: {
    color: 'white',
    fontSize: 10,
    fontWeight: 'bold',
  },
  noDataText: {
    textAlign: 'center',
    color: '#8E8E93',
    fontStyle: 'italic',
    marginVertical: 8,
  },
  beaconItem: {
    backgroundColor: '#f8f8f8',
    padding: 12,
    borderRadius: 6,
    marginBottom: 8,
  },
  beaconHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  beaconId: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#000',
  },
  signalQuality: {
    fontSize: 12,
    fontWeight: 'bold',
  },
  beaconDetail: {
    fontSize: 12,
    color: '#666',
    marginBottom: 2,
  },
  rawData: {
    marginTop: 8,
    padding: 8,
    backgroundColor: '#e8e8e8',
    borderRadius: 4,
  },
  rawDataText: {
    fontSize: 10,
    color: '#444',
    fontFamily: 'monospace',
  },
  historyItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 4,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  historyTimestamp: {
    fontSize: 12,
    color: '#666',
  },
  historyCount: {
    fontSize: 12,
    color: '#007AFF',
    fontWeight: 'bold',
  },
  debugText: {
    fontSize: 12,
    color: '#444',
    marginBottom: 4,
    fontFamily: 'monospace',
  },
  webFallback: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 16,
  },
  webFallbackTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#FF3B30',
    marginBottom: 12,
  },
  webFallbackText: {
    fontSize: 14,
    color: '#666',
    textAlign: 'center',
  },
});

export default BleDebugScreen;