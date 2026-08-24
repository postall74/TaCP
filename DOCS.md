# ТКП·Про — документация проекта

Сервис подготовки технико-коммерческих предложений (ТКП) на системы **НКУ**, **АСУ ТП / АСУ Э / АСУ** и
**системы электрообогрева**: от инженерного опросника и справочника оборудования до документа ТКП,
Excel-расчёта по производству и контроля версий.

---

## 1. Архитектура

```
┌──────────────────────────  Frontend (React 18 + TypeScript + Vite + Tailwind 4) ──────────────────────────┐
│                                                                                                           │
│  App.tsx (оболочка, тема, реквизиты) ── Dashboard (воронка) ── Editor ── StructureTab (дерево шкафов)      │
│                                                              │            Wizard (опросник подбора)        │
│                                                              ├─ DocumentTab (А4, Word/PDF, приложения)     │
│                                                              └─ VersionsTab (снимки и откаты)              │
│        CatalogPage (CRUD + CSV-импорт)        RatesPage (тарифы нормо-часов)                              │
│                                                                                                           │
│  store.ts (zustand + persist → localStorage)  ← ЕДИНСТВЕННЫЙ слой данных; заменяется на вызовы REST API   │
└───────────────────────────────────────────────────────────────────────────────────────────────────────────┘
                                          │ (после подключения бэкенда)
┌─────────────────────────────────────────▼─────────────────────────────────────────────────────────────────┐
│  Backend: C# — ASP.NET Core 8, Minimal API + Entity Framework Core + PostgreSQL (см. каталог backend/)     │
│  Документы: генерация Word/PDF на сервере (QuestPDF / OpenXML) — опционально, фронт умеет и сам.           │
└───────────────────────────────────────────────────────────────────────────────────────────────────────────┘
```

**Почему фронтенд — React + TypeScript:**
- та же кодовая база упаковывается в десктоп (Electron/Tauri) и встраивается в MAUI/Avalonia,
  что сохраняет требование «C#-бэкенд + перенос на Win/Mac/Linux»;
- строгая типизация доменной модели (`src/types.ts`) один в один переносится в C#-модели.

**Слой данных изолирован:** компоненты никогда не читают localStorage напрямую — только action'ы
`store.ts` (`createProject`, `addEquipment`, `saveVersion`…). Для перехода на сервер каждый action
становится `fetch('/api/…')` без единой правки в UI.

---

## 2. Структура исходного кода (что, откуда, зачем)

| Файл | Назначение |
|---|---|
| `src/types.ts` | Доменная модель: `Equipment` (справочник), `LineItem`, `Cabinet` (шкаф + часы работ), `Project` (мета + все расчётные коэффициенты), `ProjectVersion`, `Settings` (реквизиты, ставки, тема), `Rates`. Здесь же метаданные направлений, статусов и типов шкафов. |
| `src/data/catalog.ts` | Стартовый справочник ~75 позиций по 3 направлениям с закупочными/продажными ценами. |
| `src/data/templates.ts` | 4 типовых шаблона ТКП (ЩР 6 групп, АВР, АСУ ТП «ПЛК+связь», обогрев трубы). |
| `src/utils.ts` | Форматирование, CSV-парсер/экспорт, **расчётное ядро `calcProject`** — единственный источник всех сумм. |
| `src/utils/excel.ts` | Книга Excel: вкладка на шкаф, «ИТОГО», «Расчёт по производству», «Бюджет проекта». |
| `src/store.ts` | zustand-хранилище + persist + миграция старых данных (`migrate`, `normalizeProject`). |
| `src/components/App.tsx` | Оболочка: сайдбар, маршруты, переключатель темы, реквизиты компании. |
| `src/components/Dashboard.tsx` | Воронка «в работе / выполнено / проиграно», метрики, мастер нового ТКП. |
| `src/components/Editor.tsx` | Проект: шапка, вкладки, панель экономики (наценки, НДС, СМР/ПНР, ТЗР…), версии. |
| `src/components/StructureTab.tsx` | Дерево шкафов-аккордеон, inline-правка, панель каталога **без ограничения по направлению**. |
| `src/components/Wizard.tsx` | Мастер-опросник (11 шагов, см. раздел 5). |
| `src/components/DocumentTab.tsx` | Лист А4, экспорт Word (сериализация DOM → .doc), печать/PDF, приложения А и Б. |
| `src/components/CatalogPage.tsx` | CRUD справочника, импорт/экспорт CSV прайсов. |
| `src/components/RatesPage.tsx` | Тарифы чел·часов по ролям. |
| `src/components/ui.tsx`, `icons.tsx` | UI-примитивы и ~30 рукописных SVG-иконок. |
| `backend/` | Референсная реализация C#-бэкенда (не компилируется в этой песочнице — разворачивается отдельно). |

---

## 3. Модель данных (TS ↔ PostgreSQL)

```sql
CREATE TYPE direction AS ENUM ('nku','asu','heat');
CREATE TYPE project_status AS ENUM ('draft','calc','sent','won','lost');

CREATE TABLE users (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  login         text UNIQUE NOT NULL,
  display_name  text NOT NULL,
  role          text NOT NULL DEFAULT 'engineer'   -- engineer | manager | admin
);

CREATE TABLE equipment_catalog (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sku         text UNIQUE NOT NULL,
  name        text NOT NULL,
  brand       text NOT NULL,
  category    text NOT NULL,                       -- «Автоматические выключатели», «ПЛК и модули»…
  direction   direction NOT NULL DEFAULT 'uni',    -- uni = универсальное
  unit        text NOT NULL DEFAULT 'шт',
  purchase    numeric(12,2) NOT NULL DEFAULT 0,    -- закупка (себестоимость)
  price       numeric(12,2) NOT NULL DEFAULT 0,    -- цена продажи
  attrs       text
);

CREATE TABLE projects (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  number         text UNIQUE NOT NULL,             -- «ТКП-412-2026»
  title          text NOT NULL,
  client         text, contact text,
  direction      direction NOT NULL,
  status         project_status NOT NULL DEFAULT 'draft',
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now(),
  -- экономика (все поля из src/types.ts.Project)
  markup numeric DEFAULT 15, work_markup numeric DEFAULT 25,
  discount numeric DEFAULT 0, vat_rate numeric DEFAULT 20, show_work_lines boolean DEFAULT true,
  tzz_pct numeric DEFAULT 1, third_party numeric DEFAULT 0, extra_costs numeric DEFAULT 0,
  unforeseen_pct numeric DEFAULT 2, trip_costs numeric DEFAULT 0, transport_pct numeric DEFAULT 0,
  smr_cost numeric DEFAULT 0, smr_sell numeric DEFAULT 0,
  pnr_cost numeric DEFAULT 0, pnr_sell numeric DEFAULT 0,
  valid_days int DEFAULT 30, notes text DEFAULT ''
);

CREATE TABLE project_cabinets (                    -- ProjectStructure: шкафы/секции/линейки
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id     uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  kind           text NOT NULL,                    -- ГРЩ, АВР, Шкаф ПЛК, ЩУО, ЗИП…
  name           text NOT NULL,
  hours          numeric DEFAULT 0,                -- сборка (производство), чел·ч
  design_hours   numeric DEFAULT 0,
  software_hours numeric DEFAULT 0,
  sort_order     int NOT NULL DEFAULT 0
);

CREATE TABLE project_items (                       -- позиции со снимком цены
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cabinet_id  uuid NOT NULL REFERENCES project_cabinets(id) ON DELETE CASCADE,
  equipment_id uuid REFERENCES equipment_catalog(id),
  sku text NOT NULL, name text NOT NULL, brand text, unit text,
  qty numeric NOT NULL, price numeric NOT NULL, purchase numeric NOT NULL
);

CREATE TABLE project_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid REFERENCES projects(id) ON DELETE CASCADE,
  ts timestamptz NOT NULL DEFAULT now(), label text,
  snapshot jsonb NOT NULL                          -- cabinets + calc
);

CREATE TABLE rate_cards (                          -- ставки чел·часов
  role text PRIMARY KEY,                           -- design|production|software|smr|pnr
  price numeric NOT NULL
);
CREATE TABLE settings (company jsonb NOT NULL);    -- реквизиты для документов
```

---

## 4. Расчётное ядро (`calcProject`)

**Шкаф:**
- `eqBase = Σ price × qty` — оборудование по ценам продажи;
- `eqCost = Σ purchase × qty` — себестоимость оборудования;
- `laborCost = часы_сборки × ставка_пр-ва + часы_проекта × ставка_проекта + часы_ПО × ставка_ПО`;
- `laborSell = laborCost × (1 + workMarkup/100)`;
- `sell = eqBase × (1 + markup/100) + laborSell`.

**Проект (плановая себестоимость):**
`оборудование + ТЗР% + сторонние + ФОТ + доп.затраты → непредвиденные% → командировки + СМР + ПНР`.

**Проект (продажа):** `шкафы + СМР_sell + ПНР_sell + доставка% → скидка% → НДС% → ИТОГО`.
`Прибыль = продажа(без НДС) − себестоимость; рентабельность = прибыль / продажа`.

Все экраны, документ и Excel используют одну и ту же функцию — расхождения невозможны.

---

## 5. Мастер подбора (опросник) — логика шагов

1. **Корпус.** Фильтр каталога по типу установки (напольный/навесной) и IP из атрибута `attrs`
   (regex `IP(\d+)`). Если точного IP нет — предлагаются ближайшие **низшие** классы
   (IP67 → IP65/IP54) с предупреждением; есть ручной ввод (позиция попадает в справочник).
2. **Ввод и линии.** Вводной автомат, отходящие 1P/3P (кол-во + номинал), УЗО, учёт
   (счётчик + 3×ТТ + мультиметр).
3. **АВР.** БАВР (блок автоматики + реле) / 2 контактора с мех. блокировкой / реверсивный
   рубильник + линии управления (промежуточные реле).
4. **УЗИП.** Тип 2 или 1+2 с подсказкой по СП 256.1325800.
5. **Кнопки/индикация.** Кнопки, «аварийный стоп», лампы, переключатели 1-0-2.
6. **Шины.** По расчётному току: ≤63 А — гребёнки; ≤160 А — медь 25×3 + 4 держателя;
   ≤250 А — 40×4 + 6 держателей; выше — 40×4×4 м + 10 держателей с пометкой о проверке.
7. **Компоновка.** «Стена к стене»: боковых панелей = `ряд + 1` вместо `2 × ряд`;
   цоколи — по числу напольных шкафов.
8. **ПЛК.** DI/DO/AI/AO + резерв % → модули = `⌈сигналы/каналы × (1+резерв)⌉`;
   контроллер, БП 24 В, клеммы, HMI 7"/10".
9. **Работы.** Часы сборка/проектирование/ППО + тумблер «работы отдельной строкой в ТКП».
10. **ЗИП и транспорт.** ЗИП = `max(1, round(qty × %))` по категориям АВ/УЗО/реле/УЗИП/БП/ПЛК/HMI —
    отдельным шкафом «ЗИП». Транспорт — % от оборудования, строка «Доставка» в документе.
11. **Сводка и применение** — шкафы добавляются в структуру одной операцией (`addCabinetsBulk`).

---

## 6. Документ и экспорт

- **PDF** — диалог печати браузера (`@media print` скрывает всё, кроме `#doc-print-area`,
  многостраничность поддерживается).
- **Word** — сериализация того же DOM в .doc с базовыми стилями: предпросмотр и файл всегда
  идентичны. Табличные рамки — inline-стили, чтобы Word их не потерял.
- **Excel** (`utils/excel.ts`): вкладка на каждый шкаф; **ИТОГО** (позиции, часы по ролям,
  себестоимость/продажа); **Расчёт** — форма «Расчёт по производству» (оборудование, ТЗР,
  сторонние, проектирование/производство/ПО в чел·ч, ФОТ, допзатраты, плановая себестоимость,
  непредвиденные %, себестоимость/продажа за 1 шт и суммарно, маржинальный доход, наценка,
  рентабельность, строки СМР/ПНР, НДС и прибыль); **Бюджет** — бюджет проекта с блоками
  себестоимости и рентабельности.
- **Приложения**: А — перечень оборудования автоматизации с типами сигналов; Б — структурная
  SVG-схема из шкафов проекта. Включаются тумблерами прямо на вкладке документа.

---

## 7. C#-бэкенд (каталог `backend/`) — запускаемый проект

`backend/TkpApi/`: `Program.cs` (Minimal API + Swagger), `Models.cs` (строковые Id —
контракт совпадает с фронтендом без преобразований), `TkpDbContext.cs` (EF Core → PostgreSQL),
`seed-catalog.csv` (стартовый справочник, подхватывается при пустой БД).

Запуск: `createdb tkp && cd backend/TkpApi && dotnet run` → `http://localhost:5085`,
Swagger — `/swagger`. Подробности и дорожная карта — `backend/README.md`.

**Фронтенд подключён к API**: `src/api/client.ts` — типизированный REST-клиент;
`src/store.ts` работает в двух режимах. Пустой `apiBaseUrl` — локальный (localStorage);
иначе каждая мутация применяется оптимистично и с дебаунсом 700 мс уходит
`PUT /api/projects/{id}`, справочник/тарифы/реквизиты — своими эндпоинтами,
при старте состояние гидрируется с сервера. Режим и статус соединения видны в сайдбаре;
URL задаётся в «Реквизитах компании» → «Подключение к C#-бэкенду» с кнопкой «Проверить».

| Метод | Эндпоинт | Назначение |
|---|---|---|
| GET/POST | `/api/projects` | список / создание ТКП |
| GET/PUT/DELETE | `/api/projects/{id}` | карточка, обновление, удаление |
| POST | `/api/projects/{id}/cabinets` | добавить шкаф(ы) (в т.ч. пачкой из мастера) |
| PUT/DELETE | `/api/cabinets/{id}` | правка / удаление шкафа |
| POST | `/api/cabinets/{id}/items` | позиция в шкаф |
| POST | `/api/projects/{id}/versions`, `/restore/{vid}` | версии |
| GET/POST/PUT/DELETE | `/api/catalog` | справочник + `POST /api/catalog/import` (CSV) |
| GET/PUT | `/api/rates`, `/api/settings` | тарифы и реквизиты |
| GET | `/api/projects/{id}/excel`, `/docx` | серверная генерация (ClosedXML / OpenXML) |

Мобильный/десктоп-перенос: MAUI или Avalonia (C#) подключаются к тем же эндпоинтам;
веб-фронтенд при желании оборачивается в Tauri/Electron без переписывания.

---

## 8. Темы, хранение, миграции

- **Тема**: класс `.dark` на `<html>` переопределяет CSS-переменные токенов — мгновенное
  переключение светлой/тёмной схемы во всём приложении (кнопка в сайдбаре).
- **Хранение сейчас**: `zustand/persist` → localStorage (ключ `tkp-pro-v2`).
  Версия схемы `2` с `migrate()` — старые данные дополняются новыми полями автоматически.
- **Документы**: реквизиты (включая **исполнителя**), менеджер, ставки — в настройках;
  попадают в шапку и подписи каждого документа.

---

## 9. Проверка совместимости (`src/utils/rules.ts`)

Инженерные валидации, которые ловят типовые ошибки сборки **до** отправки ТКП:

| Правило | Уровень | Суть |
|---|---|---|
| Автомат ↔ шина | Ошибка | номинал АВ/УЗО/рубильника выше номинала шины (например 100 А на 63 А) |
| Много АВ без шины | Подсказка | 3+ автоматов без гребёнки — монтаж перемычками |
| УЗИП без вводного АВ | Внимание | УЗИП нельзя безопасно отключить для замены |
| ПЛК без БП 24 В | Внимание | контроллер и модули питаются от 24 В |
| Панель без ПЛК | Внимание | HMI есть, а контроллера нет во всём проекте |
| Греющий кабель без терморегулятора | Внимание | кабель будет греть постоянно |
| Пустой шкаф | Подсказка | оборудование ещё не добавлено |

**Как устроено.** Каждое правило — чистая функция `(шкаф | проект, контекст) → Issue[]`.
Контекст несёт справочник (у позиции в шкафе — `LineItem` — нет категории и тока, это снимок
цены; карточка берётся из каталога по `eqId`) и проект (для межшкафных правил).
Номинальные токи аппаратов — поле `Equipment.ratedCurrent`, накатывается из таблицы `CURRENT`
в `data/catalog.ts`. Панель «Проверка совместимости» во вкладке «Структура» показывает
замечания по уровням с переходом к шкафу; бейдж с числом проблем — на самой вкладке;
при добавлении позиции, создающей конфликт, срабатывает предупреждение.
При переносе на C# правила уезжают в `RulesService.cs` с тем же контрактом `Issue`.

---

## 10. Дорожная карта (что добавлять следующим)

1. Авторизация и роли (инженер/менеджер), JWT в C#-бэкенде.
2. Серверная генерация PDF (QuestPDF) с фирменным бланком.
3. История цен поставщиков, прайсы с датами действия.
4. Согласование ТКП: комментарии, подписи, уведомления.
5. Расширение набора правил (проверка селективности, уставка УЗО, сечение шины по току).
