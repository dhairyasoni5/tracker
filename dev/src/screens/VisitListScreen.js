import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  RefreshControl,
  Alert,
} from 'react-native';
import { collection, query, where, getDocs, orderBy } from 'firebase/firestore';
import { useFocusEffect } from '@react-navigation/native';
import { db } from '../firebase/firebaseConfig';
import { useAuth } from '../utils/AuthContext';
import ErrorHandler, { ERROR_SEVERITY } from '../utils/ErrorHandler';

const VisitListScreen = ({ navigation }) => {
  const { userData } = useAuth();
  const [visits, setVisits] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // Fetch visits when screen comes into focus
  useFocusEffect(
    useCallback(() => {
      fetchVisits();
    }, [userData])
  );

  const fetchVisits = async (isRefresh = false) => {
    try {
      if (isRefresh) {
        setRefreshing(true);
      } else {
        setLoading(true);
      }

      let visitsQuery;

      if (userData.role === 'admin') {
        // Admin sees all visits - no orderBy to avoid index issues
        visitsQuery = query(
          collection(db, 'visits')
        );
      } else if (userData.role === 'supervisor') {
        // Supervisor sees only their created visits - no orderBy to avoid index issues
        visitsQuery = query(
          collection(db, 'visits'),
          where('supervisorId', '==', userData.uid)
        );
      } else if (userData.role === 'user') {
        // Students see only visits they're assigned to - no orderBy to avoid index issues
        visitsQuery = query(
          collection(db, 'visits'),
          where('assignedStudents', 'array-contains', userData.uid)
        );
      }

      const querySnapshot = await getDocs(visitsQuery);
      const visitsList = [];

      querySnapshot.forEach((doc) => {
        const visitData = doc.data();
        visitsList.push({
          id: doc.id,
          ...visitData,
        });
      });

      // Sort by dateTime on client side to avoid Firebase index requirements
      visitsList.sort((a, b) => {
        const dateA = new Date(a.dateTime);
        const dateB = new Date(b.dateTime);
        return dateB - dateA; // Most recent first
      });

      setVisits(visitsList);
    } catch (error) {
      // Special handling for index errors
      if (error.code === 'failed-precondition' && error.message.includes('index')) {
        console.warn('Firebase index required. Using client-side sorting as fallback.');
        Alert.alert(
          'Loading Error', 
          'Some features may be slower due to database configuration. Data will still load correctly.'
        );
      } else {
        ErrorHandler.logError(error, {
          action: 'fetchVisits',
          userRole: userData.role,
          userId: userData.uid
        }, ERROR_SEVERITY.MEDIUM);

        Alert.alert('Error', 'Failed to load visits. Please try again.');
      }
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const onRefresh = () => {
    fetchVisits(true);
  };

  const getStatusColor = (status) => {
    switch (status) {
      case 'scheduled':
        return '#3498db';
      case 'ongoing':
        return '#f39c12';
      case 'completed':
        return '#27ae60';
      case 'cancelled':
        return '#e74c3c';
      default:
        return '#95a5a6';
    }
  };

  const getStatusText = (status) => {
    switch (status) {
      case 'scheduled':
        return 'Scheduled';
      case 'ongoing':
        return 'Ongoing';
      case 'completed':
        return 'Completed';
      case 'cancelled':
        return 'Cancelled';
      default:
        return 'Unknown';
    }
  };

  const isVisitUpcoming = (visitDateTime) => {
    return new Date(visitDateTime) > new Date();
  };

  const isVisitToday = (visitDateTime) => {
    const visitDate = new Date(visitDateTime);
    const today = new Date();
    return visitDate.toDateString() === today.toDateString();
  };

  const formatDateTime = (dateTime) => {
    const date = new Date(dateTime);
    return date.toLocaleDateString() + ' at ' + date.toLocaleTimeString([], { 
      hour: '2-digit', 
      minute: '2-digit' 
    });
  };

  const navigateToVisitDetail = (visit) => {
    navigation.navigate('VisitDetail', { visitId: visit.id, visit });
  };

  const navigateToCreateVisit = () => {
    navigation.navigate('CreateVisit');
  };

  const renderVisitItem = ({ item: visit }) => {
    const isUpcoming = isVisitUpcoming(visit.dateTime);
    const isToday = isVisitToday(visit.dateTime);

    return (
      <TouchableOpacity
        style={[
          styles.visitCard,
          isToday && styles.visitCardToday,
          !isUpcoming && styles.visitCardPast
        ]}
        onPress={() => navigateToVisitDetail(visit)}
      >
        <View style={styles.visitHeader}>
          <View style={styles.visitTitleContainer}>
            <Text style={styles.visitTitle} numberOfLines={2}>
              {visit.title}
            </Text>
            {isToday && (
              <Text style={styles.todayBadge}>TODAY</Text>
            )}
          </View>
          <View style={[styles.statusBadge, { backgroundColor: getStatusColor(visit.status) }]}>
            <Text style={styles.statusText}>{getStatusText(visit.status)}</Text>
          </View>
        </View>

        <Text style={styles.visitLocation} numberOfLines={1}>
          📍 {visit.location}
        </Text>

        <Text style={styles.visitDateTime}>
          🕒 {formatDateTime(visit.dateTime)}
        </Text>

        <View style={styles.visitFooter}>
          <Text style={styles.studentCount}>
            👥 {visit.assignedStudents?.length || 0} student{(visit.assignedStudents?.length || 0) !== 1 ? 's' : ''}
          </Text>
          
          {userData.role !== 'user' && (
            <Text style={styles.supervisorName}>
              By: {visit.supervisorName}
            </Text>
          )}
        </View>

        {userData.role === 'user' && (
          <View style={styles.attendanceStatus}>
            {visit.attendance?.checkedIn?.includes(userData.uid) ? (
              visit.attendance?.checkedOut?.includes(userData.uid) ? (
                <Text style={styles.attendanceCompleted}>✅ Completed</Text>
              ) : (
                <Text style={styles.attendanceCheckedIn}>🟡 Checked In</Text>
              )
            ) : (
              <Text style={styles.attendancePending}>⏳ Pending</Text>
            )}
          </View>
        )}
      </TouchableOpacity>
    );
  };

  const renderEmptyState = () => (
    <View style={styles.emptyState}>
      <Text style={styles.emptyStateTitle}>
        {userData.role === 'user' 
          ? 'No visits assigned'
          : 'No visits created'
        }
      </Text>
      <Text style={styles.emptyStateSubtitle}>
        {userData.role === 'user' 
          ? 'Your supervisor will assign visits to you'
          : 'Create your first visit to get started'
        }
      </Text>
      
      {(userData.role === 'supervisor' || userData.role === 'admin') && (
        <TouchableOpacity 
          style={styles.createButton}
          onPress={navigateToCreateVisit}
        >
          <Text style={styles.createButtonText}>Create Visit</Text>
        </TouchableOpacity>
      )}
    </View>
  );

  const renderHeader = () => (
    <View style={styles.header}>
      <Text style={styles.headerTitle}>
        {userData.role === 'user' ? 'My Visits' : 'Visits'}
      </Text>
      <Text style={styles.headerSubtitle}>
        {visits.length} visit{visits.length !== 1 ? 's' : ''} found
      </Text>
    </View>
  );

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#3498db" />
        <Text style={styles.loadingText}>Loading visits...</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <FlatList
        data={visits}
        renderItem={renderVisitItem}
        keyExtractor={(item) => item.id}
        ListHeaderComponent={renderHeader}
        ListEmptyComponent={renderEmptyState}
        contentContainerStyle={[
          styles.listContainer,
          visits.length === 0 && styles.emptyListContainer
        ]}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
        showsVerticalScrollIndicator={false}
      />

      {/* Floating Action Button for Create Visit */}
      {(userData.role === 'supervisor' || userData.role === 'admin') && visits.length > 0 && (
        <TouchableOpacity
          style={styles.fab}
          onPress={navigateToCreateVisit}
        >
          <Text style={styles.fabText}>+</Text>
        </TouchableOpacity>
      )}
    </View>
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
  listContainer: {
    padding: 15,
  },
  emptyListContainer: {
    flexGrow: 1,
  },
  header: {
    marginBottom: 20,
  },
  headerTitle: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#2c3e50',
    marginBottom: 5,
  },
  headerSubtitle: {
    fontSize: 16,
    color: '#7f8c8d',
  },
  visitCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  visitCardToday: {
    borderLeftWidth: 4,
    borderLeftColor: '#f39c12',
  },
  visitCardPast: {
    opacity: 0.7,
  },
  visitHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 8,
  },
  visitTitleContainer: {
    flex: 1,
    marginRight: 12,
  },
  visitTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#2c3e50',
    lineHeight: 24,
  },
  todayBadge: {
    fontSize: 12,
    color: '#f39c12',
    fontWeight: 'bold',
    marginTop: 4,
  },
  statusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
  },
  statusText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '600',
  },
  visitLocation: {
    fontSize: 14,
    color: '#7f8c8d',
    marginBottom: 4,
  },
  visitDateTime: {
    fontSize: 14,
    color: '#7f8c8d',
    marginBottom: 12,
  },
  visitFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  studentCount: {
    fontSize: 14,
    color: '#3498db',
    fontWeight: '600',
  },
  supervisorName: {
    fontSize: 12,
    color: '#95a5a6',
    fontStyle: 'italic',
  },
  attendanceStatus: {
    marginTop: 8,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: '#ecf0f1',
  },
  attendanceCompleted: {
    fontSize: 14,
    color: '#27ae60',
    fontWeight: '600',
  },
  attendanceCheckedIn: {
    fontSize: 14,
    color: '#f39c12',
    fontWeight: '600',
  },
  attendancePending: {
    fontSize: 14,
    color: '#95a5a6',
    fontWeight: '600',
  },
  emptyState: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 40,
  },
  emptyStateTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#2c3e50',
    textAlign: 'center',
    marginBottom: 10,
  },
  emptyStateSubtitle: {
    fontSize: 16,
    color: '#7f8c8d',
    textAlign: 'center',
    lineHeight: 24,
    marginBottom: 30,
  },
  createButton: {
    backgroundColor: '#27ae60',
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 8,
  },
  createButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  fab: {
    position: 'absolute',
    right: 20,
    bottom: 20,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#27ae60',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 4,
    },
    shadowOpacity: 0.3,
    shadowRadius: 6,
    elevation: 8,
  },
  fabText: {
    fontSize: 24,
    color: '#fff',
    fontWeight: 'bold',
  },
});

export default VisitListScreen; 