# PROJECT-016 — независимая QA-проверка

Дата: 2026-10-14 (Asia/Yekaterinburg).

## Версии и область

- Target SHA: `99ea0d3a1df89062e35e9360aa15f3c12e9f534f`.
- Parent SHA: `ab69abe8e927ee10c3784f72ff043a0c9db031d9`.
- QA branch: `codex/qa/project-016`.
- QA worktree: `E:/dev/TaCP/.worktrees/qa-project-016`.
- Production diff: только `backend/TkpApi/Program.cs`, два вызова
  `AsSplitQuery()` в GET detail и PUT load.
- QA evidence: `qa/PROJECT-016.probe.ps1`, этот отчёт и `qa/README.md`.
- Среда: одноразовый PostgreSQL 18, Release API, real HTTP/SQL.

## Решение

**PASS.** Backend suite прошёл 142/142. Независимый PostgreSQL probe прошёл
107/107, подтверждённых дефектов нет.

## Large graph и SQL

Создан проект с 3 шкафами, 21 позицией и 4 сегментами в каждом шкафу
(63 позиции, 12 сегментов), а также 11 версиями. Проверены:

- GET detail: точные количества, идентификаторы, qty/purchase/partitions и
  отсутствие дублей;
- legacy PascalCase snapshot нормализуется в camelCase, включая items/segments,
  произвольное extension-поле сохраняется;
- PUT меняет точные scalar/nested значения, оставляет 3/63/12/11 объектов;
- GET list возвращает тот же large graph без размножения строк;
- POST version создаёт 12-ю версию первой в ответе; следующий GET возвращает
  её camelCase snapshot с 3 шкафами и 4 сегментами;
- SQL log содержит отдельные команды split query, не содержит EF20504 /
  `MultipleCollectionIncludeWarning`; ни одна команда не соединяет одновременно
  `project_items` и `cabinet_segments`.

В PUT handler исходный код содержит один `SaveChangesAsync`; HTTP/SQL rollback
проверен конфликтами и принудительной ошибкой БД.

## Регрессии и негативные сценарии

Probe повторно проверил PROJECT-013/014/015:

- own/repeated cabinet, item и segment IDs;
- duplicate/foreign IDs и duplicate project number: стабильные 409 с точным
  detail и неизменным исходным графом;
- concurrent cabinet/item/segment PUT: ровно один 200 и один 409, без потери
  корневых проектов;
- null/empty/case-variant коллекции;
- anonymous 401, malformed JSON 400, missing project 404;
- engineer status transition 403, manager/admin 200;
- unrelated PostgreSQL failures остаются 500, транзакция откатывает graph;
- PROJECT-001 segment persistence и VERSION-001/002 legacy/camelCase/segments.

## Команды и результаты

| Команда | Результат |
|---|---|
| `dotnet restore backend/TkpApi.Tests/TkpApi.Tests.csproj` | exit 0; NU1900 из-за недоступного audit feed |
| `dotnet test backend/TkpApi.Tests/TkpApi.Tests.csproj --no-restore` | exit 0, 142/142, 0 skipped |
| `dotnet build backend/TkpApi/TkpApi.csproj --configuration Release --no-restore` | exit 0, 0 ошибок; NU1900 |
| `pwsh -NoProfile -File qa/PROJECT-016.probe.ps1` | exit 0, 107/107, 0 defects |

NU1900 относится к сетевой проверке уязвимостей NuGet; восстановление из кэша,
компиляция и тесты завершились успешно. Первые probe-запуски выявили только ошибки
нового QA harness: sandbox не разрешал старт PostgreSQL, присваивание env с точкой,
зависимость assertions от порядка строк и блокировку активного console log.
Harness исправлен; финальный чистый прогон прошёл полностью.

## Cleanup

API и PostgreSQL остановлены в `finally`; временный каталог удалён. Порты
55366/55666 освобождены. Секреты создавались случайно только для процесса.
Git add/commit/push не выполнялись.
