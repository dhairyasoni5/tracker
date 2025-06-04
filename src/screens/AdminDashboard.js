import React, { useState, useEffect } from 'react';
import { 
  View, 
  Text, 
  TouchableOpacity, 
  StyleSheet, 
  Alert, 
  ScrollView,
  ActivityIndicator,
  RefreshControl,
  Dimensions,
  SafeAreaView,
  Platform,
  StatusBar
} from 'react-native';
import { signOut } from 'firebase/auth';
import { 
  collection, 
  getDocs, 
  query, 
  where
} from 'firebase/firestore';
import { auth, db } from '../firebase/firebaseConfig';
import { useAuth } from '../utils/AuthContext';
import ErrorHandler, { ERROR_SEVERITY } from '../utils/ErrorHandler';
import { MaterialIcons as Icon } from '@expo/vector-icons';

const { width, height } = Dimensions.get('window');

const AdminDashboard = ({ navigation }) => {
  const { userData, clearAuthState } = useAuth();
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [stats, setStats] = useState({
    totalUsers: 0,
    totalSupervisors: 0,
    totalStudents: 0,
    totalVisits: 0,
    activeVisits: 0,
    todayVisits: 0
  });
  const [recentActivity, setRecentActivity] = useState([]);

  useEffect(() => {
    fetchDashboardData();
  }, []);

  const fetchDashboardData = async () => {
    try {
      setLoading(true);
      
      const [usersData, visitsData] = await Promise.all([
        fetchUsersStats(),
        fetchVisitsStats()
      ]);

      setStats({
        ...usersData,
        ...visitsData
      });
    } catch (error) {
      ErrorHandler.logError(error, {
        action: 'fetchAdminDashboard',
        adminId: userData?.uid
      }, ERROR_SEVERITY.MEDIUM);
    } finally {
      setLoading(false);
    }
  };

  const fetchUsersStats = async () => {
    try {
      const usersSnapshot = await getDocs(collection(db, 'users'));
      let totalUsers = 0;
      let totalSupervisors = 0;
      let totalStudents = 0;

      usersSnapshot.forEach((doc) => {
        const userData = doc.data();
        totalUsers++;
        
        if (userData.role === 'supervisor') {
          totalSupervisors++;
        } else if (userData.role === 'user') {
          totalStudents++;
        }
      });

      return {
        totalUsers,
        totalSupervisors,
        totalStudents
      };
    } catch (error) {
      console.error('Error fetching user stats:', error);
      return {
        totalUsers: 0,
        totalSupervisors: 0,
        totalStudents: 0
      };
    }
  };

  const fetchVisitsStats = async () => {
    try {
      const visitsSnapshot = await getDocs(collection(db, 'visits'));
      const visits = [];
      
      visitsSnapshot.forEach((doc) => {
        visits.push({ id: doc.id, ...doc.data() });
      });

      // Sort by date for recent activity
      visits.sort((a, b) => {
        const dateA = new Date(a.createdAt?.toDate?.() || a.createdAt || 0);
        const dateB = new Date(b.createdAt?.toDate?.() || b.createdAt || 0);
        return dateB - dateA;
      });
      
      setRecentActivity(visits.slice(0, 5));
      return updateVisitStats(visits);
    } catch (error) {
      console.error('Error fetching visit stats:', error);
      return {
        totalVisits: 0,
        activeVisits: 0,
        todayVisits: 0
      };
    }
  };

  const updateVisitStats = (visits) => {
    const totalVisits = visits.length;
    const today = new Date();
    const todayString = today.toDateString();
    
    let activeVisits = 0;
    let todayVisits = 0;

    visits.forEach(visit => {
      if (visit.status === 'active') {
        activeVisits++;
      }
      
      const visitDate = new Date(visit.dateTime);
      if (visitDate.toDateString() === todayString) {
        todayVisits++;
      }
    });

    return {
      totalVisits,
      activeVisits,
      todayVisits
    };
  };

  const onRefresh = async () => {
    setRefreshing(true);
    await fetchDashboardData();
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
                action: 'adminLogout',
                userId: userData?.uid 
              }, ERROR_SEVERITY.MEDIUM);
              
              Alert.alert('Error', 'Failed to logout. Please try again.');
            }
          }
        }
      ]
    );
  };

  const getStatIcon = (type) => {
    switch (type) {
      case 'users': return 'people';
      case 'supervisors': return 'supervised-user-circle';
      case 'students': return 'school';
      case 'visits': return 'event';
      case 'active': return 'track-changes';
      case 'today': return 'today';
      default: return 'analytics';
    }
  };

  const getStatColor = (type) => {
    switch (type) {
      case 'users': return '#3B82F6';
      case 'supervisors': return '#10B981';
      case 'students': return '#F59E0B';
      case 'visits': return '#8B5CF6';
      case 'active': return '#EF4444';
      case 'today': return '#06B6D4';
      default: return '#6B7280';
    }
  };

  if (!userData) {
    return (
      <View style={[styles.container, styles.centered]}>
        <ActivityIndicator size="large" color="#3B82F6" />
        <Text style={styles.loadingText}>Loading user data...</Text>
      </View>
    );
  }

  if (loading) {
    return (
      <View style={[styles.container, styles.centered]}>
        <ActivityIndicator size="large" color="#3B82F6" />
        <Text style={styles.loadingText}>Loading dashboard...</Text>
      </View>
    );
  }

  const renderHeader = () => (
    <View style={styles.modernHeader}>
      <View style={styles.headerContent}>
        <View style={styles.headerTop}>
          <View style={styles.logoContainer}>
            <View style={styles.logo}>
              <Icon name="admin-panel-settings" size={20} color="#FFFFFF" />
            </View>
            <View style={styles.headerText}>
              <Text style={styles.headerTitle}>Admin Dashboard</Text>
              <Text style={styles.headerSubtitle}>System Control & Analytics</Text>
            </View>
          </View>
          <TouchableOpacity style={styles.logoutIconButton} onPress={handleLogout}>
            <Icon name="logout" size={18} color="#FFFFFF" />
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );

  const renderWelcomeSection = () => (
    <View style={styles.welcomeCard}>
      <Text style={styles.welcomeCardText}>
        Welcome back, {userData?.fullName?.split(' ')[0] || 'Admin'} 👨‍💼
      </Text>
      <Text style={styles.welcomeSubtext}>
        Manage your industrial visit tracking system
      </Text>
    </View>
  );

  const renderStatsGrid = () => {
    const statItems = [
      { label: 'Total Users', value: stats.totalUsers, type: 'users' },
      { label: 'Supervisors', value: stats.totalSupervisors, type: 'supervisors' },
      { label: 'Students', value: stats.totalStudents, type: 'students' },
      { label: 'Total Visits', value: stats.totalVisits, type: 'visits' },
      { label: 'Active Visits', value: stats.activeVisits, type: 'active' },
      { label: "Today's Visits", value: stats.todayVisits, type: 'today' }
    ];

    return (
      <View style={styles.statsContainer}>
        <View style={styles.cardHeader}>
          <Icon name="analytics" size={18} color="#1F2937" />
          <Text style={styles.cardTitle}>System Analytics</Text>
        </View>
        
        <View style={styles.statsGrid}>
          {statItems.map((stat, index) => (
            <View key={stat.type} style={styles.statCard}>
              <View style={[styles.statIconContainer, { backgroundColor: getStatColor(stat.type) }]}>
                <Icon name={getStatIcon(stat.type)} size={24} color="#FFFFFF" />
              </View>
              <Text style={styles.statValue}>{stat.value || 0}</Text>
              <Text style={styles.statLabel}>{stat.label}</Text>
            </View>
          ))}
        </View>
      </View>
    );
  };

  const renderManagementActions = () => {
    const actions = [
      {
        title: 'User Management',
        description: 'Manage supervisors, students & access',
        icon: 'people',
        color: '#3B82F6',
        onPress: () => Alert.alert('Coming Soon', 'User management interface will be available soon!')
      },
      {
        title: 'Visit Oversight',
        description: 'Monitor all system visits',
        icon: 'visibility',
        color: '#10B981',
        onPress: () => navigation.navigate('VisitList')
      },
      {
        title: 'Create Visit',
        description: 'Schedule new industrial visits',
        icon: 'add-circle',
        color: '#F59E0B',
        onPress: () => navigation.navigate('CreateVisit')
      },
      {
        title: 'System Reports',
        description: 'Analytics & comprehensive reports',
        icon: 'assessment',
        color: '#8B5CF6',
        onPress: () => Alert.alert('Coming Soon', 'Advanced reporting system will be available soon!')
      }
    ];

    return (
      <View style={styles.managementContainer}>
        <View style={styles.cardHeader}>
          <Icon name="dashboard" size={18} color="#1F2937" />
          <Text style={styles.cardTitle}>Management Center</Text>
        </View>
        
        <View style={styles.actionsGrid}>
          {actions.map((action, index) => (
            <TouchableOpacity
              key={action.title}
              style={styles.actionCard}
              onPress={action.onPress}
              activeOpacity={0.7}
            >
              <View style={[styles.actionIconContainer, { backgroundColor: action.color }]}>
                <Icon name={action.icon} size={20} color="#FFFFFF" />
              </View>
              <View style={styles.actionContent}>
                <Text style={styles.actionTitle}>{action.title}</Text>
                <Text style={styles.actionDescription}>{action.description}</Text>
              </View>
              <Icon name="arrow-forward-ios" size={14} color="#9CA3AF" />
            </TouchableOpacity>
          ))}
        </View>
      </View>
    );
  };

  const renderRecentActivity = () => {
    if (recentActivity.length === 0) return null;

    return (
      <View style={styles.activityContainer}>
        <View style={styles.cardHeader}>
          <Icon name="history" size={18} color="#1F2937" />
          <Text style={styles.cardTitle}>Recent Activity</Text>
        </View>
        
        <View style={styles.activityList}>
          {recentActivity.slice(0, 4).map((activity, index) => (
            <View key={activity.id} style={styles.modernActivityItem}>
              <View style={styles.activityIconContainer}>
                <Icon 
                  name={activity.status === 'active' ? 'radio-button-checked' : 'check-circle'} 
                  size={16} 
                  color={activity.status === 'active' ? '#10B981' : '#6B7280'} 
                />
              </View>
              
              <View style={styles.activityDetails}>
                <Text style={styles.activityTitle}>
                  {activity.title || 'Industrial Visit'}
                </Text>
                <Text style={styles.activityMeta}>
                  {activity.location || 'Location TBD'} • {activity.supervisorName || 'Supervisor'}
                </Text>
                <Text style={styles.activityDate}>
                  {activity.dateTime ? 
                    new Date(activity.dateTime).toLocaleDateString('en-US', {
                      month: 'short',
                      day: 'numeric',
                      hour: '2-digit',
                      minute: '2-digit'
                    }) : 'Date TBD'
                  }
                </Text>
              </View>
              
              <View style={[
                styles.activityStatusBadge,
                { backgroundColor: activity.status === 'active' ? '#DCFCE7' : '#F3F4F6' }
              ]}>
                <Text style={[
                  styles.activityStatusText,
                  { color: activity.status === 'active' ? '#166534' : '#6B7280' }
                ]}>
                  {activity.status === 'active' ? 'Active' : 'Completed'}
                </Text>
              </View>
            </View>
          ))}
        </View>
        
        <TouchableOpacity 
          style={styles.viewAllButton}
          onPress={() => navigation.navigate('VisitList')}
        >
          <Text style={styles.viewAllButtonText}>View All Activities</Text>
          <Icon name="arrow-forward" size={14} color="#3B82F6" />
        </TouchableOpacity>
      </View>
    );
  };

  const renderSystemSettings = () => (
    <View style={styles.settingsContainer}>
      <View style={styles.cardHeader}>
        <Icon name="settings" size={18} color="#1F2937" />
        <Text style={styles.cardTitle}>System Configuration</Text>
      </View>
      
      <TouchableOpacity 
        style={styles.settingsCard}
        onPress={() => Alert.alert('Coming Soon', 'System settings will be available soon!')}
        activeOpacity={0.7}
      >
        <View style={styles.settingsIconContainer}>
          <Icon name="tune" size={20} color="#6B7280" />
        </View>
        <View style={styles.settingsContent}>
          <Text style={styles.settingsTitle}>Advanced Settings</Text>
          <Text style={styles.settingsDescription}>
            Configure system-wide preferences and security
          </Text>
        </View>
        <Icon name="arrow-forward-ios" size={14} color="#9CA3AF" />
      </TouchableOpacity>
    </View>
  );

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor="#1F2937" />
      {renderHeader()}
      
      <ScrollView 
        style={styles.scrollContainer}
        contentContainerStyle={styles.scrollContent}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            colors={['#3B82F6']}
            tintColor="#3B82F6"
          />
        }
        showsVerticalScrollIndicator={false}
      >
        {renderWelcomeSection()}
        {renderStatsGrid()}
        {renderManagementActions()}
        {renderRecentActivity()}
        {renderSystemSettings()}
      </ScrollView>
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
        background: 'linear-gradient(135deg, #1F2937 0%, #374151 100%)',
      },
      default: {
        backgroundColor: '#1F2937',
      },
    }),
    paddingHorizontal: 16,
    paddingTop: Platform.OS === 'ios' ? 60 : 40,
    paddingBottom: 16,
    borderBottomLeftRadius: 24,
    borderBottomRightRadius: 24,
    minHeight: Platform.OS === 'ios' ? 110 : 90,
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
    gap: 12,
    flex: 1,
  },
  logo: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerText: {
    flex: 1,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#FFFFFF',
    lineHeight: 22,
  },
  headerSubtitle: {
    fontSize: 12,
    color: 'rgba(255, 255, 255, 0.8)',
    marginTop: 2,
    lineHeight: 14,
  },
  logoutIconButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    justifyContent: 'center',
    alignItems: 'center',
  },

  // Scroll Container
  scrollContainer: {
    flex: 1,
  },
  scrollContent: {
    padding: 16,
    paddingBottom: 40,
  },

  // Welcome Section
  welcomeCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 20,
    marginBottom: 20,
    alignItems: 'center',
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
    fontSize: 18,
    fontWeight: '700',
    color: '#1F2937',
    textAlign: 'center',
    marginBottom: 4,
  },
  welcomeSubtext: {
    fontSize: 14,
    color: '#6B7280',
    textAlign: 'center',
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

  // Stats Grid
  statsContainer: {
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
  statsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
  },
  statCard: {
    width: '48%',
    backgroundColor: '#F9FAFB',
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  statIconContainer: {
    width: 48,
    height: 48,
    borderRadius: 24,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 8,
  },
  statValue: {
    fontSize: 24,
    fontWeight: '800',
    color: '#1F2937',
    marginBottom: 4,
  },
  statLabel: {
    fontSize: 12,
    color: '#6B7280',
    textAlign: 'center',
    fontWeight: '500',
  },

  // Management Actions
  managementContainer: {
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
  actionsGrid: {
    gap: 12,
  },
  actionCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    backgroundColor: '#F9FAFB',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  actionIconContainer: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  actionContent: {
    flex: 1,
  },
  actionTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: '#1F2937',
    marginBottom: 2,
  },
  actionDescription: {
    fontSize: 12,
    color: '#6B7280',
  },

  // Recent Activity
  activityContainer: {
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
  activityList: {
    gap: 12,
  },
  modernActivityItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    backgroundColor: '#F9FAFB',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  activityIconContainer: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#FFFFFF',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  activityDetails: {
    flex: 1,
  },
  activityTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#1F2937',
    marginBottom: 2,
  },
  activityMeta: {
    fontSize: 12,
    color: '#6B7280',
    marginBottom: 2,
  },
  activityDate: {
    fontSize: 11,
    color: '#9CA3AF',
  },
  activityStatusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
  },
  activityStatusText: {
    fontSize: 11,
    fontWeight: '600',
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
    fontSize: 14,
    fontWeight: '600',
    color: '#3B82F6',
  },

  // System Settings
  settingsContainer: {
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
  settingsCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    backgroundColor: '#F9FAFB',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  settingsIconContainer: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#FFFFFF',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  settingsContent: {
    flex: 1,
  },
  settingsTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: '#1F2937',
    marginBottom: 2,
  },
  settingsDescription: {
    fontSize: 12,
    color: '#6B7280',
  },
});

export default AdminDashboard; 