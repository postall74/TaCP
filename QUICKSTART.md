# QUICKSTART — локальный запуск ТКП·Про

Проверенная инструкция (Windows / PowerShell). Три части: фронтенд, бэкенд, связка.
Если что-то пошло не так — раздел **4. Типовые проблемы** в конце.

---

## 1. Предварительные требования

| Что | Версия | Откуда | Проверка |
|---|---|---|---|
| Node.js | **22 LTS** (минимум 20; на 18 не соберётся Tailwind v4) | https://nodejs.org или `winget install OpenJS.NodeJS.LTS` | `node -v` |
| npm | 10.x | вместе с Node | `npm -v` |
| .NET SDK | **8.0** | https://dotnet.microsoft.com/download/dotnet/8.0 | `dotnet --version` |
| PostgreSQL | 14+ | https://postgresql.org (запомните пароль `postgres`) | `psql --version` |
| VS Code | любой | + расширения **C# Dev Kit**, **C#**, **Vitest** | — |

> После установки SDK/Node **перезапустите VS Code и терминалы** — иначе новые
> `node`/`dotnet` не подхватятся из PATH.

---

## 2. Фронтенд

```powershell
cd E:\dev\TaCP
npm install          # первый раз (или после pull с новыми зависимостями)
npm run dev
```

Откройте **http://localhost:3000**. Приложение работает в **локальном режиме**
(данные в localStorage) — бэкенд не обязателен.

Тесты: `npx vitest run` (расчётное ядро, правила совместимости и
секционирования, комплекты CQE / CQE N, отсеки шкафов). Продакшен-сборка:
`npm run build`.

> `vitest` должен быть в `devDependencies` (если нет — `npm i -D vitest` и
> закоммитьте `package.json` + `package-lock.json`): и для локального запуска,
> и для CI.

---

## 3. Бэкенд (C#)

### 3.1. Создать базу `tkp`

```powershell
# если createdb не распознаётся — укажите полный путь (замените 16 на вашу версию):
& "C:\Program Files\PostgreSQL\16\bin\createdb.exe" -U postgres tkp
# или:
& "C:\Program Files\PostgreSQL\16\bin\psql.exe" -U postgres -c "CREATE DATABASE tkp;"
```

Либо в **pgAdmin**: ПКМ по *Databases* → *Create → Database…* → имя `tkp` → *Save*.

### 3.2. Строка подключения

`backend/TkpApi/appsettings.json`:

```json
"ConnectionStrings": {
  "Tkp": "Host=localhost;Port=5432;Database=tkp;Username=postgres;Password=ВАШ_ПАРОЛЬ"
}
```

Там же должны быть секции (без `Jwt:Key` сервер не стартует):

```json
"Jwt":   { "Key": "секрет-не-короче-32-символов-для-hmac-sha256", "Issuer": "tkp-api", "Audience": "tkp-web", "ExpireMinutes": 480 },
"Admin": { "Email": "admin@tkp.local", "Password": "Admin#12345" }
```

### 3.3. Запуск — обязательно из папки бэкенда

```powershell
cd E:\dev\TaCP\backend\TkpApi
dotnet run
```

Первый запуск 1–3 минуты (NuGet). В логе ожидайте:
- `Now listening on: http://localhost:5085`
- `Каталог наполнен из seed-catalog.csv: ~80 позиций`
- `Создан администратор admin@tkp.local`
- Строку про схему: `Миграции не найдены — схема создана через EnsureCreated (dev)`
  (или baseline/Migrate, если миграции уже сгенерированы — см. `backend/MIGRATIONS.md`)

Проверка: **http://localhost:5085/swagger**. Данные теперь **защищены**:
- `POST /api/auth/login` → **Try it out** → в «Request body» вставьте **целиком**
  (тело обязано оставаться валидным JSON — иначе сервер вернёт `400`):
  ```json
  {
    "email": "admin@tkp.local",
    "password": "Admin#12345"
  }
  ```
  → **Execute** → из ответа 200 скопировать `token` → кнопка **Authorize** → вставить токен;
- после этого `GET /api/catalog` → 200 (~80 позиций **без поля price** — только `purchase`).

### 3.4. F5 в VS Code (опционально)

Откройте **корень проекта** (`E:\dev\TaCP`), `Ctrl+Shift+D` → **«C# API (backend/TkpApi)»** → F5.
Конфигурации лежат в `.vscode/launch.json` (+ задача сборки в `tasks.json`).

---

## 4. Связка фронтенд ↔ бэкенд + авторизация

**Вход обязателен всегда** — при первом открытии (http://localhost:3000) вы сразу
увидите экран входа, даже без бэкенда.

- **Локальный режим** (бэкенд не подключён): пользователи хранятся в браузере.
  Админ по умолчанию — `admin@tkp.local` / `Admin#12345`. Можно регистрировать
  инженеров/менеджеров и назначать роли — всё работает без сервера.
- **Серверный режим**: сайдбар → **«Реквизиты компании»** → блок **«Подключение к
  C#-бэкенду»** → впишите `http://localhost:5085` → **Проверить** → **Сохранить**.
  После входа данные гидрируются из PostgreSQL, мутации синхронизируются.

После входа в сайдбаре — карточка профиля (ФИО, e-mail, роль, «Выйти»), внизу —
индикатор («Локальный режим» / «C# API · онлайн»). Регистрация новых
пользователей — на экране входа (режим «Регистрация»).

### 4.1. Проверка ролей и прав

1. Войдите админом → в сайдбаре появится пункт **«Пользователи»** (виден только админу).
2. Зарегистрируйте менеджера и инженера, затем на странице «Пользователи» назначьте им роли.
3. Войдите инженером: попробуйте удалить ТКП или перевести его в «Выиграно» — кнопка
   будет неактивна (подсказка объяснит, что это право менеджера/админа). Инженер видит
   переходы «черновик → на расчёте → отправлено», но не «выиграно/проиграно».
   **Права закрыты и на сервере** (`Rights.cs` — зеркало `roles.ts`): прямой вызов
   `DELETE /api/projects/{id}` или `PUT` со статусом `won` токеном инженера вернёт
   **403** с причиной в теле (`detail`): «Удаление ТКП доступно менеджеру и
   администратору (вы — Инженер)». Проверить можно в Swagger с токеном инженера.
4. Войдите менеджером: удаление и решения доступны; разделы «Тарифы» и «Пользователи» — нет.
5. На дашборде проверьте **поиск** (название/номер/заказчик/контакт), фильтр по
   направлению и диапазон дат; счётчик «показано N из M» реагирует на фильтры.

> Смена роли действует **со следующего входа** пользователя (JWT несёт роли, выданные при логине).

JWT в Swagger: `POST /api/auth/login` → скопировать `token` → кнопка **Authorize** →
вставить токен → защищённые эндпоинты (`/api/auth/me`, `/api/auth/users`,
`PUT /api/auth/users/{id}/role`) откроются.

---

## 5. Онлайн-режим в локальной сети (одна БД на всех)

Цель: 5+ участников работают одновременно с **единой базой**. Архитектура:
**бэкенд сам раздаёт собранный фронтенд** (`dist/`), поэтому все открывают один
адрес — и API, и интерфейс. Никакого отдельного веб-сервера не нужно.

### 5.1. На машине-сервере (один раз)

```powershell
# 1) Собрать фронтенд (API раздаёт именно dist/)
cd E:\dev\TaCP
npm run build

# 2) Запустить бэкенд (слушает все интерфейсы — см. "Urls": "http://0.0.0.0:5085")
cd backend\TkpApi
dotnet run
```

В логе ожидайте строку `Фронтенд раздаётся из ...\dist — единый адрес для сети`.

### 5.2. Узнать сетевой адрес сервера

```powershell
ipconfig
```

Найдите `IPv4-адрес` активного адаптера (обычно `192.168.x.x` или `10.x.x.x`).

### 5.3. Разрешить порт в брандмауэре (один раз, от имени администратора)

Без этого другие машины не достучатся до порта 5085 — самая частая причина
«онлайн-режим не запускается в сети».

```powershell
netsh advfirewall firewall add rule name="TKP API 5085" dir=in action=allow protocol=TCP localport=5085
```

### 5.4. Подключение участников

Каждый участник открывает в браузере:

```
http://<IPv4-сервера>:5085
```

например `http://192.168.1.20:5085`. Дальше всё автоматически:

1. Фронтенд при старте **сам обнаруживает API на этом же адресе**
   (проверяет `/api/health`) и включает онлайн-режим — вручную URL вводить не надо.
2. Появляется экран входа. Первый пользователь входит админом
   (`admin@tkp.local` / `Admin#12345`), регистрирует остальных и назначает роли
   (страница «Пользователи»).
3. Все данные (проекты, справочник, реквизиты) читаются и пишутся в **общую
   PostgreSQL** — изменения одного участника видны другим после обновления/входа.

> **Важно**: после каждого `git pull` с изменениями фронтенда на сервере нужно
> заново выполнить `npm run build` — API раздаёт статический `dist/`, а не
> dev-сервер. `npm run dev` (:3000) — только для разработки на самой машине-сервере.

### 5.5. Проверка связки

- На сервере: http://localhost:5085/api/health → `{"status":"ok",...}`.
- С другой машины: http://<IPv4-сервера>:5085/api/health → тот же JSON
  (если таймаут — см. 5.3, брандмауэр).

---

## 6. Типовые проблемы

| Симптом | Причина | Решение |
|---|---|---|
| `"vite" не является внутренней или внешней командой` | Зависимости не установлены (нет `node_modules`) | `npm install` в корне проекта, затем `npm run dev`. Если не помогло: `Remove-Item -Recurse -Force node_modules, package-lock.json; npm install` |
| `WARN EBADENGINE` при `npm install`; `npm run dev` падает на oxide | Node 18 (устарел) | Node 22 LTS; затем `Remove-Item -Recurse -Force node_modules, package-lock.json; npm install` |
| `createdb: имя не распознано` | Утилиты PostgreSQL не в PATH | Полный путь `& "C:\Program Files\PostgreSQL\16\bin\createdb.exe" -U postgres tkp` или pgAdmin |
| `MSB1003: не удалось найти проект` | `dotnet run` запущен не из `backend/TkpApi` | `cd backend/TkpApi` и только потом `dotnet run` |
| `28P01 password authentication failed` | Неверный пароль в строке подключения | Поправить `appsettings.json` → `ConnectionStrings:Tkp` |
| Порт 5085 занят | Другой экземпляр API | Закрыть старый `dotnet run` или сменить `"Urls"` в appsettings |
| С других машин не открывается `http://<сервер>:5085` (таймаут), хотя локально работает | Брандмауэр Windows блокирует входящие на 5085 | Правило из п. 5.3 (`netsh advfirewall ... localport=5085`); проверить, что API слушает `0.0.0.0` (строка `Now listening on: http://0.0.0.0:5085` в логе) |
| Открыл `http://<сервер>:5085`, но режим «Локальный» и данные пустые | Не пересобран `dist/` после обновлений — API раздаёт старый/пустой фронтенд, либо автодетекция не нашла API | `npm run build` на сервере; убедиться, что `/api/health` отвечает (п. 5.5); индикатор внизу сайдбара кликабелен — повторная проверка связи |
| «ТКП создано» и сразу тост «HTTP 400 Bad Request» (в логе API: `POST /api/projects → 400 0`) | Контракт дат: фронтенд шлёт `createdAt` unix-миллисекундами (число), бэкенд ждал `DateTime` — десериализация падала до входа в эндпоинт | Исправлено: `UnixMsDateTimeConverter` (`backend/TkpApi/JsonConverters.cs`) — даты в JSON теперь unix-мс в обе стороны. Достаточно перезапустить `dotnet run`; пересборка фронта не нужна |
| 500 на `GET /api/projects/{id}` после смены модели | Схема БД создана под старой моделью (`EnsureCreated` не обновляет существующую БД) | Пересоздать: `DROP DATABASE tkp; CREATE DATABASE tkp;` и `dotnet run` (в проде — EF-миграции) |
| 401 в Swagger | Эндпоинт под `RequireAuthorization` | Получить токен (`POST /api/auth/login`) и вставить через **Authorize** |
| CI: `Missing script: "test"` | В `package.json` нет скрипта test | Добавьте `"test": "vitest run"` в `scripts` (или держите в CI `npx vitest run` + vitest в devDependencies) |
| CI: `Could not resolve 'vitest/config'` | vitest нет в зависимостях — npx ставит «левую» версию | `npm i -D vitest`, закоммитьте `package.json` **и** `package-lock.json` |
| `git push` → `rejected (non-fast-forward)` | Локальный `main` отстал от удалённого (на GitHub сливались PR) | `git pull --rebase origin main` → решить конфликты → `git push` |
| Белая страница после обновлений | В localStorage `settings` без `apiBaseUrl` (старая версия persist) | Обновлён код (persist v3 + миграция). Аварийно: DevTools → Console → `const s=JSON.parse(localStorage.getItem("tkp-pro-v2")); s.state.settings.apiBaseUrl=s.state.settings.apiBaseUrl??""; localStorage.setItem("tkp-pro-v2",JSON.stringify(s)); location.reload();` |
| `Exception has occurred: require is not defined / No PostCSS Config found` в отладчике VS Code | **Не ошибка**: Vite штатно перехватывает эти исключения | Смотрите на баннер `VITE ready` — если он есть, сервер работает. Шум убирается: снять *Caught Exceptions* в Run and Debug |
| CS1729 «нет конструктора с N аргументов» в record | Две строки параметров слиплись — вторая «утонула» в комментарии `//` | Разнести параметры record по строкам (комментарии — только над строкой) |
| Регистрация: «HTTP 400 Bad Request» без причины | Слабый пароль или занятый e-mail (Identity возвращал английские ошибки, клиент их отбрасывал) | Исправлено: пароль — **минимум 6 символов и цифра**, причина показывается по-русски («Пользователь с таким e-mail уже существует»). Если всё ещё 400 — смотрите консоль API: строка с `errors` |
| **Администратор потерял права** (роль в БД подменена, войти админом нельзя) | Роль `admin` утеряна в таблице `AspNetUserRoles` (через API это больше невозможно — защита последнего админа, `Rights.CanChangeRole`) | Восстановить напрямую в БД `tkp` (pgAdmin → SQL Tool или psql): `BEGIN; DELETE FROM "AspNetUserRoles" WHERE "UserId" = (SELECT "Id" FROM "AspNetUsers" WHERE "UserName" = 'admin@tkp.local'); INSERT INTO "AspNetUserRoles" ("UserId", "RoleId") SELECT u."Id", r."Id" FROM "AspNetUsers" u CROSS JOIN "AspNetRoles" r WHERE u."UserName" = 'admin@tkp.local' AND r."Name" = 'admin'; COMMIT;` — затем **выйти и войти заново** (JWT несёт старые роли до следующего входа). psql: `& "C:\Program Files\PostgreSQL\16\bin\psql.exe" -U postgres -d tkp` |

---

## 7. Повседневный цикл

```powershell
git checkout main && git pull --rebase origin main
git checkout -b feature/название-задачи
# …код…
npx vitest run                        # фронтенд-тесты
dotnet test ../backend/TkpApi.Tests   # бэкенд-тесты (из backend/TkpApi)
git add -A && git commit              # по Conventional Commits (GIT_WORKFLOW.md)
git push -u origin feature/название-задачи
# → GitHub: Compare & pull request → Squash and merge → Delete branch
git checkout main && git pull --rebase origin main
```

Полный регламент — в [GIT_WORKFLOW.md](./GIT_WORKFLOW.md).
