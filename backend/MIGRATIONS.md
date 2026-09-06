# EF Core Миграции (PostgreSQL)

Схема БД управляется **миграциями**, а не ручным `EnsureCreated`. Это позволяет
безопасно менять модель (`Models.cs`) и накатывать изменения на существующую базу
без потери данных.

## Разовая настройка инструмента

```bash
dotnet tool install --global dotnet-ef
# проверка:
dotnet ef --version
```

## Первый запуск (миграция ещё не создана)

При старте API логики в `Program.cs → EnsureSchema()` действует так:

1. **Файлов миграций нет** → схема создаётся через `EnsureCreated()` (dev-режим).
   Так работает свежий клон, пока вы не сгенерируете первую миграцию.
2. **БД уже содержит таблицы** (от `EnsureCreated`), но журнала миграций нет →
   выполняется **baseline**: все текущие миграции помечаются применёнными,
   данные не пересоздаются.
3. **Обычный режим** → накатываются ожидающие миграции (`Migrate()`).

## Сгенерировать первую миграцию

```bash
cd backend/TkpApi
dotnet ef migrations add InitialCreate
dotnet ef database update      # применит к БД (для пустой БД)
```

После этого в `backend/TkpApi/Migrations/` появятся `*_InitialCreate.cs` и
`TkpDbContextModelSnapshot.cs` — **закоммитьте их**.

> Если у вас уже есть рабочая БД от `EnsureCreated`, просто выполните
> `dotnet ef migrations add InitialCreate` и запустите API — сработает
> baseline (случай 2), данные сохранятся. `database update` в этом случае не нужен.

## Изменить модель (добавить поле/таблицу)

```bash
# 1. отредактируйте Models.cs / TkpDbContext.cs
# 2. создайте миграцию с осмысленным именем
dotnet ef migrations add AddProjectOwnerIndex
# 3. просмотрите сгенерированный файл (корректен ли Up/Down)
# 4. примените
dotnet ef database update
```

## Откатить последнюю миграцию (если ошиблись)

```bash
dotnet ef migrations remove        # удалит файл (если ещё не накатана)
# ИЛИ, если уже накатили на БД:
dotnet ef database update <ИмяПредыдущейМиграции>
```

## Что защищено политиками (см. Program.cs)

| Политика | Кто | Эндпоинты |
|---|---|---|
| `Staff` | admin, manager, engineer | `/api/projects*`, `/api/cabinets*`, `/api/catalog*`, `/api/rates` (GET), `/api/settings` (GET) |
| `AdminOnly` | admin | `/api/auth/users*`, `/api/rates` (PUT), `/api/settings` (PUT) |
| открытые | все | `/api/auth/register`, `/api/auth/login` |

Токен для Swagger: `POST /api/auth/login` → `token` → кнопка **Authorize**.
