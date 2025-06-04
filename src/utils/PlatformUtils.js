import { Platform } from 'react-native';

export const isWeb = Platform.OS === 'web';
export const isMobile = Platform.OS === 'ios' || Platform.OS === 'android';

// Web-safe component fallbacks
export const webSafeComponent = (Component, webFallback = null) => {
  if (isWeb && webFallback) {
    return webFallback;
  }
  return Component;
};

// Web-safe style adjustments
export const webSafeStyles = (styles, webStyles = {}) => {
  return isWeb ? { ...styles, ...webStyles } : styles;
};

// Check if a feature is available on current platform
export const isFeatureAvailable = (feature) => {
  const features = {
    clipboard: true, // Available on all platforms via expo-clipboard
    sharing: !isWeb, // expo-sharing not available on web
    fileSystem: true, // Available on all platforms
    gesture: !isWeb, // react-native-gesture-handler limited on web
    safeArea: true, // react-native-safe-area-context available on web
  };
  
  return features[feature] ?? true;
};

export default {
  isWeb,
  isMobile,
  webSafeComponent,
  webSafeStyles,
  isFeatureAvailable
}; 