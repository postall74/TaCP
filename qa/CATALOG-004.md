# CATALOG-004 — независимая QA-проверка конфликтов явного catalog ID

Дата проверки: 2026-10-13  
Решение: **PASS**  
Подтверждённых дефектов: **0**

## Объект проверки

- Exact target SHA: `ab69abe8e927ee10c3784f72ff043a0c9db031d9`
- Parent/base SHA: `658279e27387d14586d24458b064b321be8e63a3`
- QA checkout: `E:/dev/TaCP/.worktrees/qa-catalog-004`
- QA branch: `codex/qa/catalog-004`
- Production diff: только `backend/TkpApi/Program.cs`, 11 additions,
  1 deletion; `git diff --check` чист.

## Результаты

Изолированный PostgreSQL HTTP/SQL probe: **72/72 PASS**.

- Existing exact case-sensitive ID с уникальными SKU/name/brand возвращает
  стабильный `409`; оригинал не меняется, loser не появляется.
- Два конкурентных POST с одинаковым explicit ID и различными уникальными SKU
  дают `201 + 409`, одну строку и стабильный ID-conflict detail.
- Детерминированный tombstone-loser через PostgreSQL delay trigger подтверждает
  транзакционный rollback: победитель остаётся активным, tombstone проигравшего
  запроса не удаляется.
- Empty ID получает сгенерированный GUID и `201`; GUID сохраняется в SQL.
- Case-variant ID создаются как две различные записи (`201 + 201`).
- При одновременном name+brand и ID конфликте сохраняется существующий порядок:
  name+brand duplicate detail имеет приоритет, оба оригинала неизменны.
- CATALOG-003 exact-SKU race (`201 + 409`), tombstone race (active1/tomb0),
  unique concurrency (`201 + 201`) и последовательные case/name правила прошли.
- CATALOG-001 tracked rename и CATALOG-002 PUT conflict/restore/deleted catalog
  прошли без регрессий.
- Admin/manager/engineer могут POST; anonymous/invalid JWT получают `401`,
  no-role — `403`, malformed JSON — `400`.
- Сторонний partial unique index violation (`23505`) и принудительная DB error
  остаются `500`; транзакции не записывают loser.

## Gate

```text
dotnet build backend/TkpApi/TkpApi.csproj -c Release
PASS: 0 warnings, 0 errors

dotnet test backend/TkpApi.Tests/TkpApi.Tests.csproj -c Release
PASS: 142/142

pwsh.exe -NoProfile -File qa/CATALOG-004.probe.ps1
PASS: 72/72, 0 confirmed defects
```

Первый запуск probe использовал старый NormalizedEmail из скопированного QA
fixture и поэтому не создал no-role principal. Fixture исправлен; финальный
прогон выполнен с чистого кластера. Это ошибка сценария, продуктовый дефект не
подтверждался.

## Очистка

- API и PostgreSQL остановлены.
- Порты `55405` и `55705` свободны.
- Временный каталог `qa_catalog004_*` удалён.
- Production-код QA не менял.
- `git add`, commit и push не выполнялись.

