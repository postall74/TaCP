# CATALOG-005 — независимая QA-проверка advisory barrier

Дата: 2026-10-14 (Asia/Yekaterinburg).  
Решение: **PASS**. Подтверждённых дефектов: **0**.

## Версии и область

- Target: `b87f44e9157973787fed01fec228a1a4414c97a6`.
- Parent: `99ea0d3a1df89062e35e9360aa15f3c12e9f534f`.
- QA branch: `codex/qa/catalog-005`.
- Production diff: только `backend/TkpApi/Program.cs`, +5 строк:
  transaction-scoped PostgreSQL advisory lock по normalized SKU и commit.
- Evidence: `qa/CATALOG-005.probe.ps1`, этот отчёт, `qa/README.md`.

## Результат

Изолированный PostgreSQL 18, два Release API-процесса на общей БД:
**78/78 PASS**.

- Одновременные `Barrier-Case` / `barrier-case` с разными ID: ровно `201+409`,
  одна SQL-строка, стабильный duplicate detail.
- Loser получил exact winner payload; повтор loser вернул тот же winner.
- Одновременные разные normalized SKU через разные API: `201+201`, обе строки
  сохранены; глобальной сериализации unrelated SKU нет.
- CATALOG-003 exact-SKU race: `201+409`, одна строка, стабильный loser.
- CATALOG-004 same explicit ID race: `201+409`; case-variant ID остаются
  различными и дают `201+201`.
- Tombstone races и forced conflicts подтверждают rollback: loser не удаляет
  tombstone; успешное exact-SKU восстановление оставляет active1/tomb0.
- Sequential exact/case SKU, trimmed case-insensitive name+brand, conflict
  precedence и empty ID GUID прошли.
- Admin/manager/engineer — 201; anonymous/invalid — 401; no-role — 403;
  malformed JSON — 400.
- Сторонний unique violation и принудительная DB error остаются 500 без loser row.

SQL evidence выполняется самим probe через `psql`: проверяются точные количества,
winner ID/SKU, active/tombstone состояния и отсутствие loser rows. Два процесса
имеют разные HTTP-порты и общий connection string; это проверяет database-scoped
barrier, а не внутрипроцессную синхронизацию.

## Gate

| Команда | Результат |
|---|---|
| `dotnet test backend/TkpApi.Tests/TkpApi.Tests.csproj --no-restore` | PASS, 142/142 |
| `dotnet build backend/TkpApi/TkpApi.csproj --configuration Release --no-restore` | PASS, 0 ошибок; NU1900 audit-feed warning |
| `pwsh -NoProfile -File qa/CATALOG-005.probe.ps1` | PASS, 78/78 |

Промежуточные QA fixture были исправлены до чистого прогона: первый вариант
добавлял пробелы к SKU сверх case-variant критерия; второй использовал одинаковые
name/brand у разных SKU и закономерно попадал в отдельное правило дубля.
Продуктовый дефект этими диагностическими запусками не подтверждён.

## Cleanup

Оба API и PostgreSQL остановлены, порты 55415/55416/55715 освобождены,
временный каталог удалён. Git add/commit/push не выполнялись.
