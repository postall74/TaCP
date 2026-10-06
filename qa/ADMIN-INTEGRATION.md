# ADMIN-001/002/003/004 — независимый integration QA

Target/base checkout: `467450df8695a5413da96c16673eb0c6b67a92a2`.
Diff base main: `1edff933afe9f488f11137ffa9251bae6744c720`.
Worktree: `C:/Users/Администратор/.codex/worktrees/qa-admin-integration/TaCP`.
Branch: `codex/qa/admin-integration`. NEED-001: partial.

Target snapshot содержит 25 файлов: 883 добавления, 52 удаления. Production scope:
admin shell, UI/local/remote удаления пользователей, API restore/delete/role и
общая PostgreSQL-транзакция admin-инварианта. Публичные модели и миграции не
изменены.

## Автоматические проверки

- npm ci: PASS; после QA additions 97/97 frontend tests, typecheck и build: PASS.
- Backend: 100/100 tests; Release build 0 warnings/errors.
- Restore catalog regression: 56 HTTP/DB checks PASS, включая rollback и гонки.
- User invariant: 51 HTTP/DB checks PASS на двух API-процессах и общей новой PostgreSQL БД.
- PUT↔PUT, PUT→DELETE, DELETE→PUT: первый 200/204, второй 409, остаётся один admin.
- 401/403, PUT unknown404, self-delete409, last-admin demotion409, multiple admin,
  DTO и fallback неизвестной роли; assignment/commit/cascade failure rollback PASS.
- DELETE unknown/repeat, last-admin через JWT удалённого admin, удаление другого
  пользователя, Identity cascade и сохранение проекта/OwnerId/других пользователей PASS.

## Browser UI

- Local: прямой `#/admin/users`, отдельный shell, self-delete disabled, confirm с
  email, cancel без изменения, light/dark PASS.
- Remote real API: начальная загрузка, pending `Удаление…`, блокировка кнопок,
  204 с обновлением списка, понятные 404 и 409 PASS.
- После успешного remote DELETE и полного reload admin-сессия восстановлена,
  маршрут и доступ сохранились: сохранение JWT PASS.
- Local и remote используют одну UI-ветку и отдельно проверенные store adapters.

## QA additions

- src/admin/AdminRouter.test.ts
- src/admin/components/AdminLayout.test.ts
- src/utils/localAuth.test.ts
- qa/ADMIN-INTEGRATION.admin-invariant.probe.ps1
- этот отчёт

Production additions не выполнялись. Commit/push не выполнялись.

## Дефекты, ограничения и вердикт

Новых дефектов продукта не обнаружено. ADMIN-001, ADMIN-002, ADMIN-003 и
ADMIN-004 проходят проверенный интеграционный scope. NEED-001 остаётся partial:
пользовательское руководство со снимками, CI/main merge и annotated release tag
этой проверкой не закрываются.

Известный build warning `Circular chunk: vendor-other -> vendor-core ->
vendor-other` и npm audit (3 moderate, 1 high) сохраняются и не возникли в этом
diff. UI проверен через браузер и accessibility tree; эталонные screenshots в
репозиторий не добавлялись.

API probe-процессы, Vite и временный PostgreSQL остановлены. Одноразовый кластер
удалён после проверки. Секреты генерировались/задавались только для локальной QA
БД и в Git не добавлены; `bin/`, `obj/`, `dist/`, `node_modules` не добавлены.
