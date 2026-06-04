#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
APPLET_DIR="$SCRIPT_DIR/../atcinna@H234598"
APPLET_ID="atcinna@H234598"
VERSION_FILE="$SCRIPT_DIR/../VERSION"
DEFAULT_TARGET_DIR="${HOME}/.local/share/cinnamon/applets"

usage() {
    cat <<'EOF'
Usage:
  ./scripts/install-local.sh [--dry-run] [--target-dir DIR] [--skip-validate-installed]
EOF
}

TARGET_DIR="$DEFAULT_TARGET_DIR"
DRY_RUN=0
RUN_VALIDATION=1

while [[ $# -gt 0 ]]; do
    case "$1" in
        --dry-run)
            DRY_RUN=1
            shift
            ;;
        --target-dir)
            if [[ $# -lt 2 ]]; then
                echo "ERROR: --target-dir requires a directory argument"
                usage
                exit 1
            fi
            TARGET_DIR="$2"
            shift 2
            ;;
        --skip-validate-installed)
            RUN_VALIDATION=0
            shift
            ;;
        -h|--help)
            usage
            exit 0
            ;;
        *)
            echo "ERROR: unknown option: $1"
            usage
            exit 1
            ;;
    esac
done

if ! command -v rsync >/dev/null 2>&1; then
    echo "ERROR: required command missing: rsync"
    exit 1
fi

if [[ ! -d "$APPLET_DIR" ]]; then
    echo "ERROR: applet directory not found: $APPLET_DIR"
    exit 1
fi

if [[ ! -x "$APPLET_DIR/scripts/atcinna-catalog" ]]; then
    echo "ERROR: helper is not executable in source: $APPLET_DIR/scripts/atcinna-catalog"
    exit 1
fi

if ! "$SCRIPT_DIR/check.sh" --skip-self-install; then
    echo "ERROR: ./scripts/check.sh failed"
    exit 1
fi

if [[ "$DRY_RUN" -eq 1 ]]; then
    echo "DRY-RUN: would install from $(realpath --canonicalize-missing "$APPLET_DIR") to $TARGET_DIR/$APPLET_ID"
    echo "DRY-RUN: running check passed"
    exit 0
fi

TARGET_DIR="$(realpath --canonicalize-missing "$TARGET_DIR")"
INSTALL_ROOT="$TARGET_DIR/$APPLET_ID"
STAGING_ROOT="$(mktemp -d)"
WORK_ROOT="$(mktemp -d)"
TARGET_BACKUP="$TARGET_DIR/.${APPLET_ID}.backup.$$"
TARGET_TEMP="$TARGET_DIR/.${APPLET_ID}.install.$$"

cleanup() {
    rm -rf "$STAGING_ROOT" "$WORK_ROOT" "$TARGET_TEMP"
}
trap cleanup EXIT

mkdir -p "$WORK_ROOT"
mkdir -p "$TARGET_DIR"

rsync -a \
    --delete \
    "$APPLET_DIR/"/ \
    "$STAGING_ROOT/$APPLET_ID/"

cp -a "$STAGING_ROOT/$APPLET_ID" "$WORK_ROOT/$APPLET_ID"

mv "$WORK_ROOT/$APPLET_ID" "$TARGET_TEMP"
if [[ -e "$INSTALL_ROOT" ]]; then
    if [[ -e "$TARGET_BACKUP" ]]; then
        echo "ERROR: backup target already exists: $TARGET_BACKUP"
        exit 1
    fi
    mv "$INSTALL_ROOT" "$TARGET_BACKUP"
fi

if ! mv "$TARGET_TEMP" "$INSTALL_ROOT"; then
    if [[ -e "$TARGET_BACKUP" && ! -e "$INSTALL_ROOT" ]]; then
        mv "$TARGET_BACKUP" "$INSTALL_ROOT"
    fi
    echo "ERROR: failed to move staged applet into target"
    exit 1
fi

if [[ -e "$TARGET_BACKUP" ]]; then
    rm -rf "$TARGET_BACKUP"
fi

if [[ ! -x "$INSTALL_ROOT/scripts/atcinna-catalog" ]]; then
    echo "ERROR: installed helper is not executable: $INSTALL_ROOT/scripts/atcinna-catalog"
    exit 1
fi

if [[ "$RUN_VALIDATION" -eq 1 ]]; then
    if [[ ! -f "$VERSION_FILE" ]]; then
        echo "ERROR: VERSION file not found: $VERSION_FILE"
        exit 1
    fi
    VERSION_VALUE="$(cat "$VERSION_FILE" | tr -d '[:space:]')"
    if [[ -z "$VERSION_VALUE" ]]; then
        echo "ERROR: VERSION is empty"
        exit 1
    fi
    if ! "$SCRIPT_DIR/validate-installed.sh" --target-dir "$TARGET_DIR" --version "$VERSION_VALUE"; then
        echo "ERROR: validate-installed.sh failed for installation target"
        exit 1
    fi
fi

echo "Installed ATCinna to $INSTALL_ROOT"
