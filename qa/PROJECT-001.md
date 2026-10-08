# PROJECT-001 — QA-отчёт

Статус: **PASS**.

## Объект проверки

- ветка QA: `codex/qa/project-001`;
- база: `1edff933afe9f488f11137ffa9251bae6744c720`;
- target: `0ba8cc487d72a4bf45c50abad288e8c754b80696`;
- production diff: `backend/TkpApi/Program.cs`, +4/-1.

## Изолированный HTTP/PostgreSQL-прогон

Сценарий `qa/PROJECT-001.probe.ps1` создал одноразовый PostgreSQL 18 cluster,
Release API и случайные локальные bootstrap/JWT credentials. Результат: 25/25.

- анонимные POST/GET: 401, запись не создаётся;
- engineer создаёт проект с двумя segments; GET одного проекта и GET списка
  возвращают segments;
- id/kind/name/partitions сохраняются, включая `partitions: 0`;
- изменение состава и повторный PUT дают 200 и ровно один актуальный segment;
- empty и null segments принимаются и читаются как пустой/null состав;
- engineer DELETE проекта: 403; admin DELETE: 204; последующий GET: 404;
- прямой SQL после удаления проекта подтверждает 0 строк в `cabinet_segments`.

Первый запуск был остановлен runtime-config-v1 до HTTP assertions из-за
отсутствующих обязательных production-параметров. Harness дополнен валидными
ExpireMinutes, AllowedOrigins и AllowedHosts. Один assertion сначала зависел от
порядка строк и был исправлен на поиск по id. Отдельная ранняя SQL-команда имела
ошибку quoting и не учитывалась как доказательство; финальный прогон использует
успешный psql exit code и числовой результат 0.

## Обязательные проверки backend

| Проверка | Результат |
|---|---|
| `dotnet test backend/TkpApi.Tests` | PASS, 100/100, 0 skipped |
| Release build | PASS, 0 warnings, 0 errors |
| PostgreSQL HTTP probe | PASS, 25/25 |

Первый sandbox-запуск .NET не мог записать `obj`; повтор вне sandbox прошёл.
Это ограничение среды, не продуктовый дефект.

## Гигиена и решение

Процессы API/PostgreSQL остановлены, порты 55231/55531 свободны, временная БД
и credentials удалены. Production-код, docs и roadmap QA не менял. PROJECT-001
рекомендован к приёмке на target SHA.
