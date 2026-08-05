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
FRAMEWORK_CHANGELOG_SOURCE=$META_SOURCE/framework-changelog.md
AGENTS_SOURCE=$REPOSITORY_ROOT/AGENTS.md
CLAUDE_AGENTS_SOURCE=$REPOSITORY_ROOT/.claude/agents
CLAUDE_SKILLS_SOURCE=$REPOSITORY_ROOT/.claude/skills
CODEX_AGENTS_SOURCE=$REPOSITORY_ROOT/.codex/agents
SKILLS_SOURCE=$REPOSITORY_ROOT/.agents/skills

[ -d "$README_SOURCE" ] || fail "missing documentation directory: $README_SOURCE"
[ ! -L "$README_SOURCE" ] || fail "documentation directory must not be a symbolic link"
[ -d "$META_SOURCE" ] || fail "missing core directory: $META_SOURCE"
[ ! -L "$META_SOURCE" ] || fail "core directory must not be a symbolic link"
[ -f "$FRAMEWORK_CHANGELOG_SOURCE" ] ||
    fail "missing framework changelog seed: $FRAMEWORK_CHANGELOG_SOURCE"
[ ! -L "$FRAMEWORK_CHANGELOG_SOURCE" ] ||
    fail "framework changelog seed must not be a symbolic link"
[ -f "$AGENTS_SOURCE" ] || fail "missing startup source: $AGENTS_SOURCE"
[ ! -L "$AGENTS_SOURCE" ] || fail "startup source must not be a symbolic link"

# Optional harness adapters (Claude Code and Codex agent definitions, plus the Codex
# quota-monitor skill) ship inside the same portable core so a destination that uses
# those harnesses receives their discovery metadata. Each is a required source in this
# repository; the installer decides per file whether to add or preserve it.
[ -d "$CLAUDE_AGENTS_SOURCE" ] || fail "missing adapter directory: $CLAUDE_AGENTS_SOURCE"
[ ! -L "$CLAUDE_AGENTS_SOURCE" ] || fail "adapter directory must not be a symbolic link"
[ -d "$CLAUDE_SKILLS_SOURCE" ] || fail "missing skill directory: $CLAUDE_SKILLS_SOURCE"
[ ! -L "$CLAUDE_SKILLS_SOURCE" ] || fail "skill directory must not be a symbolic link"
[ -d "$CODEX_AGENTS_SOURCE" ] || fail "missing adapter directory: $CODEX_AGENTS_SOURCE"
[ ! -L "$CODEX_AGENTS_SOURCE" ] || fail "adapter directory must not be a symbolic link"
[ -d "$SKILLS_SOURCE" ] || fail "missing skill directory: $SKILLS_SOURCE"
[ ! -L "$SKILLS_SOURCE" ] || fail "skill directory must not be a symbolic link"

MARKER_COUNT=$(grep -c '^## Operating Contract$' "$AGENTS_SOURCE" || true)
[ "$MARKER_COUNT" -eq 1 ] ||
    fail "AGENTS.md must contain exactly one '## Operating Contract' boundary"

# Restrict every packaged tree to plain directories and the file types each surface is
# allowed to publish: Markdown for the core and Claude adapters, TOML for the Codex
# adapters, and Markdown or YAML for the skill.
UNEXPECTED_CORE_ENTRIES=$(
    find "$META_SOURCE" \
        \( \( ! -type d ! -type f \) -o \( -type f ! -name '*.md' \) \) -print
    find "$CLAUDE_AGENTS_SOURCE" \
        \( \( ! -type d ! -type f \) -o \( -type f ! -name '*.md' \) \) -print
    find "$CLAUDE_SKILLS_SOURCE" \
        \( \( ! -type d ! -type f \) -o \( -type f ! -name '*.md' ! -name '*.yaml' \) \) \
        -print
    find "$CODEX_AGENTS_SOURCE" \
        \( \( ! -type d ! -type f \) -o \( -type f ! -name '*.toml' \) \) -print
    find "$SKILLS_SOURCE" \
        \( \( ! -type d ! -type f \) -o \( -type f ! -name '*.md' ! -name '*.yaml' \) \) \
        -print
)
[ -z "$UNEXPECTED_CORE_ENTRIES" ] || {
    printf '%s: portable core contains unsupported files:\n%s\n' \
        "$PROGRAM" "$UNEXPECTED_CORE_ENTRIES" >&2
    exit 1
}

CHANGELOG_MARKER='<!-- Local framework entries go below this line. -->'
CHANGELOG_MARKER_COUNT=$(grep -Fxc "$CHANGELOG_MARKER" "$FRAMEWORK_CHANGELOG_SOURCE" || true)
[ "$CHANGELOG_MARKER_COUNT" -eq 1 ] ||
    fail "framework changelog seed must contain exactly one local-entry marker"
if grep -Eq '^## [0-9]{4}-[0-9]{2}-[0-9]{2}: ' "$FRAMEWORK_CHANGELOG_SOURCE"; then
    fail "framework changelog seed contains a dated local entry; transfer its evidence and restore the blank seed"
fi
if awk -v marker="$CHANGELOG_MARKER" '
    seen && NF { populated = 1 }
    $0 == marker { seen = 1 }
    END { exit populated ? 0 : 1 }
' "$FRAMEWORK_CHANGELOG_SOURCE"; then
    fail "framework changelog seed contains local entries; transfer their evidence and restore the blank seed"
fi

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
mkdir -p "$STAGING_DIRECTORY/.claude"
cp -pR "$CLAUDE_AGENTS_SOURCE" "$STAGING_DIRECTORY/.claude/agents"
cp -pR "$CLAUDE_SKILLS_SOURCE" "$STAGING_DIRECTORY/.claude/skills"
mkdir -p "$STAGING_DIRECTORY/.codex"
cp -pR "$CODEX_AGENTS_SOURCE" "$STAGING_DIRECTORY/.codex/agents"
mkdir -p "$STAGING_DIRECTORY/.agents"
cp -pR "$SKILLS_SOURCE" "$STAGING_DIRECTORY/.agents/skills"
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

find "$STAGING_DIRECTORY/readme/meta" "$STAGING_DIRECTORY/.claude" \
    "$STAGING_DIRECTORY/.codex" "$STAGING_DIRECTORY/.agents" \
    -type d -exec chmod 0755 {} \;
find "$STAGING_DIRECTORY/AGENTS.md" "$STAGING_DIRECTORY/readme/meta" \
    "$STAGING_DIRECTORY/.claude" "$STAGING_DIRECTORY/.codex" \
    "$STAGING_DIRECTORY/.agents" -type f -exec chmod 0644 {} \;
find "$STAGING_DIRECTORY/AGENTS.md" "$STAGING_DIRECTORY/readme/meta" \
    "$STAGING_DIRECTORY/.claude" "$STAGING_DIRECTORY/.codex" \
    "$STAGING_DIRECTORY/.agents" -type f -exec touch -t 200001010000 {} \;

EXPECTED_INVENTORY=$STAGING_DIRECTORY/expected-inventory.txt
ACTUAL_INVENTORY=$STAGING_DIRECTORY/actual-inventory.txt
(
    cd "$STAGING_DIRECTORY"
    find AGENTS.md readme/meta .claude .codex .agents -type f -print |
        sort > "$EXPECTED_INVENTORY"
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
