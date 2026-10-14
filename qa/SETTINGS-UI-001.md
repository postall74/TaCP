# SETTINGS-UI-001 — независимая QA-проверка прав на реквизиты

Дата: 2026-10-14 (Asia/Yekaterinburg).  
Решение: **PASS**. Подтверждённых дефектов: **0**.

## Версии и область

- Target: `51481855bcab93937ee2f7b92b4d316d836a5a75`.
- Parent: `1ab8cb836a14e14bf087d6b0e021c242b57be634`.
- QA branch: `codex/qa/settings-ui-001`.
- Production diff: только `src/App.tsx` и `src/store.ts`, +65/-22.
- Добавлен QA-тест `src/store.settings.test.ts` для store-level role guard.

## Результат

- Engineer видит ровно восемь реквизитных полей с `readOnly` и
  `aria-readonly=true`; кнопки Save/Reset отсутствуют, поэтому success-toast
  записи из этого UI недостижим.
- Прямой `updateSettings` для каждого из восьми реквизитных ключей возвращает
  `false`, не меняет значение и добавляет ролевой err-toast:
  `Реквизиты компании заполняют менеджер и администратор (вы — Инженер)`.
- Theme, URL API и состояние API остаются доступны engineer и возвращают `true`.
- Manager, admin и local mode возвращают `true` и меняют реквизиты. В браузере
  manager успешно выполнил edit/save/reset с ожидаемыми success/info-toast.
- API diagnostics остаётся доступен в read-only модальном окне инженера.
- При 1024 и 1440 в light/dark темах модальное окно читаемо и не создаёт
  горизонтального overflow документа.

## Gate

| Команда | Результат |
|---|---|
| `npm.cmd run typecheck` | PASS |
| `npm.cmd test` | PASS, 10 файлов, 97/97 |
| `npm.cmd run build` | PASS; известное предупреждение circular vendor chunk |
| Browser: engineer/manager, 1024/1440, light/dark | PASS |

## Ограничение среды

Первый sandbox-запуск Vitest получил `spawn EPERM` при старте esbuild. Повтор в
разрешённом окружении и финальный полный прогон прошли. Это ограничение среды,
не дефект продукта.

## Cleanup

Временные локальные QA-пользователи хранились только в localStorage браузерного
сеанса. Viewport сброшен, вкладка закрыта, dev server остановлен, порт 4184
освобождён. Git add/commit/push не выполнялись.
