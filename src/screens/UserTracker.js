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

// Conditional import for Android-only PermissionsAndroid
let PermissionsAndroid;
if (Platform.OS === 'android') {
  PermissionsAndroid = require('react-native').PermissionsAndroid;
}

import MapView, { Circle, Marker } from 'react-native-maps';
import { auth, db } from '../firebase/firebaseConfig';
import { useAuth } from '../utils/AuthContext';
import { useIndoorLocation } from '../context/IndoorLocationContext';
import ErrorHandler, { ERROR_SEVERITY } from '../utils/ErrorHandler';
import { requestForegroundPermissionsAsync as requestLocationPermissions } from 'expo-location';
import IndoorMapModal from '../components/IndoorMapModal';

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
  const [indoorMapVisible, setIndoorMapVisible] = useState(false);

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

  // Fetch supervisor information
  const fetchSupervisorInfo = async () => {
    try {
      const userDoc = await getDoc(doc(db, 'users', userData.uid));
      if (userDoc.exists()) {
        const userData = userDoc.data();
        if (userData.supervisorId) {
          const supervisorDoc = await getDoc(doc(db, 'users', userData.supervisorId));
          if (supervisorDoc.exists()) {
            setSupervisorInfo(supervisorDoc.data());
          }
        }
      }
    } catch (error) {
      console.error('Error fetching supervisor info:', error);
    }
  };

  // Fetch all supervisors
  const fetchAllSupervisors = async () => {
    try {
          const supervisorsQuery = query(
            collection(db, 'users'),
        where('role', '==', 'supervisor')
          );
          const querySnapshot = await getDocs(supervisorsQuery);
          const supervisorsList = [];
          querySnapshot.forEach((doc) => {
            supervisorsList.push({
              id: doc.id,
          ...doc.data()
            });
          });
          setSupervisors(supervisorsList);
    } catch (error) {
      console.error('Error fetching supervisors:', error);
    }
  };

  // Fetch current visit
  const fetchCurrentVisit = async () => {
    try {
      const visitsQuery = query(
        collection(db, 'visits'),
        where('studentId', '==', userData.uid),
        where('status', 'in', ['active', 'checked-in'])
      );
      const querySnapshot = await getDocs(visitsQuery);
      if (!querySnapshot.empty) {
        const visitDoc = querySnapshot.docs[0];
        setCurrentVisit({
          id: visitDoc.id,
          ...visitDoc.data()
        });
            setUserStatus('checked-in');
      } else {
        setCurrentVisit(null);
        setUserStatus('not-in-visit');
          }
    } catch (error) {
      console.error('Error fetching current visit:', error);
    }
  };

  // Fetch visit history
  const fetchVisitHistory = async () => {
    try {
      const visitsQuery = query(
        collection(db, 'visits'),
        where('studentId', '==', userData.uid),
        where('status', '==', 'completed')
      );
      const querySnapshot = await getDocs(visitsQuery);
      const history = [];
      querySnapshot.forEach((doc) => {
        history.push({
          id: doc.id,
          ...doc.data()
        });
      });
      setVisitHistory(history);
    } catch (error) {
      console.error('Error fetching visit history:', error);
    }
  };

  // Fetch assigned visit
  const fetchAssignedVisit = async () => {
    try {
      const visitsQuery = query(
        collection(db, 'visits'),
        where('studentId', '==', userData.uid),
        where('status', '==', 'assigned')
      );
      const querySnapshot = await getDocs(visitsQuery);
      if (!querySnapshot.empty) {
        const visitDoc = querySnapshot.docs[0];
        setAssignedVisit({
          id: visitDoc.id,
          ...visitDoc.data()
        });
      } else {
        setAssignedVisit(null);
      }
    } catch (error) {
      console.error('Error fetching assigned visit:', error);
    }
  };

  // Request and fetch location
  const requestAndFetchLocation = async () => {
    try {
      setMapLocationLoading(true);
      const hasPermission = await requestLocationPermissions();
      if (hasPermission) {
        const location = await Location.getCurrentPositionAsync({
          accuracy: Location.Accuracy.High
        });
        setStudentLocation(location);
      }
    } catch (error) {
      console.error('Error getting location:', error);
    } finally {
      setMapLocationLoading(false);
    }
  };

  // Calculate distance between two points
  const getDistance = (lat1, lon1, lat2, lon2) => {
    function toRad(x) { return x * Math.PI / 180; }
    const R = 6371; // Earth's radius in km
    const dLat = toRad(lat2 - lat1);
    const dLon = toRad(lon2 - lon1);
    const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) *
      Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  };

  // Handle check in
  const handleCheckIn = async () => {
    if (!currentVisit) return;
    
    setActionLoading(true);
    try {
      const visitRef = doc(db, 'visits', currentVisit.id);
      await updateDoc(visitRef, {
        status: 'checked-in',
        checkInTime: new Date(),
        checkInLocation: studentLocation ? {
          latitude: studentLocation.coords.latitude,
          longitude: studentLocation.coords.longitude
        } : null
      });
      
      setUserStatus('checked-in');
      Alert.alert('Success', 'Successfully checked in!');
    } catch (error) {
      console.error('Error checking in:', error);
      Alert.alert('Error', 'Failed to check in');
    } finally {
      setActionLoading(false);
    }
  };

  // Handle check out
  const handleCheckOut = async () => {
    if (!currentVisit) return;
    
    setActionLoading(true);
    try {
      const visitRef = doc(db, 'visits', currentVisit.id);
      await updateDoc(visitRef, {
        status: 'completed',
        checkOutTime: new Date(),
        checkOutLocation: studentLocation ? {
          latitude: studentLocation.coords.latitude,
          longitude: studentLocation.coords.longitude
        } : null
      });
      
      setUserStatus('not-in-visit');
      setCurrentVisit(null);
      Alert.alert('Success', 'Successfully checked out!');
    } catch (error) {
      console.error('Error checking out:', error);
      Alert.alert('Error', 'Failed to check out');
    } finally {
      setActionLoading(false);
    }
  };

  // Handle refresh
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

  // Handle logout
  const handleLogout = async () => {
    try {
      await stopLocationTracking();
              await signOut(auth);
      clearAuthState();
            } catch (error) {
      console.error('Error logging out:', error);
    }
  };

  // Get status color
  const getStatusColor = () => {
    switch (userStatus) {
      case 'checked-in':
        return '#4CAF50';
      case 'checked-out':
        return '#FF9800';
      default:
        return '#9E9E9E';
    }
  };

  // Get status text
  const getStatusText = () => {
    switch (userStatus) {
      case 'checked-in':
        return 'Checked In';
      case 'checked-out':
        return 'Checked Out';
      default:
        return 'Not in Visit';
    }
  };

  // Get status icon
  const getStatusIcon = () => {
    switch (userStatus) {
      case 'checked-in':
        return 'check-circle';
      case 'checked-out':
        return 'exit-to-app';
      default:
        return 'schedule';
    }
  };

  // Handle emergency
  const handleEmergency = () => {
    setEmergencyMode(!emergencyMode);
    Alert.alert(
      emergencyMode ? 'Emergency Mode Disabled' : 'Emergency Mode Enabled',
      emergencyMode ? 'Emergency mode has been disabled.' : 'Emergency mode has been enabled. Your location will be shared with supervisors.'
    );
  };

  // Handle join visit
  const handleJoinVisit = async () => {
    if (!visitCode.trim()) {
      Alert.alert('Error', 'Please enter a visit code');
      return;
    }

    setActionLoading(true);
    try {
      const visitsQuery = query(
        collection(db, 'visits'),
        where('visitCode', '==', visitCode.trim())
      );
      const querySnapshot = await getDocs(visitsQuery);
      
      if (querySnapshot.empty) {
        Alert.alert('Error', 'Invalid visit code');
        return;
      }

      const visitDoc = querySnapshot.docs[0];
      const visitData = visitDoc.data();
      
      if (visitData.status !== 'active') {
        Alert.alert('Error', 'This visit is not active');
        return;
      }

      // Join the visit
      await updateDoc(doc(db, 'visits', visitDoc.id), {
        studentId: userData.uid,
        status: 'checked-in',
        checkInTime: new Date()
      });

      setCurrentVisit({
        id: visitDoc.id,
        ...visitData
      });
      setUserStatus('checked-in');
      setVisitCode('');
      Alert.alert('Success', 'Successfully joined the visit!');
    } catch (error) {
      console.error('Error joining visit:', error);
      Alert.alert('Error', 'Failed to join visit');
    } finally {
      setActionLoading(false);
    }
  };

  // Get connection status
  const getConnectionStatus = () => {
    if (bluetoothState === 'PoweredOn' && isTracking) {
      return 'Connected';
    } else if (bluetoothState === 'PoweredOn') {
      return 'Ready';
    } else {
      return 'Disconnected';
    }
  };

  // Get status badge style
  const getStatusBadgeStyle = (status) => {
    switch (status) {
      case 'Connected':
        return styles.statusBadgeConnected;
      case 'Ready':
        return styles.statusBadgeReady;
      default:
        return styles.statusBadgeDisconnected;
    }
  };

  // Handle assigned visit check in
  const handleAssignedVisitCheckIn = async (visit) => {
    setActionLoading(true);
    try {
      const visitRef = doc(db, 'visits', visit.id);
      await updateDoc(visitRef, {
        status: 'checked-in',
        checkInTime: new Date(),
        checkInLocation: studentLocation ? {
          latitude: studentLocation.coords.latitude,
          longitude: studentLocation.coords.longitude
        } : null
      });
      
      setCurrentVisit({
        id: visit.id,
        ...visit
      });
      setAssignedVisit(null);
      setUserStatus('checked-in');
      Alert.alert('Success', 'Successfully checked in to assigned visit!');
    } catch (error) {
      console.error('Error checking in to assigned visit:', error);
      Alert.alert('Error', 'Failed to check in');
    } finally {
      setActionLoading(false);
    }
  };

  // Handle join supervisor
  const handleJoinSupervisor = async () => {
    if (!supervisorCode.trim()) {
      Alert.alert('Error', 'Please enter a supervisor code');
      return;
    }

    setActionLoading(true);
    try {
      const supervisorsQuery = query(
        collection(db, 'users'),
        where('role', '==', 'supervisor'),
        where('supervisorCode', '==', supervisorCode.trim())
      );
      const querySnapshot = await getDocs(supervisorsQuery);
      
      if (querySnapshot.empty) {
        Alert.alert('Error', 'Invalid supervisor code');
        return;
      }

      const supervisorDoc = querySnapshot.docs[0];
      
      // Update user's supervisor
      await updateDoc(doc(db, 'users', userData.uid), {
        supervisorId: supervisorDoc.id
      });

      setSupervisorInfo(supervisorDoc.data());
      setSupervisorCode('');
      Alert.alert('Success', 'Successfully joined supervisor!');
    } catch (error) {
      console.error('Error joining supervisor:', error);
      Alert.alert('Error', 'Failed to join supervisor');
    } finally {
      setActionLoading(false);
    }
  };

  // Initialize data on mount
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

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      stopLocationTracking();
    };
  }, []);

  // Render supervisors section
  const renderSupervisorsSection = () => (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>Join Supervisor</Text>
      <View style={styles.inputContainer}>
          <TextInput
          style={styles.input}
          placeholder="Enter supervisor code"
            value={supervisorCode}
          onChangeText={setSupervisorCode}
        />
        <TouchableOpacity
          style={[styles.button, actionLoading && styles.buttonDisabled]}
          onPress={handleJoinSupervisor}
          disabled={actionLoading}
        >
          <Text style={styles.buttonText}>Join</Text>
        </TouchableOpacity>
      </View>
      
        {supervisorInfo && (
        <View style={styles.supervisorInfo}>
          <Text style={styles.supervisorName}>{supervisorInfo.name}</Text>
          <Text style={styles.supervisorEmail}>{supervisorInfo.email}</Text>
      </View>
        )}
      </View>
    );

  // Render assigned visit section
  const renderAssignedVisitSection = () => {
    if (!assignedVisit) return null;

    return (
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Assigned Visit</Text>
        <View style={styles.visitCard}>
          <Text style={styles.visitTitle}>{assignedVisit.title}</Text>
          <Text style={styles.visitDescription}>{assignedVisit.description}</Text>
          <Text style={styles.visitTime}>
            {new Date(assignedVisit.scheduledTime?.toDate()).toLocaleString()}
            </Text>
                <TouchableOpacity
            style={[styles.button, actionLoading && styles.buttonDisabled]}
            onPress={() => handleAssignedVisitCheckIn(assignedVisit)}
                  disabled={actionLoading}
                >
            <Text style={styles.buttonText}>Check In</Text>
                </TouchableOpacity>
            </View>
          </View>
    );
  };

  // Render header
  const renderSystemStatus = () => {
    const connectionStatus = getConnectionStatus();
    
    return (
      <View style={styles.systemStatusCard}>
        <View style={styles.cardHeader}>
          <Icon name="settings" size={18} color="#1F2937" />
          <Text style={styles.cardTitle}>System Status</Text>
        </View>
        
        <View style={styles.statusGrid}>
          {Object.entries(connectionStatus).map(([key, value]) => (
            <View key={key} style={styles.statusItem}>
              <Icon name={value.icon} size={20} color={value.color} />
              <Text style={styles.statusItemLabel}>
                {key.charAt(0).toUpperCase() + key.slice(1)}
              </Text>
              <View style={[styles.statusBadge, { backgroundColor: `${value.color}20`, borderColor: value.color }]}>
                <Text style={[styles.statusBadgeText, { color: value.color }]}>
                  {value.status}
            </Text>
          </View>
            </View>
          ))}
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
        {/* New quick action: Indoor Tracking */}
        <TouchableOpacity
          style={styles.modernQuickAction}
          onPress={() => setIndoorMapVisible(true)}
        >
          <Icon name="map" size={20} color="#8B5CF6" />
          <Text style={styles.quickActionText}>Indoor Map</Text>
        </TouchableOpacity>
        {/* New quick action: BLE Debug */}
        <TouchableOpacity
          style={styles.modernQuickAction}
          onPress={() => navigation.navigate('BleDebug')}
        >
          <Icon name="bluetooth" size={20} color="#F59E42" />
          <Text style={styles.quickActionText}>BLE Debug</Text>
        </TouchableOpacity>
      </View>
    </View>
  );

  // Debug logs for map rendering
  console.log('userStatus:', userStatus);
  console.log('currentVisit:', currentVisit);
  console.log('currentVisit.locationCoordinates:', currentVisit?.locationCoordinates);
  console.log('studentLocation:', studentLocation);
  console.log('mapLocationLoading:', mapLocationLoading);

  // Render beacon scanner
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

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor="transparent" translucent={true} />
      
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
        {renderSupervisorsSection()}
        {renderAssignedVisitSection()}
        {/* Show checked-in badge if student is checked in */}
        {userStatus === 'checked-in' && (
          <View style={{alignItems: 'center', marginBottom: 12}}>
            <View style={{backgroundColor: '#DCFCE7', borderRadius: 16, paddingVertical: 8, paddingHorizontal: 20, flexDirection: 'row', alignItems: 'center', gap: 8}}>
              <Icon name="check-circle" size={18} color="#10B981" />
              <Text style={{color: '#166534', fontWeight: '700', fontSize: 15}}>You are checked in</Text>
            </View>
          </View>
        )}
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
        {renderSystemStatus()}
        {renderBeaconScanner()}
        {renderQuickActions()}
        {renderVisitHistory()}
      </ScrollView>
      
      {/* Indoor Map Modal */}
      <IndoorMapModal
        visible={indoorMapVisible}
        onClose={() => setIndoorMapVisible(false)}
      />
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