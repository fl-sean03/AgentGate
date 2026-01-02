#!/bin/bash
# Monitor Wave 2.2 and Wave 3.1 work orders until completion

WO_22="ydsR1nuVGqGG"
WO_31="zCBtDxBdOMUU"

echo "Monitoring work orders..."
echo "  Wave 2.2: $WO_22"
echo "  Wave 3.1: $WO_31"
echo ""

while true; do
  WO1=$(curl -s http://localhost:3001/api/v1/work-orders/$WO_22 | jq -r '.data.status')
  WO2=$(curl -s http://localhost:3001/api/v1/work-orders/$WO_31 | jq -r '.data.status')

  echo "$(date '+%H:%M:%S') - Wave 2.2: $WO1, Wave 3.1: $WO2"

  # Check if both are done (not running or queued)
  if [ "$WO1" != "running" ] && [ "$WO1" != "queued" ] && [ "$WO2" != "running" ] && [ "$WO2" != "queued" ]; then
    echo ""
    echo "=== BOTH WORK ORDERS COMPLETE ==="
    echo "Wave 2.2 ($WO_22): $WO1"
    echo "Wave 3.1 ($WO_31): $WO2"
    echo ""
    echo "=== Checking for PRs ==="
    gh pr list --state open --limit 10
    exit 0
  fi

  sleep 30
done
