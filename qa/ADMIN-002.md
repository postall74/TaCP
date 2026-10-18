# ADMIN-002 — независимая QA-проверка catalog-recycle-v1

Статус: **ADMIN-002 прошёл независимую QA-проверку; NEED-001 остаётся partial**.

- Base: `1edff933afe9f488f11137ffa9251bae6744c720`.
- Backend snapshot: незакоммиченный handoff из
  `C:/Users/Администратор/.codex/worktrees/backend-admin-002/TaCP`.
- Контракт: `catalog-recycle-v1`, ADR-011.
- QA worktree: `C:/Users/Администратор/.codex/worktrees/qa-admin-002/TaCP`.
- QA branch: `codex/qa/admin-002-catalog-restore`.

## Проверенный scope

Backend handoff содержит ровно заявленные файлы:

- `backend/TkpApi/Program.cs`;
- `backend/TkpApi/Services/CatalogRestoreService.cs`;
- `backend/TkpApi/Contracts/catalog-recycle-v1/CONTRACT.md`;
- `backend/TkpApi/Contracts/catalog-recycle-v1/fixture.json`;
- `backend/TkpApi/Contracts/catalog-recycle-v1/HANDOFF.md`.

SHA-256 каждого файла в QA checkout совпал с backend worktree. Публичные модели,
миграции и frontend не изменены. Существующий frontend client уже вызывает
`POST /api/catalog/{id}/restore`, поэтому маршрут обратно совместим с клиентом.

## Результаты

| Команда / сценарий | Результат |
|---|---|
| `dotnet test backend/TkpApi.Tests --verbosity minimal` | 100/100, 0 skipped, exit 0 |
| `dotnet build backend/TkpApi/TkpApi.csproj --configuration Release` | 0 warnings, 0 errors |
| `qa/ADMIN-002.probe.ps1` | 56 HTTP/DB assertions, exit 0 |
| `git diff --check` | замечаний нет |

Probe выполнил проверки в собственной одноразовой PostgreSQL 18 БД и локальном
Production API с динамически созданными JWT key и admin password. Секреты в
файлах или выводе не сохранялись.

Проверено:

- anonymous получает 401, manager и engineer получают 403; обе таблицы без изменений;
- успешное восстановление возвращает 204 с пустым телом;
- сохраняются прежний ID и все поля снимка, включая пустой `Attrs`;
- повтор возвращает 204 без изменений, неизвестный ID — 404;
- конфликт ID и регистронезависимый конфликт SKU дают 409 без частичной записи;
- 12 параллельных restore одного ID дают одну активную запись и удаляют снимок;
- два параллельных снимка с одинаковым SKU разного регистра дают один 204 и один
  409, проигравший снимок остаётся в корзине;
- deferred failure на commit даёт 500 и точный rollback обеих таблиц; после
  удаления искусственного trigger восстановление проходит.

## Дефекты и ограничения

Новых дефектов продукта не найдено.

Первый probe не стартовал, потому что указанный автором PostgreSQL на порту 55485
был уже остановлен. Assertions тогда не выполнялись. QA создал отдельный кластер
на loopback-порту 55486 и повторил полный сценарий успешно. Это ограничение
среды, а не дефект ADMIN-002.

`docs/USER_NEEDS.md` отсутствует в указанном base checkout. Статус NEED-001 взят
из принятого контракта и handoff: partial. API восстановления сам по себе не
закрывает пользовательскую потребность; остаются UI/руководство со снимками,
зелёный CI, merge в main и аннотированный release tag.

## Вердикт

ADMIN-002 соответствует `catalog-recycle-v1` и готов к PM integration. Ретест
нужен при любом новом backend snapshot, изменении транзакции, прав AdminOnly,
схемы каталога/корзины либо PostgreSQL migration.
