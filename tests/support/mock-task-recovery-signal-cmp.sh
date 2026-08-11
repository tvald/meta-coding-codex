#!/bin/sh

set -eu

for argument in "$@"; do
    case $argument in
        */.agents/skills/task-recovery/SKILL.md|.agents/skills/task-recovery/SKILL.md)
            if [ ! -e "$SIGNAL_MARKER" ]; then
                touch "$SIGNAL_MARKER"
                kill -TERM "$PPID"
            fi
            break
            ;;
    esac
done
exec "$REAL_CMP" "$@"
