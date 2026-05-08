"""Tests for KalmanFilter.js."""
import re, pytest
from helpers import UTILS_DIR, read_file

@pytest.fixture
def src(): return read_file(UTILS_DIR / "KalmanFilter.js")

class TestStructure:
    def test_class(self, src): assert "class KalmanFilter" in src
    def test_export(self, src): assert re.search(r"export\s+\{.*KalmanFilter.*\}", src)
    METHODS = ["initialize","predict","update","getState","reset","matrixMultiply",
               "matrixVectorMultiply","matrixAdd","matrixSubtract","transpose",
               "identityMatrix","matrixInvert2x2","setProcessNoise","setMeasurementNoise"]
    @pytest.mark.parametrize("m", METHODS)
    def test_method(self, src, m): assert m in src

class TestState:
    def test_4d(self, src): assert "[0, 0, 0, 0]" in src
    def test_cov(self, src): assert "1000" in src

class TestPredict:
    def test_F(self, src): assert "[1, 0, dt, 0]" in src
    def test_B(self, src): assert "0.5 * dt * dt" in src

class TestUpdate:
    def test_H(self, src): assert "[1, 0, 0, 0]" in src
    def test_innovation(self, src): assert "innovation" in src

class TestMatrix:
    def test_singular(self, src): assert "1e-10" in src
    def test_identity(self, src): assert "result[i][i] = 1" in src

class TestReset:
    def test_flag(self, src): assert "this.initialized = false" in src
