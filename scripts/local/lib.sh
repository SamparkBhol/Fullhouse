# Shared by dev.sh and e2e.sh. The caller sets ROOT and RUN_DIR before sourcing it.
BIN="$ROOT/node_modules/.bin"
PIDS=()

node_ts() { node --no-warnings "$@"; }
free_port() { node_ts "$ROOT/scripts/local/free-port.ts"; }
random_secret() { od -An -tx1 -N32 /dev/urandom | tr -d ' \n'; }

stop_pid() {
  local pid="$1" rest=() p
  kill "$pid" 2>/dev/null || true
  wait "$pid" 2>/dev/null || true
  for p in "${PIDS[@]}"; do [ "$p" = "$pid" ] || rest+=("$p"); done
  PIDS=("${rest[@]}")
}

stop_all() {
  local pid
  for pid in "${PIDS[@]}"; do kill "$pid" 2>/dev/null || true; done
  for pid in "${PIDS[@]}"; do wait "$pid" 2>/dev/null || true; done
  PIDS=()
}

# write_env FILE KEY=VALUE... writes a dotenv file only the current user can read.
write_env() {
  local file="$1" pair
  shift
  (
    umask 077
    : >"$file"
    for pair in "$@"; do printf '%s\n' "$pair" >>"$file"; done
  )
}

# start_fake KEY LOG sets FAKE_URL.
start_fake() {
  local key="$1" log="$2" url_file="$RUN_DIR/fake_url"
  rm -f "$url_file"
  FAKE_QLOO_KEY="$key" nice -n 15 node --no-warnings "$ROOT/e2e/fake-qloo/main.ts" --url-file "$url_file" >"$log" 2>&1 &
  PIDS+=("$!")
  local _
  for _ in $(seq 1 100); do
    [ -s "$url_file" ] && break
    sleep 0.1
  done
  if [ ! -s "$url_file" ]; then
    echo "The fake Qloo server did not start. See $log" >&2
    return 1
  fi
  FAKE_URL="$(cat "$url_file")"
}

# start_worker NAME ENV_FILE LOG [wrangler args] sets WORKER_URL and WORKER_PID. An empty ENV_FILE means .dev.vars.
start_worker() {
  local name="$1" env_file="$2" log="$3"
  shift 3
  local port inspector
  port="$(free_port)"
  inspector="$(free_port)"
  local args=(dev --ip 127.0.0.1 --port "$port" --inspector-port "$inspector" --persist-to "$RUN_DIR/state-$name" --show-interactive-dev-session=false "$@")
  if [ -n "$env_file" ]; then args+=(--env-file "$env_file"); fi
  (cd "$ROOT" && CI=true exec nice -n 15 "$BIN/wrangler" "${args[@]}") </dev/null >"$log" 2>&1 &
  local pid="$!"
  WORKER_URL="http://127.0.0.1:$port"
  if ! node_ts "$ROOT/scripts/local/wait-for.ts" "$WORKER_URL/api/health" 90; then
    kill "$pid" 2>/dev/null || true
    wait "$pid" 2>/dev/null || true
    echo "wrangler dev ($name) did not start. Last lines of $log:" >&2
    tail -n 20 "$log" >&2
    return 1
  fi
  PIDS+=("$pid")
  WORKER_PID="$pid"
}
