#!/bin/sh
# Test shape for the hop race, POSIX sh only: ignores SIGTERM; while $1 > 0 it sleeps 10 ms,
# starts itself again with $1 - 1 in the background (same group, no setsid) and exits; the last
# one writes $2 after 3 s. Usage: sh hop.sh <hops> <marker>
trap '' TERM
if [ "$1" -gt 0 ]; then sleep 0.01; sh "$0" $(($1 - 1)) "$2" & exit 0; fi
sleep 3
touch "$2"
