# TEN-001 — перенос одной существующей БД и откат

Версия: tenant-deploy-v1. Это план для согласования PM/эксплуатацией и репетиции QA.
В рамках TEN-001 команды не выполнялись; production-доступ и удаление данных
не запрашиваются. Исполнять после OPS/release gates и согласования окна переноса.
Контракт и границы: [CONTRACT.md](CONTRACT.md).

## 1. Инвентаризация и stop conditions

- Зафиксировать исходный сервер/БД, владельца данных, SQL roles, PostgreSQL major,
  extensions/collation/encoding, версию приложения и __EFMigrationsHistory.
  Не объединять базы разных компаний. Исходная БД целиком назначается tenant A.
- Сверить схему с миграциями выбранного SHA/digest на копии. Текущий EnsureSchema
  помечает все pending migrations применёнными, если есть таблицы, но нет истории.
  Это не доказательство соответствия схемы. При missing/расходящейся истории
  остановить перенос и передать PM/backend отдельную задачу; не подделывать history.
- Зафиксировать counts/контрольные суммы значимых бизнес-данных, включая строки
  с одинаковыми ID, закупочные цены, Identity/роли, company_settings, корзину и версии.
  Проверять contents и связи, а не только counts. Отчёт с персональными данными
  хранить в защищённом tenant-пространстве, не в Git/общем логе.
- Тарифы из /api/rates снять через разрешённый admin/Staff сценарий в защищённый
  snapshot до остановки старого процесса. Они не входят в DB dump. До принятого
  решения о восстановлении и сохранении тарифов перенос не считается полным.
- Инвентаризировать файлы вне БД и состояние browser outbox/local-only данных.
  Очереди сверить и доотправить в исходную БД до freeze; затем закрыть старые клиенты.
  Не направлять несверенные очереди в A/B автоматически. Не удалять localStorage
  до подтверждённого переноса. Права/OwnerId пользователей не перекраивать.
- Зафиксировать новый проверенный image digest, схему, конфигурацию runtime-config-v1,
  auth-v2 и отдельные секреты A/B. Старый небезопасный сервер без auth-v2 не является
  допустимым публичным fallback. TLS/хост/backup retention/RPO/RTO утверждает PM.

## 2. Репетиция восстановления

Оператор подготавливает отдельную пустую БД A-rehearsal и новые DB roles/credentials,
без прав на исходную БД или B сверх необходимых для своей операции. Runtime role
не superuser, не CREATEDB/CREATEROLE; текущему приложению нужны DDL-права в своей
БД при запуске. Разделение migration/runtime roles ещё не реализовано — OPS решает
его отдельно. DB A не публикуется в интернет.

Предпочтительно первый перенос на ту же PostgreSQL major, без одновременного
апгрейда СУБД. Версии pg_dump/pg_restore и destination проверяет оператор:
pg_dump не может читать сервер более новой major; восстановление в более старую
major не обещается. SQL global roles не копируются слепо из общего кластера.

Ниже образец PowerShell, а не готовый deployment script. Переменные задаёт
оператор из проверенной инвентаризации; пароли не передаются аргументами.
Подключение использует отдельный защищённый PGPASSFILE/эквивалентный утверждённый
механизм. Не использовать общий файл с credentials A и B внутри контейнера API.

```powershell
# $SourceHost, $SourcePort, $SourceDb, $BackupUser — проверенный источник.
# $DumpPath — новый путь в защищённом backup namespace A, без перезаписи.
if (Test-Path -LiteralPath $DumpPath) { throw 'Backup path already exists' }
pg_dump --host=$SourceHost --port=$SourcePort --username=$BackupUser --no-password --format=custom --file=$DumpPath $SourceDb
if ($LASTEXITCODE -ne 0) { throw 'Dump failed: do not continue' }
Get-FileHash -LiteralPath $DumpPath -Algorithm SHA256
pg_restore --list $DumpPath
if ($LASTEXITCODE -ne 0) { throw 'Archive listing failed: do not continue' }

# Отдельный destination; БД должна быть новой, API ещё не запущен.
# $TargetOwner — заранее созданная ограниченная роль только tenant A.
createdb --host=$TargetHost --port=$TargetPort --username=$ProvisionUser --no-password --template=template0 --owner=$TargetOwner $TargetDb
if ($LASTEXITCODE -ne 0) { throw 'New destination creation failed: do not reuse existing DB' }
pg_restore --host=$TargetHost --port=$TargetPort --username=$TargetOwner --no-password --dbname=$TargetDb --no-owner --no-privileges --single-transaction --exit-on-error $DumpPath
if ($LASTEXITCODE -ne 0) { throw 'Restore failed: keep source unchanged' }
```

Не использовать `--clean`, `--create` при restore, drop database или существующую
БД B как destination. Архив содержит одну БД, без cluster roles; после
`--no-privileges` нужные grants на целевой БД задаются и проверяются отдельно.
Если extensions требуют дополнительных прав, остановиться на preflight и
согласовать их подготовку; не повышать runtime role до superuser.

Проверка checksum/`--list` подтверждает файл, но не восстанавливаемость.
До старта API сравнить схему, migration history, counts, данные и FK на restored DB.
После старта отдельно учитывать штатные изменения: EnsureExtraTables, миграции,
seed пустого каталога, удаление корзины старше 90 дней, bootstrap при его включении.
Для restored A использовать Admin__Enabled=false; существующие Identity-записи
сохраняются. Если доступного администратора нет — отдельный согласованный recovery,
не неявная смена роли по email. Для нового B допустим явно включённый bootstrap,
который отключается после создания пользователя. Данные A в B не восстанавливаются.

## 3. Cutover после успешной репетиции

1. Закрыть пользовательскую запись на ingress. Через закрытый операторский доступ
   снять окончательный снимок тарифов до остановки процесса: после неё память
   будет потеряна. Затем остановить исходный API/фоновые задачи и другие writers.
   Одной блокировки HTTP недостаточно: PurgeDeleted работает внутри процесса.
   Убедиться, что отложенные клиенты не продолжают запись.
2. Снять финальный dump/файловый snapshot после согласованного freeze; приложить
   сохранённый на шаге 1 снимок тарифов. Зафиксировать время, checksum, схему, digest, backup location.
   Сохранить исходную БД остановленной и неизменной. Не удалять её volume.
3. Повторить restore в новую пустую БД A-final, pre-start сравнение и проверку
   секретов/сетей. Не подменять чужой runtime connection string на общий источник.
4. Запустить только A в закрытом контуре, проверить auth, каталог/цены, проекты,
   роли, настройки и принятое восстановление тарифов; затем матрицу A/B из
   CONTRACT.md. Отклонения purge/seed отражать явно, а не скрывать в counts.
5. Переключить только hostname A на проверенный стек; оставить old origin
   в режиме обслуживания, чтобы исключить split-brain. Новые JWT key/issuer/audience
   требуют повторного входа; старые токены не импортировать. Перенос browser queue
   отдельно подтверждается до открытия записи.
6. Открыть запись после QA/PM release acceptance. Зафиксировать момент первой
   записи в A: он разделяет безопасный возврат к freeze и откат с новыми данными.
   Проверить, что B сохранил свои данные и конфигурацию; для B отдельный change record.

## 4. Rollback

| Момент сбоя | Действие |
|---|---|
| Репетиция/restore/проверка до cutover | Остановить новый A, сохранить диагностику; исходник и B не менять. Не удалять неуспешную БД автоматически |
| После переключения, до новых записей в A | Закрыть ingress, остановить A; подтвердить отсутствие новых данных; вернуть исходную БД и совместимый безопасный image/config; снова выполнить smoke до открытия записи |
| После новых записей в A | Freeze A и snapshot его актуальной БД; возврат к старому dump означал бы потерю записей. Требуется отдельный план переноса/сверки новых данных и решение PM; автоматический откат запрещён |
| Новая схема несовместима со старым image | Не запускать старый image на новой БД и не применять Down вслепую; восстановить проверенный snapshot в ещё одну новую БД с совместимым image, учитывая новые записи по предыдущей строке |

Ни один сценарий не использует volume/credentials B и не уничтожает source/backup.
Ротация JWT может потребовать повторного входа и при rollback. Удаление старых
данных/томов выполняется только отдельной операцией после принятого retention.

## 5. Evidence для PM/QA

Исходный/целевой идентификатор tenant, SHA/digest, schema history, PG/tool versions,
окно freeze, checksum и защищённый путь dump, результаты pre/post-start сравнения,
отдельное подтверждение тарифов/outbox/files, A/B access tests, время первой новой
записи и выбранная ветка rollback. Логи не содержат токенов, connection strings
с паролями или персональных данных. Репетиция восстановления обязательна;
этот Markdown не является доказательством её выполнения.

Основания: [PostgreSQL 18 pg_dump](https://www.postgresql.org/docs/18/app-pgdump.html),
[PostgreSQL 18 pg_restore](https://www.postgresql.org/docs/18/app-pgrestore.html).
Команды описывают разовый логический перенос; стратегию регулярных backups/PITR
этот срез не устанавливает.
