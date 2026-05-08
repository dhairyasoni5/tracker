"""
Shared helpers and path constants for the tracker test suite.
"""
import os
import sys
import json
import pathlib

# ── Repo root ──────────────────────────────────────────────────────────────
ROOT_DIR = pathlib.Path(__file__).resolve().parent.parent

SRC_DIR = ROOT_DIR / "src"
UTILS_DIR = SRC_DIR / "utils"
SERVICES_DIR = SRC_DIR / "services"
SCREENS_DIR = SRC_DIR / "screens"
COMPONENTS_DIR = SRC_DIR / "components"
CONFIG_DIR = SRC_DIR / "config"
CONTEXT_DIR = SRC_DIR / "context"
NAVIGATION_DIR = SRC_DIR / "navigation"
FIREBASE_DIR = SRC_DIR / "firebase"


def read_file(path: pathlib.Path) -> str:
    """Read a file and return its contents as a string."""
    return path.read_text(encoding="utf-8", errors="replace")


def read_json(path: pathlib.Path) -> dict:
    """Read and parse a JSON file."""
    return json.loads(path.read_text(encoding="utf-8"))


def collect_js_files(directory: pathlib.Path) -> list:
    """Recursively collect all .js files under a directory."""
    if not directory.exists():
        return []
    return sorted(directory.rglob("*.js"))
