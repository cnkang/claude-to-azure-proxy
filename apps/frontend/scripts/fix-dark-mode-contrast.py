#!/usr/bin/env python3
"""
Fix dark mode text contrast issues for WCAG AAA compliance.
This script updates dark:text-gray-700 to dark:text-gray-300 for better contrast on dark backgrounds.
"""

import os
import re
from pathlib import Path

def fix_dark_mode_contrast(file_path):
    """Fix dark mode text contrast in a single file."""
    with open(file_path, 'r', encoding='utf-8') as f:
        content = f.read()
    
    # Replace dark:text-gray-700 with dark:text-gray-300
    # Use word boundary to avoid matching dark:text-gray-7000 etc.
    content = re.sub(r'dark:text-gray-700\b', 'dark:text-gray-300', content)
    
    with open(file_path, 'w', encoding='utf-8') as f:
        f.write(content)

def main():
    """Main function to process all TSX files."""
    src_dir = Path('apps/frontend/src')
    tsx_files = list(src_dir.rglob('*.tsx'))
    
    print(f"Fixing dark mode contrast in {len(tsx_files)} files...")
    
    for file_path in tsx_files:
        fix_dark_mode_contrast(file_path)
    
    print("Dark mode contrast fixes applied!")

if __name__ == '__main__':
    main()
