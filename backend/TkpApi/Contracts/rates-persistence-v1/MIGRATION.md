# RATE-001 migration and rollback

Migration `20261020174257_PersistTenantRates` creates the singleton table
`rate_cards`, constrains `Id` to `1`, and inserts the existing defaults:
Design 1800, Production 1800, Software 2200, Smr 1800, Pnr 1800. The five
values use PostgreSQL `numeric` without a scale restriction, so the existing
decimal DTO is not rounded by the schema.

Before upgrading an existing process, an administrator must export its current
`GET /api/rates` response, stop writes, and back up the selected tenant database.
The old server stored rates only in memory, so its current values cannot be
recovered from the old database. Apply the migration for each tenant database,
start the new server, restore the exported DTO through authorized `PUT /api/rates`,
and verify it with GET before reopening writes. A new database keeps the seeded
defaults.

For rollback, prefer leaving the additional table in place while deploying a
compatible application rollback. If the Down migration is required, stop all API
writers for that tenant and export/back up the rates first. Down drops only
`rate_cards` and permanently removes its values; a later Up recreates defaults.
The other tenant database must be migrated and rolled back independently.
