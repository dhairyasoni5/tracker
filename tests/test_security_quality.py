"""Security and code quality tests."""
import re, pytest
from helpers import SRC_DIR, collect_js_files, read_file

@pytest.fixture
def all_src():
    return [(f, read_file(f)) for f in collect_js_files(SRC_DIR)]

SECRET_PATTERNS = [
    (r"sk_live_[a-zA-Z0-9]{20,}", "Stripe live key"),
    (r"ghp_[a-zA-Z0-9]{36}", "GitHub PAT"),
    (r"-----BEGIN (RSA |EC )?PRIVATE KEY-----", "PEM private key"),
]

class TestNoSecrets:
    @pytest.mark.parametrize("pattern,desc", SECRET_PATTERNS)
    def test_no_secret(self, all_src, pattern, desc):
        for fp, content in all_src:
            assert not re.findall(pattern, content), f"{desc} in {fp.name}"

class TestImports:
    def test_no_require(self, all_src):
        for fp, content in all_src:
            if "utils" not in str(fp.parent): continue
            assert not re.findall(r"\brequire\(", content), f"{fp.name} uses require"

class TestErrorHandling:
    def test_screens_catch(self, all_src):
        for fp, content in all_src:
            if "Screen" not in fp.name and "Dashboard" not in fp.name: continue
            if fp.name in ["IndoorTrackingScreen.js", "WebDebugScreen.js"]: continue
            assert "catch" in content, f"{fp.name} missing catch"

class TestFileSizes:
    def test_under_100kb(self, all_src):
        for fp, content in all_src:
            assert len(content.encode()) < 102400, f"{fp.name} > 100KB"
