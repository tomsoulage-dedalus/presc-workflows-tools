#!/bin/bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DEFAULT_REPOS_DIR="$(cd "${SCRIPT_DIR}/../.." && pwd)"
CONFIG_FILE="${SCRIPT_DIR}/create-war-and-deploy.env"

timestamp() {
  date "+%Y-%m-%d %H:%M:%S"
}

log() {
  printf "[%s] %s\n" "$(timestamp)" "$*"
}

format_seconds() {
  local total="$1"
  local hours=$((total / 3600))
  local mins=$(((total % 3600) / 60))
  local secs=$((total % 60))
  printf "%02dh:%02dm:%02ds" "$hours" "$mins" "$secs"
}

if [[ -t 1 && -z "${NO_COLOR:-}" ]]; then
  C_RESET="\033[0m"
  C_DIM="\033[2m"
  C_INFO="\033[36m"
  C_OK="\033[32m"
  C_WARN="\033[33m"
  C_ERR="\033[31m"
  C_TITLE="\033[1;34m"
else
  C_RESET=""
  C_DIM=""
  C_INFO=""
  C_OK=""
  C_WARN=""
  C_ERR=""
  C_TITLE=""
fi

logc() {
  local color="$1"
  shift
  printf "%b[%s] %s%b\n" "$color" "$(timestamp)" "$*" "$C_RESET"
}

log() { logc "" "$@"; }
log_info() { logc "$C_INFO" "$@"; }
log_ok() { logc "$C_OK" "$@"; }
log_warn() { logc "$C_WARN" "$@"; }
log_error() { logc "$C_ERR" "$@"; }
log_title() { logc "$C_TITLE" "$@"; }
log_dim() { logc "$C_DIM" "$@"; }

usage() {
  cat <<'EOF' >&2
Usage:
  ./create-war-and-deploy.sh <TICKET> [options] [mvn args...]

Options:
  --verbose              Show full build output instead of the loading animation
  --version-line LINE    Version line to resolve from VERSION_PREFIXES (ex: 3.22, 4.0, 4.01)
  --version-prefix PREF  Explicit version prefix override (ex: 3.4000000.9999)
  --packaging-branch BR  Explicit packaging repo branch override
  --build-only           Build the WAR without running any deploy script
  --replace-maven-args   Replace DEFAULT_MAVEN_ARGS instead of appending CLI mvn args
  --deploy TARGET        Select a deployment target from DEPLOY_COMMANDS
  --deploy-script PATH   Replace the configured deployment target with this script
  --deploy-arg ARG       Argument passed to the deploy script (repeatable)
  -h, --help             Show this help message

Configuration files:
  scripts/create-war-and-deploy.env

Configuration variables (set them in scripts/create-war-and-deploy.env):
  REPOS_DIR              Base directory containing sibling repos
  PACKAGING_REPO         Packaging source repository path
  PACKAGING_WORKTREE_BASE Base directory used for packaging build worktrees
  PACKAGING_WORKTREE_FETCH Fetch origin before preparing the packaging worktree (1/0)
  WAR_RELATIVE_PATH      WAR path relative to the packaging build workdir
  MAVEN_LOCAL_REPOSITORY Local Maven repository used for artifact observability
  BUILD_COMMAND          Space-separated build command
  DEFAULT_MAVEN_ARGS     Space-separated Maven args appended unless replaced
  DEPLOY_WORKDIR         Working directory used for the deploy command
  DEFAULT_DEPLOY_TARGET  Default key selected from the deployment catalog
  DEPLOY_COMMANDS        Bash associative array mapping targets to commands
  DEPLOY_ARGUMENTS       Bash associative array mapping targets to arguments
  VERSION_PREFIXES       Bash associative array mapping version lines to prefixes
  PACKAGING_BRANCHES     Bash associative array mapping version lines to packaging branches

CLI precedence:
  --version-line / --version-prefix / --packaging-branch / --deploy /
  --deploy-script override the equivalent values coming from create-war-and-deploy.env.
  --deploy-arg appends an argument to the selected target's DEPLOY_ARGUMENTS.
  When --deploy-script is used, catalog arguments are ignored and only explicit
  --deploy-arg values are passed to the replacement script.
  Passing mvn args at the end of the command appends them to DEFAULT_MAVEN_ARGS.
  Use --replace-maven-args if you want to replace DEFAULT_MAVEN_ARGS entirely.

Examples:
  ./create-war-and-deploy.sh ORBISBUG-40966
  ./create-war-and-deploy.sh ORBISBUG-40966 --verbose
  ./create-war-and-deploy.sh ORBISBUG-40966 --version-line 4.0
  ./create-war-and-deploy.sh ORBISBUG-40966 --version-line 4.01 --packaging-branch 400XXXX/develop
  ./create-war-and-deploy.sh HORME-7167 --build-only --version-line 3.22
  ./create-war-and-deploy.sh ORBISBUG-40966 --deploy quick
  ./create-war-and-deploy.sh ORBISBUG-40966 --replace-maven-args -U -Ppresc-dev
  ./create-war-and-deploy.sh ORBISBUG-7167 --deploy-script /path/to/quick.sh --deploy-arg deploy --deploy-arg '{war}'
EOF
}

resolve_version_prefix() {
  local resolved_prefix=""

  if [[ -n "$VERSION_PREFIX" ]]; then
    return 0
  fi

  if [[ -z "$VERSION_LINE" ]]; then
    log_error "No version prefix could be resolved."
    log_error "Pass --version-line <line> or --version-prefix <prefix>."
    exit 1
  fi

  if ! declare -p VERSION_PREFIXES >/dev/null 2>&1; then
    log_error "VERSION_PREFIXES must be declared in create-war-and-deploy.env."
    exit 1
  fi

  resolved_prefix="${VERSION_PREFIXES["$VERSION_LINE"]:-}"
  if [[ -z "$resolved_prefix" ]]; then
    log_error "No version prefix mapping found for version line: ${VERSION_LINE}"
    log_error "Add it to VERSION_PREFIXES in create-war-and-deploy.env."
    exit 1
  fi

  VERSION_PREFIX="$resolved_prefix"
}

prompt_version_line() {
  local choices=()
  local index choice selected

  if [[ -n "$VERSION_LINE" || -n "$VERSION_PREFIX" ]]; then
    return 0
  fi

  if [[ ! -t 0 ]]; then
    log_error "No version line selected and no interactive terminal is available."
    log_error "Pass --version-line <line> or --version-prefix <prefix>."
    exit 1
  fi

  if ! declare -p VERSION_PREFIXES >/dev/null 2>&1; then
    log_error "VERSION_PREFIXES must be declared in create-war-and-deploy.env."
    exit 1
  fi

  if sort -V </dev/null >/dev/null 2>&1; then
    mapfile -t choices < <(printf "%s\n" "${!VERSION_PREFIXES[@]}" | sort -V)
  else
    mapfile -t choices < <(printf "%s\n" "${!VERSION_PREFIXES[@]}" | sort)
  fi

  if [[ ${#choices[@]} -eq 0 ]]; then
    log_error "No version choices configured."
    log_error "Set VERSION_PREFIXES in create-war-and-deploy.env or pass --version-line."
    exit 1
  fi

  log_title "Choose version line"
  for index in "${!choices[@]}"; do
    choice="${choices[$index]}"
    printf "  %s) %s\n" "$((index + 1))" "$choice" >&2
  done

  while true; do
    printf "Version line [1-%s]: " "${#choices[@]}" >&2
    if ! IFS= read -r selected; then
      log_error "No version selected."
      exit 1
    fi

    if [[ "$selected" =~ ^[0-9]+$ && "$selected" -ge 1 && "$selected" -le ${#choices[@]} ]]; then
      VERSION_LINE="${choices[$((selected - 1))]}"
      return 0
    fi

    if [[ -n "${VERSION_PREFIXES["$selected"]:-}" ]]; then
      VERSION_LINE="$selected"
      return 0
    fi

    log_error "Invalid version choice: ${selected}"
  done
}

resolve_packaging_branch() {
  local resolved_branch=""

  if [[ -n "$PACKAGING_BRANCH" ]]; then
    return 0
  fi

  if [[ -z "$VERSION_LINE" ]]; then
    return 0
  fi

  if declare -p PACKAGING_BRANCHES >/dev/null 2>&1; then
    resolved_branch="${PACKAGING_BRANCHES["$VERSION_LINE"]:-}"
  fi

  PACKAGING_BRANCH="$resolved_branch"
}

sanitize_path_part() {
  local value="$1"
  value="${value//[^A-Za-z0-9._-]/_}"
  printf "%s\n" "$value"
}

build_packaging_worktree_dir() {
  local branch="$1"
  local ticket="$2"
  local branch_dir=""
  local branch_part

  IFS='/' read -r -a branch_parts <<< "$branch"
  for branch_part in "${branch_parts[@]}"; do
    if [[ -z "$branch_dir" ]]; then
      branch_dir="$(sanitize_path_part "$branch_part")"
    else
      branch_dir="${branch_dir}/$(sanitize_path_part "$branch_part")"
    fi
  done

  printf "%s/orme-medication-packaging/%s/%s\n" "$PACKAGING_WORKTREE_BASE" "$branch_dir" "$(sanitize_path_part "$ticket")"
}

prepare_packaging_worktree() {
  local target_branch="$1"
  local worktree_dir="$2"
  local source_repo="$3"
  local remote_ref="origin/${target_branch}"
  local parent_dir

  if [[ -z "$target_branch" ]]; then
    log "No packaging branch configured for version line ${VERSION_LINE}; keeping current branch."
    return 0
  fi

  if ! git -C "$source_repo" rev-parse --is-inside-work-tree >/dev/null 2>&1; then
    log_error "Packaging source repo is not a git worktree: ${source_repo}"
    return 1
  fi

  if [[ "${PACKAGING_WORKTREE_FETCH:-1}" == "1" ]]; then
    log "Fetching latest packaging branch from origin: ${target_branch}"
    if ! git -C "$source_repo" fetch origin "$target_branch"; then
      log_error "Unable to fetch packaging branch from origin: ${target_branch}"
      return 1
    fi
  fi

  if ! git -C "$source_repo" show-ref --verify --quiet "refs/remotes/${remote_ref}"; then
    log_error "Packaging remote branch not found: ${remote_ref}"
    log_error "Fetch ${source_repo} or update PACKAGING_BRANCHES in create-war-and-deploy.env."
    return 1
  fi

  parent_dir="$(dirname "$worktree_dir")"
  mkdir -p "$parent_dir"

  if [[ -e "$worktree_dir" ]]; then
    log "Removing previous temporary packaging worktree: ${worktree_dir}"
    if ! git -C "$source_repo" worktree remove --force "$worktree_dir" >/dev/null 2>&1; then
      log_error "Unable to remove previous temporary packaging worktree: ${worktree_dir}"
      log_error "Remove it manually or change PACKAGING_WORKTREE_BASE."
      return 1
    fi
    git -C "$source_repo" worktree prune >/dev/null 2>&1 || true
  fi

  log "Creating packaging worktree: ${worktree_dir}"
  git -C "$source_repo" worktree add --detach "$worktree_dir" "$remote_ref"
}

build_final_deploy_args() {
  local arg expanded
  FINAL_DEPLOY_ARGS=()

  for arg in "${DEPLOY_ARGS[@]}"; do
    expanded="${arg//\{war\}/$WAR_PATH}"
    expanded="${expanded//\{ticket\}/$TICKET_ID}"
    expanded="${expanded//\{version\}/$VERSION}"
    FINAL_DEPLOY_ARGS+=("$expanded")
  done
}

format_command() {
  local formatted
  printf -v formatted '%q ' "$@"
  printf "%s" "${formatted% }"
}

build_maven_artifact_path() {
  local repository_root="$1"
  local group_id="$2"
  local artifact_id="$3"
  local version="$4"
  local packaging="$5"
  local classifier="${6:-}"
  local group_path="${group_id//./\/}"
  local file_name="${artifact_id}-${version}"

  if [[ -n "$classifier" ]]; then
    file_name+="-${classifier}"
  fi
  file_name+=".${packaging}"

  printf "%s/%s/%s/%s/%s\n" "$repository_root" "$group_path" "$artifact_id" "$version" "$file_name"
}

find_first_war_entry() {
  local war_path="$1"
  local pattern="$2"

  jar tf "$war_path" | grep -m1 -E "$pattern" || true
}

normalize_ticket_id() {
  local raw="$1"
  raw="${raw^^}"
  raw="${raw//[[:space:]]/-}"

  if [[ "$raw" =~ ^(ORBISBUG|HORME)[-_]([0-9]+([_-][A-Z0-9]+)*)$ ]]; then
    printf "%s-%s\n" "${BASH_REMATCH[1]}" "${BASH_REMATCH[2]}"
    return 0
  fi

  return 1
}

log_prescription_artifact_observability() {
  local backend_war_entry backend_repo_file
  local frontend_bundle_file frontend_sourcemaps_file
  local frontend_main_entry frontend_map_entry

  backend_war_entry="$(find_first_war_entry "$WAR_PATH" '^WEB-INF/lib/orme-prescription-orbis-impl-.*\.jar$')"
  backend_repo_file="$(build_maven_artifact_path "$MAVEN_LOCAL_REPOSITORY" "orbis.orme.prescription" "orme-prescription-orbis-impl" "$VERSION" "jar")"
  frontend_bundle_file="$(build_maven_artifact_path "$MAVEN_LOCAL_REPOSITORY" "com.agfa.orbis.modules.orme" "orbis-medication-webapp-prescription" "$VERSION" "zip" "bundle")"
  frontend_sourcemaps_file="$(build_maven_artifact_path "$MAVEN_LOCAL_REPOSITORY" "com.agfa.orbis.modules.orme" "orbis-medication-webapp-prescription" "$VERSION" "zip" "sourcemaps")"
  frontend_main_entry="$(find_first_war_entry "$WAR_PATH" '^webapp/prescription/main\..*\.js$')"
  frontend_map_entry="$(find_first_war_entry "$WAR_PATH" '^webapp/prescription/main\..*\.js\.map$')"

  log_dim "-----------------------------------------------"
  log_title "Prescription artifact observability"
  log "Prescription version input: ${VERSION}"

  if [[ -n "$backend_war_entry" ]]; then
    log "Prescription backend in WAR: ${backend_war_entry}"
  else
    log_warn "Prescription backend jar not found in WAR."
  fi

  if [[ -f "$backend_repo_file" ]]; then
    log "Prescription backend in Maven repo: ${backend_repo_file}"
  else
    log_warn "Prescription backend jar not found in Maven repo: ${backend_repo_file}"
  fi

  if [[ -f "$frontend_bundle_file" ]]; then
    log "Prescription frontend bundle: ${frontend_bundle_file}"
  else
    log_warn "Prescription frontend bundle not found in Maven repo: ${frontend_bundle_file}"
  fi

  if [[ -f "$frontend_sourcemaps_file" ]]; then
    log "Prescription frontend sourcemaps: ${frontend_sourcemaps_file}"
  else
    log_warn "Prescription frontend sourcemaps not found in Maven repo: ${frontend_sourcemaps_file}"
  fi

  if [[ -n "$frontend_main_entry" ]]; then
    log "Prescription frontend in WAR: ${frontend_main_entry}"
  else
    log_warn "Prescription frontend bundle entry not found in WAR."
  fi

  if [[ -n "$frontend_map_entry" ]]; then
    log "Prescription frontend sourcemap in WAR: ${frontend_map_entry}"
  else
    log_warn "Prescription frontend sourcemap entry not found in WAR."
  fi

  log_dim "-----------------------------------------------"
}

resolve_path_in_dir() {
  local base_dir="$1"
  local path_value="$2"

  if [[ "$path_value" = /* ]]; then
    printf "%s\n" "$path_value"
  else
    printf "%s/%s\n" "$base_dir" "$path_value"
  fi
}

validate_command_token() {
  local token="$1"
  local base_dir="$2"
  local require_executable="${3:-0}"
  local resolved

  if [[ "$token" == */* ]]; then
    resolved="$(resolve_path_in_dir "$base_dir" "$token")"
    if [[ ! -f "$resolved" ]]; then
      log_error "Command path not found: ${resolved}"
      exit 1
    fi
    if [[ "$require_executable" -eq 1 && ! -x "$resolved" ]]; then
      log_error "Command is not executable: ${resolved}"
      exit 1
    fi
    return 0
  fi

  if ! command -v "$token" >/dev/null 2>&1; then
    log_error "Command not found in PATH: ${token}"
    exit 1
  fi
}

validate_deploy_command() {
  local deploy_workdir="$1"
  shift
  local command_tokens=("$@")
  local second_token resolved_second
  local command_name

  if [[ ${#command_tokens[@]} -eq 0 ]]; then
    log_error "No deploy command configured."
    log_error "Configure DEPLOY_COMMANDS in create-war-and-deploy.env or pass --deploy-script."
    exit 1
  fi

  command_name="$(basename "${command_tokens[0]}")"

  case "$command_name" in
    bash|sh|zsh)
      validate_command_token "${command_tokens[0]}" "$deploy_workdir" 1
      if [[ ${#command_tokens[@]} -ge 2 ]]; then
        second_token="${command_tokens[1]}"
        if [[ "$second_token" == -* ]]; then
          return 0
        fi
        if [[ "$second_token" == */* ]]; then
          resolved_second="$(resolve_path_in_dir "$deploy_workdir" "$second_token")"
          if [[ ! -f "$resolved_second" ]]; then
            log_error "Deploy script not found: ${resolved_second}"
            exit 1
          fi
        fi
      else
        log_error "Deploy command is incomplete: $(format_command "${command_tokens[@]}")"
        exit 1
      fi
      ;;
    *)
      validate_command_token "${command_tokens[0]}" "$deploy_workdir" 1
      ;;
  esac
}

log_verbose() {
  if [[ "$LOG_MODE" == "verbose" ]]; then
    log "$@"
  fi
}

add_step() {
  local step_name="$1"
  local step_status="${2:-PENDING}"
  local step_duration="${3:---}"

  REPLY="${#STEP_NAMES[@]}"
  STEP_NAMES+=("$step_name")
  STEP_STATUSES+=("$step_status")
  STEP_DURATIONS+=("$step_duration")
}

run_command_step() {
  local step_label="$1"
  local workdir="$2"
  shift 2

  local log_file
  log_file="$(mktemp)"
  STEP_LOG_FILES+=("$log_file")

  run_in_workdir() {
    local target_dir="$1"
    shift
    local previous_dir="$PWD"
    cd "$target_dir"
    "$@"
    local cmd_exit=$?
    cd "$previous_dir"
    return "$cmd_exit"
  }

  if [[ "$RUN_STEP_INTERACTIVE" -eq 1 ]]; then
    set +e
    run_in_workdir "$workdir" "$@"
    local cmd_exit=$?
    set -e
    if [[ $cmd_exit -ne 0 ]]; then
      log_error "${step_label} failed."
    fi
    return "$cmd_exit"
  fi

  if [[ "$LOG_MODE" == "verbose" || ! -t 1 ]]; then
    set +e
    run_in_workdir "$workdir" "$@" 2>&1 | tee "$log_file"
    local cmd_exit=${PIPESTATUS[0]}
    set -e
    if [[ $cmd_exit -ne 0 ]]; then
      log_error "${step_label} failed."
    fi
    return "$cmd_exit"
  fi

  local spinner='|/-\'
  local spinner_index=0
  local spinner_char
  local cmd_pid
  local cmd_exit

  set +e
  run_in_workdir "$workdir" "$@" >"$log_file" 2>&1 &
  cmd_pid=$!
  CURRENT_COMMAND_PID="$cmd_pid"

  while kill -0 "$cmd_pid" 2>/dev/null; do
    spinner_char="${spinner:spinner_index:1}"
    printf "\r%b[%s] %s %s%b" "$C_INFO" "$(timestamp)" "$step_label" "$spinner_char" "$C_RESET"
    spinner_index=$(((spinner_index + 1) % ${#spinner}))
    sleep 0.1
  done

  wait "$cmd_pid"
  cmd_exit=$?
  CURRENT_COMMAND_PID=0
  set -e

  printf "\r\033[2K"

  if [[ $cmd_exit -ne 0 ]]; then
    log_error "${step_label} failed. Showing command output:"
    cat "$log_file"
    return "$cmd_exit"
  fi

  return 0
}

run_tracked_step() {
  local step_index="$1"
  local workdir="$2"
  local step_message="$3"
  shift 3

  local step_start step_end
  local step_name="${STEP_NAMES[$step_index]}"
  local total_steps="${#STEP_NAMES[@]}"

  step_start=$(date +%s)
  CURRENT_STEP_INDEX="$step_index"
  CURRENT_STEP_LABEL="$step_name"
  CURRENT_STEP_START=$step_start
  STEP_STATUSES[$step_index]="RUNNING"

  log_info "Step $((step_index + 1))/${total_steps}: ${step_message}"
  log_verbose "Command: $(format_command "$@")"
  run_command_step "$step_name" "$workdir" "$@"

  step_end=$(date +%s)
  STEP_STATUSES[$step_index]="OK"
  STEP_DURATIONS[$step_index]="$(format_seconds $((step_end - step_start)))"
  log_ok "Step $((step_index + 1))/${total_steps} done in ${STEP_DURATIONS[$step_index]}"
}

TICKET_ID=""
VERSION_LINE=""
VERSION_PREFIX=""
VERSION=""
PACKAGING_BRANCH="${PACKAGING_BRANCH:-}"
LOG_MODE="${LOG_MODE:-normal}"
CURRENT_STEP_LABEL="init"
CURRENT_STEP_INDEX=-1
CURRENT_STEP_START=0
CURRENT_COMMAND_PID=0
START_ALL=0
INIT_DONE=0
BUILD_ONLY=0
DEPLOY_TARGET=""
DEPLOY_COMMAND_OVERRIDE_RAW=""
BUILD_COMMAND_PARTS=()
DEPLOY_COMMAND_PARTS=()
DEPLOY_ARGS=()
CONFIGURED_DEFAULT_DEPLOY_ARGS=()
CLI_DEPLOY_ARGS=()
FINAL_DEPLOY_ARGS=()
REPOS_DIR="${REPOS_DIR:-}"
PACKAGING_SOURCE_REPO=""
PACKAGING_WORKTREE_BASE="${PACKAGING_WORKTREE_BASE:-}"
PACKAGING_WORKTREE_DIR=""
PACKAGING_WORKTREE_CREATED=0
PACKAGING_WORKTREE_FETCH="${PACKAGING_WORKTREE_FETCH:-1}"
REPO_DIR=""
BUILD_COMMAND_RAW=""
DEPLOY_COMMAND_RAW=""
DEPLOY_ARGUMENTS_RAW=""
DEPLOY_WORKDIR="${DEPLOY_WORKDIR:-}"
MAVEN_LOCAL_REPOSITORY="${MAVEN_LOCAL_REPOSITORY:-${HOME}/.m2/repository}"
WAR_RELATIVE_PATH="${WAR_RELATIVE_PATH:-deployment/orbis-medication-war/target/orbis-medication.war}"
WAR_PATH=""
CLI_MAVEN_ARGS=()
FINAL_MAVEN_ARGS=()
MAVEN_ARGS_SOURCE="none"
REPLACE_DEFAULT_MAVEN_ARGS=0
RUN_STEP_INTERACTIVE=0
STEP_LOG_FILES=()
STEP_NAMES=()
STEP_STATUSES=()
STEP_DURATIONS=()
BUILD_STEP_INDEX=-1
PACKAGING_WORKTREE_STEP_INDEX=-1
DEPLOY_STEP_INDEX=-1

if [[ ! -f "$CONFIG_FILE" ]]; then
  log_error "Config file not found: ${CONFIG_FILE}"
  exit 1
fi

# shellcheck disable=SC1090
source "$CONFIG_FILE"

BUILD_COMMAND_RAW="${BUILD_COMMAND:-}"
DEFAULT_MAVEN_ARGS_RAW="${DEFAULT_MAVEN_ARGS:-}"

if [[ $# -lt 1 ]]; then
  usage
  exit 1
fi

if [[ -n "$BUILD_COMMAND_RAW" ]]; then
  read -r -a BUILD_COMMAND_PARTS <<< "$BUILD_COMMAND_RAW"
else
  BUILD_COMMAND_PARTS=()
fi

if [[ -n "$DEFAULT_MAVEN_ARGS_RAW" ]]; then
  read -r -a CONFIGURED_DEFAULT_MAVEN_ARGS <<< "$DEFAULT_MAVEN_ARGS_RAW"
else
  CONFIGURED_DEFAULT_MAVEN_ARGS=()
fi

while [[ $# -gt 0 ]]; do
  case "$1" in
    -h|--help)
      usage
      exit 0
      ;;
    --verbose)
      LOG_MODE="verbose"
      shift
      ;;
    --build-only)
      BUILD_ONLY=1
      shift
      ;;
    --replace-maven-args)
      REPLACE_DEFAULT_MAVEN_ARGS=1
      shift
      ;;
    --deploy-script)
      if [[ $# -lt 2 ]]; then
        log_error "Missing value for --deploy-script"
        usage
        exit 1
      fi
      DEPLOY_COMMAND_OVERRIDE_RAW="$2"
      shift 2
      ;;
    --deploy)
      if [[ $# -lt 2 ]]; then
        log_error "Missing value for --deploy"
        usage
        exit 1
      fi
      DEPLOY_TARGET="$2"
      shift 2
      ;;
    --deploy-arg)
      if [[ $# -lt 2 ]]; then
        log_error "Missing value for --deploy-arg"
        usage
        exit 1
      fi
      CLI_DEPLOY_ARGS+=("$2")
      shift 2
      ;;
    --version-line)
      if [[ $# -lt 2 ]]; then
        log_error "Missing value for --version-line"
        usage
        exit 1
      fi
      VERSION_LINE="$2"
      shift 2
      ;;
    --version-prefix)
      if [[ $# -lt 2 ]]; then
        log_error "Missing value for --version-prefix"
        usage
        exit 1
      fi
      VERSION_PREFIX="$2"
      shift 2
      ;;
    --packaging-branch)
      if [[ $# -lt 2 ]]; then
        log_error "Missing value for --packaging-branch"
        usage
        exit 1
      fi
      PACKAGING_BRANCH="$2"
      shift 2
      ;;
    --)
      shift
      while [[ $# -gt 0 ]]; do
        CLI_MAVEN_ARGS+=("$1")
        shift
      done
      ;;
    *)
      if [[ -z "$TICKET_ID" ]] && TICKET_ID="$(normalize_ticket_id "$1")"; then
        shift
      elif [[ -z "$TICKET_ID" && $# -ge 2 ]] && TICKET_ID="$(normalize_ticket_id "$1-$2")"; then
        shift 2
      else
        CLI_MAVEN_ARGS+=("$1")
        shift
      fi
      ;;
  esac
done

if [[ -z "$TICKET_ID" ]]; then
  log_error "Missing or unsupported ticket ID."
  log_error "Expected ORBISBUG-<number>, HORME-<number>, or variants like 'ORBISBUG 12345_2'."
  usage
  exit 1
fi

if [[ $BUILD_ONLY -ne 1 ]]; then
  if [[ -n "$DEPLOY_COMMAND_OVERRIDE_RAW" ]]; then
    DEPLOY_TARGET=""
    DEPLOY_COMMAND_RAW="$DEPLOY_COMMAND_OVERRIDE_RAW"
    DEPLOY_ARGS=("${CLI_DEPLOY_ARGS[@]}")
  else
    if [[ -z "$DEPLOY_TARGET" ]]; then
      DEPLOY_TARGET="${DEFAULT_DEPLOY_TARGET:-}"
    fi
    if [[ -z "$DEPLOY_TARGET" ]]; then
      log_error "No deployment target selected."
      log_error "Set DEFAULT_DEPLOY_TARGET in create-war-and-deploy.env or pass --deploy <target>."
      exit 1
    fi
    if ! declare -p DEPLOY_COMMANDS >/dev/null 2>&1 || ! declare -p DEPLOY_ARGUMENTS >/dev/null 2>&1; then
      log_error "DEPLOY_COMMANDS and DEPLOY_ARGUMENTS must be declared in create-war-and-deploy.env."
      exit 1
    fi
    DEPLOY_COMMAND_RAW="${DEPLOY_COMMANDS["$DEPLOY_TARGET"]:-}"
    DEPLOY_ARGUMENTS_RAW="${DEPLOY_ARGUMENTS["$DEPLOY_TARGET"]:-}"
    if [[ -z "$DEPLOY_COMMAND_RAW" ]]; then
      log_error "Unknown deployment target: ${DEPLOY_TARGET}"
      log_error "Add it to DEPLOY_COMMANDS in create-war-and-deploy.env."
      exit 1
    fi
    if [[ -n "$DEPLOY_ARGUMENTS_RAW" ]]; then
      read -r -a CONFIGURED_DEFAULT_DEPLOY_ARGS <<< "$DEPLOY_ARGUMENTS_RAW"
    fi
    DEPLOY_ARGS=("${CONFIGURED_DEFAULT_DEPLOY_ARGS[@]}" "${CLI_DEPLOY_ARGS[@]}")
  fi
fi

if [[ "$LOG_MODE" != "normal" && "$LOG_MODE" != "verbose" ]]; then
  log_error "Unsupported log mode: ${LOG_MODE}"
  exit 1
fi

if [[ $REPLACE_DEFAULT_MAVEN_ARGS -eq 1 ]]; then
  FINAL_MAVEN_ARGS=("${CLI_MAVEN_ARGS[@]}")
  MAVEN_ARGS_SOURCE="cli-replace"
elif [[ ${#CLI_MAVEN_ARGS[@]} -eq 0 ]]; then
  FINAL_MAVEN_ARGS=("${CONFIGURED_DEFAULT_MAVEN_ARGS[@]}")
  if [[ ${#CONFIGURED_DEFAULT_MAVEN_ARGS[@]} -gt 0 ]]; then
    MAVEN_ARGS_SOURCE="defaults"
  fi
else
  FINAL_MAVEN_ARGS=("${CONFIGURED_DEFAULT_MAVEN_ARGS[@]}" "${CLI_MAVEN_ARGS[@]}")
  if [[ ${#CONFIGURED_DEFAULT_MAVEN_ARGS[@]} -gt 0 ]]; then
    MAVEN_ARGS_SOURCE="defaults+cli"
  else
    MAVEN_ARGS_SOURCE="cli"
  fi
fi

prompt_version_line
resolve_version_prefix
resolve_packaging_branch

VERSION="${VERSION_PREFIX}-${TICKET_ID}-SNAPSHOT"
PACKAGING_SOURCE_REPO="${PACKAGING_REPO:-}"
REPO_DIR="$PACKAGING_SOURCE_REPO"

if [[ -z "$BUILD_COMMAND_RAW" || ${#BUILD_COMMAND_PARTS[@]} -eq 0 ]]; then
  log_error "No build command configured."
  log_error "Set BUILD_COMMAND in create-war-and-deploy.env."
  exit 1
fi

if [[ -z "$PACKAGING_SOURCE_REPO" ]]; then
  log_error "PACKAGING_REPO must be set in create-war-and-deploy.env."
  exit 1
fi

if [[ ! -d "$PACKAGING_SOURCE_REPO" ]]; then
  log_error "Packaging source repo not found: ${PACKAGING_SOURCE_REPO}"
  log_error "Set PACKAGING_REPO in create-war-and-deploy.env."
  exit 1
fi

if [[ -n "$PACKAGING_BRANCH" ]]; then
  if [[ -z "$PACKAGING_WORKTREE_BASE" ]]; then
    PACKAGING_WORKTREE_BASE="${REPOS_DIR}/.worktrees"
  fi
  PACKAGING_WORKTREE_DIR="$(build_packaging_worktree_dir "$PACKAGING_BRANCH" "$TICKET_ID")"
  REPO_DIR="$PACKAGING_WORKTREE_DIR"
  add_step "prepare packaging worktree ${PACKAGING_BRANCH}"
  PACKAGING_WORKTREE_STEP_INDEX="$REPLY"
fi

WAR_PATH="${WAR_PATH:-${REPO_DIR}/${WAR_RELATIVE_PATH}}"

BUILD_STEP_NAME="$(format_command "${BUILD_COMMAND_PARTS[@]}")"
add_step "$BUILD_STEP_NAME"
BUILD_STEP_INDEX="$REPLY"

if [[ $BUILD_ONLY -eq 1 ]]; then
  add_step "deploy command" "SKIPPED"
  DEPLOY_STEP_INDEX="$REPLY"
else
  if [[ -z "$DEPLOY_WORKDIR" ]]; then
    log_error "DEPLOY_WORKDIR must be set in create-war-and-deploy.env."
    exit 1
  fi

  if [[ ! -d "$DEPLOY_WORKDIR" ]]; then
    log_error "Deploy workdir not found: ${DEPLOY_WORKDIR}"
    exit 1
  fi

  if [[ -n "$DEPLOY_COMMAND_RAW" ]]; then
    read -r -a DEPLOY_COMMAND_PARTS <<< "$DEPLOY_COMMAND_RAW"
  else
    DEPLOY_COMMAND_PARTS=()
  fi

  validate_deploy_command "$DEPLOY_WORKDIR" "${DEPLOY_COMMAND_PARTS[@]}"
  DEPLOY_STEP_NAME="$(format_command "${DEPLOY_COMMAND_PARTS[@]}")"
  add_step "$DEPLOY_STEP_NAME"
  DEPLOY_STEP_INDEX="$REPLY"

  if [[ ${#DEPLOY_COMMAND_PARTS[@]} -eq 0 ]]; then
    log_error "No deploy command configured."
    log_error "Configure DEPLOY_COMMANDS in create-war-and-deploy.env or pass --deploy-script."
    exit 1
  fi
fi

build_final_deploy_args

on_interrupt() {
  trap - INT
  if [[ -t 1 ]]; then
    printf "\r\033[2K"
  fi
  log_warn "Received Ctrl+C; stopping current command..."

  if [[ $CURRENT_COMMAND_PID -gt 0 ]]; then
    kill -INT "$CURRENT_COMMAND_PID" 2>/dev/null || true
    wait "$CURRENT_COMMAND_PID" 2>/dev/null || true
    CURRENT_COMMAND_PID=0
  fi

  exit 130
}

on_exit() {
  local exit_code=$?

  if [[ $INIT_DONE -ne 1 ]]; then
    exit "$exit_code"
  fi

  local end_all
  end_all=$(date +%s)
  local total_secs=$((end_all - START_ALL))
  local now_secs
  now_secs=$end_all

  if [[ $exit_code -ne 0 && $CURRENT_STEP_LABEL != "completed" && $CURRENT_STEP_START -gt 0 && $CURRENT_STEP_INDEX -ge 0 ]]; then
    local step_secs=$((now_secs - CURRENT_STEP_START))
    STEP_STATUSES[$CURRENT_STEP_INDEX]="KO"
    STEP_DURATIONS[$CURRENT_STEP_INDEX]="$(format_seconds "$step_secs")"
  fi

  log_dim "==============================================="
  log_title "Summary"
  log "Ticket ID: ${TICKET_ID}"
  if [[ -n "$VERSION_LINE" ]]; then
    log "Version line: ${VERSION_LINE}"
  fi
  log "Version: ${VERSION}"
  log "Steps:"
  for step_index in "${!STEP_NAMES[@]}"; do
    log "  $((step_index + 1))) ${STEP_NAMES[$step_index]}: ${STEP_STATUSES[$step_index]} (${STEP_DURATIONS[$step_index]})"
  done
  if [[ $exit_code -eq 0 ]]; then
    log_ok "Status: OK"
  else
    log_error "Status: KO"
    log_error "Failed at: ${CURRENT_STEP_LABEL}"
    log_error "Exit code: ${exit_code}"
  fi
  log "Total duration: $(format_seconds "$total_secs")"
  log_dim "==============================================="
  if [[ $PACKAGING_WORKTREE_CREATED -eq 1 && -n "$PACKAGING_WORKTREE_DIR" && -d "$PACKAGING_WORKTREE_DIR" ]]; then
    log_info "Cleaning packaging worktree: ${PACKAGING_WORKTREE_DIR}"
    git -C "$PACKAGING_SOURCE_REPO" worktree remove --force "$PACKAGING_WORKTREE_DIR" >/dev/null 2>&1 || log_warn "Unable to remove packaging worktree: ${PACKAGING_WORKTREE_DIR}"
    git -C "$PACKAGING_SOURCE_REPO" worktree prune >/dev/null 2>&1 || true
  fi
  if [[ ${#STEP_LOG_FILES[@]} -gt 0 ]]; then
    rm -f "${STEP_LOG_FILES[@]}"
  fi
  exit "$exit_code"
}

trap on_exit EXIT
trap on_interrupt INT

START_ALL=$(date +%s)
INIT_DONE=1

log_dim "==============================================="
log_title "createWarAndDeploy"
log "Config: ${CONFIG_FILE}"
log "Packaging source repo: ${PACKAGING_SOURCE_REPO}"
log "Build workdir: ${REPO_DIR}"
if [[ -n "$PACKAGING_BRANCH" ]]; then
  log "Packaging branch: ${PACKAGING_BRANCH}"
  log "Packaging worktree: ${PACKAGING_WORKTREE_DIR}"
  log "Packaging fetch origin: ${PACKAGING_WORKTREE_FETCH}"
else
  log "Packaging branch: current branch"
fi
log "Ticket ID: ${TICKET_ID}"
if [[ -n "$VERSION_LINE" ]]; then
  log "Version line: ${VERSION_LINE}"
fi
log "Output mode: ${LOG_MODE}"
log "Version prefix: ${VERSION_PREFIX}"
log "Version: ${VERSION}"
log "WAR path: ${WAR_PATH}"
log "Maven local repository: ${MAVEN_LOCAL_REPOSITORY}"
log "Build command: $(format_command "${BUILD_COMMAND_PARTS[@]}")"
if [[ ${#CONFIGURED_DEFAULT_MAVEN_ARGS[@]} -gt 0 ]]; then
  log "Maven default args: ${CONFIGURED_DEFAULT_MAVEN_ARGS[*]}"
else
  log "Maven default args: (none)"
fi
if [[ ${#CLI_MAVEN_ARGS[@]} -gt 0 ]]; then
  log "Maven CLI args: ${CLI_MAVEN_ARGS[*]}"
else
  log "Maven CLI args: (none)"
fi
if [[ ${#FINAL_MAVEN_ARGS[@]} -gt 0 ]]; then
  log "Maven final args: ${FINAL_MAVEN_ARGS[*]}"
else
  log "Maven final args: (none)"
fi
log "Maven args source: ${MAVEN_ARGS_SOURCE}"
if [[ $BUILD_ONLY -eq 1 ]]; then
  log "Deploy: skipped (--build-only)"
else
  if [[ -n "$DEPLOY_TARGET" ]]; then
    log "Deploy target: ${DEPLOY_TARGET}"
  else
    log "Deploy target: custom script"
  fi
  log "Deploy workdir: ${DEPLOY_WORKDIR}"
  log "Deploy command: $(format_command "${DEPLOY_COMMAND_PARTS[@]}")"
  if [[ ${#FINAL_DEPLOY_ARGS[@]} -gt 0 ]]; then
    log "Deploy args: ${FINAL_DEPLOY_ARGS[*]}"
  else
    log "Deploy args: (none)"
  fi
fi
log_dim "==============================================="

if [[ $PACKAGING_WORKTREE_STEP_INDEX -ge 0 ]]; then
  run_tracked_step "$PACKAGING_WORKTREE_STEP_INDEX" "$PACKAGING_SOURCE_REPO" "preparing packaging worktree for ${PACKAGING_BRANCH}" prepare_packaging_worktree "$PACKAGING_BRANCH" "$PACKAGING_WORKTREE_DIR" "$PACKAGING_SOURCE_REPO"
  PACKAGING_WORKTREE_CREATED=1
fi

MAVEN_CMD=("${BUILD_COMMAND_PARTS[@]}" -Dversion.orme-prescription="${VERSION}")
if [[ ${#FINAL_MAVEN_ARGS[@]} -gt 0 ]]; then
  MAVEN_CMD+=("${FINAL_MAVEN_ARGS[@]}")
fi
run_tracked_step "$BUILD_STEP_INDEX" "$REPO_DIR" "running build command (this can take several minutes)" "${MAVEN_CMD[@]}"

if [[ ! -f "$WAR_PATH" ]]; then
  log_error "WAR file not found after build: ${WAR_PATH}"
  exit 1
fi

log_prescription_artifact_observability

if [[ $BUILD_ONLY -eq 1 ]]; then
  log_info "Step $((DEPLOY_STEP_INDEX + 1))/${#STEP_NAMES[@]}: deploy skipped (--build-only)"
else
  DEPLOY_CMD=("${DEPLOY_COMMAND_PARTS[@]}")
  if [[ ${#FINAL_DEPLOY_ARGS[@]} -gt 0 ]]; then
    DEPLOY_CMD+=("${FINAL_DEPLOY_ARGS[@]}")
  fi
  RUN_STEP_INTERACTIVE=1
  run_tracked_step "$DEPLOY_STEP_INDEX" "$DEPLOY_WORKDIR" "running deploy command" "${DEPLOY_CMD[@]}"
  RUN_STEP_INTERACTIVE=0
fi

CURRENT_STEP_INDEX=-1
CURRENT_STEP_START=0
CURRENT_STEP_LABEL="completed"
