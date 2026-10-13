# VERSION-002 — независимая QA-проверка snapshot segments/form

Дата проверки: 2026-10-13  
Контракт: `project-version-segments-v1`  
Решение: **PASS**  
Подтверждённых дефектов: **0**

## Объект проверки

- Интегрированный target SHA: `f3461ae280629e3635e2f47ac7f62787a9d637cc`
- База: `1db369665930fabb16622e3dde901f6b0de760b9`
- В target входят VERSION-001 (`6831cfa8`) и VERSION-002 (`f3461ae2`).
- QA checkout: `E:/dev/TaCP/.worktrees/qa-version-002`
- QA branch: `codex/qa/version-002`
- Production diff: `backend/TkpApi/Program.cs` и новый
  `backend/TkpApi/Services/ProjectVersionSnapshots.cs` — 107 additions,
  10 deletions.

## Результаты

Изолированный PostgreSQL HTTP/SQL probe: **62/62 PASS**.

- Новый snapshot в response и JSONB использует camelCase для cabinets, items,
  segments и form.
- Проверены два case-distinct segment ID, multiple segments, empty segments и
  входные null segments/form. После DB round trip null-навигация возвращается
  frontend-совместимо как пустой массив, null form — как пустая строка.
- Items, calc (`eqBase=250`, `total=300`), labels, timestamps и live project
  сохраняются.
- Повторный GET использует новый scoped DbContext и возвращает три версии.
- Реальный frontend-compatible restore через `PUT /api/projects/{id}` сохраняет
  `segments`, `form`, items и регистрозависимые ID в HTTP и SQL; версии не
  изменяются.
- Legacy PascalCase и camelCase nested snapshots без segments нормализуются для
  frontend; arbitrary extension data и calc сохраняются.
- Legacy JSONB hash до/после GET одинаков: response normalization не выполняет
  скрытую перезапись.
- Null и malformed scalar legacy snapshots остаются читаемыми без 500.
- Version create: anonymous/invalid JWT `401`, authenticated no-role `403`,
  admin/manager/engineer `200`, missing project `404`.
- Project/version read сохраняет Staff auth (`401/403`).
- В логах, снятых непосредственно после version-create матрицы, отсутствует
  `MultipleCollectionIncludeWarning`.

## Gate

```text
dotnet build backend/TkpApi/TkpApi.csproj -c Release
PASS: 0 warnings, 0 errors

dotnet test backend/TkpApi.Tests/TkpApi.Tests.csproj -c Release
PASS: 142/142

pwsh.exe -NoProfile -File qa/VERSION-002.probe.ps1
PASS: 62/62, 0 confirmed defects
```

Несколько промежуточных запусков завершались из-за ошибок самого QA-сценария:
ожидался flattened response вместо `snapshot`, использовался неверный порядок
EF-коллекций, case-insensitive PowerShell `-contains` и слишком широкий диапазон
анализа логов. Все проверки исправлены и финально выполнены с чистого кластера.
Продуктовый дефект этими сбоями не подтверждался.

## Наблюдение вне критерия

Широкий лог после последующих GET/PUT проекта содержит существующее
`MultipleCollectionIncludeWarning` от другого project query. Требование
VERSION-002 относится к version-create query; точечно снятый лог для него чист.

## Очистка

- API и PostgreSQL остановлены.
- Порты `55385` и `55685` свободны.
- Временный каталог `qa_version002_*` удалён.
- Production-код QA не менял.
- `git add`, commit и push не выполнялись.

