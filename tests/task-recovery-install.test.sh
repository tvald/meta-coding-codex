#!/bin/sh

set -eu

PROGRAM=${0##*/}
SCRIPT_DIR=$(CDPATH='' cd "$(dirname "$0")" && pwd -P)
REPOSITORY_ROOT=$(CDPATH='' cd "$SCRIPT_DIR/.." && pwd -P)

for command_name in bash cmp cp git grep ln mkdir mktemp node rm touch unzip zip; do
    command -v "$command_name" >/dev/null 2>&1 || {
        printf '%s: required command not found: %s\n' "$PROGRAM" "$command_name" >&2
        exit 1
    }
done

TEST_ROOT=$(mktemp -d)
ARCHIVE=$TEST_ROOT/core.zip
MOCK_BIN=$TEST_ROOT/bin
FAIL_BIN=$TEST_ROOT/fail-bin
SIGNAL_BIN=$TEST_ROOT/signal-bin
trap 'rm -rf "$TEST_ROOT"' EXIT HUP INT QUIT TERM

"$REPOSITORY_ROOT/scripts/package-core.sh" "$ARCHIVE" >/dev/null
mkdir "$MOCK_BIN"
cp "$SCRIPT_DIR/support/mock-core-curl.sh" "$MOCK_BIN/curl"
chmod 0755 "$MOCK_BIN/curl"
export FRAMEWORK_CORE_ARCHIVE="$ARCHIVE"
REAL_LN=$(command -v ln)
REAL_CMP=$(command -v cmp)
SIGNAL_MARKER=$TEST_ROOT/signal-fired
export REAL_LN REAL_CMP SIGNAL_MARKER

install_fixture() {
    _fixture=$1
    (
        cd "$_fixture"
        PATH="$MOCK_BIN:$PATH" bash "$REPOSITORY_ROOT/scripts/install-core.sh" >/dev/null
    )
}

FRESH=$TEST_ROOT/fresh
mkdir "$FRESH"
git -C "$FRESH" init -q
install_fixture "$FRESH"
cmp "$REPOSITORY_ROOT/.agents/skills/task-recovery/SKILL.md" \
    "$FRESH/.agents/skills/task-recovery/SKILL.md"
cmp "$REPOSITORY_ROOT/.agents/skills/task-recovery/agents/openai.yaml" \
    "$FRESH/.agents/skills/task-recovery/agents/openai.yaml"
cmp "$REPOSITORY_ROOT/.claude/skills/task-recovery/SKILL.md" \
    "$FRESH/.claude/skills/task-recovery/SKILL.md"

CANONICAL_COLLISION=$TEST_ROOT/canonical-collision
mkdir -p "$CANONICAL_COLLISION/.agents/skills/task-recovery"
git -C "$CANONICAL_COLLISION" init -q
printf '%s\n' 'host task recovery skill' > "$CANONICAL_COLLISION/.agents/skills/task-recovery/SKILL.md"
install_fixture "$CANONICAL_COLLISION"
grep -Fqx 'host task recovery skill' "$CANONICAL_COLLISION/.agents/skills/task-recovery/SKILL.md"
[ ! -e "$CANONICAL_COLLISION/.agents/skills/task-recovery/agents/openai.yaml" ]
[ ! -e "$CANONICAL_COLLISION/.claude/skills/task-recovery/SKILL.md" ]
grep -Fq 'Discovery alone is not provenance' "$CANONICAL_COLLISION/AGENTS.md"

CLAUDE_COLLISION=$TEST_ROOT/claude-collision
mkdir -p "$CLAUDE_COLLISION/.claude/skills/task-recovery"
git -C "$CLAUDE_COLLISION" init -q
printf '%s\n' 'host Claude task recovery' > "$CLAUDE_COLLISION/.claude/skills/task-recovery/SKILL.md"
install_fixture "$CLAUDE_COLLISION"
grep -Fqx 'host Claude task recovery' "$CLAUDE_COLLISION/.claude/skills/task-recovery/SKILL.md"
[ ! -e "$CLAUDE_COLLISION/.agents/skills/task-recovery/SKILL.md" ]

EXTERNAL=$TEST_ROOT/external
SYMLINK_COLLISION=$TEST_ROOT/symlink-collision
mkdir "$EXTERNAL" "$SYMLINK_COLLISION"
git -C "$SYMLINK_COLLISION" init -q
mkdir -p "$SYMLINK_COLLISION/.agents/skills"
printf '%s\n' 'outside remains' > "$EXTERNAL/marker"
ln -s "$EXTERNAL" "$SYMLINK_COLLISION/.agents/skills/task-recovery"
install_fixture "$SYMLINK_COLLISION"
grep -Fqx 'outside remains' "$EXTERNAL/marker"
[ ! -e "$SYMLINK_COLLISION/.claude/skills/task-recovery/SKILL.md" ]

PARTIAL_FAILURE=$TEST_ROOT/partial-failure
mkdir "$PARTIAL_FAILURE" "$FAIL_BIN"
git -C "$PARTIAL_FAILURE" init -q
cp "$SCRIPT_DIR/support/mock-core-curl.sh" "$FAIL_BIN/curl"
cp "$SCRIPT_DIR/support/mock-task-recovery-skill-ln.sh" "$FAIL_BIN/ln"
chmod 0755 "$FAIL_BIN/curl" "$FAIL_BIN/ln"
(
    cd "$PARTIAL_FAILURE"
    PATH="$FAIL_BIN:$PATH" bash "$REPOSITORY_ROOT/scripts/install-core.sh" >/dev/null
)
[ ! -e "$PARTIAL_FAILURE/.agents/skills/task-recovery/SKILL.md" ]
[ ! -e "$PARTIAL_FAILURE/.agents/skills/task-recovery/agents/openai.yaml" ]
[ ! -e "$PARTIAL_FAILURE/.claude/skills/task-recovery/SKILL.md" ]

SIGNAL_FIXTURE=$TEST_ROOT/signal-fixture
mkdir "$SIGNAL_FIXTURE" "$SIGNAL_BIN"
git -C "$SIGNAL_FIXTURE" init -q
cp "$SCRIPT_DIR/support/mock-core-curl.sh" "$SIGNAL_BIN/curl"
cp "$SCRIPT_DIR/support/mock-task-recovery-signal-cmp.sh" "$SIGNAL_BIN/cmp"
chmod 0755 "$SIGNAL_BIN/curl" "$SIGNAL_BIN/cmp"
(
    cd "$SIGNAL_FIXTURE"
    PATH="$SIGNAL_BIN:$PATH" bash "$REPOSITORY_ROOT/scripts/install-core.sh" >/dev/null
)
[ -f "$SIGNAL_MARKER" ]
cmp "$REPOSITORY_ROOT/.agents/skills/task-recovery/SKILL.md" \
    "$SIGNAL_FIXTURE/.agents/skills/task-recovery/SKILL.md"
cmp "$REPOSITORY_ROOT/.agents/skills/task-recovery/agents/openai.yaml" \
    "$SIGNAL_FIXTURE/.agents/skills/task-recovery/agents/openai.yaml"
cmp "$REPOSITORY_ROOT/.claude/skills/task-recovery/SKILL.md" \
    "$SIGNAL_FIXTURE/.claude/skills/task-recovery/SKILL.md"

printf '%s\n' 'task-recovery installer fixtures passed'
