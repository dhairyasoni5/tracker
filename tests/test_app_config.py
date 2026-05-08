"""Tests for app.json Expo config."""
import pytest
from helpers import ROOT_DIR, read_json

@pytest.fixture
def expo(): return read_json(ROOT_DIR / "app.json").get("expo", {})

class TestMeta:
    def test_name(self, expo): assert expo.get("name")
    def test_slug(self, expo): assert expo.get("slug")
    def test_version(self, expo): assert expo.get("version")

PERMS = ["android.permission.BLUETOOTH","android.permission.BLUETOOTH_ADMIN",
         "android.permission.BLUETOOTH_CONNECT"]

class TestPerms:
    @pytest.mark.parametrize("p", PERMS)
    def test_bt_perm(self, expo, p):
        assert p in expo.get("android",{}).get("permissions",[])

class TestPlugins:
    def test_ble_plx(self, expo):
        flat = []
        for p in expo.get("plugins",[]):
            flat.append(p if isinstance(p,str) else p[0])
        assert "react-native-ble-plx" in flat

class TestWeb:
    def test_metro(self, expo):
        assert expo.get("web",{}).get("bundler") == "metro"

class TestEAS:
    def test_project_id(self, expo):
        eid = expo.get("extra",{}).get("eas",{}).get("projectId","")
        assert len(eid) > 10
