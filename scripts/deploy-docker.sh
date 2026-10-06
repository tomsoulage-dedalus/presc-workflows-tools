#!/bin/bash
set -euo pipefail

# =============================================================================
# USER CONFIGURATION
# Set the path of your local orme-presc-admin repository (or export PRESC_ADMIN_REPO).
# =============================================================================

PRESC_ADMIN_REPO="${PRESC_ADMIN_REPO:-${HOME}/repos/orme-presc-admin}"

# =============================================================================

WAR_PATH="${PRESC_ADMIN_REPO}/deployment/presc-admin-war/target/orme-presc-admin.war"
CONTAINER="oas-orme-medication"
JBOSS_CLI="/opt/orbis/oas/server/as/bin/jboss-cli.sh"

usage() {
    cat <<EOF
Usage:
  $(basename "$0") [options]

Deploys a WAR into the OAS running in a docker container (orme-test-deploy).

Options:
  --war PATH         Override the configured WAR path
  --container NAME   Override the configured container name
  -h, --help         Show this help message

Default WAR:
  ${WAR_PATH}

Default container:
  ${CONTAINER}
EOF
}

while [[ $# -gt 0 ]]; do
    case "$1" in
        --war)
            WAR_PATH="$2"
            shift 2
            ;;
        --container)
            CONTAINER="$2"
            shift 2
            ;;
        -h|--help)
            usage
            exit 0
            ;;
        *)
            echo "Unknown option: $1" >&2
            usage >&2
            exit 1
            ;;
    esac
done

[[ -f "$WAR_PATH" ]] || { echo "WAR not found: $WAR_PATH" >&2; exit 1; }
docker inspect -f '{{.State.Running}}' "$CONTAINER" 2>/dev/null | grep -q true \
    || { echo "Container not running: $CONTAINER" >&2; exit 1; }

WAR_NAME="$(basename "$WAR_PATH")"
REMOTE_WAR="/tmp/$WAR_NAME"

docker cp "$WAR_PATH" "$CONTAINER:$REMOTE_WAR"
trap 'docker exec "$CONTAINER" rm -f "$REMOTE_WAR" >/dev/null 2>&1 || true' EXIT

echo "Deploying $WAR_NAME in $CONTAINER..."
# The answer "T" temporarily accepts the self-signed management certificate; it must be piped inside the container.
OUTPUT="$(docker exec "$CONTAINER" sh -c \
    "printf 'T\n' | '$JBOSS_CLI' --connect --command='deploy --force $REMOTE_WAR'" 2>&1 || true)"
OUTPUT="$(grep -v \
    -e '^Unable to connect due to unrecognised server certificate' \
    -e '^Subject' -e '^Issuer' -e '^Valid' -e '^MD5' -e '^SHA1' \
    -e '^Accept certificate' -e '^[[:space:]]*$' <<< "$OUTPUT" || true)"
[[ -n "$OUTPUT" ]] && echo "$OUTPUT"

if grep -qiE 'fail|error|unable' <<< "$OUTPUT"; then
    printf "\033[31m%s DEPLOYMENT FAILED\033[0m\n" "$WAR_NAME" >&2
    exit 1
fi
printf "\033[32m%s DEPLOYED IN %s\033[0m\n" "$WAR_NAME" "$CONTAINER"
