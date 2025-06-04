import { MaterialIcons as Icon } from '@expo/vector-icons';
import { Picker } from '@react-native-picker/picker';
import { signOut } from 'firebase/auth';
import {
    collection,
    getDocs,
    onSnapshot,
    query,
    where
} from 'firebase/firestore';
import React, { useEffect, useRef, useState } from 'react';
import {
    ActivityIndicator,
    Alert,
    Dimensions,
    FlatList,
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
  const mapRef = useRef(null);

  const visitsWithLocation = todayVisits
    .filter(v => v.locationCoordinates)
    .sort((a, b) => new Date(b.dateTime || b.createdAt?.seconds * 1000) - new Date(a.dateTime || a.createdAt?.seconds * 1000));

  useEffect(() => {
    if (visitsWithLocation.length > 0) {
      if (!selectedVisitId || !visitsWithLocation.some(v => v.id === selectedVisitId)) {
        setSelectedVisitId(visitsWithLocation[0].id);
      }
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

  const selectedVisit = todayVisits.find(v => v.id === selectedVisitId);

  const setupRealtimeListeners = () => {
    const unsubscribes = [];

    if (!userData?.uid) {
      console.warn('Cannot setup real-time listeners: userData.uid not available');
      return unsubscribes;
    }

    console.log('Setting up real-time listeners for supervisor:', userData.uid);

    const visitsQuery = query(
      collection(db, 'visits'),
      where('supervisorId', '==', userData.uid)
    );

    const unsubscribeVisits = onSnapshot(visitsQuery, (snapshot) => {
      const allVisits = [];
      snapshot.forEach((doc) => {
        allVisits.push({ id: doc.id, ...doc.data() });
      });
      
      const today = new Date();
      const startOfDay = new Date(today.getFullYear(), today.getMonth(), today.getDate());
      const endOfDay = new Date(today.getFullYear(), today.getMonth(), today.getDate() + 1);
      
      const todayVisits = allVisits.filter(visit => {
        const visitDate = new Date(visit.dateTime);
        return visitDate >= startOfDay && visitDate < endOfDay;
      });
      
      setTodayVisits(todayVisits);
      
      // Check if there's an active visit
      const activeVisit = todayVisits.find(visit => visit.status === 'active');
      setIsVisitActive(!!activeVisit);
      
      if (activeVisit) {
        // Calculate duration
        const startTime = new Date(activeVisit.startTime);
        const now = new Date();
        const diffMs = now - startTime;
        const hours = Math.floor(diffMs / (1000 * 60 * 60));
        const minutes = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));
        setVisitDuration(`${hours}h ${minutes}m`);
      }
      
      updateStats(students, todayVisits, allVisits);
    }, (error) => {
      console.warn('Real-time listener error:', error);
      fetchDashboardData();
    });

    unsubscribes.push(unsubscribeVisits);
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
      const studentsQuery = query(
        collection(db, 'users'),
        where('role', '==', 'user'),
        where('supervisorCode', '==', userData.supervisorCode)
      );
      const querySnapshot = await getDocs(studentsQuery);
      const studentsList = [];
      querySnapshot.forEach((doc) => {
        const studentData = doc.data();
        studentsList.push({
          id: doc.id,
          ...studentData,
          // Optionally, you can keep lastSeen logic, but do NOT overwrite status or lastKnownLocation
          // lastSeen: Math.random() > 0.5 ? 'Just now' : `${Math.floor(Math.random() * 30)} min ago`
        });
      });
      console.log('Fetched students:', studentsList.length);
      setStudents(studentsList);
      return studentsList;
    } catch (error) {
      console.error('Error fetching students:', error);
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

      querySnapshot.forEach((doc) => {
        allVisits.push({ id: doc.id, ...doc.data() });
      });

      const today = new Date();
      const startOfDay = new Date(today.getFullYear(), today.getMonth(), today.getDate());
      const endOfDay = new Date(today.getFullYear(), today.getMonth(), today.getDate() + 1);
      
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

      querySnapshot.forEach((doc) => {
        allVisits.push({ id: doc.id, ...doc.data() });
      });

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
    const activeStudents = studentsList.filter(s => s.status === 'active').length;
    const emergencyAlerts = studentsList.filter(s => s.status === 'emergency').length;
    const activeVisits = allVisitsList.filter(v => v.status === 'active').length;
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

  const handleEndVisit = () => {
    Alert.alert(
      'End Visit',
      'Are you sure you want to end the current visit?',
      [
        { text: 'Cancel', style: 'cancel' },
        { 
          text: 'End Visit', 
          style: 'destructive',
          onPress: () => {
            setIsVisitActive(false);
            setVisitDuration('0h 0m');
            Alert.alert('Success', 'Visit ended successfully!');
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
          <Text style={styles.statusDuration}>• {visitDuration}</Text>
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

  const renderQuickActions = () => (
    <View style={styles.quickActions}>
      <TouchableOpacity 
        style={[styles.actionButton, styles.primaryButton, isVisitActive && styles.disabledButton]}
        onPress={handleStartNewVisit}
        disabled={isVisitActive}
      >
        <Icon name="add" size={20} color="#FFFFFF" />
        <Text style={styles.primaryButtonText}>Start New Visit</Text>
      </TouchableOpacity>
      
      <TouchableOpacity 
        style={[styles.actionButton, isVisitActive ? styles.dangerButton : styles.secondaryButton]}
        onPress={isVisitActive ? handleEndVisit : () => setIsVisitActive(true)}
      >
        <Icon 
          name={isVisitActive ? "stop" : "play-arrow"} 
          size={20} 
          color={isVisitActive ? "#FFFFFF" : "#2563EB"} 
        />
        <Text style={[styles.buttonText, isVisitActive ? styles.dangerButtonText : styles.secondaryButtonText]}>
          {isVisitActive ? "End Visit" : "Resume"}
        </Text>
      </TouchableOpacity>
    </View>
  );

  const renderMapView = () => {
    if (!selectedVisit) return null;
    const attendance = selectedVisit.attendance || {};
    const checkedInArray = attendance.checkedIn || [];
    const checkedOutArray = attendance.checkedOut || [];
    // Only show students who are checked in and not checked out for this visit
    const checkedInStudents = students.filter(student => {
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

    return (
      <View style={styles.mapCard}>
        <View style={styles.mapHeader}>
          <Icon name="map" size={20} color="#1F2937" />
          <Text style={styles.mapTitle}>Live Location Map</Text>
        </View>
        {/* Dropdown to select visit */}
        <View style={{ marginBottom: 12, borderWidth: 1, borderColor: '#e1e8ed', borderRadius: 8, backgroundColor: '#fff' }}>
          <Picker
            selectedValue={selectedVisitId}
            onValueChange={setSelectedVisitId}
            style={{ height: 48 }}
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
            {/* Visit location pin (red) */}
            <Marker
              coordinate={selectedVisit.locationCoordinates}
              pinColor="#e11d48"
              title={selectedVisit.location}
              description="Visit Location"
            />
            {/* 500m perimeter */}
            <Circle
              center={selectedVisit.locationCoordinates}
              radius={500}
              strokeColor="#2563EB"
              fillColor="rgba(37,99,235,0.1)"
            />
            {/* Checked-in students within perimeter */}
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
        </View>
      </View>
    );
  };

  const renderStudentItem = ({ item, index }) => (
    <TouchableOpacity 
      style={styles.studentItem}
      onPress={() => handleStudentPress(item)}
    >
      <View style={styles.studentLeft}>
        <View style={[styles.statusDot, { backgroundColor: getStatusColor(item.status) }]} />
        <View style={styles.studentInfo}>
          <Text style={styles.studentName}>{item.fullName}</Text>
          <View style={styles.lastSeenContainer}>
            <Icon name="schedule" size={12} color="#6B7280" />
            <Text style={styles.lastSeenText}>{item.lastSeen}</Text>
          </View>
        </View>
      </View>
      <View style={[styles.statusBadge, getStatusBadge(item.status)]}>
        <Text style={[styles.statusBadgeText, { color: getStatusBadge(item.status).color }]}>
          {item.status.charAt(0).toUpperCase() + item.status.slice(1)}
        </Text>
      </View>
    </TouchableOpacity>
  );

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
            <Text style={styles.emptyStateText}>No students registered yet</Text>
            <Text style={styles.emptyStateSubtext}>
              Share your supervisor code: {userData?.supervisorCode}
            </Text>
          </View>
        )}
      </View>
    </View>
  );

  const renderTabContent = () => {
    switch (selectedTab) {
      case 'overview':
        return (
          <>
            {renderMapView()}
            {renderStats()}
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
                  data={allVisits.slice(0, 5)} // Show only first 5 visits
                  keyExtractor={(item) => item.id}
                  renderItem={({ item }) => (
                    <TouchableOpacity 
                      style={styles.visitItem}
                      onPress={() => handleVisitPress(item)}
                    >
                      <View style={styles.visitLeft}>
                        <Text style={styles.visitLocation}>{item.location || 'Industrial Visit'}</Text>
                        <Text style={styles.visitDate}>
                          {new Date(item.dateTime || item.createdAt).toLocaleDateString()}
                        </Text>
                      </View>
                      <View style={[
                        styles.visitStatusBadge,
                        { backgroundColor: item.status === 'active' ? '#DCFCE7' : 
                                          item.status === 'completed' ? '#EFF6FF' : '#FEF3C7' }
                      ]}>
                        <Text style={[
                          styles.visitStatusText,
                          { color: item.status === 'active' ? '#166534' : 
                                  item.status === 'completed' ? '#1E40AF' : '#92400E' }
                        ]}>
                          {item.status.charAt(0).toUpperCase() + item.status.slice(1)}
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
      default:
        return null;
    }
  };

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
      {renderStats()}
      
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
    alignItems: 'center',
    gap: 8,
    marginBottom: 12,
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
  visitDate: {
    fontSize: 14,
    fontWeight: '500',
    color: '#6B7280',
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
});

export default SupervisorDashboard; 