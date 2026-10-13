# SYNC-009 — независимая QA-проверка подтверждаемого сохранения реквизитов

Дата проверки: 2026-10-13  
Контракт: `company-settings-confirm-v1`  
Решение: **PASS**  
Подтверждённых дефектов: **0**

## Объект проверки

- Base SHA: `2b17eca62fad8f67cc2f7b35fb18235b55e52e60`
- Target SHA: `6ea26db7255b5370e5d82b6c6a69e6be190d6d06`
- QA checkout: `E:/dev/TaCP/.worktrees/qa-sync-009`
- QA branch: `codex/qa/sync-009`
- Production diff: `src/App.tsx`, `src/store.ts`, `src/store.test.ts`;
  284 additions, 23 deletions.

## Результаты

- Remote manager/admin выполняют ровно один `PUT /api/settings`; вызов
  `PUT /api/rates` отсутствует.
- После `200` store применяет возвращённый сервером `CompanyDto`, включая
  нормализованные сервером поля.
- Успешный toast и закрытие модального окна происходят только после успешного
  завершения save.
- Network, HTTP 400, 403 и 500 сохраняют ранее подтверждённые settings и
  connection state. Для каждой ошибки создаётся один корректный error-toast;
  ложного текста о локальном сохранении нет.
- Engineer блокируется в store до HTTP-запроса; UI отображает реквизиты read-only
  и отключает save/reset/поля.
- Reset отправляет только `CompanyDto` defaults и не меняет theme, rates,
  `apiBaseUrl` или connection state.
- Локальные save/reset сохраняют прежнее поведение без HTTP-запросов.
- UI smoke в Chrome подтвердил светлую и тёмную темы, открытие формы, локальное
  сохранение с закрытием и success-toast, а также reset при открытой форме.

## Автоматический gate

```text
npm.cmd test -- src/store.test.ts
PASS: 47/47

npm.cmd run typecheck
PASS

npm.cmd test
PASS: 10 files, 132/132

npm.cmd run build
PASS: production bundle built
```

Build сохраняет известное неблокирующее предупреждение:

```text
Circular chunk: vendor-other -> vendor-core -> vendor-other.
```

## Ограничения и очистка

- Remote-ветки проверены детерминированным mock REST API. Реальный backend
  smoke не выполнялся: diff не меняет wire-контракт клиента или backend.
- Временный Vite server на `127.0.0.1:4179` остановлен.
- Production-код QA не менял; добавлены только этот отчёт и запись журнала.
- `git add`, commit и push не выполнялись.

