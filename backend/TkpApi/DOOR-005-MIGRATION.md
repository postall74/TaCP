# DOOR-005 migration and rollback

Migration `20261018091551_AddCabinetDoorGeometry` adds the nullable JSONB column
`project_cabinets.door_geometry`. Existing rows stay `NULL`; there is no default,
backfill, or inference from cabinet names, catalog items, or UI dimensions.

Apply with the normal deployment command:

```powershell
dotnet ef database update --project backend/TkpApi/TkpApi.csproj
```

Before rollback, stop project writes and back up `project_cabinets.door_geometry`.
The Down migration drops the column and destroys all saved geometry:

```powershell
dotnet ef database update 20261015181034_AddCabinetDoorLayout --project backend/TkpApi/TkpApi.csproj
```

Do not run a server older than `cabinet-door-geometry-v1` while writes are
enabled: its full-project PUT cannot preserve the new JSONB block. Use a
compatible rollback build, or restore the backup after redeploying the compatible
server.
