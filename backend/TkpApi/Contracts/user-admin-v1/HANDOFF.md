# ADMIN-003 — Backend handoff

- Worktree: `C:/Users/Администратор/.codex/worktrees/backend-admin-003/TaCP`.
- Branch: `codex/backend/admin-003-user-delete`.
- Base SHA: `1edff933afe9f488f11137ffa9251bae6744c720`.
- Contract: user-admin-v1 / ADR-012; PM docs `24b7da66`.
- NEED-001 partial. Запись остановлена, diff передаётся PM и независимому QA.

## Файлы

```text
modified: backend/TkpApi/AuthExtensions.cs
added: backend/TkpApi/Services/UserDeleteService.cs
added: backend/TkpApi/Contracts/user-admin-v1/CONTRACT.md
added: backend/TkpApi/Contracts/user-admin-v1/fixture.json
added: backend/TkpApi/Contracts/user-admin-v1/HANDOFF.md
```

AdminOnly DELETE, 204/404/409, запрет self-delete и последнего admin, DB transaction
и блокировки Identity-таблиц для concurrent DELETE. Схема, миграции, DTO, другие
auth endpoints, frontend и QA не менялись. Rollback и fixture —
[CONTRACT.md](CONTRACT.md), [fixture.json](fixture.json).

## Проверки

- `dotnet test backend/TkpApi.Tests`: 100 passed, 0 failed/skipped.
- `dotnet build backend/TkpApi/TkpApi.csproj --configuration Release`:
  0 warnings / 0 errors. После паузы по лимиту эти успешные команды не повторялись.
- Изолированный PostgreSQL 18.6, loopback :55485, новая disposable DB
  `admin_delete_89d623aa`: 37 HTTP/DB checks PASS.
- 401/403/404/self409/last-admin409 без изменения Identity-таблиц; success204
  без тела; удаление одного из двух admin оставляет одного; JWT actor сохранён.
- Проверены существующие Identity cascades, сохранность проекта и OwnerId,
  невозможность нового login удалённого пользователя, repeat DELETE404.
- Concurrent A↔B DELETE: 204/409 и один admin в БД после завершения.
- Deferred constraint trigger в одноразовой БД искусственно вызвал ошибку commit:
  HTTP500, Identity-строки/roles откатились полностью. После снятия probe trigger
  DELETE204. Trigger не входит в код/миграции и реальные БД не затрагивал.
- `git diff --check`, JSON fixture и локальные ссылки проверены.

Probe вне Git: `C:/Users/Администратор/AppData/Local/Temp/tkp-admin003-smoke.ps1`.
Evidence/logs: `C:/Users/Администратор/AppData/Local/Temp/tkp-admin003-f6bc92952ae04d3c8aaf0a0416fe9356`.
Тестовый API и временный PostgreSQL остановлены. Постоянные тесты принадлежат QA
и не изменялись. UI/Docker/production не проверялись; проверка автора не заменяет QA.

## Отдельный риск и границы принятия

`PUT /api/auth/users/{id}/role` сохраняет существующий race: read adminCount=2,
DELETE второго admin, затем снятие роли с первого по устаревшему решению PUT.
Общий инвариант DELETE↔PUT и PUT↔PUT не обеспечен этим diff. Подробное чередование
и причина ограничения — CONTRACT.md. Доказательство здесь — анализ кода,
не runtime-тест смешанной конкуренции. PM уведомлён до handoff и подтвердил
запрет менять PUT в текущем scope. Нужна отдельная задача на роль/транзакцию.

Немедленный отзыв ранее выданных JWT не входит в ADMIN-003; существующее
поведение явно описано в контракте. Никакая NEED не closed. Commit/push/merge
не выполнялись, main не изменён.