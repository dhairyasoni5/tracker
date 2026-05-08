"""Tests for screen files."""
import re, pytest
from helpers import SCREENS_DIR, read_file, collect_js_files

SCREEN_FILES = collect_js_files(SCREENS_DIR)

@pytest.fixture(params=SCREEN_FILES, ids=lambda f: f.name)
def screen(request):
    return (request.param.name, read_file(request.param))

class TestReactImports:
    def test_react(self, screen):
        n, s = screen
        assert "from 'react'" in s or "import React" in s

class TestExport:
    def test_has_export(self, screen):
        n, s = screen
        assert "export default" in s or "export function" in s or "export const" in s

class TestStyles:
    def test_styles(self, screen):
        n, s = screen
        assert "StyleSheet.create" in s or "styles" in s

class TestErrors:
    def test_catch(self, screen):
        n, s = screen
        if n in ["IndoorTrackingScreen.js"]: pytest.skip()
        assert "catch" in s

class TestLogin:
    @pytest.fixture
    def src(self): return read_file(SCREENS_DIR / "LoginScreen.js")
    def test_email(self, src): assert "email" in src.lower()
    def test_password(self, src): assert "password" in src.lower()
    def test_auth(self, src): assert "signInWithEmailAndPassword" in src
    def test_register_nav(self, src): assert "Register" in src

class TestRegister:
    @pytest.fixture
    def src(self): return read_file(SCREENS_DIR / "RegisterScreen.js")
    def test_email(self, src): assert "email" in src.lower()
    def test_create(self, src): assert "createUserWithEmailAndPassword" in src
    def test_doc(self, src): assert "setDoc" in src or "addDoc" in src

class TestAdmin:
    @pytest.fixture
    def src(self): return read_file(SCREENS_DIR / "AdminDashboard.js")
    def test_users(self, src): assert "users" in src.lower()
    def test_query(self, src): assert "getDocs" in src or "collection" in src

class TestSupervisor:
    @pytest.fixture
    def src(self): return read_file(SCREENS_DIR / "SupervisorDashboard.js")
    def test_visits(self, src): assert "visit" in src.lower()
    def test_students(self, src): assert "student" in src.lower()
    def test_attendance(self, src): assert "attendance" in src.lower()
