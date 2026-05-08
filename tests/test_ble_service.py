"""Tests for BleService.js."""
import pytest
from helpers import SERVICES_DIR, read_file

@pytest.fixture
def src(): return read_file(SERVICES_DIR / "BleService.js")

class TestStructure:
    def test_class(self, src): assert "class BleService" in src
    def test_singleton(self, src): assert "new BleService()" in src
    METHODS = ["initialize","requestPermissions","enableBluetooth","startScanning",
               "stopScanning","handleDeviceDiscovered","handleBeaconDetected",
               "getBeacons","getActiveBeacons","getScanStats","clearBeacons",
               "addListener","removeAllListeners","notifyListeners","destroy",
               "isScanning","isServiceInitialized","getBluetoothState"]
    @pytest.mark.parametrize("m", METHODS)
    def test_method(self, src, m): assert m in src

class TestInit:
    def test_guard(self, src): assert "this.isInitialized" in src
    def test_bt_state(self, src): assert "onStateChange" in src

class TestPerms:
    def test_location(self, src): assert "ACCESS_FINE_LOCATION" in src
    def test_bt12(self, src): assert "BLUETOOTH_SCAN" in src and "BLUETOOTH_CONNECT" in src

class TestScan:
    def test_stop_first(self, src): assert "stopScanning" in src
    def test_powered(self, src): assert "'PoweredOn'" in src
    def test_parser(self, src): assert "BeaconParser.parseDevice" in src

class TestActive:
    def test_threshold(self, src): assert "30 * 1000" in src or "30000" in src

class TestListener:
    def test_splice(self, src): assert "splice" in src

class TestCleanup:
    def test_beacons(self, src): assert "this.beacons.clear()" in src
    def test_listeners(self, src): assert "this.listeners.clear()" in src
