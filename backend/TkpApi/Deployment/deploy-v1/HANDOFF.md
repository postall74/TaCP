# OPS-001 — передача PM / QA

- Worktree: `E:/dev/TaCP/.worktrees/backend-ops-001`.
- Ветка: `codex/backend/ops-001-api-compose`.
- Base SHA: `1edff933afe9f488f11137ffa9251bae6744c720`.
- Контракт: deploy-v1 кандидат; совместим с tenant-deploy-v1/runtime-config-v1.
  HTTP DTO, права, C# и EF migrations не менялись. Container-only adapter читает
  фиксированные file secrets; это не общий `_FILE` provider приложения.
- Готова реализация для ревью. Приёмка OPS-001 **не завершена**: Docker gate
  недоступен на текущем хосте, rates persistence остаётся блокером TEN-001.

## Точные новые файлы

Пути относительно корня репозитория:

```text
backend/TkpApi/Dockerfile
backend/TkpApi/Dockerfile.dockerignore
backend/TkpApi/Deployment/deploy-v1/.gitattributes
backend/TkpApi/Deployment/deploy-v1/api-entrypoint.sh
backend/TkpApi/Deployment/deploy-v1/api-healthcheck.sh
backend/TkpApi/Deployment/deploy-v1/init-db.sh
backend/TkpApi/Deployment/deploy-v1/compose.yaml
backend/TkpApi/Deployment/deploy-v1/compose.bootstrap.yaml
backend/TkpApi/Deployment/deploy-v1/tenant-a.example.env
backend/TkpApi/Deployment/deploy-v1/tenant-b.example.env
backend/TkpApi/Deployment/deploy-v1/README.md
backend/TkpApi/Deployment/deploy-v1/HANDOFF.md
```

## Проверки автора

- `dotnet test backend/TkpApi.Tests`: **100 passed**, 0 failed/skipped.
  Первый restore выдал NU1900 из-за недоступности NuGet в sandbox.
- `dotnet restore backend/TkpApi.Tests --force` с разрешённым сетевым доступом:
  успешно, без предупреждений (аудит не отключался).
- `dotnet build backend/TkpApi/TkpApi.csproj --configuration Release`:
  **0 warnings / 0 errors** после успешного restore.
- `bash -n` для api-entrypoint.sh, api-healthcheck.sh, init-db.sh: успешно.
- PyYAML 6.0.2: оба Compose-файла разбираются; проверены private DB network,
  отсутствие DB ports, secret grants, restart/dependency, read-only API,
  различие всех tenant-параметров кроме общих image, обязательные подстановки,
  build context, LF в shell-файлах и ссылки README. Это **статическая** проверка.
- В diff только перечисленные backend-файлы; фактических секретов, bin/obj,
  сторонних пакетов и постоянных QA-тестов нет. Пакет/проверочный скрипт — в Temp.

`docker compose config`, build, up, runtime healthchecks, рестарты, изоляция
и restore **не выполнялись**: Docker/Podman/WSL не обнаружены. YAML parse не
подменяет Compose validation. Точные команды будущего gate и bootstrap —
[README.md](README.md). Перед принятием закрепить проверенные image digest и
передать QA на Docker-хосте; production-хост/TLS/storage policy не назначались.

Новых migrations нет; API при старте выполняет прежние миграции/seed/purge.
Перенос и rollback — раздел README и существующий TEN-001 runbook. Никаких
реальных БД, секретов или volumes автор не создавал и не переносил.

После этой передачи запись остановлена. Git add/commit/push/merge не выполнялись;
интеграция в main требует отдельного разрешения пользователя и действий PM.
