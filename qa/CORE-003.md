# CORE-003 — ci-v1, handoff QA

Дата: 2026-09-23. Ветка `codex/qa/core-003-ci-gate`, база `49c21df4`.
HTTP-контракт, production-код, зависимости и lockfile не менялись.

## Изменения

- Один `.github/workflows/ci.yml`; дублирующий `build.yml` удалён.
- Все PR, push main и ручной запуск: Node 22, `npm ci`, `npm run typecheck`,
  `npm test`, `npm run build`; .NET SDK 8, `dotnet test`, Release build.
- Права workflow ограничены `contents: read`.
- `.gitignore`: node_modules, dist, **/bin, **/obj, локальные .worktrees.
- Убраны случайные Markdown fences из `.gitignore`.

## Согласованная очистка индекса

PM согласовал список до исполнения (docs PM commit `281b631c`).
Точный список: [core-003-tracked-artifacts.txt](core-003-tracked-artifacts.txt).
SHA256 итогового файла: `5A1043DA281D3F9B02378530FD19F2D0AEBA9D01994461EF9B116B6C7767F71C`.

| Путь | Отслеживаемых файлов |
|---|---:|
| node_modules/ | 15914 |
| backend/TkpApi/bin/ | 98 |
| backend/TkpApi/obj/ | 30 |
| dist/ (отдельно согласовано PM) | 5 |
| Всего | 16047 |

Выполнены exit 0:

```sh
git rm -r -n --cached -- node_modules backend/TkpApi/bin backend/TkpApi/obj
git rm -r --cached -- node_modules backend/TkpApi/bin backend/TkpApi/obj
```

После операции staged deletions точно совпали со списком: 16042, расхождений 0.
`git ls-files` для трёх каталогов вернул 0 файлов. Все три локальных каталога
сохранены. Force, удаление с диска и переписывание истории не применялись.

## Проверки и ограничения

- `git check-ignore --no-index` подтвердил все пять групп игнорируемых путей.
- `git diff --check` для изменяемых конфигураций прошёл.
- Workflow прочитан QA и PM, последовательность соответствует ci-v1.
- Автоматический YAML/actionlint не выполнен: парсер и actionlint не установлены.
- Приложение и test harness не менялись после проверенной CORE-002 базы:
  76 frontend / 57 backend, typecheck и сборки успешны (см. README).
- GitHub Actions фактически не запускался; PR, обязательные branch checks,
  Node 22/.NET SDK 8 пока не проверены. Задача не объявлена done.

Дополнительно обнаружены пять tracked dist-файлов, не входящих в первоначальное
согласование: index.html и vendor-core/other/recharts/xlsx JS. PM отдельно
согласовал dry-run и `git rm -r --cached -- dist`; обе команды выполнены успешно.
Итоговый diff относительно 49c21df4: 16047 удалённых artifact paths, расхождений
с расширенным списком 0. Локальный dist/index.html сохранён. Удаление build.yml
учитывается отдельно от этих артефактов. Первый cleanup commit: `12124752`.

## Очередь после handoff

SEC-002: обнаружен frontend commit `6d01c4a0`, требуется отдельная QA-ветка
и независимый ретест. Последний turn автора прерван лимитом, а не тестовой ошибкой.
CORE-005: у backend ещё нет нового commit в отдельном worktree; ждём готовый SHA.
SEC-001: ждём fixture backend; текущие 57 unit-тестов не проверяют HTTP middleware.
