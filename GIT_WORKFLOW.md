# Git-воркфлоу проекта ТКП·Про

Правило проекта: **`main` — всегда рабочая, запускаемая версия**. Любое изменение
(фича, фикс, рефакторинг) делается в отдельной ветке и попадает в `main` только
через Pull Request. Это даёт точку отката на каждую решённую задачу.

---

## 1. Именование веток

Формат: `<тип>/<короткое-описание-через-дефисы>`

| Тип | Когда | Пример |
|---|---|---|
| `feature/` | новая функциональность | `feature/wizard-ip67-fallback` |
| `fix/` | исправление ошибки | `fix/excel-vat-rounding` |
| `docs/` | документация | `docs/api-contracts` |
| `refactor/` | перестройка без изменения поведения | `refactor/calc-to-server` |
| `chore/` | обслуживание (зависимости, конфиги) | `chore/update-node-22` |

Если ведёте номера задач (GitHub Issues) — добавляйте: `feature/12-zip-min-qty`.

## 2. Жизненный цикл одной задачи (повторять для каждой)

```bash
# 0) Начинаем от свежего main
git checkout main
git pull origin main

# 1) Ветка под задачу
git checkout -b feature/<описание>

# 2) Работаем… и коммитим небольшими порциями
git add -A                     # или выборочно: git add src/store.ts
git commit -m "feat(wizard): подсказка ближайшего IP, если IP67 нет в каталоге"

# 3) Публикуем ветку
git push -u origin feature/<описание>

# 4) На GitHub: New Pull Request → feature/… → main, заполняем шаблон
# 5) После проверки — Squash and merge → ветку удалить (GitHub предложит сам)

# 6) Возвращаемся к следующему циклу
git checkout main
git pull origin main
```

**Почему squash merge:** вся ветка схлопывается в один коммит в `main` с текстом
PR — история линейная, «одна задача = один коммит», откатываться `git revert`
проще простого.

## 3. Сообщения коммитов (Conventional Commits)

```
<тип>(<область>): <что сделано, повелительное наклонение, до 72 символов>

<зачем — контекст, проблема>

Решение: <как решили, ключевые файлы>
```

Типы: `feat` (новое), `fix` (баг), `docs`, `refactor`, `style`, `test`, `chore`.

Примеры:

```
feat(store): двухрежимное хранилище — localStorage и синхронизация с C# API

Проблема: данные жили только в браузере, на сервере пусто.
Решение: src/api/client.ts (REST-клиент) + src/store.ts (оптимистичные
мутации с дебаунсом PUT /api/projects/{id}); при старте гидратация.
```

```
fix(excel): копейки терялись на вкладке «Расчёт»

Округление до целых давало расхождение с итогом документа на ±1 ₽.
Решение: fmtMoney2() вместо fmtMoney() в utils/excel.ts.
```

## 4. Тэги и релизы

После каждого крупного слияния вешаем тэг — это «именованная точка отката»:

```bash
git tag -a v0.2.0 -m "Мастер подбора, экономика, Excel-выгрузка, C#-бэкенд"
git push origin v0.2.0
```

Схема версий: `v<мажор>.<минор>.<патч>` — мажор (несовместимые изменения модели
данных), минор (новые возможности), патч (фиксы).

Откатиться к любой версии:

```bash
git checkout v0.2.0            # посмотреть (detached HEAD)
git revert <хэш-коммита>       # отменить одну задачу, не ломая историю
git checkout -b hotfix/… <tэг> # чинить старую версию
```

## 5. Защита main (настроить один раз на GitHub)

Settings → Branches → **Add branch protection rule**:
- Branch name pattern: `main`
- ✅ Require a pull request before merging (+ «Require 1 approval», когда появится второй разработчик)
- ✅ Require status checks: `build` (если подключите GitHub Actions — см. п. 6)
- ✅ Do not allow force pushes

## 6. Автопроверка сборки (GitHub Actions, по желанию)

Файл `.github/workflows/build.yml`:

```yaml
name: build
on: [pull_request]
jobs:
  frontend:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: 22 }
      - run: npm ci && npm run build
  backend:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-dotnet@v4
        with: { dotnet-version: '8.0.x' }
      - run: dotnet build backend/TkpApi/TkpApi.csproj
```

Тогда каждый PR будет автоматически прогонять сборку фронта и бэкенда,
а защищённый `main` не примет PR с упавшей сборкой.

## 7. Шпаргалка «что делает каждая команда»

| Команда | Смысл простыми словами |
|---|---|
| `git init` | создать репозиторий (папку `.git` с историей) в текущей директории |
| `git status` | что изменено и ещё не закоммичено — смотреть **перед каждым коммитом** |
| `git add -A` | положить все изменения в «корзину» следующего коммита (staging) |
| `git commit -m "…"` | зафиксировать «корзину» как снимок состояния с комментарием |
| `git log --oneline` | короткая история коммитов |
| `git checkout -b x` | создать ветку `x` от текущего места и перейти в неё |
| `git checkout main` | вернуться в ветку `main` |
| `git pull origin main` | скачать чужие коммиты main и влить в локальный |
| `git push -u origin x` | отправить ветку `x` на GitHub (`-u` — запомнить связку, дальше просто `git push`) |
| `git merge x` | влить ветку `x` в текущую (на GitHub это делает кнопка merge) |
| `git revert <хэш>` | создать коммит, отменяющий коммит `<хэш>` — безопасно для общей истории |

## 8. Типичные ошибки новичка и спасение

| Ситуация | Команда |
|---|---|
| Закоммитил не в ту ветку | `git checkout -b feature/x` (коммит уедет с вами), затем `git checkout main && git reset --hard origin/main` |
| «Сломал всё, верните как было» | `git status` → `git restore .` (отменить правки) или `git reset --hard HEAD` (к последнему коммиту) |
| Забыл закоммитить и переключил ветку | `git stash` → переключиться → `git stash pop` |
| Конфликт при `git pull` | открыть файлы, найти `<<<<<<<`, выбрать нужное, `git add …`, `git commit` |
| Не знаю, что я наделал | `git log --oneline` + `git diff HEAD` |

**Главное правило:** `git reset --hard` и `git push --force` — только в своей
ветке, никогда в `main`.
