"""Tests for Firebase config and context providers."""
import pytest
from helpers import FIREBASE_DIR, CONTEXT_DIR, UTILS_DIR, read_file

class TestFirebaseConfig:
    @pytest.fixture
    def src(self): return read_file(FIREBASE_DIR / "firebaseConfig.js")
    def test_init_app(self, src): assert "initializeApp" in src
    def test_init_auth(self, src): assert "initializeAuth" in src
    def test_firestore(self, src): assert "getFirestore" in src
    def test_platform(self, src): assert "Platform.OS === 'web'" in src
    def test_persistence(self, src): assert "getReactNativePersistence" in src
    def test_export_db(self, src): assert "export const db" in src
    def test_export_app(self, src): assert "export default app" in src
    def test_config_keys(self, src):
        for k in ["apiKey","authDomain","projectId","storageBucket","messagingSenderId","appId"]:
            assert k in src

class TestIndoorContext:
    @pytest.fixture
    def src(self): return read_file(CONTEXT_DIR / "IndoorLocationContext.js")
    def test_ctx(self, src): assert "createContext" in src
    def test_provider(self, src): assert "Provider" in src

class TestAuthContext:
    @pytest.fixture
    def src(self): return read_file(UTILS_DIR / "AuthContext.js")
    def test_ctx(self, src): assert "createContext" in src
    def test_clear_auth(self, src): assert "clearAuthState" in src
    def test_force_clean(self, src): assert "forceCleanStart" in src
    def test_user(self, src): assert "user" in src
