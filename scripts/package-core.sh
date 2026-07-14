#!/bin/sh

set -eu

PROGRAM=${0##*/}

usage() {
    cat <<EOF
Usage: $PROGRAM [OUTPUT.zip]

Package the portable framework core as a zip archive.

The default output is dist/ai-coding-meta-framework-core.zip relative to the
repository root. A relative custom output path is resolved from the current working
directory. Output paths containing a '..' segment are rejected.
EOF
}

fail() {
    printf '%s: %s\n' "$PROGRAM" "$*" >&2
    exit 1
}

case $# in
    0)
        ;;
    1)
        case $1 in
            -h|--help)
                usage
                exit 0
                ;;
        esac
        ;;
    *)
        usage >&2
        exit 2
        ;;
esac

for command_name in awk basename chmod cmp cp dirname find grep mkdir mktemp mv pwd \
    rm rmdir sort touch unzip zip; do
    command -v "$command_name" >/dev/null 2>&1 ||
        fail "required command not found: $command_name"
done

SCRIPT_DIR=$(CDPATH='' cd "$(dirname "$0")" && pwd -P)
REPOSITORY_ROOT=$(CDPATH='' cd "$SCRIPT_DIR/.." && pwd -P)
README_SOURCE=$REPOSITORY_ROOT/readme
META_SOURCE=$README_SOURCE/meta
AGENTS_SOURCE=$REPOSITORY_ROOT/AGENTS.md

[ -d "$README_SOURCE" ] || fail "missing documentation directory: $README_SOURCE"
[ ! -L "$README_SOURCE" ] || fail "documentation directory must not be a symbolic link"
[ -d "$META_SOURCE" ] || fail "missing core directory: $META_SOURCE"
[ ! -L "$META_SOURCE" ] || fail "core directory must not be a symbolic link"
[ -f "$AGENTS_SOURCE" ] || fail "missing startup source: $AGENTS_SOURCE"
[ ! -L "$AGENTS_SOURCE" ] || fail "startup source must not be a symbolic link"

MARKER_COUNT=$(grep -c '^## Operating Contract$' "$AGENTS_SOURCE" || true)
[ "$MARKER_COUNT" -eq 1 ] ||
    fail "AGENTS.md must contain exactly one '## Operating Contract' boundary"

UNEXPECTED_CORE_ENTRIES=$(find "$META_SOURCE" \
    \( \( ! -type d ! -type f \) -o \( -type f ! -name '*.md' \) \) -print)
[ -z "$UNEXPECTED_CORE_ENTRIES" ] || {
    printf '%s: portable core contains unsupported files:\n%s\n' \
        "$PROGRAM" "$UNEXPECTED_CORE_ENTRIES" >&2
    exit 1
}

if [ $# -eq 0 ]; then
    OUTPUT=$REPOSITORY_ROOT/dist/ai-coding-meta-framework-core.zip
else
    case $1 in
        /*) OUTPUT=$1 ;;
        *) OUTPUT=$(pwd -P)/$1 ;;
    esac
fi

case $OUTPUT in
    *.zip) ;;
    *) fail "output path must end in .zip: $OUTPUT" ;;
esac

OUTPUT_DIRECTORY=$(dirname "$OUTPUT")
OUTPUT_NAME=$(basename "$OUTPUT")

case /$OUTPUT_DIRECTORY/ in
    */../*) fail "output path must not contain a '..' segment: $OUTPUT" ;;
esac

EXISTING_OUTPUT_ANCESTOR=$OUTPUT_DIRECTORY
while [ ! -d "$EXISTING_OUTPUT_ANCESTOR" ]; do
    PARENT_OUTPUT_ANCESTOR=$(dirname "$EXISTING_OUTPUT_ANCESTOR")
    [ "$PARENT_OUTPUT_ANCESTOR" != "$EXISTING_OUTPUT_ANCESTOR" ] ||
        fail "cannot resolve output directory: $OUTPUT_DIRECTORY"
    EXISTING_OUTPUT_ANCESTOR=$PARENT_OUTPUT_ANCESTOR
done
EXISTING_OUTPUT_ANCESTOR=$(CDPATH='' cd "$EXISTING_OUTPUT_ANCESTOR" && pwd -P)
case $EXISTING_OUTPUT_ANCESTOR in
    "$META_SOURCE"|"$META_SOURCE"/*)
        fail "output path must not be inside readme/meta: $OUTPUT"
        ;;
esac

mkdir -p "$OUTPUT_DIRECTORY"
OUTPUT_DIRECTORY=$(CDPATH='' cd "$OUTPUT_DIRECTORY" && pwd -P)
OUTPUT=$OUTPUT_DIRECTORY/$OUTPUT_NAME

case $OUTPUT in
    "$META_SOURCE"/*) fail "output path must not be inside readme/meta: $OUTPUT" ;;
esac

[ ! -d "$OUTPUT" ] || fail "output path is a directory: $OUTPUT"
[ ! -L "$OUTPUT" ] || fail "refusing to replace symbolic link: $OUTPUT"

umask 022
export LC_ALL=C
export TZ=UTC
unset ZIPOPT UNZIP UNZIPOPT ZIPINFO ZIPINFOOPT

WORK_DIRECTORY=$(mktemp -d "$OUTPUT_DIRECTORY/.framework-core.XXXXXX")
STAGING_DIRECTORY=$WORK_DIRECTORY/stage
TEMPORARY_ARCHIVE=$WORK_DIRECTORY/archive.zip

cleanup() {
    rm -f "$TEMPORARY_ARCHIVE"
    rm -rf "$STAGING_DIRECTORY"
    rmdir "$WORK_DIRECTORY" 2>/dev/null || true
}

trap cleanup 0
trap 'exit 1' HUP INT QUIT TERM

mkdir -p "$STAGING_DIRECTORY/readme"
cp -pR "$META_SOURCE" "$STAGING_DIRECTORY/readme/meta"
awk '/^## Operating Contract$/ { exit } { print }' \
    "$AGENTS_SOURCE" > "$STAGING_DIRECTORY/AGENTS.md"

[ -s "$STAGING_DIRECTORY/AGENTS.md" ] || fail "portable AGENTS.md is empty"
grep -q '\[readme/meta/README.md\](readme/meta/README.md)' \
    "$STAGING_DIRECTORY/AGENTS.md" ||
    fail "portable AGENTS.md does not link the framework entrypoint"
if grep -q '^## Operating Contract$\|Standing delegation request' \
    "$STAGING_DIRECTORY/AGENTS.md"; then
    fail "portable AGENTS.md contains project-local operating guidance"
fi

find "$STAGING_DIRECTORY/readme/meta" -type d -exec chmod 0755 {} \;
find "$STAGING_DIRECTORY/AGENTS.md" "$STAGING_DIRECTORY/readme/meta" \
    -type f -exec chmod 0644 {} \;
find "$STAGING_DIRECTORY/AGENTS.md" "$STAGING_DIRECTORY/readme/meta" \
    -type f -exec touch -t 200001010000 {} \;

EXPECTED_INVENTORY=$STAGING_DIRECTORY/expected-inventory.txt
ACTUAL_INVENTORY=$STAGING_DIRECTORY/actual-inventory.txt
(
    cd "$STAGING_DIRECTORY"
    find AGENTS.md readme/meta -type f -print | sort > "$EXPECTED_INVENTORY"
)

(
    cd "$STAGING_DIRECTORY"
    zip -X -q "$TEMPORARY_ARCHIVE" -@ < "$EXPECTED_INVENTORY"
)

[ -s "$TEMPORARY_ARCHIVE" ] || fail "zip did not produce an archive"
unzip -tq "$TEMPORARY_ARCHIVE" >/dev/null || fail "zip integrity check failed"
unzip -Z1 "$TEMPORARY_ARCHIVE" > "$ACTUAL_INVENTORY"
cmp -s "$EXPECTED_INVENTORY" "$ACTUAL_INVENTORY" ||
    fail "zip inventory differs from the portable core allowlist"

mv -f "$TEMPORARY_ARCHIVE" "$OUTPUT"

printf 'Created %s\n' "$OUTPUT"
