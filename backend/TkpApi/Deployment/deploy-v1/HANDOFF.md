# OPS-001 — передача PM / QA

- Worktree: `E:/dev/TaCP/.worktrees/backend-ops-001`.
- Ветка: `codex/backend/ops-001-api-compose`.
- Base SHA: `1edff933afe9f488f11137ffa9251bae6744c720`.
- Реализация Docker/Compose: `76ff51d0b19ce115938f6fb38c15b4cfe4b17537`.
- Контракт: кандидат `deploy-v1`, совместимый с `tenant-deploy-v1` и
  `runtime-config-v1`. HTTP DTO, права и EF schema этой задачей не меняются.

## Результат

API имеет multi-stage .NET 8 Dockerfile и запускается non-root. Один Compose
шаблон поднимается дважды с разными project name и tenant env: у стеков разные
DB credentials, JWT issuer/audience/key, loopback API ports, private DB networks
и постоянные PGDATA volumes. DB наружу не публикуется. API использует read-only
root filesystem, tmpfs, drop capabilities, healthcheck и restart policy.
Bootstrap администратора вынесен в отдельный одноразовый overlay.

Дополнение от 2026-10-21 закрывает пробел исходной реализации относительно
`DEPLOYMENT_PLAN.md`: Compose теперь задаёт отдельные настраиваемые лимиты CPU,
RAM и PID для API и PostgreSQL. Значения включены в оба tenant example env;
runbook требует сверять фактические HostConfig limits на Docker gate.

Текущий незакоммиченный diff после `76ff51d0`:

```text
backend/TkpApi/Deployment/deploy-v1/compose.yaml
backend/TkpApi/Deployment/deploy-v1/tenant-a.example.env
backend/TkpApi/Deployment/deploy-v1/tenant-b.example.env
backend/TkpApi/Deployment/deploy-v1/README.md
backend/TkpApi/Deployment/deploy-v1/HANDOFF.md
```

Container-only entrypoint читает фиксированные file secrets и экспортирует
существующие runtime keys. Это не общий `_FILE` provider приложения. Реальных
секретов, БД, volumes и production deployment задача не создаёт.

## Проверки

- `dotnet test backend/TkpApi.Tests/TkpApi.Tests.csproj --configuration Release
  --no-restore`: 100 passed, 0 failed/skipped.
- `dotnet build backend/TkpApi/TkpApi.csproj --configuration Release
  --no-restore`: 0 warnings, 0 errors.
- `bash -n` для `api-entrypoint.sh`, `api-healthcheck.sh`, `init-db.sh`.
- Статическая проверка Compose: обязательные подстановки, различие tenant
  параметров, private DB network, отсутствие DB ports, отдельный named volume,
  secrets, health/restart, read-only API и resource limits.
- `git diff --check` и проверка scope/artifacts.

Docker/Podman CLI и службы на текущем хосте отсутствуют. Поэтому `docker compose
config`, build, запуск двух стеков, runtime healthchecks, inspect фактических
сетей/mounts/лимитов, restart/recreate/down-up и сохранность PGDATA не проверены.
Статическая проверка этот gate не заменяет. Точные команды находятся в
[README.md](README.md); QA нужен Linux Docker Engine с Compose v2.

RATE-001 остаётся отдельным draft-изменением и в эту ветку не включён. Полный
restart gate ставок выполняется на checkout, объединяющем OPS-001 и RATE-001.

После передачи запись остановлена. Git add/commit/push/merge/PR исполнителем не
выполняются; интеграцию делает PM после независимого Docker gate.
