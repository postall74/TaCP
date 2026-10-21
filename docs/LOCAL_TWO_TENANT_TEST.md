# Локальный тестовый стенд двух tenant (OPS-001)

Статус: локальная QA-проверка двух tenant пройдена; это не production runbook.
Она подготовлена по backend SHA `86e1078572ef31daa1059c34ca6a8761d1f9ee5b`
и frontend SHA `0b9273af6771ed11a39811aa495dbc03f4438c4a`.

Стенд поднимает два независимых тестовых tenant: A и B. Каждый получает
отдельные Compose project, PostgreSQL volume, базу, роль БД, JWT-секреты,
hostname и loopback-порты. Общими остаются Docker-хост и собранные образы; это
не устраняет доверие к администратору Docker-хоста.

Эта инструкция не закрывает ни одну потребность из
[USER_NEEDS.md](USER_NEEDS.md), не доказывает production-готовность и не
принимает `tenant-deploy-v1`/`deploy-v1` как завершённые контракты.

## Предварительные условия

Работайте только в изолированной тестовой среде. Нужен один из вариантов:

- Linux-хост с Docker Engine и Docker Compose v2;
- Windows с Docker Desktop в режиме Linux containers и включённой WSL 2
  integration; команды ниже выполняются в дистрибутиве WSL, а не в PowerShell.

Проверьте до запуска:

```sh
docker version
docker compose version
docker info --format '{{.OSType}}'
```

Последняя команда должна вернуть `linux`. Также необходим доступ к реестрам
образов и пакетам сборки, свободные loopback-порты `5085`, `5086`, `5185`,
`5186` и права администратора тестового Docker-хоста. Не используйте рабочую
БД, production hostname, реальный JWT-ключ или общую с production сеть.

Независимая QA проверила exact heads на Docker Desktop 4.96.1 / Engine 29.9.2
/ Compose 5.6.0 (linux/amd64): оба stack стали healthy, login и изоляция JWT/
данных A/B прошли, а restart/recreate A сохранил данные и не изменил B. Это
доказательство относится к указанным image IDs и тестовым env, а не к
production-среде.

## Тестовые env и секреты вне Git

Скопируйте example env в приватный каталог вне checkout, принадлежащий тому же
пользователю Linux/WSL, который запускает `docker compose`. Не создавайте этот
каталог через `sudo`, если Compose будет запускаться без `sudo`: иначе CLI не
прочитает env и file secrets. Env-файлы содержат только параметры и абсолютные
пути к secret-файлам; сами секреты никогда не попадают в Git, build context,
командную строку или журнал QA.

```sh
testRoot="$HOME/tkp-ops-001-test"
umask 077
install -d -m 700 "$testRoot/tenant-a/secrets" "$testRoot/tenant-b/secrets"
install -m 600 backend/TkpApi/Deployment/deploy-v1/tenant-a.example.env "$testRoot/tenant-a/tenant-a.env"
install -m 600 backend/TkpApi/Deployment/deploy-v1/tenant-b.example.env "$testRoot/tenant-b/tenant-b.env"
sed -i "s|/srv/tkp/tenant-a/secrets|$testRoot/tenant-a/secrets|g" "$testRoot/tenant-a/tenant-a.env"
sed -i "s|/srv/tkp/tenant-b/secrets|$testRoot/tenant-b/secrets|g" "$testRoot/tenant-b/tenant-b.env"
```

В примерах env ниже `<docker-user>` заменяется на фактическое имя текущего
Linux/WSL-пользователя; используйте абсолютное значение `$testRoot`.
Команды `sed` заменяют в каждом env **все четыре** пути из example
(`/srv/tkp/...`) на созданный `testRoot`; проверьте их и добавьте параметры
web-слоя. Не меняйте
уникальность уже заданных `COMPOSE_PROJECT_NAME`, `TKP_DB_NAME`, `TKP_DB_USER`,
`API_PORT`, `TENANT_HOST`, `JWT_ISSUER` и `JWT_AUDIENCE`:

```text
# /home/<docker-user>/tkp-ops-001-test/tenant-a/tenant-a.env
DB_BOOTSTRAP_PASSWORD_FILE=/home/<docker-user>/tkp-ops-001-test/tenant-a/secrets/db-bootstrap
DB_APP_PASSWORD_FILE=/home/<docker-user>/tkp-ops-001-test/tenant-a/secrets/db-app
JWT_KEY_FILE=/home/<docker-user>/tkp-ops-001-test/tenant-a/secrets/jwt
ADMIN_PASSWORD_FILE=/home/<docker-user>/tkp-ops-001-test/tenant-a/secrets/admin
WEB_IMAGE=tkp-web:ops-001-local
WEB_PORT=5185
WEB_CPUS=0.5
WEB_MEMORY_LIMIT=128m
WEB_PIDS_LIMIT=128

# /home/<docker-user>/tkp-ops-001-test/tenant-b/tenant-b.env
DB_BOOTSTRAP_PASSWORD_FILE=/home/<docker-user>/tkp-ops-001-test/tenant-b/secrets/db-bootstrap
DB_APP_PASSWORD_FILE=/home/<docker-user>/tkp-ops-001-test/tenant-b/secrets/db-app
JWT_KEY_FILE=/home/<docker-user>/tkp-ops-001-test/tenant-b/secrets/jwt
ADMIN_PASSWORD_FILE=/home/<docker-user>/tkp-ops-001-test/tenant-b/secrets/admin
WEB_IMAGE=tkp-web:ops-001-local
WEB_PORT=5186
WEB_CPUS=0.5
WEB_MEMORY_LIMIT=128m
WEB_PIDS_LIMIT=128
```

Создайте для каждого tenant отдельные `db-bootstrap`, `db-app` и `jwt` по
32 случайных байта в lowercase hex. Пути должны совпадать с
`*_PASSWORD_FILE` и `JWT_KEY_FILE` в соответствующем env.

```sh
for tenant in tenant-a tenant-b; do
  for secret in db-bootstrap db-app jwt; do
    target="$testRoot/$tenant/secrets/$secret"
    test ! -e "$target"
    openssl rand -hex 32 > "$target"
  done
done
```

До `docker compose` убедитесь, что текущий пользователь читает env и все
указанные secret files. Docker Desktop/Engine получает file secrets через
Compose CLI; отдельный root-owned каталог для обычного запуска не требуется.

```sh
for tenant in tenant-a tenant-b; do
  test -r "$testRoot/$tenant/$tenant.env"
  for secret in db-bootstrap db-app jwt; do
    test -r "$testRoot/$tenant/secrets/$secret"
  done
done
```

Для первоначального администратора создайте отдельно `admin` в том же
каталоге, укажите тестовый `ADMIN_EMAIL` и путь `ADMIN_PASSWORD_FILE` в каждом
env. Bootstrap overlay подключается только при первой инициализации, затем
secret администратора удаляется из runtime-mount по процедуре backend handoff.
Не заменяйте существующий secret-файл: это не меняет пароль уже созданной роли
PostgreSQL.

```sh
for tenant in tenant-a tenant-b; do
  target="$testRoot/$tenant/secrets/admin"
  test ! -e "$target"
  openssl rand -hex 32 > "$target"
  test -r "$target"
done
```

## Проверка и запуск объединённого Compose

Команды выполняются из корня checkout, в котором доступны точные кандидаты
backend #119 и frontend #120. Оба compose-файла обязательны: первый задаёт API
и БД, второй — nginx/web. Сначала проверьте итоговую конфигурацию без запуска:

```sh
cd /path/to/TaCP

docker compose --env-file "$testRoot/tenant-a/tenant-a.env" \
  -f backend/TkpApi/Deployment/deploy-v1/compose.yaml \
  -f docker/compose.web.yaml config --quiet

docker compose --env-file "$testRoot/tenant-b/tenant-b.env" \
  -f backend/TkpApi/Deployment/deploy-v1/compose.yaml \
  -f docker/compose.web.yaml config --quiet
```

Проверьте в `docker compose ... config`, что A и B имеют разные project name,
имена БД, пути secret-файлов и четыре уникальных опубликованных порта. БД не
должна публиковать порт на хост.

Соберите оба образа один раз на конфигурации A, затем поднимите A и B с теми же
image-тегами:

```sh
docker compose --env-file "$testRoot/tenant-a/tenant-a.env" \
  -f backend/TkpApi/Deployment/deploy-v1/compose.yaml \
  -f docker/compose.web.yaml build api web
```

Если на чистых volumes нужен первый тестовый администратор, выполните bootstrap
ровно по одному разу для A и B. В обычном запуске overlay не используйте:

```sh
docker compose --env-file "$testRoot/tenant-a/tenant-a.env" \
  -f backend/TkpApi/Deployment/deploy-v1/compose.yaml \
  -f backend/TkpApi/Deployment/deploy-v1/compose.bootstrap.yaml \
  -f docker/compose.web.yaml up -d --wait --wait-timeout 180

docker compose --env-file "$testRoot/tenant-b/tenant-b.env" \
  -f backend/TkpApi/Deployment/deploy-v1/compose.yaml \
  -f backend/TkpApi/Deployment/deploy-v1/compose.bootstrap.yaml \
  -f docker/compose.web.yaml up -d --wait --wait-timeout 180
```

После подтверждённого login немедленно пересоздайте API без bootstrap overlay:

```sh
docker compose --env-file "$testRoot/tenant-a/tenant-a.env" \
  -f backend/TkpApi/Deployment/deploy-v1/compose.yaml \
  -f docker/compose.web.yaml up -d --force-recreate --wait --wait-timeout 180 api

docker compose --env-file "$testRoot/tenant-b/tenant-b.env" \
  -f backend/TkpApi/Deployment/deploy-v1/compose.yaml \
  -f docker/compose.web.yaml up -d --force-recreate --wait --wait-timeout 180 api
```

Обычный запуск или повторное поднятие уже инициализированных tenant:

```sh
docker compose --env-file "$testRoot/tenant-a/tenant-a.env" \
  -f backend/TkpApi/Deployment/deploy-v1/compose.yaml \
  -f docker/compose.web.yaml up -d --wait --wait-timeout 180

docker compose --env-file "$testRoot/tenant-b/tenant-b.env" \
  -f backend/TkpApi/Deployment/deploy-v1/compose.yaml \
  -f docker/compose.web.yaml up -d --wait --wait-timeout 180
```

Не добавляйте общий `-p` и не выполняйте отдельную пересборку B: разделение
обеспечивается `COMPOSE_PROJECT_NAME` из каждого env, а одинаковый digest
образов — условие сопоставимой проверки.

## Health и минимальная проверка изоляции

```sh
curl --fail -H 'Host: tenant-a.example.test' http://127.0.0.1:5085/api/health
curl --fail -H 'Host: tenant-b.example.test' http://127.0.0.1:5086/api/health
curl --fail http://127.0.0.1:5185/healthz
curl --fail http://127.0.0.1:5186/healthz
curl --fail -H 'Host: tenant-a.example.test' http://127.0.0.1:5185/api/health
curl --fail -H 'Host: tenant-b.example.test' http://127.0.0.1:5186/api/health
```

Сохраните в QA-артефакте без секретов результат `docker compose ... ps`, digest
двух образов и inspect сетей, mounts и опубликованных портов. У A и B должны
быть отдельные database volumes и private database networks; API/web работают
непривилегированно, а в обычном режиме API не получает bootstrap admin secret.

QA зафиксировала один transient `502` при одновременном `compose restart`: nginx
в этот момент ещё не мог разрешить `api`. После завершения старта ответ стал
`200`; полный down/up с Compose wait и трёхсекундным клиентским retry прошёл.
Это startup timing evidence, не дефект и не SLA/retry-гарантия. Зафиксируйте
момент, длительность, восстановление обоих `/health` и отсутствие перекрёстного
доступа; не скрывайте `502` повторными запросами без записи результата.

## Остановка и очистка тестового стенда

Обычная остановка сохраняет данные для restart/recreate-проверок:

```sh
docker compose --env-file "$testRoot/tenant-a/tenant-a.env" \
  -f backend/TkpApi/Deployment/deploy-v1/compose.yaml \
  -f docker/compose.web.yaml down

docker compose --env-file "$testRoot/tenant-b/tenant-b.env" \
  -f backend/TkpApi/Deployment/deploy-v1/compose.yaml \
  -f docker/compose.web.yaml down
```

Во время QA не используйте `down -v`, `docker volume rm` или
`docker system prune --volumes`: это уничтожит доказательство сохранности
данных. Полное удаление volumes и `$testRoot` допускается только после
сохранения QA-результата и явного решения владельца стенда.

## Непройденные границы

- Backup/restore, rollback образа/схемы и восстановление после новых записей
  не выполнены этим стендом; они требуют отдельной QA-репетиции и принятого
  runbook.
- Production deployment, TLS, внешний reverse proxy, monitoring, retention,
  RPO/RTO и ротация secret-файлов не проверены.
- До интеграции RATE-001 тарифы не включаются в заявление о сохранности после
  рестарта.
- Runtime QA подтверждает build, Compose A/B, health, независимый login/JWT,
  изоляцию данных, отсутствие DB ports и restart/recreate на exact heads.
  Результат не переносится автоматически на иные digest, env или host.

Технические детали backend-кандидата находятся в
`backend/TkpApi/Deployment/deploy-v1/README.md`; границы tenant-модели — в
`backend/TkpApi/Deployment/tenant-deploy-v1/CONTRACT.md`.
