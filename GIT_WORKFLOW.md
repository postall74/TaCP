# Регламент работы с Git и GitHub — ТКП·Про

Цель: каждая задача — отдельная ветка и отдельный Pull Request, чтобы история была
читаемой, а откат к любой рабочей версии — одной командой.

---

## 1. Ветки

- **`main`** — всегда рабочая версия. Обновляется **только через PR** (включите защиту:
  *Settings → Branches → Add rule → `main` → Require a pull request*).
- Остальные ветки — под одну задачу:

| Префикс | Для чего | Пример |
|---|---|---|
| `feature/` | новая функциональность | `feature/compat-check`, `feature/auth-jwt-roles` |
| `fix/` | исправление ошибки | `fix/db-schema-auth-wiring`, `fix/frontend-crash-tests-ci` |
| `docs/` | документация | `docs/git-workflow` |
| `refactor/` | перестройка без изменения поведения | `refactor/pricing-model` |
| `chore/` | обвязка: CI, конфиги, зависимости | `chore/ci-vitest` |

## 2. Жизненный цикл задачи

```powershell
# 1) начать от свежего main
git checkout main
git pull --rebase origin main
git checkout -b feature/название

# 2) работать, коммитить (можно несколько коммитов)
git add -A
git commit -m "feat(модуль): что сделано" -m "Проблема: …" -m "Решение: …"

# 3) опубликовать
git push -u origin feature/название

# 4) GitHub: Compare & pull request → заполнить шаблон (Проблема/Решение/Как проверить)
# 5) Squash and merge → Confirm → Delete branch
# 6) локально
git checkout main
git pull --rebase origin main
```

## 3. Коммиты — Conventional Commits

```
<тип>(<область>): <кратко, что сделано>

Проблема: <почему это понадобилось>
Решение: <как решили, ключевые файлы>
```

Типы: `feat` · `fix` · `docs` · `refactor` · `test` · `chore` · `perf`.
Области: `rules`, `calc`, `wizard`, `auth`, `db`, `ci`, `docs`, `catalog`,
`online`, `rights`, `cabinet`, `api`…

## 4. Pull Request

Шаблон подставляется автоматически (`.github/pull_request_template.md`):
**Что сделано → Проблема → Решение → Как проверить → Чек-лист** (сборки фронта и бэка).
Мерж — **Squash and merge**: одна задача = один коммит в `main`, линейная история,
откат = `git revert <хэш>`.

## 5. Тэги — точки отката

После крупных слияний:

```powershell
git tag -a v0.3.0 -m "Проверка совместимости"
git tag -a v0.4.0 -m "Авторизация JWT, единая модель цен"
git push origin --tags
```

Вернуться посмотреть: `git checkout v0.3.0`; собрать hotfix от старой версии:
`git checkout -b fix/hotfix v0.3.0`.

## 6. Что коммитить обязательно

- `package.json` **и** `package-lock.json` — CI ставит через `npm ci` строго по локу;
  без лока или без зависимости в манифесте CI упадёт (`vitest` не найдётся).
- `.github/workflows/*.yml`, `.vscode/launch.json` (удобно всей команде),
  `backend/TkpApi/seed-catalog.csv`.
- **Не коммитить**: `node_modules/`, `dist/`, `bin/`, `obj/`, секреты
  (`Jwt:Key` для прода выносить в переменные окружения / User Secrets).

## 7. Шпаргалка «что делает команда»

| Команда | Смысл |
|---|---|
| `git status` | что изменено, что в корзине (staging) |
| `git add -A` | всё изменённое — в корзину |
| `git reset -- <путь>` | вынуть файл из корзины (с диска не удаляется) |
| `git commit -m …` | зафиксировать снимок |
| `git checkout -b X` | создать ветку X и перейти в неё |
| `git pull --rebase origin main` | подтянуть main и «переставить» ваши коммиты поверх |
| `git push -u origin X` | опубликовать ветку X (первый раз — с `-u`) |
| `git revert <хэш>` | создать коммит, отменяющий `<хэш>` (без переписывания истории) |
| `git log --oneline --graph` | компактная история |

## 8. Спасение из типовых ситуаций

| Ситуация | Команды |
|---|---|
| **`push` отклонён (non-fast-forward)** — на GitHub появились коммиты, которых нет локально (слитые PR) | `git pull --rebase origin main` → при конфликтах: правите файлы, `git add …`, `git rebase --continue` → `git push` |
| Закоммитил не в ту ветку | `git reset --soft HEAD~1` (коммит отменится, файлы останутся) → `git checkout -b нужная` → `git commit` |
| Сломал всё, хочу назад | `git status`/`git stash` — спрятать; `git checkout -- .` — отменить изменения в tracked-файлах; `git reset --hard <хэш>` — жёсткий откат (осторожно: потеряет незакоммиченное) |
| Ветка слита, но осталась локально | `git branch -d feature/…` (удалить); `git fetch --prune` — почистить устаревшие remote-ссылки |
| Конфликт в `package-lock.json` | принять любую сторону, затем `npm install` и закоммитить новый лок |

---

## Правила дома

1. Не пушим в `main` напрямую — только PR.
2. Одна задача — одна ветка; не чиним попутно «ещё три вещи» в той же ветке.
3. Перед push: тесты зелёные (`npx vitest run`, `dotnet test backend/TkpApi.Tests`).
4. Коммит-сообщение отвечает на вопрос «что и зачем», а не «поправил файлы».
5. **Документация — часть задачи**: каждая фича/фикс обновляет затронутые разделы
   `DOCS.md` (архитектура, контракт, дорожная карта) и `README.md` в том же PR;
   запись о ветке — в «Журнал изменений» (`DOCS.md § 13`).
