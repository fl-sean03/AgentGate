"""
Error types and error handling for Campaign Builder.

This module provides:
    - ErrorCode: Enumeration of all error codes
    - ErrorSeverity: Error severity levels
    - CampaignError: Structured error information
"""

from dataclasses import dataclass, field
from enum import Enum
from pathlib import Path
from typing import Any, Dict, List, Optional


class ErrorCode(Enum):
    """Enumeration of all Campaign Builder error codes.

    Error code ranges:
        E1xx: File errors
        E2xx: Agent errors
        E3xx: Validation errors
        E4xx: Data errors
    """

    # File errors (E1xx)
    E101_FILE_NOT_FOUND = "E101"
    E102_FILE_TOO_LARGE = "E102"
    E103_FILE_UNREADABLE = "E103"
    E104_FILE_CORRUPTED = "E104"
    E105_FILE_EMPTY = "E105"
    E106_BINARY_UNSUPPORTED = "E106"
    E107_FILE_TYPE_UNKNOWN = "E107"

    # Agent errors (E2xx)
    E201_AGENT_TIMEOUT = "E201"
    E202_AGENT_FAILED = "E202"
    E203_AGENT_INVALID_OUTPUT = "E203"
    E204_AGENT_CONTEXT_OVERFLOW = "E204"
    E205_AGENT_RATE_LIMITED = "E205"

    # Validation errors (E3xx)
    E301_MISSING_REQUIRED_FIELD = "E301"
    E302_INVALID_VALUE = "E302"
    E303_INCONSISTENT_DATA = "E303"
    E304_CONSTRAINT_VIOLATION = "E304"
    E305_SCHEMA_MISMATCH = "E305"

    # Data errors (E4xx)
    E401_PARSE_ERROR = "E401"
    E402_INCOMPATIBLE_FORMATS = "E402"
    E403_MISSING_DEPENDENCIES = "E403"
    E404_CIRCULAR_REFERENCE = "E404"
    E405_DATA_OVERFLOW = "E405"

    @property
    def category(self) -> str:
        """Return the error category based on code range."""
        code_num = int(self.value[1:])
        if 100 <= code_num < 200:
            return "file"
        elif 200 <= code_num < 300:
            return "agent"
        elif 300 <= code_num < 400:
            return "validation"
        elif 400 <= code_num < 500:
            return "data"
        return "unknown"

    @property
    def description(self) -> str:
        """Return a human-readable description of the error code."""
        descriptions = {
            ErrorCode.E101_FILE_NOT_FOUND: "File not found at specified path",
            ErrorCode.E102_FILE_TOO_LARGE: "File exceeds size limits",
            ErrorCode.E103_FILE_UNREADABLE: "File exists but cannot be read",
            ErrorCode.E104_FILE_CORRUPTED: "File appears to be corrupted",
            ErrorCode.E105_FILE_EMPTY: "File is empty",
            ErrorCode.E106_BINARY_UNSUPPORTED: "Binary file type not supported",
            ErrorCode.E107_FILE_TYPE_UNKNOWN: "Unable to determine file type",
            ErrorCode.E201_AGENT_TIMEOUT: "Agent operation timed out",
            ErrorCode.E202_AGENT_FAILED: "Agent encountered an error",
            ErrorCode.E203_AGENT_INVALID_OUTPUT: "Agent produced invalid output",
            ErrorCode.E204_AGENT_CONTEXT_OVERFLOW: "Agent context window exceeded",
            ErrorCode.E205_AGENT_RATE_LIMITED: "Agent rate limit reached",
            ErrorCode.E301_MISSING_REQUIRED_FIELD: "Required field is missing",
            ErrorCode.E302_INVALID_VALUE: "Field contains invalid value",
            ErrorCode.E303_INCONSISTENT_DATA: "Data is internally inconsistent",
            ErrorCode.E304_CONSTRAINT_VIOLATION: "Value violates constraints",
            ErrorCode.E305_SCHEMA_MISMATCH: "Data does not match expected schema",
            ErrorCode.E401_PARSE_ERROR: "Failed to parse file content",
            ErrorCode.E402_INCOMPATIBLE_FORMATS: "File formats are incompatible",
            ErrorCode.E403_MISSING_DEPENDENCIES: "Required dependencies not found",
            ErrorCode.E404_CIRCULAR_REFERENCE: "Circular reference detected",
            ErrorCode.E405_DATA_OVERFLOW: "Data exceeds capacity limits",
        }
        return descriptions.get(self, "Unknown error")


class ErrorSeverity(Enum):
    """Error severity levels.

    Levels:
        INFO: Informational message, no action required
        WARNING: Potential issue, may require attention
        ERROR: Error occurred, operation partially failed
        FATAL: Critical error, operation cannot continue
    """

    INFO = "info"
    WARNING = "warning"
    ERROR = "error"
    FATAL = "fatal"

    @property
    def is_blocking(self) -> bool:
        """Return True if this severity blocks further processing."""
        return self in {ErrorSeverity.ERROR, ErrorSeverity.FATAL}

    @property
    def priority(self) -> int:
        """Return numeric priority (higher = more severe)."""
        priorities = {
            ErrorSeverity.INFO: 0,
            ErrorSeverity.WARNING: 1,
            ErrorSeverity.ERROR: 2,
            ErrorSeverity.FATAL: 3,
        }
        return priorities[self]


@dataclass
class CampaignError:
    """Structured error information for Campaign Builder.

    Attributes:
        code: Error code from ErrorCode enum
        severity: Error severity level
        message: Human-readable error message
        file_path: Path to file where error occurred (if applicable)
        context: Additional context about the error
        suggestion: Suggested fix or workaround
    """

    code: ErrorCode
    severity: ErrorSeverity
    message: str
    file_path: Optional[str] = None
    context: Dict[str, Any] = field(default_factory=dict)
    suggestion: Optional[str] = None

    def __post_init__(self) -> None:
        """Validate error fields."""
        if not self.message:
            raise ValueError("message cannot be empty")

    def to_dict(self) -> Dict[str, Any]:
        """Convert to dictionary for serialization.

        Returns:
            JSON-serializable dictionary
        """
        result = {
            "code": self.code.value,
            "code_name": self.code.name,
            "severity": self.severity.value,
            "message": self.message,
            "category": self.code.category,
        }

        if self.file_path:
            result["file_path"] = self.file_path
        if self.context:
            result["context"] = self.context
        if self.suggestion:
            result["suggestion"] = self.suggestion

        return result

    @classmethod
    def from_dict(cls, data: Dict[str, Any]) -> "CampaignError":
        """Create CampaignError from dictionary.

        Args:
            data: Dictionary with error data

        Returns:
            New CampaignError instance
        """
        # Find ErrorCode by value
        code = None
        for ec in ErrorCode:
            if ec.value == data["code"]:
                code = ec
                break
        if code is None:
            raise ValueError(f"Unknown error code: {data['code']}")

        severity = ErrorSeverity(data["severity"])

        return cls(
            code=code,
            severity=severity,
            message=str(data["message"]),
            file_path=data.get("file_path"),
            context=data.get("context", {}),
            suggestion=data.get("suggestion"),
        )

    def __str__(self) -> str:
        """Return formatted error string."""
        parts = [f"[{self.code.value}] {self.severity.value.upper()}: {self.message}"]
        if self.file_path:
            parts.append(f"  File: {self.file_path}")
        if self.suggestion:
            parts.append(f"  Suggestion: {self.suggestion}")
        return "\n".join(parts)

    @classmethod
    def file_not_found(
        cls,
        file_path: str,
        suggestion: Optional[str] = None,
    ) -> "CampaignError":
        """Create a file not found error.

        Args:
            file_path: Path to the missing file
            suggestion: Optional suggestion for resolution

        Returns:
            CampaignError instance
        """
        return cls(
            code=ErrorCode.E101_FILE_NOT_FOUND,
            severity=ErrorSeverity.ERROR,
            message=f"File not found: {file_path}",
            file_path=file_path,
            suggestion=suggestion or "Check that the file path is correct",
        )

    @classmethod
    def file_unreadable(
        cls,
        file_path: str,
        reason: str = "Permission denied or file locked",
    ) -> "CampaignError":
        """Create a file unreadable error.

        Args:
            file_path: Path to the unreadable file
            reason: Reason the file cannot be read

        Returns:
            CampaignError instance
        """
        return cls(
            code=ErrorCode.E103_FILE_UNREADABLE,
            severity=ErrorSeverity.ERROR,
            message=f"Cannot read file: {reason}",
            file_path=file_path,
            suggestion="Check file permissions and ensure file is not locked",
        )

    @classmethod
    def file_too_large(
        cls,
        file_path: str,
        size_bytes: int,
        max_size_bytes: int,
    ) -> "CampaignError":
        """Create a file too large error.

        Args:
            file_path: Path to the large file
            size_bytes: Actual file size
            max_size_bytes: Maximum allowed size

        Returns:
            CampaignError instance
        """
        size_mb = size_bytes / (1024 * 1024)
        max_mb = max_size_bytes / (1024 * 1024)
        return cls(
            code=ErrorCode.E102_FILE_TOO_LARGE,
            severity=ErrorSeverity.ERROR,
            message=f"File size {size_mb:.1f}MB exceeds limit of {max_mb:.1f}MB",
            file_path=file_path,
            context={"size_bytes": size_bytes, "max_size_bytes": max_size_bytes},
            suggestion="Consider splitting the file or using a subset of data",
        )

    @classmethod
    def file_empty(
        cls,
        file_path: str,
    ) -> "CampaignError":
        """Create a file empty error.

        Args:
            file_path: Path to the empty file

        Returns:
            CampaignError instance
        """
        return cls(
            code=ErrorCode.E105_FILE_EMPTY,
            severity=ErrorSeverity.WARNING,
            message=f"File is empty: {file_path}",
            file_path=file_path,
            suggestion="Check that the file contains data",
        )

    @classmethod
    def binary_unsupported(
        cls,
        file_path: str,
    ) -> "CampaignError":
        """Create a binary unsupported error.

        Args:
            file_path: Path to the binary file

        Returns:
            CampaignError instance
        """
        return cls(
            code=ErrorCode.E106_BINARY_UNSUPPORTED,
            severity=ErrorSeverity.WARNING,
            message=f"Binary file not supported (only PDF/Excel binaries allowed): {file_path}",
            file_path=file_path,
            suggestion="Convert to a supported text format or use PDF/Excel for binary data",
        )

    @classmethod
    def parse_error(
        cls,
        file_path: str,
        line_number: Optional[int] = None,
        details: str = "Failed to parse file content",
    ) -> "CampaignError":
        """Create a parse error.

        Args:
            file_path: Path to the file with parse error
            line_number: Line number where error occurred (if known)
            details: Details about the parse error

        Returns:
            CampaignError instance
        """
        context = {}
        if line_number is not None:
            context["line_number"] = line_number

        return cls(
            code=ErrorCode.E401_PARSE_ERROR,
            severity=ErrorSeverity.ERROR,
            message=details,
            file_path=file_path,
            context=context,
            suggestion="Check file format and ensure it matches expected structure",
        )

    @classmethod
    def validation_error(
        cls,
        field_name: str,
        expected: str,
        actual: str,
        file_path: Optional[str] = None,
    ) -> "CampaignError":
        """Create a validation error.

        Args:
            field_name: Name of the field with invalid value
            expected: Description of expected value
            actual: Actual value received
            file_path: Path to file if applicable

        Returns:
            CampaignError instance
        """
        return cls(
            code=ErrorCode.E302_INVALID_VALUE,
            severity=ErrorSeverity.ERROR,
            message=f"Invalid value for '{field_name}': expected {expected}, got {actual}",
            file_path=file_path,
            context={"field": field_name, "expected": expected, "actual": actual},
        )

    @classmethod
    def agent_error(
        cls,
        agent_name: str,
        error_type: str,
        details: str,
    ) -> "CampaignError":
        """Create an agent error.

        Args:
            agent_name: Name of the agent that failed
            error_type: Type of agent error
            details: Error details

        Returns:
            CampaignError instance
        """
        code = {
            "timeout": ErrorCode.E201_AGENT_TIMEOUT,
            "failed": ErrorCode.E202_AGENT_FAILED,
            "invalid_output": ErrorCode.E203_AGENT_INVALID_OUTPUT,
            "context_overflow": ErrorCode.E204_AGENT_CONTEXT_OVERFLOW,
            "rate_limited": ErrorCode.E205_AGENT_RATE_LIMITED,
        }.get(error_type, ErrorCode.E202_AGENT_FAILED)

        return cls(
            code=code,
            severity=ErrorSeverity.ERROR,
            message=f"Agent '{agent_name}' error: {details}",
            context={"agent": agent_name, "error_type": error_type},
        )


class ErrorHandler:
    """Collects and manages errors during pipeline execution.

    This class provides a centralized way to track errors and warnings
    during campaign building, with support for graceful degradation.

    Attributes:
        _errors: Internal list of collected errors
    """

    def __init__(self) -> None:
        """Initialize an empty ErrorHandler."""
        self._errors: List[CampaignError] = []

    def add(self, error: CampaignError) -> None:
        """Add an error to the handler.

        Args:
            error: The CampaignError to add
        """
        self._errors.append(error)

    def add_warning(self, message: str, file_path: Optional[str] = None) -> None:
        """Add a warning message.

        Args:
            message: Warning message
            file_path: Optional file path associated with the warning
        """
        self._errors.append(
            CampaignError(
                code=ErrorCode.E303_INCONSISTENT_DATA,
                severity=ErrorSeverity.WARNING,
                message=message,
                file_path=file_path,
            )
        )

    def has_fatal(self) -> bool:
        """Check if any fatal errors have been recorded.

        Returns:
            True if at least one FATAL error exists
        """
        return any(e.severity == ErrorSeverity.FATAL for e in self._errors)

    def has_errors(self) -> bool:
        """Check if any errors (ERROR or FATAL) have been recorded.

        Returns:
            True if at least one ERROR or FATAL exists
        """
        return any(e.severity.is_blocking for e in self._errors)

    def can_continue(self) -> bool:
        """Check if processing can continue (no FATAL errors).

        Returns:
            True if there are no FATAL errors
        """
        return not self.has_fatal()

    def get_errors(self) -> List[CampaignError]:
        """Get all ERROR and FATAL level errors.

        Returns:
            List of blocking errors
        """
        return [e for e in self._errors if e.severity.is_blocking]

    def get_warnings(self) -> List[CampaignError]:
        """Get all WARNING level issues.

        Returns:
            List of warnings
        """
        return [e for e in self._errors if e.severity == ErrorSeverity.WARNING]

    def get_all(self) -> List[CampaignError]:
        """Get all recorded errors and warnings.

        Returns:
            List of all CampaignErrors
        """
        return list(self._errors)

    def get_report(self) -> str:
        """Generate a human-readable error report.

        Returns:
            Formatted error report string
        """
        if not self._errors:
            return "No errors or warnings recorded."

        lines = ["Error Report", "=" * 60]

        # Group by severity
        fatal = [e for e in self._errors if e.severity == ErrorSeverity.FATAL]
        errors = [e for e in self._errors if e.severity == ErrorSeverity.ERROR]
        warnings = [e for e in self._errors if e.severity == ErrorSeverity.WARNING]
        info = [e for e in self._errors if e.severity == ErrorSeverity.INFO]

        if fatal:
            lines.append(f"\nFATAL ({len(fatal)}):")
            for e in fatal:
                lines.append(f"  {e}")

        if errors:
            lines.append(f"\nERRORS ({len(errors)}):")
            for e in errors:
                lines.append(f"  {e}")

        if warnings:
            lines.append(f"\nWARNINGS ({len(warnings)}):")
            for e in warnings:
                lines.append(f"  {e}")

        if info:
            lines.append(f"\nINFO ({len(info)}):")
            for e in info:
                lines.append(f"  {e}")

        lines.append("")
        lines.append(f"Total: {len(self._errors)} issues")
        lines.append(f"Can continue: {self.can_continue()}")

        return "\n".join(lines)

    def __len__(self) -> int:
        """Return the number of recorded errors/warnings."""
        return len(self._errors)

    def __bool__(self) -> bool:
        """Return True if any errors/warnings have been recorded."""
        return len(self._errors) > 0


def get_recovery_suggestion(error: CampaignError) -> str:
    """Get an actionable recovery suggestion for an error.

    Args:
        error: The CampaignError to get a suggestion for

    Returns:
        Actionable suggestion string
    """
    # Use explicit suggestion if available
    if error.suggestion:
        return error.suggestion

    # Provide suggestions based on error code
    suggestions = {
        ErrorCode.E101_FILE_NOT_FOUND: (
            "Verify the file path is correct. Check if the file was moved or renamed."
        ),
        ErrorCode.E102_FILE_TOO_LARGE: (
            "Consider splitting the file or increasing the size limit."
        ),
        ErrorCode.E103_FILE_UNREADABLE: (
            "Check file permissions. Ensure the file is not locked by another process."
        ),
        ErrorCode.E104_FILE_CORRUPTED: (
            "Try re-downloading or restoring the file from backup."
        ),
        ErrorCode.E105_FILE_EMPTY: (
            "Check that the file contains data."
        ),
        ErrorCode.E106_BINARY_UNSUPPORTED: (
            "Convert to a supported text format or use PDF/Excel for binary data."
        ),
        ErrorCode.E107_FILE_TYPE_UNKNOWN: (
            "Rename the file with a recognized extension, or provide explicit file type."
        ),
        ErrorCode.E201_AGENT_TIMEOUT: (
            "Try again with a longer timeout, or reduce the file size."
        ),
        ErrorCode.E202_AGENT_FAILED: (
            "Check the agent logs for details. Try re-running the operation."
        ),
        ErrorCode.E203_AGENT_INVALID_OUTPUT: (
            "The agent produced unexpected output. Try re-analyzing the file."
        ),
        ErrorCode.E204_AGENT_CONTEXT_OVERFLOW: (
            "The file is too large for the agent context. Try analyzing in chunks."
        ),
        ErrorCode.E205_AGENT_RATE_LIMITED: (
            "Wait a few minutes before retrying. Consider reducing request frequency."
        ),
        ErrorCode.E301_MISSING_REQUIRED_FIELD: (
            "Add the missing field to the input file or configuration."
        ),
        ErrorCode.E302_INVALID_VALUE: (
            "Correct the invalid value to match the expected format."
        ),
        ErrorCode.E303_INCONSISTENT_DATA: (
            "Review the data for consistency. Check related fields match."
        ),
        ErrorCode.E304_CONSTRAINT_VIOLATION: (
            "Adjust the value to satisfy the constraint."
        ),
        ErrorCode.E305_SCHEMA_MISMATCH: (
            "Ensure the data matches the expected schema version."
        ),
        ErrorCode.E401_PARSE_ERROR: (
            "Check file syntax. Ensure proper encoding (UTF-8 recommended)."
        ),
        ErrorCode.E402_INCOMPATIBLE_FORMATS: (
            "Convert files to compatible formats before processing."
        ),
        ErrorCode.E403_MISSING_DEPENDENCIES: (
            "Install or provide the required dependencies."
        ),
        ErrorCode.E404_CIRCULAR_REFERENCE: (
            "Remove circular references in the file dependencies."
        ),
        ErrorCode.E405_DATA_OVERFLOW: (
            "Reduce data size or increase capacity limits."
        ),
    }

    return suggestions.get(error.code, "Review the error details and try again.")


__all__ = [
    "ErrorCode",
    "ErrorSeverity",
    "CampaignError",
    "ErrorHandler",
    "get_recovery_suggestion",
]
