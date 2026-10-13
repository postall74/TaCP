# PROJECT-014 — независимая QA-проверка

Дата: 2026-10-13 (Asia/Yekaterinburg).

## Версии и среда

- Integrated backend SHA: `4f487a14ea3dd745c56b9e111cec8288ea186f74`.
- Parent SHA: `a410e266e6594884f9888d978364fa4453831a05`.
- Source branch: `codex/backend/project-014-update-item-conflict`.
- QA branch: `codex/qa/project-014`.
- QA worktree: `E:/dev/TaCP/.worktrees/qa-project-014`.
- Production scope относительно PROJECT-013 fix: `backend/TkpApi/Program.cs`,
  item precheck/catch и integrated route-ID normalization.
- QA evidence: `qa/PROJECT-014.probe.ps1`, этот отчёт и `qa/README.md`.
- Среда: временный PostgreSQL 18, Release API, real HTTP и SQL.

## Решение

**PASS.** Полный probe прошёл **163/163**. Duplicate, foreign и concurrent
`LineItem.Id` возвращают стабильный 409 и не повреждают существующие графы.
Own cabinet/item replacement и повторный PUT возвращают 200.

## Адресная матрица PROJECT-014

- body.id отличается от route id; response использует route id;
- первый PUT с собственными Cabinet.Id и LineItem.Id: 200, response JSON содержит
  обновлённые cabinet/item/segment;
- SQL сразу после первого PUT: ровно 1 project : 1 cabinet : 1 item : 1 segment;
- повторный идентичный PUT: 200, без дублей;
- duplicate LineItem.Id: 409 с detail, target graph сохранён;
- foreign LineItem.Id: 409, seed item и target cabinet сохранены;
- concurrent PUT двух roots с одним новым LineItem.Id: ровно 200 + 409; оба roots
  и cabinets сохранены, winning item ровно один;
- unique, empty, null и case-variant item IDs: 200;
- PROJECT-001 segment persistence подтверждён GET и SQL;
- anonymous 401, malformed 400, missing 404, engineer status 403, manager/admin 200;
- duplicate number и cabinet: 409 и атомарность;
- nested segment conflict и unrelated DB failure остаются 500 с rollback;
- предыдущая POST/VERSION/PROJECT-013 матрица также прошла.

## Команды и результаты

| Команда | Результат |
|---|---|
| `dotnet build backend/TkpApi/TkpApi.csproj --configuration Release` | exit 0, 0 warnings/errors |
| `dotnet test backend/TkpApi.Tests --configuration Release --verbosity minimal` | exit 0, 142/142, 0 skipped |
| `pwsh -NoProfile -File qa/PROJECT-014.probe.ps1` | exit 0, 163/163, 0 defects |

## Дефекты и cleanup

Дефекты PROJECT-014 не обнаружены. QA-013-001 не воспроизводится на integrated
SHA.

После проверки PostgreSQL на 55664 не отвечает (`pg_isready` exit 2), listeners
55364/55664 и временные каталоги `qa_project014_*` отсутствуют. Локальные
`bin/` и `obj/` игнорируются. Секреты probe создаются случайно только на время
процесса и в Git не записываются.
