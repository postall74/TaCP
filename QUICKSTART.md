# TKP·PRO — локальный запуск (пошагово)

Проект состоит из двух независимых частей:

- **Фронтенд** (React + Vite) — корень проекта. Запускается `npm run dev`.
  Работает и **без бэкенда** (локальный режим, данные в браузере).
- **C#-бэкенд** (ASP.NET Core 8 + EF Core + PostgreSQL) — `backend/TkpApi`.
  Запускается `dotnet run`.

Можно запускать в любом порядке; для полной связки нужны обе части.

---

## 0. Что установить заранее

| Что | Версия | Откуда | Проверка в терминале |
|---|---|---|---|
| Node.js | 18 LTS (лучше 20) | https://nodejs.org | `node -v` |
| .NET SDK | **8.0** | https://dotnet.microsoft.com/download/dotnet/8.0 | `dotnet --version` |
| PostgreSQL | 14+ | https://www.postgresql.org/download/ | служба запущена / pgAdmin открывается |
| VS Code | любая свежая | https://code.visualstudio.com | расширения **C# Dev Kit** и **C#** |

> ⚠ После установки .NET SDK или Node **перезапустите VS Code и терминал** —
> иначе команды `dotnet` / `npm` не найдутся.

---

## 1. Фронтенд (запускается первым, работает без бэкенда)

Откройте терминал в VS Code (`` Ctrl+` ``) в **корне проекта** (там, где `package.json`):

```bash
npm install      # только первый раз — скачивает зависимости (~1 мин)
npm run dev      # запуск dev-сервера Vite
```

Откройте **http://localhost:5173** — приложение должно открыться.
Остановить — `Ctrl+C`. Пока бэкенд не запущен, в сайдбаре горит «Локально».

Продакшен-сборка (если нужна): `npm run build` → папка `dist/`.

---

## 2. C#-бэкенд

### 2.1. PostgreSQL — создать базу `tkp`

Сервер PostgreSQL должен быть запущен (на Windows установщик создаёт службу,
она стартует вместе с системой; проверить можно в `services.msc` → `postgresql-x64-*`).

Создать базу — любым из трёх способов:

```bash
# а) через createdb (если утилиты PostgreSQL в PATH)
createdb -U postgres tkp

# б) через psql
psql -U postgres -c "CREATE DATABASE tkp;"
```

```text
# в) через pgAdmin: правой кнопкой Databases → Create → Database… → имя: tkp → Save
```

Запомните **пароль пользователя `postgres`** — вы задавали его при установке PostgreSQL.

### 2.2. Проверить строку подключения

Файл `backend/TkpApi/appsettings.json`:

```
"ConnectionStrings": {
  "Tkp": "Host=localhost;Port=5432;Database=tkp;Username=postgres;Password=<ВАШ ПАРОЛЬ>"
}
```

Если ваш пароль не `postgres` — замените `<ВАШ ПАРОЛЬ>`. Порт по умолчанию 5432.

### 2.3. Запуск из терминала

```bash
cd backend/TkpApi    # ВАЖНО: запускать именно из этой папки
dotnet run
```

- **Первый запуск идёт 1–3 минуты**: NuGet скачивает пакеты (нужен интернет).
- Затем в консоли появится `Now listening on: http://localhost:5085`.
- Таблицы БД создадутся автоматически, каталог наполнится из `seed-catalog.csv` (~75 позиций).

Проверка: откройте **http://localhost:5085/swagger** — должен открыться список
эндпоинтов. Разверните `GET /api/catalog` → «Try it out» → Execute: вернётся JSON
со справочником. Значит, бэкенд жив и база подключена.

### 2.4. Запуск из VS Code кнопкой F5

1. Откройте в VS Code **всю папку проекта** (File → Open Folder → корень репозитория).
2. Установите расширения **C# Dev Kit** и **C#** — VS Code сам предложит их
   (список рекомендаций лежит в `.vscode/extensions.json`).
3. Откройте панель **Run and Debug** (`Ctrl+Shift+D`), в выпадающем списке выберите
   **«C# API (backend/TkpApi)»** и нажмите **F5**.
   - Конфигурации уже созданы: `.vscode/launch.json` + `.vscode/tasks.json`
     (сборка `dotnet build` выполняется автоматически перед запуском).
   - Вторая конфигурация **«Frontend (npm run dev)»** так же запускает фронтенд.
4. Если внизу появилась ошибка «solution» — `Ctrl+Shift+P` → `.NET: Open Solution` →
   выберите `backend/TkpApi/TkpApi.csproj` и повторите F5.

---

## 3. Связать фронтенд с бэкендом

1. Фронтенд открыт (5173), бэкенд запущен (5085).
2. В приложении слева внизу → **«Реквизиты компании»** → блок **«Подключение к C#-бэкенду»**.
3. Впишите `http://localhost:5085` (без слэша на конце) → **«Проверить»**.
   Появится тост «API доступен», статус станет «онлайн».
4. **«Сохранить»** — приложение перезагрузит проекты, каталог и тарифы с сервера,
   индикатор в сайдбаре станет зелёным («API · онлайн»).

С этого момента каждая правка ТКП сохраняется в PostgreSQL
(оптимистично в UI + отложенный `PUT /api/projects/{id}`).

---

## 4. Типичные ошибки и решения

| Симптом | Причина | Решение |
|---|---|---|
| `dotnet: command not found` | .NET SDK не установлен или терминал не перезапущен | Установить SDK 8.0, перезапустить VS Code |
| `No project found` / `MSB1003` | `dotnet run` запущен не из той папки | `cd backend/TkpApi` |
| `28P01: password authentication failed` | Неверный пароль в `appsettings.json` | Вписать реальный пароль `postgres` |
| `connection refused` (порт 5432) | Сервер PostgreSQL не запущен | Запустить службу postgresql / `pg_ctl start` |
| `port 5085 already in use` | Уже запущен предыдущий `dotnet run` | Остановить его (`Ctrl+C`) или сменить порт в `appsettings.json` |
| Ошибки NuGet при первом запуске | Нет интернета / прокси | Проверить сеть, повторить `dotnet restore` |
| Фронтенд: «Бэкенд недоступен» | API не запущен или URL со слэшем на конце | Запустить API; URL без `/` на конце |
| F5 не запускает C#-проект | Нет расширения C# Dev Kit | Установить C# Dev Kit + C#, перезапустить папку |
| `npm install` падает | Старый Node или кэш | Node 18+, затем `npm cache clean --force` и повторить |

---

## 5. Где что лежит

```
.
├─ QUICKSTART.md              ← этот файл
├─ DOCS.md                    ← полная документация проекта
├─ package.json               ← фронтенд (npm run dev / build)
├─ src/                       ← React + TypeScript (Vite)
│   ├─ store.ts               ← двухрежимное хранилище (локально / REST)
│   ├─ api/client.ts          ← типизированный REST-клиент
│   ├─ utils.ts, utils/excel.ts ← расчёты и экспорт в Excel
│   └─ components/            ← страницы и вкладки
└─ backend/
    ├─ README.md              ← подробности по бэкенду
    └─ TkpApi/
        ├─ TkpApi.csproj      ← C#-проект (dotnet run)
        ├─ appsettings.json   ← строка подключения к PostgreSQL, порт 5085
        ├─ Program.cs         ← все REST-эндпоинты + Swagger
        ├─ Models.cs          ← доменная модель (зеркало src/types.ts)
        ├─ TkpDbContext.cs    ← схема БД (EF Core)
        └─ seed-catalog.csv   ← стартовый справочник
```
