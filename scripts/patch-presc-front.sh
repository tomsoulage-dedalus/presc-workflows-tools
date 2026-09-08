#!/bin/bash
set -euo pipefail

# =============================================================================
# USER CONFIGURATION
# Update these paths to match your local repositories.
# =============================================================================

PRESCRIPTION_REPO="${HOME}/repos/orme-prescription"
WAR_PATH="${HOME}/repos/orme-medication-packaging/deployment/orbis-medication-war/target/orbis-medication.war"

# =============================================================================

FRONTEND_DIR="${PRESCRIPTION_REPO}/frontend/prescription-app"
DIST_DIR="${FRONTEND_DIR}/dist/prescription-app"

BUILD_FRONTEND=true
STAGING_DIR=""
BACKUP_PATH=""
PATCH_SUCCEEDED=false

usage() {
    cat <<EOF
Usage:
  $(basename "$0") [options]

Options:
  --war PATH     Override the configured WAR path
  --skip-build   Reuse the existing Prescription frontend dist
  -h, --help     Show this help message

Default Prescription repository:
  ${PRESCRIPTION_REPO}

Default WAR:
  ${WAR_PATH}
EOF
}

log() {
    printf '[patch-presc-front] %s\n' "$*"
}

fail() {
    printf '[patch-presc-front] ERROR: %s\n' "$*" >&2
    exit 1
}

cleanup() {
    local exit_code=$?

    if [[ -n "$STAGING_DIR" && -d "$STAGING_DIR" ]]; then
        rm -rf -- "$STAGING_DIR"
    fi

    if [[ "$PATCH_SUCCEEDED" == false && -n "$BACKUP_PATH" && -f "$BACKUP_PATH" ]]; then
        cp -p -- "$BACKUP_PATH" "$WAR_PATH"
        printf '[patch-presc-front] WAR restored from %s\n' "$BACKUP_PATH" >&2
    fi

    exit "$exit_code"
}

trap cleanup EXIT

while [[ $# -gt 0 ]]; do
    case "$1" in
        --war)
            [[ $# -ge 2 ]] || fail 'Missing path after --war'
            WAR_PATH="$2"
            shift 2
            ;;
        --skip-build)
            BUILD_FRONTEND=false
            shift
            ;;
        -h|--help)
            usage
            exit 0
            ;;
        *)
            fail "Unknown option: $1"
            ;;
    esac
done

command -v zip >/dev/null 2>&1 || fail 'zip is required'
command -v unzip >/dev/null 2>&1 || fail 'unzip is required'

[[ -d "$FRONTEND_DIR" ]] || fail "Prescription frontend not found: $FRONTEND_DIR"
[[ -f "$WAR_PATH" ]] || fail "WAR not found: $WAR_PATH"

if [[ "$BUILD_FRONTEND" == true ]]; then
    command -v npm >/dev/null 2>&1 || fail 'npm is required'
    log 'Building Prescription frontend'
    (
        cd "$FRONTEND_DIR"
        npm run build
    )
fi

[[ -f "$DIST_DIR/index.html" ]] || fail "Frontend build not found: $DIST_DIR"

WAR_PATH="$(realpath "$WAR_PATH")"
BACKUP_PATH="${WAR_PATH}.before-presc-front-$(date '+%Y%m%d-%H%M%S').bak"
STAGING_DIR="$(mktemp -d "${TMPDIR:-/tmp}/patch-presc-front.XXXXXX")"

log "Backing up WAR to $BACKUP_PATH"
cp -p -- "$WAR_PATH" "$BACKUP_PATH"

mkdir -p "$STAGING_DIR/webapp/prescription"
cp -a "$DIST_DIR/." "$STAGING_DIR/webapp/prescription/"

PRESCRIPTION_ENTRIES="$(unzip -Z1 "$WAR_PATH" 'webapp/prescription/*')"
if [[ -z "$PRESCRIPTION_ENTRIES" ]]; then
    fail 'The WAR does not contain webapp/prescription'
fi

log "Replacing webapp/prescription in $WAR_PATH"
zip -dq "$WAR_PATH" 'webapp/prescription/*'
(
    cd "$STAGING_DIR"
    zip -qr "$WAR_PATH" webapp/prescription
)

unzip -tq "$WAR_PATH"

INDEX_CONTENT="$(unzip -p "$WAR_PATH" webapp/prescription/index.html)"
if [[ "$INDEX_CONTENT" != *'<base href="/orme/webapp/prescription/">'* ]]; then
    fail 'The patched index.html does not contain the expected Prescription base href'
fi

PATCH_SUCCEEDED=true
log 'Prescription frontend patched successfully'
log "WAR: $WAR_PATH"
log "Backup: $BACKUP_PATH"
