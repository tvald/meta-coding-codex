#!/bin/sh

set -eu

output=
while [ "$#" -gt 0 ]; do
    if [ "$1" = --output ]; then
        [ "$#" -ge 2 ] || exit 2
        output=$2
        shift 2
    else
        shift
    fi
done
[ -n "$output" ]
cp "$FRAMEWORK_CORE_ARCHIVE" "$output"
