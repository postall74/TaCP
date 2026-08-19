# TKP·PRO — C# Backend (ASP.NET Core 8 + EF Core + PostgreSQL)

Референсный сервер для веб-сервиса подготовки ТКП. Контракты эндпоинтов
один в один повторяют доменную модель фронтенда (`src/types.ts`), поэтому
подключение — это замена хранилища `src/store.ts` на REST-вызовы (адаптер
уже лежит во фронтенде: `src/api/client.ts`).

## Быстрый старт

```bash
# 1. PostgreSQL: создать БД
createdb tkp
# 2. Запустить API (схема создастся автоматически, каталог наполнится из seed-catalog.csv)
cd TkpApi
dotnet run
```

- API: `http://localhost:5085`
- Swagger: `http://localhost:5085/swagger` — все эндпоинты с примерами (удобно для реверс-инжиниринга контрактов)
- Строка подключения: `TkpApi/appsettings.json → ConnectionStrings:Tkp`

Для продакшена вместо `EnsureCreated()` используйте EF-миграции:

```bash
dotnet tool install --global dotnet-ef
dotnet ef migrations add Init
dotnet ef database update
```

## Структура

| Файл | Назначение |
|---|---|
| `TkpApi/Program.cs` | Minimal API: все эндпоинты + разбор CSV-прайсов |
| `TkpApi/Models.cs` | Доменная модель (зеркало `src/types.ts`) |
| `TkpApi/TkpDbContext.cs` | Схема PostgreSQL через EF Core |
| `TkpApi/seed-catalog.csv` | Стартовый справочник (~75 позиций, 3 направления) |

## Эндпоинты

| Метод | Путь | Действие |
|---|---|---|
| GET | `/api/projects` | Список проектов со шкафами и версиями |
| POST | `/api/projects` | Создать проект |
| GET/PUT/DELETE | `/api/projects/{id}` | Чтение / **полная синхронизация** / удаление |
| POST | `/api/projects/{id}/cabinets` | Пакетное добавление шкафов (мастер подбора) |
| POST | `/api/cabinets/{id}/items` | Позиция в шкаф (цена — снимок из справочника) |
| DELETE | `/api/cabinets/{id}` | Удалить шкаф |
| POST | `/api/projects/{id}/versions` | Снимок версии (jsonb) |
| GET/POST | `/api/catalog`, `/api/catalog/import` | Справочник + импорт CSV |
| PUT/DELETE | `/api/catalog/{id}` | Обновить / удалить позицию |
| GET/PUT | `/api/rates`, `/api/settings` | Тарифы чел·часов, реквизиты компании |

## Как фронтенд подключается к серверу

1. В приложении: «Реквизиты компании» → блок «Подключение к C#-бэкенду» →
   вписать `http://localhost:5085` → «Проверить» → сохранить.
2. `src/store.ts` переходит в режим синхронизации: каждая мутация
   (оптимистично применённая локально) отправляется `PUT /api/projects/{id}`
   с дебаунсом 700 мс; справочник, тарифы и реквизиты — своими эндпоинтами.
3. При старте с заданным URL приложение грузит проекты/каталог с сервера
   (`hydrateFromApi`). Если сервер недоступен — работа продолжается локально,
   индикатор в сайдбаре горит красным.

## Дальнейшее развитие (дорожная карта из DOCS.md)

- Авторизация: ASP.NET Identity + JWT, роли «инженер / менеджер»;
- Серверный расчёт себестоимости (сейчас формулы живут во фронтенде — `src/utils.ts`);
- Генерация PDF на сервере: QuestPDF (те же макеты, что в `DocumentTab.tsx`);
- Десктоп/мобайл: те же Models.cs + клиентский слой на MAUI или Avalonia.
