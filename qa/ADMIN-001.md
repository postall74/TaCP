# ADMIN-001 — независимая QA-проверка admin-shell-v1

Статус: **QA пройден для ADMIN-001; NEED-001 остаётся partial**.

- Base main: `1edff933afe9f488f11137ffa9251bae6744c720`.
- Frontend handoff: `e39e3e8e2e789b2808b0ee9ed35a796783c6de92`.
- Контракт PM: `9204b47e863f208e24772fd40db8a88d7da0f0a1`.
- Проверенная область production: `src/App.tsx`, `src/main.tsx`,
  `src/admin/AdminRouter.tsx`, `src/admin/components/AdminLayout.tsx`.
- QA-файлы: `src/admin/AdminRouter.test.ts`,
  `src/admin/components/AdminLayout.test.ts`, этот отчёт и ссылка в `qa/README.md`.

## Выполнено

| Проверка | Результат |
|---|---|
| `npm ci` | exit 0, установлено 182 пакета |
| `npm run typecheck` | exit 0 |
| `npm test` | exit 0, 94/94, 11 файлов |
| `npm run build` | exit 0 |
| Роли и прямые admin URL | 7 новых регрессионных тестов: admin routes и блокировка manager/engineer/anonymous |
| Состояния light/dark | 2 новых компонентных теста admin shell и переключателя темы |
| Браузерный smoke | admin-ссылка доступна admin; отсутствует у engineer; прямой URL engineer показывает только «Доступ ограничен» |
| Прямые URL и reload | `#/admin/users` и `#/admin/catalog` открываются в отдельном shell; reload каталога сохраняет маршрут и сессию |
| Разделы | users, catalog и корзина отрисованы; main layout не содержит admin-форм |
| Реальный API | login admin JWT, `/api/auth/me`, `/api/auth/users`, `/api/catalog`, `/api/catalog/deleted` — успешно |

API smoke выполнялся read-only в локальном Development-контуре: роль `admin`,
получено 2 пользователя, 78 активных записей каталога и 0 удалённых. Токен и
учётные данные в отчёт/логи не записывались. Мутации каталога и пользователей не
выполнялись, чтобы не менять разделяемую локальную БД.

Добавленные тесты подтверждают, что отдельный shell обслуживает users, catalog,
statistics и time routes. Прямой доступ manager, engineer и пользователя без
сессии не монтирует shell и содержимое раздела. Оба значения настройки темы
дают корректную подпись переключателя и сохраняют содержимое admin shell.

## Дефекты

Новых дефектов продукта в пределах ADMIN-001 не обнаружено.

## Ограничения среды и известные наблюдения

- Первый sandbox-запуск Vitest и Vite завершился `spawn EPERM` при старте
  esbuild. Повтор тех же команд вне sandbox прошёл. Это ограничение среды.
- Browser CUA дважды выбрал соседний элемент при клике по изменившейся странице
  и создал/выбрал локальные demo-проекты в `localStorage`. Репозиторий и API не
  изменены. После этого проверки маршрутов выполнялись прямой навигацией.
- Визуальная проверка переключения темы кликом из-за этой нестабильности заменена
  детерминированными компонентными тестами. Сохранённые эталонные screenshots в
  репозиторий не добавлялись.
- Build сохраняет ранее известное предупреждение
  `Circular chunk: vendor-other -> vendor-core -> vendor-other`; exit code 0.
- `npm ci` сообщил 4 известных уязвимости зависимостей (3 moderate, 1 high).
  Обновление зависимостей не входит в ADMIN-001.

## Решение и ретест

ADMIN-001 можно передавать PM для интеграции QA-файлов и принятия feature SHA.
Ретест требуется при новом frontend SHA или исправлении затрагивающем App,
AdminRouter, AdminLayout, роли, маршрутизацию либо хранение сессии.

NEED-001 не закрыт этой проверкой: по правилам PM он остаётся partial до полного
пользовательского сценария, актуального руководства со снимками, зелёного CI,
merge в main и аннотированного GitHub tag.
