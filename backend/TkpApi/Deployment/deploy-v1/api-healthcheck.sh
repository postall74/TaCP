#!/bin/sh
set -eu
# Host filtering applies to health requests too. Never disable it for loopback.
host=${AllowedHosts%%;*}
exec curl --fail --silent --show-error --max-time 4 --output /dev/null \
    --header "Host: $host" http://127.0.0.1:8080/api/health
