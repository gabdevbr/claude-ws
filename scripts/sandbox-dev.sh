#!/bin/bash
#
# Sandbox Dev Mode — Start board + proxy locally (no Docker)
#
# Usage:
#   ./scripts/sandbox-dev.sh              # Start both board + proxy
#   ./scripts/sandbox-dev.sh board        # Start board only
#   ./scripts/sandbox-dev.sh proxy        # Start proxy only
#   ./scripts/sandbox-dev.sh core         # Start core only (standalone)
#   ./scripts/sandbox-dev.sh stop         # Stop all
#
# Ports:
#   Board (Next.js UI):  4000  (BOARD_PORT)
#   Proxy (API Gateway): 5000  (PROXY_PORT)
#   Core  (per-project):  8060 (CORE_PORT)

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

# Load .env if exists
if [ -f "$PROJECT_ROOT/.env" ]; then
  set -a; source "$PROJECT_ROOT/.env"; set +a
fi
if [ -f "$PROJECT_ROOT/.env.local" ]; then
  set -a; source "$PROJECT_ROOT/.env.local"; set +a
fi

BOARD_PORT="${BOARD_PORT:-4000}"
PROXY_PORT="${PROXY_PORT:-5000}"
CORE_PORT="${CORE_PORT:-8060}"
TSX="$PROJECT_ROOT/node_modules/.bin/tsx"
PIDFILE_DIR="$PROJECT_ROOT/logs"
LOG_DIR="$PROJECT_ROOT/logs"

mkdir -p "$PIDFILE_DIR"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m'

log() { echo -e "${CYAN}[Sandbox]${NC} $1"; }
ok()  { echo -e "${GREEN}✓${NC} $1"; }
err() { echo -e "${RED}✗${NC} $1"; }
warn() { echo -e "${YELLOW}⚠${NC} $1"; }

start_proxy() {
  log "Starting Proxy on port $PROXY_PORT..."
  cd "$PROJECT_ROOT"
  PROXY_PORT="$PROXY_PORT" \
  ANTHROPIC_API_KEY="${ANTHROPIC_API_KEY:-}" \
  API_ACCESS_KEY="${API_ACCESS_KEY:-}" \
  POOL_SIZE="${POOL_SIZE:-5}" \
  POOL_PORT_RANGE="${POOL_PORT_RANGE:-30000-30100}" \
  POOL_IMAGE="${POOL_IMAGE:-claude-ws-core:latest}" \
  POOL_DATA_BASE="${POOL_DATA_BASE:-$PROJECT_ROOT/data/sandbox}" \
  POOL_IDLE_TIMEOUT="${POOL_IDLE_TIMEOUT:-3600}" \
  $TSX packages/proxy/src/server.ts > "$LOG_DIR/proxy.log" 2>&1 &
  disown
  echo $! > "$PIDFILE_DIR/proxy.pid"
  ok "Proxy started (PID: $!, port: $PROXY_PORT, log: logs/proxy.log)"
}

start_board() {
  log "Starting Board on port $BOARD_PORT..."
  cd "$PROJECT_ROOT"
  PORT=$BOARD_PORT \
  NEXT_PUBLIC_PROXY_URL="http://localhost:$PROXY_PORT" \
  DATA_DIR="$PROJECT_ROOT/data/sandbox-board" \
  CLAUDE_WS_USER_CWD="$PROJECT_ROOT" \
    $TSX server.ts > "$LOG_DIR/board.log" 2>&1 &
  disown
  echo $! > "$PIDFILE_DIR/board.pid"
  ok "Board started (PID: $!, port: $BOARD_PORT, log: logs/board.log)"
}

start_core() {
  log "Starting Core on port $CORE_PORT..."
  cd "$PROJECT_ROOT"
  PORT=$CORE_PORT \
  CLAUDE_PROVIDER=sdk \
  CLAUDE_WS_USER_CWD="$PROJECT_ROOT" \
    $TSX packages/core/core-server.ts > "$LOG_DIR/core.log" 2>&1 &
  disown
  echo $! > "$PIDFILE_DIR/core.pid"
  ok "Core started (PID: $!, port: $CORE_PORT, log: logs/core.log)"
}

kill_port_force() {
  local port=$1
  local label=$2
  local pids=$(sudo fuser "$port/tcp" 2>/dev/null | xargs)
  if [ -n "$pids" ]; then
    sudo kill -9 $pids 2>/dev/null
    ok "Killed $label on port $port (PIDs: $pids)"
  else
    warn "$label not running on port $port"
  fi
}

stop_all() {
  log "Stopping sandbox services..."

  # Kill processes on proxy and board ports
  kill_port_force "$PROXY_PORT" "Proxy"
  kill_port_force "$BOARD_PORT" "Board"

  # Clean PID files
  rm -f "$PIDFILE_DIR"/*.pid

  # Stop all core Docker containers
  local containers=$(docker ps -q --filter "name=claude-ws-core-" --filter "name=claude-ws-pool-" 2>/dev/null)
  if [ -n "$containers" ]; then
    docker stop $containers 2>/dev/null
    ok "Stopped Docker core containers"
  fi

  log "All sandbox services stopped."
}

status() {
  echo ""
  log "Sandbox Service Status:"
  echo "---"
  for service in proxy board core; do
    pidfile="$PIDFILE_DIR/$service.pid"
    if [ -f "$pidfile" ]; then
      pid=$(cat "$pidfile")
      if kill -0 "$pid" 2>/dev/null; then
        ok "$service — running (PID: $pid)"
      else
        err "$service — dead (PID: $pid, stale pidfile)"
      fi
    else
      warn "$service — not started"
    fi
  done
  echo ""
}

show_help() {
  echo ""
  echo "Sandbox Dev Mode"
  echo "================"
  echo ""
  echo "Usage:"
  echo "  $0              Start board + proxy"
  echo "  $0 board        Start board only"
  echo "  $0 proxy        Start proxy only"
  echo "  $0 core         Start core only"
  echo "  $0 all          Start board + proxy + core"
  echo "  $0 stop         Stop all services"
  echo "  $0 status       Show service status"
  echo ""
  echo "Ports:"
  echo "  Board:  $BOARD_PORT  (BOARD_PORT)"
  echo "  Proxy:  $PROXY_PORT  (PROXY_PORT)"
  echo "  Core:   $CORE_PORT  (CORE_PORT)"
  echo ""
}

# Handle Ctrl+C — stop all background processes
cleanup() {
  echo ""
  stop_all
  exit 0
}
trap cleanup SIGINT SIGTERM

kill_port() {
  local port=$1
  local my_pid=$$
  local pids=$(lsof -t -i:$port 2>/dev/null)
  if [ -n "$pids" ]; then
    for pid in $pids; do
      # Never kill our own process or parent shells
      if [ "$pid" != "$my_pid" ] && [ "$pid" != "$PPID" ]; then
        kill "$pid" 2>/dev/null
      fi
    done
    warn "Killed existing process on port $port"
  fi
}

case "${1:-}" in
  board)
    start_board
    wait
    ;;
  proxy)
    start_proxy
    wait
    ;;
  core)
    start_core
    wait
    ;;
  all)
    start_proxy
    sleep 2
    start_board
    echo ""
    log "Sandbox services started!"
    echo "  Board: http://localhost:$BOARD_PORT"
    echo "  Proxy: http://localhost:$PROXY_PORT"
    echo ""
    log "Core containers are managed by Proxy via Docker."
    log "Stop with: pnpm sandbox:stop"
    ;;
  stop)
    stop_all
    ;;
  status)
    status
    ;;
  help|--help|-h)
    show_help
    ;;
  "")
    # Default: start proxy + board
    start_proxy
    sleep 2
    start_board
    echo ""
    log "Sandbox started!"
    echo "  Board: http://localhost:$BOARD_PORT"
    echo "  Proxy: http://localhost:$PROXY_PORT"
    echo ""
    log "Stop with: pnpm sandbox:stop"
    ;;
  *)
    err "Unknown command: $1"
    show_help
    exit 1
    ;;
esac
