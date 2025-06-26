import { MaterialIcons } from '@expo/vector-icons';
import * as Location from 'expo-location';
import { collection, doc, getDocs, query, setDoc, updateDoc, where } from 'firebase/firestore';
import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Dimensions, Modal, Platform, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import MapView, { Marker, PROVIDER_GOOGLE } from 'react-native-maps';
import { db } from '../firebase/firebaseConfig';
import { useAuth } from '../utils/AuthContext';

const { width, height } = Dimensions.get('window');

const LiveLocationMap = ({ onVisitStatusChange }) => {
  const { userData } = useAuth();
  const [location, setLocation] = useState(null);
  const [errorMsg, setErrorMsg] = useState(null);
  const [isTracking, setIsTracking] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [visitId, setVisitId] = useState(null);
  const [loading, setLoading] = useState(true);
  const [visitStatus, setVisitStatus] = useState(null);
  const [isZoomModalVisible, setIsZoomModalVisible] = useState(false);
  const mapRef = useRef(null);
  const locationSubscription = useRef(null);

  useEffect(() => {
    checkVisitStatus();
    return () => {
      if (locationSubscription.current) {
        locationSubscription.current.remove();
      }
    };
  }, []);

  useEffect(() => {
    onVisitStatusChange?.(isTracking && !isPaused);
  }, [isTracking, isPaused]);

  const checkVisitStatus = async () => {
    try {
      if (!userData?.uid) {
        console.warn('No userData.uid available for checkVisitStatus');
        setLoading(false);
        return;
      }

      const visitsQuery = query(
        collection(db, 'visits'),
        where('supervisorId', '==', userData.uid),
        where('status', '==', 'active')
      );

      const querySnapshot = await getDocs(visitsQuery);
      if (!querySnapshot.empty) {
        const visitDoc = querySnapshot.docs[0];
        setVisitId(visitDoc.id);
        setVisitStatus(visitDoc.data().status);
        setIsTracking(true);
        setIsPaused(visitDoc.data().isPaused || false);
      } else {
        setVisitId(null);
        setVisitStatus(null);
        setIsTracking(false);
        setIsPaused(false);
      }
    } catch (error) {
      console.error('Error checking visit status:', error);
      Alert.alert('Error', 'Failed to check visit status');
    } finally {
      setLoading(false);
    }
  };

  const startNewVisit = async () => {
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        setErrorMsg('Permission to access location was denied');
        return;
      }

      const location = await Location.getCurrentPositionAsync({});
      setLocation(location);

      const visitRef = doc(collection(db, 'visits'));
      await setDoc(visitRef, {
        supervisorId: userData.uid,
        startTime: new Date().toISOString(),
        status: 'active',
        isPaused: false,
        location: {
          latitude: location.coords.latitude,
          longitude: location.coords.longitude,
          timestamp: new Date().toISOString()
        }
      });

      setVisitId(visitRef.id);
      setVisitStatus('active');
      setIsTracking(true);
      setIsPaused(false);
      startLocationTracking(visitRef.id);
    } catch (error) {
      console.error('Error starting new visit:', error);
      Alert.alert('Error', 'Failed to start new visit');
    }
  };

  const resumeVisit = async () => {
    try {
      if (!visitId) return;

      const visitRef = doc(db, 'visits', visitId);
      await updateDoc(visitRef, {
        isPaused: false,
        lastResumeTime: new Date().toISOString()
      });

      setIsPaused(false);
      startLocationTracking(visitId);
    } catch (error) {
      console.error('Error resuming visit:', error);
      Alert.alert('Error', 'Failed to resume visit');
    }
  };

  const startLocationTracking = (visitId) => {
    if (locationSubscription.current) {
      locationSubscription.current.remove();
    }

    locationSubscription.current = Location.watchPositionAsync(
      {
        accuracy: Location.Accuracy.High,
        timeInterval: 5000,
        distanceInterval: 10,
      },
      async (location) => {
        setLocation(location);
        try {
          const visitRef = doc(db, 'visits', visitId);
          await updateDoc(visitRef, {
            location: {
              latitude: location.coords.latitude,
              longitude: location.coords.longitude,
              timestamp: new Date().toISOString()
            }
          });
        } catch (error) {
          console.error('Error updating location:', error);
        }
      }
    );
  };

  const endVisit = async () => {
    try {
      const visitRef = doc(db, 'visits', visitId);
      await updateDoc(visitRef, {
        status: 'completed',
        endTime: new Date().toISOString()
      });
      
      // Stop location tracking
      if (locationSubscription.current) {
        locationSubscription.current.remove();
        locationSubscription.current = null;
      }
      
      // Reset all states
      setIsTracking(false);
      setIsPaused(false);
      setVisitId(null);
      setVisitStatus(null);
      setLocation(null);
      
      // Show success message
      Alert.alert('Success', 'Visit ended successfully');
    } catch (error) {
      console.error('Error ending visit:', error);
      Alert.alert('Error', 'Failed to end visit');
    }
  };

  const renderLocationOff = () => (
    <View style={styles.locationOffContainer}>
      <MaterialIcons name="location-off" size={80} color="#666" />
      <Text style={styles.locationOffText}>Location Tracking is Off</Text>
      <TouchableOpacity 
        style={styles.startButton}
        onPress={visitId ? resumeVisit : startNewVisit}
      >
        <Text style={styles.startButtonText}>
          {visitId ? 'Resume Visit' : 'Start New Visit'}
        </Text>
      </TouchableOpacity>
    </View>
  );

  const renderZoomButton = () => (
    <TouchableOpacity
      style={styles.zoomButton}
      onPress={() => setIsZoomModalVisible(true)}
    >
      <MaterialIcons name="zoom-in" size={24} color="#2563eb" />
    </TouchableOpacity>
  );

  const renderZoomModal = () => (
    <Modal
      visible={isZoomModalVisible}
      transparent={true}
      animationType="slide"
      onRequestClose={() => setIsZoomModalVisible(false)}
    >
      <View style={styles.modalContainer}>
        <View style={styles.modalContent}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>Map View</Text>
            <TouchableOpacity
              style={styles.closeButton}
              onPress={() => setIsZoomModalVisible(false)}
            >
              <MaterialIcons name="close" size={24} color="#666" />
            </TouchableOpacity>
          </View>
          <View style={styles.modalMapContainer}>
            <MapView
              style={styles.modalMap}
              provider={PROVIDER_GOOGLE}
              showsUserLocation
              showsMyLocationButton
              initialRegion={location ? {
                latitude: location.coords.latitude,
                longitude: location.coords.longitude,
                latitudeDelta: 0.005,
                longitudeDelta: 0.005,
              } : null}
            >
              {location && (
                <Marker
                  coordinate={{
                    latitude: location.coords.latitude,
                    longitude: location.coords.longitude,
                  }}
                  title="Your Location"
                />
              )}
            </MapView>
          </View>
        </View>
      </View>
    </Modal>
  );

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#0000ff" />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {(!isTracking || isPaused) ? (
        renderLocationOff()
      ) : (
        <>
          <MapView
            ref={mapRef}
            style={styles.map}
            provider={PROVIDER_GOOGLE}
            showsUserLocation
            showsMyLocationButton
            initialRegion={location ? {
              latitude: location.coords.latitude,
              longitude: location.coords.longitude,
              latitudeDelta: 0.005,
              longitudeDelta: 0.005,
            } : null}
          >
            {location && (
              <Marker
                coordinate={{
                  latitude: location.coords.latitude,
                  longitude: location.coords.longitude,
                }}
                title="Your Location"
              />
            )}
          </MapView>
          {renderZoomButton()}
          <View style={styles.controls}>
            <TouchableOpacity
              style={[styles.button, styles.pauseButton]}
              onPress={async () => {
                try {
                  const visitRef = doc(db, 'visits', visitId);
                  await updateDoc(visitRef, {
                    isPaused: true,
                    lastPauseTime: new Date().toISOString()
                  });
                  setIsPaused(true);
                  if (locationSubscription.current) {
                    locationSubscription.current.remove();
                    locationSubscription.current = null;
                  }
                } catch (error) {
                  console.error('Error pausing visit:', error);
                  Alert.alert('Error', 'Failed to pause visit');
                }
              }}
            >
              <MaterialIcons name="pause" size={24} color="white" />
              <Text style={styles.buttonText}>Pause</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.button, styles.endButton]}
              onPress={endVisit}
            >
              <MaterialIcons name="stop" size={24} color="white" />
              <Text style={styles.buttonText}>End Visit</Text>
            </TouchableOpacity>
          </View>
          {renderZoomModal()}
        </>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  map: {
    flex: 1,
  },
  controls: {
    position: 'absolute',
    bottom: 20,
    left: 20,
    right: 20,
    flexDirection: 'row',
    justifyContent: 'space-around',
  },
  button: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 15,
    borderRadius: 25,
    minWidth: 120,
    justifyContent: 'center',
  },
  pauseButton: {
    backgroundColor: '#f59e0b',
  },
  endButton: {
    backgroundColor: '#ef4444',
  },
  buttonText: {
    color: 'white',
    marginLeft: 8,
    fontSize: 16,
    fontWeight: 'bold',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  locationOffContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#f3f4f6',
  },
  locationOffText: {
    fontSize: 20,
    color: '#666',
    marginTop: 20,
    marginBottom: 30,
  },
  startButton: {
    backgroundColor: '#2563eb',
    paddingHorizontal: 30,
    paddingVertical: 15,
    borderRadius: 25,
  },
  startButtonText: {
    color: 'white',
    fontSize: 18,
    fontWeight: 'bold',
  },
  zoomButton: {
    position: 'absolute',
    top: 20,
    right: 20,
    backgroundColor: 'white',
    padding: 10,
    borderRadius: 25,
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.25,
        shadowRadius: 3.84,
      },
      android: {
        elevation: 5,
      },
    }),
  },
  modalContainer: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalContent: {
    width: width * 0.9,
    height: height * 0.8,
    backgroundColor: 'white',
    borderRadius: 20,
    overflow: 'hidden',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 15,
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb',
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#1f2937',
  },
  closeButton: {
    padding: 5,
  },
  modalMapContainer: {
    flex: 1,
  },
  modalMap: {
    flex: 1,
  },
});

export default LiveLocationMap; 