# ADMIN-004 — Backend handoff

- Worktree: `C:/Users/Администратор/.codex/worktrees/backend-admin-004/TaCP`.
- Branch: `codex/backend/admin-004-admin-invariant`.
- Base SHA: `6f67dbabea73b7860f1dda87439b05fd83f39f88`.
- Контракт: user-admin-v2 / ADR-013, PM docs `14fb5ecb`.
- NEED-001 partial. Запись остановлена, изменения готовы к снимку PM и QA.

## Точные файлы

```text
modified: backend/TkpApi/AuthExtensions.cs
modified: backend/TkpApi/Services/UserDeleteService.cs
added: backend/TkpApi/Services/AdminInvariantTransaction.cs
added: backend/TkpApi/Contracts/user-admin-v2/CONTRACT.md
added: backend/TkpApi/Contracts/user-admin-v2/fixture.json
added: backend/TkpApi/Contracts/user-admin-v2/HANDOFF.md
```

PUT и DELETE используют одну транзакционную стратегию до чтения пользователей
и admin membership. PUT remove/add обёрнут общей транзакцией; 200 после commit.
Last-admin PUT теперь 409/errors; успешные DTO/статусы сохранены. Схема/миграции,
frontend, QA, остальные маршруты и права не менялись. Контракт/rollout/rollback:
[CONTRACT.md](CONTRACT.md); матрица [fixture.json](fixture.json).

## Проверки

- `dotnet test backend/TkpApi.Tests`: 100 passed, 0 failed/skipped.
- `dotnet build backend/TkpApi/TkpApi.csproj --configuration Release`:
  0 warnings / 0 errors.
- 37 PostgreSQL/HTTP checks PASS на отдельной БД `admin_invariant_837c8611`
  PostgreSQL 18.6, loopback :55485, два API-процесса на :55092/:55093.
- 401/403 обоих маршрутов, PUT404, self-delete409, self-demotion last-admin409,
  sole admin→admin200, multiple-admin demotion200, неизменный DTO и прежний
  unknown-role fallback. Отказы не меняют роли/пользователей/concurrency stamps.
- Межпроцессные PUT→PUT, PUT→DELETE, DELETE→PUT: первый запрос успешен 200/204,
  второй 409; после каждого сценария ровно один admin. Порядок доказан временным
  BEFORE DELETE trigger с pg_sleep: второй запрос отправлен после фиксации
  первого в PgSleep под уже взятыми locks. Это не только порядок отправки HTTP.
- Ошибка назначения новой роли после снятия старой: HTTP500, полный rollback.
  Deferred ошибка commit PUT: HTTP500, обе SaveChanges откатились. Та же ошибка
  при DELETE откатила удаление; после снятия probe trigger DELETE204 успешен.
- `git diff --check`, JSON fixture и локальные ссылки проверены.

Все probe triggers были только в новой одноразовой БД и удалены после проверок.
Probe вне Git: `C:/Users/Администратор/AppData/Local/Temp/tkp-admin004-smoke.ps1`.
Evidence: `C:/Users/Администратор/AppData/Local/Temp/tkp-admin004-8ae3c5dff43242e19c5ee0dfae25a947`.
Оба API и временный PostgreSQL остановлены; реальные БД не затрагивались.

## Ограничения

Риск DELETE↔PUT из ADMIN-003 устранён для обновлённых поддерживаемых маршрутов.
Нужно обновить всех writers: старый API в смешанном rollout снова нарушает
инвариант. Прямой SQL, чужие writers и восстановление уже отсутствующего admin
не входят в гарантию. Отзыв JWT не добавлен. Table locks могут задерживать
другие Identity-записи; автоматических повторов после deadlock нет.

Независимый QA/CI, UI и инструкция со скриншотами остаются gates; NEED-001 не
closed. Никаких commit/push/merge автор не выполнял, main не менялся.