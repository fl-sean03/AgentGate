"""
Schemas for Campaign Builder.

This module contains data models for:
    - FileType enumeration and detection
    - FileGuide analysis results
    - Box dimensions for simulation cells
    - Error handling types

Usage:
    from campaign_builder.schemas import (
        FileType, detect_file_type,
        FileGuide, AtomType, PairCoeff,
        BoxDimensions, BoxTilt,
        ErrorCode, ErrorSeverity, CampaignError,
    )
"""

# File type detection
from .file_types import FileType, detect_file_type

# Box dimensions
from .box_dimensions import BoxDimensions, BoxTilt

# File guide and supporting types
from .file_guide import (
    AtomType,
    PairCoeff,
    BondCoeff,
    AngleCoeff,
    DihedralCoeff,
    Species,
    CriticalSection,
    FileGuide,
)

# Error handling
from .errors import (
    ErrorCode,
    ErrorSeverity,
    CampaignError,
    ErrorHandler,
    get_recovery_suggestion,
)


__all__ = [
    # File types
    "FileType",
    "detect_file_type",
    # Box dimensions
    "BoxDimensions",
    "BoxTilt",
    # File guide types
    "AtomType",
    "PairCoeff",
    "BondCoeff",
    "AngleCoeff",
    "DihedralCoeff",
    "Species",
    "CriticalSection",
    "FileGuide",
    # Error types
    "ErrorCode",
    "ErrorSeverity",
    "CampaignError",
    "ErrorHandler",
    "get_recovery_suggestion",
]
