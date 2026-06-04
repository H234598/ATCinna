#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
APPLET_ID="atcinna@H234598"
APPLET_DIR="$REPO_ROOT/$APPLET_ID"
VERSION_FILE="$REPO_ROOT/VERSION"
DIST_DIR="$REPO_ROOT/dist"
ARTIFACT=""
SKIP_CHECK=0

usage() {
    cat <<'EOF'
Usage:
  ./scripts/package.sh [--skip-check] [--dist-dir DIR]
EOF
}

while [[ $# -gt 0 ]]; do
    case "$1" in
        --skip-check)
            SKIP_CHECK=1
            shift
            ;;
        --dist-dir)
            if [[ $# -lt 2 ]]; then
                echo "ERROR: --dist-dir requires a directory argument"
                usage
                exit 1
            fi
            DIST_DIR="$2"
            shift 2
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

if [[ ! -f "$VERSION_FILE" ]]; then
    echo "ERROR: VERSION file not found: $VERSION_FILE"
    exit 1
fi

VERSION="$(cat "$VERSION_FILE" | tr -d '[:space:]')"
if [[ -z "$VERSION" ]]; then
    echo "ERROR: VERSION is empty"
    exit 1
fi

if [[ "$SKIP_CHECK" -eq 0 ]]; then
    if ! "$SCRIPT_DIR/check.sh"; then
        echo "ERROR: ./scripts/check.sh failed"
        exit 1
    fi
fi

if [[ ! -d "$APPLET_DIR" ]]; then
    echo "ERROR: applet directory not found: $APPLET_DIR"
    exit 1
fi

mkdir -p "$DIST_DIR"
ARTIFACT="$DIST_DIR/$APPLET_ID-$VERSION.tar.gz"

TMP_DIR="$(mktemp -d)"
cleanup() {
    rm -rf "$TMP_DIR"
}
trap cleanup EXIT

mkdir -p "$TMP_DIR/$APPLET_ID"
rsync -a \
    --exclude='.git' \
    --exclude='dist' \
    --exclude='__pycache__' \
    --exclude='.pytest_cache' \
    --exclude='*.pyc' \
    --exclude='*~' \
    "$APPLET_DIR/"/ \
    "$TMP_DIR/$APPLET_ID"/

tar -C "$TMP_DIR" -czf "$ARTIFACT" "$APPLET_ID"
echo "Created $ARTIFACT"
