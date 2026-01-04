"""
Entry point for running campaign_builder as a module.

Usage:
    python -m campaign_builder
"""

from campaign_builder.cli import main_sync

if __name__ == "__main__":
    main_sync()
