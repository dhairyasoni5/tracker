"""Tests for IndoorPositioningEngine.js."""
import re, pytest
from helpers import UTILS_DIR, read_file

@pytest.fixture
def src(): return read_file(UTILS_DIR / "IndoorPositioningEngine.js")

class TestStructure:
    def test_class(self, src): assert "class IndoorPositioningEngine" in src
    def test_export(self, src): assert re.search(r"export\s+\{.*IndoorPositioningEngine.*\}", src)
    def test_kalman(self, src): assert "KalmanFilter" in src
    METHODS = ["calculatePosition","filterValidReadings","getBeaconConfig",
               "calculateTrilateration","calculateWeightedCentroid","calculateClosestBeacon",
               "applyKalmanFilter","estimateVelocity","detectFloorLevel","estimateAccuracy",
               "rssiToDistance","updatePositionHistory","getPositionSmoothness","reset",
               "addFingerprint","calculateFingerprinting"]
    @pytest.mark.parametrize("m", METHODS)
    def test_method(self, src, m): assert m in src

class TestFallback:
    def test_tri_3(self, src): assert "validReadings.length >= 3" in src
    def test_cent_2(self, src): assert "validReadings.length >= 2" in src
    def test_close_1(self, src): assert "validReadings.length >= 1" in src
    def test_labels(self, src):
        for m in ["trilateration","weighted_centroid","closest_beacon"]:
            assert f"'{m}'" in src

class TestTrilateration:
    def test_top3(self, src): assert ".slice(0, 3)" in src
    def test_collinear(self, src): assert "0.0001" in src

class TestFilter:
    def test_rssi(self, src): assert "-100" in src
    def test_dist(self, src): assert "> 50" in src

class TestKalman:
    def test_predict(self, src): assert "kalmanFilter.predict" in src
    def test_update(self, src): assert "kalmanFilter.update" in src

class TestFloor:
    def test_votes(self, src): assert "floorCounts" in src
    def test_default(self, src): assert "detectedFloor = 1" in src

class TestFingerprint:
    def test_db(self, src): assert "fingerprintDatabase" in src
    def test_compare(self, src): assert "compareSignalFingerprints" in src
