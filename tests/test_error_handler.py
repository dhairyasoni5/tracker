"""Tests for ErrorHandler.js."""
import pytest
from helpers import UTILS_DIR, read_file

@pytest.fixture
def src(): return read_file(UTILS_DIR / "ErrorHandler.js")

class TestExports:
    EXPORTS = ["ERROR_TYPES","ERROR_SEVERITY","FIREBASE_ERROR_MESSAGES","NETWORK_ERROR_MESSAGES","ErrorHandler"]
    @pytest.mark.parametrize("e", EXPORTS)
    def test_export(self, src, e): assert e in src

class TestTypes:
    TYPES = ["NETWORK","AUTH","FIREBASE","VALIDATION","PERMISSION","UNKNOWN"]
    @pytest.mark.parametrize("t", TYPES)
    def test_type(self, src, t): assert f"'{t}'" in src

class TestSeverity:
    LEVELS = ["LOW","MEDIUM","HIGH","CRITICAL"]
    @pytest.mark.parametrize("l", LEVELS)
    def test_level(self, src, l): assert f"'{l}'" in src

class TestFirebaseErrors:
    AUTH = ["auth/user-not-found","auth/wrong-password","auth/invalid-email",
            "auth/email-already-in-use","auth/weak-password","auth/too-many-requests"]
    @pytest.mark.parametrize("c", AUTH)
    def test_auth(self, src, c): assert c in src
    FS = ["firestore/permission-denied","firestore/not-found","firestore/unavailable","firestore/unauthenticated"]
    @pytest.mark.parametrize("c", FS)
    def test_fs(self, src, c): assert c in src

class TestCategorize:
    def test_method(self, src): assert "categorizeError" in src
    def test_auth(self, src): assert "auth/" in src
    def test_fs(self, src): assert "firestore/" in src

class TestFriendly:
    def test_method(self, src): assert "getUserFriendlyMessage" in src
    def test_fallback(self, src): assert "Something went wrong" in src

class TestLogs:
    def test_max(self, src): assert "maxLogs" in src
    def test_clear(self, src): assert "clearLogs" in src
    def test_get(self, src): assert "getErrorLogs" in src
