# SEC-001 / auth-v2

Владелец: Backend. Основание: ADR-008, принят PM.
Ветка: `codex/backend/sec-001-admin-registration`, база CORE-005 `685b674a`.

## Contract handoff

- Маршрут: `POST /api/auth/register`, policy `AdminOnly` (Bearer JWT, role admin).
- Request/response: `auth-v2.fixture.json`; placeholders заменяются тестовыми
  значениями, реальных credentials в fixture нет. Успех — 200, DTO сохранены.
- Анонимный/невалидный токен — 401; manager/engineer — 403. Тело пустое,
  обработчик не выполняется, пользователь и связи ролей не создаются.
- Ошибки входных данных от Identity — 400 с `errors`; 404/409 этот маршрут
  не использует. Дубликат email, как прежде, возвращается 400.
- `POST /api/auth/login` остаётся anonymous; плохие credentials — 401.
- `login.expiresAt` — число unix-миллисекунд по действующему глобальному
  UnixMsDateTimeConverter (значение в fixture иллюстративное). Typed frontend
  client сейчас объявляет string; это существующее расхождение передано PM,
  в SEC-001 формат ответа не меняется.
- Admin может выбирать прежние роли admin/manager/engineer; неизвестная роль,
  как прежде, нормализуется в engineer. Другие маршруты не меняются.
- Совместимость: намеренное несовместимое изменение доступа для анонимных
  клиентов регистрации. Административный UI должен передавать текущий JWT,
  а не заменять его токеном нового пользователя. DTO, БД и миграции без изменений.
- Bootstrap первого admin — runtime-config-v1, не публичная регистрация.
- Fixture готов для Frontend/QA до проверки реализации.

## Реализация

С общей группы `/api/auth` снимается `AllowAnonymous`, чтобы он не обходил
policy регистрации. Только login получает явный `AllowAnonymous`; register —
`RequireAuthorization("AdminOnly")`. Остальные политики остаются прежними.

## Проверки и приёмка

Backend verification завершён 2026-09-23:

- `dotnet test backend/TkpApi.Tests`: 57 passed, 0 failed.
- `dotnet build backend/TkpApi/TkpApi.csproj --configuration Release`:
  0 warnings, 0 errors (после успешного сетевого restore без NU1900).
- 19 assertions временного HTTP harness на отдельной PostgreSQL 18 БД:
  startup; anonymous/invalid JWT 401 с пустым телом и без DB writes; login admin;
  numeric expiresAt; создание manager/engineer/admin; manager/engineer 403 с пустым
  телом и без DB writes; 400 на короткий пароль и дубликат email без DB writes;
  исходный токен администратора по-прежнему возвращает его профиль.
- Сравнивались counts AspNetUsers, AspNetUserRoles и AspNetRoles до/после
  запрещённых запросов. Тестовые ключи и пароли генерировались в памяти.
- Первоначальный smoke fixture пытался повторно создать bootstrap email;
  поправлены только тестовые адреса, затем все проверки прошли на новой БД.
- Код не содержит AllowAnonymous на группе или register; только login явно
  anonymous. Schema/DTO/другие permissions не менялись.

Ожидается независимый QA на конкретном SHA. Проверить:
401/403 без изменения числа пользователей/ролей, создание каждой роли admin,
400 на неверный пароль, login, metadata register без IAllowAnonymous, frontend
SEC-002 в обеих темах и сохранение JWT текущего администратора.

Release до независимого QA/PM не принят. Не откатывать SEC-001 отдельно от
согласованного auth-v2 UI/плана доступа на внешнем сервере.
