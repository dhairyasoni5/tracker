"""Tests for DesignSystem.js."""
import re, pytest
from helpers import UTILS_DIR, read_file

@pytest.fixture
def src(): return read_file(UTILS_DIR / "DesignSystem.js")

class TestColors:
    COLORS = ["primary","background","foreground","destructive","success","warning","border","muted"]
    @pytest.mark.parametrize("c", COLORS)
    def test_color(self, src, c): assert c in src
    def test_hex(self, src): assert len(re.findall(r"#[0-9A-Fa-f]{6}", src)) > 10
    def test_gray(self, src):
        for g in ["gray50","gray100","gray500","gray900"]: assert g in src

class TestTypography:
    def test_sizes(self, src):
        for s in ["xs","sm","base","lg","xl"]: assert s in src
    def test_weights(self, src):
        for w in ["normal","medium","semibold","bold"]: assert w in src

class TestSpacing:
    def test_scale(self, src): assert "Spacing" in src

class TestRadius:
    def test_tokens(self, src): assert "BorderRadius" in src

class TestShadows:
    def test_obj(self, src): assert "Shadows" in src
    def test_platform(self, src): assert "Platform.select" in src

class TestVariants:
    BVARS = ["default","secondary","outline","ghost"]
    @pytest.mark.parametrize("v", BVARS)
    def test_btn(self, src, v): assert v in src
    def test_input(self, src): assert "InputVariants" in src

class TestCommon:
    STYLES = ["card","button","input","heading","subheading","label","errorText"]
    @pytest.mark.parametrize("s", STYLES)
    def test_style(self, src, s): assert s in src

class TestUtils:
    def test_create(self, src): assert "createStyle" in src
    def test_focus(self, src): assert "withFocus" in src
    def test_default(self, src): assert "export default" in src
