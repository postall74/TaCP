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
SHA256 файла: `D056FCC9C8DBAF2D4D9F0FE452D9FFE25F267C3F03D5B3FCBA3B843AB79F3FDE`.

| Путь | Отслеживаемых файлов |
|---|---:|
| node_modules/ | 15914 |
| backend/TkpApi/bin/ | 98 |
| backend/TkpApi/obj/ | 30 |
| Всего | 16042 |

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
согласование: index.html и vendor-core/other/recharts/xlsx JS. Отдельный запрос
PM отправлен; до его ответа эти файлы в индекс очистки не добавляются.
Изменённый сборкой dist/index.html не должен попасть в commit.

## Очередь после handoff

SEC-002: обнаружен frontend commit `6d01c4a0`, требуется отдельная QA-ветка
и независимый ретест. Последний turn автора прерван лимитом, а не тестовой ошибкой.
CORE-005: у backend ещё нет нового commit в отдельном worktree; ждём готовый SHA.
SEC-001: ждём fixture backend; текущие 57 unit-тестов не проверяют HTTP middleware.
