import React from 'react';
import { Platform, View, Text, TouchableOpacity, StyleSheet } from 'react-native';

// Conditional import for DateTimePicker (only on mobile)
let DateTimePicker;
if (Platform.OS !== 'web') {
  DateTimePicker = require('@react-native-community/datetimepicker').default;
}

const WebCompatibleDatePicker = ({ 
  value, 
  mode = 'date', 
  display = 'default',
  onChange,
  minimumDate,
  style,
  ...props 
}) => {
  
  if (Platform.OS === 'web') {
    // Web implementation using HTML input
    const handleWebChange = (event) => {
      const selectedDate = new Date(event.target.value);
      if (onChange) {
        onChange(event, selectedDate);
      }
    };

    const formatDateForWeb = (date) => {
      return date.toISOString().split('T')[0]; // YYYY-MM-DD format
    };

    const formatMinDate = (date) => {
      return date ? date.toISOString().split('T')[0] : undefined;
    };

    return (
      <View style={[styles.webContainer, style]}>
        <input
          type="date"
          value={formatDateForWeb(value)}
          onChange={handleWebChange}
          min={formatMinDate(minimumDate)}
          style={styles.webInput}
          {...props}
        />
      </View>
    );
  }

  // Mobile implementation using @react-native-community/datetimepicker
  if (DateTimePicker) {
    return (
      <DateTimePicker
        value={value}
        mode={mode}
        display={display}
        onChange={onChange}
        minimumDate={minimumDate}
        {...props}
      />
    );
  }

  // Fallback if DateTimePicker is not available
  return (
    <View style={[styles.fallbackContainer, style]}>
      <Text style={styles.fallbackText}>
        Date: {value.toLocaleDateString()}
      </Text>
    </View>
  );
};

const styles = StyleSheet.create({
  webContainer: {
    padding: 10,
  },
  webInput: {
    width: '100%',
    padding: 12,
    fontSize: 16,
    border: '1px solid #e1e8ed',
    borderRadius: 8,
    backgroundColor: '#fff',
    outline: 'none',
  },
  fallbackContainer: {
    padding: 15,
    backgroundColor: '#f8f9fa',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#e1e8ed',
  },
  fallbackText: {
    fontSize: 16,
    color: '#2c3e50',
    textAlign: 'center',
  },
});

export default WebCompatibleDatePicker; 