# SYNC-010 — независимая QA-проверка подтверждаемого сохранения тарифов

Дата проверки: 2026-10-13  
Контракт: `rates-confirm-v1`  
Решение: **PASS**  
Подтверждённых дефектов: **0**

## Объект проверки

- Target SHA: `3828a26201b3c8c2a56a77b94b0a8d4355ef9677`
- Parent/base SHA реализации: `6ea26db7255b5370e5d82b6c6a69e6be190d6d06`
- QA checkout: `E:/dev/TaCP/.worktrees/qa-sync-010`
- QA branch: `codex/qa/sync-010`
- Изменённые файлы: `src/components/RatesPage.tsx`,
  `src/components/RatesPage.test.ts`, `src/store.ts`, `src/store.test.ts`.
- Diff: 294 additions, 39 deletions; `git diff --check` чист.

## Результаты

- Admin вводит значения в локальный draft: до явного нажатия save подтверждённые
  rates не меняются и запрос не отправляется.
- Явное сохранение вызывает ровно один `PUT /api/rates`, а возвращённые сервером
  rates применяются один раз.
- Network, HTTP 400, 403 и 500 сохраняют подтверждённые rates, settings и расчёты;
  создаётся ровно один корректный error-toast, success-toast отсутствует, draft
  остаётся доступен для повторной попытки.
- Manager и engineer видят read-only форму; store блокирует прямой вызов до PUT.
- Reset изменяет только rates и сохраняет company, theme, `apiBaseUrl` и
  connection state.
- Local mode сохраняет rates без обращения к API.
- Chrome UI smoke подтвердил: admin draft/dirty indicator, отсутствие success
  до save, save-toast после явного сохранения, reset к типовым значениям,
  светлую и тёмную темы.

## Gate

```text
npm.cmd test -- src/store.test.ts src/components/RatesPage.test.ts
PASS: 2 files, 59/59

npm.cmd run typecheck
PASS

npm.cmd test
PASS: 11 files, 144/144

npm.cmd run build
PASS
```

Build сохраняет известное неблокирующее предупреждение:

```text
Circular chunk: vendor-other -> vendor-core -> vendor-other.
```

## Очистка

- Временный Vite server на `127.0.0.1:4180` остановлен, порт свободен.
- Production-код QA не менял; добавлены только QA evidence и журнал.
- `git add`, commit и push не выполнялись.

