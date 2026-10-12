# PROJECT-011 — независимая QA-проверка

Дата: 2026-10-12 19:02 (Asia/Yekaterinburg).

## Версии и среда

- Backend SHA: `db84d556004b9e733a945acd622382ad0835ca23`.
- Base SHA: `ef5559f8bb8995b3609dd45127285e5fa971585f`.
- Source branch: `codex/backend/project-011-create-segment-conflict`.
- QA branch: `codex/qa/project-011`.
- QA worktree: `E:/dev/TaCP/.worktrees/qa-project-011`.
- Production diff: только `backend/TkpApi/Program.cs`, +10 строк.
- QA diff: `qa/PROJECT-011.probe.ps1`, этот отчёт и `qa/README.md`.
- Реальная среда: временный PostgreSQL 18, API `Production`, real HTTP и SQL.

## Решение

**PASS.** `POST /api/projects` возвращает стабильный HTTP 409 с detail
`Сегмент шкафа с таким идентификатором уже существует` для повторяющегося
segment ID внутри одного или нескольких шкафов, для уже существующего ID и для
проигравшего конкурентного запроса. Ни один конфликт не сохраняет частичный
граф; существующий seed остаётся без изменений.

## Исполненная HTTP/SQL-матрица

Изолированный probe выполнил **82/82** проверок:

- дубликат segment ID в одном шкафу: 409, root/cabinet/segment = 0;
- дубликат segment ID между шкафами: 409, весь граф = 0;
- существующий segment ID: 409, новый root/cabinet = 0, seed = 1;
- две уникальные root-заявки с одним segment ID: ровно 201 + 409, в БД только
  один root, один cabinet и один segment;
- valid, empty, null и case-variant segment IDs: 201;
- регрессии root ID, project number, cabinet ID и item ID: стабильные 409,
  включая конкурентные запросы и атомарность;
- anonymous: 401; malformed JSON: 400;
- engineer `won/lost`: 403 и ноль строк; engineer `calc/sent`: 201;
- manager/admin разрешённые статусы: 201;
- искусственная несвязанная ошибка БД остаётся 500 и не сохраняет root.

Probe: `qa/PROJECT-011.probe.ps1`. Он создаёт уникальный временный кластер и
БД, запускает Release API, выполняет запросы/SQL assertions и всегда завершает
API/PostgreSQL и удаляет временный каталог.

## Команды и результаты

| Команда | Результат |
|---|---|
| `dotnet build backend/TkpApi/TkpApi.csproj --configuration Release` | exit 0, 0 warnings, 0 errors |
| `dotnet test backend/TkpApi.Tests --configuration Release --no-restore --verbosity minimal` | exit 0, 142/142, 0 skipped |
| `pwsh -NoProfile -File qa/PROJECT-011.probe.ps1` | exit 0, 82/82 |

## Дефекты и ограничения среды

Дефекты PROJECT-011 не обнаружены.

Первый параллельный запуск `dotnet test` и `dotnet build` столкнулся с блокировкой
`obj/Release/net8.0/TkpApi.dll` процессом компилятора. После завершения build
последовательный test run прошёл 142/142. Это конфликт команд QA, не дефект кода.

Первый запуск probe через Windows PowerShell 5 не поддержал параметр
`SkipHttpErrorCheck`; cleanup сработал. Повторный запуск тем же сценарием через
PowerShell 7.6.5 прошёл 82/82.

После проверки PostgreSQL на порту 55661 не отвечает (`pg_isready` exit 2),
listeners 55361/55661 и временные каталоги `qa_project011_*` отсутствуют.
Секреты probe генерировались случайно только в процессе и не записаны в Git.
