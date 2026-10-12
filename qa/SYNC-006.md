# SYNC-006 — независимая QA-проверка

Дата: 2026-10-12 18:56 (Asia/Yekaterinburg).

## Версии и область проверки

- Задача: `SYNC-006`.
- Frontend SHA: `50be39e18d0ad84fc2954b4c028feb15870f820c`.
- Base SHA: `70d7996971742a91cc77f763e9576dbc2c0f522b`.
- Source branch: `codex/frontend/sync-006-catalog-restore-rollback`.
- QA branch: `codex/qa/sync-006`.
- QA worktree: `E:/dev/TaCP/.worktrees/qa-sync-006`.
- Изменения реализации: `src/store.ts`, исходный тест `src/store.test.ts`.
- Дополнения QA: только `src/store.test.ts`, `qa/SYNC-006.md`, `qa/README.md`.
- Среда: Windows, Node `v24.19.0`, npm `11.17.0`.

## Решение

**PASS.** При network error, HTTP 409 и HTTP 500 optimistic restore полностью
откатывается: позиция отсутствует в active, исходный tombstone возвращается со
всеми полями и на исходное место, соседние active/deleted элементы сохраняются.
Promise отклоняется исходной ошибкой.

`CatalogPage.handleRestore` показывает success только после успешного `await`.
Проверенный rejected Promise переходит в `catch`, поэтому success-toast страницы
не вызывается; store также не создаёт success-toast при rollback.

## Проверенные сценарии

| Сценарий | Результат |
|---|---|
| До ответа API restore оптимистично переносит позицию в active | PASS |
| Network failure откатывает active/deleted и rejects Promise | PASS |
| HTTP 409 откатывает active/deleted и rejects Promise | PASS |
| HTTP 500 откатывает active/deleted и rejects Promise | PASS |
| Tombstone сохраняет все поля, ссылку и исходный порядок | PASS |
| Соседние active/deleted позиции не меняются | PASS |
| Failure не создаёт success-toast; CatalogPage идёт в error branch | PASS |
| Remote success переносит позицию ровно один раз и вызывает API один раз | PASS |
| Local success переносит позицию ровно один раз без API | PASS |
| Unknown ID не меняет состояние, не вызывает API и показывает ошибку | PASS |
| Остальные sync, role и UI-тесты | PASS в полном suite |

QA усилил исходное покрытие проверкой промежуточного optimistic state,
тождественности исходного tombstone после rollback, отсутствия любых toast от
store при failure, уникальности local restore и поведения unknown ID.

## Команды и результаты

| Команда | Результат |
|---|---|
| `npm ci` | exit 0, установлено 182 пакета |
| `npm test -- src/store.test.ts` | exit 0, 27/27 |
| `npm run typecheck` | exit 0 |
| `npm test` | exit 0, 112/112, 10 файлов |
| `npm run build` | exit 0, 2011 модулей |

Промежуточный расширенный прогон упал только из-за ошибки нового QA-assertion:
toast использует поле `text`, а тест ожидал `message`. Assertion исправлен;
повторный целевой и полный прогоны прошли. Это не дефект реализации.

## Дефекты и ограничения среды

Дефекты SYNC-006 не обнаружены.

Ограничения среды и известные предупреждения:

- `npm ci` сообщил 5 уязвимостей зависимостей (3 moderate, 2 high), deprecated
  `uuid@9.0.1` и `recharts@2.15.4`, а также allow-scripts для `esbuild@0.25.12`;
- Vite повторил известное предупреждение о цикле чанков
  `vendor-other -> vendor-core -> vendor-other`;
- CI использует Node 22, локальная проверка выполнена на Node 24.19.0.

Серверы и фоновые процессы не запускались. `dist/` и `node_modules/` —
игнорируемые локальные артефакты, в Git не добавлены.
