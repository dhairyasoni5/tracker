"""Tests for project structure — all required files and directories."""
import pytest
from helpers import (ROOT_DIR, SRC_DIR, UTILS_DIR, SERVICES_DIR, SCREENS_DIR,
                     COMPONENTS_DIR, CONFIG_DIR, CONTEXT_DIR, NAVIGATION_DIR,
                     FIREBASE_DIR)

REQUIRED_SRC_DIRS = ["components","config","context","firebase","navigation","screens","services","utils"]

class TestDirectoryStructure:
    @pytest.mark.parametrize("d", REQUIRED_SRC_DIRS)
    def test_src_subdir(self, d):
        assert (SRC_DIR / d).is_dir(), f"Missing src/{d}"

ROOT_FILES = ["App.js","app.json","package.json","package-lock.json",
              "babel.config.js","metro.config.js","firestore.rules","firebase.json"]

class TestRootFiles:
    @pytest.mark.parametrize("f", ROOT_FILES)
    def test_exists(self, f): assert (ROOT_DIR / f).is_file(), f"Missing {f}"
    @pytest.mark.parametrize("f", ROOT_FILES)
    def test_nonempty(self, f):
        p = ROOT_DIR / f
        if p.is_file(): assert p.stat().st_size > 0

UTILS = ["BeaconParser.js","CoordinateMapper.js","KalmanFilter.js","ErrorHandler.js",
         "ErrorCapture.js","PlatformUtils.js","IndoorPositioningEngine.js","DesignSystem.js",
         "PhoneErrorLogger.js","AuthContext.js"]
SCREENS = ["AdminDashboard.js","BleDebugScreen.js","CreateVisitScreen.js",
           "IndoorTrackingScreen.js","LoginScreen.js","RegisterScreen.js",
           "SupervisorDashboard.js","UserTracker.js","VisitDetailScreen.js","VisitListScreen.js"]
COMPS = ["ErrorBoundary.js","IndoorMapModal.js","LiveLocationMap.js","SVGFloorPlan.js",
         "WebCompatibleDatePicker.js"]

class TestUtilFiles:
    @pytest.mark.parametrize("f", UTILS)
    def test_exists(self, f): assert (UTILS_DIR / f).is_file()

class TestScreenFiles:
    @pytest.mark.parametrize("f", SCREENS)
    def test_exists(self, f): assert (SCREENS_DIR / f).is_file()

class TestComponentFiles:
    @pytest.mark.parametrize("f", COMPS)
    def test_exists(self, f): assert (COMPONENTS_DIR / f).is_file()

class TestSingletons:
    def test_ble_service(self): assert (SERVICES_DIR/"BleService.js").is_file()
    def test_beacon_config(self): assert (CONFIG_DIR/"beaconConfig.js").is_file()
    def test_firebase_config(self): assert (FIREBASE_DIR/"firebaseConfig.js").is_file()
    def test_navigator(self): assert (NAVIGATION_DIR/"AppNavigator.js").is_file()
    def test_indoor_ctx(self): assert (CONTEXT_DIR/"IndoorLocationContext.js").is_file()

class TestFileSizes:
    def test_beacon_parser(self): assert (UTILS_DIR/"BeaconParser.js").stat().st_size > 5000
    def test_kalman(self): assert (UTILS_DIR/"KalmanFilter.js").stat().st_size > 3000
    def test_positioning(self): assert (UTILS_DIR/"IndoorPositioningEngine.js").stat().st_size > 8000
    def test_supervisor(self): assert (SCREENS_DIR/"SupervisorDashboard.js").stat().st_size > 30000
