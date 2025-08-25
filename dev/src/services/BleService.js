// src/services/BleService.js
import { BleManager } from 'react-native-ble-plx';
import { Platform, Alert } from 'react-native';

// Conditional import for Android-only PermissionsAndroid
let PermissionsAndroid;
if (Platform.OS === 'android') {
  PermissionsAndroid = require('react-native').PermissionsAndroid;
}

import { BeaconParser } from '../utils/BeaconParser';

class BleService {
  constructor() {
    this.bleManager = new BleManager();
    this.scanning = false;
    this.beacons = new Map();
    this.listeners = new Map();
    this.scanSubscription = null;
    this.bluetoothState = 'Unknown';
    this.debugMode = __DEV__;
    this.scanStats = {
      startTime: null,
      devicesFound: 0,
      beaconsDetected: 0,
      errors: []
    };
    this.isInitialized = false;
    this.burstIntervalId = null;
    this.burstTimeoutId = null;
    this.burstActive = false;
    this.BURST_DURATION_MS = 20000; // 20 seconds
    this.BURST_INTERVAL_MS = 20000; // 20 seconds
  }

  // Initialize BLE service
  async initialize() {
    try {
      if (this.isInitialized) {
        this.log('BLE Service already initialized');
        return true;
      }

      this.log('Initializing BLE Service...');
      
      // Setup Bluetooth state monitoring
      this.bleManager.onStateChange((state) => {
        this.bluetoothState = state;
        this.log(`Bluetooth state changed: ${state}`);
        this.notifyListeners('bluetoothStateChanged', state);
        
        // Auto-enable Bluetooth if needed
        if (state === 'PoweredOff') {
          this.enableBluetooth();
        }
      }, true);

      // Check initial Bluetooth state
      const state = await this.bleManager.state();
      this.bluetoothState = state;
      this.log(`Initial Bluetooth state: ${state}`);

      if (state !== 'PoweredOn') {
        await this.enableBluetooth();
      }

      // Request permissions
      await this.requestPermissions();
      
      this.isInitialized = true;
      this.log('BLE Service initialized successfully');
      return true;
    } catch (error) {
      this.logError('Failed to initialize BLE Service', error);
      throw error;
    }
  }

  // Request all required permissions
  async requestPermissions() {
    try {
      if (Platform.OS === 'android') {
        const permissions = [
          PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
          PermissionsAndroid.PERMISSIONS.ACCESS_COARSE_LOCATION,
        ];

        // Android 12+ specific permissions
        if (Platform.Version >= 31) {
          permissions.push(
            PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN,
            PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT
          );
        }

        const granted = await PermissionsAndroid.requestMultiple(permissions);
        
        const allGranted = Object.values(granted).every(
          permission => permission === PermissionsAndroid.RESULTS.GRANTED
        );

        if (!allGranted) {
          const deniedPermissions = Object.entries(granted)
            .filter(([_, status]) => status !== PermissionsAndroid.RESULTS.GRANTED)
            .map(([permission, _]) => permission);
          
          this.logError('Permission denied for:', deniedPermissions);
          throw new Error(`Required permissions not granted: ${deniedPermissions.join(', ')}`);
        }

        this.log('All Android permissions granted');
      }
      
      return true;
    } catch (error) {
      this.logError('Permission request failed', error);
      throw error;
    }
  }

  // Enable Bluetooth if disabled
  async enableBluetooth() {
    return new Promise((resolve, reject) => {
      if (Platform.OS === 'android') {
        Alert.alert(
          'Bluetooth Required',
          'Please enable Bluetooth to use indoor tracking',
          [
            {
              text: 'Cancel',
              onPress: () => reject(new Error('Bluetooth not enabled')),
              style: 'cancel'
            },
            {
              text: 'Enable',
              onPress: async () => {
                try {
                  await this.bleManager.enable();
                  resolve();
                } catch (error) {
                  reject(error);
                }
              }
            }
          ]
        );
      } else {
        Alert.alert(
          'Bluetooth Required',
          'Please enable Bluetooth in Settings to use indoor tracking',
          [{ text: 'OK', onPress: () => reject(new Error('Bluetooth not enabled')) }]
        );
      }
    });
  }

  // Start scanning for beacons
  async startScanning(options = {}) {
    try {
      if (!this.isInitialized) {
        await this.initialize();
      }

      if (this.scanning) {
        this.log('Already scanning, stopping current scan first');
        await this.stopScanning();
      }

      if (this.bluetoothState !== 'PoweredOn') {
        throw new Error(`Bluetooth not ready. State: ${this.bluetoothState}`);
      }

      this.scanning = true;
      this.beacons.clear();
      this.scanStats = {
        startTime: Date.now(),
        devicesFound: 0,
        beaconsDetected: 0,
        errors: []
      };

      this.log('Starting BLE scan...');
      this.notifyListeners('scanStarted');

      // Enhanced scan options
      const scanOptions = {
        allowDuplicates: options.allowDuplicates !== false, // Default to true
        scanMode: Platform.OS === 'android' ? 'lowLatency' : undefined,
        callbackType: Platform.OS === 'android' ? 'all' : undefined,
        ...options
      };

      this.scanSubscription = this.bleManager.startDeviceScan(
        null, // Service UUIDs - null to scan all
        scanOptions,
        (error, device) => {
          if (error) {
            this.logError('Scan error', error);
            this.scanStats.errors.push({
              timestamp: Date.now(),
              error: error.message
            });
            this.notifyListeners('scanError', error);
            return;
          }

          if (device) {
            this.handleDeviceDiscovered(device);
          }
        }
      );

      return true;
    } catch (error) {
      this.scanning = false;
      this.logError('Failed to start scanning', error);
      this.notifyListeners('scanError', error);
      throw error;
    }
  }

  // Handle discovered device
  handleDeviceDiscovered(device) {
    this.scanStats.devicesFound++;
    
    try {
      // Parse device as beacon
      const beaconData = BeaconParser.parseDevice(device);
      
      if (beaconData) {
        this.handleBeaconDetected(beaconData);
      } else {
        this.handleGenericDevice(device);
      }
    } catch (error) {
      this.logError('Error processing device', error);
    }
  }

  // Handle detected beacon
  handleBeaconDetected(beaconData) {
    this.scanStats.beaconsDetected++;
    
    const beaconId = BeaconParser.getBeaconIdentifier(beaconData);
    const existingBeacon = this.beacons.get(beaconId);
    
    // Update beacon data with device info and timestamp
    const updatedBeacon = {
      ...beaconData,
      id: beaconId,
      lastSeen: Date.now(),
      rssi: beaconData.rssi,
      timestamp: Date.now()
    };

    // Only update if RSSI is better or beacon is new
    if (!existingBeacon || beaconData.rssi > existingBeacon.rssi) {
      this.beacons.set(beaconId, updatedBeacon);
      this.log(`Beacon detected: ${beaconData.type} - ${beaconId} (RSSI: ${beaconData.rssi})`);
      this.notifyListeners('beaconDetected', updatedBeacon);
    }
  }

  // Handle generic device (non-beacon)
  handleGenericDevice(device) {
    // Suppressed: Do not log generic devices
  }

  // Stop scanning
  async stopScanning() {
    try {
      if (this.scanSubscription) {
        this.bleManager.stopDeviceScan();
        this.scanSubscription = null;
      }
      
      this.scanning = false;
      this.log('BLE scan stopped');
      this.notifyListeners('scanStopped');
      
      return true;
    } catch (error) {
      this.logError('Failed to stop scanning', error);
      throw error;
    }
  }

  // Start burst scanning (20s burst, 20s interval)
  async startBurstScanning(options = {}) {
    console.log('[BURST] startBurstScanning() called');
    if (this.burstActive) {
      console.log('[BURST] Burst scanning already active');
      return;
    }
    if (this.bluetoothState !== 'PoweredOn') {
      console.log(`[BURST] Burst scanning requested but Bluetooth state is: ${this.bluetoothState}`);
      return;
    }
    this.burstActive = true;
    console.log('[BURST] === Burst scanning STARTED ===');
    const doBurst = async () => {
      console.log('[BURST] === Scan burst STARTED ===');
      await this.startScanning(options);
      this.burstTimeoutId = setTimeout(async () => {
        await this.stopScanning();
        console.log('[BURST] === Scan burst STOPPED after 20s ===');
      }, this.BURST_DURATION_MS);
    };
    await doBurst();
    this.burstIntervalId = setInterval(async () => {
      console.log('[BURST] === Scan burst RESTART (interval fired) ===');
      await this.startScanning(options);
      if (this.burstTimeoutId) clearTimeout(this.burstTimeoutId);
      this.burstTimeoutId = setTimeout(async () => {
        await this.stopScanning();
        console.log('[BURST] === Scan burst STOPPED after 20s ===');
      }, this.BURST_DURATION_MS);
    }, this.BURST_INTERVAL_MS);
  }

  // Stop burst scanning
  async stopBurstScanning() {
    console.log('[BURST] stopBurstScanning() called');
    if (this.burstIntervalId) {
      clearInterval(this.burstIntervalId);
      this.burstIntervalId = null;
    }
    if (this.burstTimeoutId) {
      clearTimeout(this.burstTimeoutId);
      this.burstTimeoutId = null;
    }
    await this.stopScanning();
    this.burstActive = false;
    console.log('[BURST] === Burst scanning STOPPED ===');
  }

  // Get all detected beacons
  getBeacons() {
    return Array.from(this.beacons.values());
  }

  // Get active beacons (seen in last 30 seconds)
  getActiveBeacons() {
    const now = Date.now();
    const activeThreshold = 30 * 1000; // 30 seconds
    
    return Array.from(this.beacons.values()).filter(
      beacon => (now - beacon.lastSeen) < activeThreshold
    );
  }

  // Get scan statistics
  getScanStats() {
    const now = Date.now();
    const duration = this.scanStats.startTime ? now - this.scanStats.startTime : 0;
    
    return {
      ...this.scanStats,
      duration,
      isScanning: this.scanning,
      bluetoothState: this.bluetoothState
    };
  }

  // Clear all beacons
  clearBeacons() {
    this.beacons.clear();
    this.log('Beacons cleared');
    this.notifyListeners('beaconsCleared');
  }

  // Add event listener
  addListener(event, callback) {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, []);
    }
    this.listeners.get(event).push(callback);
    
    // Return unsubscribe function
    return () => {
      const callbacks = this.listeners.get(event);
      if (callbacks) {
        const index = callbacks.indexOf(callback);
        if (index > -1) {
          callbacks.splice(index, 1);
        }
      }
    };
  }

  // Remove all listeners for an event
  removeAllListeners(event) {
    this.listeners.delete(event);
  }

  // Notify all listeners for an event
  notifyListeners(event, data) {
    const callbacks = this.listeners.get(event);
    if (callbacks) {
      callbacks.forEach(callback => {
        try {
          callback(data);
        } catch (error) {
          this.logError(`Error in ${event} listener`, error);
        }
      });
    }
  }

  // Set debug mode
  setDebugMode(enabled) {
    this.debugMode = enabled;
    this.log(`Debug mode ${enabled ? 'enabled' : 'disabled'}`);
  }

  // Log message
  log(message, data = null) {
    if (this.debugMode) {
      console.log(`[BleService] ${message}`, data || '');
    }
  }

  // Log error
  logError(message, error) {
    console.error(`[BleService] ${message}:`, error);
    if (this.debugMode) {
      console.error(error);
    }
  }

  // Get Bluetooth state
  getBluetoothState() {
    return this.bluetoothState;
  }

  // Check if scanning
  isScanning() {
    return this.scanning;
  }

  // Check if initialized
  isServiceInitialized() {
    return this.isInitialized;
  }

  // Destroy service and cleanup
  destroy() {
    try {
      this.stopScanning();
      this.beacons.clear();
      this.listeners.clear();
      this.bleManager.destroy();
      this.isInitialized = false;
      this.log('BLE Service destroyed');
    } catch (error) {
      this.logError('Error destroying BLE Service', error);
    }
  }
}

// Export singleton instance
const bleService = new BleService();
export default bleService;