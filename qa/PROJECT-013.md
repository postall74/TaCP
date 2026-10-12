# PROJECT-013 — независимая QA-проверка

Дата: 2026-10-13 (Asia/Yekaterinburg).

## Версии и среда

- Initial backend SHA: `13e41636e2f0d0f95031dc3d4c20f48191ffb4a9`.
- Fix/retest SHA: `d84ad3a7e37b049fdacdf65ff31ebfc74c11bcda`.
- Base SHA: `8c6d0031c07e64ca341240a8ce1e757d367eeba9`.
- Source branch: `codex/backend/project-013-update-cabinet-conflict`.
- QA branch: `codex/qa/project-013`.
- QA worktree: `E:/dev/TaCP/.worktrees/qa-project-013`.
- Production diff задачи и fix: только `backend/TkpApi/Program.cs`.
- QA evidence: `qa/PROJECT-013.probe.ps1`, этот отчёт и `qa/README.md`.
- Среда: временный PostgreSQL 18, Release API, real HTTP и SQL.

## Решение

**PASS после исправления.** На initial SHA был подтверждён P1-дефект обязательного
own-ID replacement. Exact fix SHA прошёл **149/149** HTTP/SQL assertions,
backend suite и Release build.

## QA-013-001 — P1: первый own Cabinet.Id PUT возвращает 500 после записи

- Владелец: Backend.
- Статус: исправлен на `d84ad3a7e37b049fdacdf65ff31ebfc74c11bcda` и
  независимо перепроверен в чистой изолированной БД.
- Условие: проект уже содержит шкаф `put-own-cab` и segment
  `put-own-segment`.
- Действие: `PUT /api/projects/put-own-root` с тем же Cabinet.Id
  `put-own-cab`, изменёнными полями шкафа и segment
  `put-own-segment-replaced`.
- Ожидается: HTTP 200, обновлённый граф в response/БД.
- Фактически: HTTP 500 с пустым response body; GET и SQL после запроса показывают,
  что замена шкафа и segment уже сохранена. Повтор идентичного PUT возвращает 200.
- Риск: клиент считает сохранённую операцию неуспешной и может показать ошибку или
  повторить уже применённое изменение; HTTP-результат не соответствует состоянию БД.
- Ретест: первый и повторный own-ID PUT вернули 200; response содержит route ID,
  один cabinet и replacement segment; SQL показывает ровно один атомарный граф.

Диагностический лог probe:

```text
PASS: PUT own-ID fixture 201
DIAG: own cabinet replacement status=200 body={...}
PASS: own cabinet ID replacement PUT 200
PASS: first own-ID PUT returns complete route-ID response JSON
PASS: first own-ID PUT persists one atomic replacement graph
PASS: repeated own cabinet PUT 200
PASS: PROJECT-001 segment persists through own-ID PUT and GET
```

## Остальная матрица

Прошли 149 проверок, включая:

- duplicate Cabinet.Id в PUT: stable 409 и исходный граф сохранён;
- foreign Cabinet.Id: stable 409, owner и target graphs сохранены;
- concurrent PUT двух roots с одним новым Cabinet.Id: ровно 200 + 409, оба roots
  сохранены, winning cabinet ровно один;
- distinct unique, empty, null и case-variant cabinet IDs: 200;
- PROJECT-001 segments сохраняются через distinct-ID PUT и читаются GET/SQL;
- anonymous 401, malformed 400, missing 404, engineer status 403, manager/admin 200;
- duplicate project number: 409 и исходный граф сохранён;
- nested item и segment conflicts остаются 500 с rollback исходного графа;
- unrelated forced DB update остаётся 500 с rollback;
- предыдущая POST/VERSION матрица, включая root/number/cabinet/item/segment/version
  конфликты и VERSION-001 snapshot.

## Команды и результаты

| Команда | Результат |
|---|---|
| `dotnet build backend/TkpApi/TkpApi.csproj --configuration Release` | exit 0, 0 warnings/errors |
| `dotnet test backend/TkpApi.Tests --configuration Release --verbosity minimal` | exit 0, 142/142 |
| `pwsh -NoProfile -File qa/PROJECT-013.probe.ps1` | exit 0: 149/149, 0 defects |

Первый build-вызов был прерван таймаутом автоматической проверки разрешения;
повторный запуск прошёл. Это ограничение среды, не дефект проекта.

## Cleanup

PostgreSQL на 55663 не отвечает (`pg_isready` exit 2), listeners 55363/55663 и
временные каталоги `qa_project013_*` отсутствуют. Локальные `bin/` и `obj/`
игнорируются.
