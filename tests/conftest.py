"""
Pytest conftest — auto-adds the tests/ directory to sys.path so that
helpers.py is importable from all test files.
"""
import sys
import pathlib

# Add tests/ dir to sys.path so `import helpers` works everywhere
sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent))
