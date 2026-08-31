#!/bin/bash
set -e

# Colors for output
GREEN='\033[0;32m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${BLUE}Starting NAV_AR full stack...${NC}"

# Ensure cv-service venv and dependencies exist
if [ ! -d "apps/cv-service/.venv" ]; then
  echo -e "${BLUE}Setting up CV service virtual environment...${NC}"
  cd apps/cv-service
  python3 -m venv .venv
  source .venv/bin/activate
  pip install --extra-index-url https://download.pytorch.org/whl/cpu -r requirements-cpu.txt
  pip install -r requirements.txt
  cd ../..
fi

# Start all services in parallel
echo -e "${GREEN}✓ Starting Core Backend${NC}"
npm --prefix apps/core-backend run start:dev &
CORE_PID=$!

echo -e "${GREEN}✓ Starting Gateway${NC}"
npm --prefix apps/gateway run start:dev &
GATEWAY_PID=$!

echo -e "${GREEN}✓ Starting Client${NC}"
npm --prefix apps/client run dev -- --host &
CLIENT_PID=$!

echo -e "${GREEN}✓ Starting CV Service${NC}"
(cd apps/cv-service && source .venv/bin/activate && uvicorn main:app --host 0.0.0.0 --port 8000 --reload) &
CV_PID=$!

echo -e "${GREEN}✓ All services started!${NC}"
echo -e "${BLUE}Endpoints:${NC}"
echo "  Client:       https://localhost:5173"
echo "  Gateway:      http://localhost:3000"
echo "  Core Backend: http://localhost:3001"
echo "  CV Service:   http://localhost:8000 (docs at /docs)"
echo ""
echo -e "${BLUE}Press Ctrl+C to stop all services${NC}"

# Wait for all background processes and handle graceful shutdown
trap "kill $CORE_PID $GATEWAY_PID $CLIENT_PID $CV_PID 2>/dev/null; exit" INT TERM

wait
