import { MaterialIcons as Icon } from '@expo/vector-icons';
import { Picker } from '@react-native-picker/picker';
import { signOut } from 'firebase/auth';
import {
  arrayUnion,
  collection,
  doc,
  getDocs,
  onSnapshot,
  query,
  updateDoc,
  where
} from 'firebase/firestore';
import React, { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Dimensions,
  FlatList,
  Modal,
  Platform,
  RefreshControl,
  SafeAreaView,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TouchableOpacity,
  View
} from 'react-native';
import MapView, { Circle, Marker } from 'react-native-maps';
import Svg, { G, Path, Rect } from 'react-native-svg';
import LiveLocationMap from '../components/LiveLocationMap';
import { auth, db } from '../firebase/firebaseConfig';
import { useAuth } from '../utils/AuthContext';
import ErrorHandler, { ERROR_SEVERITY } from '../utils/ErrorHandler';

const { width, height } = Dimensions.get('window');

const SupervisorDashboard = ({ navigation }) => {
  const { userData, clearAuthState } = useAuth();
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [students, setStudents] = useState([]);
  const [todayVisits, setTodayVisits] = useState([]);
  const [isVisitActive, setIsVisitActive] = useState(false);
  const [visitDuration, setVisitDuration] = useState("0h 0m");
  const [selectedTab, setSelectedTab] = useState("overview");
  const [allVisits, setAllVisits] = useState([]);
  const [stats, setStats] = useState({
    totalStudents: 0,
    activeStudents: 0,
    checkedInToday: 0,
    emergencyAlerts: 0,
    activeVisits: 0,
    completedVisits: 0
  });
  const [selectedVisitId, setSelectedVisitId] = useState(null);
  const [isZoomModalVisible, setZoomModalVisible] = useState(false);
  const mapRef = useRef(null);
  const [beacons, setBeacons] = useState([]);
  const [studentsByRoom, setStudentsByRoom] = useState({});
  const [svgLoaded, setSvgLoaded] = useState(false);

  const visitsWithLocation = todayVisits
    .filter(v => v.locationCoordinates && v.status === 'active' && !v.endTime)
    .sort((a, b) => new Date(b.dateTime || b.createdAt?.seconds * 1000) - new Date(a.dateTime || a.createdAt?.seconds * 1000));

  useEffect(() => {
    if (visitsWithLocation.length > 0) {
      if (!selectedVisitId || !visitsWithLocation.some(v => v.id === selectedVisitId)) {
        setSelectedVisitId(visitsWithLocation[0].id);
      }
    } else {
      setSelectedVisitId(null);
      setIsVisitActive(false);
      setVisitDuration('0h 0m');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [todayVisits]);

  useEffect(() => {
    console.log('SupervisorDashboard useEffect triggered');
    
    if (!userData?.uid) {
      console.log('Waiting for userData.uid to load...');
      return;
    }

    console.log('UserData loaded, fetching dashboard data...');
    fetchDashboardData();
    fetchAllVisits();
    
    const unsubscribes = setupRealtimeListeners();
    
    return () => {
      unsubscribes.forEach(unsubscribe => unsubscribe());
    };
  }, [userData?.uid]);

  useEffect(() => {
    if (todayVisits.length > 0 && !selectedVisitId) {
      setSelectedVisitId(todayVisits[0].id);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [todayVisits]);

  useEffect(() => {
    if (selectedVisit && mapRef.current) {
      mapRef.current.animateToRegion({
        latitude: selectedVisit.locationCoordinates.latitude,
        longitude: selectedVisit.locationCoordinates.longitude,
        latitudeDelta: 0.01,
        longitudeDelta: 0.01,
      }, 500);
    }
  }, [selectedVisitId]);

  const selectedVisit = visitsWithLocation.find(v => v.id === selectedVisitId);

  const setupRealtimeListeners = () => {
    const unsubscribes = [];

    if (!userData?.uid) {
      console.warn('Cannot setup real-time listeners: userData.uid not available');
      return unsubscribes;
    }

    console.log('Setting up real-time listeners for supervisor:', userData.uid);

    // Real-time listener for visits
    const visitsQuery = query(
      collection(db, 'visits'),
      where('supervisorId', '==', userData.uid)
    );

    const unsubscribeVisits = onSnapshot(visitsQuery, async (snapshot) => {
      const allVisits = [];
      const today = new Date();
      const startOfDay = new Date(today.getFullYear(), today.getMonth(), today.getDate());
      const endOfDay = new Date(today.getFullYear(), today.getMonth(), today.getDate() + 1);

      // Process each visit
      for (const docSnapshot of snapshot.docs) {
        const visitData = docSnapshot.data();
        const visitDate = new Date(visitData.dateTime);
        
        // Only mark visits as completed if they are from previous days AND have startTime
        if (visitDate < startOfDay && visitData.status === 'active' && visitData.startTime) {
          try {
            const visitRef = doc(db, 'visits', docSnapshot.id);
            await updateDoc(visitRef, { 
              status: 'completed',
              endTime: new Date().toISOString()
            });
            console.log(`Marked visit ${docSnapshot.id} as completed`);
          } catch (error) {
            console.error(`Error updating visit ${docSnapshot.id}:`, error);
          }
        }

        // Don't auto-complete visits that are just created
        if (visitData.status === 'active' && !visitData.startTime) {
          console.log(`New visit ${docSnapshot.id} detected, keeping as active`);
        }

        allVisits.push({ 
          id: docSnapshot.id, 
          ...visitData,
          status: visitData.status || 'pending'
        });
      }
      
      const todayVisits = allVisits.filter(visit => {
        const visitDate = new Date(visit.dateTime);
        return visitDate >= startOfDay && visitDate < endOfDay;
      });
      
      setTodayVisits(todayVisits);
      
      // Check if there's an active visit that is actually running
      const activeVisit = todayVisits.find(visit => {
        return visit.status === 'active' && (!visit.endTime); // Only check for endTime, not startTime
      });
      
      // Update visit active state
      setIsVisitActive(!!activeVisit);
      
      if (activeVisit) {
        // Calculate duration if startTime exists
        if (activeVisit.startTime) {
          const startTime = new Date(activeVisit.startTime);
          const now = new Date();
          const diffMs = now - startTime;
          const hours = Math.floor(diffMs / (1000 * 60 * 60));
          const minutes = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));
          setVisitDuration(`${hours}h ${minutes}m`);
        } else {
          setVisitDuration('0h 0m');
        }
      } else {
        setVisitDuration('0h 0m');
      }
      
      // Update stats with the latest data
      updateStats(students, todayVisits, allVisits);
    }, (error) => {
      console.warn('Real-time listener error:', error);
      fetchDashboardData();
    });

    unsubscribes.push(unsubscribeVisits);

    // Real-time listener for students (for indoor tracking)
    if (userData?.supervisorCode) {
      // Listen to students with matching supervisorCode
      const directStudentsQuery = query(
        collection(db, 'users'),
        where('role', '==', 'user'),
        where('supervisorCode', '==', userData.supervisorCode)
      );

      const joinedStudentsQuery = query(
        collection(db, 'users'),
        where('role', '==', 'user'),
        where('supervisorCodes', 'array-contains', userData.supervisorCode)
      );

      const unsubscribeDirectStudents = onSnapshot(directStudentsQuery, (snapshot) => {
        const updatedStudents = [];
        snapshot.forEach((doc) => {
          const studentData = doc.data();
          updatedStudents.push({
            id: doc.id,
            ...studentData,
            status: studentData.status || 'offline',
            lastSeen: studentData.lastSeen || 'Never',
            lastKnownLocation: studentData.lastKnownLocation || null,
            joinType: 'registered'
          });
        });
        
        // Update students state with new data
        setStudents(prevStudents => {
          const existingStudents = prevStudents.filter(s => s.joinType !== 'registered');
          return [...existingStudents, ...updatedStudents];
        });
      });

      const unsubscribeJoinedStudents = onSnapshot(joinedStudentsQuery, (snapshot) => {
        const updatedStudents = [];
        snapshot.forEach((doc) => {
          const studentData = doc.data();
          updatedStudents.push({
            id: doc.id,
            ...studentData,
            status: studentData.status || 'offline',
            lastSeen: studentData.lastSeen || 'Never',
            lastKnownLocation: studentData.lastKnownLocation || null,
            joinType: 'joined'
          });
        });
        
        // Update students state with new data
        setStudents(prevStudents => {
          const existingStudents = prevStudents.filter(s => s.joinType !== 'joined');
          return [...existingStudents, ...updatedStudents];
        });
      });

      unsubscribes.push(unsubscribeDirectStudents, unsubscribeJoinedStudents);
    }

    return unsubscribes;
  };

  const fetchDashboardData = async () => {
    try {
      console.log('Starting fetchDashboardData...');
      setLoading(true);
      
      const studentsList = await fetchStudents();
      const visitsList = await fetchTodayVisits();
      
      console.log('Dashboard data fetched successfully');
      updateStats(studentsList, visitsList, allVisits);
      
    } catch (error) {
      console.error('Error in fetchDashboardData:', error);
      ErrorHandler.logError(error, {
        action: 'fetchDashboardData',
        supervisorId: userData?.uid
      }, ERROR_SEVERITY.MEDIUM);
    } finally {
      console.log('Setting loading to false');
      setLoading(false);
    }
  };

  const fetchStudents = async () => {
    if (!userData?.supervisorCode) {
      console.warn('No supervisor code available, skipping student fetch');
      setStudents([]);
      return [];
    }
    try {
      console.log('Fetching students for supervisor code:', userData.supervisorCode);
      
      // First, get students who were assigned during registration
      const directStudentsQuery = query(
        collection(db, 'users'),
        where('role', '==', 'user'),
        where('supervisorCode', '==', userData.supervisorCode)
      );
      
      // Then, get students who joined later using supervisorCodes array
      const joinedStudentsQuery = query(
        collection(db, 'users'),
        where('role', '==', 'user'),
        where('supervisorCodes', 'array-contains', userData.supervisorCode)
      );

      console.log('Executing queries with supervisor code:', userData.supervisorCode);
      
      // Execute both queries
      const [directSnapshot, joinedSnapshot] = await Promise.all([
        getDocs(directStudentsQuery),
        getDocs(joinedStudentsQuery)
      ]);

      console.log('Direct students count:', directSnapshot.size);
      console.log('Joined students count:', joinedSnapshot.size);

      // Combine results, avoiding duplicates
      const studentsMap = new Map();
      
      // Process direct students
      directSnapshot.forEach((doc) => {
        const studentData = doc.data();
        studentsMap.set(doc.id, {
          id: doc.id,
          ...studentData,
          status: studentData.status || 'offline',
          lastSeen: studentData.lastSeen || 'Never',
          lastKnownLocation: studentData.lastKnownLocation || null,
          joinType: 'registered' // Mark as registered during signup
        });
      });

      // Process joined students
      joinedSnapshot.forEach((doc) => {
        const studentData = doc.data();
        // Only add if not already in the map
        if (!studentsMap.has(doc.id)) {
          studentsMap.set(doc.id, {
            id: doc.id,
            ...studentData,
            status: studentData.status || 'offline',
            lastSeen: studentData.lastSeen || 'Never',
            lastKnownLocation: studentData.lastKnownLocation || null,
            joinType: 'joined' // Mark as joined later
          });
        }
      });

      const studentsList = Array.from(studentsMap.values());
      console.log('Total unique students found:', studentsList.length);
      setStudents(studentsList);
      return studentsList;
    } catch (error) {
      console.error('Error fetching students:', error);
      console.error('Error details:', {
        code: error.code,
        message: error.message,
        stack: error.stack,
        supervisorCode: userData?.supervisorCode,
        supervisorId: userData?.uid
      });
      ErrorHandler.logError(error, {
        action: 'fetchStudents',
        supervisorId: userData?.uid,
        supervisorCode: userData?.supervisorCode
      }, ERROR_SEVERITY.MEDIUM);
      setStudents([]);
      return [];
    }
  };

  const fetchTodayVisits = async () => {
    if (!userData?.uid) {
      console.warn('No userData.uid available for fetchTodayVisits');
      return [];
    }
    
    try {
      const visitsQuery = query(
        collection(db, 'visits'),
        where('supervisorId', '==', userData.uid)
      );

      const querySnapshot = await getDocs(visitsQuery);
      const allVisits = [];
      const today = new Date();
      const startOfDay = new Date(today.getFullYear(), today.getMonth(), today.getDate());
      const endOfDay = new Date(today.getFullYear(), today.getMonth(), today.getDate() + 1);

      // Process each visit
      for (const docSnapshot of querySnapshot.docs) {
        const visitData = docSnapshot.data();
        const visitDate = new Date(visitData.dateTime);
        
        // If visit is from a previous day and still active, mark it as completed
        if (visitDate < startOfDay && visitData.status === 'active') {
          try {
            const visitRef = doc(db, 'visits', docSnapshot.id);
            await updateDoc(visitRef, { status: 'completed' });
            console.log(`Marked visit ${docSnapshot.id} as completed`);
          } catch (error) {
            console.error(`Error updating visit ${docSnapshot.id}:`, error);
          }
        }

        allVisits.push({ 
          id: docSnapshot.id, 
          ...visitData,
          status: visitData.status || 'pending'
        });
      }
      
      const todayVisits = allVisits.filter(visit => {
        const visitDate = new Date(visit.dateTime);
        return visitDate >= startOfDay && visitDate < endOfDay;
      });

      setTodayVisits(todayVisits);
      return todayVisits;
    } catch (error) {
      console.error('Error fetching today\'s visits:', error);
      setTodayVisits([]);
      return [];
    }
  };

  const fetchAllVisits = async () => {
    if (!userData?.uid) {
      console.warn('No userData.uid available for fetchAllVisits');
      return [];
    }
    
    try {
      const visitsQuery = query(
        collection(db, 'visits'),
        where('supervisorId', '==', userData.uid)
      );

      const querySnapshot = await getDocs(visitsQuery);
      const allVisits = [];
      const today = new Date();
      const startOfDay = new Date(today.getFullYear(), today.getMonth(), today.getDate());

      // Process each visit
      for (const docSnapshot of querySnapshot.docs) {
        const visitData = docSnapshot.data();
        const visitDate = new Date(visitData.dateTime);
        
        // If visit is from a previous day and still active, mark it as completed
        if (visitDate < startOfDay && visitData.status === 'active') {
          try {
            const visitRef = doc(db, 'visits', docSnapshot.id);
            await updateDoc(visitRef, { status: 'completed' });
            console.log(`Marked visit ${docSnapshot.id} as completed`);
          } catch (error) {
            console.error(`Error updating visit ${docSnapshot.id}:`, error);
          }
        }

        allVisits.push({ 
          id: docSnapshot.id, 
          ...visitData,
          status: visitData.status || 'pending'
        });
      }

      setAllVisits(allVisits);
      return allVisits;
    } catch (error) {
      console.error('Error fetching all visits:', error);
      setAllVisits([]);
      return [];
    }
  };

  const updateStats = (studentsList = [], visitsList = [], allVisitsList = []) => {
    const totalStudents = studentsList.length;
    
    // Find active visit
    const activeVisit = visitsList.find(visit => visit.status === 'active' && !visit.endTime);
    
    // Update student status based on check-in for the active visit
    const updatedStudentsList = studentsList.map(student => {
      // Default status is offline
      let status = 'offline';
      
      if (activeVisit) {
        const attendance = activeVisit.attendance || {};
        const checkedIn = attendance.checkedIn || [];
        const checkedOut = attendance.checkedOut || [];
        
        if (checkedIn.includes(student.id)) {
          if (checkedOut.includes(student.id)) {
            status = 'offline'; // Student has checked out
          } else {
            // Check if student is within geofence
            if (student.lastKnownLocation) {
              const lat1 = student.lastKnownLocation.latitude;
              const lon1 = student.lastKnownLocation.longitude;
              const lat2 = activeVisit.locationCoordinates.latitude;
              const lon2 = activeVisit.locationCoordinates.longitude;
              
              // Haversine formula
              function toRad(x) { return x * Math.PI / 180; }
              const R = 6371000;
              const dLat = toRad(lat2 - lat1);
              const dLon = toRad(lon2 - lon1);
              const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
                Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) *
                Math.sin(dLon/2) * Math.sin(dLon/2);
              const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
              const distance = R * c;
              
              status = distance <= 500 ? 'active' : 'emergency';
            } else {
              status = 'emergency'; // No location data
            }
          }
        }
      }
      
      return { ...student, status };
    });
    
    const activeStudents = updatedStudentsList.filter(s => s.status === 'active').length;
    const emergencyAlerts = updatedStudentsList.filter(s => s.status === 'emergency').length;
    
    // Count active visits from today's visits
    const activeVisits = visitsList.filter(v => v.status === 'active' && !v.endTime).length;
    
    const completedVisits = allVisitsList.filter(v => v.status === 'completed').length;
    
    let checkedInToday = 0;
    visitsList.forEach(visit => {
      const attendance = visit.attendance || {};
      const checkedIn = attendance.checkedIn || [];
      checkedInToday += checkedIn.length;
    });

    setStats({
      totalStudents,
      activeStudents,
      checkedInToday,
      emergencyAlerts,
      activeVisits,
      completedVisits
    });

    // Update students state with new statuses
    setStudents(updatedStudentsList);
  };

  const onRefresh = async () => {
    setRefreshing(true);
    await Promise.all([
      fetchDashboardData(),
      fetchAllVisits()
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
              console.log('Logging out supervisor...');
              await signOut(auth);
              await clearAuthState();
              console.log('Logout successful');
              // Navigation will be handled by AuthContext
            } catch (error) {
              console.error('Logout error:', error);
              ErrorHandler.logError(error, { 
                action: 'supervisorLogout',
                userId: userData?.uid 
              }, ERROR_SEVERITY.MEDIUM);
              
              Alert.alert('Error', 'Failed to logout. Please try again.');
            }
          }
        }
      ]
    );
  };

  const getStatusColor = (status) => {
    switch (status) {
      case 'active':
        return '#10B981';
      case 'offline':
        return '#F59E0B';
      case 'emergency':
        return '#EF4444';
      default:
        return '#6B7280';
    }
  };

  const getStatusBadge = (status) => {
    const styles = {
      active: { backgroundColor: '#DCFCE7', color: '#166534' },
      offline: { backgroundColor: '#FEF3C7', color: '#92400E' },
      emergency: { backgroundColor: '#FEE2E2', color: '#991B1B' },
    };
    return styles[status] || { backgroundColor: '#F3F4F6', color: '#374151' };
  };

  const handleStartNewVisit = () => {
    // Navigate to the existing CreateVisit screen
    try {
      navigation.navigate('CreateVisit');
    } catch (error) {
      Alert.alert(
        'Navigation Error', 
        'Could not navigate to Create Visit screen. Please try again.',
        [
          { text: 'OK', style: 'default' },
          { 
            text: 'Create Demo Visit', 
            onPress: () => {
              setIsVisitActive(true);
              setVisitDuration('0h 1m');
              Alert.alert('Success', 'Demo visit started!');
            }
          }
        ]
      );
    }
  };

  const handleEndVisit = async () => {
    if (!selectedVisit) return;

    Alert.alert(
      'End Visit',
      'Are you sure you want to end the current visit? This will check out all students.',
      [
        { text: 'Cancel', style: 'cancel' },
        { 
          text: 'End Visit', 
          style: 'destructive',
          onPress: async () => {
            try {
              const visitRef = doc(db, 'visits', selectedVisit.id);
              const now = new Date().toISOString();
              
              // Get all checked-in students
              const checkedInStudents = selectedVisit.attendance?.checkedIn || [];
              
              // Update visit status and check out all students
              await updateDoc(visitRef, {
                status: 'completed',
                endTime: now,
                'attendance.checkedOut': arrayUnion(...checkedInStudents),
                'attendance.checkedIn': [],
                [`attendance.endTime`]: now
              });

              // Update local state
              setIsVisitActive(false);
              setVisitDuration('0h 0m');
              setSelectedVisitId(null);
              
              // Refresh data
              await fetchDashboardData();
              await fetchAllVisits();
              
              Alert.alert('Success', 'Visit ended successfully! All students have been checked out.');
            } catch (error) {
              console.error('Error ending visit:', error);
              ErrorHandler.logError(error, {
                action: 'endVisit',
                visitId: selectedVisit.id,
                supervisorId: userData?.uid
              }, ERROR_SEVERITY.HIGH);
              
              Alert.alert('Error', 'Failed to end visit. Please try again.');
            }
          }
        }
      ]
    );
  };

  const handleStudentPress = (student) => {
    try {
      navigation.navigate('StudentDetails', { 
        studentId: student.id,
        studentData: student 
      });
    } catch (error) {
      Alert.alert(
        'Student Details',
        `Name: ${student.fullName}\nEmail: ${student.email}\nStatus: ${student.status}\nLast Seen: ${student.lastSeen}\n\nStudent details screen is being developed.`,
        [{ text: 'OK', style: 'default' }]
      );
    }
  };

  const handleVisitPress = (visit) => {
    try {
      navigation.navigate('VisitDetail', { 
        visitId: visit.id,
        visit: visit 
      });
    } catch (error) {
      Alert.alert(
        'Visit Details',
        `Location: ${visit.location || 'Not specified'}\nDate: ${new Date(visit.dateTime || visit.createdAt).toLocaleDateString()}\nStatus: ${visit.status}`,
        [{ text: 'OK', style: 'default' }]
      );
    }
  };

  const handleViewAllVisits = () => {
    try {
      navigation.navigate('VisitList');
    } catch (error) {
      Alert.alert('Navigation Error', 'Could not navigate to Visit List screen.');
    }
  };

  const getCheckedInStudents = (selectedVisit, students) => {
    if (!selectedVisit) return [];
    const attendance = selectedVisit.attendance || {};
    const checkedInArray = attendance.checkedIn || [];
    const checkedOutArray = attendance.checkedOut || [];
    
    return students.filter(student => {
      if (!student.lastKnownLocation) return false;
      if (!checkedInArray.includes(student.id)) return false;
      if (checkedOutArray.includes(student.id)) return false;
      const lat1 = student.lastKnownLocation.latitude;
      const lon1 = student.lastKnownLocation.longitude;
      const lat2 = selectedVisit.locationCoordinates.latitude;
      const lon2 = selectedVisit.locationCoordinates.longitude;
      // Haversine formula
      function toRad(x) { return x * Math.PI / 180; }
      const R = 6371000;
      const dLat = toRad(lat2 - lat1);
      const dLon = toRad(lon2 - lon1);
      const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
        Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) *
        Math.sin(dLon/2) * Math.sin(dLon/2);
      const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
      const distance = R * c;
      return distance <= 500;
    });
  };

  const renderHeader = () => (
    <View style={styles.header}>
      <View style={styles.headerContent}>
        <View style={styles.headerLeft}>
          <View style={styles.logoCircle}>
            <Icon name="location-on" size={20} color="#FFFFFF" />
          </View>
          <View>
            <Text style={styles.headerTitle}>Supervisor Dashboard</Text>
            <Text style={styles.headerSubtitle}>Industrial Visit - Tech Tour</Text>
          </View>
        </View>
        <View style={styles.headerRight}>
          {userData?.supervisorCode && (
            <View style={styles.codeBadge}>
              <Text style={styles.codeLabel}>Code:</Text>
              <Text style={styles.codeValue}>{userData.supervisorCode}</Text>
            </View>
          )}
          <TouchableOpacity 
            style={styles.logoutButton}
            onPress={handleLogout}
          >
            <Icon name="logout" size={18} color="#6B7280" />
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );

  const renderStatusBar = () => {
    if (!isVisitActive) return null;
    
    return (
      <View style={styles.statusBar}>
        <View style={styles.statusLeft}>
          <View style={styles.liveDot} />
          <Text style={styles.statusText}>Visit Active</Text>
        </View>
        <View style={styles.statusRight}>
          <Icon name="signal-cellular-4-bar" size={16} color="#10B981" />
          <Text style={styles.signalText}>GPS Strong</Text>
        </View>
      </View>
    );
  };

  const renderStats = () => (
    <View style={styles.statsContainer}>
      <View style={styles.statsRow}>
        <View style={[styles.statCard, styles.primaryCard]}>
          <View style={styles.statIconContainer}>
            <Icon name="people" size={24} color="#2563EB" />
          </View>
          <View style={styles.statContent}>
            <Text style={styles.statNumber}>{stats.totalStudents}</Text>
            <Text style={styles.statLabel}>Total Students</Text>
          </View>
        </View>
        
        <View style={[styles.statCard, styles.successCard]}>
          <View style={styles.statIconContainer}>
            <Icon name="check-circle" size={24} color="#10B981" />
          </View>
          <View style={styles.statContent}>
            <Text style={styles.statNumber}>{stats.activeStudents}</Text>
            <Text style={styles.statLabel}>Active Now</Text>
          </View>
        </View>
      </View>
      
      <View style={styles.statsRow}>
        <View style={[styles.statCard, styles.infoCard]}>
          <View style={styles.statIconContainer}>
            <Icon name="event" size={24} color="#3B82F6" />
          </View>
          <View style={styles.statContent}>
            <Text style={styles.statNumber}>{stats.activeVisits}</Text>
            <Text style={styles.statLabel}>Active Visits</Text>
          </View>
        </View>
        
        <View style={[styles.statCard, styles.warningCard]}>
          <View style={styles.statIconContainer}>
            <Icon name="warning" size={24} color="#F59E0B" />
          </View>
          <View style={styles.statContent}>
            <Text style={styles.statNumber}>{stats.emergencyAlerts}</Text>
            <Text style={styles.statLabel}>Alerts</Text>
          </View>
        </View>
      </View>
    </View>
  );

  const renderQuickActions = () => {
    // Check if there's an active visit in today's visits
    const hasActiveVisit = todayVisits.some(v => v.status === 'active' && !v.endTime);
    
    return (
      <View style={styles.quickActions}>
        <TouchableOpacity 
          style={[styles.actionButton, styles.primaryButton, hasActiveVisit && styles.disabledButton]}
          onPress={handleStartNewVisit}
          disabled={hasActiveVisit}
        >
          <Icon name="add" size={20} color="#FFFFFF" />
          <Text style={styles.primaryButtonText}>Start New Visit</Text>
        </TouchableOpacity>
        
        {hasActiveVisit && (
          <TouchableOpacity 
            style={[styles.actionButton, styles.dangerButton]}
            onPress={handleEndVisit}
          >
            <Icon name="stop" size={20} color="#FFFFFF" />
            <Text style={styles.dangerButtonText}>End Visit</Text>
          </TouchableOpacity>
        )}
        
        <TouchableOpacity 
          style={[styles.actionButton, styles.secondaryButton]}
          onPress={() => navigation.navigate('BleDebug')}
        >
          <Icon name="bluetooth" size={20} color="#3B82F6" />
          <Text style={styles.secondaryButtonText}>BLE Debug</Text>
        </TouchableOpacity>
      </View>
    );
  };

  const renderZoomButton = () => (
    <TouchableOpacity
      style={styles.zoomButton}
      onPress={() => setZoomModalVisible(true)}
    >
      <Icon name="zoom-in" size={24} color="#2563EB" />
    </TouchableOpacity>
  );

  const renderZoomModal = () => {
    if (!selectedVisit) return null;
    const checkedInStudents = getCheckedInStudents(selectedVisit, students);
    
    return (
      <Modal
        visible={isZoomModalVisible}
        transparent={true}
        animationType="slide"
        onRequestClose={() => setZoomModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Map View</Text>
              <TouchableOpacity
                style={styles.closeButton}
                onPress={() => setZoomModalVisible(false)}
              >
                <Icon name="close" size={24} color="#6B7280" />
              </TouchableOpacity>
            </View>
            <View style={styles.modalMapContainer}>
              <MapView
                style={{ flex: 1 }}
                initialRegion={{
                  latitude: selectedVisit.locationCoordinates.latitude,
                  longitude: selectedVisit.locationCoordinates.longitude,
                  latitudeDelta: 0.01,
                  longitudeDelta: 0.01,
                }}
              >
                <Marker
                  coordinate={selectedVisit.locationCoordinates}
                  pinColor="#e11d48"
                  title={selectedVisit.location}
                  description="Visit Location"
                />
                <Circle
                  center={selectedVisit.locationCoordinates}
                  radius={500}
                  strokeColor="#2563EB"
                  fillColor="rgba(37,99,235,0.1)"
                />
                {checkedInStudents.map((student, idx) => (
                  <Marker
                    key={student.id || idx}
                    coordinate={student.lastKnownLocation}
                    title={student.fullName}
                    description={`Status: ${student.status || 'offline'}\nLast Seen: ${student.lastSeen || 'Unknown'}`}
                  >
                    <View style={{ 
                      width: 18, 
                      height: 18, 
                      borderRadius: 9, 
                      backgroundColor: '#10B981', 
                      borderWidth: 2, 
                      borderColor: '#fff', 
                      justifyContent: 'center', 
                      alignItems: 'center',
                      ...Platform.select({
                        web: {
                          boxShadow: '0 2px 4px rgba(0, 0, 0, 0.3)',
                        },
                        default: {
                          shadowColor: '#000',
                          shadowOffset: { width: 0, height: 2 },
                          shadowOpacity: 0.3,
                          shadowRadius: 4,
                          elevation: 5,
                        },
                      }),
                    }}>
                      <Text style={{ 
                        color: '#fff', 
                        fontSize: 10, 
                        fontWeight: 'bold' 
                      }}>
                        {student.fullName ? student.fullName[0] : 'S'}
                      </Text>
                    </View>
                  </Marker>
                ))}
              </MapView>
            </View>
          </View>
        </View>
      </Modal>
    );
  };

  const renderMapView = () => {
    // Check if there's no selected visit or if the selected visit is not active
    if (!selectedVisit || !selectedVisit.locationCoordinates) {
      return (
        <View style={styles.mapCard}>
          <View style={styles.mapHeader}>
            <View style={styles.mapHeaderLeft}>
              <Icon name="map" size={20} color="#1F2937" />
              <Text style={styles.mapTitle}>Live Location Map</Text>
            </View>
            <View style={styles.visitSelector}>
              <Picker
                selectedValue={selectedVisitId}
                onValueChange={setSelectedVisitId}
                style={styles.visitPicker}
              >
                {visitsWithLocation.map((visit) => (
                  <Picker.Item
                    key={visit.id}
                    label={`${visit.location} (${new Date(visit.dateTime || visit.createdAt?.seconds * 1000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })})`}
                    value={visit.id}
                  />
                ))}
              </Picker>
            </View>
          </View>
          <View style={[styles.mapContainer, styles.inactiveMapContainer]}>
            <View style={styles.inactiveState}>
              <Icon name="gps-off" size={48} color="#94A3B8" />
              <Text style={styles.inactiveTitle}>GPS Tracking Inactive</Text>
              <Text style={styles.inactiveSubtext}>
                Start or resume a visit to view live GPS tracking of students
              </Text>
              <View style={styles.inactiveButtons}>
                <TouchableOpacity 
                  style={[styles.inactiveButton, styles.primaryButton]}
                  onPress={handleStartNewVisit}
                >
                  <Icon name="add" size={20} color="#FFFFFF" />
                  <Text style={styles.primaryButtonText}>Start New Visit</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </View>
      );
    }

    const checkedInStudents = getCheckedInStudents(selectedVisit, students);

    return (
      <View style={styles.mapCard}>
        <View style={styles.mapHeader}>
          <View style={styles.mapHeaderLeft}>
            <Icon name="map" size={20} color="#1F2937" />
            <Text style={styles.mapTitle}>Live Location Map</Text>
          </View>
          <View style={styles.visitSelector}>
            <Picker
              selectedValue={selectedVisitId}
              onValueChange={setSelectedVisitId}
              style={styles.visitPicker}
            >
              {visitsWithLocation.map((visit) => (
                <Picker.Item
                  key={visit.id}
                  label={`${visit.location} (${new Date(visit.dateTime || visit.createdAt?.seconds * 1000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })})`}
                  value={visit.id}
                />
              ))}
            </Picker>
          </View>
        </View>
        <View style={styles.mapContainer}>
          <MapView
            ref={mapRef}
            style={{ flex: 1 }}
            initialRegion={{
              latitude: selectedVisit.locationCoordinates.latitude,
              longitude: selectedVisit.locationCoordinates.longitude,
              latitudeDelta: 0.01,
              longitudeDelta: 0.01,
            }}
          >
            <Marker
              coordinate={selectedVisit.locationCoordinates}
              pinColor="#e11d48"
              title={selectedVisit.location}
              description="Visit Location"
            />
            <Circle
              center={selectedVisit.locationCoordinates}
              radius={500}
              strokeColor="#2563EB"
              fillColor="rgba(37,99,235,0.1)"
            />
            {checkedInStudents.map((student, idx) => (
              <Marker
                key={student.id || idx}
                coordinate={student.lastKnownLocation}
                title={student.fullName}
                description="Checked-in Student"
              >
                <View style={{ width: 18, height: 18, borderRadius: 9, backgroundColor: '#10B981', borderWidth: 2, borderColor: '#fff', justifyContent: 'center', alignItems: 'center' }}>
                  <Text style={{ color: '#fff', fontSize: 10, fontWeight: 'bold' }}>{student.fullName ? student.fullName[0] : 'S'}</Text>
                </View>
              </Marker>
            ))}
          </MapView>
          {renderZoomButton()}
        </View>
        {renderZoomModal()}
      </View>
    );
  };

  const renderStudentItem = ({ item, index }) => {
    // Get the active visit
    const activeVisit = todayVisits.find(visit => visit.status === 'active');
    
    // Determine student status for the active visit
    let status = 'offline';
    if (activeVisit) {
      const attendance = activeVisit.attendance || {};
      const checkedIn = attendance.checkedIn || [];
      const checkedOut = attendance.checkedOut || [];
      
      if (checkedIn.includes(item.id)) {
        if (checkedOut.includes(item.id)) {
          status = 'offline';
        } else if (item.lastKnownLocation) {
          const lat1 = item.lastKnownLocation.latitude;
          const lon1 = item.lastKnownLocation.longitude;
          const lat2 = activeVisit.locationCoordinates.latitude;
          const lon2 = activeVisit.locationCoordinates.longitude;
          
          // Haversine formula
          function toRad(x) { return x * Math.PI / 180; }
          const R = 6371000;
          const dLat = toRad(lat2 - lat1);
          const dLon = toRad(lon2 - lon1);
          const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
            Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) *
            Math.sin(dLon/2) * Math.sin(dLon/2);
          const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
          const distance = R * c;
          
          status = distance <= 500 ? 'active' : 'emergency';
        } else {
          status = 'emergency';
        }
      }
    }

    return (
      <TouchableOpacity 
        style={styles.studentItem}
        onPress={() => handleStudentPress(item)}
      >
        <View style={styles.studentLeft}>
          <View style={[styles.statusDot, { backgroundColor: getStatusColor(status) }]} />
          <View style={styles.studentInfo}>
            <Text style={styles.studentName}>{item.fullName}</Text>
            <View style={styles.studentDetails}>
              <View style={styles.lastSeenContainer}>
                <Icon name="schedule" size={12} color="#6B7280" />
                <Text style={styles.lastSeenText}>{item.lastSeen}</Text>
              </View>
              <View style={[
                styles.joinTypeBadge,
                { backgroundColor: item.joinType === 'registered' ? '#EFF6FF' : '#F0FDF4' }
              ]}>
                <Text style={[
                  styles.joinTypeText,
                  { color: item.joinType === 'registered' ? '#1E40AF' : '#166534' }
                ]}>
                  {item.joinType === 'registered' ? 'Registered' : 'Joined'}
                </Text>
              </View>
            </View>
          </View>
        </View>
        <View style={[styles.statusBadge, getStatusBadge(status)]}>
          <Text style={[styles.statusBadgeText, { color: getStatusBadge(status).color }]}>
            {status.charAt(0).toUpperCase() + status.slice(1)}
          </Text>
        </View>
      </TouchableOpacity>
    );
  };

  const renderStudentsList = () => (
    <View style={styles.studentsCard}>
      <View style={styles.studentsHeader}>
        <View style={styles.studentsTitle}>
          <Icon name="people" size={20} color="#1F2937" />
          <Text style={styles.cardTitle}>Students ({students.length})</Text>
        </View>
        {stats.emergencyAlerts > 0 && (
          <Icon name="warning" size={20} color="#EF4444" />
        )}
      </View>
      
      <View style={styles.studentsContent}>
        {!userData?.supervisorCode ? (
          <View style={styles.noCodeState}>
            <Icon name="qr-code" size={48} color="#94A3B8" />
            <Text style={styles.noCodeText}>No Supervisor Code</Text>
            <Text style={styles.noCodeSubtext}>
              A supervisor code is required to manage students. Please contact your administrator to assign one.
            </Text>
            <TouchableOpacity 
              style={styles.refreshButton}
              onPress={onRefresh}
            >
              <Icon name="refresh" size={16} color="#2563EB" />
              <Text style={styles.refreshButtonText}>Refresh</Text>
            </TouchableOpacity>
          </View>
        ) : students.length > 0 ? (
          <FlatList
            data={students}
            keyExtractor={(item) => item.id}
            renderItem={renderStudentItem}
            scrollEnabled={false}
            showsVerticalScrollIndicator={false}
          />
        ) : (
          <View style={styles.emptyState}>
            <Icon name="people-outline" size={48} color="#94A3B8" />
            <Text style={styles.emptyStateText}>No students joined yet</Text>
            <Text style={styles.emptyStateSubtext}>
              Share your supervisor code with students: {userData?.supervisorCode}
            </Text>
            <TouchableOpacity 
              style={styles.refreshButton}
              onPress={onRefresh}
            >
              <Icon name="refresh" size={16} color="#2563EB" />
              <Text style={styles.refreshButtonText}>Refresh</Text>
            </TouchableOpacity>
          </View>
        )}
      </View>
    </View>
  );

  const renderIndoorTrackingMap = () => {
    // SVG size from groundfloor.svg
    const svgWidth = 784;
    const svgHeight = 316;
    
    // Debug: Count students with beacon data
    const studentsWithBeacons = students.filter(s => s.nearestBeacon);
    const totalStudents = students.length;
    
    return (
      <View style={{ backgroundColor: '#fff', borderRadius: 12, padding: 16, marginBottom: 16 }}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
          <Text style={{ fontWeight: 'bold', fontSize: 16 }}>Indoor Tracking</Text>
          <Text style={{ fontSize: 12, color: '#6B7280' }}>
            {studentsWithBeacons.length}/{totalStudents} students tracked
          </Text>
        </View>
        
        <ScrollView horizontal contentContainerStyle={{ alignItems: 'center' }}>
          <Svg width={svgWidth} height={svgHeight} viewBox={`0 0 ${svgWidth} ${svgHeight}`}> 
            {/* --- Render the full SVG map --- */}
            <G id="groundfloor">
              <G id="room08">
                <Path d="M324 244.5H221V310H303V286.5H324V244.5Z" stroke="black" fill="#fff" />
              </G>
              <G id="room14">
                <Path d="M324 223V244.5V272.5H345V281.5H473.5V273H458.5V275.5H417V223H389H324Z" stroke="black" fill="#fff" />
              </G>
              <G id="room20">
                <Path d="M324 272.5V286.5H303V310H388V281.5H345V272.5H324Z" stroke="black" fill="#fff" />
              </G>
              <G id="room21">
                <Path d="M488.5 281.5H388V310H488.5V281.5Z" stroke="black" fill="#fff" />
              </G>
              <G id="room22">
                <Path d="M531 281.5H488.5V310H573.5V286H552V273H531V281.5Z" stroke="black" fill="#fff" />
              </G>
              <G id="room29">
                <Path d="M544 273V223H580.5V273H544Z" stroke="black" fill="#fff" />
              </G>
              <G id="room15">
                <Path d="M458.5 223H487.5H544V273H531V281.5H473.5V273H458.5V223Z" stroke="black" fill="#fff" />
              </G>
              <G id="room18">
                <Path d="M638.5 259.5H580.5V273H552V273.5V286H573.5V310H638.5V259.5Z" stroke="black" fill="#fff" />
              </G>
              <G id="room19">
                <Path d="M778 310H638.5V259.5H778V310Z" stroke="black" fill="#fff" />
              </G>
              <G id="room28">
                <Path d="M778 259.5H680.5L680 4H778V259.5Z" stroke="black" fill="#fff" />
              </G>
              <G id="room26">
                <Path d="M580.5 127.5H525.5V157H580.5V127.5Z" stroke="black" fill="#fff" />
              </G>
              <G id="room13">
                <Path d="M497 157H486.5M486.5 157V210H555.5V157H486.5Z" stroke="black" fill="#fff" />
              </G>
              <G id="room27">
                <Path d="M555.5 157H580.5V210H555.5V157Z" stroke="black" fill="#fff" />
              </G>
              <G id="room25">
                <Path d="M525.5 127.5H497V157H525.5V127.5Z" stroke="black" fill="#fff" />
              </G>
              <G id="room10">
                <Path d="M280.5 226.5H239.5V244.5H280.5V226.5Z" stroke="black" fill="#fff" />
              </G>
              <G id="room16">
                <Path d="M599.5 259.5V127.5H640V259.5H599.5Z" stroke="black" fill="#fff" />
              </G>
              <G id="room17">
                <Path d="M680.5 127.5H640V259.5H680.5V127.5Z" stroke="black" fill="#fff" />
              </G>
              <G id="room11">
                <Path d="M305.5 127.5H280.5V244.5H305.5V127.5Z" stroke="black" fill="#fff" />
              </G>
              <G id="room23">
                <Path d="M351.5 157H319.5V127.5H351.5V157Z" stroke="black" fill="#fff" />
              </G>
              <G id="room24">
                <Path d="M381 127.5V157H351.5V127.5H381Z" stroke="black" fill="#fff" />
              </G>
              <G id="room12">
                <Path d="M319.5 209.5V157H389V209.5H319.5Z" stroke="black" fill="#fff" />
              </G>
              <G id="room07">
                <Path d="M9.99998 262.781L43.1227 202.502L43.6246 202H221V310H29.0706C5.47376 294.241 2.92652 283.632 9.99998 262.781Z" stroke="black" fill="#fff" />
              </G>
              <G id="room09">
                <Rect x="239.5" y="127.5" width="41" height="99" stroke="black" fill="#fff" />
              </G>
              <G id="room06">
                <Path d="M221 126.5H157V180.5H221V126.5Z" stroke="black" fill="#fff" />
              </G>
              <G id="room05">
                <Path d="M55.5 181L86.5 126.5H157V180.5L55.5 181Z" stroke="black" fill="#fff" />
              </G>
              <G id="room04">
                <Path d="M680 4.5H491V103.5H472V113.5L680 113V4.5Z" stroke="black" fill="#fff" />
              </G>
              <G id="room03">
                <Path d="M491 4.5H386V103.5H404.5V156.5H417V214.5H389V223H417V275.5H458.5V223H487.5V214.5H458.5V156.5H472V103.5H491V4.5Z" stroke="black" fill="#fff" />
              </G>
              <G id="room02">
                <Path d="M386 4.5H221V6V113.5H386V4.5Z" stroke="black" fill="#fff" />
              </G>
              <G id="room01">
                <Path d="M156 4.5L94 113.5H221V112.5V4.5H156Z" stroke="black" fill="#fff" />
              </G>
            </G>
            
            {/* --- Overlay student markers using real-time beacon data --- */}
            {Object.entries(studentsByRoom).map(([roomId, roomStudents]) => {
              if (roomStudents.length === 0) return null;
              
              // Get the first student's svgPosition (all students in same room have same position)
              const firstStudent = roomStudents[0];
              const svgPosition = firstStudent.svgPosition;
              
              if (!svgPosition) {
                console.log(`No SVG position for room ${roomId}`);
                return null;
              }
              
              const { x, y } = svgPosition;
              
              // Cluster if >5 students
              if (roomStudents.length > 5) {
                return (
                  <G key={roomId}>
                    <Rect x={x-12} y={y-12} width={24} height={24} rx={12} fill="#2563EB" />
                    <Text
                      x={x}
                      y={y+5}
                      fontSize="13"
                      fontWeight="bold"
                      fill="#fff"
                      textAnchor="middle"
                    >
                      {roomStudents.length}
                    </Text>
                  </G>
                );
              }
              
              // Individual markers - spread them around the beacon position
              return roomStudents.map((student, idx) => {
                const offsetX = (idx % 3) * 16 - 16; // Spread horizontally
                const offsetY = Math.floor(idx / 3) * 16 - 8; // Stack vertically
                
                return (
                  <G key={`${student.id}-${roomId}`}>
                    <Rect 
                      x={x-8+offsetX} 
                      y={y-8+offsetY} 
                      width={16} 
                      height={16} 
                      rx={8} 
                      fill="#10B981" 
                    />
                    <Text
                      x={x+offsetX}
                      y={y+4+offsetY}
                      fontSize="10"
                      fontWeight="bold"
                      fill="#fff"
                      textAnchor="middle"
                    >
                      {student.fullName ? student.fullName[0] : 'S'}
                    </Text>
                  </G>
                );
              });
            })}
          </Svg>
        </ScrollView>
        
        <View style={{ marginTop: 8, gap: 4 }}>
          <Text style={{ color: '#6B7280', fontSize: 12 }}>
            Real-time student positions based on nearest beacon signal strength
          </Text>
          <Text style={{ color: '#6B7280', fontSize: 11 }}>
            Green circles = individual students, Blue circles = clusters (5+ students)
          </Text>
          
          {/* Debug information */}
          {studentsWithBeacons.length > 0 && (
            <View style={{ marginTop: 8, padding: 8, backgroundColor: '#F3F4F6', borderRadius: 6 }}>
              <Text style={{ fontSize: 11, color: '#374151', fontWeight: '500', marginBottom: 4 }}>
                Students with beacon data:
              </Text>
              {studentsWithBeacons.slice(0, 3).map(student => (
                <Text key={student.id} style={{ fontSize: 10, color: '#6B7280' }}>
                  • {student.fullName}: {student.nearestBeacon.roomName} (RSSI: {student.nearestBeacon.rssi})
                </Text>
              ))}
              {studentsWithBeacons.length > 3 && (
                <Text style={{ fontSize: 10, color: '#6B7280' }}>
                  ... and {studentsWithBeacons.length - 3} more
                </Text>
              )}
            </View>
          )}
        </View>
      </View>
    );
  };

  const renderTabContent = () => {
    switch (selectedTab) {
      case 'overview':
        return (
          <>
            {renderMapView()}
          </>
        );
      case 'students':
        return renderStudentsList();
      case 'visits':
        return (
          <View style={styles.visitsCard}>
            <View style={styles.visitsHeader}>
              <View style={styles.visitsTitle}>
                <Icon name="event" size={20} color="#1F2937" />
                <Text style={styles.cardTitle}>Recent Visits</Text>
              </View>
              <View style={styles.headerButtons}>
                <TouchableOpacity 
                  style={styles.viewAllButton}
                  onPress={handleViewAllVisits}
                >
                  <Text style={styles.viewAllButtonText}>View All</Text>
                </TouchableOpacity>
                <TouchableOpacity 
                  style={styles.newVisitButton}
                  onPress={handleStartNewVisit}
                >
                  <Icon name="add" size={16} color="#FFFFFF" />
                  <Text style={styles.newVisitButtonText}>New Visit</Text>
                </TouchableOpacity>
              </View>
            </View>
            
            <View style={styles.visitsContent}>
              {allVisits.length > 0 ? (
                <FlatList
                  data={allVisits
                    .sort((a, b) => {
                      // Sort by dateTime or createdAt, whichever is available
                      const dateA = new Date(a.dateTime || a.createdAt?.seconds * 1000 || a.createdAt);
                      const dateB = new Date(b.dateTime || b.createdAt?.seconds * 1000 || b.createdAt);
                      return dateB - dateA; // Sort in descending order (newest first)
                    })
                    .slice(0, 5)} // Show only first 5 visits
                  keyExtractor={(item) => item.id}
                  renderItem={({ item }) => (
                    <TouchableOpacity 
                      style={styles.visitItem}
                      onPress={() => handleVisitPress(item)}
                    >
                      <View style={styles.visitLeft}>
                        <Text style={styles.visitLocation}>{item.location || 'Industrial Visit'}</Text>
                        <View style={styles.visitDetails}>
                          <Text style={styles.visitDate}>
                            {new Date(item.dateTime || item.createdAt).toLocaleDateString()}
                          </Text>
                          {item.visitCode && (
                            <View style={styles.visitCodeContainer}>
                              <Text style={styles.visitCodeLabel}>Code: </Text>
                              <Text style={styles.visitCode}>{item.visitCode}</Text>
                            </View>
                          )}
                        </View>
                      </View>
                      <View style={[
                        styles.visitStatusBadge,
                        { backgroundColor: (item.status || 'pending') === 'active' ? '#DCFCE7' : 
                                          (item.status || 'pending') === 'completed' ? '#EFF6FF' : '#FEF3C7' }
                      ]}>
                        <Text style={[
                          styles.visitStatusText,
                          { color: (item.status || 'pending') === 'active' ? '#166534' : 
                                  (item.status || 'pending') === 'completed' ? '#1E40AF' : '#92400E' }
                        ]}>
                          {(item.status || 'pending').charAt(0).toUpperCase() + (item.status || 'pending').slice(1)}
                        </Text>
                      </View>
                    </TouchableOpacity>
                  )}
                  scrollEnabled={false}
                  showsVerticalScrollIndicator={false}
                />
              ) : (
                <View style={styles.emptyState}>
                  <Icon name="event-note" size={48} color="#94A3B8" />
                  <Text style={styles.emptyStateText}>No visits recorded yet</Text>
                  <TouchableOpacity 
                    style={styles.emptyStateButton}
                    onPress={handleStartNewVisit}
                  >
                    <Text style={styles.emptyStateButtonText}>Create First Visit</Text>
                  </TouchableOpacity>
                </View>
              )}
              
              {allVisits.length > 5 && (
                <TouchableOpacity 
                  style={styles.showMoreButton}
                  onPress={handleViewAllVisits}
                >
                  <Text style={styles.showMoreText}>View {allVisits.length - 5} more visits...</Text>
                </TouchableOpacity>
              )}
            </View>
          </View>
        );
      case 'indoor':
        return renderIndoorTrackingMap();
      default:
        return null;
    }
  };

  const renderLiveTrackingCard = () => (
    <View style={styles.card}>
      <View style={styles.cardHeader}>
        <View style={styles.cardTitleContainer}>
          <MaterialIcons name="location-on" size={24} color="#2563eb" />
          <Text style={styles.cardTitle}>Live Tracking</Text>
        </View>
        <TouchableOpacity 
          style={styles.refreshButton}
          onPress={fetchDashboardData}
        >
          <MaterialIcons name="refresh" size={24} color="#2563eb" />
        </TouchableOpacity>
      </View>
      <View style={styles.mapContainer}>
        <LiveLocationMap 
          onVisitStatusChange={(isTracking) => {
            setIsVisitActive(isTracking);
            if (!isTracking) {
              fetchDashboardData();
            }
          }}
        />
      </View>
    </View>
  );

  // --- Fetch beacons and svg positions ---
  useEffect(() => {
    const fetchBeacons = async () => {
      try {
        const beaconDocs = await getDocs(collection(db, 'beacons'));
        const beaconList = [];
        beaconDocs.forEach(doc => {
          const data = doc.data();
          beaconList.push({
            id: doc.id,
            ...data
          });
        });
        setBeacons(beaconList);
      } catch (error) {
        ErrorHandler.logError(error, { action: 'fetchBeacons' }, ERROR_SEVERITY.LOW);
      }
    };
    fetchBeacons();
  }, []);

  // --- Group students by room ---
  useEffect(() => {
    const group = {};
    students.forEach(student => {
      // Use nearestBeacon data for real-time positioning
      if (student.nearestBeacon && student.nearestBeacon.roomId) {
        const roomId = student.nearestBeacon.roomId;
        if (!group[roomId]) group[roomId] = [];
        group[roomId].push({
          ...student,
          svgPosition: student.nearestBeacon.svgPosition,
          beaconRssi: student.nearestBeacon.rssi,
          lastBeaconUpdate: student.nearestBeacon.lastSeen
        });
      }
    });
    setStudentsByRoom(group);
  }, [students]);

  if (loading) {
    return (
      <View style={[styles.container, styles.centered]}>
        <ActivityIndicator size="large" color="#2563EB" />
        <Text style={styles.loadingText}>Loading dashboard...</Text>
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar 
        barStyle="dark-content" 
        backgroundColor="transparent" 
        translucent={true}
      />
      {renderHeader()}
      {renderStatusBar()}
      
      <ScrollView 
        style={styles.scrollContainer}
        contentContainerStyle={styles.scrollContent}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            colors={['#2563EB']}
          />
        }
      >
        {renderStats()}
        {renderQuickActions()}
        
        {/* Tab Navigation */}
        <View style={styles.tabContainer}>
          <TouchableOpacity 
            style={[styles.tab, selectedTab === 'overview' && styles.activeTab]}
            onPress={() => setSelectedTab('overview')}
          >
            <Icon 
              name="dashboard" 
              size={18} 
              color={selectedTab === 'overview' ? '#2563EB' : '#6B7280'} 
            />
            <Text style={[styles.tabText, selectedTab === 'overview' && styles.activeTabText]}>
              Overview
            </Text>
          </TouchableOpacity>
          
          <TouchableOpacity 
            style={[styles.tab, selectedTab === 'students' && styles.activeTab]}
            onPress={() => setSelectedTab('students')}
          >
            <Icon 
              name="people" 
              size={18} 
              color={selectedTab === 'students' ? '#2563EB' : '#6B7280'} 
            />
            <Text style={[styles.tabText, selectedTab === 'students' && styles.activeTabText]}>
              Students
            </Text>
          </TouchableOpacity>
          
          <TouchableOpacity 
            style={[styles.tab, selectedTab === 'visits' && styles.activeTab]}
            onPress={() => setSelectedTab('visits')}
          >
            <Icon 
              name="event" 
              size={18} 
              color={selectedTab === 'visits' ? '#2563EB' : '#6B7280'} 
            />
            <Text style={[styles.tabText, selectedTab === 'visits' && styles.activeTabText]}>
              Visits
            </Text>
          </TouchableOpacity>
          
          <TouchableOpacity 
            style={[styles.tab, selectedTab === 'indoor' && styles.activeTab]}
            onPress={() => setSelectedTab('indoor')}
          >
            <Icon 
              name="map" 
              size={18} 
              color={selectedTab === 'indoor' ? '#2563EB' : '#6B7280'} 
            />
            <Text style={[styles.tabText, selectedTab === 'indoor' && styles.activeTabText]}>
              Indoor Tracking
            </Text>
          </TouchableOpacity>
        </View>
        
        {renderTabContent()}
      </ScrollView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F9FAFB',
  },
  header: {
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
    paddingTop: Platform.OS === 'android' ? (StatusBar.currentHeight || 0) : 44,
    ...Platform.select({
      web: {
        boxShadow: '0 1px 2px 0 rgba(0, 0, 0, 0.05)',
      },
      default: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.05,
        shadowRadius: 2,
        elevation: 2,
      },
    }),
  },
  headerContent: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  logoCircle: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#2563EB',
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#111827',
  },
  headerSubtitle: {
    fontSize: 12,
    color: '#6B7280',
    marginTop: 2,
  },
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  logoutButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#F9FAFB',
    justifyContent: 'center',
    alignItems: 'center',
  },
  statusBar: {
    backgroundColor: '#F0FDF4',
    borderBottomWidth: 1,
    borderBottomColor: '#BBF7D0',
    paddingHorizontal: 16,
    paddingVertical: 8,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  statusLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  liveDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#10B981',
  },
  statusText: {
    fontSize: 14,
    fontWeight: '500',
    color: '#166534',
  },
  statusDuration: {
    fontSize: 14,
    color: '#10B981',
  },
  statusRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  signalText: {
    fontSize: 12,
    color: '#10B981',
  },
  scrollContainer: {
    flex: 1,
  },
  scrollContent: {
    padding: 16,
    gap: 20,
  },
  quickActions: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 4,
  },
  actionButton: {
    flex: 1,
    height: 56,
    borderRadius: 8,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    ...Platform.select({
      web: {
        boxShadow: '0 1px 2px 0 rgba(0, 0, 0, 0.05)',
      },
      default: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.05,
        shadowRadius: 2,
        elevation: 1,
      },
    }),
  },
  primaryButton: {
    backgroundColor: '#2563EB',
  },
  primaryButtonText: {
    fontSize: 14,
    fontWeight: '500',
    color: '#FFFFFF',
  },
  secondaryButton: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#D1D5DB',
  },
  secondaryButtonText: {
    fontSize: 14,
    fontWeight: '500',
    color: '#2563EB',
  },
  dangerButton: {
    backgroundColor: '#DC2626',
  },
  dangerButtonText: {
    fontSize: 14,
    fontWeight: '500',
    color: '#FFFFFF',
  },
  disabledButton: {
    backgroundColor: '#9CA3AF',
    opacity: 0.6,
  },
  buttonText: {
    fontSize: 14,
    fontWeight: '500',
  },
  mapCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 20,
    ...Platform.select({
      web: {
        boxShadow: '0 1px 3px 0 rgba(0, 0, 0, 0.1), 0 1px 2px 0 rgba(0, 0, 0, 0.06)',
      },
      default: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.1,
        shadowRadius: 2,
        elevation: 1,
      },
    }),
  },
  mapHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
    gap: 12,
  },
  mapHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  mapTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#1F2937',
  },
  mapContainer: {
    height: 256,
    borderRadius: 8,
    overflow: 'hidden',
    position: 'relative',
  },
  mapBackground: {
    flex: 1,
    background: 'linear-gradient(135deg, #DBEAFE 0%, #DCFCE7 100%)',
    backgroundColor: '#DBEAFE',
    position: 'relative',
  },
  geofence: {
    position: 'absolute',
    top: '20%',
    left: '20%',
    right: '20%',
    bottom: '20%',
    borderRadius: 100,
    borderWidth: 2,
    borderColor: '#2563EB',
    borderStyle: 'dashed',
    backgroundColor: 'rgba(37, 99, 235, 0.1)',
  },
  studentMarker: {
    position: 'absolute',
    width: 24,
    height: 24,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: '#FFFFFF',
    ...Platform.select({
      web: {
        boxShadow: '0 2px 4px 0 rgba(0, 0, 0, 0.3)',
      },
      default: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.3,
        shadowRadius: 4,
        elevation: 5,
      },
    }),
  },
  markerText: {
    fontSize: 10,
    fontWeight: 'bold',
    color: '#FFFFFF',
  },
  centerPoint: {
    position: 'absolute',
    top: '50%',
    left: '50%',
    width: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: '#2563EB',
    borderWidth: 2,
    borderColor: '#FFFFFF',
    transform: [{ translateX: -8 }, { translateY: -8 }],
    ...Platform.select({
      web: {
        boxShadow: '0 2px 4px 0 rgba(0, 0, 0, 0.3)',
      },
      default: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.3,
        shadowRadius: 4,
        elevation: 5,
      },
    }),
  },
  centerPulse: {
    position: 'absolute',
    top: -2,
    left: -2,
    right: -2,
    bottom: -2,
    borderRadius: 10,
    backgroundColor: '#2563EB',
    opacity: 0.75,
  },
  mapLabel: {
    position: 'absolute',
    bottom: 12,
    left: 12,
    backgroundColor: '#FFFFFF',
    borderRadius: 6,
    paddingHorizontal: 12,
    paddingVertical: 4,
    ...Platform.select({
      web: {
        boxShadow: '0 1px 2px 0 rgba(0, 0, 0, 0.05)',
      },
      default: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.05,
        shadowRadius: 2,
        elevation: 1,
      },
    }),
  },
  mapLabelText: {
    fontSize: 12,
    fontWeight: '500',
    color: '#374151',
  },
  studentsCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 20,
    ...Platform.select({
      web: {
        boxShadow: '0 1px 3px 0 rgba(0, 0, 0, 0.1), 0 1px 2px 0 rgba(0, 0, 0, 0.06)',
      },
      default: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.1,
        shadowRadius: 2,
        elevation: 1,
      },
    }),
  },
  studentsHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  studentsTitle: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  cardTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#1F2937',
  },
  studentsContent: {
    gap: 12,
  },
  studentItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 16,
    paddingHorizontal: 16,
    backgroundColor: '#F9FAFB',
    borderRadius: 8,
    marginBottom: 8,
  },
  studentLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    flex: 1,
  },
  statusDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
  },
  studentInfo: {
    flex: 1,
  },
  studentName: {
    fontSize: 14,
    fontWeight: '500',
    color: '#111827',
    marginBottom: 2,
  },
  studentDetails: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  lastSeenContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  lastSeenText: {
    fontSize: 12,
    color: '#6B7280',
  },
  statusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'transparent',
  },
  statusBadgeText: {
    fontSize: 12,
    fontWeight: '500',
  },
  emptyState: {
    alignItems: 'center',
    padding: 32,
  },
  emptyStateText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1F2937',
    marginTop: 16,
    marginBottom: 8,
    textAlign: 'center',
  },
  emptyStateSubtext: {
    fontSize: 14,
    color: '#6B7280',
    textAlign: 'center',
  },
  centered: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    fontSize: 16,
    color: '#6B7280',
    marginTop: 12,
  },
  statsContainer: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 20,
    marginBottom: 4,
    ...Platform.select({
      web: {
        boxShadow: '0 1px 3px 0 rgba(0, 0, 0, 0.1), 0 1px 2px 0 rgba(0, 0, 0, 0.06)',
      },
      default: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.1,
        shadowRadius: 2,
        elevation: 1,
      },
    }),
  },
  statsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  statCard: {
    flex: 1,
    padding: 16,
    borderRadius: 8,
    backgroundColor: '#FFFFFF',
    marginHorizontal: 4,
    ...Platform.select({
      web: {
        boxShadow: '0 1px 2px 0 rgba(0, 0, 0, 0.05)',
      },
      default: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.05,
        shadowRadius: 2,
        elevation: 1,
      },
    }),
  },
  primaryCard: {
    backgroundColor: '#DCFCE7',
  },
  successCard: {
    backgroundColor: '#DCFCE7',
  },
  infoCard: {
    backgroundColor: '#DCFCE7',
  },
  warningCard: {
    backgroundColor: '#FEF3C7',
  },
  statIconContainer: {
    marginBottom: 8,
  },
  statContent: {
    alignItems: 'center',
  },
  statNumber: {
    fontSize: 18,
    fontWeight: '600',
    color: '#1F2937',
  },
  statLabel: {
    fontSize: 12,
    color: '#6B7280',
  },
  tabContainer: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 4,
  },
  tab: {
    flex: 1,
    height: 48,
    borderRadius: 8,
    backgroundColor: '#FFFFFF',
    justifyContent: 'center',
    alignItems: 'center',
    ...Platform.select({
      web: {
        boxShadow: '0 1px 2px 0 rgba(0, 0, 0, 0.05)',
      },
      default: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.05,
        shadowRadius: 2,
        elevation: 1,
      },
    }),
  },
  activeTab: {
    backgroundColor: '#DCFCE7',
  },
  tabText: {
    fontSize: 14,
    fontWeight: '500',
    color: '#6B7280',
  },
  activeTabText: {
    color: '#2563EB',
  },
  visitsCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 20,
    ...Platform.select({
      web: {
        boxShadow: '0 1px 3px 0 rgba(0, 0, 0, 0.1), 0 1px 2px 0 rgba(0, 0, 0, 0.06)',
      },
      default: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.1,
        shadowRadius: 2,
        elevation: 1,
      },
    }),
  },
  visitsHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  visitsTitle: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  visitItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 16,
    paddingHorizontal: 16,
    backgroundColor: '#F9FAFB',
    borderRadius: 8,
    marginBottom: 8,
  },
  visitLeft: {
    flex: 1,
  },
  visitLocation: {
    fontSize: 14,
    fontWeight: '500',
    color: '#1F2937',
  },
  visitDetails: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginTop: 4,
  },
  visitDate: {
    fontSize: 14,
    fontWeight: '500',
    color: '#6B7280',
  },
  visitCodeContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F3F4F6',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 4,
  },
  visitCodeLabel: {
    fontSize: 12,
    color: '#6B7280',
  },
  visitCode: {
    fontSize: 12,
    fontWeight: '500',
    color: '#1F2937',
  },
  visitStatusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'transparent',
  },
  visitStatusText: {
    fontSize: 12,
    fontWeight: '500',
  },
  newVisitButton: {
    backgroundColor: '#2563EB',
    padding: 8,
    borderRadius: 8,
  },
  newVisitButtonText: {
    fontSize: 14,
    fontWeight: '500',
    color: '#FFFFFF',
  },
  visitsContent: {
    gap: 12,
  },
  emptyStateButton: {
    backgroundColor: '#2563EB',
    padding: 16,
    borderRadius: 8,
  },
  emptyStateButtonText: {
    fontSize: 14,
    fontWeight: '500',
    color: '#FFFFFF',
  },
  codeBadge: {
    backgroundColor: '#DCFCE7',
    padding: 8,
    borderRadius: 8,
    marginRight: 12,
  },
  codeLabel: {
    fontSize: 12,
    fontWeight: '500',
    color: '#1F2937',
  },
  codeValue: {
    fontSize: 12,
    fontWeight: '500',
    color: '#1F2937',
  },
  noCodeState: {
    alignItems: 'center',
    padding: 32,
  },
  noCodeText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1F2937',
    marginTop: 16,
    marginBottom: 8,
    textAlign: 'center',
  },
  noCodeSubtext: {
    fontSize: 14,
    color: '#6B7280',
    textAlign: 'center',
  },
  refreshButton: {
    backgroundColor: '#2563EB',
    padding: 16,
    borderRadius: 8,
  },
  refreshButtonText: {
    fontSize: 14,
    fontWeight: '500',
    color: '#FFFFFF',
  },
  viewAllButton: {
    backgroundColor: '#2563EB',
    padding: 8,
    borderRadius: 8,
  },
  viewAllButtonText: {
    fontSize: 14,
    fontWeight: '500',
    color: '#FFFFFF',
  },
  headerButtons: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  showMoreButton: {
    backgroundColor: '#2563EB',
    padding: 16,
    borderRadius: 8,
    alignItems: 'center',
  },
  showMoreText: {
    fontSize: 14,
    fontWeight: '500',
    color: '#FFFFFF',
  },
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 20,
    ...Platform.select({
      web: {
        boxShadow: '0 1px 3px 0 rgba(0, 0, 0, 0.1), 0 1px 2px 0 rgba(0, 0, 0, 0.06)',
      },
      default: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.1,
        shadowRadius: 2,
        elevation: 1,
      },
    }),
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  cardTitleContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  cardTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#1F2937',
  },
  zoomButton: {
    position: 'absolute',
    top: 12,
    right: 12,
    backgroundColor: '#FFFFFF',
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
    ...Platform.select({
      web: {
        boxShadow: '0 2px 4px rgba(0, 0, 0, 0.1)',
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
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalContent: {
    width: '90%',
    height: '80%',
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    overflow: 'hidden',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#1F2937',
  },
  closeButton: {
    padding: 4,
  },
  modalMapContainer: {
    flex: 1,
  },
  inactiveMapContainer: {
    backgroundColor: '#F9FAFB',
    justifyContent: 'center',
    alignItems: 'center',
  },
  inactiveState: {
    alignItems: 'center',
    padding: 16,
    width: '100%',
  },
  inactiveTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1F2937',
    marginTop: 12,
    marginBottom: 6,
    textAlign: 'center',
  },
  inactiveSubtext: {
    fontSize: 13,
    color: '#6B7280',
    textAlign: 'center',
    marginBottom: 16,
    paddingHorizontal: 8,
    lineHeight: 18,
  },
  inactiveButtons: {
    width: '100%',
    gap: 8,
  },
  inactiveButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    padding: 12,
    borderRadius: 8,
  },
  visitSelector: {
    flex: 1,
    borderWidth: 1,
    borderColor: '#e1e8ed',
    borderRadius: 8,
    backgroundColor: '#fff',
    maxWidth: 250,
  },
  visitPicker: {
    height: 40,
  },
  joinTypeBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 4,
  },
  joinTypeText: {
    fontSize: 11,
    fontWeight: '500',
  },
});

export default SupervisorDashboard; 
