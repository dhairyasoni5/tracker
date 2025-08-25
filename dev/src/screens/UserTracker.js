import { MaterialIcons as Icon } from '@expo/vector-icons';
import * as Location from 'expo-location';
import { signOut } from 'firebase/auth';
import {
    arrayRemove,
    arrayUnion,
    collection,
    doc,
    getDoc,
    getDocs,
    query,
    updateDoc,
    where
} from 'firebase/firestore';
import React, { useEffect, useRef, useState } from 'react';
import {
    ActivityIndicator,
    Alert,
    Animated,
    Dimensions,
    Modal,
    PermissionsAndroid,
    Platform,
    RefreshControl,
    SafeAreaView,
    ScrollView,
    StatusBar,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    View
} from 'react-native';

import { Buffer } from 'buffer';
import { BleManager } from 'react-native-ble-plx';
import { auth, db } from '../firebase/firebaseConfig';
import { useAuth } from '../utils/AuthContext';
import ErrorHandler, { ERROR_SEVERITY } from '../utils/ErrorHandler';


import MapView, { Circle, Marker } from 'react-native-maps';
import { useIndoorLocation } from '../context/IndoorLocationContext';
// --- ADDED: Firestore imports for beacon-room mapping ---
import { collection as firestoreCollection, getDocs as firestoreGetDocs, updateDoc as firestoreUpdateDoc } from 'firebase/firestore';


const TARGET_BEACON_MACS = [
  'F0:03:2A:53:00:CE', // Cafeteria
  'F0:03:2A:53:00:D2', // Office
  'F0:03:2A:53:00:C9', // Main Area
];
const TARGET_UUID = 'FDA50693-A4E2-4FB1-AFCF-C6EB07647825';
const TARGET_MAJOR = 10835;

const { width, height } = Dimensions.get('window');

const UserTracker = ({ navigation }) => {
  
  const { userData, clearAuthState } = useAuth();
  const [indoorMapVisible, setIndoorMapVisible] = useState(false);
  const {
    // BLE and Indoor Location State
    beacons,
    isTracking,
    bluetoothState,
    error: bleError,
    debugInfo,
    
    // Actions
    startTracking,
    stopTracking,
    clearError: clearBleError,
    
    // Services
    bleService
  } = useIndoorLocation();
  const [supervisorInfo, setSupervisorInfo] = useState(null);
  const [supervisors, setSupervisors] = useState([]);
  const [supervisorCode, setSupervisorCode] = useState('');
  const [currentVisit, setCurrentVisit] = useState(null);
  const [visitHistory, setVisitHistory] = useState([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [userStatus, setUserStatus] = useState('not-in-visit'); // 'not-in-visit', 'checked-in', 'checked-out'
  const [emergencyMode, setEmergencyMode] = useState(false);

  const [locationSharing, setLocationSharing] = useState(true);
  const [visitCode, setVisitCode] = useState('');
  const [studentLocation, setStudentLocation] = useState(null);
  const [locationPermission, setLocationPermission] = useState(null);
  const [mapLocationLoading, setMapLocationLoading] = useState(false);
  const [assignedVisit, setAssignedVisit] = useState(null);
  const [locationUpdateInterval, setLocationUpdateInterval] = useState(null);
  const [autoCheckInOutLoading, setAutoCheckInOutLoading] = useState(false);
  // Add missing scanIntervalId state
  const [scanIntervalId, setScanIntervalId] = useState(null);
  // Beacon Scanner State
  // Beacon Scanner State
  const bleManagerRef = useRef(new BleManager());
  const [scanning, setScanning] = useState(false);
  // --- ADDED: State for beacon-room mapping ---
  const [beaconRoomMap, setBeaconRoomMap] = useState({});
  
  // --- ADDED: Room confirmation buffer (sliding window majority) ---
  const ROOM_CONFIRMATION_WINDOW = 5; // Buffer size
  const ROOM_CONFIRMATION_THRESHOLD = 3; // Minimum times the same room must appear
  const roomConfirmationBufferRef = useRef([]); // Buffer of last N detected roomIds (can include null)
  const lastConfirmedRoomRef = useRef(null); // Track last confirmed roomId
  const lastUserIdRef = useRef(null); // Track last userId to reset buffer on user change
  
  // Get location name from beacon minor value
  const getLocationName = (minor) => {
    switch (minor) {
      case 1:
        return 'Cafeteria';
      case 2:
        return 'Office';
      case 3:
        return 'Main Area';
      default:
        return `Area ${minor}`;
    }
  };

  // Filter beacons to only show target beacons
  const targetBeacons = beacons.filter(beacon => {
    if (beacon.type === 'iBeacon') {
      return beacon.uuid === TARGET_UUID && beacon.major === TARGET_MAJOR;
    }
    return false;
  });

  // Start location tracking with BLE
  const startLocationTracking = async () => {
    try {
      if (!isTracking) {
        await startTracking();
      }
    } catch (error) {
      console.error('Failed to start location tracking:', error);
      Alert.alert('Error', 'Failed to start location tracking');
    }
  };

  // Stop location tracking
  const stopLocationTracking = async () => {
    try {
      if (isTracking) {
        await stopTracking();
          }
        } catch (error) {
      console.error('Failed to stop location tracking:', error);
    }
  };

  // Request location permissions
  const requestLocationPermissions = async () => {
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      setLocationPermission(status);
      return status === 'granted';
    } catch (error) {
      console.error('Error requesting location permissions:', error);
      return false;
    }
  };

  // Start animations
  const startAnimations = () => {
    // Animation logic can be added here if needed
  };

  const parseIBeaconData = (manufacturerData) => {
    try {
      let buffer;
      if (typeof manufacturerData === 'string') {
        buffer = Buffer.from(manufacturerData, 'base64');
      } else if (manufacturerData instanceof Uint8Array) {
        buffer = Buffer.from(manufacturerData);
      } else {
        return null;
      }
  
      // Debug raw buffer
      console.log('Raw beacon data:', buffer.toString('hex'));
  
      if (buffer.length < 25) return null;
      
      // Check Apple company ID (0x004C) - little-endian
      if (buffer.readUInt16LE(0) !== 0x004C) {
        console.log('Not Apple beacon');
        return null;
      }
      
      // Verify iBeacon prefix (0x02 0x15)
      if (buffer[2] !== 0x02 || buffer[3] !== 0x15) {
        console.log('Not iBeacon format');
        return null;
      }
  
      // Extract UUID
      const uuidBuffer = buffer.slice(4, 20);
      const uuid = [
        uuidBuffer.toString('hex', 0, 4),
        uuidBuffer.toString('hex', 4, 6),
        uuidBuffer.toString('hex', 6, 8),
        uuidBuffer.toString('hex', 8, 10),
        uuidBuffer.toString('hex', 10, 16)
      ].join('-').toUpperCase();
  
      const major = buffer.readUInt16BE(20);
      const minor = buffer.readUInt16BE(22);
      const txPower = buffer.readInt8(24);
      
      return { uuid, major, minor, txPower };
    } catch (e) {
      console.error('iBeacon parsing error:', e);
      return null;
    }
  };

  const requestBlePermissions = async () => {
    try {
      if (Platform.OS === 'android') {
        // Check Android API level for permission requirements
        const androidVersion = Platform.Version;
        
        let permissions = [
          PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
        ];

        // Add Bluetooth permissions for Android 12+ (API 31+)
        if (androidVersion >= 31) {
          permissions.push(
            PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN,
            PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT
          );
        } else {
          // For older Android versions, you might need these
          permissions.push(
            PermissionsAndroid.PERMISSIONS.ACCESS_COARSE_LOCATION,
            PermissionsAndroid.PERMISSIONS.BLUETOOTH,
            PermissionsAndroid.PERMISSIONS.BLUETOOTH_ADMIN
          );
        }

        const granted = await PermissionsAndroid.requestMultiple(permissions);
        
        console.log('Android permissions granted:', granted);
        
        // Check if all required permissions are granted
        const allGranted = permissions.every(permission => 
          granted[permission] === PermissionsAndroid.RESULTS.GRANTED
        );
        
        if (!allGranted) {
          Alert.alert(
            'Permissions Required',
            'This app needs Bluetooth and Location permissions to function properly.',
            [{ text: 'OK' }]
          );
          return false;
        }
        
        return true;
      } else {
        // iOS permissions
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status !== 'granted') {
          Alert.alert(
            'Location Permission Required',
            'This app needs location permission to detect beacons.',
            [{ text: 'OK' }]
          );
          return false;
        }
        return true;
      }
    } catch (error) {
      console.error('Error requesting BLE permissions:', error);
      Alert.alert('Error', 'Failed to request permissions');
      return false;
    }
  };

  const checkBlePermissions = async () => {
    try {
      if (Platform.OS === 'android') {
        const permissions = [
          PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
          PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN,
          PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT,
        ];

        const results = await Promise.all(
          permissions.map(permission => 
            PermissionsAndroid.check(permission)
          )
        );

        return results.every(result => result === true);
      } else {
        const { status } = await Location.getForegroundPermissionsAsync();
        return status === 'granted';
      }
    } catch (error) {
      console.error('Error checking permissions:', error);
      return false;
    }
  };



  // Initialize permissions on component mount
  useEffect(() => {
    const initializePermissions = async () => {
      setLoading(true);
      try {
        const hasPermissions = await checkBlePermissions();
        if (!hasPermissions) {
          await requestBlePermissions();
        }
        await requestLocationPermissions();
      } catch (error) {
        console.error('Error initializing permissions:', error);
      } finally {
        setLoading(false);
      }
    };

    initializePermissions();
  }, []);


  // --- Modified BLE Scan Logic: 10s bursts, repeating ---
  const startBeaconScan = async () => {
    console.log('[BLE] startBeaconScan called');
    // Prevent multiple intervals
    if (scanIntervalId) return;
    setBeacons([]);
    setBleError(null);
    setScanning(true);
    try {
      const hasPermission = await requestBlePermissions();
      if (!hasPermission) {
        setBleError('Bluetooth and Location permissions are required');
        setScanning(false);
        return;
      }
      // Function to start a single scan burst
      const doScan = () => {
        console.log('[BLE] === Scan burst STARTED ===');
        const scanOptions = {
          allowDuplicates: true,
          scanMode: 2 // SCAN_MODE_LOW_LATENCY
        };
        bleManagerRef.current.startDeviceScan(null, scanOptions,
          (error, device) => {
            if (error) {
              console.error('BLE scan error:', error);
              setBleError(error.message);
              setScanning(false);
              return;
            }
            // Debug all discovered devices
            console.log(`[BLE] Discovered: ${device.id} | ${device.name || 'Unnamed'} | RSSI: ${device.rssi}`);
            if (device?.manufacturerData) {
              const iBeacon = parseIBeaconData(device.manufacturerData);
              if (iBeacon) {
                console.log('[BLE] iBeacon detected:', iBeacon);
                if (iBeacon.uuid === TARGET_UUID && iBeacon.major === TARGET_MAJOR) {
                  const location = getLocationName(iBeacon.minor);
                  console.log(`[BLE] ✅ HoneyComm Beacon: ${location} | Minor: ${iBeacon.minor}`);
                  setBeacons(prev => {
                    const now = Date.now();
                    // Check if beacon already present
                    const alreadyPresent = prev.some(b => b.minor === iBeacon.minor);
                    if (alreadyPresent) {
                      console.log(`[BLE] Beacon minor ${iBeacon.minor} already present, not adding again.`);
                      return prev;
                    }
                    // Update or add beacon, and keep timestamp
                    let updated = prev.filter(b => b.minor !== iBeacon.minor);
                    updated.push({
                      id: device.id,
                      name: device.name || 'Unknown',
                      minor: iBeacon.minor,
                      rssi: device.rssi,
                      location,
                      lastSeen: now
                    });
                    // Prune beacons not seen in last 15s
                    const pruned = updated.filter(b => now - (b.lastSeen || now) < 15000);
                    if (pruned.length !== updated.length) {
                      console.log('[BLE] Pruned old beacons:', updated.length - pruned.length);
                    }
                    return pruned;
                  });
                }
              }
            }
          }
        );
        // Stop scan after 25s (was 30s)
        const timeout = setTimeout(() => {
          bleManagerRef.current.stopDeviceScan();
          console.log('[BLE] === Scan burst STOPPED after 25s ===');
        }, 25000); // 25,000 ms = 25 seconds
        setScanTimeoutId(timeout);
      };
      // Start first scan burst immediately
      doScan();
      // Set interval to repeat every 25s (was 30s)
      const interval = setInterval(() => {
        console.log('[BLE] === Scan burst RESTART (interval fired) ===');
        doScan();
      }, 25000); // 25,000 ms = 25 seconds
      setScanIntervalId(interval);
    } catch (e) {
      console.error('Scan startup error:', e);
      setBleError(e.message);
      setScanning(false);
    }
  };

  const stopBeaconScan = () => {
    bleManagerRef.current.stopDeviceScan();
    setScanning(false);
    if (scanIntervalId) {
      clearInterval(scanIntervalId);
      setScanIntervalId(null);
    }
    if (scanTimeoutId) {
      clearTimeout(scanTimeoutId);
      setScanTimeoutId(null);
    }
    console.log('[BLE] stopBeaconScan called. Scanning stopped and timers cleared');
  };

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      bleManagerRef.current?.destroy();
      if (scanIntervalId) clearInterval(scanIntervalId);
      if (scanTimeoutId) clearTimeout(scanTimeoutId);
    };
  }, []);
  
  // Animation values
  const pulseAnim = new Animated.Value(1);
  const emergencyPulse = new Animated.Value(1);

  // Student is considered checked in if userStatus === 'checked-in'
  const isCheckedIn = userStatus === 'checked-in';

  useEffect(() => {
    if (userData && userData.uid) {
      fetchSupervisorInfo();
      fetchAllSupervisors();
      fetchCurrentVisit();
      fetchVisitHistory();
      fetchAssignedVisit();
      startAnimations();
    }
  }, [userData]);

  // Add new useEffect for automatic check-in/check-out
  useEffect(() => {
    let intervalId = null;

    const startLocationTracking = async () => {
      if (!assignedVisit || !assignedVisit.locationCoordinates) return;

      // Clear any existing interval
      if (intervalId) {
        clearInterval(intervalId);
      }

      // Start new interval for location updates
      // Check every 10 seconds to ensure timely check-in/check-out
      // This provides a good balance between battery life and responsiveness
      intervalId = setInterval(async () => {
        try {
          const coords = await requestAndFetchLocation();
          if (!coords) return;

          setStudentLocation(coords);
          
          // Calculate distance to visit location
          const distance = getDistance(
            coords.latitude,
            coords.longitude,
            assignedVisit.locationCoordinates.latitude,
            assignedVisit.locationCoordinates.longitude
          );

          // If student is within 500m and not checked in, auto check-in
          if (distance <= 500 && userStatus !== 'checked-in') {
            setAutoCheckInOutLoading(true);
            const visitRef = doc(db, 'visits', assignedVisit.id);
            const now = new Date().toISOString();
            
            await updateDoc(visitRef, {
              'attendance.checkedIn': arrayUnion(userData.uid),
              'attendance.absent': arrayRemove(userData.uid),
              [`attendance.checkInTimes.${userData.uid}`]: now
            });

            await updateDoc(doc(db, 'users', userData.uid), {
              lastKnownLocation: {
                latitude: coords.latitude,
                longitude: coords.longitude,
                timestamp: now
              }
            });

            setCurrentVisit(assignedVisit);
            setUserStatus('checked-in');
            setAutoCheckInOutLoading(false);
            Alert.alert('Auto Check-in', 'You have been automatically checked in to your assigned visit.');
          }
          // If student is outside 500m and checked in, auto check-out
          else if (distance > 500 && userStatus === 'checked-in') {
            setAutoCheckInOutLoading(true);
            const visitRef = doc(db, 'visits', assignedVisit.id);
            const now = new Date().toISOString();
            
            await updateDoc(visitRef, {
              'attendance.checkedOut': arrayUnion(userData.uid),
              'attendance.checkedIn': arrayRemove(userData.uid),
              [`attendance.checkOutTimes.${userData.uid}`]: now
            });

            setUserStatus('checked-out');
            setAutoCheckInOutLoading(false);
            Alert.alert('Auto Check-out', 'You have been automatically checked out as you left the visit area.');
          }
        } catch (error) {
          console.error('Location tracking error:', error);
          ErrorHandler.logError(error, {
            action: 'autoCheckInOut',
            userId: userData?.uid,
            visitId: assignedVisit?.id
          }, ERROR_SEVERITY.MEDIUM);
          setAutoCheckInOutLoading(false);
        }
      }, 10000); // Check every 10 seconds

      setLocationUpdateInterval(intervalId);
    };

    startLocationTracking();

    // Cleanup interval on unmount or when assignedVisit changes
    return () => {
      if (intervalId) {
        clearInterval(intervalId);
      }
    };
  }, [assignedVisit, userStatus]);

  useEffect(() => {
    if (isCheckedIn && !studentLocation) {
      setMapLocationLoading(true);
      (async () => {
        const coords = await requestAndFetchLocation();
        if (coords) setStudentLocation(coords);
        setMapLocationLoading(false);
      })();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isCheckedIn]);

  

  const fetchSupervisorInfo = async () => {
    if (!userData?.supervisorCode) {
      return;
    }
    
    try {
      const supervisorsQuery = query(
        collection(db, 'users'),
        where('role', '==', 'supervisor'),
        where('supervisorCode', '==', userData.supervisorCode)
      );
      const querySnapshot = await getDocs(supervisorsQuery);
      
      if (!querySnapshot.empty) {
        const supervisorData = querySnapshot.docs[0].data();
        setSupervisorInfo({
          fullName: supervisorData.fullName,
          code: userData.supervisorCode,
          email: supervisorData.email
        });
      }
    } catch (error) {
      console.error('fetchSupervisorInfo error:', error);
      ErrorHandler.logError(error, {
        action: 'fetchSupervisorInfo',
        userId: userData?.uid
      }, ERROR_SEVERITY.LOW);
    }
  };

  const fetchAllSupervisors = async () => {
    if (!userData?.uid) return;
    
    try {
      const userRef = doc(db, 'users', userData.uid);
      const userDoc = await getDoc(userRef);
      
      if (userDoc.exists()) {
        const userData = userDoc.data();
        const supervisorCodes = userData.supervisorCodes || [];
        
        if (supervisorCodes.length > 0) {
          const supervisorsQuery = query(
            collection(db, 'users'),
            where('role', '==', 'supervisor'),
            where('supervisorCode', 'in', supervisorCodes)
          );
          
          const querySnapshot = await getDocs(supervisorsQuery);
          const supervisorsList = [];
          
          querySnapshot.forEach((doc) => {
            const supervisorData = doc.data();
            supervisorsList.push({
              id: doc.id,
              fullName: supervisorData.fullName,
              code: supervisorData.supervisorCode,
              email: supervisorData.email
            });
          });
          
          setSupervisors(supervisorsList);
        }
      }
    } catch (error) {
      console.error('fetchAllSupervisors error:', error);
      ErrorHandler.logError(error, {
        action: 'fetchAllSupervisors',
        userId: userData?.uid
      }, ERROR_SEVERITY.LOW);
    }
  };

  const fetchCurrentVisit = async () => {
    if (!userData?.uid) {
      setLoading(false);
      return;
    }
    try {
      const visitsQuery = query(
        collection(db, 'visits'),
        where('assignedStudents', 'array-contains', userData.uid)
      );
      const querySnapshot = await getDocs(visitsQuery);
      let activeVisit = null;
      let foundCheckedIn = false;
      querySnapshot.forEach((doc) => {
        const visitData = { id: doc.id, ...doc.data() };
        const visitDate = new Date(visitData.dateTime);
        const now = new Date();
        const isToday = visitDate.toDateString() === now.toDateString();
        if (isToday) {
          const attendance = visitData.attendance || {};
          const checkedIn = attendance.checkedIn || [];
          const checkedOut = attendance.checkedOut || [];
          // Only set as active if checked in and not checked out
          if (checkedIn.includes(userData.uid) && !checkedOut.includes(userData.uid)) {
            activeVisit = visitData;
            foundCheckedIn = true;
            setUserStatus('checked-in');
          } else if (checkedOut.includes(userData.uid)) {
            setUserStatus('checked-out');
          }
        }
      });
      setCurrentVisit(foundCheckedIn ? activeVisit : null);
      if (!foundCheckedIn) setUserStatus('not-in-visit');
    } catch (error) {
      console.error('fetchCurrentVisit error:', error);
      ErrorHandler.logError(error, {
        action: 'fetchCurrentVisit',
        userId: userData?.uid
      }, ERROR_SEVERITY.MEDIUM);
    } finally {
      setLoading(false);
    }
  };

  const fetchVisitHistory = async () => {
    if (!userData?.uid) {
      return;
    }
    
    try {
      const visitsQuery = query(
        collection(db, 'visits'),
        where('assignedStudents', 'array-contains', userData.uid)
      );
      
      const querySnapshot = await getDocs(visitsQuery);
      const visits = [];
      
      querySnapshot.forEach((doc) => {
        const visitData = { id: doc.id, ...doc.data() };
        visits.push(visitData);
      });
      
      // Sort by creation time (timestamp) first, then by dateTime
      visits.sort((a, b) => {
        // First try to sort by timestamp if available
        if (a.timestamp && b.timestamp) {
          return b.timestamp.toDate() - a.timestamp.toDate();
        }
        // Fallback to dateTime if timestamp not available
        return new Date(b.dateTime) - new Date(a.dateTime);
      });
      
      setVisitHistory(visits.slice(0, 5)); // Show last 5 visits
    } catch (error) {
      ErrorHandler.logError(error, {
        action: 'fetchVisitHistory',
        userId: userData?.uid
      }, ERROR_SEVERITY.LOW);
    }
  };

  const fetchAssignedVisit = async () => {
    if (!userData?.uid) return;
    
    try {
      const today = new Date();
      const startOfDay = new Date(today.getFullYear(), today.getMonth(), today.getDate());
      const endOfDay = new Date(today.getFullYear(), today.getMonth(), today.getDate() + 1);
      
      const visitsQuery = query(
        collection(db, 'visits'),
        where('assignedStudents', 'array-contains', userData.uid),
        where('status', '==', 'active')
      );
      
      const querySnapshot = await getDocs(visitsQuery);
      let foundVisit = null;
      
      querySnapshot.forEach((doc) => {
        const visitData = { id: doc.id, ...doc.data() };
        const visitDate = new Date(visitData.dateTime);
        
        if (
          visitDate >= startOfDay &&
          visitDate < endOfDay &&
          !visitData.attendance?.checkedIn?.includes(userData.uid) &&
          !visitData.attendance?.checkedOut?.includes(userData.uid)
        ) {
          foundVisit = visitData;
        }
      });
      
      setAssignedVisit(foundVisit);
    } catch (error) {
      ErrorHandler.logError(error, {
        action: 'fetchAssignedVisit',
        userId: userData?.uid
      }, ERROR_SEVERITY.LOW);
    }
  };

  const requestAndFetchLocation = async () => {
    try {
      let { status } = await Location.requestForegroundPermissionsAsync();
      setLocationPermission(status);
      if (status !== 'granted') {
        Alert.alert('Permission Denied', 'Location permission is required to check in.');
        return null;
      }
      let location = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
      return location.coords;
    } catch (error) {
      ErrorHandler.logError(error, { action: 'getStudentLocation' }, ERROR_SEVERITY.MEDIUM);
      Alert.alert('Error', 'Failed to get your location.');
      return null;
    }
  };

  const getDistance = (lat1, lon1, lat2, lon2) => {
    function toRad(x) { return x * Math.PI / 180; }
    const R = 6371000; // meters
    const dLat = toRad(lat2 - lat1);
    const dLon = toRad(lon2 - lon1);
    const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
      Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) *
      Math.sin(dLon/2) * Math.sin(dLon/2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    return R * c;
  };

  const handleCheckIn = async () => {
    if (!currentVisit || !userData?.uid) return;
    setActionLoading(true);
    try {
      // Get student location
      const coords = await requestAndFetchLocation();
      if (!coords) { setActionLoading(false); return; }
      setStudentLocation(coords);
      // Get visit location
      const visitCoords = currentVisit.locationCoordinates;
      if (!visitCoords) {
        Alert.alert('Error', 'Visit location coordinates not set.');
        setActionLoading(false);
        return;
      }
      console.log('Student coordinates:', coords);
      console.log('Visit coordinates:', visitCoords);
      // Calculate distance
      const distance = getDistance(coords.latitude, coords.longitude, visitCoords.latitude, visitCoords.longitude);
      console.log('Distance between student and visit (meters):', distance);
      if (distance > 500) {
        Alert.alert('Out of Range', 'You are not within 500 meters of the visit location.');
        setActionLoading(false);
        return;
      }
      // Proceed with check-in
      const visitRef = doc(db, 'visits', currentVisit.id);
      const now = new Date().toISOString();
      await updateDoc(visitRef, {
        'attendance.checkedIn': arrayUnion(userData.uid),
        'attendance.absent': arrayRemove(userData.uid),
        [`attendance.checkInTimes.${userData.uid}`]: now
      });
      await updateDoc(doc(db, 'users', userData.uid), {
        lastKnownLocation: {
          latitude: coords.latitude,
          longitude: coords.longitude,
          timestamp: now
        }
      });
      setUserStatus('checked-in');
      Alert.alert('Success', 'You have successfully checked in!');
      fetchCurrentVisit();
    } catch (error) {
      ErrorHandler.logError(error, { action: 'checkIn', visitId: currentVisit.id, userId: userData?.uid }, ERROR_SEVERITY.MEDIUM);
      Alert.alert('Error', 'Failed to check in. Please try again.');
    } finally {
      setActionLoading(false);
    }
  };

  const handleCheckOut = async () => {
    if (!currentVisit || !userData?.uid) return;
    
    setActionLoading(true);
    try {
      const visitRef = doc(db, 'visits', currentVisit.id);
      const now = new Date().toISOString();
      
      await updateDoc(visitRef, {
        'attendance.checkedOut': arrayUnion(userData.uid),
        'attendance.checkedIn': arrayRemove(userData.uid),
        [`attendance.checkOutTimes.${userData.uid}`]: now
      });
      
      setUserStatus('checked-out');
      Alert.alert('Success', 'You have successfully checked out! Thank you for your visit.');
      fetchCurrentVisit(); // Refresh visit data
      
    } catch (error) {
      console.error('checkOut error:', error);
      ErrorHandler.logError(error, {
        action: 'checkOut',
        visitId: currentVisit.id,
        userId: userData?.uid
      }, ERROR_SEVERITY.MEDIUM);
      
      Alert.alert('Error', 'Failed to check out. Please try again.');
    } finally {
      setActionLoading(false);
    }
  };

  const onRefresh = async () => {
    setRefreshing(true);
    await Promise.all([
      fetchCurrentVisit(),
      fetchVisitHistory(),
      fetchAssignedVisit(),
      fetchSupervisorInfo(),
      fetchAllSupervisors(),
      requestLocationPermissions(),
      startLocationTracking()
    ]);
    setRefreshing(false);
  };

  const handleLogout = async () => {
    Alert.alert(
      'Logout',
      'Are you sure you want to logout?',
      [
        { text: 'Cancel', style: 'cancel' },
        { 
          text: 'Logout', 
          style: 'destructive',
          onPress: async () => {
            try {
              await signOut(auth);
              await clearAuthState();
            } catch (error) {
              ErrorHandler.logError(error, { 
                action: 'studentLogout',
                userId: userData?.uid 
              }, ERROR_SEVERITY.MEDIUM);
              
              Alert.alert('Error', 'Failed to logout. Please try again.');
            }
          }
        }
      ]
    );
  };

  const getStatusColor = () => {
    switch (userStatus) {
      case 'checked-in': return '#4CAF50';
      case 'checked-out': return '#2196F3';
      default: return '#9E9E9E';
    }
  };

  const getStatusText = () => {
    switch (userStatus) {
      case 'checked-in': return 'Checked In';
      case 'checked-out': return 'Visit Completed';
      default: return 'Not in Visit';
    }
  };

  const getStatusIcon = () => {
    switch (userStatus) {
      case 'checked-in': return '✅';
      case 'checked-out': return '🏁';
      default: return '⏸️';
    }
  };

  const handleEmergency = () => {
    setEmergencyMode(true);
    // In a real app, this would trigger emergency protocols
    Alert.alert(
      'Emergency Mode Activated',
      'Your location is being shared with supervisors and emergency contacts have been notified.',
      [
        { text: 'Call Emergency Services', onPress: () => {} },
        { text: 'Cancel Emergency', onPress: () => setEmergencyMode(false) }
      ]
    );
  };

  const handleJoinVisit = async () => {
    if (isCheckedIn) {
      Alert.alert('Already Checked In', 'You are already checked in to a visit. You cannot join another visit until you check out.');
      return;
    }
    if (!visitCode || visitCode.length !== 6) {
      Alert.alert('Invalid Code', 'Please enter a valid 6-digit visit code.');
      return;
    }
    setActionLoading(true);
    try {
      // Find the visit with the given code, active, and today
      const today = new Date();
      const startOfDay = new Date(today.getFullYear(), today.getMonth(), today.getDate());
      const endOfDay = new Date(today.getFullYear(), today.getMonth(), today.getDate() + 1);
      const visitsQuery = query(
        collection(db, 'visits'),
        where('visitCode', '==', visitCode)
      );
      const querySnapshot = await getDocs(visitsQuery);
      if (querySnapshot.empty) {
        Alert.alert('Invalid Code', 'No visit found with this code.');
        setActionLoading(false);
        return;
      }
      let foundVisit = null;
      querySnapshot.forEach((docSnap) => {
        const data = docSnap.data();
        const visitDate = new Date(data.dateTime);
        if (
          visitDate >= startOfDay &&
          visitDate < endOfDay &&
          data.status === 'active'
        ) {
          foundVisit = { id: docSnap.id, ...data };
        }
      });
      if (!foundVisit) {
        Alert.alert('Invalid Code', 'No active visit found for today with this code.');
        setActionLoading(false);
        return;
      }
      // Check if student is assigned
      if (!foundVisit.assignedStudents.includes(userData.uid)) {
        Alert.alert('Not Eligible', 'You are not assigned to this visit.');
        setActionLoading(false);
        return;
      }
      // Check if already checked in
      if (foundVisit.attendance?.checkedIn?.includes(userData.uid)) {
        Alert.alert('Already Joined', 'You have already joined this visit.');
        setActionLoading(false);
        return;
      }
      // --- LOCATION PERMISSION AND RANGE CHECK ---
      // Request location permission and fetch student location
      const coords = await requestAndFetchLocation();
      if (!coords) { setActionLoading(false); return; }
      setStudentLocation(coords);
      // Get visit location
      const visitCoords = foundVisit.locationCoordinates;
      if (!visitCoords) {
        Alert.alert('Error', 'Visit location coordinates not set.');
        setActionLoading(false);
        return;
      }
      console.log('Student coordinates:', coords);
      console.log('Visit coordinates:', visitCoords);
      // Calculate distance
      const distance = getDistance(coords.latitude, coords.longitude, visitCoords.latitude, visitCoords.longitude);
      console.log('Distance between student and visit (meters):', distance);
      if (distance > 500) {
        Alert.alert('Out of Range', 'You are not within 500 meters of the visit location.');
        setActionLoading(false);
        return;
      }
      // Add student to checkedIn and remove from absent
      const visitRef = doc(db, 'visits', foundVisit.id);
      const now = new Date().toISOString();
      await updateDoc(visitRef, {
        'attendance.checkedIn': arrayUnion(userData.uid),
        'attendance.absent': arrayRemove(userData.uid),
        [`attendance.checkInTimes.${userData.uid}`]: now
      });
      await updateDoc(doc(db, 'users', userData.uid), {
        lastKnownLocation: {
          latitude: coords.latitude,
          longitude: coords.longitude,
          timestamp: now
        }
      });
      setCurrentVisit(foundVisit);
      setUserStatus('checked-in');
      setVisitCode('');
      Alert.alert('Success', 'You have joined and checked in to the visit!');
      fetchCurrentVisit();
    } catch (error) {
      ErrorHandler.logError(error, {
        action: 'joinVisitByCode',
        userId: userData?.uid,
        visitCode
      }, ERROR_SEVERITY.MEDIUM);
      Alert.alert('Error', 'Failed to join visit. Please try again.');
    } finally {
      setActionLoading(false);
    }
  };

  const getConnectionStatus = () => {
    if (bluetoothState === 'PoweredOn' && isTracking) {
      return 'Connected';
    } else if (bluetoothState === 'PoweredOn') {
      return 'Ready';
    } else {
      return 'Disconnected';
    }
  };

  const getStatusBadgeStyle = (status) => {
    switch (status) {
      case 'checked-in':
        return { backgroundColor: '#DCFCE7', borderColor: '#10B981', color: '#166534' };
      case 'checked-out':
        return { backgroundColor: '#DBEAFE', borderColor: '#3B82F6', color: '#1E40AF' };
      case 'emergency':
        return { backgroundColor: '#FEE2E2', borderColor: '#EF4444', color: '#991B1B' };
      default:
        return { backgroundColor: '#F3F4F6', borderColor: '#9CA3AF', color: '#374151' };
    }
  };

  // Renders the Join Visit card if the user is not checked in
  const shouldShowJoinVisitCard = userStatus === 'not-in-visit';

  const handleAssignedVisitCheckIn = async (visit) => {
    if (!visit || !userData?.uid) return;
    
    setActionLoading(true);
    try {
      // Get student location
      const coords = await requestAndFetchLocation();
      if (!coords) { setActionLoading(false); return; }
      setStudentLocation(coords);
      
      // Get visit location
      const visitCoords = visit.locationCoordinates;
      if (!visitCoords) {
        Alert.alert('Error', 'Visit location coordinates not set.');
        setActionLoading(false);
        return;
      }
      
      // Calculate distance
      const distance = getDistance(coords.latitude, coords.longitude, visitCoords.latitude, visitCoords.longitude);
      if (distance > 500) {
        Alert.alert('Out of Range', 'You are not within 500 meters of the visit location.');
        setActionLoading(false);
        return;
      }
      
      // Proceed with check-in
      const visitRef = doc(db, 'visits', visit.id);
      const now = new Date().toISOString();
      await updateDoc(visitRef, {
        'attendance.checkedIn': arrayUnion(userData.uid),
        'attendance.absent': arrayRemove(userData.uid),
        [`attendance.checkInTimes.${userData.uid}`]: now
      });
      
      await updateDoc(doc(db, 'users', userData.uid), {
        lastKnownLocation: {
          latitude: coords.latitude,
          longitude: coords.longitude,
          timestamp: now
        }
      });
      
      setCurrentVisit(visit);
      setUserStatus('checked-in');
      setAssignedVisit(null); // Clear assigned visit since we're now checked in
      Alert.alert('Success', 'You have successfully checked in!');
      fetchCurrentVisit();
    } catch (error) {
      ErrorHandler.logError(error, { 
        action: 'assignedVisitCheckIn', 
        visitId: visit.id, 
        userId: userData?.uid 
      }, ERROR_SEVERITY.MEDIUM);
      Alert.alert('Error', 'Failed to check in. Please try again.');
    } finally {
      setActionLoading(false);
    }
  };

  const handleJoinSupervisor = async () => {
    if (!supervisorCode || supervisorCode.length !== 4) {
      Alert.alert('Invalid Code', 'Please enter a valid 4-digit supervisor code.');
      return;
    }

    // Check if already joined this supervisor
    if (supervisors.some(s => s.code === supervisorCode)) {
      Alert.alert('Already Joined', 'You have already joined this supervisor.');
      return;
    }

    setActionLoading(true);
    try {
      // Check if supervisor exists
      const supervisorsQuery = query(
        collection(db, 'users'),
        where('role', '==', 'supervisor'),
        where('supervisorCode', '==', supervisorCode)
      );
      
      const querySnapshot = await getDocs(supervisorsQuery);
      
      if (querySnapshot.empty) {
        Alert.alert('Invalid Code', 'No supervisor found with this code.');
        setActionLoading(false);
        return;
      }

      const supervisorDoc = querySnapshot.docs[0];
      const supervisorData = supervisorDoc.data();

      // Update both supervisorCodes array and supervisorCode field
      const userRef = doc(db, 'users', userData.uid);
      await updateDoc(userRef, {
        supervisorCodes: arrayUnion(supervisorCode),
        supervisorCode: supervisorCode // Set the primary supervisor code
      });

      // Add supervisor to local state
      setSupervisors(prev => [...prev, {
        id: supervisorDoc.id,
        fullName: supervisorData.fullName,
        code: supervisorData.supervisorCode,
        email: supervisorData.email
      }]);

      setSupervisorCode('');
      Alert.alert('Success', 'Successfully joined supervisor!');
    } catch (error) {
      ErrorHandler.logError(error, {
        action: 'joinSupervisor',
        userId: userData?.uid,
        supervisorCode
      }, ERROR_SEVERITY.MEDIUM);
      Alert.alert('Error', 'Failed to join supervisor. Please try again.');
    } finally {
      setActionLoading(false);
    }
  };

  useEffect(() => {
    const initializeData = async () => {
      setLoading(true);
      try {
        await Promise.all([
          fetchCurrentVisit(),
          fetchVisitHistory(),
          fetchAssignedVisit(),
          fetchSupervisorInfo(),
          fetchAllSupervisors(),
          requestLocationPermissions(),
          startLocationTracking()
        ]);
      } catch (error) {
        console.error('Error initializing data:', error);
      } finally {
        setLoading(false);
      }
    };

    initializeData();
  }, []);

  useEffect(() => {
    return () => {
      stopLocationTracking();
    };
  }, []);

  // --- ADDED: Fetch beacon-room mapping on mount ---
  useEffect(() => {
    const fetchBeaconRoomMapping = async () => {
      try {
        const beaconDocs = await firestoreGetDocs(firestoreCollection(db, 'beacons'));
        const mapping = {};
        beaconDocs.forEach(doc => {
          const data = doc.data();
          mapping[`${data.uuid}-${data.major}-${data.minor}`] = {
            roomId: data.roomId,
            roomName: data.roomName,
            svgPosition: data.svgPosition || null
          };
        });
        setBeaconRoomMap(mapping);
      } catch (error) {
        console.error('Error fetching beacon-room mapping:', error);
        ErrorHandler.logError(error, { action: 'fetchBeaconRoomMapping' }, ERROR_SEVERITY.LOW);
      }
    };
    fetchBeaconRoomMapping();
  }, []);

  // --- ADDED: Helper to update user's current room in Firestore ---
  const updateUserRoomInFirestore = async (roomId, roomName, beaconData) => {
    if (!userData?.uid) return;
    try {
      // Fetch previous roomHistory
      const userDocRef = doc(db, 'users', userData.uid);
      const userDocSnap = await getDoc(userDocRef);
      let prevHistory = [];
      if (userDocSnap.exists() && Array.isArray(userDocSnap.data().roomHistory)) {
        prevHistory = userDocSnap.data().roomHistory;
      }
      const prevRoom = prevHistory.length > 0 ? prevHistory[prevHistory.length - 1] : null;
      // Prepare new room entry
      const newRoomEntry = {
        roomId,
        roomName,
        svgPosition: beaconData?.svgPosition || null,
        timestamp: new Date().toISOString(),
      };
      // Only add if different from last room in history
      let updatedHistory = prevHistory;
      if (prevHistory.length === 0 || prevHistory[prevHistory.length - 1].roomId !== roomId) {
        updatedHistory = [...prevHistory, newRoomEntry].slice(-3);
      }
      await firestoreUpdateDoc(userDocRef, {
        currentRoomId: roomId,
        currentRoomName: roomName,
        lastRoomUpdate: new Date().toISOString(),
        roomHistory: updatedHistory,
        // Store beacon information for supervisor dashboard
        nearestBeacon: {
          roomId: roomId,
          roomName: roomName,
          svgPosition: beaconData?.svgPosition || null,
          beaconId: beaconData?.beaconId || null,
          lastSeen: new Date().toISOString(),
          rssi: beaconData?.rssi || null
        }
      });
      // --- ROOM CHANGE LOG ---
      if (!prevRoom || prevRoom.roomId !== roomId) {
        console.log('[ROOM CHANGE]', {
          prevRoom: prevRoom ? prevRoom.roomId : null,
          newRoom: roomId,
          newRoomName: roomName,
          timestamp: newRoomEntry.timestamp,
          beacon: beaconData
        });
      }
    } catch (error) {
      ErrorHandler.logError(error, { action: 'updateUserRoomInFirestore', userId: userData?.uid, roomId }, ERROR_SEVERITY.LOW);
    }
  };

  // --- ADDED: Determine closest beacon and update user's room with sliding window majority ---
  useEffect(() => {
    // Reset buffer if user changes
    if (userData?.uid !== lastUserIdRef.current) {
      roomConfirmationBufferRef.current = [];
      lastConfirmedRoomRef.current = null;
      lastUserIdRef.current = userData?.uid;
    }
    // Find the closest beacon (highest RSSI) as before
    let closest = null;
    let highestRssi = -100;
    if (beacons && beacons.length > 0 && Object.keys(beaconRoomMap).length > 0) {
      const now = Date.now();
      const recentBeacons = beacons.filter(b => now - (b.lastSeen || now) < 15000);
      for (const beacon of recentBeacons) {
        if (beacon.type === 'iBeacon' || beacon.uuid) {
          const key = `${beacon.uuid || TARGET_UUID}-${beacon.major || TARGET_MAJOR}-${beacon.minor}`;
          if (beaconRoomMap[key]) {
            if (beacon.rssi > highestRssi) {
              highestRssi = beacon.rssi;
              closest = {
                ...beacon,
                ...beaconRoomMap[key],
                beaconId: key
              };
            }
          }
        }
      }
    }
    // Push detected roomId (or null if no beacon) to buffer
    let detectedRoomId = null;
    if (closest && closest.roomId) {
      detectedRoomId = closest.roomId;
    }
    // If no beacons detected at all, push null
    if (!beacons || beacons.length === 0 || !closest) {
      detectedRoomId = null;
    }
    roomConfirmationBufferRef.current.push(detectedRoomId);
    if (roomConfirmationBufferRef.current.length > ROOM_CONFIRMATION_WINDOW) {
      roomConfirmationBufferRef.current.shift();
    }
    // Count occurrences of each roomId in the buffer
    const counts = {};
    for (const rid of roomConfirmationBufferRef.current) {
      if (rid) counts[rid] = (counts[rid] || 0) + 1;
    }
    // Find the roomId with the highest count
    let candidateRoomId = null;
    let maxCount = 0;
    for (const [rid, count] of Object.entries(counts)) {
      if (count > maxCount) {
        candidateRoomId = rid;
        maxCount = count;
      }
    }
    const lastConfirmed = lastConfirmedRoomRef.current;
    // Confirm if candidate appears at least threshold times and is different from last confirmed
    if (candidateRoomId && maxCount >= ROOM_CONFIRMATION_THRESHOLD && candidateRoomId !== lastConfirmed) {
      // Find the most recent closest beacon data for this roomId
      let confirmedBeacon = closest;
      if (!confirmedBeacon || confirmedBeacon.roomId !== candidateRoomId) {
        // Try to find a recent beacon in the buffer
        if (beacons && beacons.length > 0) {
          const now = Date.now();
          const recentBeacons = beacons.filter(b => now - (b.lastSeen || now) < 15000);
          confirmedBeacon = recentBeacons.find(b => {
            const key = `${b.uuid || TARGET_UUID}-${b.major || TARGET_MAJOR}-${b.minor}`;
            return beaconRoomMap[key] && beaconRoomMap[key].roomId === candidateRoomId;
          });
          if (confirmedBeacon) {
            confirmedBeacon = {
              ...confirmedBeacon,
              ...beaconRoomMap[`${confirmedBeacon.uuid || TARGET_UUID}-${confirmedBeacon.major || TARGET_MAJOR}-${confirmedBeacon.minor}`],
              beaconId: `${confirmedBeacon.uuid || TARGET_UUID}-${confirmedBeacon.major || TARGET_MAJOR}-${confirmedBeacon.minor}`
            };
          }
        }
      }
      lastConfirmedRoomRef.current = candidateRoomId;
      // --- ROOM CHANGE LOG ---
      console.log('[ROOM CONFIRMATION] Confirmed room:', candidateRoomId, 'Count:', maxCount, 'Buffer:', roomConfirmationBufferRef.current);
      updateUserRoomInFirestore(candidateRoomId, confirmedBeacon?.roomName || '', confirmedBeacon);
    } else if (!candidateRoomId && roomConfirmationBufferRef.current.filter(x => x === null).length >= ROOM_CONFIRMATION_THRESHOLD && lastConfirmed !== null) {
      // If buffer is mostly nulls, clear the user's room
      lastConfirmedRoomRef.current = null;
      console.log('[ROOM CONFIRMATION] No beacons detected for threshold, clearing current room. Buffer:', roomConfirmationBufferRef.current);
      updateUserRoomInFirestore(null, '', null);
    } else {
      // Not confirmed yet, just log
      console.log('[ROOM CONFIRMATION] Waiting for confirmation. Buffer:', roomConfirmationBufferRef.current, 'Counts:', counts, 'Candidate:', candidateRoomId, 'MaxCount:', maxCount, 'Last confirmed:', lastConfirmed);
    }
  }, [beacons, beaconRoomMap, userData?.uid]);

  const renderSupervisorsSection = () => (
    <View style={styles.supervisorsCard}>
      <View style={styles.cardHeader}>
        <Icon name="people" size={18} color="#1F2937" />
        <Text style={styles.cardTitle}>My Supervisors</Text>
      </View>

      <View style={styles.supervisorsList}>
        {supervisors.length === 0 ? (
          <View style={styles.noSupervisorsContainer}>
            <Icon name="people-outline" size={24} color="#9CA3AF" />
            <Text style={styles.noSupervisorsText}>No supervisors assigned yet</Text>
            <Text style={styles.noSupervisorsSubtext}>Join a supervisor using their code</Text>
          </View>
        ) : (
          supervisors.map((supervisor) => (
            <View key={supervisor.code} style={styles.supervisorItem}>
              <View style={styles.supervisorInfo}>
                <View style={styles.supervisorHeader}>
                  <Text style={styles.supervisorName}>{supervisor.fullName}</Text>
                  <View style={styles.assignedBadge}>
                    <Icon name="check-circle" size={12} color="#10B981" />
                    <Text style={styles.assignedBadgeText}>Assigned</Text>
                  </View>
                </View>
                <Text style={styles.supervisorEmail}>{supervisor.email}</Text>
                <View style={styles.supervisorStats}>
                  <View style={styles.statItem}>
                    <Icon name="event" size={14} color="#6B7280" />
                    <Text style={styles.statText}>
                      {visitHistory.filter(v => v.supervisorCode === supervisor.code).length} Visits
                    </Text>
                  </View>
                  <View style={styles.statItem}>
                    <Icon name="schedule" size={14} color="#6B7280" />
                    <Text style={styles.statText}>
                      {visitHistory.filter(v => 
                        v.supervisorCode === supervisor.code && 
                        v.attendance?.checkedIn?.includes(userData.uid)
                      ).length} Check-ins
                    </Text>
                  </View>
                </View>
              </View>
              <View style={styles.supervisorCode}>
                <Text style={styles.supervisorCodeText}>Code: {supervisor.code}</Text>
              </View>
            </View>
          ))
        )}
      </View>

      <View style={styles.joinSupervisorContainer}>
        <Text style={styles.joinSupervisorLabel}>Join New Supervisor</Text>
        <View style={styles.joinSupervisorInputContainer}>
          <TextInput
            style={styles.joinSupervisorInput}
            placeholder="Enter 4-digit code"
            value={supervisorCode}
            onChangeText={(text) => {
              // Only allow numbers and limit to 4 digits
              const numericValue = text.replace(/[^0-9]/g, '');
              setSupervisorCode(numericValue.slice(0, 4));
            }}
            maxLength={4}
            keyboardType="numeric"
            textAlign="center"
          />
        </View>
        <TouchableOpacity
          style={[
            styles.joinSupervisorButton,
            supervisorCode.length === 4 ? styles.joinSupervisorButtonActive : styles.joinSupervisorButtonInactive
          ]}
          onPress={handleJoinSupervisor}
          disabled={supervisorCode.length !== 4 || actionLoading}
        >
          {actionLoading ? (
            <ActivityIndicator color="#FFFFFF" size="small" />
          ) : (
            <Text style={styles.joinSupervisorButtonText}>Join Supervisor</Text>
          )}
        </TouchableOpacity>
      </View>
    </View>
  );

  // Modify renderAssignedVisitSection to include supervisor info
  const renderAssignedVisitSection = () => {
    if (!assignedVisit) return null;

    const todayVisits = visitHistory.filter(visit => {
      const visitDate = new Date(visit.dateTime);
      const today = new Date();
      return visitDate.toDateString() === today.toDateString() && 
             visit.assignedStudents?.includes(userData.uid);
    });

    if (todayVisits.length === 0) return null;

    return (
      <View style={styles.assignedVisitSection}>
        <View style={styles.assignedVisitHeader}>
          <Icon name="event-available" size={20} color="#2563EB" />
          <Text style={styles.assignedVisitTitle}>Today's Assigned Visits</Text>
        </View>

        <ScrollView 
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.assignedVisitsScrollContent}
          pagingEnabled
          snapToInterval={width - 32}
          decelerationRate="fast"
        >
          {todayVisits.map((visit, index) => {
            const isCheckedIn = currentVisit?.id === visit.id && userStatus === 'checked-in';
            const isCheckedOut = visit.attendance?.checkedOut?.includes(userData.uid);
            const canCheckIn = !isCheckedIn && !isCheckedOut;
            
            // Find supervisor info for this visit
            const visitSupervisor = supervisors.find(s => s.code === visit.supervisorCode);

            return (
              <View key={visit.id} style={styles.assignedVisitCard}>
                <View style={styles.assignedVisitContent}>
                  <View style={styles.assignedVisitInfo}>
                    <View style={styles.assignedVisitRow}>
                      <Icon name="location-on" size={16} color="#6B7280" />
                      <Text style={styles.assignedVisitText}>
                        {visit.location || "Industrial Facility"}
                      </Text>
                    </View>
                    
                    <View style={styles.assignedVisitRow}>
                      <Icon name="schedule" size={16} color="#6B7280" />
                      <Text style={styles.assignedVisitText}>
                        {visit.dateTime ? 
                          new Date(visit.dateTime).toLocaleTimeString([], {
                            hour: '2-digit',
                            minute: '2-digit'
                          }) : "9:00 AM"
                        }
                      </Text>
                    </View>
                    
                    <View style={styles.assignedVisitRow}>
                      <Icon name="description" size={16} color="#6B7280" />
                      <Text style={styles.assignedVisitText}>
                        {visit.purpose || "Educational Visit"}
                      </Text>
                    </View>

                    {visitSupervisor && (
                      <View style={styles.assignedVisitRow}>
                        <Icon name="person" size={16} color="#6B7280" />
                        <Text style={styles.assignedVisitText}>
                          Supervisor: {visitSupervisor.fullName}
                        </Text>
                      </View>
                    )}

                    {isCheckedIn && (
                      <View style={styles.visitStatusBadge}>
                        <Icon name="check-circle" size={14} color="#10B981" />
                        <Text style={styles.visitStatusText}>Checked In</Text>
                      </View>
                    )}
                    {isCheckedOut && (
                      <View style={[styles.visitStatusBadge, styles.checkedOutBadge]}>
                        <Icon name="done-all" size={14} color="#6B7280" />
                        <Text style={[styles.visitStatusText, styles.checkedOutText]}>Completed</Text>
                      </View>
                    )}
                  </View>

                  <TouchableOpacity
                    style={[
                      styles.assignedVisitButton,
                      !canCheckIn && styles.assignedVisitButtonDisabled
                    ]}
                    onPress={() => handleAssignedVisitCheckIn(visit)}
                    disabled={!canCheckIn || actionLoading}
                  >
                    {actionLoading ? (
                      <ActivityIndicator color="#FFFFFF" size="small" />
                    ) : (
                      <>
                        <Icon 
                          name={isCheckedIn ? "check-circle" : "check-circle-outline"} 
                          size={18} 
                          color="#FFFFFF" 
                        />
                        <Text style={styles.assignedVisitButtonText}>
                          {isCheckedIn ? 'Checked In' : 
                           isCheckedOut ? 'Visit Completed' : 'Check In Now'}
                        </Text>
                      </>
                    )}
                  </TouchableOpacity>
                </View>
              </View>
            );
          })}
        </ScrollView>

        <View style={styles.assignedVisitPagination}>
          {todayVisits.map((_, index) => (
            <View 
              key={index} 
              style={[
                styles.paginationDot,
                index === 0 && styles.paginationDotActive
              ]} 
            />
          ))}
        </View>
      </View>
    );
  };

  // Early return if userData is not available
  if (!userData) {
    return (
      <View style={[styles.container, styles.centered]}>
        <ActivityIndicator size="large" color="#2563EB" />
        <Text style={styles.loadingText}>Loading user data...</Text>
      </View>
    );
  }

  if (loading) {
    return (
      <View style={[styles.container, styles.centered]}>
        <ActivityIndicator size="large" color="#2563EB" />
        <Text style={styles.loadingText}>Loading visits...</Text>
      </View>
    );
  }

  const renderHeader = () => (
    <View style={styles.modernHeader}>
      <View style={styles.headerContent}>
        <View style={styles.headerTop}>
          <View style={styles.logoContainer}>
            <View style={styles.logo}>
              <Icon name="location-on" size={18} color="#FFFFFF" />
            </View>
            <View style={styles.headerText}>
              <Text style={styles.headerTitle}>Student Tracker</Text>
              <Text style={styles.headerSubtitle}>Stay connected during visits</Text>
            </View>
          </View>
          <TouchableOpacity style={styles.logoutIconButton} onPress={handleLogout}>
            <Icon name="logout" size={16} color="#FFFFFF" />
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );

  const renderWelcomeSection = () => (
    <View style={styles.welcomeCard}>
      <Text style={styles.welcomeCardText}>
        Welcome, {userData?.fullName?.split(' ')[0] || 'Student'} 👋
        </Text>
        {supervisorInfo && (
        <Text style={styles.supervisorCardText}>
            Supervisor: {supervisorInfo.fullName}
          </Text>
        )}
      </View>
  );

  const renderEmergencyOverlay = () => (
    <Modal visible={emergencyMode} animationType="fade" transparent={false}>
      <View style={styles.emergencyOverlay}>
        <StatusBar barStyle="light-content" backgroundColor="#DC2626" />
        <View style={styles.emergencyContent}>
          <Animated.View style={[styles.emergencyIcon, { transform: [{ scale: emergencyPulse }] }]}>
            <Icon name="warning" size={64} color="#FFFFFF" />
          </Animated.View>
          
          <Text style={styles.emergencyTitle}>EMERGENCY MODE ACTIVE</Text>
          <Text style={styles.emergencyText}>Your location is being shared with supervisors</Text>
          <Text style={styles.emergencySubtext}>Emergency contacts have been notified</Text>

          <View style={styles.emergencyActions}>
            <TouchableOpacity 
              style={styles.emergencyCallButton}
              onPress={() => Alert.alert('Emergency Services', 'This would call emergency services in a real app')}
            >
              <Icon name="phone" size={18} color="#DC2626" />
              <Text style={styles.emergencyCallText}>Call Emergency Services</Text>
            </TouchableOpacity>
            
            <TouchableOpacity
              style={styles.emergencyCancelButton}
              onPress={() => setEmergencyMode(false)}
            >
              <Text style={styles.emergencyCancelText}>Cancel Emergency</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );

  const renderStatusCard = () => {
    const isInVisit = currentVisit && userStatus !== 'not-in-visit';
    const statusStyle = getStatusBadgeStyle(userStatus);
    const isAutoCheckedIn = isInVisit && assignedVisit?.id === currentVisit?.id;
    
    return (
      <View style={[
        styles.statusCard, 
        isInVisit ? styles.statusCardActive : styles.statusCardInactive
      ]}>
        <View style={styles.statusContent}>
          <Animated.View style={[
            styles.statusIndicator,
            { 
              backgroundColor: statusStyle.color,
              transform: isInVisit ? [{ scale: pulseAnim }] : []
            }
          ]}>
            {autoCheckInOutLoading ? (
              <ActivityIndicator color="#FFFFFF" size="small" />
            ) : (
              <Icon 
                name={isInVisit ? "location-on" : "location-off"} 
                size={28} 
                color="#FFFFFF" 
              />
            )}
          </Animated.View>

          <View style={styles.statusTextContainer}>
            <Text style={styles.statusTitle}>
              {autoCheckInOutLoading ? "Updating Status..." : 
               isInVisit ? "Currently in Visit" : "Not in Visit"}
            </Text>
            <Text style={styles.statusDescription}>
              {isInVisit ? 
                (currentVisit?.purpose || "Factory Tour - Group A") : 
                "Join a visit to start tracking"
              }
            </Text>
            {isAutoCheckedIn && (
              <View style={styles.autoCheckInBadge}>
                <Icon name="auto-awesome" size={12} color="#10B981" />
                <Text style={styles.autoCheckInText}>
                  {autoCheckInOutLoading ? "Updating..." : "Auto Check-in Active"}
                </Text>
              </View>
            )}
          </View>
        </View>

        {isInVisit && (
          <View style={styles.statusInfo}>
            <View style={styles.statusInfoItem}>
              <Icon name="schedule" size={14} color="#6B7280" />
              <Text style={styles.statusInfoText}>2h 15m</Text>
            </View>
            <View style={styles.statusInfoItem}>
              <Icon name="signal-cellular-4-bar" size={14} color="#10B981" />
              <Text style={styles.statusInfoText}>Strong Signal</Text>
            </View>
          </View>
        )}
      </View>
    );
  };

  const renderJoinVisitCard = () => {
    return (
      <View style={styles.joinVisitCard}>
        <View style={styles.cardHeader}>
          <Icon name="qr-code-scanner" size={18} color="#1F2937" />
          <Text style={styles.cardTitle}>Join Visit</Text>
        </View>
        <View style={styles.visitCodeContainer}>
          <Text style={styles.visitCodeLabel}>Visit Code</Text>
          <View style={styles.visitCodeInputContainer}>
            <TextInput
              style={styles.visitCodeInput}
              placeholder="Enter 6-digit code"
              value={visitCode}
              onChangeText={setVisitCode}
              maxLength={6}
              keyboardType="numeric"
              textAlign="center"
              editable={!isCheckedIn}
            />
          </View>
          <TouchableOpacity
            style={[
              styles.joinButton,
              visitCode.length === 6 && !isCheckedIn ? styles.joinButtonActive : styles.joinButtonInactive
            ]}
            onPress={handleJoinVisit}
            disabled={visitCode.length !== 6 || isCheckedIn}
          >
            <Text style={[
              styles.joinButtonText,
              visitCode.length === 6 && !isCheckedIn ? styles.joinButtonTextActive : styles.joinButtonTextInactive
            ]}>
              {isCheckedIn ? 'Already Checked In' : 'Join Visit'}
            </Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  };

  const renderVisitCard = () => {
    if (!currentVisit) return null;

    return (
      <View style={styles.modernVisitCard}>
        <View style={styles.cardHeader}>
          <Icon name="event" size={18} color="#1F2937" />
          <Text style={styles.cardTitle}>Today's Visit</Text>
        </View>

        <View style={styles.visitCardContent}>
          <View style={styles.visitDetailRow}>
            <Icon name="location-on" size={16} color="#6B7280" />
            <Text style={styles.visitDetailText}>
              {currentVisit.location || "Industrial Facility"}
            </Text>
          </View>
          
          <View style={styles.visitDetailRow}>
            <Icon name="schedule" size={16} color="#6B7280" />
            <Text style={styles.visitDetailText}>
              {currentVisit.dateTime ? 
                new Date(currentVisit.dateTime).toLocaleTimeString([], {
                hour: '2-digit',
                minute: '2-digit'
                }) : "9:00 AM"
              }
            </Text>
          </View>
          
          <View style={styles.visitDetailRow}>
            <Icon name="description" size={16} color="#6B7280" />
            <Text style={styles.visitDetailText}>
              {currentVisit.purpose || "Educational Visit"}
            </Text>
          </View>
        </View>
            
            {/* Action Buttons */}
        <View style={styles.modernActionButtons}>
              {userStatus === 'not-in-visit' && (
                <TouchableOpacity
              style={styles.modernCheckInButton}
                  onPress={handleCheckIn}
                  disabled={actionLoading}
                >
                  {actionLoading ? (
                <ActivityIndicator color="#FFFFFF" size="small" />
                  ) : (
                    <>
                  <Icon name="check-circle" size={18} color="#FFFFFF" />
                  <Text style={styles.modernActionButtonText}>Check In</Text>
                    </>
                  )}
                </TouchableOpacity>
              )}
              
              {userStatus === 'checked-in' && (
                <TouchableOpacity
              style={styles.modernCheckOutButton}
                  onPress={handleCheckOut}
                  disabled={actionLoading}
                >
                  {actionLoading ? (
                <ActivityIndicator color="#FFFFFF" size="small" />
                  ) : (
                    <>
                  <Icon name="exit-to-app" size={18} color="#FFFFFF" />
                  <Text style={styles.modernActionButtonText}>Check Out</Text>
                    </>
                  )}
                </TouchableOpacity>
              )}
              
              {userStatus === 'checked-out' && (
            <View style={styles.modernCompletedButton}>
              <Icon name="done-all" size={18} color="#FFFFFF" />
              <Text style={styles.modernActionButtonText}>Visit Completed</Text>
                </View>
              )}
            </View>
          </View>
    );
  };


  const renderVisitHistory = () => {
    if (visitHistory.length === 0) return null;

    const getVisitStatus = (visit) => {
      const now = new Date();
      const visitDate = new Date(visit.dateTime);
      
      // If visit is checked out, it's completed
      if (visit.attendance?.checkedOut?.includes(userData.uid)) {
        return {
          text: 'Completed',
          color: '#166534',
          bgColor: '#DCFCE7',
          borderColor: '#10B981'
        };
      }
      
      // If visit is checked in, it's active
      if (visit.attendance?.checkedIn?.includes(userData.uid)) {
        return {
          text: 'Active',
          color: '#1E40AF',
          bgColor: '#DBEAFE',
          borderColor: '#3B82F6'
        };
      }
      
      // If visit date is in the past and not checked in/out, it's missed
      if (visitDate < now) {
        return {
          text: 'Missed',
          color: '#991B1B',
          bgColor: '#FEE2E2',
          borderColor: '#EF4444'
        };
      }
      
      // If visit is in the future, it's upcoming
      return {
        text: 'Upcoming',
        color: '#854D0E',
        bgColor: '#FEF3C7',
        borderColor: '#F59E0B'
      };
    };

    return (
      <View style={styles.historyCard}>
        <View style={styles.cardHeader}>
          <Icon name="history" size={18} color="#1F2937" />
          <Text style={styles.cardTitle}>Recent Visits</Text>
        </View>
        
        <View style={styles.historyList}>
          {visitHistory.slice(0, 3).map((visit) => {
            const status = getVisitStatus(visit);
            return (
              <View key={visit.id} style={styles.modernHistoryItem}>
                <View style={styles.historyItemLeft}>
                  <Text style={styles.historyItemName}>
                    {visit.location || 'Industrial Visit'}
                  </Text>
                  <Text style={styles.historyItemDate}>
                    {visit.dateTime ? 
                      new Date(visit.dateTime).toLocaleDateString() : 
                      'Recent'
                    }
                  </Text>
                </View>
                
                <View style={styles.historyItemRight}>
                  <View style={[
                    styles.historyStatusBadge,
                    {
                      backgroundColor: status.bgColor,
                      borderColor: status.borderColor
                    }
                  ]}>
                    <Text style={[
                      styles.historyStatusText,
                      { color: status.color }
                    ]}>
                      {status.text}
                    </Text>
                  </View>
                </View>
              </View>
            );
          })}
        </View>
        
        <TouchableOpacity 
          style={styles.viewAllButton}
          onPress={() => navigation.navigate('VisitList')}
        >
          <Text style={styles.viewAllButtonText}>View All Visits</Text>
          <Icon name="arrow-forward" size={14} color="#2563EB" />
        </TouchableOpacity>
      </View>
    );
  };

  const renderQuickActions = () => (
    <View style={styles.quickActionsCard}>
      <View style={styles.cardHeader}>
        <Icon name="dashboard" size={18} color="#1F2937" />
        <Text style={styles.cardTitle}>Quick Actions</Text>
      </View>
      
      <View style={styles.quickActionsList}>
        <TouchableOpacity 
          style={styles.modernQuickAction}
          onPress={() => navigation.navigate('VisitList')}
        >
          <Icon name="list" size={20} color="#2563EB" />
            <Text style={styles.quickActionText}>All Visits</Text>
          </TouchableOpacity>
          
          <TouchableOpacity 
          style={styles.modernQuickAction}
            onPress={() => {
              Alert.alert(
                'Help & Support',
                'Contact your supervisor for any assistance:\n\n' +
                (supervisorInfo ? 
                  `${supervisorInfo.fullName}\n${supervisorInfo.email}` : 
                  'Supervisor information not available'
                )
              );
            }}
          >
          <Icon name="help" size={20} color="#10B981" />
            <Text style={styles.quickActionText}>Help</Text>
          </TouchableOpacity>
        </View>
              </View>
  );

  // Debug logs for map rendering
  console.log('isCheckedIn:', isCheckedIn);
  console.log('userStatus:', userStatus);
  console.log('currentVisit:', currentVisit);
  console.log('currentVisit.locationCoordinates:', currentVisit?.locationCoordinates);
  console.log('studentLocation:', studentLocation);
  console.log('mapLocationLoading:', mapLocationLoading);

  // --- Beacon Scanner Section ---
  const renderBeaconScanner = () => (
    <View style={styles.card}>
      <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 8 }}>
        <Icon name="bluetooth" size={20} color="#2563EB" />
        <Text style={styles.cardTitle}>Beacon Scanner</Text>
      </View>
      <Text style={{ color: '#6B7280', fontSize: 12, marginBottom: 8 }}>
        HoneyComm HCBB35 beacons detected via shared BLE service.
      </Text>
      
      <View style={{ flexDirection: 'row', gap: 12, marginBottom: 12 }}>
        <TouchableOpacity
          style={[
            styles.beaconScanButton, 
            isTracking 
              ? styles.beaconScanButtonActive 
              : styles.beaconScanButtonInactive
          ]}
          onPress={isTracking ? stopLocationTracking : startLocationTracking}
        >
          <Icon 
            name={isTracking ? 'stop' : 'bluetooth-searching'} 
            size={16} 
            color="#FFFFFF" 
          />
          <Text style={styles.beaconScanButtonText}>
            {isTracking ? 'Stop Tracking' : 'Start Tracking'}
          </Text>
        </TouchableOpacity>
      </View>
      
      {bleError && (
        <Text style={{ color: '#DC2626', fontSize: 12, marginBottom: 8 }}>
          {bleError}
        </Text>
      )}
      
      <View style={{ minHeight: 40 }}>
        {targetBeacons.length === 0 && !isTracking && (
          <Text style={{ color: '#9CA3AF', fontSize: 13, textAlign: 'center' }}>
            {bleError ? 'Error tracking' : 'No target beacons detected yet.'}
          </Text>
        )}
        
        {targetBeacons.length > 0 && (
          <View style={{ gap: 8 }}>
            {targetBeacons.map((beacon) => (
              <View key={`${beacon.minor}-${beacon.rssi}`} style={styles.beaconItem}>
                <Icon name="bluetooth" size={16} color="#2563EB" />
                <View style={{ flex: 1 }}>
                  <Text style={styles.beaconName}>
                    {getLocationName(beacon.minor)}
                  </Text>
                  <Text style={styles.beaconId}>
                    Minor: {beacon.minor} | RSSI: {beacon.rssi} dBm
                  </Text>
                  <Text style={styles.beaconId}>
                    Distance: {beacon.distance?.toFixed(1)}m
                  </Text>
                </View>
              </View>
            ))}
          </View>
        )}
        
        {isTracking && targetBeacons.length === 0 && (
          <View style={{ alignItems: 'center', marginTop: 8 }}>
            <ActivityIndicator color="#2563EB" size="small" />
            <Text style={{ color: '#2563EB', fontSize: 12, marginTop: 4 }}>
              Tracking for HoneyComm beacons...
            </Text>
          </View>
        )}
        
        {isTracking && targetBeacons.length > 0 && (
          <Text style={{ 
            color: '#10B981', 
            fontSize: 12,
            textAlign: 'center',
            marginTop: 8
          }}>
            {targetBeacons.length} HoneyComm beacon{targetBeacons.length > 1 ? 's' : ''} detected
          </Text>
        )}
      </View>
    </View>
  );
  

  // Start/Stop BLE Scan

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor="transparent" translucent={true} />
      {renderHeader()}
      
      <ScrollView 
        style={styles.scrollContainer}
        contentContainerStyle={styles.scrollContent}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            colors={['#2563EB']}
            tintColor="#2563EB"
          />
        }
        showsVerticalScrollIndicator={false}
      >
        {renderWelcomeSection()}
        {renderSupervisorsSection()}
        {renderAssignedVisitSection()}
        {/* Show checked-in badge if student is checked in */}
        {isCheckedIn && (
          <View style={{alignItems: 'center', marginBottom: 12}}>
            <View style={{backgroundColor: '#DCFCE7', borderRadius: 16, paddingVertical: 8, paddingHorizontal: 20, flexDirection: 'row', alignItems: 'center', gap: 8}}>
              <Icon name="check-circle" size={18} color="#10B981" />
              <Text style={{color: '#166534', fontWeight: '700', fontSize: 15}}>You are checked in</Text>
            </View>
          </View>
        )}
        {renderStatusCard()}
        {renderJoinVisitCard()}
        {renderVisitCard()}
        {currentVisit && currentVisit.locationCoordinates && studentLocation && (
          <View style={{ height: 300, borderRadius: 16, overflow: 'hidden', marginVertical: 16 }}>
            <MapView
              style={{ flex: 1 }}
              initialRegion={{
                latitude: currentVisit.locationCoordinates.latitude,
                longitude: currentVisit.locationCoordinates.longitude,
                latitudeDelta: 0.01,
                longitudeDelta: 0.01,
              }}
              customMapStyle={[]}
            >
              {/* Visit location pin */}
              <Marker
                coordinate={{
                  latitude: currentVisit.locationCoordinates.latitude,
                  longitude: currentVisit.locationCoordinates.longitude,
                }}
                title={currentVisit.location}
                description={"Visit Location"}
              />
              {/* Student location pin */}
              <Marker
                coordinate={{
                  latitude: studentLocation.latitude,
                  longitude: studentLocation.longitude,
                }}
                pinColor="#27ae60"
                title="You"
                description="Your Location"
              />
              {/* 500m perimeter */}
              <Circle
                center={{
                  latitude: currentVisit.locationCoordinates.latitude,
                  longitude: currentVisit.locationCoordinates.longitude,
                }}
                radius={500}
                strokeColor="#2563EB"
                fillColor="rgba(37,99,235,0.1)"
              />
            </MapView>
          </View>
        )}

        {renderBeaconScanner()}
        {renderQuickActions()}
        {renderVisitHistory()}
      </ScrollView>

      {renderEmergencyOverlay()}
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F9FAFB',
  },
  centered: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    fontSize: 16,
    color: '#6B7280',
    marginTop: 12,
    fontWeight: '500',
  },
  
  // Modern Header Styles
  modernHeader: {
    ...Platform.select({
      web: {
        background: 'linear-gradient(135deg, #1E40AF 0%, #3B82F6 100%)',
      },
      default: {
        backgroundColor: '#1E40AF',
      },
    }),
    paddingHorizontal: 16,
    paddingTop: Platform.OS === 'android' ? (StatusBar.currentHeight || 0) : 44,
    paddingBottom: 16,
    borderBottomLeftRadius: 24,
    borderBottomRightRadius: 24,
    ...Platform.select({
      web: {
        boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06)',
  },
      default: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.1,
        shadowRadius: 6,
        elevation: 8,
      },
    }),
  },
  headerContent: {
    gap: 16,
  },
  headerTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  logoContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flex: 1,
  },
  logo: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerText: {
    flex: 1,
  },
  headerTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#FFFFFF',
    lineHeight: 18,
  },
  headerSubtitle: {
    fontSize: 10,
    color: 'rgba(255, 255, 255, 0.8)',
    marginTop: 1,
    lineHeight: 12,
  },
  logoutIconButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  welcomeCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 16,
    marginBottom: 16,
    ...Platform.select({
      web: {
        boxShadow: '0 1px 3px 0 rgba(0, 0, 0, 0.1), 0 1px 2px 0 rgba(0, 0, 0, 0.06)',
      },
      default: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.1,
        shadowRadius: 2,
        elevation: 2,
      },
    }),
  },
  welcomeCardText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#374151',
    textAlign: 'center',
    lineHeight: 16,
  },
  supervisorCardText: {
    fontSize: 10,
    color: '#6B7280',
    textAlign: 'center',
    marginTop: 2,
    lineHeight: 12,
  },

  // Emergency Overlay
  emergencyOverlay: {
    flex: 1,
    backgroundColor: '#DC2626',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  emergencyContent: {
    alignItems: 'center',
    gap: 20,
  },
  emergencyIcon: {
    marginBottom: 10,
  },
  emergencyTitle: {
    fontSize: 24,
    fontWeight: '800',
    color: '#FFFFFF',
    textAlign: 'center',
  },
  emergencyText: {
    fontSize: 16,
    color: 'rgba(255, 255, 255, 0.9)',
    textAlign: 'center',
  },
  emergencySubtext: {
    fontSize: 14,
    color: 'rgba(255, 255, 255, 0.8)',
    textAlign: 'center',
  },
  emergencyActions: {
    width: '100%',
    gap: 12,
    marginTop: 20,
  },
  emergencyCallButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFFFFF',
    paddingVertical: 16,
    paddingHorizontal: 24,
    borderRadius: 12,
    gap: 8,
  },
  emergencyCallText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#DC2626',
  },
  emergencyCancelButton: {
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    paddingVertical: 16,
    paddingHorizontal: 24,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.3)',
  },
  emergencyCancelText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#FFFFFF',
    textAlign: 'center',
  },

  // Scroll Container
  scrollContainer: {
    flex: 1,
  },
  scrollContent: {
    padding: 16,
    paddingBottom: 60,
  },

  // Status Card
  statusCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 16,
    marginBottom: 16,
    borderWidth: 2,
    ...Platform.select({
      web: {
        boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06)',
      },
      default: {
    shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
      },
    }),
  },
  statusCardActive: {
    borderColor: '#10B981',
    backgroundColor: '#F0FDF4',
  },
  statusCardInactive: {
    borderColor: '#E5E7EB',
  },
  statusContent: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  statusIndicator: {
    width: 56,
    height: 56,
    borderRadius: 28,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 16,
  },
  statusTextContainer: {
    flex: 1,
  },
  statusTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#1F2937',
    marginBottom: 4,
  },
  statusDescription: {
    fontSize: 13,
    color: '#6B7280',
    lineHeight: 18,
  },
  statusInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 20,
    paddingTop: Platform.OS === 'android' ? 24 : 16,
  },
  statusInfoItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  statusInfoText: {
    fontSize: 11,
    color: '#6B7280',
    fontWeight: '500',
  },

  // Card Common Styles
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
    gap: 8,
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1F2937',
  },

  // Join Visit Card
  joinVisitCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 16,
    marginBottom: 16,
    ...Platform.select({
      web: {
        boxShadow: '0 1px 3px 0 rgba(0, 0, 0, 0.1), 0 1px 2px 0 rgba(0, 0, 0, 0.06)',
      },
      default: {
    shadowColor: '#000',
        shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
        shadowRadius: 2,
        elevation: 2,
      },
    }),
  },
  visitCodeContainer: {
    gap: 12,
  },
  visitCodeLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: '#374151',
  },
  visitCodeInputContainer: {
    borderWidth: 1,
    borderColor: '#D1D5DB',
    borderRadius: 12,
    backgroundColor: '#F9FAFB',
  },
  visitCodeInput: {
    paddingVertical: 12,
    paddingHorizontal: 16,
    fontSize: 16,
    fontWeight: '600',
    letterSpacing: 3,
    color: '#1F2937',
  },
  joinButton: {
    paddingVertical: 14,
    borderRadius: 12,
  },
  joinButtonActive: {
    backgroundColor: '#2563EB',
  },
  joinButtonInactive: {
    backgroundColor: '#9CA3AF',
  },
  joinButtonText: {
    fontSize: 15,
    fontWeight: '600',
    textAlign: 'center',
  },
  joinButtonTextActive: {
    color: '#FFFFFF',
  },
  joinButtonTextInactive: {
    color: '#FFFFFF',
  },

  // Visit Card
  modernVisitCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 16,
    marginBottom: 16,
    ...Platform.select({
      web: {
        boxShadow: '0 1px 3px 0 rgba(0, 0, 0, 0.1), 0 1px 2px 0 rgba(0, 0, 0, 0.06)',
      },
      default: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.1,
        shadowRadius: 2,
        elevation: 2,
      },
    }),
  },
  visitCardContent: {
    gap: 10,
  },
  visitDetailRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    minHeight: 24,
  },
  visitDetailText: {
    fontSize: 13,
    color: '#6B7280',
    flex: 1,
    lineHeight: 18,
  },
  modernActionButtons: {
    marginTop: 16,
  },
  modernCheckInButton: {
    backgroundColor: '#10B981',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    borderRadius: 12,
    gap: 8,
  },
  modernCheckOutButton: {
    backgroundColor: '#F59E0B',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    borderRadius: 12,
    gap: 8,
  },
  modernCompletedButton: {
    backgroundColor: '#6B7280',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    borderRadius: 12,
    gap: 8,
  },
  modernActionButtonText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '600',
  },

  // System Status Card
  systemStatusCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 16,
    marginBottom: 16,
    ...Platform.select({
      web: {
        boxShadow: '0 1px 3px 0 rgba(0, 0, 0, 0.1), 0 1px 2px 0 rgba(0, 0, 0, 0.06)',
      },
      default: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.1,
        shadowRadius: 2,
        elevation: 2,
  },
    }),
  },
  statusGrid: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    gap: 20,
  },
  statusItem: {
    alignItems: 'center',
    gap: 8,
    flex: 1,
    minHeight: 80,
    justifyContent: 'center',
  },
  statusItemLabel: {
    fontSize: 11,
    fontWeight: '500',
    color: '#6B7280',
    textAlign: 'center',
  },
  statusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    borderWidth: 1,
    minWidth: 60,
    alignItems: 'center',
  },
  statusBadgeText: {
    fontSize: 11,
    fontWeight: '600',
    textAlign: 'center',
  },

  // Quick Actions Card
  quickActionsCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 16,
    marginBottom: 16,
    ...Platform.select({
      web: {
        boxShadow: '0 1px 3px 0 rgba(0, 0, 0, 0.1), 0 1px 2px 0 rgba(0, 0, 0, 0.06)',
      },
      default: {
    shadowColor: '#000',
        shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
        shadowRadius: 2,
        elevation: 2,
      },
    }),
  },
  quickActionsList: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    gap: 16,
  },
  modernQuickAction: {
    flex: 1,
    flexDirection: 'column',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 8,
    backgroundColor: '#F9FAFB',
    borderRadius: 12,
    gap: 6,
    minHeight: 60,
    justifyContent: 'center',
  },
  quickActionText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#374151',
    textAlign: 'center',
  },

  // History Card
  historyCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 16,
    marginBottom: 20,
    ...Platform.select({
      web: {
        boxShadow: '0 1px 3px 0 rgba(0, 0, 0, 0.1), 0 1px 2px 0 rgba(0, 0, 0, 0.06)',
      },
      default: {
    shadowColor: '#000',
        shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
        shadowRadius: 2,
        elevation: 2,
      },
    }),
  },
  historyList: {
    gap: 10,
  },
  modernHistoryItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 16,
    backgroundColor: '#F9FAFB',
    borderRadius: 12,
    minHeight: 60,
  },
  historyItemLeft: {
    flex: 1,
    paddingRight: 12,
  },
  historyItemName: {
    fontSize: 13,
    fontWeight: '600',
    color: '#1F2937',
    marginBottom: 4,
  },
  historyItemDate: {
    fontSize: 11,
    color: '#6B7280',
  },
  historyItemRight: {
    alignItems: 'flex-end',
  },
  historyStatusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    borderWidth: 1,
    minWidth: 70,
    alignItems: 'center',
  },
  historyStatusText: {
    fontSize: 11,
    fontWeight: '600',
    textAlign: 'center',
  },
  viewAllButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    marginTop: 8,
    gap: 6,
  },
  viewAllButtonText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#2563EB',
  },

  // Assigned Visit Section
  assignedVisitSection: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 16,
    marginBottom: 16,
    borderWidth: 2,
    borderColor: '#2563EB',
    ...Platform.select({
      web: {
        boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06)',
      },
      default: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.1,
        shadowRadius: 4,
        elevation: 3,
      },
    }),
  },
  assignedVisitHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 16,
  },
  assignedVisitTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#1F2937',
  },
  assignedVisitsScrollContent: {
    gap: 16,
  },
  assignedVisitCard: {
    width: width - 32, // Full width minus padding
    padding: 16,
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    borderWidth: 2,
    borderColor: '#2563EB',
    ...Platform.select({
      web: {
        boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06)',
      },
      default: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.1,
        shadowRadius: 4,
        elevation: 3,
      },
    }),
  },
  assignedVisitContent: {
    gap: 16,
  },
  assignedVisitInfo: {
    gap: 12,
  },
  assignedVisitRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  assignedVisitText: {
    fontSize: 14,
    color: '#4B5563',
    flex: 1,
  },
  assignedVisitButton: {
    backgroundColor: '#2563EB',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    borderRadius: 12,
    gap: 8,
  },
  assignedVisitButtonDisabled: {
    backgroundColor: '#9CA3AF',
  },
  assignedVisitButtonText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '600',
  },

  // Auto Check-in Badge
  autoCheckInBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#DCFCE7',
    borderRadius: 12,
    paddingHorizontal: 8,
    paddingVertical: 4,
    marginTop: 8,
    gap: 4,
    alignSelf: 'flex-start',
  },
  autoCheckInText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#166534',
  },

  // Visit Status Badge
  visitStatusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#DCFCE7',
    borderRadius: 12,
    paddingHorizontal: 8,
    paddingVertical: 4,
    marginTop: 8,
    gap: 4,
    alignSelf: 'flex-start',
  },
  visitStatusText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#166534',
  },
  checkedOutBadge: {
    backgroundColor: '#DBEAFE',
  },
  checkedOutText: {
    color: '#1E40AF',
  },

  // Assigned Visit Pagination
  assignedVisitPagination: {
    flexDirection: 'row',
    justifyContent: 'center',
    marginTop: 16,
    gap: 8,
  },
  paginationDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#9CA3AF',
  },
  paginationDotActive: {
    backgroundColor: '#2563EB',
  },

  supervisorsCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 16,
    marginBottom: 16,
    ...Platform.select({
      web: {
        boxShadow: '0 1px 3px 0 rgba(0, 0, 0, 0.1), 0 1px 2px 0 rgba(0, 0, 0, 0.06)',
      },
      default: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.1,
        shadowRadius: 2,
        elevation: 2,
      },
    }),
  },
  supervisorsList: {
    gap: 12,
    marginBottom: 16,
  },
  supervisorItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 12,
    backgroundColor: '#F9FAFB',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  supervisorInfo: {
    flex: 1,
  },
  supervisorName: {
    fontSize: 14,
    fontWeight: '600',
    color: '#1F2937',
    marginBottom: 2,
  },
  supervisorEmail: {
    fontSize: 12,
    color: '#6B7280',
  },
  supervisorCode: {
    backgroundColor: '#EFF6FF',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  supervisorCodeText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#2563EB',
  },
  joinSupervisorContainer: {
    gap: 12,
  },
  joinSupervisorLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: '#374151',
  },
  joinSupervisorInputContainer: {
    borderWidth: 1,
    borderColor: '#D1D5DB',
    borderRadius: 12,
    backgroundColor: '#F9FAFB',
  },
  joinSupervisorInput: {
    paddingVertical: 12,
    paddingHorizontal: 16,
    fontSize: 16,
    fontWeight: '600',
    letterSpacing: 3,
    color: '#1F2937',
  },
  joinSupervisorButton: {
    paddingVertical: 14,
    borderRadius: 12,
  },
  joinSupervisorButtonActive: {
    backgroundColor: '#2563EB',
  },
  joinSupervisorButtonInactive: {
    backgroundColor: '#9CA3AF',
  },
  joinSupervisorButtonText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#FFFFFF',
    textAlign: 'center',
  },

  noSupervisorsContainer: {
    alignItems: 'center',
    padding: 24,
    backgroundColor: '#F9FAFB',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    gap: 8,
  },
  noSupervisorsText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#374151',
  },
  noSupervisorsSubtext: {
    fontSize: 12,
    color: '#6B7280',
  },
  supervisorHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 2,
  },
  assignedBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#DCFCE7',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    gap: 4,
  },
  assignedBadgeText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#166534',
  },
  supervisorStats: {
    flexDirection: 'row',
    gap: 16,
    marginTop: 8,
  },
  statItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  statText: {
    fontSize: 12,
    color: '#6B7280',
  },
  supervisorItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    padding: 16,
    backgroundColor: '#F9FAFB',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  supervisorInfo: {
    flex: 1,
    marginRight: 12,
  },
  supervisorName: {
    fontSize: 15,
    fontWeight: '600',
    color: '#1F2937',
  },
  supervisorEmail: {
    fontSize: 13,
    color: '#6B7280',
    marginTop: 2,
  },
  supervisorCode: {
    backgroundColor: '#EFF6FF',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    alignSelf: 'flex-start',
  },
  supervisorCodeText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#2563EB',
  },
  beaconScannerCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 16,
    marginBottom: 16,
    ...Platform.select({
      web: {
        boxShadow: '0 1px 3px 0 rgba(0, 0, 0, 0.1), 0 1px 2px 0 rgba(0, 0, 0, 0.06)',
      },
      default: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.1,
        shadowRadius: 2,
        elevation: 2,
      },
    }),
  },
  beaconScanButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 12,
    gap: 8,
  },
  beaconScanButtonActive: {
    backgroundColor: '#DC2626',
  },
  beaconScanButtonInactive: {
    backgroundColor: '#2563EB',
  },
  beaconScanButtonText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '600',
  },
  beaconItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F9FAFB',
    borderRadius: 10,
    padding: 10,
    marginBottom: 6,
    gap: 10,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  beaconName: {
    fontSize: 13,
    fontWeight: '600',
    color: '#1F2937',
  },
  beaconId: {
    fontSize: 11,
    color: '#6B7280',
  },
  beaconRssi: {
    fontSize: 11,
    color: '#2563EB',
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
    gap: 8,
  },
  cardTitle: {
    fontWeight: '600',
    fontSize: 16,
    color: '#1F2937',
  },
});

export default UserTracker; 