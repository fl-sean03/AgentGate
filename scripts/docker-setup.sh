#!/bin/bash
# =============================================================================
# AgentGate Docker Setup Script
#
# This script helps you set up AgentGate with Docker
# =============================================================================

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${BLUE}"
echo "======================================================================="
echo "                   AgentGate Docker Setup                              "
echo "======================================================================="
echo -e "${NC}"

# Check prerequisites
echo -e "${YELLOW}Checking prerequisites...${NC}"

if ! command -v docker &> /dev/null; then
    echo -e "${RED}Error: Docker is not installed${NC}"
    echo "Please install Docker: https://docs.docker.com/get-docker/"
    exit 1
fi
echo -e "${GREEN}  Docker found${NC}"

if ! command -v docker-compose &> /dev/null && ! docker compose version &> /dev/null; then
    echo -e "${RED}Error: Docker Compose is not installed${NC}"
    echo "Please install Docker Compose: https://docs.docker.com/compose/install/"
    exit 1
fi
echo -e "${GREEN}  Docker Compose found${NC}"

# Check if .env exists
if [ ! -f .env ]; then
    echo ""
    echo -e "${YELLOW}Creating .env from .env.example...${NC}"
    cp .env.example .env
    echo -e "${GREEN}  Created .env file${NC}"
    echo ""
    echo -e "${RED}IMPORTANT: You must configure your API keys in .env${NC}"
    echo ""
    echo "Required configuration:"
    echo "  1. ANTHROPIC_API_KEY - Get from https://console.anthropic.com/"
    echo "  2. AGENTGATE_GITHUB_TOKEN - Create at https://github.com/settings/tokens"
    echo ""
    echo "Open .env in your editor and add these values."
    echo ""
    read -p "Press Enter after you've configured .env, or Ctrl+C to exit..."
else
    echo -e "${GREEN}  .env file exists${NC}"
fi

# Validate required env vars
echo ""
echo -e "${YELLOW}Validating configuration...${NC}"

# shellcheck disable=SC1091
source .env

if [ -z "$ANTHROPIC_API_KEY" ] || [ "$ANTHROPIC_API_KEY" = "sk-ant-api03-your-key-here" ]; then
    echo -e "${RED}Error: ANTHROPIC_API_KEY is not configured in .env${NC}"
    exit 1
fi
echo -e "${GREEN}  ANTHROPIC_API_KEY configured${NC}"

GITHUB_TOKEN_VAR="${AGENTGATE_GITHUB_TOKEN:-$GITHUB_TOKEN}"
if [ -z "$GITHUB_TOKEN_VAR" ] || [ "$GITHUB_TOKEN_VAR" = "ghp_your-token-here" ]; then
    echo -e "${YELLOW}Warning: GitHub token not configured${NC}"
    echo "  Some features (GitHub repos) will not work without it"
fi

# Build images
echo ""
echo -e "${YELLOW}Building Docker images...${NC}"
echo "This may take a few minutes on first run..."
echo ""

docker compose build

echo ""
echo -e "${GREEN}  Docker images built successfully${NC}"

# Print usage
echo ""
echo -e "${BLUE}=======================================================================${NC}"
echo -e "${BLUE}                     Setup Complete!                                  ${NC}"
echo -e "${BLUE}=======================================================================${NC}"
echo ""
echo "To start AgentGate:"
echo -e "  ${GREEN}docker compose up -d${NC}"
echo ""
echo "To view logs:"
echo -e "  ${GREEN}docker compose logs -f${NC}"
echo ""
echo "To stop AgentGate:"
echo -e "  ${GREEN}docker compose down${NC}"
echo ""
echo "Access points:"
echo -e "  Dashboard: ${BLUE}http://localhost:${DASHBOARD_PORT:-5173}${NC}"
echo -e "  API:       ${BLUE}http://localhost:${AGENTGATE_PORT:-3001}${NC}"
echo -e "  Health:    ${BLUE}http://localhost:${AGENTGATE_PORT:-3001}/health${NC}"
echo ""
