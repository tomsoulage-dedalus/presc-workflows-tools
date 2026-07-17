#!/bin/bash
set -euo pipefail

OAS_BASE_DIR="/home/orbisu/work/OAS"

LEVELS=("DEBUG" "INFO" "WARN" "ERROR")
LEVEL_FILTER=""
# Patterns excluded by default — constant noise with no diagnostic value
DEFAULT_EXCLUDES=("UT005108")

usage() {
  echo "Usage: $(basename "$0") [--level DEBUG|INFO|WARN|ERROR] [--no-exclude]"
  echo ""
  echo "Options:"
  echo "  --level       Filter by minimum severity level (default: all)"
  echo "                DEBUG < INFO < WARN < ERROR"
  echo "  --no-exclude  Disable default noise exclusions (UT005108, ...)"
  exit 0
}

NO_EXCLUDE=false

while [[ $# -gt 0 ]]; do
  case "$1" in
    --level)
      LEVEL_FILTER="${2^^}"
      shift 2
      ;;
    --no-exclude)
      NO_EXCLUDE=true
      shift
      ;;
    -h|--help)
      usage
      ;;
    *)
      echo "Unknown option: $1"
      usage
      ;;
  esac
done

# Build grep pattern from minimum level
build_level_pattern() {
  local min_level="$1"
  local pattern=""
  local found=false

  for lvl in "${LEVELS[@]}"; do
    if [[ "$lvl" == "$min_level" ]]; then
      found=true
    fi
    if $found; then
      if [[ -z "$pattern" ]]; then
        pattern="$lvl"
      else
        pattern="$pattern|$lvl"
      fi
    fi
  done

  if ! $found; then
    echo "Unknown level: $min_level. Valid values: ${LEVELS[*]}" >&2
    exit 1
  fi

  echo "$pattern"
}

# Build exclude pattern from default list
build_exclude_pattern() {
  local pattern=""
  for exc in "${DEFAULT_EXCLUDES[@]}"; do
    if [[ -z "$pattern" ]]; then
      pattern="$exc"
    else
      pattern="$pattern|$exc"
    fi
  done
  echo "$pattern"
}

# Select OAS instance
mapfile -t OAS_INSTANCES < <(find "$OAS_BASE_DIR" -mindepth 1 -maxdepth 1 -type d | sort)

if [[ ${#OAS_INSTANCES[@]} -eq 0 ]]; then
  echo "No OAS instances found in $OAS_BASE_DIR" >&2
  exit 1
fi

if [[ ${#OAS_INSTANCES[@]} -eq 1 ]]; then
  SELECTED="${OAS_INSTANCES[0]}"
else
  echo "Select an OAS instance:"
  for i in "${!OAS_INSTANCES[@]}"; do
    echo "  $((i + 1))) $(basename "${OAS_INSTANCES[$i]}")"
  done
  echo ""
  read -rp "Choice [1-${#OAS_INSTANCES[@]}]: " choice

  if ! [[ "$choice" =~ ^[0-9]+$ ]] || (( choice < 1 || choice > ${#OAS_INSTANCES[@]} )); then
    echo "Invalid choice." >&2
    exit 1
  fi

  SELECTED="${OAS_INSTANCES[$((choice - 1))]}"
fi

LOG_FILE="$SELECTED/server/log/server.log"

if [[ ! -f "$LOG_FILE" ]]; then
  echo "Log file not found: $LOG_FILE" >&2
  exit 1
fi

echo "Listening: $(basename "$SELECTED")"

# Stack trace lines — keep Caused by but skip individual \tat frames
STACKTRACE_PATTERN="^Caused by:"

run_pipeline() {
  if [[ -n "$LEVEL_FILTER" ]]; then
    local level_pattern
    level_pattern="$(build_level_pattern "$LEVEL_FILTER")"
    echo "Level filter: >= $LEVEL_FILTER"
    if [[ "$NO_EXCLUDE" == false ]]; then
      local exclude_pattern
      exclude_pattern="$(build_exclude_pattern)"
      tail -f "$LOG_FILE" \
        | grep --line-buffered -Ev "$exclude_pattern" \
        | grep --line-buffered -E "$level_pattern|$STACKTRACE_PATTERN"
    else
      tail -f "$LOG_FILE" \
        | grep --line-buffered -E "$level_pattern|$STACKTRACE_PATTERN"
    fi
  else
    if [[ "$NO_EXCLUDE" == false ]]; then
      local exclude_pattern
      exclude_pattern="$(build_exclude_pattern)"
      tail -f "$LOG_FILE" | grep --line-buffered -Ev "$exclude_pattern"
    else
      tail -f "$LOG_FILE"
    fi
  fi
}

run_pipeline
