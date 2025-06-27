import { Picker } from '@react-native-picker/picker';
import {
    addDoc,
    collection,
    getDocs,
    query,
    serverTimestamp,
    where
} from 'firebase/firestore';
import React, { useEffect, useState } from 'react';
import {
    ActivityIndicator,
    Alert,
    Platform,
    SafeAreaView,
    ScrollView,
    StyleSheet,
    Switch,
    Text,
    TextInput,
    TouchableOpacity,
    View,
} from 'react-native';
import Icon from 'react-native-vector-icons/Ionicons';
import WebCompatibleDatePicker from '../components/WebCompatibleDatePicker';
import { db } from '../firebase/firebaseConfig';
import { useAuth } from '../utils/AuthContext';
import ErrorHandler, { ERROR_SEVERITY } from '../utils/ErrorHandler';

const CreateVisitScreen = ({ navigation }) => {
  const { userData } = useAuth();
  const [loading, setLoading] = useState(false);
  const [loadingStudents, setLoadingStudents] = useState(true);
  
  // Form fields
  const [title, setTitle] = useState('');
  const [location, setLocation] = useState('');
  const [purpose, setPurpose] = useState('');
  const [date, setDate] = useState(new Date());
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [notes, setNotes] = useState('');
  const [isAllDay, setIsAllDay] = useState(true);
  
  // Students data
  const [students, setStudents] = useState([]);
  const [selectedStudents, setSelectedStudents] = useState([]);
  const [selectAll, setSelectAll] = useState(false);

  // Visit Code
  const [visitCode, setVisitCode] = useState('');

  // Add state for locations
  const [locations, setLocations] = useState([]);
  const [selectedLocation, setSelectedLocation] = useState(null);

  useEffect(() => {
    fetchStudents();
    setVisitCode(generateVisitCode());
    fetchLocations();
  }, []);

  const fetchStudents = async () => {
    try {
      setLoadingStudents(true);
      console.log('Fetching students for visit creation...');
      let studentsQuery;

      if (userData.role === 'admin') {
        // Admin can see all students
        studentsQuery = query(
          collection(db, 'users'),
          where('role', '==', 'user')
        );
      } else if (userData.role === 'supervisor') {
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
            name: studentData.fullName,
            email: studentData.email,
            supervisorCode: studentData.supervisorCode,
            isActive: studentData.isActive,
            assignedTo: studentData.assignedTo || [],
            joinType: 'registered'
          });
        });

        // Process joined students
        joinedSnapshot.forEach((doc) => {
          const studentData = doc.data();
          // Only add if not already in the map
          if (!studentsMap.has(doc.id)) {
            studentsMap.set(doc.id, {
              id: doc.id,
              name: studentData.fullName,
              email: studentData.email,
              supervisorCode: studentData.supervisorCode,
              isActive: studentData.isActive,
              assignedTo: studentData.assignedTo || [],
              joinType: 'joined'
            });
          }
        });

        const studentsList = Array.from(studentsMap.values());
        // Filter only active students
        const activeStudents = studentsList.filter(student => student.isActive !== false);
        console.log('Total unique active students found:', activeStudents.length);
        setStudents(activeStudents);
        return;
      }

      if (studentsQuery) {
        const querySnapshot = await getDocs(studentsQuery);
        const studentsList = querySnapshot.docs.map(doc => {
          const studentData = doc.data();
          return {
            id: doc.id,
            name: studentData.fullName,
            email: studentData.email,
            supervisorCode: studentData.supervisorCode,
            isActive: studentData.isActive,
            assignedTo: studentData.assignedTo || []
          };
        });
        // Filter only active students
        const activeStudents = studentsList.filter(student => student.isActive !== false);
        setStudents(activeStudents);
      }
    } catch (error) {
      console.error('Error fetching students:', error);
      console.error('Error details:', {
        code: error.code,
        message: error.message,
        stack: error.stack,
        supervisorCode: userData?.supervisorCode,
        supervisorId: userData?.uid
      });
      Alert.alert('Error', 'Failed to fetch students. Please try again.');
    } finally {
      setLoadingStudents(false);
    }
  };

  const fetchLocations = async () => {
    try {
      const locationsQuery = query(collection(db, 'locations'));
      const querySnapshot = await getDocs(locationsQuery);
      const locationsList = [];
      querySnapshot.forEach((doc) => {
        const data = doc.data();
        locationsList.push({
          id: doc.id,
          name: data.name,
          latitude: data.latitude,
          longitude: data.longitude,
        });
      });
      setLocations(locationsList);
    } catch (error) {
      ErrorHandler.logError(error, { action: 'fetchLocations' }, ERROR_SEVERITY.MEDIUM);
      Alert.alert('Error', 'Failed to load locations.');
    }
  };

  const handleDateChange = (event, selectedDate) => {
    // On web, we don't need to hide the picker
    if (Platform.OS !== 'web') {
      setShowDatePicker(false);
    }
    
    if (selectedDate) {
      // Set to current time if date is today, otherwise set to 9 AM
      const now = new Date();
      const isToday = selectedDate.toDateString() === now.toDateString();
      
      if (isToday) {
        selectedDate.setHours(now.getHours(), now.getMinutes());
      } else {
        selectedDate.setHours(9, 0, 0, 0);
      }
      
      setDate(selectedDate);
    }
  };

  const showDatePickerModal = () => {
    if (Platform.OS === 'web') {
      // On web, the date picker is always visible, no need for modal
      return;
    }
    setShowDatePicker(true);
  };

  const handleStudentSelect = (studentId) => {
    setSelectedStudents(prev => {
      if (prev.includes(studentId)) {
        return prev.filter(id => id !== studentId);
      } else {
        return [...prev, studentId];
      }
    });
  };

  const handleSelectAll = () => {
    if (selectedStudents.length === students.length) {
      setSelectedStudents([]);
    } else {
      setSelectedStudents(students.map(student => student.id));
    }
  };

  const validateForm = () => {
    if (!title.trim()) {
      Alert.alert('Error', 'Please enter a visit title');
      return false;
    }
    if (!selectedLocation) {
      Alert.alert('Error', 'Please select a location');
      return false;
    }
    if (!purpose.trim()) {
      Alert.alert('Error', 'Please enter the purpose of visit');
      return false;
    }
    if (selectedStudents.length === 0) {
      Alert.alert('Error', 'Please select at least one student');
      return false;
    }
    return true;
  };

  const handleCreateVisit = async () => {
    if (!validateForm()) return;

    setLoading(true);
    try {
      const locationObj = locations.find((loc) => loc.id === selectedLocation);
      const visitData = {
        title: title.trim(),
        location: locationObj ? locationObj.name : '',
        locationCoordinates: locationObj ? { latitude: locationObj.latitude, longitude: locationObj.longitude } : null,
        purpose: purpose.trim(),
        dateTime: date.toISOString(),
        isAllDay,
        notes: notes.trim(),
        supervisorId: userData.uid,
        supervisorName: userData.fullName,
        supervisorCode: userData.supervisorCode,
        assignedStudents: selectedStudents,
        createdAt: serverTimestamp(),
        status: 'active',
        visitCode,
        
        // Initialize attendance structure
        attendance: {
          checkedIn: [],
          checkedOut: [],
          absent: [...selectedStudents], // Initially all students are absent
          checkInTimes: {},
          checkOutTimes: {}
        }
      };

      const docRef = await addDoc(collection(db, 'visits'), visitData);

      Alert.alert(
        'Success',
        `Visit "${title}" has been created successfully!\nVisit Code: ${visitCode}`,
        [
          {
            text: 'Back to Dashboard',
            onPress: () => {
              // Navigate back to the appropriate dashboard based on user role
              if (userData.role === 'admin') {
                navigation.navigate('AdminDashboard');
              } else if (userData.role === 'supervisor') {
                navigation.navigate('SupervisorDashboard');
              } else {
                navigation.goBack();
              }
            }
          },
          {
            text: 'Create Another',
            onPress: () => {
              // Reset form and generate new code
              setTitle('');
              setLocation('');
              setPurpose('');
              setNotes('');
              setSelectedStudents([]);
              setSelectAll(false);
              setDate(new Date());
              setVisitCode(generateVisitCode());
            }
          },
          {
            text: 'View Visit',
            onPress: () => navigation.navigate('VisitDetail', { visitId: docRef.id }),
            style: 'default'
          }
        ]
      );

    } catch (error) {
      ErrorHandler.logError(error, {
        action: 'createVisit',
        supervisorId: userData.uid,
        studentsCount: selectedStudents.length
      }, ERROR_SEVERITY.HIGH);

      Alert.alert('Error', 'Failed to create visit. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  // Generate a 6-digit code
  const generateVisitCode = () => {
    return Math.floor(100000 + Math.random() * 900000).toString();
  };

  const renderStudentItem = ({ item }) => (
    <TouchableOpacity
      style={[
        styles.studentItem,
        selectedStudents.includes(item.id) && styles.selectedStudentItem
      ]}
      onPress={() => handleStudentSelect(item.id)}
    >
      <View style={styles.studentInfo}>
        <Text style={styles.studentName}>{item.name}</Text>
        <Text style={styles.studentEmail}>{item.email}</Text>
        {item.joinType && (
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
        )}
      </View>
      <View style={styles.checkboxContainer}>
        <View style={[
          styles.checkbox,
          selectedStudents.includes(item.id) && styles.checkedBox
        ]}>
          {selectedStudents.includes(item.id) && (
            <Icon name="checkmark" size={16} color="#FFFFFF" />
          )}
        </View>
      </View>
    </TouchableOpacity>
  );

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Create New Visit</Text>
        <Text style={styles.subtitle}>Plan an industrial visit for your students</Text>
      </View>

      <ScrollView 
        style={styles.scrollContainer}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Basic Information */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Visit Information</Text>
          
          <View style={styles.inputContainer}>
            <Text style={styles.label}>Title *</Text>
            <TextInput
              style={styles.input}
              placeholder="e.g., Factory Visit - Manufacturing Unit"
              value={title}
              onChangeText={setTitle}
              editable={!loading}
            />
          </View>

          <View style={styles.inputContainer}>
            <Text style={styles.label}>Location *</Text>
            <View style={{ borderWidth: 1, borderColor: '#e1e8ed', borderRadius: 8, backgroundColor: '#fff' }}>
              <Picker
                selectedValue={selectedLocation}
                onValueChange={(itemValue) => setSelectedLocation(itemValue)}
                enabled={!loading}
                style={{ height: 48 }}
              >
                <Picker.Item label="Select a location" value={null} />
                {locations.map((loc) => (
                  <Picker.Item key={loc.id} label={loc.name} value={loc.id} />
                ))}
              </Picker>
            </View>
          </View>

          <View style={styles.inputContainer}>
            <Text style={styles.label}>Purpose *</Text>
            <TextInput
              style={[styles.input, styles.textArea]}
              placeholder="Describe the purpose and objectives of this visit"
              value={purpose}
              onChangeText={setPurpose}
              multiline
              numberOfLines={3}
              editable={!loading}
            />
          </View>

          {/* Visit Code Display */}
          <View style={styles.inputContainer}>
            <Text style={styles.label}>Visit Code</Text>
            <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 4 }}>
              <Text style={{
                fontSize: 20,
                fontWeight: 'bold',
                letterSpacing: 4,
                color: '#2563EB',
                backgroundColor: '#F3F4F6',
                paddingVertical: 8,
                paddingHorizontal: 16,
                borderRadius: 8,
              }}>{visitCode}</Text>
              <Text style={{ marginLeft: 8, color: '#6B7280', fontSize: 12 }}>(Share this code with students)</Text>
            </View>
          </View>
        </View>

        {/* Date and Time */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Schedule</Text>
          
          <View style={styles.inputContainer}>
            <Text style={styles.label}>Date *</Text>
            {Platform.OS === 'web' ? (
              // Web: Show inline date picker
              <WebCompatibleDatePicker
                value={date}
                onChange={handleDateChange}
                minimumDate={new Date()}
              />
            ) : (
              // Mobile: Show button that opens modal
              <TouchableOpacity
                style={styles.dateButton}
                onPress={showDatePickerModal}
                disabled={loading}
              >
                <Text style={styles.dateButtonText}>
                  {date.toLocaleDateString('en-US', {
                    weekday: 'short',
                    year: 'numeric',
                    month: 'short',
                    day: 'numeric'
                  })}
                </Text>
              </TouchableOpacity>
            )}
          </View>

          <View style={styles.switchContainer}>
            <Text style={styles.label}>All Day Visit</Text>
            <Switch
              value={isAllDay}
              onValueChange={setIsAllDay}
              disabled={loading}
              trackColor={{ false: '#e0e0e0', true: '#007AFF' }}
              thumbColor={isAllDay ? '#fff' : '#f4f3f4'}
            />
          </View>

          {!isAllDay && (
            <Text style={styles.helperText}>
              Time: {date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
            </Text>
          )}
        </View>

        {/* Student Selection */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>
              Select Students ({selectedStudents.length} selected)
            </Text>
            {students.length > 0 && (
              <TouchableOpacity
                style={styles.selectAllButton}
                onPress={handleSelectAll}
                disabled={loading}
              >
                <Text style={styles.selectAllText}>
                  {selectedStudents.length === students.length ? 'Deselect All' : 'Select All'}
                </Text>
              </TouchableOpacity>
            )}
          </View>

          {loadingStudents ? (
            <View style={styles.loadingContainer}>
              <ActivityIndicator color="#007AFF" />
              <Text style={styles.loadingText}>Loading students...</Text>
            </View>
          ) : students.length === 0 ? (
            <View style={styles.emptyState}>
              <Text style={styles.emptyStateText}>
                {userData.role === 'supervisor' 
                  ? 'No students found under your supervision'
                  : 'No students found in the system'
                }
              </Text>
              <TouchableOpacity
                style={styles.refreshButton}
                onPress={fetchStudents}
              >
                <Text style={styles.refreshButtonText}>Refresh</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <View style={styles.studentsList}>
              {students.map((student) => (
                <View key={student.id}>
                  {renderStudentItem({ item: student })}
                </View>
              ))}
            </View>
          )}
        </View>

        {/* Additional Notes */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Additional Notes</Text>
          <View style={styles.inputContainer}>
            <TextInput
              style={[styles.input, styles.textArea]}
              placeholder="Any additional instructions or information for students..."
              value={notes}
              onChangeText={setNotes}
              multiline
              numberOfLines={4}
              editable={!loading}
            />
          </View>
        </View>

        {/* Create Button */}
        <TouchableOpacity
          style={[styles.createButton, loading && styles.createButtonDisabled]}
          onPress={handleCreateVisit}
          disabled={loading || selectedStudents.length === 0}
        >
          {loading ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.createButtonText}>Create Visit</Text>
          )}
        </TouchableOpacity>
      </ScrollView>

      {/* Date Picker - Web shows inline, Mobile shows modal */}
      {Platform.OS === 'web' ? (
        // Web: Always show date picker inline (hidden visually, but HTML input is accessible)
        null
      ) : (
        // Mobile: Show modal when showDatePicker is true
        showDatePicker && (
          <WebCompatibleDatePicker
            value={date}
            onChange={handleDateChange}
            minimumDate={new Date()}
          />
        )
      )}
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f8f9fa',
  },
  header: {
    backgroundColor: '#007AFF',
    padding: 20,
    paddingTop: 60,
    borderBottomLeftRadius: 20,
    borderBottomRightRadius: 20,
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#fff',
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 16,
    color: '#e3f2fd',
    textAlign: 'center',
    marginTop: 5,
  },
  scrollContainer: {
    flex: 1,
  },
  scrollContent: {
    padding: 20,
    paddingBottom: 40,
  },
  section: {
    backgroundColor: '#fff',
    padding: 20,
    borderRadius: 12,
    marginBottom: 20,
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#2c3e50',
    marginBottom: 15,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 15,
  },
  inputContainer: {
    marginBottom: 15,
  },
  label: {
    fontSize: 16,
    fontWeight: '600',
    color: '#2c3e50',
    marginBottom: 8,
  },
  input: {
    borderWidth: 1,
    borderColor: '#e1e8ed',
    borderRadius: 8,
    padding: 12,
    fontSize: 16,
    backgroundColor: '#fff',
    color: '#2c3e50',
  },
  textArea: {
    height: 100,
    textAlignVertical: 'top',
  },
  dateButton: {
    borderWidth: 1,
    borderColor: '#e1e8ed',
    borderRadius: 8,
    padding: 15,
    backgroundColor: '#fff',
    alignItems: 'center',
  },
  dateButtonText: {
    fontSize: 16,
    color: '#2c3e50',
    fontWeight: '600',
  },
  switchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 10,
  },
  helperText: {
    fontSize: 14,
    color: '#7f8c8d',
    fontStyle: 'italic',
    marginTop: 5,
  },
  selectAllButton: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    backgroundColor: '#2563EB',
    borderRadius: 6,
  },
  selectAllText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '500',
  },
  loadingContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
  },
  loadingText: {
    fontSize: 16,
    color: '#7f8c8d',
    marginLeft: 10,
  },
  emptyState: {
    padding: 30,
    alignItems: 'center',
    backgroundColor: '#f8f9fa',
    borderRadius: 8,
    borderWidth: 2,
    borderColor: '#e1e8ed',
    borderStyle: 'dashed',
  },
  emptyStateText: {
    fontSize: 16,
    color: '#7f8c8d',
    textAlign: 'center',
    marginBottom: 15,
    lineHeight: 22,
  },
  refreshButton: {
    backgroundColor: '#3498db',
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 6,
  },
  refreshButtonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
  studentsList: {
    backgroundColor: '#f8f9fa',
    borderRadius: 8,
    overflow: 'hidden',
  },
  studentItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 15,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#f1f2f6',
  },
  selectedStudentItem: {
    backgroundColor: '#e8f5e8',
  },
  studentInfo: {
    flex: 1,
  },
  studentName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#2c3e50',
    marginBottom: 4,
  },
  studentEmail: {
    fontSize: 14,
    color: '#7f8c8d',
  },
  checkboxContainer: {
    width: 24,
    height: 24,
    borderRadius: 4,
    borderWidth: 2,
    borderColor: '#e1e8ed',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#fff',
  },
  checkedBox: {
    backgroundColor: '#27ae60',
    borderColor: '#27ae60',
  },
  checkbox: {
    width: 24,
    height: 24,
    borderRadius: 4,
    borderWidth: 2,
    borderColor: '#e1e8ed',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#fff',
  },
  createButton: {
    backgroundColor: '#27ae60',
    padding: 16,
    borderRadius: 10,
    alignItems: 'center',
    marginTop: 20,
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  createButtonDisabled: {
    backgroundColor: '#95a5a6',
    opacity: 0.7,
  },
  createButtonText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: 'bold',
  },
  joinTypeBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 4,
    marginTop: 4,
    alignSelf: 'flex-start',
  },
  joinTypeText: {
    fontSize: 11,
    fontWeight: '500',
  },
});

export default CreateVisitScreen; 