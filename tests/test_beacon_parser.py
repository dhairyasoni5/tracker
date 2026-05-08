"""Tests for BeaconParser.js."""
import re, pytest
from helpers import UTILS_DIR, read_file

@pytest.fixture
def src(): return read_file(UTILS_DIR / "BeaconParser.js")

class TestStructure:
    def test_class(self, src): assert "class BeaconParser" in src
    def test_export(self, src): assert re.search(r"export\s+\{.*BeaconParser.*\}", src)
    METHODS = ["parseDevice","parseIBeacon","parseEddystone","parseAltBeacon",
               "parseCustomBeacon","formatUUID","calculateDistance","calculateProximity",
               "validateBeaconData","getBeaconIdentifier","filterBeaconsByType",
               "sortBeaconsBySignalStrength","sortBeaconsByDistance","getStrongestBeacon","getClosestBeacon"]
    @pytest.mark.parametrize("m", METHODS)
    def test_method(self, src, m): assert f"static {m}" in src

class TestIBeacon:
    def test_apple_id(self, src): assert "0x004C" in src
    def test_type(self, src): assert "0x0215" in src
    def test_len(self, src): assert "buffer.length < 25" in src
    def test_major(self, src): assert "readUInt16BE(20)" in src
    def test_minor(self, src): assert "readUInt16BE(22)" in src
    def test_tx(self, src): assert "readInt8(24)" in src
    def test_uuid(self, src): assert "buffer.slice(4, 20)" in src

class TestEddystone:
    def test_svc(self, src): assert "0000FEAA-0000-1000-8000-00805F9B34FB" in src
    def test_uid(self, src): assert "parseEddystoneUID" in src
    def test_url(self, src): assert "parseEddystoneURL" in src
    def test_tlm(self, src): assert "parseEddystoneTLM" in src

class TestAltBeacon:
    def test_id(self, src): assert "0xBEAC" in src
    def test_len(self, src): assert "buffer.length < 28" in src

class TestDist:
    def test_zero(self, src): assert "rssi === 0" in src
    def test_model(self, src):
        assert "0.89976" in src
        assert "7.7095" in src

class TestProximity:
    ZONES = ["immediate","near","far","unknown"]
    @pytest.mark.parametrize("z", ZONES)
    def test_zone(self, src, z): assert f"'{z}'" in src

class TestUUID:
    def test_format(self, src):
        for s in ["(0, 8)","(8, 12)","(12, 16)","(16, 20)","(20, 32)"]:
            assert s in src
    def test_join(self, src): assert "join('-')" in src

class TestVendors:
    def test_estimote(self, src): assert "0x015D" in src
    def test_kontakt(self, src): assert "0x0059" in src
    def test_radius(self, src): assert "0x0118" in src
