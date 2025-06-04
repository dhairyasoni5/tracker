import { MaterialIcons as Icon } from '@expo/vector-icons';
import * as Location from 'expo-location';
import { signOut } from 'firebase/auth';
import {
    arrayRemove,
    arrayUnion,
    collection,
    doc,
    getDocs,
    query,
    updateDoc,
    where
} from 'firebase/firestore';
import React, { useEffect, useState } from 'react';
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
import MapView, { Circle, Marker } from 'react-native-maps';
import { auth, db } from '../firebase/firebaseConfig';
import { useAuth } from '../utils/AuthContext';
import ErrorHandler, { ERROR_SEVERITY } from '../utils/ErrorHandler';

const { width, height } = Dimensions.get('window');

const UserTracker = ({ navigation }) => {
  const { userData, clearAuthState } = useAuth();
  const [supervisorInfo, setSupervisorInfo] = useState(null);
  const [currentVisit, setCurrentVisit] = useState(null);
  const [visitHistory, setVisitHistory] = useState([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [userStatus, setUserStatus] = useState('not-in-visit'); // 'not-in-visit', 'checked-in', 'checked-out'
  const [emergencyMode, setEmergencyMode] = useState(false);
  const [isTracking, setIsTracking] = useState(true);
  const [locationSharing, setLocationSharing] = useState(true);
  const [visitCode, setVisitCode] = useState('');
  const [studentLocation, setStudentLocation] = useState(null);
  const [locationPermission, setLocationPermission] = useState(null);
  const [mapLocationLoading, setMapLocationLoading] = useState(false);
  
  // Animation values
  const pulseAnim = new Animated.Value(1);
  const emergencyPulse = new Animated.Value(1);

  // Student is considered checked in if userStatus === 'checked-in'
  const isCheckedIn = userStatus === 'checked-in';

  useEffect(() => {
    if (userData && userData.uid) {
      fetchSupervisorInfo();
      fetchCurrentVisit();
      fetchVisitHistory();
      startAnimations();
    }
  }, [userData]);

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

  const startAnimations = () => {
    // Status pulse animation
    Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, {
          toValue: 1.1,
          duration: 1000,
          useNativeDriver: true,
        }),
        Animated.timing(pulseAnim, {
          toValue: 1,
          duration: 1000,
          useNativeDriver: true,
        }),
      ])
    ).start();

    // Emergency pulse animation
    Animated.loop(
      Animated.sequence([
        Animated.timing(emergencyPulse, {
          toValue: 1.2,
          duration: 600,
          useNativeDriver: true,
        }),
        Animated.timing(emergencyPulse, {
          toValue: 1,
          duration: 600,
          useNativeDriver: true,
        }),
      ])
    ).start();
  };

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
      
      // Sort by date, most recent first
      visits.sort((a, b) => new Date(b.dateTime) - new Date(a.dateTime));
      setVisitHistory(visits.slice(0, 5)); // Show last 5 visits
    } catch (error) {
      ErrorHandler.logError(error, {
        action: 'fetchVisitHistory',
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
      fetchSupervisorInfo(),
      fetchCurrentVisit(),
      fetchVisitHistory()
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
    // Only GPS and Network status as requested
    return {
      gps: { status: 'Strong', color: '#10B981', icon: 'gps-fixed' },
      network: { status: 'Connected', color: '#10B981', icon: 'wifi' }
    };
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
            <Icon 
              name={isInVisit ? "location-on" : "location-off"} 
              size={28} 
              color="#FFFFFF" 
            />
          </Animated.View>

          <View style={styles.statusTextContainer}>
            <Text style={styles.statusTitle}>
              {isInVisit ? "Currently in Visit" : "Not in Visit"}
            </Text>
            <Text style={styles.statusDescription}>
              {isInVisit ? 
                (currentVisit?.purpose || "Factory Tour - Group A") : 
                "Join a visit to start tracking"
              }
            </Text>
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

    return (
      <View style={styles.historyCard}>
        <View style={styles.cardHeader}>
          <Icon name="history" size={18} color="#1F2937" />
          <Text style={styles.cardTitle}>Recent Visits</Text>
        </View>
        
        <View style={styles.historyList}>
          {visitHistory.slice(0, 3).map((visit, index) => (
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
                  getStatusBadgeStyle(
                    visit.attendance?.checkedOut?.includes(userData.uid) ? 'checked-out' :
                    visit.attendance?.checkedIn?.includes(userData.uid) ? 'checked-in' : 'not-in-visit'
                  )
                ]}>
                  <Text style={[
                    styles.historyStatusText,
                    { 
                      color: visit.attendance?.checkedOut?.includes(userData.uid) ? '#166534' :
                             visit.attendance?.checkedIn?.includes(userData.uid) ? '#1E40AF' : '#374151'
                    }
                  ]}>
                    {visit.attendance?.checkedOut?.includes(userData.uid) ? 'Completed' :
                     visit.attendance?.checkedIn?.includes(userData.uid) ? 'Attended' : 'Missed'}
                  </Text>
                </View>
              </View>
            </View>
          ))}
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
        {/* Always show Join Visit card, but disable check-in if already checked in */}
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
        {renderSystemStatus()}
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
});

export default UserTracker; 