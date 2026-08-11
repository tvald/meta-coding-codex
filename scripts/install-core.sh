#!/usr/bin/env bash
{ FRAMEWORK_INSTALLER_STREAM_COMPLETE=false; trap 'if [ "$FRAMEWORK_INSTALLER_STREAM_COMPLETE" != true ]; then printf "%s\n" "install-core.sh: installer stream ended before completion" >&2; exit 1; fi' EXIT; }

# The guard above must remain the first executable statement. A direct `curl | bash`
# pipeline reports Bash rather than curl status. Once this compound has loaded, its EXIT
# trap makes an incomplete stream fail before the final invocation can run.

framework_core_inventory() {
    printf '%s\n' \
        '.agents/skills/codex-quota-monitor/SKILL.md' \
        '.agents/skills/codex-quota-monitor/agents/openai.yaml' \
        '.agents/skills/project-onboarding/SKILL.md' \
        '.agents/skills/project-onboarding/agents/openai.yaml' \
        '.agents/skills/task-recovery/SKILL.md' \
        '.agents/skills/task-recovery/agents/openai.yaml' \
        '.claude/agents/reviewer.md' \
        '.claude/agents/security-reviewer.md' \
        '.claude/agents/verifier.md' \
        '.claude/skills/claude-quota-monitor/SKILL.md' \
        '.claude/skills/project-onboarding/SKILL.md' \
        '.claude/skills/task-recovery/SKILL.md' \
        '.codex/agents/reviewer.toml' \
        '.codex/agents/security-reviewer.toml' \
        '.codex/agents/verifier.toml' \
        'AGENTS.md' \
        'readme/meta/README.md' \
        'readme/meta/agent-definitions.md' \
        'readme/meta/automation-policy.md' \
        'readme/meta/development-standards.md' \
        'readme/meta/framework-changelog.md' \
        'readme/meta/framework-data/cli.mjs' \
        'readme/meta/framework-data/framework-checks.mjs' \
        'readme/meta/framework-data/importer.mjs' \
        'readme/meta/framework-data/schema.mjs' \
        'readme/meta/framework-data/schemas/control-v1.schema.json' \
        'readme/meta/framework-data/schemas/task-v1.schema.json' \
        'readme/meta/framework-data/store.mjs' \
        'readme/meta/framework-improvement.md' \
        'readme/meta/knowledge-ingestion.md' \
        'readme/meta/knowledge-management.md' \
        'readme/meta/onboarding.md' \
        'readme/meta/quality-system.md' \
        'readme/meta/references.md' \
        'readme/meta/resumption-protocol.md' \
        'readme/meta/root-loop.md' \
        'readme/meta/templates/assumptions.md' \
        'readme/meta/templates/decision-record.md' \
        'readme/meta/templates/incident-note.md' \
        'readme/meta/templates/project-brief.md' \
        'readme/meta/templates/project-context.md' \
        'readme/meta/templates/project-state.md' \
        'readme/meta/templates/quality-record.md' \
        'readme/meta/templates/standards.md' \
        'readme/meta/templates/task-brief.md' \
        'readme/meta/templates/task-catalog.md' \
        'readme/meta/templates/task-notes.md' \
        'readme/meta/templates/threat-model-card.md' \
        'readme/meta/workflow-routing.md'
}

# Keep all work inside this function. When the script is streamed into Bash, a transfer
# truncated before the final invocation cannot begin installation.
install_framework_core() {
    set -euo pipefail

    PROGRAM=install-core.sh
    ARCHIVE_URL=https://github.com/tvald/meta-coding-codex/releases/download/latest/ai-coding-meta-framework-core.zip

    fail() {
        printf '%s: %s\n' "$PROGRAM" "$*" >&2
        exit 1
    }

    if [ "$#" -eq 1 ] && [ "$1" = --print-expected-inventory ]; then
        framework_core_inventory
        return 0
    fi
    [ "$#" -eq 0 ] || fail "this installer does not accept those arguments"

    for command_name in awk cmp cp curl find git grep ln mkdir mktemp node pwd rm rmdir \
        sort uniq unzip wc; do
        command -v "$command_name" >/dev/null 2>&1 ||
            fail "required command not found: $command_name"
    done

    DESTINATION_ROOT=$(pwd -P) || fail "cannot resolve the current directory"
    [ "$DESTINATION_ROOT" != / ] || fail "refusing to install into filesystem root"
    PROJECT_GIT_ROOT=$(git rev-parse --show-toplevel 2>/dev/null) ||
        fail "run from the root of an initialized Git repository"
    PROJECT_GIT_ROOT=$(CDPATH='' cd "$PROJECT_GIT_ROOT" && pwd -P) ||
        fail "cannot resolve the Git repository root"
    [ "$PROJECT_GIT_ROOT" = "$DESTINATION_ROOT" ] ||
        fail "run from the root of the Git repository"
    node -e 'const major = Number(process.versions.node.split(".")[0]); process.exit(major >= 22 && process.platform !== "win32" ? 0 : 1)' ||
        fail "Node.js 22 or newer on a supported non-Windows platform is required"

    # Relative paths remain anchored to the directory in which this shell started even
    # if that directory is renamed while installation is in progress.
    README_DESTINATION=readme
    META_DESTINATION=$README_DESTINATION/meta
    AGENTS_DESTINATION=AGENTS.md
    MERGE_DESTINATION=AGENTS.framework.md
    LOCK_DESTINATION=.framework-install.lock

    [ ! -L "$README_DESTINATION" ] ||
        fail "refusing symbolic destination: $README_DESTINATION"
    if [ -e "$README_DESTINATION" ] && [ ! -d "$README_DESTINATION" ]; then
        fail "destination exists and is not a directory: $README_DESTINATION"
    fi
    if [ -e "$META_DESTINATION" ] || [ -L "$META_DESTINATION" ]; then
        fail "refusing to replace existing framework core: $META_DESTINATION"
    fi

    PRESERVE_AGENTS=false
    if [ -e "$MERGE_DESTINATION" ] || [ -L "$MERGE_DESTINATION" ]; then
        fail "refusing to replace existing merge file: $MERGE_DESTINATION"
    fi
    if [ -e "$AGENTS_DESTINATION" ] || [ -L "$AGENTS_DESTINATION" ]; then
        PRESERVE_AGENTS=true
        AGENT_INSTALL_DESTINATION=$MERGE_DESTINATION
    else
        AGENT_INSTALL_DESTINATION=$AGENTS_DESTINATION
    fi

    umask 022
    export LC_ALL=C
    export TZ=UTC
    unset UNZIP UNZIPOPT ZIPINFO ZIPINFOOPT

    WORK_DIRECTORY=$(mktemp -d "./.framework-install.XXXXXX") ||
        fail "cannot create temporary workspace in $DESTINATION_ROOT"
    ARCHIVE=$WORK_DIRECTORY/core.zip
    STAGING_DIRECTORY=$WORK_DIRECTORY/stage
    INVENTORY=$WORK_DIRECTORY/inventory.txt
    SORTED_INVENTORY=$WORK_DIRECTORY/inventory-sorted.txt
    EXPECTED_INVENTORY=$WORK_DIRECTORY/inventory-expected.txt
    EXPECTED_META_INVENTORY=$WORK_DIRECTORY/meta-inventory-expected.txt
    ADAPTER_INVENTORY=$WORK_DIRECTORY/adapter-inventory.txt
    SKILL_NAME_INVENTORY=$WORK_DIRECTORY/skill-name-inventory.txt
    SKILL_FILE_INVENTORY=$WORK_DIRECTORY/skill-file-inventory.txt
    PRESERVED_SKILL_NAMES=$WORK_DIRECTORY/preserved-skill-names.txt
    INSTALLED_ADAPTER_PATHS=$WORK_DIRECTORY/installed-adapter-paths.txt
    LONG_INVENTORY=$WORK_DIRECTORY/inventory-long.txt
    EXTRACTED_INVENTORY=$WORK_DIRECTORY/extracted-inventory.txt
    INSTALLED_META_INVENTORY=$WORK_DIRECTORY/meta-inventory-installed.txt
    OWNER_TOKEN_FILE=$WORK_DIRECTORY/owner-token.txt
    OWNER_TOKEN=${WORK_DIRECTORY##*/}
    printf '%s\n' "$OWNER_TOKEN" > "$OWNER_TOKEN_FILE"

    LOCK_MARKER=$LOCK_DESTINATION/owner
    README_OWNERSHIP_MARKER=$README_DESTINATION/.framework-install-owner
    INSTALL_COMPLETE=false
    OWN_LOCK=false
    OWN_AGENT=false
    OWN_README=false
    SKILL_BUNDLE_ACTIVE=false

    restore_signal_traps() {
        if [ "$SKILL_BUNDLE_ACTIVE" = true ]; then
            trap '' HUP INT QUIT TERM
        else
            trap 'exit 1' HUP INT QUIT TERM
        fi
    }

    owns_marker() {
        [ -f "$1" ] && cmp -s "$OWNER_TOKEN_FILE" "$1"
    }

    cleanup() {
        status=$?
        trap - EXIT HUP INT QUIT TERM

        if [ "$INSTALL_COMPLETE" != true ] &&
            [ "$OWN_LOCK" = true ] && owns_marker "$LOCK_MARKER"; then
            if [ "$OWN_AGENT" = true ] &&
                [ "$AGENT_INSTALL_DESTINATION" -ef "$STAGING_DIRECTORY/AGENTS.md" ]; then
                rm -f "$AGENT_INSTALL_DESTINATION" || true
            fi
            if [ "$OWN_README" = true ] && [ ! -L "$README_DESTINATION" ] &&
                owns_marker "$README_OWNERSHIP_MARKER"; then
                rm -f "$README_OWNERSHIP_MARKER" || true
                rmdir "$README_DESTINATION" 2>/dev/null || true
            fi
        fi

        if [ "$OWN_LOCK" = true ] && owns_marker "$LOCK_MARKER"; then
            rm -f "$LOCK_MARKER" || true
            rmdir "$LOCK_DESTINATION" 2>/dev/null || true
        fi
        rm -rf "$WORK_DIRECTORY" || true
        exit "$status"
    }

    trap cleanup EXIT
    restore_signal_traps

    # Acquire a cooperative installer lock without claiming a path another actor made.
    trap '' HUP INT QUIT TERM
    if mkdir "$LOCK_DESTINATION"; then
        if printf '%s\n' "$OWNER_TOKEN" > "$LOCK_MARKER"; then
            OWN_LOCK=true
        else
            rmdir "$LOCK_DESTINATION" 2>/dev/null || true
            restore_signal_traps
            fail "cannot initialize installer lock: $LOCK_DESTINATION"
        fi
    else
        restore_signal_traps
        fail "another installer or path owns: $LOCK_DESTINATION"
    fi
    restore_signal_traps

    curl --disable \
        --fail \
        --location \
        --max-filesize 10485760 \
        --proto '=https' \
        --proto-redir '=https' \
        --retry 3 \
        --show-error \
        --silent \
        --tlsv1.2 \
        --output "$ARCHIVE" \
        "$ARCHIVE_URL"

    [ -s "$ARCHIVE" ] || fail "downloaded archive is empty"
    unzip -Z1 "$ARCHIVE" > "$INVENTORY" || fail "cannot read archive inventory"
    unzip -Z -l "$ARCHIVE" > "$LONG_INVENTORY" ||
        fail "cannot read archive entry metadata"
    [ -s "$INVENTORY" ] || fail "downloaded archive has no entries"

    ENTRY_COUNT=$(wc -l < "$INVENTORY")
    REGULAR_ENTRY_COUNT=$(awk '$1 ~ /^-/ { count += 1 } END { print count + 0 }' \
        "$LONG_INVENTORY")
    UNCOMPRESSED_SIZE=$(awk '$1 ~ /^-/ { size += $4 } END { print size + 0 }' \
        "$LONG_INVENTORY")
    [ "$ENTRY_COUNT" -le 300 ] || fail "archive contains too many entries"
    [ "$ENTRY_COUNT" -eq "$REGULAR_ENTRY_COUNT" ] ||
        fail "archive contains special entries or malformed names"
    [ "$UNCOMPRESSED_SIZE" -le 10485760 ] ||
        fail "archive expands beyond the 10 MiB safety limit"

    while IFS= read -r entry || [ -n "$entry" ]; do
        case $entry in
            AGENTS.md|readme/meta/*.md|readme/meta/framework-data/*.mjs| \
            readme/meta/framework-data/schemas/*.json| \
            .claude/agents/*.md|.claude/skills/*.md|.claude/skills/*.yaml| \
            .codex/agents/*.toml| \
            .agents/skills/*.md|.agents/skills/*.yaml)
                ;;
            *)
                fail "archive contains an unexpected entry: $entry"
                ;;
        esac
        case /$entry/ in
            */../*|*/./*|*//*|*[!A-Za-z0-9._/-]*)
                fail "archive contains an unsafe entry: $entry"
                ;;
        esac
    done < "$INVENTORY"

    AGENTS_COUNT=$(grep -Fxc 'AGENTS.md' "$INVENTORY" || true)
    META_README_COUNT=$(grep -Fxc 'readme/meta/README.md' "$INVENTORY" || true)
    [ "$AGENTS_COUNT" -eq 1 ] || fail "archive must contain AGENTS.md exactly once"
    [ "$META_README_COUNT" -eq 1 ] ||
        fail "archive must contain readme/meta/README.md exactly once"

    sort "$INVENTORY" > "$SORTED_INVENTORY"
    DUPLICATE_ENTRIES=$(uniq -d "$SORTED_INVENTORY")
    [ -z "$DUPLICATE_ENTRIES" ] || {
        printf '%s: archive contains duplicate entries:\n%s\n' \
            "$PROGRAM" "$DUPLICATE_ENTRIES" >&2
        exit 1
    }

    framework_core_inventory > "$EXPECTED_INVENTORY"
    cmp -s "$EXPECTED_INVENTORY" "$SORTED_INVENTORY" ||
        fail "archive inventory differs from the complete portable core"
    grep '^readme/meta/' "$EXPECTED_INVENTORY" > "$EXPECTED_META_INVENTORY"
    grep -E '^\.(agents|claude|codex)/' "$EXPECTED_INVENTORY" \
        > "$ADAPTER_INVENTORY" || true
    grep -E '^\.(agents|claude)/skills/[^/]+/' "$ADAPTER_INVENTORY" \
        > "$SKILL_FILE_INVENTORY" || true
    awk -F/ '{ print $3 }' "$SKILL_FILE_INVENTORY" | sort -u \
        > "$SKILL_NAME_INVENTORY"

    # Inflate only after central-directory metadata and exact inventory pass their caps.
    unzip -P '' -tq "$ARCHIVE" >/dev/null ||
        fail "downloaded archive failed validation"

    mkdir "$STAGING_DIRECTORY"
    unzip -P '' -qq "$ARCHIVE" -d "$STAGING_DIRECTORY" ||
        fail "cannot extract archive into temporary staging"

    UNSUPPORTED_ENTRIES=$(find "$STAGING_DIRECTORY" ! -type d ! -type f -print)
    [ -z "$UNSUPPORTED_ENTRIES" ] || {
        printf '%s: extracted archive contains unsupported entries:\n%s\n' \
            "$PROGRAM" "$UNSUPPORTED_ENTRIES" >&2
        exit 1
    }

    (
        cd "$STAGING_DIRECTORY"
        find AGENTS.md readme/meta .claude .codex .agents -type f -print | sort
    ) > "$EXTRACTED_INVENTORY"
    cmp -s "$SORTED_INVENTORY" "$EXTRACTED_INVENTORY" ||
        fail "extracted files differ from the validated archive inventory"
    [ -s "$STAGING_DIRECTORY/AGENTS.md" ] || fail "portable AGENTS.md is empty"
    grep -Fq '[readme/meta/README.md](readme/meta/README.md)' \
        "$STAGING_DIRECTORY/AGENTS.md" ||
        fail "portable AGENTS.md does not link the framework entrypoint"
    STAGED_FRAMEWORK_CHANGELOG=$STAGING_DIRECTORY/readme/meta/framework-changelog.md
    CHANGELOG_MARKER='<!-- Local framework entries go below this line. -->'
    CHANGELOG_MARKER_COUNT=$(grep -Fxc "$CHANGELOG_MARKER" \
        "$STAGED_FRAMEWORK_CHANGELOG" || true)
    [ "$CHANGELOG_MARKER_COUNT" -eq 1 ] ||
        fail "framework changelog seed must contain exactly one local-entry marker"
    if grep -Eq '^## [0-9]{4}-[0-9]{2}-[0-9]{2}: ' \
        "$STAGED_FRAMEWORK_CHANGELOG"; then
        fail "framework changelog seed contains a dated local entry"
    fi
    if awk -v marker="$CHANGELOG_MARKER" '
        seen && NF { populated = 1 }
        $0 == marker { seen = 1 }
        END { exit populated ? 0 : 1 }
    ' "$STAGED_FRAMEWORK_CHANGELOG"; then
        fail "framework changelog seed contains local entries"
    fi
    node "$STAGING_DIRECTORY/readme/meta/framework-data/cli.mjs" --version >/dev/null ||
        fail "staged framework data CLI version check failed"

    # Recheck immediately before atomically claiming destination paths.
    if [ -e "$META_DESTINATION" ] || [ -L "$META_DESTINATION" ]; then
        fail "framework destination appeared during installation: $META_DESTINATION"
    fi
    if [ -e "$AGENT_INSTALL_DESTINATION" ] || [ -L "$AGENT_INSTALL_DESTINATION" ]; then
        fail "instruction destination appeared during installation: $AGENT_INSTALL_DESTINATION"
    fi
    owns_marker "$LOCK_MARKER" || fail "installer lock ownership changed"

    trap '' HUP INT QUIT TERM
    if [ ! -e "$README_DESTINATION" ] && [ ! -L "$README_DESTINATION" ]; then
        if mkdir "$README_DESTINATION"; then
            OWN_README=true
        else
            restore_signal_traps
            fail "cannot claim documentation directory: $README_DESTINATION"
        fi
    elif [ ! -L "$README_DESTINATION" ] && [ -d "$README_DESTINATION" ]; then
        :
    else
        restore_signal_traps
        fail "documentation destination changed during installation"
    fi
    restore_signal_traps

    trap '' HUP INT QUIT TERM
    if ln "$STAGING_DIRECTORY/AGENTS.md" "$AGENT_INSTALL_DESTINATION"; then
        OWN_AGENT=true
    else
        restore_signal_traps
        fail "cannot claim instruction destination: $AGENT_INSTALL_DESTINATION"
    fi
    restore_signal_traps
    cmp -s "$STAGING_DIRECTORY/AGENTS.md" "$AGENT_INSTALL_DESTINATION" ||
        fail "installed startup instruction differs from the validated archive"

    # Keep the entire meta claim, copy, verification, and rollback inside directory-
    # scoped subshells. Each scope verifies its parent and the owned root lock before it
    # writes, so replacing readme with a symlink cannot redirect archive content.
    install_meta_tree() (
        set -euo pipefail
        META_COMPLETE=false
        META_OWNED=false

        # ShellCheck cannot infer that the EXIT trap invokes this local handler.
        # shellcheck disable=SC2317
        cleanup_meta_tree() {
            status=$?
            trap - EXIT HUP INT QUIT TERM
            if [ "$META_COMPLETE" != true ] && [ "$META_OWNED" = true ]; then
                rm -rf meta || true
            fi
            exit "$status"
        }

        trap cleanup_meta_tree EXIT
        restore_signal_traps
        cd "$README_DESTINATION" ||
            fail "cannot enter documentation directory: $DESTINATION_ROOT/readme"
        if [ -L ../readme ] || [ ! ../readme -ef . ] ||
            ! cmp -s "../${OWNER_TOKEN_FILE#./}" "../${LOCK_MARKER#./}"; then
            fail "documentation destination changed during installation"
        fi
        if [ "$OWN_README" = true ]; then
            ln "../${OWNER_TOKEN_FILE#./}" .framework-install-owner ||
                fail "cannot mark the claimed documentation directory"
        fi
        if [ -e meta ] || [ -L meta ]; then
            fail "framework destination appeared during installation: $DESTINATION_ROOT/readme/meta"
        fi

        trap '' HUP INT QUIT TERM
        if mkdir meta; then
            META_OWNED=true
        else
            restore_signal_traps
            fail "cannot claim framework destination: $DESTINATION_ROOT/readme/meta"
        fi
        restore_signal_traps

        (
            set -euo pipefail
            cd meta || fail "cannot enter claimed framework destination"
            if [ -L ../meta ] || [ ! ../meta -ef . ] ||
                [ -L ../../readme ] || [ ! ../../readme -ef .. ] ||
                ! cmp -s "../../${OWNER_TOKEN_FILE#./}" \
                    "../../${LOCK_MARKER#./}"; then
                fail "framework destination changed before copy"
            fi

            cp -pR "../../${STAGING_DIRECTORY#./}/readme/meta/." . ||
                fail "cannot copy the validated core into its claimed destination"
            find . -type f -print | sort |
                awk '{ sub(/^\.\//, ""); print "readme/meta/" $0 }' \
                    > "../../${INSTALLED_META_INVENTORY#./}"
            cmp -s "../../${EXPECTED_META_INVENTORY#./}" \
                "../../${INSTALLED_META_INVENTORY#./}" ||
                fail "installed core inventory differs from the validated archive"

            if [ -L ../meta ] || [ ! ../meta -ef . ] ||
                [ -L ../../readme ] || [ ! ../../readme -ef .. ] ||
                ! cmp -s "../../${OWNER_TOKEN_FILE#./}" \
                    "../../${LOCK_MARKER#./}"; then
                fail "documentation destination changed before copy completed"
            fi
        )

        if [ -L ../readme ] || [ ! ../readme -ef . ] ||
            ! cmp -s "../${OWNER_TOKEN_FILE#./}" "../${LOCK_MARKER#./}"; then
            fail "documentation destination changed before installation completed"
        fi
        node meta/framework-data/cli.mjs --version >/dev/null ||
            fail "installed framework data CLI version check failed"
        if [ "$OWN_README" = true ]; then
            rm -f .framework-install-owner ||
                fail "cannot finalize the claimed documentation directory"
        fi
        META_COMPLETE=true
    )

    trap '' HUP INT QUIT TERM
    install_meta_tree
    INSTALL_COMPLETE=true
    restore_signal_traps

    # Optional harness integrations install additively once the core is in place. Agent
    # files are preserved individually. A skill name is one cross-harness collision
    # domain: if either provider path already exists, every packaged file for that skill
    # is preserved so framework metadata can never be mixed with a host-owned body.
    # A failure here does not undo the completed core installation.
    ADAPTERS_INSTALLED=0
    ADAPTERS_PRESERVED=0
    ADAPTERS_FAILED=0
    : > "$INSTALLED_ADAPTER_PATHS"

    # Create each missing directory component beneath the destination root without
    # following a symbolic link that a colliding path may have planted. Returns non-zero
    # when a component is a symlink or a non-directory, so the caller skips that file.
    ensure_adapter_parent() {
        _ensure_dir=$1
        _ensure_accum=
        _ensure_oldifs=$IFS
        IFS=/
        # shellcheck disable=SC2086
        set -- $_ensure_dir
        IFS=$_ensure_oldifs
        for _ensure_comp in "$@"; do
            if [ -z "$_ensure_accum" ]; then
                _ensure_accum=$_ensure_comp
            else
                _ensure_accum=$_ensure_accum/$_ensure_comp
            fi
            if [ -L "$_ensure_accum" ]; then
                printf '%s: refusing symbolic adapter path: %s\n' \
                    "$PROGRAM" "$_ensure_accum" >&2
                return 1
            elif [ -d "$_ensure_accum" ]; then
                :
            elif [ -e "$_ensure_accum" ]; then
                printf '%s: adapter parent is not a directory: %s\n' \
                    "$PROGRAM" "$_ensure_accum" >&2
                return 1
            else
                trap '' HUP INT QUIT TERM
                if ! mkdir "$_ensure_accum"; then
                    restore_signal_traps
                    printf '%s: cannot create adapter directory: %s\n' \
                        "$PROGRAM" "$_ensure_accum" >&2
                    return 1
                fi
                restore_signal_traps
            fi
        done
        return 0
    }

    # Install one adapter file, preserving any existing same-name destination. Always
    # returns success; outcome is tallied so a single unwritable file cannot abort the run.
    install_adapter_file() {
        _adapter_src=$1
        _adapter_dest=$2
        _adapter_link_only=${3:-false}
        if [ -e "$_adapter_dest" ] || [ -L "$_adapter_dest" ]; then
            ADAPTERS_PRESERVED=$((ADAPTERS_PRESERVED + 1))
            return 0
        fi
        _adapter_parent=${_adapter_dest%/*}
        if [ "$_adapter_parent" != "$_adapter_dest" ] &&
            ! ensure_adapter_parent "$_adapter_parent"; then
            ADAPTERS_FAILED=$((ADAPTERS_FAILED + 1))
            return 0
        fi
        trap '' HUP INT QUIT TERM
        _adapter_created=false
        if ln "$_adapter_src" "$_adapter_dest" 2>/dev/null; then
            _adapter_created=true
        elif [ "$_adapter_link_only" = false ] &&
            cp -p "$_adapter_src" "$_adapter_dest"; then
            _adapter_created=true
        fi
        if [ "$_adapter_created" = true ]; then
            restore_signal_traps
            if cmp -s "$_adapter_src" "$_adapter_dest"; then
                ADAPTERS_INSTALLED=$((ADAPTERS_INSTALLED + 1))
                printf '%s\n' "$_adapter_dest" >> "$INSTALLED_ADAPTER_PATHS"
            else
                rm -f "$_adapter_dest" || true
                ADAPTERS_FAILED=$((ADAPTERS_FAILED + 1))
                printf '%s: installed adapter file differs, removed: %s\n' \
                    "$PROGRAM" "$_adapter_dest" >&2
            fi
        else
            restore_signal_traps
            ADAPTERS_FAILED=$((ADAPTERS_FAILED + 1))
            printf '%s: cannot install adapter file: %s\n' \
                "$PROGRAM" "$_adapter_dest" >&2
        fi
        return 0
    }

    : > "$PRESERVED_SKILL_NAMES"
    while IFS= read -r skill_name || [ -n "$skill_name" ]; do
        [ -n "$skill_name" ] || continue
        if [ -e ".agents/skills/$skill_name" ] || [ -L ".agents/skills/$skill_name" ] ||
            [ -e ".claude/skills/$skill_name" ] || [ -L ".claude/skills/$skill_name" ]; then
            printf '%s\n' "$skill_name" >> "$PRESERVED_SKILL_NAMES"
            printf '%s: preserving existing skill bundle for reconciliation: %s\n' \
                "$PROGRAM" "$skill_name"
        fi
    done < "$SKILL_NAME_INVENTORY"

    # Install all discovery files for one fresh skill as a bundle. If any file collides
    # or fails during the copy, remove only byte-identical files this invocation added;
    # never remove a path another actor replaced.
    install_skill_bundle() {
        _skill_name=$1
        _bundle_installed_before=$ADAPTERS_INSTALLED
        _bundle_preserved_before=$ADAPTERS_PRESERVED
        _bundle_failed_before=$ADAPTERS_FAILED

        if grep -Fqx "$_skill_name" "$PRESERVED_SKILL_NAMES"; then
            while IFS= read -r _bundle_rel || [ -n "$_bundle_rel" ]; do
                case $_bundle_rel in
                    .agents/skills/"$_skill_name"/*|.claude/skills/"$_skill_name"/*)
                        ADAPTERS_PRESERVED=$((ADAPTERS_PRESERVED + 1))
                        ;;
                esac
            done < "$SKILL_FILE_INVENTORY"
            return 0
        fi

        while IFS= read -r _bundle_rel || [ -n "$_bundle_rel" ]; do
            case $_bundle_rel in
                .agents/skills/"$_skill_name"/*|.claude/skills/"$_skill_name"/*)
                    install_adapter_file "$STAGING_DIRECTORY/$_bundle_rel" "$_bundle_rel" true
                    ;;
            esac
        done < "$SKILL_FILE_INVENTORY"

        if [ "$ADAPTERS_PRESERVED" -ne "$_bundle_preserved_before" ] ||
            [ "$ADAPTERS_FAILED" -ne "$_bundle_failed_before" ]; then
            while IFS= read -r _bundle_rel || [ -n "$_bundle_rel" ]; do
                case $_bundle_rel in
                    .agents/skills/"$_skill_name"/*|.claude/skills/"$_skill_name"/*)
                        if grep -Fqx "$_bundle_rel" "$INSTALLED_ADAPTER_PATHS" &&
                            [ -f "$_bundle_rel" ] && [ ! -L "$_bundle_rel" ] &&
                            [ "$STAGING_DIRECTORY/$_bundle_rel" -ef "$_bundle_rel" ]; then
                            rm -f "$_bundle_rel" || true
                        fi
                        ;;
                esac
            done < "$SKILL_FILE_INVENTORY"
            rmdir ".agents/skills/$_skill_name/agents" 2>/dev/null || true
            rmdir ".agents/skills/$_skill_name" 2>/dev/null || true
            rmdir ".claude/skills/$_skill_name" 2>/dev/null || true
            ADAPTERS_INSTALLED=$_bundle_installed_before
            if [ "$ADAPTERS_FAILED" -eq "$_bundle_failed_before" ]; then
                ADAPTERS_FAILED=$((ADAPTERS_FAILED + 1))
            fi
            printf '%s: skill bundle was not installed completely: %s\n' \
                "$PROGRAM" "$_skill_name" >&2
        fi
        return 0
    }

    while IFS= read -r adapter_rel || [ -n "$adapter_rel" ]; do
        [ -n "$adapter_rel" ] || continue
        case $adapter_rel in
            .agents/skills/*|.claude/skills/*) ;;
            *) install_adapter_file "$STAGING_DIRECTORY/$adapter_rel" "$adapter_rel" ;;
        esac
    done < "$ADAPTER_INVENTORY"
    while IFS= read -r skill_name || [ -n "$skill_name" ]; do
        [ -n "$skill_name" ] || continue
        trap '' HUP INT QUIT TERM
        SKILL_BUNDLE_ACTIVE=true
        install_skill_bundle "$skill_name"
        SKILL_BUNDLE_ACTIVE=false
        restore_signal_traps
    done < "$SKILL_NAME_INVENTORY"

    printf 'Installed the portable framework core in %s.\n' "$DESTINATION_ROOT"
    if [ "$PRESERVE_AGENTS" = true ]; then
        printf '%s\n' \
            'Existing AGENTS.md was preserved.' \
            'Merge AGENTS.framework.md into it, then delete AGENTS.framework.md.'
    else
        printf '%s\n' 'Installed the portable startup instruction as AGENTS.md.'
    fi
    printf 'Harness adapters: %s installed, %s preserved, %s failed.\n' \
        "$ADAPTERS_INSTALLED" "$ADAPTERS_PRESERVED" "$ADAPTERS_FAILED"
}

{
    FRAMEWORK_INSTALLER_STREAM_COMPLETE=true
    install_framework_core "$@"
}
