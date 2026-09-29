# OPS-001 + RATE-001 — передача объединённого Docker gate

- Worktree: `C:/Users/Администратор/.codex/worktrees/backend-ops-rate-gate/TaCP`.
- Ветка PM: `codex/pm/ops-rate-integration`.
- Base SHA этой правки: `2ecf599d2c99d2668c768c3cb7fc804d9a6e8793`.
- Объединены OPS `76ff51d0b19ce115938f6fb38c15b4cfe4b17537` и
  RATE `8b6937f7cf88816501ee45d77c15765a8213603b`.
- NEED-001 — partial; ни одна потребность не объявляется closed.

## Diff этой передачи

Изменены только:

```text
backend/TkpApi/Deployment/deploy-v1/README.md
backend/TkpApi/Deployment/deploy-v1/HANDOFF.md
```

Исправлено устаревшее описание ставок: RATE-001 уже сохраняет их в PostgreSQL.
HTTP DTO и Staff/AdminOnly совместимы; миграция
`20260929183448_PersistTenantRates` создаёт singleton `rate_cards` с прежними
defaults. Не выполнен именно объединённый Docker runtime gate, а не реализация
persistence. Код, Compose, Dockerfile, frontend, QA и ROADMAP здесь не менялись.

## Gate для QA

Точные команды и порядок — [README.md](README.md), раздел объединённого gate.
Использовать checkout с обоими изменениями, один API image digest для A/B и
отдельные project/DB/credentials/JWT/PGDATA volumes. Сначала проверить миграцию,
defaults, затем записать разные полные DTO ставок из
[fixture](../../Contracts/rates-persistence-v1/fixture.json) и контрольные данные.

Для A последовательно выполнить: API restart; API force-recreate из того же
image; DB restart с прежним volume без рестарта API; down/up без `-v`.
После каждого этапа проверить health, авторизованный GET ставок и контрольные
данные A/B, чужой JWT 401, отсутствие изменений контейнеров/mounts B. При DB
restart проверить восстановление доступа API к БД, не подменяя его рестартом API.
После recreate проверить изменение ID контейнера API и неизменность DB volume.
Затем симметрично повторить четыре этапа B с A как неизменным контролем.
Фиксировать SHA, API/PG image digest, версии Docker/Compose, mounts/volume metadata
и результаты каждого этапа без токенов/секретов. Backup/restore TEN-002 проверяется
отдельно и также должен сохранять ставки и не затрагивать соседний tenant.

## Фактические результаты и ограничения

До этой документальной правки проверены: RATE backend 100 tests, Release 0/0,
EF model/snapshot, HTTP restart и разделение данных на изолированном PostgreSQL
18.6; OPS YAML/static isolation и `bash -n` трёх shell scripts. Подробности RATE —
[его handoff](../../Contracts/rates-persistence-v1/HANDOFF.md).
Эти результаты не являются проверкой объединённого контейнерного image или PG17.

Для текущего diff: проверены границы двух файлов, локальные ссылки, отсутствие
устаревших утверждений о текущем in-memory хранении, `git diff --check` и
соответствие команд сервисам `api`/`db` и tenant env-файлам. Неизменные C# тесты
и сборка повторно не запускались. Docker-команды из README не выполнялись.

Внешний blocker: Docker/Podman CLI и службы не обнаружены, стандартные exe
отсутствуют, DOCKER_HOST/CONTAINER_HOST не настроены. `wsl.exe` присутствует,
но список дистрибутивов возвращает установочную справку; рабочее Linux-окружение
не подтверждено. Нужен Docker-хост для config/build/up и всех runtime gates.
**Docker gate остаётся непройденным.** Независимый QA/CI, пользовательская
инструкция со скриншотами и релизный тег остаются отдельными PM gates.

Миграция/экспорт прежних ставок и rollback описаны в README и RATE contract;
реальные БД, секреты и volumes этой правкой не изменялись. После передачи запись
остановлена. Commit/push/merge не выполнялись, main не менялся.