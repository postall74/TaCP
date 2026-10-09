# VERSION-001 — независимый QA

Статус: **PASS**.

## Объект проверки

- QA worktree: `E:/dev/TaCP/.worktrees/qa-version-001`;
- QA branch: `codex/qa/version-001`;
- base: `1edff933afe9f488f11137ffa9251bae6744c720` (`main`);
- target/HEAD: `f0a59e5c567dbeebb6d612d708c599d4b2409844`;
- production diff: `backend/TkpApi/Program.cs` (+19/-9) и новый
  `backend/TkpApi/Services/ProjectVersionSnapshots.cs` (+84).

Проверка сопоставлена с `project-version-v1` в актуальном `docs/ROADMAP.md` и
`docs/USER_NEEDS.md` из PM commit `95697d2a`. Это частичное повышение
стабильности `core-v1`; самостоятельного закрытия `NEED-*` нет.

## Результаты

`qa/VERSION-001.probe.ps1` на одноразовых PostgreSQL 18 и Release API: **27/27**.

- новый snapshot выдаёт известные поля cabinet/item только в camelCase;
- `id`, `name`, `items`, `qty`, `purchase`, `null` сохранены; purchase нового
  снимка соответствует действующему `numeric(12,2)`, legacy JSON с большей
  точностью возвращается без потери;
- legacy PascalCase cabinet/item нормализуются одинаково в GET list/detail;
- неизвестные extension-ключи на root/cabinet/item сохраняют регистр и значения;
- MD5 `Snapshot::text` до и после list/detail одинаков: stored JSON не изменён;
- anonymous GET/POST versions возвращает 401, engineer может создать версию;
- отсутствующий проект возвращает 404 для detail и POST version.

`src/version-001.test.ts` вызывает фактические `hydrateFromApi` →
`normalizeProject`/`normalizeVersion` → `restoreVersion`. Снимок
восстанавливает cabinet/item `id`, `name`, `items`, `qty`, `purchase`, `null`
и расчётные числа без runtime exception.

## Команды

| Проверка | Результат |
|---|---|
| `pwsh -NoProfile -File qa/VERSION-001.probe.ps1` | PASS, 27/27 |
| `npm.cmd run typecheck` | PASS |
| `npm.cmd test` | PASS, 86/86, 10 файлов |
| `npm.cmd run build` | PASS |
| `dotnet test backend/TkpApi.Tests --configuration Release` | PASS, 100/100 |
| `dotnet build backend/TkpApi/TkpApi.csproj --configuration Release` | PASS, 0 errors |
| `git diff --check` | PASS |

NuGet restore/build вывел `NU1900`, потому что среда не смогла обратиться к
`https://api.nuget.org/v3/index.json` для аудита уязвимостей. Компиляционных
предупреждений нет; это ограничение сетевой проверки зависимостей, а не дефект
VERSION-001. Vite сохранил существующее предупреждение о circular manual chunks.

## Гигиена и границы

QA добавил только `qa/VERSION-001.md`, `qa/VERSION-001.probe.ps1` и
`src/version-001.test.ts`; production-код и docs не менялись. Секреты в файлы и
вывод не записаны. API и одноразовый PostgreSQL остановлены, порты 55241/55541
свободны, временные каталоги/БД/credentials удалены. Commit/push не выполнялись.

