# QA: журнал проверок и передача PM

ADMIN-002: [независимый QA catalog-recycle-v1](ADMIN-002.md), backend snapshot
от base `1edff933`: 100 .NET tests, clean Release build и 56 PostgreSQL/HTTP
assertions прошли. Новых дефектов нет; NEED-001 остаётся partial.

SEC-001: [независимый QA auth-v2](SEC-001.md), production `b1bb51eb`:
96 .NET tests и 21 адресная HTTP/DB проверка прошли. Новых дефектов защиты
registration не найдено. Git-операции оставлены PM.

CORE-005: [независимый QA-отчёт](CORE-005.md). Backend source `685b674a`,
QA base `6045076a`: 96 .NET tests и 12 HTTP assertions прошли. Файлы переданы
PM без нового commit/push. Следующая адресная проверка — SEC-001 `b1bb51eb`.

SEC-002: [QA-отчёт auth-v2](SEC-002.md), frontend `6d01c4a0` проверен
в ветке `codex/qa/sec-002-auth-regression` как `d3561126`: 80 тестов,
typecheck/build и браузерный smoke обеих тем. QA-005 передан PM.

Продолжение CORE-003: [отчёт ci-v1](CORE-003.md), ветка
`codex/qa/core-003-ci-gate`. Очистка индекса выполнена по согласованию PM;
дальнейшие статусы этой задачи читать в отдельном отчёте.

Обновлено: 2026-09-22. Задача QA: CORE-002.
Ветка: `codex/qa/core-002-test-baseline`.
Checkout: `E:/dev/TaCP/.worktrees/qa-core-002`.
Проверенная база: `fbd78d0bc136e9f981cbdf3f57b0d38686439240`.
Правка harness: `package.json`, `scripts.test = vitest run`.
HTTP-контракт не изменяется. Финальное принятие CORE-001/CORE-002 выполняет PM.

## Ретест CORE-001 + CORE-002

Получен frontend handoff `0d095d42`, перенесён cherry-pick в QA как `9ba1def4`.
Независимо выполнены стандартные `npm run typecheck` (exit 0), `npm test`
(сначала 71/71; после QA-регрессии 76/76, 6 файлов), `npm run build` (exit 0).
Добавлен `src/components/ui.test.ts`: password/email/tel сохраняются в HTML,
text остаётся значением по умолчанию, Select выводит выбранную роль.
После добавления теста typecheck повторно прошёл. Проверка работает через React
server renderer; она не заменяет браузерные события и визуальное тестирование.
Ручные create/edit в обеих темах выполнены автором frontend по его handoff;
QA браузерный сценарий независимо не повторял. Реальный API не проверен.
Backend исходники не менялись; применим результат независимого базового
прогона 57/57 и Release build ниже. QA-001 устранён в интегрированном snapshot;
QA-002 проверен стандартной командой. QA-003 и QA-004 остаются открыты.
Чистая установка выполнена перед интеграцией; CORE-001 не меняет dependencies.
Прогон Node 22/.NET SDK 8 в CI остаётся невыполненным.

## Воспроизводимый запуск

Из корня проверяемого checkout (Windows: можно использовать `npm.cmd`):

```sh
npm ci --no-audit --no-fund
npm run typecheck
npm test
npm run build
dotnet test backend/TkpApi.Tests --verbosity minimal
dotnet build backend/TkpApi/TkpApi.csproj --configuration Release --no-restore
```

Каждую команду проверять отдельно по exit code. Успешная Vite-сборка не заменяет
typecheck. Не запускать чистую установку в checkout другого работающего агента.
Среда проверки: Windows, Node 24.19.0, npm 11.17.0, .NET SDK 10.0.400,
целевой framework backend net8.0. CI использует Node 22 и .NET SDK 8;
совпадение результатов с CI пока не проверено.

## Результаты базового прогона

| Проверка | Результат |
|---|---|
| Чистый npm ci | exit 0, 182 пакета |
| npm run typecheck | exit 1, 9 диагностик: 7 Input.type, 1 Select.children, 1 loadUsers |
| npm test | exit 0, 71/71, 5 файлов, без пропусков |
| npm run build | exit 0; предупреждение Circular chunk vendor-other -> vendor-core -> vendor-other |
| dotnet test | exit 0, 57/57, 0 skipped, 0 failed |
| Release backend build | exit 0, 0 предупреждений, 0 ошибок |

Первая установка и запуски Vitest/Vite в sandbox получили `spawn EPERM`.
Повторение тех же команд с разрешением вне sandbox прошло. Это ограничение
среды, не падение assertions. После чистой установки отсутствующая Rollup-native
зависимость не воспроизвелась. npm сообщил предупреждения deprecated uuid/recharts
и allow-scripts для esbuild; обновления зависимостей не выполнялись.

## Дефекты и вопросы PM

### QA-001 — P1: typecheck блокирует приёмку (Frontend, CORE-001)

Статус: воспроизведён на базовом SHA, устранён и независимо перепроверен на 9ba1def4.
Воспроизведение: чистая установка, затем `npm run typecheck`.
Ожидается: exit 0 согласно ROADMAP CORE-001/CORE-002.
Фактически: exit 1. Диагностики:

```text
UsersPage.tsx:241,249,257,292,300,308,316 TS2322: Property 'type' does not exist
UsersPage.tsx:264 TS2322: Property 'children' does not exist; Select requires options
store.ts:517 TS2304: Cannot find name 'loadUsers'
```

Передать Frontend; исправления production QA не выполняет.
Ретест: typecheck, весь Vitest, build и создание/редактирование пользователей
в обеих темах. До этого CORE-001/002 не принимать.

### QA-002 — P1: отсутствует npm test (QA, CORE-002)

Статус: исправлено в QA checkout добавлением `test: vitest run`;
проверено 71 тестом. Остальные scripts сохранены. Не слито.

### QA-003 — P1: CI не обеспечивает полный gate (QA/PM, CORE-003)

Статус: подтверждено чтением `.github/workflows/ci.yml` и `build.yml`.
Два workflow пересекаются, typecheck не вызывается. Ожидается единый workflow
с проверками обоих слоёв по CORE-003. Конфигурация branch protection не проверена.
В Git отслеживаются 15914 файлов node_modules; также отслеживаются backend bin/obj.
Игнорирование не удалит уже отслеживаемые файлы. Очистка не выполнялась:
нужен согласованный PM план согласно критериям CORE-003.

### QA-004 — P2: предупреждение о цикле чанков (Frontend)

Статус: воспроизведено `npm run build`; сборка exit 0.
Лог: `Circular chunk: vendor-other -> vendor-core -> vendor-other`.
PM/Frontend должны оценить разделение manualChunks и браузерный smoke;
падение приложения из этого предупреждения не установлено.

## Проверенное покрытие и пробелы

Frontend: расчёты, CSV, форматирование, роли, состав шкафов,
совместимость, секционирование. Backend: CalcEngine, CatalogCsv, Rights.
Это unit-проверки: они не доказывают HTTP-авторизацию, миграции PostgreSQL,
сквозной API/UI сценарий или числовое равенство всех расчётов TS/C#.
После handoff CORE-001 добавлены пять компонентных регрессионных проверок.

## Очередь и правила следующих проверок

| Источник | Задача | Состояние QA |
|---|---|---|
| Frontend developer, 01a0ca37-b2cf-7461-b3d0-008ff133cd0f | CORE-001 | 0d095d42 проверен в QA как 9ba1def4; typecheck/test/build прошли |
| Backend developer, 01a0ca37-66ff-7f62-9c84-d47738886e31 | CORE-005 | runtime-config-v1 разрешён PM; автор реализует, ждём SHA |
| PM manager, 01a0ca40-f569-7630-b660-708190bd34e8 | SEC-001/auth-v2 | ADR-008 принят, изолированный PostgreSQL harness разрешён; ждём fixture backend |

Проверять новые handoff каждые 60 минут через heartbeat текущей QA-задачи.
Для каждого handoff записывать task ID, ветку, точный SHA, контракт, критерии,
команды/exit codes, дефекты и решение о ретесте. Idle не означает done.
Повторять проверки при новом SHA, исправлении дефекта или новых критериях.
Работать в отдельной QA-ветке; не устанавливать пакеты и не собирать в чужом checkout.
Отчёт передавать PM, который назначает исправление Frontend/Backend.
ROADMAP, архитектуру и продуктовые решения редактирует PM.

### SEC-003

`db1036c5ddcb2779e7d205bcdbbb60eb7bd56134` проверен независимо: 80 frontend
тестов, typecheck и build прошли; fresh/stale remote error, переключение в local
и локальные login/register проверены в браузере в обеих темах. Подробности:
`qa/SEC-003.md`.

### Подготовленные сценарии SEC-001 по запросу PM

Это план, не выполненные API-тесты. PM сообщил об анонимной регистрации с ролью
admin; независимый HTTP-прогон этого дефекта ещё не выполнен.

| Сценарий POST /api/auth/register | Ожидание из handoff PM |
|---|---|
| Без токена, включая запрос роли admin | 401, пользователь не создан |
| Валидный manager | 403, пользователь не создан |
| Валидный engineer | 403, пользователь не создан |
| Валидный admin, корректный DTO | пользователь создан; точный success code/DTO по auth-v2 |

PM опубликовал auth-v2 в своём checkout `.worktrees/pm-core-004/docs` и разрешил
изолированный PostgreSQL harness. До исполняемых integration tests получить fixture,
схему ошибки и согласовать с backend запуск изолированной PostgreSQL. Не заменять HTTP-тест
проверкой текста RequireAuthorization: это не проверит реальное middleware.
