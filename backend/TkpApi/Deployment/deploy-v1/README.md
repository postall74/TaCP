# OPS-001 — deploy-v1 (кандидат для Docker gate)

API image и повторно используемый Compose для двух tenant по
[tenant-deploy-v1](../tenant-deploy-v1/CONTRACT.md). HTTP DTO и права сохранены. RATE-001 добавляет таблицу ставок через versioned EF migration. Web image, TLS/proxy и production deployment сюда не входят.
Compose выбирает один tenant через отдельный env-файл; API не выбирает БД из запроса.

## Требования и статус

Нужен Linux Docker Engine с Compose v2, доступ к MCR/Docker Hub/NuGet и свободные
loopback-порты 5085/5086. Примеры используют PostgreSQL **17** и .NET 8 Debian
bookworm; это выбор локального стенда, не согласование production-версий.
Перед релизом закрепить проверенные API/PG digest в deployment record. Оба
tenant должны использовать один API digest; повторная сборка для B не нужна.

На хосте автора Docker/Podman отсутствуют. `wsl.exe` присутствует, но рабочее
Linux-окружение не подтверждено. Образ, запуск двух стеков, health/restart и
сохранность volumes **не проверены исполнением**. Статические проверки не
заменяют этот gate. RATE-001 уже сохраняет ставки в PostgreSQL текущего tenant;
прежний дефект хранения только в памяти устранён. Открыта проверка объединённого
RATE+OPS image на Docker-хосте, включая миграцию и сохранность ставок.
NEED-001 остаётся partial; завершение исходной потребности здесь не заявляется.

## Секреты и первый запуск на чистом стенде

Команды ниже выполняются из этого каталога в POSIX shell на тестовом Docker-хосте.
`.example.test`, пути и порты — параметры стенда. Для другого хоста создайте две
копии env-файлов вне Git и укажите реальные отдельные пути. Env содержит ссылки,
а не пароли. Не используйте один project name или один файл секрета для A и B.

Для каждого tenant отдельно создайте три случайных секрета: bootstrap PostgreSQL,
пароль прикладной роли, JWT key. Для adapter v1 каждый — ровно 64 lowercase hex
символа (32 случайных байта); заключительный LF разрешён. Например, администратор
тестового хоста может выполнить следующее **один раз, до создания volume**:

```sh
sudo install -d -m 700 /srv/tkp/tenant-a/secrets /srv/tkp/tenant-b/secrets
sudo sh -eu <<'SH'
for tenant in tenant-a tenant-b; do
  for secret in db-bootstrap db-app jwt; do
    target="/srv/tkp/$tenant/secrets/$secret"
    test ! -e "$target"  # Никогда не перезаписывать credentials существующей БД.
    (umask 022; openssl rand -hex 32 > "$target")
  done
done
SH
```

Здесь Docker Compose запускается администратором с доступом к этим каталогам.
Secret-файлы readable в контейнере для непривилегированного API (UID 1654),
а каталоги 0700 ограничивают доступ на хосте. У Compose file secrets нет
гарантии шифрования at rest; фактические host ACL/mount permissions нужно проверить.
Docker administrator остаётся общей доверенной границей. Не печатайте секреты
в логах, не передавайте их как build args и не храните их внутри build context.

```sh
sudo docker compose --env-file tenant-a.example.env -f compose.yaml config --quiet
sudo docker compose --env-file tenant-b.example.env -f compose.yaml config --quiet
sudo docker compose --env-file tenant-a.example.env -f compose.yaml build api
sudo docker compose --env-file tenant-a.example.env -f compose.yaml up -d --wait --wait-timeout 180
sudo docker compose --env-file tenant-b.example.env -f compose.yaml up -d --wait --wait-timeout 180
curl --fail -H 'Host: tenant-a.example.test' http://127.0.0.1:5085/api/health
curl --fail -H 'Host: tenant-b.example.test' http://127.0.0.1:5086/api/health
```

Значения из окружения shell имеют приоритет над `--env-file`: перед запуском
проверить `docker compose ... config` и имена проектов, БД, ports, networks,
secret source paths. Этот вывод не содержит содержимого file secrets.
Не передавайте `-p` с одинаковым именем для обоих стеков.

DB bootstrap создаёт отдельную прикладную роль NOSUPERUSER/NOCREATEDB/NOCREATEROLE
и отдаёт ей её БД и public schema. API не получает пароль postgres. `init-db.sh`
выполняется только на пустом volume. Замена secret-файла не меняет пароль роли
в существующей БД: ротация требует согласованного ALTER ROLE и обновления секрета.
Не пытайтесь исправить credentials удалением volume.

Для первого администратора запишите отдельный пароль в `admin` файл с теми же
ACL (политика Identity из CONFIGURATION.md), проверьте ADMIN_EMAIL и запустите
только выбранный tenant с bootstrap overlay:

```sh
sudo docker compose --env-file tenant-a.example.env -f compose.yaml -f compose.bootstrap.yaml config --quiet
sudo docker compose --env-file tenant-a.example.env -f compose.yaml -f compose.bootstrap.yaml up -d --wait --wait-timeout 180
# После успешного login убрать bootstrap из runtime:
sudo docker compose --env-file tenant-a.example.env -f compose.yaml up -d --force-recreate --wait --wait-timeout 180 api
```

Повторить для B с его env и отдельным admin secret. Удалить bootstrap admin
secret из внешнего хранилища после подтверждения отключения и снятия mount.
Пароль postgres bootstrap остаётся только у db; он не равен паролю администратора API.
Container adapter читает фиксированные `/run/secrets` и экспортирует существующие
runtime keys. Общего `_FILE` provider в приложении не добавлено. Secret values
находятся в окружении процесса API; не собирайте process dumps/environ в отчёт.

## Изоляция, health и storage

Compose создаёт `<project>_database` volume и внутреннюю сеть с тем же суффиксом;
DB не публикует порты и подключена только к этой сети. API имеет ещё отдельную
сеть `<project>_ingress`, отдаёт порт только на 127.0.0.1. Proxy на хосте должен
маршрутизировать tenant hostname к его порту, сохраняя Host. TLS и доверие
forwarded headers требуют отдельной согласованной настройки до production.

API image содержит только backend. Он запускается non-root с read-only rootfs,
tmpfs `/tmp` и без capabilities. `/app/web` отсутствует, UI не поставляется.
Серверного file storage текущий API не реализует, поэтому фиктивного writable
files volume нет. Пользовательские файлы/экспорты вне БД требуют отдельного
учёта по TEN-001. Логи stdout/stderr раздельны по контейнерам, Docker local
driver ограничен 3 × 10 MB; это не долговременный архив/backup.

DB healthcheck проверяет TCP PostgreSQL, чтобы не принять временный socket-only
сервер initdb за готовый. API healthcheck отправляет правильный Host.
`/api/health` — liveness, он не проверяет доступность БД после старта API.
`depends_on: service_healthy` упорядочивает запуск, а `restart: unless-stopped`
перезапускает завершившийся процесс; статус unhealthy сам по себе рестарт
не вызывает. Внешний мониторинг DB/API остаётся релизной задачей.

## Обязательный объединённый RATE+OPS Docker gate (QA)

Собирать image из checkout, содержащего и OPS-001, и RATE-001. Исходный
integration SHA: `2ecf599d2c99d2668c768c3cb7fc804d9a6e8793`; в evidence записать
фактический проверенный SHA и одинаковый API image ID/digest обоих tenant,
PostgreSQL image ID/digest, версии Docker/Compose и `compose ps` обоих стеков.
Команды запуска и bootstrap приведены выше. Gate пока **не выполнен**.

Проверить inspect: сети и mounts A/B различны, DB Ports пусты, API non-root,
bootstrap admin secret отключён. У прикладных DB-ролей `rolsuper`, `rolcreatedb`,
`rolcreaterole` false. В каждой БД проверить applied migration
`20260929183448_PersistTenantRates` и ровно одну строку `rate_cards` с Id=1.
На свежих БД GET ставок должен вернуть defaults 1800/1800/2200/1800/1800.

Через авторизованный PUT `/api/rates` записать разные полные DTO `tenantA` и
`tenantB` из [RATE fixture](../../Contracts/rates-persistence-v1/fixture.json).
Сохранить ответы GET обеих БД и значения полей для точного сравнения; не заменять
их значениями по умолчанию между шагами. Также создать через существующие API
разные проекты, каталог/цены и пользователей, сохранив ID/значения. Проверить
login и отрицательные cross-tenant JWT/ID сценарии по TEN-001. Токены/пароли в
evidence не включать.

Выполнить следующие этапы **по одному** для A. После каждого блока дождаться
health и проверить авторизованные GET ставок и контрольные данные **A и B**:
ставки равны сохранённым DTO, ID/цены/пользователи не изменились; чужой JWT
по-прежнему получает 401. У B должны остаться прежние container ID и mounts.
Одного `/api/health` недостаточно: он не проверяет соединение с БД.

1. Перезапуск только процесса API в его контейнере:

```sh
sudo docker compose --env-file tenant-a.example.env -f compose.yaml restart api
sudo docker compose --env-file tenant-a.example.env -f compose.yaml up -d --no-build --wait --wait-timeout 180
```

2. Пересоздание API из того же image (container ID API должен измениться,
   DB container и volume должны остаться прежними):

```sh
sudo docker compose --env-file tenant-a.example.env -f compose.yaml up -d --no-build --no-deps --force-recreate --wait --wait-timeout 180 api
```

3. Перезапуск PostgreSQL с тем же PGDATA volume, без рестарта API:

```sh
sudo docker compose --env-file tenant-a.example.env -f compose.yaml restart db
sudo docker compose --env-file tenant-a.example.env -f compose.yaml up -d --no-build --wait --wait-timeout 180 db
```

Дождаться успешного GET ставок A после восстановления DB; при ошибке сохранить
код/логи и отметить gate failed, не маскировать её дополнительным рестартом API.

4. Удаление контейнеров и сетей A с последующим запуском на прежнем named volume:

```sh
sudo docker compose --env-file tenant-a.example.env -f compose.yaml down
sudo docker compose --env-file tenant-a.example.env -f compose.yaml up -d --no-build --wait --wait-timeout 180
```

Сверить имя/CreatedAt/параметры прежнего DB volume и mounts новых контейнеров;
данные A должны сохраниться, B не должен пересоздаваться или изменяться.
Затем повторить этапы 1–4 **для B**, заменив `tenant-a.example.env` на
`tenant-b.example.env`; на каждом этапе неизменным контролем служит A.
Сохранять результаты каждого этапа отдельно, не только итоговый GET.

Не использовать `down -v`, `volume rm` или `system prune --volumes`.
Отдельный backup/restore gate TEN-002: восстановить A в новое пространство по
runbook, проверить ставки и остальные данные, подтвердить неизменность B.
Не переносить исходную реальную БД для проверки Docker на чистом хосте.
Принятие требует фактических результатов QA на проверенном image digest;
наличие команд и успешная статическая проверка не означают прохождение gate.

## Миграции и rollback

RATE-001 добавляет `20260929183448_PersistTenantRates`: таблица `rate_cards`
и начальный набор ставок. Старые in-memory ставки необходимо экспортировать
до остановки прежнего API и восстановить авторизованным PUT после миграции.
Порядок upgrade, legacy preflight и rollback ставок —
[RATE contract](../../Contracts/rates-persistence-v1/CONTRACT.md).
Down этой миграции удаляет ставки; без backup/export его не выполнять.
Запуск API автоматически применяет имеющиеся миграции,
EnsureExtraTables, purge и seed; восстановленный API не является read-only.
Перенос исходной БД целиком только в A, preflight migration history и откат —
[MIGRATION_RUNBOOK.md](../tenant-deploy-v1/MIGRATION_RUNBOOK.md).
Для PostgreSQL major upgrade нужен отдельный проверенный dump/restore или
pg_upgrade; не подключать существующий PGDATA другой major версии.

Для отката image: заморозить записи, сохранить согласованный backup, проверить
совместимость старого API со схемой, заменить API_IMAGE проверенным прежним digest
только у нужного tenant и выполнить `up -d --no-build --wait`. Не понижать схему
автоматически. После новых записей восстановление старого backup требует решения
PM о сверке данных: потеря новых записей не разрешена. B не останавливается.

Источники: [Compose secrets](https://docs.docker.com/compose/how-tos/use-secrets/),
[startup order](https://docs.docker.com/compose/how-tos/startup-order/),
[PostgreSQL image](https://hub.docker.com/_/postgres),
[.NET non-root image](https://devblogs.microsoft.com/dotnet/securing-containers-with-rootless/).
