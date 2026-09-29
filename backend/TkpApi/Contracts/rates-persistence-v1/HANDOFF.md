# RATE-001 — handoff Backend → PM / QA

- Worktree: `C:/Users/Администратор/.codex/worktrees/backend-rate-001/TaCP`.
- Branch: `codex/backend/rate-001-persistence`.
- Base: `1edff933afe9f488f11137ffa9251bae6744c720`.
- PM contract: `c25dda1a5d860213ec5b5ddafe8a6e95c47b11bd`, ADR-009;
  NEED gate прочитан из `ba6e66c368636ae74206a21d430b6c041b34ca84`.
- Реализация передаётся на независимый QA. NEED-001: косвенное partial;
  остальные NEED напрямую не реализуются. Ни одна NEED не closed.

## Точный diff (от корня repo)

Изменены:

```text
backend/TkpApi/Program.cs
backend/TkpApi/TkpDbContext.cs
backend/TkpApi/Migrations/TkpDbContextModelSnapshot.cs
```

Добавлены:

```text
backend/TkpApi/RatesRow.cs
backend/TkpApi/Migrations/20260929183448_PersistTenantRates.cs
backend/TkpApi/Migrations/20260929183448_PersistTenantRates.Designer.cs
backend/TkpApi/Contracts/rates-persistence-v1/CONTRACT.md
backend/TkpApi/Contracts/rates-persistence-v1/fixture.json
backend/TkpApi/Contracts/rates-persistence-v1/HANDOFF.md
```

GET использует текущую БД; PUT одним SQL UPDATE сохраняет весь DTO.
DB singleton защищён PK + CHECK Id=1. Decimal хранится в numeric без precision
ограничения/округления. Defaults задаёт versioned migration. Legacy baseline
теперь отмечает только исходную миграцию, а новую выполняет реально.

HTTP DTO и Staff/AdminOnly не менялись. Models.cs, права, frontend, QA, OPS-001
и PM docs не редактировались. Fixture, upgrade старых in-memory ставок,
legacy preflight и rollback: [CONTRACT.md](CONTRACT.md).

## Проверки

- `dotnet test backend/TkpApi.Tests`: 100 passed, 0 failed/skipped.
- `dotnet build backend/TkpApi/TkpApi.csproj --configuration Release`:
  0 warnings, 0 errors.
- `dotnet ef migrations has-pending-model-changes --project backend/TkpApi --configuration Release --no-build`:
  модель совпадает с snapshot.
- На отдельном временном PostgreSQL 18.6, loopback :55485: свежие A/B defaults,
  PUT/GET, прежняя JSON shape и omitted-property semantics, anonymous 401,
  Staff GET, engineer PUT 403, чужой JWT 401, invalid decimal 400 без изменения
  строки, дробные/отрицательные значения без округления, успешный PUT после
  остановки/старта процесса A, неизменность B.
- Проверена миграция предыдущей схемы с history и legacy без applied history:
  defaults созданы, обе миграции записаны, посторонняя контрольная запись сохранена.
- Down удалил только rate_cards, посторонняя запись сохранилась; повторный Up
  вернул defaults. В первом временном сценарии последняя проверка ошибочно
  сравнила текст `2200` с PostgreSQL `2200.0`; адресная числовая проверка прошла.
  Это ошибка probe, production-код не менялся и успешные сценарии не повторялись.
- Дополнительно: 30 конкурентных PUT + 30 GET — ни одного смешанного DTO;
  decimal max и 28 знаков после запятой сохранены точно; DB отклонила Id=2.
- `git diff --check`, parse fixture, локальные ссылки и scope новых файлов проверены.

Probe scripts находятся вне Git в Temp: `tkp-rate001-smoke.ps1` и
`tkp-rate001-extra.ps1`. Первый набор логов/SQL:
`C:/Users/Администратор/AppData/Local/Temp/tkp-rate001-916c0aa6dc57438d951260d57c9df032`;
дополнительный:
`C:/Users/Администратор/AppData/Local/Temp/tkp-rate001-e5ecc18ebcf249d4bd7ae93f405af58c`.
Тестовые API и временный PostgreSQL остановлены. Реальные БД не изменялись.

## Ограничения и следующий gate

Проверки автора не заменяют QA/CI. Docker engine отсутствует: проверен restart
процесса и разделение БД, а не контейнеры/volumes/полный TEN-002. Docker gate
OPS-001 остаётся открытым, включая PostgreSQL 17 из его примерной конфигурации.
Старые ставки в памяти требуется экспортировать до остановки старого процесса;
из DB backup старой версии они автоматически не восстанавливаются.
Legacy baseline по-прежнему предполагает корректность исходной схемы;
произвольную/повреждённую схему он не подтверждает.

Пользовательская инструкция со скриншотами, независимый QA, CI, merge и тег
остаются PM gate. После handoff запись остановлена. Git add/commit/push/merge
не выполнялись; main не менялся, требуется отдельное разрешение пользователя.