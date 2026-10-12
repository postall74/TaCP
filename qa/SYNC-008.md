# SYNC-008 — независимая QA-проверка

Дата: 2026-10-13 (Asia/Yekaterinburg).

## Версии и область проверки

- Frontend SHA: `2b17eca62fad8f67cc2f7b35fb18235b55e52e60`.
- Base SHA: `9733602cf142bc70fdd40385dd572cd4d6ac533e`.
- Source branch: `codex/frontend/sync-008-edit-confirm`.
- QA branch: `codex/qa/sync-008`.
- QA worktree: `E:/dev/TaCP/.worktrees/qa-sync-008`.
- Production diff: `src/store.ts`, `src/components/CatalogPage.tsx`, исходный
  `src/store.test.ts`.
- QA diff: только `src/store.test.ts`, этот отчёт и `qa/README.md`.
- Среда: Windows, Node `v24.19.0`, npm `11.17.0`.

## Решение

**PASS.** HTTP 400/409/500 отклоняют Promise и точно откатывают как изменение
существующей позиции, так и создание новой. Соседняя позиция, порядок и исходные
объекты сохраняются; outbox очищается, success-toast отсутствует.

Network failure возвращает `queued`, оставляет optimistic update и одну операцию
outbox. После reconnect/flush запрос отправляется один раз повторно и очередь
очищается. Remote/local success сохраняют одну позицию без дублей.

## Проверенные сценарии

| Сценарий | Результат |
|---|---|
| Existing edit HTTP 400/409/500: optimistic state, rejection, full rollback | PASS |
| New item HTTP 400/409/500: optimistic state, rejection, removal | PASS |
| Сосед и порядок сохраняются; outbox очищается; success отсутствует | PASS |
| Form остаётся открытой при rejection и queued result | PASS по UI-ветвлению и store contract |
| Remote success: один API call, один item, outbox empty | PASS |
| Network: queued, reconnect retry, всего initial+retry, outbox empty | PASS |
| Local mode: synced без API, изменение сохранено | PASS |
| Full frontend regression suite | PASS |

QA расширил исходное покрытие: все три HTTP-статуса проверяются и для existing,
и для new item; controlled pending Promise подтверждает промежуточные optimistic
catalog/outbox; после отказа проверяются точные исходные ссылки, сосед, порядок,
единственный API call и отсутствие success-toast.

## Команды и результаты

| Команда | Результат |
|---|---|
| `npm ci` | exit 0, 182 пакета |
| `npm test -- src/store.test.ts` | exit 0, 40/40 |
| `npm run typecheck` | exit 0 |
| `npm test` | exit 0, 125/125, 10 файлов |
| `npm run build` | exit 0, 2011 модулей |

## Дефекты и ограничения среды

Дефекты SYNC-008 не обнаружены.

В проекте отсутствует jsdom, поэтому сохранение/закрытие формы подтверждено
исполняемым store contract и прямой проверкой ветвления `CatalogPage` /
`EquipmentModal`, без браузерного click-test.

`npm ci` повторил известные предупреждения: 5 dependency vulnerabilities
(3 moderate, 2 high), deprecated uuid/recharts, allow-scripts esbuild. Vite
повторил circular vendor chunk warning. Локально Node 24.19.0, CI использует 22.

Серверы и фоновые процессы не запускались. `dist/` и `node_modules/` игнорируются.
