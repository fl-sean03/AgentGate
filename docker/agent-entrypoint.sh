#!/bin/bash
# =============================================================================
# AgentGate Agent Container Entrypoint
#
# Initializes the container environment and handles execution modes:
# - Keep-alive mode: Runs sleep infinity for exec-based commands
# - Command mode: Executes the provided command directly
# =============================================================================

set -e

# -----------------------------------------------------------------------------
# Initialization
# -----------------------------------------------------------------------------

# Validate workspace mount exists
if [ ! -d "/workspace" ]; then
    echo "ERROR: /workspace directory not found. Ensure workspace is mounted."
    exit 1
fi

# Configure git safe directory for mounted workspace
git config --global safe.directory /workspace 2>/dev/null || true

# Set up shell environment
export PATH="/usr/local/bin:$PATH"
export TERM="${TERM:-xterm}"

# -----------------------------------------------------------------------------
# Signal Handling
# -----------------------------------------------------------------------------

# Forward signals for graceful shutdown
_term() {
    echo "Caught signal, shutting down..."
    kill -TERM "$child" 2>/dev/null || true
    wait "$child"
    exit 0
}

trap _term SIGTERM SIGINT SIGQUIT

# -----------------------------------------------------------------------------
# Execution
# -----------------------------------------------------------------------------

# If no arguments, run in keep-alive mode
if [ $# -eq 0 ] || [ "$1" = "sleep" ]; then
    echo "Starting in keep-alive mode..."
    exec sleep infinity
fi

# Execute provided command
echo "Executing: $*"
exec "$@"
