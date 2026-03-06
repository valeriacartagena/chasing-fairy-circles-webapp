import sys
import os

# Make sure backend/ and src/ are importable
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))

from backend.main import app
