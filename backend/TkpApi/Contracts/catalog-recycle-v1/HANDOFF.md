# ADMIN-002 — handoff

- Worktree: `C:/Users/Администратор/.codex/worktrees/backend-admin-002/TaCP`.
- Branch: `codex/backend/admin-002-catalog-restore`.
- Base: `1edff933afe9f488f11137ffa9251bae6744c720`.
- Контракт catalog-recycle-v1 / ADR-011; NEED-001 partial, не closed.
- Запись завершена, изменения передаются PM для снимка и независимого QA.

## Точный diff

```text
modified: backend/TkpApi/Program.cs
added: backend/TkpApi/Services/CatalogRestoreService.cs
added: backend/TkpApi/Contracts/catalog-recycle-v1/CONTRACT.md
added: backend/TkpApi/Contracts/catalog-recycle-v1/fixture.json
added: backend/TkpApi/Contracts/catalog-recycle-v1/HANDOFF.md
```

Добавлен AdminOnly POST restore; атомарный перенос всех полей снимка с прежним ID,
204/404/409 и идемпотентный повтор. Публичные DTO, модели, миграции, остальные
маршруты, frontend, QA и PM docs не менялись. Транзакционные блокировки двух
таблиц защищают конфликт SKU от конкурентных записей, включая разный регистр.
Контракт, ограничения и rollback: [CONTRACT.md](CONTRACT.md).

## Фактические проверки

- `dotnet test backend/TkpApi.Tests`: 100 passed, 0 failed/skipped.
- `dotnet build backend/TkpApi/TkpApi.csproj --configuration Release`:
  0 warnings / 0 errors.
- Изолированный PostgreSQL 18.6 на loopback :55485, новая одноразовая БД
  `admin_restore_c310f6e4`: **56 проверок прошли**.
- HTTP delete→deleted→restore: 204 с пустым телом, сохранение каждого из 10 полей,
  удаление снимка; повтор 204 без записи; unknown 404; пустой Attrs сохранён.
- Anonymous 401, manager/engineer 403; после отказов обе таблицы неизменны.
- ID conflict и case-insensitive SKU conflict: 409, хеш содержимого обеих таблиц
  до/после совпадает. 12 параллельных restore одного ID дают 204 и одну позицию.
  Два конкурентных снимка с одинаковым SKU разного регистра дают 204/409;
  проигравший снимок остаётся в корзине.
- Временный deferred constraint trigger вызвал ошибку при commit: HTTP 500,
  обе таблицы полностью откатились. После удаления тестового trigger restore
  успешен. Trigger создавался только в одноразовой БД, не в исходниках/миграциях.
- `git diff --check`, JSON fixture и локальные ссылки проверены.

Probe: `C:/Users/Администратор/AppData/Local/Temp/tkp-admin002-smoke.ps1`.
Логи: `C:/Users/Администратор/AppData/Local/Temp/tkp-admin002-d8c29e0a2e2a4bb7a6fdc995f3f82115`.
Постоянные тесты относятся к QA и не добавлялись. Проверки автора не заменяют
независимый QA/CI. Docker/production/UI не проверялись. Тестовые API и кластер
остановлены; реальные БД не затрагивались. Commit/push/merge не выполнялись,
main не изменён.