#!/bin/sh

set -eu

case ${1:-} in
    */task-recovery/agents/openai.yaml) exit 1 ;;
    *) exec "$REAL_LN" "$@" ;;
esac
