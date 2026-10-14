# CATALOG-007 — независимая QA-проверка конкурентного DELETE

Дата: 2026-10-14 (Asia/Yekaterinburg).  
Решение: **PASS**. Подтверждённых дефектов: **0**.

## Версии и область

- Target: `0b369aaa9c9aa1083e84ff71c0f4d22bc557f8cd`.
- Parent: `2348606f5073cb66876af6892fc91a051f4b9e4a`.
- QA branch: `codex/qa/catalog-007`.
- Production diff: только `backend/TkpApi/Program.cs`, +5 строк: transaction-scoped
  advisory lock по `id` и commit в DELETE endpoint.
- Контракт: `catalog-delete-race-v1`; `NEED-001` закрыт частично.

## Результат

Изолированный PostgreSQL 18 и два Release API-процесса на общей БД:
**137/137 PASS**.

- 10 синхронизированных same-id DELETE через разные процессы дали `204+204`.
- После каждой гонки active row отсутствует и остаётся ровно один полный tombstone:
  исходные SKU/name/brand/category/direction/unit/purchase/ratedCurrent/attrs,
  валидные `DeletedAt` и `DeletedBy`.
- Последовательный повтор и неизвестный ID вернули 204.
- Одновременные DELETE разных ID дали `204+204` и два tombstone.
- Manager/admin получили 204; engineer — 403; anonymous/invalid token — 401;
  запрещённый DELETE не изменил active row.
- POST-воскрешение после raced DELETE оставило active1/tomb0.
- Регрессии CATALOG-005 POST и CATALOG-006 PUT прошли на двух процессах.
- Принудительная несвязанная ошибка при записи tombstone осталась 500;
  транзакция сохранила active1/tomb0 без частичного состояния.

Probe также повторил унаследованные проверки POST/PUT, tombstone rollback,
case-insensitive SKU, explicit ID и обычные DB500-сценарии.

## Gate

| Команда | Результат |
|---|---|
| `dotnet restore backend/TkpApi.Tests/TkpApi.Tests.csproj -p:NuGetAudit=false` | PASS |
| `dotnet test backend/TkpApi.Tests/TkpApi.Tests.csproj --no-restore` | PASS, 142/142 |
| `dotnet build backend/TkpApi/TkpApi.csproj --configuration Release --no-restore` | PASS, 0 предупреждений/ошибок |
| `pwsh -NoProfile -File qa/CATALOG-007.probe.ps1` | PASS, 137/137 |

## Ограничения среды и fixture

- Первый `--no-restore` не стартовал в свежем worktree из-за отсутствующего
  `obj/project.assets.json`; после обычного restore обязательные проверки прошли.
- Первый sandbox-запуск PostgreSQL не смог создать restricted token. Разрешённый
  локальный повтор запустил кластер штатно.
- Первый исполняемый probe выявил старую uppercase-константу e-mail в перенесённой
  QA-fixture; после исправления fixture чистый прогон прошёл. Продуктовый дефект
  не подтверждён.

## Cleanup

Оба API-процесса и PostgreSQL остановлены, временный кластер удалён. Порты
55435, 55436 и 55735 освобождены. Git add/commit/push не выполнялись.
