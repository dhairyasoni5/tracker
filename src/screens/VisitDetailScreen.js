import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  Alert,
  ActivityIndicator,
  RefreshControl,
} from 'react-native';
import { doc, getDoc, updateDoc, arrayUnion, arrayRemove } from 'firebase/firestore';
import { db } from '../firebase/firebaseConfig';
import { useAuth } from '../utils/AuthContext';
import ErrorHandler, { ERROR_SEVERITY } from '../utils/ErrorHandler';

const VisitDetailScreen = ({ route, navigation }) => {
  const { visitId, visit: initialVisit } = route.params;
  const { userData } = useAuth();
  
  const [visit, setVisit] = useState(initialVisit || null);
  const [loading, setLoading] = useState(!initialVisit);
  const [refreshing, setRefreshing] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);

  useEffect(() => {
    if (!initialVisit) {
      fetchVisitDetails();
    }
  }, [visitId]);

  const fetchVisitDetails = async (isRefresh = false) => {
    try {
      if (isRefresh) {
        setRefreshing(true);
      } else {
        setLoading(true);
      }

      const visitDoc = await getDoc(doc(db, 'visits', visitId));
      
      if (visitDoc.exists()) {
        const visitData = visitDoc.data();
        setVisit({
          id: visitDoc.id,
          ...visitData,
        });
      } else {
        Alert.alert('Error', 'Visit not found');
        navigation.goBack();
      }
    } catch (error) {
      ErrorHandler.logError(error, {
        action: 'fetchVisitDetails',
        visitId,
        userId: userData.uid
      }, ERROR_SEVERITY.MEDIUM);

      Alert.alert('Error', 'Failed to load visit details');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const onRefresh = () => {
    fetchVisitDetails(true);
  };

  const handleCheckIn = async () => {
    try {
      setActionLoading(true);

      // Check if already checked in
      if (visit.attendance?.checkedIn?.includes(userData.uid)) {
        Alert.alert('Already Checked In', 'You have already checked in to this visit.');
        return;
      }

      const visitRef = doc(db, 'visits', visitId);
      
      // Add user to checkedIn array
      await updateDoc(visitRef, {
        [`attendance.checkedIn`]: arrayUnion(userData.uid),
        [`attendance.absent`]: arrayRemove(userData.uid) // Remove from absent if was there
      });

      // Update local state
      setVisit(prev => ({
        ...prev,
        attendance: {
          ...prev.attendance,
          checkedIn: [...(prev.attendance?.checkedIn || []), userData.uid],
          absent: (prev.attendance?.absent || []).filter(id => id !== userData.uid)
        }
      }));

      Alert.alert('Success', 'You have successfully checked in!');
      
    } catch (error) {
      ErrorHandler.logError(error, {
        action: 'checkIn',
        visitId,
        userId: userData.uid
      }, ERROR_SEVERITY.HIGH);

      Alert.alert('Error', 'Failed to check in. Please try again.');
    } finally {
      setActionLoading(false);
    }
  };

  const handleCheckOut = async () => {
    try {
      setActionLoading(true);

      // Check if not checked in
      if (!visit.attendance?.checkedIn?.includes(userData.uid)) {
        Alert.alert('Not Checked In', 'You must check in first before checking out.');
        return;
      }

      // Check if already checked out
      if (visit.attendance?.checkedOut?.includes(userData.uid)) {
        Alert.alert('Already Checked Out', 'You have already checked out from this visit.');
        return;
      }

      const visitRef = doc(db, 'visits', visitId);
      
      // Add user to checkedOut array
      await updateDoc(visitRef, {
        [`attendance.checkedOut`]: arrayUnion(userData.uid)
      });

      // Update local state
      setVisit(prev => ({
        ...prev,
        attendance: {
          ...prev.attendance,
          checkedOut: [...(prev.attendance?.checkedOut || []), userData.uid]
        }
      }));

      Alert.alert('Success', 'You have successfully checked out!');
      
    } catch (error) {
      ErrorHandler.logError(error, {
        action: 'checkOut',
        visitId,
        userId: userData.uid
      }, ERROR_SEVERITY.HIGH);

      Alert.alert('Error', 'Failed to check out. Please try again.');
    } finally {
      setActionLoading(false);
    }
  };

  const handleEditVisit = () => {
    // Since we don't have a separate EditVisit screen, 
    // we'll show an alert for now or navigate to CreateVisit
    Alert.alert(
      'Edit Visit',
      'Visit editing functionality will be available soon. For now, you can create a new visit.',
      [
        { text: 'Cancel', style: 'cancel' },
        { 
          text: 'Create New Visit', 
          onPress: () => navigation.navigate('CreateVisit')
        }
      ]
    );
  };

  const handleBackToDashboard = () => {
    if (userData.role === 'admin') {
      navigation.navigate('AdminDashboard');
    } else if (userData.role === 'supervisor') {
      navigation.navigate('SupervisorDashboard');
    } else {
      navigation.navigate('UserTracker');
    }
  };

  const handleDeleteVisit = () => {
    Alert.alert(
      'Delete Visit',
      'Are you sure you want to delete this visit? This action cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        { 
          text: 'Delete', 
          style: 'destructive',
          onPress: confirmDeleteVisit
        }
      ]
    );
  };

  const confirmDeleteVisit = async () => {
    try {
      setActionLoading(true);
      
      // In a real app, you might want to soft delete or archive
      // For now, we'll just navigate back
      Alert.alert('Feature Coming Soon', 'Delete functionality will be implemented soon.');
      
    } catch (error) {
      ErrorHandler.logError(error, {
        action: 'deleteVisit',
        visitId,
        userId: userData.uid
      }, ERROR_SEVERITY.HIGH);

      Alert.alert('Error', 'Failed to delete visit');
    } finally {
      setActionLoading(false);
    }
  };

  const getStatusColor = (status) => {
    switch (status) {
      case 'scheduled': return '#3498db';
      case 'ongoing': return '#f39c12';
      case 'completed': return '#27ae60';
      case 'cancelled': return '#e74c3c';
      default: return '#95a5a6';
    }
  };

  const getStatusText = (status) => {
    switch (status) {
      case 'scheduled': return 'Scheduled';
      case 'ongoing': return 'Ongoing';
      case 'completed': return 'Completed';
      case 'cancelled': return 'Cancelled';
      default: return 'Unknown';
    }
  };

  const formatDateTime = (dateTime) => {
    const date = new Date(dateTime);
    return {
      date: date.toLocaleDateString('en-US', {
        weekday: 'long',
        year: 'numeric',
        month: 'long',
        day: 'numeric',
      }),
      time: date.toLocaleTimeString([], { 
        hour: '2-digit', 
        minute: '2-digit' 
      })
    };
  };

  const isVisitToday = (visitDateTime) => {
    const visitDate = new Date(visitDateTime);
    const today = new Date();
    return visitDate.toDateString() === today.toDateString();
  };

  const canCheckIn = () => {
    return userData.role === 'user' && 
           visit?.assignedStudents?.includes(userData.uid) &&
           !visit.attendance?.checkedIn?.includes(userData.uid);
  };

  const canCheckOut = () => {
    return userData.role === 'user' && 
           visit?.attendance?.checkedIn?.includes(userData.uid) &&
           !visit.attendance?.checkedOut?.includes(userData.uid);
  };

  const getUserAttendanceStatus = () => {
    if (!visit?.attendance) return 'pending';
    
    if (visit.attendance.checkedOut?.includes(userData.uid)) {
      return 'completed';
    } else if (visit.attendance.checkedIn?.includes(userData.uid)) {
      return 'checked-in';
    } else {
      return 'pending';
    }
  };

  const getAttendanceStats = () => {
    const total = visit?.studentCount || 0;
    const checkedIn = visit?.attendance?.checkedIn?.length || 0;
    const checkedOut = visit?.attendance?.checkedOut?.length || 0;
    const absent = total - checkedIn;

    return { total, checkedIn, checkedOut, absent };
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#3498db" />
        <Text style={styles.loadingText}>Loading visit details...</Text>
      </View>
    );
  }

  if (!visit) {
    return (
      <View style={styles.errorContainer}>
        <Text style={styles.errorText}>Visit not found</Text>
        <TouchableOpacity 
          style={styles.backButton}
          onPress={() => navigation.goBack()}
        >
          <Text style={styles.backButtonText}>Go Back</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const dateTime = formatDateTime(visit.dateTime);
  const isToday = isVisitToday(visit.dateTime);
  const attendanceStatus = getUserAttendanceStatus();
  const stats = getAttendanceStats();

  return (
    <ScrollView 
      style={styles.container}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
      }
    >
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.title}>{visit.title}</Text>
        <View style={[styles.statusBadge, { backgroundColor: getStatusColor(visit.status) }]}>
          <Text style={styles.statusText}>{getStatusText(visit.status)}</Text>
        </View>
      </View>

      {/* Today Badge */}
      {isToday && (
        <View style={styles.todayContainer}>
          <Text style={styles.todayText}>📅 Today's Visit</Text>
        </View>
      )}

      {/* Visit Details */}
      <View style={styles.detailsCard}>
        <View style={styles.detailItem}>
          <Text style={styles.detailLabel}>📍 Location</Text>
          <Text style={styles.detailValue}>{visit.location}</Text>
        </View>

        <View style={styles.detailItem}>
          <Text style={styles.detailLabel}>📅 Date</Text>
          <Text style={styles.detailValue}>{dateTime.date}</Text>
        </View>

        <View style={styles.detailItem}>
          <Text style={styles.detailLabel}>🕒 Time</Text>
          <Text style={styles.detailValue}>{dateTime.time}</Text>
        </View>

        <View style={styles.detailItem}>
          <Text style={styles.detailLabel}>👨‍🏫 Supervisor</Text>
          <Text style={styles.detailValue}>{visit.supervisorName}</Text>
        </View>

        <View style={styles.detailItem}>
          <Text style={styles.detailLabel}>👥 Students</Text>
          <Text style={styles.detailValue}>{visit.assignedStudents?.length || 0} assigned</Text>
        </View>
      </View>

      {/* Purpose */}
      <View style={styles.descriptionCard}>
        <Text style={styles.descriptionLabel}>📝 Purpose</Text>
        <Text style={styles.descriptionText}>{visit.purpose || 'No purpose specified'}</Text>
      </View>

      {/* Additional Notes */}
      {visit.notes && (
        <View style={styles.descriptionCard}>
          <Text style={styles.descriptionLabel}>📋 Notes</Text>
          <Text style={styles.descriptionText}>{visit.notes}</Text>
        </View>
      )}

      {/* Student Attendance Status */}
      {userData.role === 'user' && visit.assignedStudents?.includes(userData.uid) && (
        <View style={styles.attendanceCard}>
          <Text style={styles.attendanceTitle}>Your Attendance</Text>
          <View style={styles.attendanceStatusContainer}>
            {attendanceStatus === 'completed' && (
              <Text style={styles.attendanceCompleted}>✅ Completed</Text>
            )}
            {attendanceStatus === 'checked-in' && (
              <Text style={styles.attendanceCheckedIn}>🟡 Checked In</Text>
            )}
            {attendanceStatus === 'pending' && (
              <Text style={styles.attendancePending}>⏳ Not Started</Text>
            )}
          </View>
        </View>
      )}

      {/* Attendance Stats (for supervisors/admins) */}
      {userData.role !== 'user' && (
        <View style={styles.statsCard}>
          <Text style={styles.statsTitle}>Attendance Overview</Text>
          <View style={styles.statsContainer}>
            <View style={styles.statItem}>
              <Text style={styles.statNumber}>{stats.checkedIn}</Text>
              <Text style={styles.statLabel}>Checked In</Text>
            </View>
            <View style={styles.statItem}>
              <Text style={styles.statNumber}>{stats.checkedOut}</Text>
              <Text style={styles.statLabel}>Completed</Text>
            </View>
            <View style={styles.statItem}>
              <Text style={styles.statNumber}>{stats.absent}</Text>
              <Text style={styles.statLabel}>Pending</Text>
            </View>
          </View>
        </View>
      )}

      {/* Action Buttons */}
      <View style={styles.actionsContainer}>
        {/* Student Actions */}
        {userData.role === 'user' && visit.assignedStudents?.includes(userData.uid) && (
          <View style={styles.studentActions}>
            {canCheckIn() && (
              <TouchableOpacity
                style={[styles.actionButton, styles.checkInButton]}
                onPress={handleCheckIn}
                disabled={actionLoading}
              >
                {actionLoading ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text style={styles.actionButtonText}>Check In</Text>
                )}
              </TouchableOpacity>
            )}

            {canCheckOut() && (
              <TouchableOpacity
                style={[styles.actionButton, styles.checkOutButton]}
                onPress={handleCheckOut}
                disabled={actionLoading}
              >
                {actionLoading ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text style={styles.actionButtonText}>Check Out</Text>
                )}
              </TouchableOpacity>
            )}
          </View>
        )}

        {/* Supervisor/Admin Actions */}
        {(userData.role === 'supervisor' && visit.supervisorId === userData.uid) || userData.role === 'admin' && (
          <View style={styles.managementActions}>
            <TouchableOpacity
              style={[styles.actionButton, styles.editButton]}
              onPress={handleEditVisit}
              disabled={actionLoading}
            >
              <Text style={styles.actionButtonText}>Edit Visit</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.actionButton, styles.deleteButton]}
              onPress={handleDeleteVisit}
              disabled={actionLoading}
            >
              <Text style={styles.actionButtonText}>Delete Visit</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Back to Dashboard Button - for all users */}
        <TouchableOpacity
          style={[styles.actionButton, styles.dashboardButton]}
          onPress={handleBackToDashboard}
          disabled={actionLoading}
        >
          <Text style={styles.actionButtonText}>Back to Dashboard</Text>
        </TouchableOpacity>
      </View>
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f8f9fa',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#f8f9fa',
  },
  loadingText: {
    marginTop: 10,
    fontSize: 16,
    color: '#7f8c8d',
  },
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  errorText: {
    fontSize: 18,
    color: '#e74c3c',
    marginBottom: 20,
  },
  backButton: {
    backgroundColor: '#3498db',
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 8,
  },
  backButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  header: {
    backgroundColor: '#fff',
    padding: 20,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    borderBottomWidth: 1,
    borderBottomColor: '#e1e8ed',
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#2c3e50',
    flex: 1,
    marginRight: 15,
  },
  statusBadge: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 15,
  },
  statusText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '600',
  },
  todayContainer: {
    backgroundColor: '#fff3cd',
    padding: 12,
    alignItems: 'center',
    borderBottomWidth: 1,
    borderBottomColor: '#e1e8ed',
  },
  todayText: {
    fontSize: 16,
    color: '#856404',
    fontWeight: '600',
  },
  detailsCard: {
    backgroundColor: '#fff',
    margin: 15,
    padding: 20,
    borderRadius: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  detailItem: {
    marginBottom: 15,
  },
  detailLabel: {
    fontSize: 16,
    fontWeight: '600',
    color: '#7f8c8d',
    marginBottom: 4,
  },
  detailValue: {
    fontSize: 16,
    color: '#2c3e50',
    lineHeight: 22,
  },
  descriptionCard: {
    backgroundColor: '#fff',
    marginHorizontal: 15,
    marginBottom: 15,
    padding: 20,
    borderRadius: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  descriptionLabel: {
    fontSize: 16,
    fontWeight: '600',
    color: '#7f8c8d',
    marginBottom: 10,
  },
  descriptionText: {
    fontSize: 16,
    color: '#2c3e50',
    lineHeight: 24,
  },
  attendanceCard: {
    backgroundColor: '#fff',
    marginHorizontal: 15,
    marginBottom: 15,
    padding: 20,
    borderRadius: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  attendanceTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#2c3e50',
    marginBottom: 10,
  },
  attendanceStatusContainer: {
    alignItems: 'center',
  },
  attendanceCompleted: {
    fontSize: 18,
    color: '#27ae60',
    fontWeight: 'bold',
  },
  attendanceCheckedIn: {
    fontSize: 18,
    color: '#f39c12',
    fontWeight: 'bold',
  },
  attendancePending: {
    fontSize: 18,
    color: '#95a5a6',
    fontWeight: 'bold',
  },
  statsCard: {
    backgroundColor: '#fff',
    marginHorizontal: 15,
    marginBottom: 15,
    padding: 20,
    borderRadius: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  statsTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#2c3e50',
    marginBottom: 15,
  },
  statsContainer: {
    flexDirection: 'row',
    justifyContent: 'space-around',
  },
  statItem: {
    alignItems: 'center',
  },
  statNumber: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#3498db',
  },
  statLabel: {
    fontSize: 14,
    color: '#7f8c8d',
    marginTop: 4,
  },
  actionsContainer: {
    padding: 15,
    paddingBottom: 30,
  },
  studentActions: {
    gap: 12,
  },
  managementActions: {
    flexDirection: 'row',
    gap: 12,
  },
  actionButton: {
    paddingVertical: 15,
    paddingHorizontal: 20,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 50,
  },
  checkInButton: {
    backgroundColor: '#27ae60',
  },
  checkOutButton: {
    backgroundColor: '#f39c12',
  },
  editButton: {
    backgroundColor: '#3498db',
    flex: 1,
  },
  deleteButton: {
    backgroundColor: '#e74c3c',
    flex: 1,
  },
  dashboardButton: {
    backgroundColor: '#95a5a6',
    flex: 1,
  },
  actionButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
});

export default VisitDetailScreen; 