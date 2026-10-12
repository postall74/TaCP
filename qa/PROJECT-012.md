# PROJECT-012 — независимая QA-проверка

Дата: 2026-10-12 19:10 (Asia/Yekaterinburg).

## Версии и среда

- Backend SHA: `0838b921a5f96d7a74d948a094166abfc89a0efd`.
- Base SHA: `db84d556004b9e733a945acd622382ad0835ca23`.
- Source branch: `codex/backend/project-012-create-version-conflict`.
- QA branch: `codex/qa/project-012`.
- QA worktree: `E:/dev/TaCP/.worktrees/qa-project-012`.
- Production diff: только `backend/TkpApi/Program.cs`, +27 строк.
- QA diff: `qa/PROJECT-012.probe.ps1`, этот отчёт и `qa/README.md`.
- Среда: временный PostgreSQL 18, Release API, real HTTP и SQL.

## Решение

**PASS.** `POST /api/projects` возвращает стабильный HTTP 409 с detail
`Версия проекта с таким идентификатором уже существует` для повторяющегося
`ProjectVersion.Id`, уже существующего ID и проигравшего конкурентного запроса.
Конфликты не сохраняют частичный граф, существующий snapshot остаётся неизменным.

## Исполненная HTTP/SQL-матрица

Изолированный probe выполнил **100/100** проверок:

- два одинаковых nested version ID: 409, root/version = 0;
- existing version ID: 409, новый root = 0, seed = 1;
- concurrent unique roots с одним version ID: ровно 201 + 409, в БД один root и
  одна version;
- valid, empty, null и case-variant versions: 201;
- прежние root ID, project number, cabinet ID, item ID и segment ID precheck/race:
  ожидаемые 409 и атомарность;
- anonymous: 401; malformed JSON: 400;
- engineer `won/lost`: 403 и ноль строк; engineer `calc/sent`: 201;
- manager/admin разрешённые статусы: 201;
- несвязанная искусственная ошибка БД остаётся 500 и не сохраняет root;
- VERSION-001: создание snapshot endpoint возвращает 200, последующий GET
  проекта возвращает одну version с label, cabinet snapshot и `eqBase=10`, SQL
  подтверждает одну сохранённую запись.

Probe: `qa/PROJECT-012.probe.ps1`. Он создаёт уникальный временный кластер и БД,
запускает Release API, выполняет HTTP/SQL assertions, затем завершает процессы и
удаляет временный каталог.

## Команды и результаты

| Команда | Результат |
|---|---|
| `dotnet build backend/TkpApi/TkpApi.csproj --configuration Release` | exit 0, 0 warnings, 0 errors |
| `dotnet test backend/TkpApi.Tests --configuration Release --verbosity minimal` | exit 0, 142/142, 0 skipped |
| `pwsh -NoProfile -File qa/PROJECT-012.probe.ps1` | exit 0, 100/100 |

Первый `dotnet test --no-restore` завершился exit 0 без явного вывода, поскольку
test-проект ещё не был восстановлен в новом worktree. Он не использован как
доказательство. Повторный запуск с restore дал явные 142/142.

## Дефекты и cleanup

Дефекты PROJECT-012 не обнаружены.

После проверки PostgreSQL на порту 55662 не отвечает (`pg_isready` exit 2),
listeners 55362/55662 и временные каталоги `qa_project012_*` отсутствуют.
Локальные `bin/` и `obj/` игнорируются. Секреты создавались случайно только на
время probe и не записаны в Git.
