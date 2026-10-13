# PROJECT-015 — независимая QA-проверка

Дата: 2026-10-13 (Asia/Yekaterinburg).

## Версии и область

- Target SHA: `65fc78c2a83e7092979dabd8f87bff846c0bc432`.
- Base SHA: `4f487a14ea3dd745c56b9e111cec8288ea186f74`.
- Source branch: `codex/backend/project-015-update-segment-conflict`.
- QA branch: `codex/qa/project-015`.
- QA worktree: `E:/dev/TaCP/.worktrees/qa-project-015`.
- Production diff: только `backend/TkpApi/Program.cs`, +15 строк.
- QA evidence: `qa/PROJECT-015.probe.ps1`, этот отчёт и `qa/README.md`.
- Среда: временный PostgreSQL 18, Release API, real HTTP и SQL.

## Решение

**PASS.** Адресный probe прошёл **92/92**, дефектов нет.

## Проверенная матрица

- duplicate Segment.Id внутри одного шкафа: stable 409, target graph сохранён;
- duplicate Segment.Id между шкафами: stable 409, новый graph = 0;
- foreign Segment.Id: stable 409, owner и target сохранены;
- concurrent PUT двух distinct targets с одним новым segment: ровно 200 + 409;
  оба roots/cabinets сохранены, winning segment один;
- own Cabinet.Id + LineItem.Id + Segment.Id, body.id != route id: первый и
  повторный PUT 200;
- response JSON содержит route id и ровно один cabinet/item/segment с точными
  name/content и `partitions=2`;
- SQL сразу после первого PUT подтверждает один атомарный граф 1:1:1:1;
- повторный PUT и GET подтверждают единственный own segment и точный content;
- unique, empty, null и case-variant segment IDs: 200;
- PROJECT-001 distinct-ID segment persistence: GET + SQL;
- PROJECT-013/014 регрессии: number/cabinet/item conflicts остаются stable 409,
  own/repeated PUT и concurrency проходят;
- anonymous 401, malformed 400, missing 404, engineer status 403, manager/admin 200;
- unrelated forced DB failures остаются 500 с rollback.

## Команды и результаты

| Команда | Результат |
|---|---|
| `dotnet build backend/TkpApi/TkpApi.csproj --configuration Release` | exit 0, 0 warnings/errors |
| `dotnet test backend/TkpApi.Tests --configuration Release --verbosity minimal` | exit 0, 142/142, 0 skipped |
| `pwsh -NoProfile -File qa/PROJECT-015.probe.ps1` | exit 0, 92/92, 0 defects |

Первый probe остановился только из-за ошибки нового QA SQL-assertion: колонка
`partitions` имеет строчное имя, тест запросил `Partitions`. До ошибки API уже
вернул корректный 200 и JSON. Assertion исправлен; чистый повторный probe прошёл
92/92. Это не дефект реализации.

## Cleanup

PostgreSQL на 55665 не отвечает (`pg_isready` exit 2), listeners 55365/55665 и
временные каталоги `qa_project015_*` отсутствуют. Локальные `bin/` и `obj/`
игнорируются. Секреты probe создаются случайно только на время процесса.
