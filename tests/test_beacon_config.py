"""Tests for beaconConfig.js."""
import re, pytest
from helpers import CONFIG_DIR, read_file

@pytest.fixture
def src(): return read_file(CONFIG_DIR / "beaconConfig.js")

class TestConfig:
    def test_obj(self, src): assert "BEACON_CONFIG" in src
    def test_export(self, src): assert re.search(r"export\s+\{.*BEACON_CONFIG.*\}", src)

class TestBuilding:
    def test_b1(self, src): assert "'building-1'" in src
    def test_floor(self, src): assert "Ground Floor" in src

class TestBeacons:
    def test_3_beacons(self, src): assert src.count("minor:") >= 3
    def test_uuid(self, src): assert src.count("uuid:") >= 3
    def test_pos(self, src): assert src.count("position:") >= 3
    def test_room(self, src): assert src.count("roomId:") >= 3
    def test_same_uuid(self, src):
        uuids = set(u.upper() for u in re.findall(r"uuid:\s*'([^']+)'", src))
        assert len(uuids) == 1
    def test_unique_minor(self, src):
        minors = re.findall(r"minor:\s*(\d+)", src)
        assert len(minors) == len(set(minors))

class TestScan:
    def test_interval(self, src): assert "scanInterval" in src
    def test_rssi(self, src): assert "rssiThreshold" in src
    def test_min(self, src): assert "minBeaconsForPositioning" in src

class TestPositioning:
    def test_tri(self, src): assert "trilateration" in src
    def test_fallback(self, src): assert "fallbackMethod" in src
    def test_kalman(self, src): assert "kalmanFilterEnabled" in src

class TestManager:
    METHODS = ["getBeaconsForFloor","getRoomsForFloor","findBeacon","getRoomForBeacon",
               "getFloorPlan","validateBeaconConfig","getActiveBeacons","updateBeaconPosition",
               "getScanSettings","getPositioningSettings"]
    @pytest.mark.parametrize("m", METHODS)
    def test_method(self, src, m): assert m in src

class TestValidation:
    def test_dup(self, src): assert "Duplicate beacon ID" in src
    def test_min3(self, src): assert "fewer than 3" in src
