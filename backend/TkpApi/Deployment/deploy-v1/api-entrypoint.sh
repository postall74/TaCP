#!/bin/sh
set -eu
# This adapter belongs to the container contract; the .NET host does not read _FILE.
fail() { echo "Container configuration: $1" >&2; exit 1; }
case "${TKP_DB_NAME:-}" in ''|*[!a-z0-9_]*) fail 'invalid database name';; esac
case "${TKP_DB_USER:-}" in ''|*[!a-z0-9_]*) fail 'invalid database user';; esac
db_password=$(cat /run/secrets/db_app_password) || fail 'cannot read database secret'
case "$db_password" in *[!a-f0-9]*|'') fail 'database secret must contain 64 lowercase hex characters';; esac
[ "${#db_password}" -eq 64 ] || fail 'database secret must contain 64 lowercase hex characters'
Jwt__Key=$(cat /run/secrets/jwt_key) || fail 'cannot read JWT secret'
case "$Jwt__Key" in *[!a-f0-9]*|'') fail 'JWT secret must contain 64 lowercase hex characters';; esac
[ "${#Jwt__Key}" -eq 64 ] || fail 'JWT secret must contain 64 lowercase hex characters'
ConnectionStrings__Tkp="Host=db;Port=5432;Database=$TKP_DB_NAME;Username=$TKP_DB_USER;Password=$db_password"
export ConnectionStrings__Tkp Jwt__Key
unset db_password
if [ "${Admin__Enabled:-false}" = true ]; then
    Admin__Password=$(cat /run/secrets/admin_password) || fail 'cannot read bootstrap password'
    export Admin__Password
fi
exec dotnet TkpApi.dll
