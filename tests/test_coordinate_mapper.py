"""Tests for CoordinateMapper.js."""
import re, pytest
from helpers import UTILS_DIR, read_file

@pytest.fixture
def src(): return read_file(UTILS_DIR / "CoordinateMapper.js")

class TestStructure:
    def test_class(self, src): assert "class CoordinateMapper" in src
    def test_export(self, src): assert re.search(r"export\s+\{.*CoordinateMapper.*\}", src)
    METHODS = ["realWorldToSvg","svgToRealWorld","realDistanceToSvg","svgDistanceToReal",
               "isWithinBounds","isRealPositionWithinBounds","clampToBounds",
               "clampRealToBounds","calculateSvgDistance","calculateRealDistance",
               "getNearbyRooms","getFloorStats","validate"]
    @pytest.mark.parametrize("m", METHODS)
    def test_method(self, src, m): assert m in src

class TestScale:
    def test_scaleX(self, src): assert "this.scaleX" in src
    def test_scaleY(self, src): assert "this.scaleY" in src
    def test_real(self, src): assert "realWidth" in src and "realHeight" in src

class TestFlip:
    def test_y_flip(self, src): assert "originY -" in src

class TestBounds:
    def test_clamp(self, src): assert "Math.max" in src and "Math.min" in src
    def test_edges(self, src): assert ">= 0" in src and "<=" in src

class TestDist:
    def test_euclidean(self, src): assert "Math.sqrt" in src

class TestValidate:
    def test_errors(self, src): assert "errors" in src
    def test_dims(self, src): assert "<= 0" in src
    def test_valid(self, src): assert "isValid" in src
