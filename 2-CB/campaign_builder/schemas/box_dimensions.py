"""
Box dimensions dataclass for simulation cells.

This module provides:
    - BoxDimensions: Dataclass for simulation box geometry
    - BoxTilt: Dataclass for triclinic box tilt factors
"""

from dataclasses import dataclass, field
from typing import Any, Dict, Optional


@dataclass
class BoxTilt:
    """Tilt factors for triclinic simulation boxes.

    Attributes:
        xy: XY tilt factor (skew in XY plane)
        xz: XZ tilt factor (skew in XZ plane)
        yz: YZ tilt factor (skew in YZ plane)
    """

    xy: float = 0.0
    xz: float = 0.0
    yz: float = 0.0

    def to_dict(self) -> Dict[str, float]:
        """Convert to dictionary representation."""
        return {
            "xy": self.xy,
            "xz": self.xz,
            "yz": self.yz,
        }

    @classmethod
    def from_dict(cls, data: Dict[str, Any]) -> "BoxTilt":
        """Create BoxTilt from dictionary."""
        return cls(
            xy=float(data.get("xy", 0.0)),
            xz=float(data.get("xz", 0.0)),
            yz=float(data.get("yz", 0.0)),
        )


@dataclass
class BoxDimensions:
    """Simulation box dimensions.

    Stores the bounds of an orthogonal or triclinic simulation box
    and computes derived properties like lengths and volume.

    Attributes:
        xlo: X lower bound
        xhi: X upper bound
        ylo: Y lower bound
        yhi: Y upper bound
        zlo: Z lower bound
        zhi: Z upper bound
        xy: XY tilt factor (optional, for triclinic boxes)
        xz: XZ tilt factor (optional, for triclinic boxes)
        yz: YZ tilt factor (optional, for triclinic boxes)
    """

    xlo: float
    xhi: float
    ylo: float
    yhi: float
    zlo: float
    zhi: float
    xy: Optional[float] = None
    xz: Optional[float] = None
    yz: Optional[float] = None

    # Computed properties (set in __post_init__)
    _lx: float = field(init=False, repr=False, default=0.0)
    _ly: float = field(init=False, repr=False, default=0.0)
    _lz: float = field(init=False, repr=False, default=0.0)
    _volume: float = field(init=False, repr=False, default=0.0)

    def __post_init__(self) -> None:
        """Compute derived properties after initialization."""
        # Validate bounds
        if self.xhi <= self.xlo:
            raise ValueError(f"xhi ({self.xhi}) must be greater than xlo ({self.xlo})")
        if self.yhi <= self.ylo:
            raise ValueError(f"yhi ({self.yhi}) must be greater than ylo ({self.ylo})")
        if self.zhi <= self.zlo:
            raise ValueError(f"zhi ({self.zhi}) must be greater than zlo ({self.zlo})")

        # Compute lengths
        self._lx = self.xhi - self.xlo
        self._ly = self.yhi - self.ylo
        self._lz = self.zhi - self.zlo

        # Compute volume
        # For triclinic box, this is an approximation (orthogonal equivalent)
        self._volume = self._lx * self._ly * self._lz

    @property
    def lx(self) -> float:
        """X dimension length."""
        return self._lx

    @property
    def ly(self) -> float:
        """Y dimension length."""
        return self._ly

    @property
    def lz(self) -> float:
        """Z dimension length."""
        return self._lz

    @property
    def volume(self) -> float:
        """Box volume (approximate for triclinic boxes)."""
        return self._volume

    @property
    def is_triclinic(self) -> bool:
        """Return True if this is a triclinic (tilted) box."""
        return any(
            tilt is not None and abs(tilt) > 1e-10
            for tilt in (self.xy, self.xz, self.yz)
        )

    def get_tilt(self) -> Optional[BoxTilt]:
        """Return BoxTilt object if triclinic, None otherwise."""
        if not self.is_triclinic:
            return None
        return BoxTilt(
            xy=self.xy if self.xy is not None else 0.0,
            xz=self.xz if self.xz is not None else 0.0,
            yz=self.yz if self.yz is not None else 0.0,
        )

    def to_dict(self) -> Dict[str, Any]:
        """Convert to dictionary representation.

        Only includes non-None values for optional fields.
        """
        result = {
            "xlo": self.xlo,
            "xhi": self.xhi,
            "ylo": self.ylo,
            "yhi": self.yhi,
            "zlo": self.zlo,
            "zhi": self.zhi,
            "lx": self.lx,
            "ly": self.ly,
            "lz": self.lz,
            "volume": self.volume,
        }

        # Include tilt factors only if present
        if self.xy is not None:
            result["xy"] = self.xy
        if self.xz is not None:
            result["xz"] = self.xz
        if self.yz is not None:
            result["yz"] = self.yz

        return result

    @classmethod
    def from_dict(cls, data: Dict[str, Any]) -> "BoxDimensions":
        """Create BoxDimensions from dictionary.

        Args:
            data: Dictionary with box dimension data

        Returns:
            New BoxDimensions instance
        """
        return cls(
            xlo=float(data["xlo"]),
            xhi=float(data["xhi"]),
            ylo=float(data["ylo"]),
            yhi=float(data["yhi"]),
            zlo=float(data["zlo"]),
            zhi=float(data["zhi"]),
            xy=float(data["xy"]) if "xy" in data else None,
            xz=float(data["xz"]) if "xz" in data else None,
            yz=float(data["yz"]) if "yz" in data else None,
        )

    def __str__(self) -> str:
        """Return human-readable string representation."""
        triclinic_info = " (triclinic)" if self.is_triclinic else ""
        return (
            f"BoxDimensions{triclinic_info}: "
            f"[{self.xlo:.3f}, {self.xhi:.3f}] x "
            f"[{self.ylo:.3f}, {self.yhi:.3f}] x "
            f"[{self.zlo:.3f}, {self.zhi:.3f}], "
            f"V={self.volume:.3f}"
        )


__all__ = [
    "BoxDimensions",
    "BoxTilt",
]
