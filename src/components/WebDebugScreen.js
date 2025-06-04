import React from 'react';
import { View, Text, StyleSheet, Platform, TouchableOpacity, Alert } from 'react-native';

const WebDebugScreen = () => {
  const handleTest = () => {
    Alert.alert('Test', `Platform: ${Platform.OS}\nVersion: ${Platform.Version}`);
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Web Compatibility Test</Text>
      <Text style={styles.info}>Platform: {Platform.OS}</Text>
      <Text style={styles.info}>Version: {Platform.Version}</Text>
      
      <TouchableOpacity style={styles.button} onPress={handleTest}>
        <Text style={styles.buttonText}>Test Alert</Text>
      </TouchableOpacity>
      
      <View style={styles.status}>
        <Text style={styles.statusText}>✅ React Native Web Working</Text>
        <Text style={styles.statusText}>✅ Basic Components Working</Text>
        <Text style={styles.statusText}>✅ Styling Working</Text>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#f5f5f5',
    padding: 20,
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    marginBottom: 20,
    color: '#333',
  },
  info: {
    fontSize: 16,
    marginBottom: 10,
    color: '#666',
  },
  button: {
    backgroundColor: '#007AFF',
    padding: 15,
    borderRadius: 8,
    marginTop: 20,
  },
  buttonText: {
    color: 'white',
    fontSize: 16,
    fontWeight: '600',
  },
  status: {
    marginTop: 30,
    alignItems: 'center',
  },
  statusText: {
    fontSize: 14,
    color: '#27ae60',
    marginBottom: 5,
  },
});

export default WebDebugScreen; 