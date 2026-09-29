# RATE-001 — независимая QA-проверка rates-persistence-v1

- Base: `1edff933afe9f488f11137ffa9251bae6744c720`.
- Target: `8b6937f7cf88816501ee45d77c15765a8213603b`.
- NEED-001: `partial`; ни одна NEED не закрыта.

## Выполнено

- Feature scope: 9 файлов только в `backend/TkpApi/**`; посторонних production-областей, секретов и tracked build-артефактов не обнаружено.
- `dotnet test backend/TkpApi.Tests`: 103/103 passed, включая 3 новых QA contract tests.
- `dotnet build backend/TkpApi/TkpApi.csproj --configuration Release`: passed, 0 warnings/errors.
- `dotnet ef migrations has-pending-model-changes ...`: model соответствует snapshot.
- Подтверждены модель/миграция: singleton PK + CHECK `Id=1`, unrestricted PostgreSQL `numeric`, NOT NULL пять полей, defaults 1800/1800/2200/1800/1800, Down удаляет только `rate_cards`.
- Подтверждены route invariants: GET сохраняет `Staff`, PUT — `AdminOnly`; PUT выполняет один `ExecuteUpdateAsync` со всеми пятью полями и отвергает отсутствие singleton row.
- Contract/fixture согласованы с текущим DTO и документируют 401/403, full replacement, restart, isolation, legacy baseline и rollback.

## Не выполнено: обязательный runtime gate

На QA-хосте отсутствуют Docker и Podman, поэтому PostgreSQL 17 и volume restart не запускались. Независимо не воспроизведены HTTP 401/403, сохранение после рестарта, две БД/tenant isolation, upgrade с history и legacy baseline, Down/Up rollback, decimal roundtrip, DB rejection Id=2 и concurrent PUT/GET. Статические тесты не подменяют эти сценарии.

Авторский handoff сообщает о временном PostgreSQL 18.6, но это не независимый QA и не требуемый PostgreSQL 17 Docker gate. До доступности соответствующего стенда RATE-001 имеет частичный QA-результат.

## Итог

Статических дефектов и регрессий сборки не обнаружено. Полная приёмка заблокирована отсутствием Docker/PostgreSQL 17 runtime. NEED-001 остаётся `partial`.
