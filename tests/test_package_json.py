"""Tests for package.json — deps, scripts, metadata."""
import re, pytest
from helpers import ROOT_DIR, read_json

@pytest.fixture
def pkg(): return read_json(ROOT_DIR / "package.json")

CORE_DEPS = ["expo","react","react-native","firebase","@react-navigation/native",
             "@react-navigation/stack","react-native-ble-plx","react-native-maps",
             "react-native-svg","expo-location","@react-native-async-storage/async-storage"]

class TestDepsPresent:
    @pytest.mark.parametrize("dep", CORE_DEPS)
    def test_dep(self, pkg, dep):
        all_d = {**pkg.get("dependencies",{}), **pkg.get("devDependencies",{})}
        assert dep in all_d, f"Missing: {dep}"

class TestVersions:
    def test_react_18(self, pkg): assert pkg["dependencies"]["react"].startswith("18")
    def test_rn_073(self, pkg): assert "0.73" in pkg["dependencies"]["react-native"]
    def test_expo_50(self, pkg): assert "50" in pkg["dependencies"]["expo"]
    def test_firebase_v10(self, pkg): assert pkg["dependencies"]["firebase"].startswith("^10")
    def test_no_wildcard(self, pkg):
        for n,v in {**pkg.get("dependencies",{}),**pkg.get("devDependencies",{})}.items():
            assert v not in ("*","latest"), f"{n} uses {v}"

class TestScripts:
    def test_start(self, pkg): assert "start" in pkg.get("scripts",{})
    def test_android(self, pkg): assert "android" in pkg.get("scripts",{})
    def test_expo_start(self, pkg): assert "expo" in pkg["scripts"].get("start","")

class TestMeta:
    def test_name(self, pkg): assert pkg.get("name")
    def test_semver(self, pkg): assert re.match(r"^\d+\.\d+\.\d+", pkg.get("version",""))
    def test_private(self, pkg): assert pkg.get("private") is True

class TestNoDupes:
    def test_no_overlap(self, pkg):
        d = set(pkg.get("dependencies",{}).keys())
        dd = set(pkg.get("devDependencies",{}).keys())
        assert not (d & dd)
