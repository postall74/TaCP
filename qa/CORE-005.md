# CORE-005 — независимый QA runtime-config-v1

Дата: 2026-09-24. Backend source: `685b674a788bf69bc65e4a5af2c2363d2001032d`.
QA worktree: `E:/dev/TaCP/.worktrees/qa-core-002`.
QA branch/base: `codex/qa/core-005-runtime-tests`, `6045076a50042f4501434e66a01c7e4b9c25fea2`.
Production-код QA не менял. Git add/commit/push выполняет только PM.

## Изменённые QA-файлы

- `backend/TkpApi.Tests/StartupConfigurationTests.cs` — 39 validator/process cases.
- `qa/runtime_config_smoke.py` — изолированный PostgreSQL/HTTP smoke.
- `qa/CORE-005.md` — этот отчёт.

## Результаты

- `dotnet test backend/TkpApi.Tests --verbosity minimal`: 96 passed, 0 failed/skipped.
- Release build API: exit 0, 0 warnings/errors.
- `qa/runtime_config_smoke.py`: exit 0, 12 HTTP assertions.

Проверены обязательные параметры, connection strings, JWT UTF-8 length,
expiry boundaries, production-only settings, origins/hosts/boolean values,
bootstrap opt-in и credentials. Два теста запускают настоящий API-процесс в
Production и Development с невалидным JWT и недоступной БД: exit 1 до DB/HTTP,
stderr содержит имя параметра без тестовых секретов, `Unhandled exception`,
`NpgsqlException` и `Now listening` отсутствуют. Windows crash dialog не появился.

HTTP smoke на отдельном PostgreSQL 18.6 и случайных loopback-портах подтвердил:
health 200; production Swagger 404; разрешённый CORS и отказ чужому origin;
чужой Host 400; явный bootstrap создаёт admin; повторный bootstrap сохраняет
старые пароль и роль; новый bootstrap password не применяется; Development
Swagger 200 и CORS localhost:3000; disabled bootstrap не создаёт пользователя.

Последняя временная БД остановлена штатно: `postmaster.pid` отсутствует, лог
завершается `database system is shut down`. Использовались только случайные
QA credentials и новая тестовая БД; реальные данные не затрагивались.

Первоначальные сбои относились к harness: null assertion в новом тесте,
наследование ACL временной папки и удержание PIPE дочерним PostgreSQL. После
исправления только QA-файлов итоговые проверки прошли полностью.

Новых дефектов CORE-005 в проверенных сценариях нет. PR/Actions/branch checks и
SEC-001 остаются отдельными gates.
