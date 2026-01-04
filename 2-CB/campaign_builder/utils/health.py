"""
Health Check and Diagnostics Module.

Provides system health checks and diagnostics for Campaign Builder.

Health Checks:
    - API key availability
    - Provider connectivity
    - LAMMPS/QE engine availability
    - Python dependencies
    - File system access
"""

import asyncio
import os
import shutil
import subprocess
import tempfile
from dataclasses import dataclass, field
from enum import Enum
from pathlib import Path
from typing import Any, Dict, List, Optional


class HealthStatus(Enum):
    """Health check status levels."""

    HEALTHY = "healthy"
    DEGRADED = "degraded"
    UNHEALTHY = "unhealthy"
    UNKNOWN = "unknown"


@dataclass
class HealthCheckResult:
    """Result of a single health check.

    Attributes:
        name: Name of the health check
        status: Health status
        message: Human-readable message
        details: Additional details
        duration_ms: Time taken for the check in milliseconds
    """

    name: str
    status: HealthStatus
    message: str
    details: Dict[str, Any] = field(default_factory=dict)
    duration_ms: float = 0.0

    def to_dict(self) -> Dict[str, Any]:
        """Convert to dictionary."""
        return {
            "name": self.name,
            "status": self.status.value,
            "message": self.message,
            "details": self.details,
            "duration_ms": self.duration_ms,
        }


@dataclass
class SystemHealth:
    """Overall system health report.

    Attributes:
        overall_status: Overall health status
        checks: Individual health check results
        timestamp: When the health check was performed
    """

    overall_status: HealthStatus
    checks: List[HealthCheckResult]
    timestamp: str

    def to_dict(self) -> Dict[str, Any]:
        """Convert to dictionary."""
        return {
            "overall_status": self.overall_status.value,
            "checks": [c.to_dict() for c in self.checks],
            "timestamp": self.timestamp,
        }


def check_api_key() -> HealthCheckResult:
    """Check if Anthropic API key is configured."""
    import time
    start = time.time()

    key = os.environ.get("ANTHROPIC_API_KEY", "")

    if not key:
        return HealthCheckResult(
            name="api_key",
            status=HealthStatus.UNHEALTHY,
            message="ANTHROPIC_API_KEY not set",
            details={"configured": False},
            duration_ms=(time.time() - start) * 1000,
        )

    if key.startswith("sk-ant-"):
        return HealthCheckResult(
            name="api_key",
            status=HealthStatus.HEALTHY,
            message="API key configured",
            details={"configured": True, "prefix": "sk-ant-***"},
            duration_ms=(time.time() - start) * 1000,
        )

    return HealthCheckResult(
        name="api_key",
        status=HealthStatus.DEGRADED,
        message="API key set but may be invalid format",
        details={"configured": True},
        duration_ms=(time.time() - start) * 1000,
    )


async def check_provider_connectivity() -> HealthCheckResult:
    """Check if we can connect to the LLM provider."""
    import time
    start = time.time()

    try:
        from campaign_builder.agent.factory import get_best_available_provider

        provider = get_best_available_provider()
        provider_name = provider.get_provider_name()

        # Quick test query
        response = await provider.run(
            prompt="Say 'OK' and nothing else.",
            system_prompt="Respond with exactly 'OK'",
            tools=[],
        )

        if "ok" in response.content.lower():
            return HealthCheckResult(
                name="provider",
                status=HealthStatus.HEALTHY,
                message=f"Provider {provider_name} is responsive",
                details={"provider": provider_name, "response": "OK"},
                duration_ms=(time.time() - start) * 1000,
            )
        else:
            return HealthCheckResult(
                name="provider",
                status=HealthStatus.DEGRADED,
                message=f"Provider {provider_name} responded unexpectedly",
                details={"provider": provider_name},
                duration_ms=(time.time() - start) * 1000,
            )

    except Exception as e:
        return HealthCheckResult(
            name="provider",
            status=HealthStatus.UNHEALTHY,
            message=f"Provider connection failed: {str(e)[:100]}",
            details={"error": str(e)},
            duration_ms=(time.time() - start) * 1000,
        )


def check_lammps() -> HealthCheckResult:
    """Check if LAMMPS is available."""
    import time
    start = time.time()

    # Check common LAMMPS paths
    lammps_paths = [
        Path("/home/sf2/Workspace/main/39-GPUTests/1-GPUTests/md-lammps/install/bin/lmp"),
        Path(shutil.which("lmp") or "/usr/bin/lmp"),
        Path(shutil.which("lammps") or "/usr/bin/lammps"),
    ]

    for lmp_path in lammps_paths:
        if lmp_path.exists() and os.access(lmp_path, os.X_OK):
            try:
                result = subprocess.run(
                    [str(lmp_path), "-h"],
                    capture_output=True,
                    text=True,
                    timeout=5,
                )
                # Extract version from output
                version = "unknown"
                for line in result.stdout.split("\n")[:2]:
                    if "LAMMPS" in line:
                        version = line.strip()
                        break

                return HealthCheckResult(
                    name="lammps",
                    status=HealthStatus.HEALTHY,
                    message=f"LAMMPS available at {lmp_path}",
                    details={"path": str(lmp_path), "version": version},
                    duration_ms=(time.time() - start) * 1000,
                )
            except Exception as e:
                continue

    return HealthCheckResult(
        name="lammps",
        status=HealthStatus.DEGRADED,
        message="LAMMPS not found (L2 validation will be skipped)",
        details={"searched_paths": [str(p) for p in lammps_paths]},
        duration_ms=(time.time() - start) * 1000,
    )


def check_quantum_espresso() -> HealthCheckResult:
    """Check if Quantum ESPRESSO is available."""
    import time
    start = time.time()

    # Check common QE paths
    qe_paths = [
        Path("/home/sf2/Workspace/main/39-GPUTests/1-GPUTests/dft-qe/build-cpu/bin/pw.x"),
        Path("/home/sf2/Workspace/main/39-GPUTests/1-GPUTests/dft-qe/build-gpu/bin/pw.x"),
        Path(shutil.which("pw.x") or "/usr/bin/pw.x"),
    ]

    for qe_path in qe_paths:
        if qe_path.exists() and os.access(qe_path, os.X_OK):
            try:
                result = subprocess.run(
                    [str(qe_path), "--version"],
                    capture_output=True,
                    text=True,
                    timeout=5,
                )
                version = result.stdout.strip() or result.stderr.strip()[:100]

                return HealthCheckResult(
                    name="quantum_espresso",
                    status=HealthStatus.HEALTHY,
                    message=f"Quantum ESPRESSO available at {qe_path}",
                    details={"path": str(qe_path), "version": version[:100]},
                    duration_ms=(time.time() - start) * 1000,
                )
            except Exception:
                continue

    return HealthCheckResult(
        name="quantum_espresso",
        status=HealthStatus.DEGRADED,
        message="Quantum ESPRESSO not found (L2 validation will be skipped for QE files)",
        details={"searched_paths": [str(p) for p in qe_paths]},
        duration_ms=(time.time() - start) * 1000,
    )


def check_python_dependencies() -> HealthCheckResult:
    """Check required Python dependencies."""
    import time
    start = time.time()

    required = {
        "anthropic": "anthropic",
        "pydantic": "pydantic",
    }

    optional = {
        "PyMuPDF": "fitz",
        "openpyxl": "openpyxl",
    }

    missing_required = []
    missing_optional = []
    versions = {}

    for name, module_name in required.items():
        try:
            module = __import__(module_name)
            versions[name] = getattr(module, "__version__", "unknown")
        except ImportError:
            missing_required.append(name)

    for name, module_name in optional.items():
        try:
            module = __import__(module_name)
            versions[name] = getattr(module, "__version__", "unknown")
        except ImportError:
            missing_optional.append(name)

    if missing_required:
        return HealthCheckResult(
            name="python_deps",
            status=HealthStatus.UNHEALTHY,
            message=f"Missing required packages: {', '.join(missing_required)}",
            details={"missing_required": missing_required, "versions": versions},
            duration_ms=(time.time() - start) * 1000,
        )

    if missing_optional:
        return HealthCheckResult(
            name="python_deps",
            status=HealthStatus.DEGRADED,
            message=f"Optional packages not installed: {', '.join(missing_optional)}",
            details={"missing_optional": missing_optional, "versions": versions},
            duration_ms=(time.time() - start) * 1000,
        )

    return HealthCheckResult(
        name="python_deps",
        status=HealthStatus.HEALTHY,
        message="All dependencies available",
        details={"versions": versions},
        duration_ms=(time.time() - start) * 1000,
    )


def check_filesystem() -> HealthCheckResult:
    """Check filesystem access for temp files."""
    import time
    start = time.time()

    try:
        # Test write access to temp directory
        with tempfile.NamedTemporaryFile(mode='w', delete=True) as f:
            f.write("test")
            temp_dir = Path(f.name).parent

        return HealthCheckResult(
            name="filesystem",
            status=HealthStatus.HEALTHY,
            message="Filesystem access OK",
            details={"temp_dir": str(temp_dir)},
            duration_ms=(time.time() - start) * 1000,
        )

    except Exception as e:
        return HealthCheckResult(
            name="filesystem",
            status=HealthStatus.UNHEALTHY,
            message=f"Filesystem access error: {str(e)[:100]}",
            details={"error": str(e)},
            duration_ms=(time.time() - start) * 1000,
        )


async def run_health_checks(include_connectivity: bool = False) -> SystemHealth:
    """Run all health checks and return overall status.

    Args:
        include_connectivity: If True, also check provider connectivity (slower)

    Returns:
        SystemHealth report
    """
    from datetime import datetime

    checks = [
        check_api_key(),
        check_python_dependencies(),
        check_filesystem(),
        check_lammps(),
        check_quantum_espresso(),
    ]

    if include_connectivity:
        connectivity = await check_provider_connectivity()
        checks.insert(1, connectivity)

    # Determine overall status
    statuses = [c.status for c in checks]

    if HealthStatus.UNHEALTHY in statuses:
        overall = HealthStatus.UNHEALTHY
    elif HealthStatus.DEGRADED in statuses:
        overall = HealthStatus.DEGRADED
    else:
        overall = HealthStatus.HEALTHY

    return SystemHealth(
        overall_status=overall,
        checks=checks,
        timestamp=datetime.now().isoformat(),
    )


def print_health_report(health: SystemHealth) -> None:
    """Print a formatted health report."""
    status_symbols = {
        HealthStatus.HEALTHY: "✓",
        HealthStatus.DEGRADED: "⚠",
        HealthStatus.UNHEALTHY: "✗",
        HealthStatus.UNKNOWN: "?",
    }

    print("=" * 50)
    print("Campaign Builder Health Check")
    print("=" * 50)
    print(f"Overall Status: {status_symbols[health.overall_status]} {health.overall_status.value.upper()}")
    print(f"Timestamp: {health.timestamp}")
    print("-" * 50)

    for check in health.checks:
        symbol = status_symbols[check.status]
        print(f"{symbol} {check.name}: {check.message} ({check.duration_ms:.1f}ms)")

    print("=" * 50)


__all__ = [
    "HealthStatus",
    "HealthCheckResult",
    "SystemHealth",
    "check_api_key",
    "check_provider_connectivity",
    "check_lammps",
    "check_quantum_espresso",
    "check_python_dependencies",
    "check_filesystem",
    "run_health_checks",
    "print_health_report",
]
