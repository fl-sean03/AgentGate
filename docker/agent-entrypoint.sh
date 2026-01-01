#!/bin/bash
# AgentGate Agent Container Entrypoint
#
# Initializes the container environment and runs the specified command.

set -e

# =============================================================================
# Initialization
# =============================================================================

# Validate workspace mount exists
if [ ! -d "/workspace" ]; then
    echo "ERROR: /workspace directory not found"
    exit 1
fi

# Configure git safe.directory for workspace
git config --global --add safe.directory /workspace 2>/dev/null || true

# Set up shell environment
export PATH="/usr/local/bin:$PATH"
export TERM=xterm-256color

# =============================================================================
# Signal Handling
# =============================================================================

# Forward signals for graceful shutdown
trap 'exit 0' SIGTERM SIGINT SIGHUP

# =============================================================================
# Command Execution
# =============================================================================

# If no command provided, run the default (sleep infinity)
if [ $# -eq 0 ]; then
    exec sleep infinity
fi

# Execute the provided command
exec "$@"
