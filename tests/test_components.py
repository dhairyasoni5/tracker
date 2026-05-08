"""Tests for component files."""
import pytest
from helpers import COMPONENTS_DIR, read_file

class TestErrorBoundary:
    @pytest.fixture
    def src(self): return read_file(COMPONENTS_DIR / "ErrorBoundary.js")
    def test_class(self, src): assert "class ErrorBoundary" in src
    def test_catch(self, src): assert "getDerivedStateFromError" in src
    def test_did_catch(self, src): assert "componentDidCatch" in src
    def test_fallback(self, src): assert "hasError" in src
    def test_export(self, src): assert "export default" in src

class TestSVGFloorPlan:
    @pytest.fixture
    def src(self): return read_file(COMPONENTS_DIR / "SVGFloorPlan.js")
    def test_svg(self, src): assert "Svg" in src or "svg" in src
    def test_beacons(self, src): assert "beacon" in src.lower()
    def test_position(self, src): assert "position" in src.lower()

class TestLiveLocationMap:
    @pytest.fixture
    def src(self): return read_file(COMPONENTS_DIR / "LiveLocationMap.js")
    def test_maps(self, src): assert "MapView" in src or "react-native-maps" in src
    def test_marker(self, src): assert "Marker" in src

class TestIndoorMapModal:
    @pytest.fixture
    def src(self): return read_file(COMPONENTS_DIR / "IndoorMapModal.js")
    def test_modal(self, src): assert "Modal" in src
    def test_visible(self, src): assert "visible" in src
