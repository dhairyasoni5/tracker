// Design System - Matching v0.dev shadcn/ui exactly
// This ensures all components across the app have consistent styling

import { Platform } from 'react-native';

export const Colors = {
  // Primary Colors (Blue theme)
  primary: '#2563EB',        // blue-600
  primaryHover: '#1D4ED8',   // blue-700
  primaryForeground: '#FFFFFF',
  
  // Background Colors
  background: '#FFFFFF',
  backgroundSecondary: '#F1F5F9',   // slate-100
  gradient: {
    from: '#EFF6FF',  // blue-50
    to: '#E0E7FF',    // indigo-100
  },
  
  // Card Colors
  card: '#FFFFFF',
  cardForeground: '#0F172A',  // slate-900
  
  // Text Colors
  foreground: '#0F172A',      // slate-900
  muted: '#64748B',           // slate-500
  mutedForeground: '#475569', // slate-600
  
  // Border & Input
  border: '#E2E8F0',          // slate-200
  input: '#E2E8F0',           // slate-200
  inputFocus: '#2563EB',      // blue-600
  
  // States
  destructive: '#EF4444',     // red-500
  destructiveForeground: '#FFFFFF',
  success: '#10B981',         // emerald-500
  warning: '#F59E0B',         // amber-500
  
  // Specific grays (matching v0.dev exactly)
  gray50: '#F8FAFC',
  gray100: '#F1F5F9',
  gray200: '#E2E8F0',
  gray300: '#CBD5E1',
  gray400: '#94A3B8',
  gray500: '#64748B',
  gray600: '#475569',
  gray700: '#334155',
  gray800: '#1E293B',
  gray900: '#0F172A',
};

export const Typography = {
  // Font sizes matching v0.dev
  xs: 12,
  sm: 14,
  base: 16,
  lg: 18,
  xl: 20,
  '2xl': 24,
  '3xl': 30,
  
  // Font weights
  normal: '400',
  medium: '500',
  semibold: '600',
  bold: '700',
};

export const Spacing = {
  // Spacing scale matching Tailwind/shadcn
  0: 0,
  1: 4,
  2: 8,
  3: 12,
  4: 16,
  5: 20,
  6: 24,
  8: 32,
  10: 40,
  12: 48,
  16: 64,
  20: 80,
  24: 96,
};

export const BorderRadius = {
  none: 0,
  sm: 4,
  md: 6,
  lg: 8,
  xl: 12,
  '2xl': 16,
  full: 999,
};

export const Shadows = Platform.select({
  web: {
    sm: {
      boxShadow: '0 1px 2px 0 rgba(0, 0, 0, 0.05)',
    },
    md: {
      boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06)',
    },
    lg: {
      boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -2px rgba(0, 0, 0, 0.05)',
    },
    xl: {
      boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)',
    },
  },
  default: {
    sm: {
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 1 },
      shadowOpacity: 0.05,
      shadowRadius: 2,
      elevation: 1,
    },
    md: {
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.1,
      shadowRadius: 6,
      elevation: 3,
    },
    lg: {
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 10 },
      shadowOpacity: 0.15,
      shadowRadius: 15,
      elevation: 6,
    },
    xl: {
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 20 },
      shadowOpacity: 0.25,
      shadowRadius: 25,
      elevation: 10,
    },
  },
});

// Component style generators (like shadcn variants) - WITH ACTUAL VALUES
export const ButtonVariants = {
  default: {
    backgroundColor: '#2563EB', // Colors.primary
    borderColor: '#2563EB',     // Colors.primary
  },
  secondary: {
    backgroundColor: '#F1F5F9', // Colors.gray100
    borderColor: '#E2E8F0',     // Colors.border
  },
  outline: {
    backgroundColor: 'transparent',
    borderColor: '#E2E8F0',     // Colors.border
    borderWidth: 1,
  },
  ghost: {
    backgroundColor: 'transparent',
    borderColor: 'transparent',
  },
};

export const InputVariants = {
  default: {
    borderColor: '#E2E8F0',     // Colors.border
    backgroundColor: '#FFFFFF', // Colors.background
    borderWidth: 1,
    borderRadius: 6,            // BorderRadius.md
    height: 48,                 // h-12 equivalent
    paddingHorizontal: 12,      // Spacing.3
    fontSize: 16,               // Typography.base
    color: '#0F172A',           // Colors.foreground
  },
  error: {
    borderColor: '#EF4444',     // Colors.destructive
  },
  focus: {
    borderColor: '#2563EB',     // Colors.inputFocus
    // Ring effect can be simulated with shadow
    shadowColor: '#2563EB',     // Colors.inputFocus
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 2,
  },
};

// Common component styles - WITH ACTUAL VALUES
export const CommonStyles = {
  // Card style matching shadcn/ui
  card: {
    backgroundColor: '#FFFFFF', // Colors.card
    borderRadius: 8,            // BorderRadius.lg
    borderWidth: 1,
    borderColor: '#E2E8F0',     // Colors.border
    shadowColor: '#000',        // Shadows.sm
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  },
  
  // Button base style
  button: {
    height: 48,
    borderRadius: 6,            // BorderRadius.md
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 16,      // Spacing.4
  },
  
  // Input base style
  input: {
    borderColor: '#E2E8F0',     // Colors.border
    backgroundColor: '#FFFFFF', // Colors.background
    borderWidth: 1,
    borderRadius: 6,            // BorderRadius.md
    height: 48,                 // h-12 equivalent
    paddingHorizontal: 12,      // Spacing.3
    fontSize: 16,               // Typography.base
    color: '#0F172A',           // Colors.foreground
  },
  
  // Text styles
  heading: {
    fontSize: 24,               // Typography['2xl']
    fontWeight: '700',          // Typography.bold
    color: '#0F172A',           // Colors.foreground
  },
  
  subheading: {
    fontSize: 14,               // Typography.sm
    color: '#475569',           // Colors.mutedForeground
  },
  
  label: {
    fontSize: 14,               // Typography.sm
    fontWeight: '500',          // Typography.medium
    color: '#334155',           // Colors.gray700
    marginBottom: 8,            // Spacing.2
  },
  
  errorText: {
    fontSize: 12,               // Typography.xs
    color: '#EF4444',           // Colors.destructive
    marginTop: 4,               // Spacing.1
  },
};

// Utility functions
export const createStyle = (baseStyle, variant = {}) => ({
  ...baseStyle,
  ...variant,
});

export const withFocus = (style, focusStyle) => ({
  normal: style,
  focused: { ...style, ...focusStyle },
});

export default {
  Colors,
  Typography,
  Spacing,
  BorderRadius,
  Shadows,
  ButtonVariants,
  InputVariants,
  CommonStyles,
  createStyle,
  withFocus,
}; 