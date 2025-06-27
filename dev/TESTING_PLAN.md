# 🧪 **INDOOR TRACKING SYSTEM - TESTING PLAN**

## 🎯 **CURRENT STATUS**
- ✅ **Complete indoor tracking system implemented**
- ✅ **All files properly organized and integrated**
- ✅ **Navigation and UI ready**
- ❌ **Not yet tested with real beacons**
- ❌ **Floor plan not integrated**
- ❌ **Beacon configuration not customized**

## 🚀 **PHASE 1: BLE SCANNING TESTING (PRIORITY #1)**

### **Goal**: Verify that the app can detect and scan your actual BLE beacons

### **Step 1: Basic BLE Scanning Test**
1. **Launch the app** and navigate to User Tracker
2. **Tap "BLE Debug"** button in Quick Actions
3. **Start BLE scanning** using the debug interface
4. **Verify beacon detection**:
   - Check if your HoneyComm HCBB35 beacons are detected
   - Verify RSSI values are being read
   - Confirm beacon parsing is working

### **Step 2: Beacon Configuration Validation**
**Current Configuration** (needs to be updated with your actual beacons):
```javascript
// In src/config/beaconConfig.js
const TARGET_UUID = 'FDA50693-A4E2-4FB1-AFCF-C6EB07647825';
const TARGET_MAJOR = 10835;
const TARGET_BEACON_MACS = [
  'F0:03:2A:53:00:CE', // Cafeteria
  'F0:03:2A:53:00:D2', // Office
  'F0:03:2A:53:00:C9', // Main Area
];
```

**What to verify**:
- ✅ UUID matches your beacons
- ✅ Major value is correct
- ✅ MAC addresses match your actual beacons
- ✅ Minor values are correctly mapped (206=Cafeteria, 210=Office, 201=Main Area)

### **Step 3: Debug Information Check**
In the BLE Debug screen, verify:
- **Raw beacon data** is displayed
- **Signal strength (RSSI)** values are reasonable (-30 to -90 dBm)
- **Beacon count** increases when moving near beacons
- **Scan statistics** show active scanning
- **No error messages** in the debug log

### **Expected Results**:
- 🔵 **Beacons detected**: Your actual HoneyComm beacons should appear
- 🔵 **RSSI values**: Should change as you move closer/farther from beacons
- 🔵 **Location names**: Should show "Cafeteria", "Office", "Main Area" based on minor values
- 🔵 **No errors**: Clean scanning without permission or connection errors

---

## 🏗️ **PHASE 2: FLOOR PLAN INTEGRATION**

### **Goal**: Integrate your actual floor plan SVG and configure beacon positions

### **Step 1: Prepare Your SVG Floor Plan**
1. **Get your ground floor SVG file**
2. **Ensure it's properly formatted** (viewBox, dimensions, etc.)
3. **Place it in** `src/assets/floor-plans/ground-floor.svg`

### **Step 2: Update Beacon Configuration**
**File to modify**: `src/config/beaconConfig.js`

**Current structure** (needs your actual data):
```javascript
const BEACON_CONFIG = {
  buildings: {
    'building-1': {
      floors: {
        1: {
          svgPath: '/assets/floor-plans/ground-floor.svg', // Your SVG
          beacons: [
            {
              id: 'beacon-001',
              uuid: 'FDA50693-A4E2-4FB1-AFCF-C6EB07647825',
              major: 10835,
              minor: 206,
              position: { x: 100, y: 150 }, // SVG coordinates - NEEDS UPDATE
              room: 'Cafeteria',
              floor: 1
            },
            // Add more beacons with actual positions
          ],
          rooms: [
            {
              id: 'cafeteria',
              name: 'Cafeteria',
              bounds: { x: 50, y: 100, width: 200, height: 150 } // NEEDS UPDATE
            }
            // Add more rooms based on your floor plan
          ],
          dimensions: { width: 800, height: 600 } // Your SVG dimensions - NEEDS UPDATE
        }
      }
    }
  }
};
```

### **Step 3: Configure Beacon Positions**
**What you need to provide**:
1. **SVG coordinates** for each beacon location
2. **Room boundaries** for each area
3. **Floor plan dimensions** (width, height)
4. **Room names and IDs** matching your building

---

## 🔧 **PHASE 3: POSITIONING TESTING**

### **Goal**: Test indoor positioning accuracy with your configured setup

### **Step 1: Position Calculation Test**
1. **Navigate to "Indoor Tracking"** screen
2. **Verify user position** appears on SVG map
3. **Test movement** between different rooms
4. **Check room detection** accuracy

### **Step 2: Accuracy Validation**
- **Position accuracy**: Should be within 2-5 meters
- **Room detection**: Should correctly identify current room
- **Real-time updates**: Position should update every 2-3 seconds
- **Smooth movement**: No jumping or erratic positioning

---

## 📋 **TESTING CHECKLIST**

### **BLE Scanning (Phase 1)**
- [ ] **App launches** without errors
- [ ] **BLE Debug screen** loads properly
- [ ] **Scanning starts** when button pressed
- [ ] **Beacons detected** (your actual HoneyComm beacons)
- [ ] **RSSI values** are reasonable (-30 to -90 dBm)
- [ ] **Location names** display correctly (Cafeteria, Office, Main Area)
- [ ] **No permission errors** or connection issues
- [ ] **Scan statistics** show active scanning

### **Floor Plan Integration (Phase 2)**
- [ ] **SVG file** placed in correct location
- [ ] **Beacon positions** updated with actual coordinates
- [ ] **Room boundaries** configured correctly
- [ ] **Floor plan dimensions** set properly
- [ ] **SVG renders** without errors
- [ ] **Beacon markers** appear in correct positions

### **Positioning Testing (Phase 3)**
- [ ] **User position** displays on SVG map
- [ ] **Position updates** in real-time
- [ ] **Room detection** works accurately
- [ ] **Movement tracking** is smooth
- [ ] **Accuracy indicators** show reasonable values

---

## 🚨 **TROUBLESHOOTING GUIDE**

### **BLE Scanning Issues**
**Problem**: No beacons detected
**Solutions**:
- Check Bluetooth permissions
- Verify beacon UUID/Major values
- Ensure beacons are powered on
- Check if beacons are in range

**Problem**: Permission errors
**Solutions**:
- Grant location and Bluetooth permissions
- Restart app after permission changes
- Check Android/iOS specific requirements

### **Floor Plan Issues**
**Problem**: SVG doesn't render
**Solutions**:
- Verify SVG file format
- Check file path in configuration
- Ensure metro config supports SVG

**Problem**: Beacon positions wrong
**Solutions**:
- Update coordinates in beaconConfig.js
- Verify SVG coordinate system
- Check room boundary definitions

---

## 🎯 **IMMEDIATE NEXT STEPS**

### **For Testing BLE Scanning (Do This First)**:
1. **Launch app** and go to BLE Debug screen
2. **Start scanning** and verify beacon detection
3. **Check debug information** for any errors
4. **Report results** - which beacons are detected, RSSI values, etc.

### **For Floor Plan Integration (After BLE Works)**:
1. **Provide your SVG floor plan** file
2. **Give beacon positions** in your building
3. **Specify room boundaries** and names
4. **Update configuration** with real data

---

## 📞 **SUPPORT NEEDED**

**Please provide**:
1. **BLE scanning test results** - what beacons are detected, RSSI values, any errors
2. **Your actual beacon configuration** - UUID, Major, Minor values, MAC addresses
3. **Floor plan SVG file** and building layout information
4. **Beacon placement details** - where each beacon is located in your building

**The system is ready - we just need your real-world data to make it work with your specific setup!** 