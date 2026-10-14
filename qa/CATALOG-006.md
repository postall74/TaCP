# CATALOG-006 — независимая QA-проверка PUT advisory barrier

Дата: 2026-10-14. Вердикт: **PASS**, дефектов нет.

- Target: `2348606f5073cb66876af6892fc91a051f4b9e4a`.
- Parent: `b87f44e9157973787fed01fec228a1a4414c97a6`.
- Production diff: `backend/TkpApi/Program.cs`, +7/-1; transaction-scoped
  advisory lock и commit в PUT catalog.
- Backend tests: 142/142 PASS.
- Release build: PASS; только NU1900 недоступного audit feed.
- PostgreSQL 18, два Release API на общей БД: 86/86 PASS.

Проверены case-variant PUT неизвестных ID (`200+409`, одна строка), concurrent
rename существующей строки, общий POST↔PUT lock, разные SKU (`200+200`), а также
CATALOG-005 POST races, exact/case ID, tombstone rollback, sequential/upsert,
name+brand precedence, роли/401/403/400 и unrelated unique/DB500 rollback.
SQL assertions подтверждают winner/loser и отсутствие лишних строк.

Evidence: `qa/CATALOG-006.probe.ps1`. Оба API и PostgreSQL остановлены; порты
55425/55426/55725 и temp освобождены. Git add/commit/push не выполнялись.
