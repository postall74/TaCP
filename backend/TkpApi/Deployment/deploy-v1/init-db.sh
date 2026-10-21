#!/bin/sh
set -eu
case "${TKP_DB_USER:-}" in ''|*[!a-z0-9_]*) echo 'Invalid app role' >&2; exit 1;; esac
app_password=$(cat /run/secrets/db_app_password)
case "$app_password" in *[!a-f0-9]*|'') echo 'Invalid app secret format' >&2; exit 1;; esac
[ "${#app_password}" -eq 64 ] || exit 1
# psql variables quote identifiers/literals. Password is read from environment,
# never included in command-line arguments or printed by this script.
export TKP_INIT_PASSWORD="$app_password"
psql --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" --set ON_ERROR_STOP=1 <<'SQL'
\getenv app_user TKP_DB_USER
\getenv app_password TKP_INIT_PASSWORD
\getenv app_database POSTGRES_DB
CREATE ROLE :"app_user" LOGIN PASSWORD :'app_password' NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION;
ALTER DATABASE :"app_database" OWNER TO :"app_user";
REVOKE ALL ON DATABASE :"app_database" FROM PUBLIC;
ALTER SCHEMA public OWNER TO :"app_user";
REVOKE CREATE ON SCHEMA public FROM PUBLIC;
SQL
unset app_password TKP_INIT_PASSWORD
