# CORE-005 — runtime-config-v1

Дата: 2026-09-23. Владелец: Backend. Статус: реализация передана на независимый QA.
Ветка: `codex/backend/core-005-runtime-config`.
Worktree: `E:/dev/TaCP/.worktrees/backend-core-005`.
Основание: принятый PM ADR-006a в ветке `codex/pm/core-004-coordination`.

## Изменённые пути

- `Program.cs`: проверка конфигурации до DbContext/БД; stderr и exit 1
  при неверных параметрах; CORS allowlist; Swagger по умолчанию только в Development.
- `StartupConfiguration.cs`: проверка DB/JWT/hosts/origins/bootstrap без вывода
  значений секретов. Удалённые demo-credentials распознаются по SHA-256.
- `AuthExtensions.cs`: bootstrap только при `Admin:Enabled=true` и внешних
  credentials; существующие пароль и роли не изменяются; ошибки создания
  роли/пользователя не маскируются успешным запуском.
- `appsettings.json`: удалены секреты, demo-аккаунт и общий сетевой bind.
- `appsettings.Development.json`: loopback и локальный frontend origin.
- `TkpApi.csproj`: UserSecretsId для локального Development.
- `CONFIGURATION.md`, `runtime-config.example.txt`: контракт и запуск.

## Контракт и совместимость

HTTP request/response, маршруты и права в этой задаче не меняются. Схема данных
не меняется; новая миграция не нужна. Существующее применение миграций при
старте сохранено. `runtime-config-v1` намеренно несовместим со старым запуском
на demo defaults: задайте внешние параметры перед обновлением.

Параметры: `ConnectionStrings__Tkp`, `Jwt__Key`, `Jwt__Issuer`, `Jwt__Audience`,
`Jwt__ExpireMinutes`, `AllowedHosts`, `Cors__AllowedOrigins__0` (и последующие),
`Swagger__Enabled`, `Admin__Enabled`, `Admin__Email`, `Admin__Password`, `URLS`,
`DOTNET_ENVIRONMENT`. Ограничения и defaults — в CONFIGURATION.md.

Fixture без секретов — `runtime-config.example.txt`. Для positive QA замените
placeholders тестовыми значениями, сгенерируйте ключ и пароль в памяти и задайте
отдельную тестовую БД. Файл автоматически не загружается приложением.
Пример негативного результата: stderr содержит
`Invalid runtime-config-v1 configuration: ConnectionStrings:Tkp is required`,
код процесса 1; HTTP ещё не слушает, БД не затрагивается.

## Выполненные проверки

- `dotnet test backend/TkpApi.Tests`: 57 passed, 0 failed.
- `dotnet build backend/TkpApi/TkpApi.csproj --configuration Release`:
  0 предупреждений, 0 ошибок. После первоначального NU1900 выполнен успешный
  `dotnet restore backend/TkpApi.Tests --force` с доступом к NuGet.
- 18 запусков настоящего процесса: отсутствие/ошибка DB connection, отсутствующий/
  короткий/demo JWT, demo DB password, отсутствие issuer/audience/hosts/origin,
  wildcard host/origin, origin с путём, неверные boolean Swagger/Admin,
  bootstrap без credentials (включая пробелы вокруг true), demo admin password,
  неверный срок JWT. Все завершились с exit 1 до БД, без секретов и unhandled exception.
- На отдельном временном PostgreSQL 18, loopback: production health 200,
  Swagger 404, разрешённый CORS origin принят, чужой origin без CORS header,
  чужой Host получает 400, bootstrap создаёт работающего admin, повторный bootstrap
  сохраняет пароль/роль, Development Swagger 200, отключённый bootstrap не создаёт
  пользователя (login 401). Временный сервер остановлен после проверок.
- `git diff --check` для изменённых production-файлов пройден. Генерируемые
  `bin/obj` не включаются в commit.

Smoke запускался временным PowerShell harness вне репозитория. Сначала выявлен
Windows crash dialog при unhandled validation exception: исправлено в Program.cs
и повторно проверено. Positive harness исправлен под фактическое поле `user.roles`
(массив), после чего все 9 положительных проверок прошли. Это не независимое QA;
постоянные автотесты и принятие результата — следующий шаг QA/PM.

## Ограничения и следующий handoff

- SEC-001 / auth-v2 ещё требуется: регистрация пока анонимна. Внешний релиз
  также заблокирован полным ADR-006 и общими release gates.
- Секреты удалены из текущей конфигурации, но история Git не переписывалась.
- Не менялись frontend, docs PM, CI и тестовые файлы QA.
- Реальные данные не затрагивались.
- QA нужны независимые сценарии `StartupConfiguration.Validate`
  (ожидаемое исключение `RuntimeConfigurationException`), запуск процесса с exit 1,
  middleware и bootstrap на тестовой БД. PM принимает задачу после QA.
