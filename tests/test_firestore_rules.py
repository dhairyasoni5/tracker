"""Tests for Firestore security rules."""
import pytest
from helpers import ROOT_DIR, read_file

@pytest.fixture
def rules(): return read_file(ROOT_DIR / "firestore.rules")

class TestVersion:
    def test_v2(self, rules): assert "rules_version = '2'" in rules

class TestUsers:
    def test_match(self, rules): assert "match /users/{userId}" in rules
    def test_self(self, rules): assert "request.auth.uid == userId" in rules
    def test_admin(self, rules): assert "role == 'admin'" in rules
    def test_supervisor(self, rules): assert "role == 'supervisor'" in rules

class TestVisits:
    def test_match(self, rules): assert "match /visits/{visitId}" in rules
    def test_create(self, rules): assert "allow create" in rules
    def test_attendance(self, rules): assert "attendance" in rules
    def test_assigned(self, rules): assert "assignedStudents" in rules
    def test_code(self, rules): assert "visitCode" in rules

class TestLocations:
    def test_match(self, rules): assert "match /locations/{locationId}" in rules

class TestFieldSecurity:
    def test_affected_keys(self, rules): assert "affectedKeys" in rules
    def test_has_only(self, rules): assert "hasOnly" in rules
