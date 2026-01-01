#!/bin/bash
# =============================================================================
# AgentGate Agent Entrypoint
#
# Initializes the agent container environment and executes the main command.
# =============================================================================

set -e

# Log startup
echo "[AgentGate Agent] Starting container..."
echo "[AgentGate Agent] Node version: $(node --version)"
echo "[AgentGate Agent] NPM version: $(npm --version)"
echo "[AgentGate Agent] Workspace: ${WORKSPACE:-/workspace}"

# Verify workspace is mounted
if [ ! -d "${WORKSPACE:-/workspace}" ]; then
    echo "[AgentGate Agent] ERROR: Workspace directory not found"
    exit 1
fi

# Check if Claude CLI is available
if command -v claude &> /dev/null; then
    echo "[AgentGate Agent] Claude CLI version: $(claude --version 2>/dev/null || echo 'unknown')"
else
    echo "[AgentGate Agent] WARNING: Claude CLI not found in PATH"
fi

# Ensure proper permissions for workspace
# This handles cases where the mounted volume has different ownership
if [ -w "${WORKSPACE:-/workspace}" ]; then
    echo "[AgentGate Agent] Workspace is writable"
else
    echo "[AgentGate Agent] WARNING: Workspace may not be writable"
fi

# Configure git for the workspace
if [ -d "${WORKSPACE:-/workspace}/.git" ]; then
    echo "[AgentGate Agent] Git repository detected"

    # Mark workspace as safe for git operations
    git config --global --add safe.directory "${WORKSPACE:-/workspace}"

    # Configure git user if not set
    if [ -z "$(git config --global user.email)" ]; then
        git config --global user.email "agent@agentgate.local"
        git config --global user.name "AgentGate Agent"
    fi
fi

# Install project dependencies if package.json exists
if [ -f "${WORKSPACE:-/workspace}/package.json" ]; then
    echo "[AgentGate Agent] package.json detected"

    # Check if node_modules needs to be installed
    if [ ! -d "${WORKSPACE:-/workspace}/node_modules" ]; then
        echo "[AgentGate Agent] Installing dependencies..."
        cd "${WORKSPACE:-/workspace}"

        # Use pnpm if pnpm-lock.yaml exists, otherwise npm
        if [ -f "pnpm-lock.yaml" ]; then
            pnpm install --frozen-lockfile 2>/dev/null || pnpm install
        elif [ -f "package-lock.json" ]; then
            npm ci 2>/dev/null || npm install
        else
            npm install
        fi
    fi
fi

# Execute the main command
echo "[AgentGate Agent] Ready for execution"
exec "$@"
