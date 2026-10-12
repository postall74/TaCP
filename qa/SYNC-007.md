# SYNC-007 — независимая QA-проверка

Дата: 2026-10-12 21:03 (Asia/Yekaterinburg).

## Версии и область проверки

- Frontend SHA: `9733602cf142bc70fdd40385dd572cd4d6ac533e`.
- Base SHA: `50be39e18d0ad84fc2954b4c028feb15870f820c`.
- Source branch: `codex/frontend/sync-007-import-confirm`.
- QA branch: `codex/qa/sync-007`.
- QA worktree: `E:/dev/TaCP/.worktrees/qa-sync-007`.
- Production diff: `src/store.ts`, `src/components/CatalogPage.tsx`, исходный
  `src/store.test.ts`.
- QA diff: только `src/store.test.ts`, этот отчёт и `qa/README.md`.
- Среда: Windows, Node `v24.19.0`, npm `11.17.0`.

## Решение

**PASS.** Network error, HTTP 400 и HTTP 500 отклоняют Promise исходной ошибкой
и полностью восстанавливают исходный каталог. Существующие позиции и их порядок
сохраняются; success-toast не создаётся.

В `CatalogPage` закрытие modal и очистка CSV происходят только после результата
`true`: ошибка возвращает `false`, остаётся в modal и показывает error-toast.
Успешный import возвращает `true`, очищает CSV и закрывает modal.

## Проверенные сценарии

| Сценарий | Результат |
|---|---|
| Optimistic import обновляет существующий SKU и добавляет новый до ответа API | PASS |
| Network error: rejected Promise и точный rollback | PASS |
| HTTP 400: rejected Promise и точный rollback | PASS |
| HTTP 500: rejected Promise и точный rollback | PASS |
| Соседние элементы и их порядок сохраняются | PASS |
| Failure не создаёт success-toast | PASS |
| Modal/CSV сохраняются при failure; error-toast показывается | PASS по ветвлению UI и rejected store contract |
| Remote success вызывает import API один раз за действие | PASS |
| Success закрывает modal и очищает CSV | PASS по ветвлению UI и fulfilled store contract |
| Повторный import не дублирует новый SKU и обновляет существующий | PASS |
| Local mode возвращает число новых позиций и не вызывает API | PASS |
| Полный frontend regression suite | PASS |

QA усилил failure-тесты контролируемым pending Promise и проверкой
промежуточного optimistic state, точных исходных ссылок/порядка после rollback,
отсутствия любых store-toast и единственного API-вызова. Для repeat/local success
добавлены проверки общего размера каталога и сохранения соседа.

## Команды и результаты

| Команда | Результат |
|---|---|
| `npm ci` | exit 0, установлено 182 пакета |
| `npm test -- src/store.test.ts` | exit 0, 31/31 |
| `npm run typecheck` | exit 0 |
| `npm test` | exit 0, 116/116, 10 файлов |
| `npm run build` | exit 0, 2011 модулей |

## Дефекты и ограничения среды

Дефекты SYNC-007 не обнаружены.

В проекте нет DOM test environment (`jsdom` отсутствует), поэтому поведение
modal/CSV проверено через исполняемый rejected/fulfilled контракт store и прямую
проверку ветвления `CatalogPage`/`ImportModal`; браузерный click-test не выполнялся.

`npm ci` сообщил 5 известных уязвимостей зависимостей (3 moderate, 2 high),
deprecated `uuid@9.0.1`/`recharts@2.15.4` и allow-scripts для esbuild. Vite
повторил известное предупреждение о цикле чанков. CI использует Node 22, локально
использован Node 24.19.0.

Серверы и фоновые процессы не запускались. `dist/` и `node_modules/` —
игнорируемые локальные артефакты.
