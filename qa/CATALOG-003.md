# CATALOG-003 — независимая QA-проверка concurrent catalog POST

Дата проверки: 2026-10-13  
Решение: **PASS**  
Подтверждённых дефектов: **0**

## Объект проверки

- Integrated target SHA: `658279e27387d14586d24458b064b321be8e63a3`
- Base SHA: `231857c2a45271cdbd59d8d9bd69f1a1ac0c2dc5`
- В интегрированной цепочке: CATALOG-001 (`81fb1eae`), CATALOG-002
  (`231857c2`), CATALOG-003 (`658279e2`) и VERSION-002 (`f3461ae2`).
- QA checkout: `E:/dev/TaCP/.worktrees/qa-catalog-003`
- QA branch: `codex/qa/catalog-003`
- Diff CATALOG-003: только `backend/TkpApi/Program.cs`, 10 additions,
  1 deletion.

## Результаты

Изолированный PostgreSQL HTTP/SQL probe: **52/52 PASS**.

- Два одновременных POST с точным SKU детерминированно дают один `201` и один
  `409`; в таблице остаётся одна строка, detail стабилен.
- Tombstone race даёт один `201`, один `409`, одну активную строку и ноль
  tombstone.
- Два одновременных POST с различными SKU/name/brand дают `201 + 201` и две
  строки.
- Последовательные exact SKU и case-variant SKU возвращают `409` с existing;
  trimmed case-insensitive name+brand также возвращает `409`.
- CATALOG-001: tracked entity успешно переименовывается через PUT (`200`),
  сохраняется ровно одна строка с новыми SKU/name.
- CATALOG-002: exact/case SKU conflicts на PUT дают стабильный `409`, исходная
  target-строка не меняется; PUT восстановление удаляет tombstone и создаёт одну
  активную запись; deleted catalog восстановленную запись не возвращает.
- POST доступен admin/manager/engineer; anonymous и invalid JWT получают `401`,
  authenticated no-role — `403`, malformed JSON — `400`.
- Обработчик не маскирует другие ошибки: PK unique violation и принудительная
  PostgreSQL trigger error остаются `500`, лишние строки не записываются.

## Gate

```text
dotnet build backend/TkpApi/TkpApi.csproj -c Release
PASS: 0 warnings, 0 errors

dotnet test backend/TkpApi.Tests/TkpApi.Tests.csproj -c Release
PASS: 142/142

pwsh.exe -NoProfile -File qa/CATALOG-003.probe.ps1
PASS: 52/52, 0 confirmed defects
```

Первый probe завершился на manager fixture, потому что QA использовал одинаковые
name+brand для разных ролевых записей и корректно получил продуктовый `409`.
Fixture разделён на уникальные значения; финальный прогон выполнен с чистого
кластера. Это ошибка сценария, продуктовый дефект не подтверждался.

## Очистка

- API и PostgreSQL остановлены.
- Порты `55395` и `55695` свободны.
- Временный каталог `qa_catalog003_*` удалён.
- Production-код QA не менял.
- `git add`, commit и push не выполнялись.

