# Запуск API: runtime-config-v1 / CORE-005

Основание: ADR-006a, принят PM 22.09.2026. HTTP DTO и схема БД не меняются.
Старый запуск с demo-конфигурацией намеренно несовместим с новой версией.
Перед обновлением задайте параметры извне. Полный ADR-006 и SEC-001 остаются
отдельными release gates: эта настройка сама по себе не разрешает внешний релиз.

## Параметры

| Переменная окружения | Требование / значение по умолчанию |
|---|---|
| `DOTNET_ENVIRONMENT` | Явно `Development` для локальной разработки; иначе стандартный Production |
| `ConnectionStrings__Tkp` | Обязательна: Host, Database, Username; способ аутентификации задаёт оператор, demo-пароль запрещён |
| `Jwt__Key` | Обязательный внешний секрет, не менее 32 байт UTF-8; старый demo-ключ запрещён |
| `Jwt__Issuer`, `Jwt__Audience` | Обязательны вне Development; локально `tkp-api`, `tkp-web` |
| `Jwt__ExpireMinutes` | Целое от 1 до 525600, по умолчанию 480 |
| `AllowedHosts` | Вне Development обязательны конкретные имена хостов через `;`, без портов, схем и wildcard |
| `Cors__AllowedOrigins__0`, `__1`, … | Вне Development минимум один HTTP(S) origin; без пути, завершающего `/`, credentials и wildcard |
| `Swagger__Enabled` | Boolean; если отсутствует, true только в Development |
| `Admin__Enabled` | false; true включает bootstrap с внешними credentials |
| `Admin__Email`, `Admin__Password` | При bootstrap обязательны; пароль минимум 6 символов с цифрой, без demo-значений; используйте случайный стойкий пароль |
| `URLS` | Явный адрес Kestrel для выбранного хоста; в Development `http://localhost:5085` |

Неверные значения отклоняются до регистрации подключения к БД. Ошибка содержит
имена параметров, а не секреты. Известные старые demo-секреты и шаблоны
`<...>`, `CHANGE_ME`, `REPLACE_ME` не являются рабочей конфигурацией.
Невозможно автоматически распознать любой слабый или уже раскрытый секрет:
оператор должен сгенерировать новые значения, не переиспользуя старые.

Проверка не требует пароль в connection string: PostgreSQL может использовать
внешний механизм аутентификации. Он настраивается и проверяется оператором.
Для нескольких процессов/экземпляров используйте разные секреты и не выполняйте
bootstrap одновременно. Multi-tenant deployment проектируется в TEN-001.

## Локальный запуск (PowerShell)

Из корня репозитория; сначала создайте отдельную локальную БД и пользователя.
Значения секретов вводятся скрыто и не записываются в историю команд:

```powershell
$env:DOTNET_ENVIRONMENT = 'Development'
$env:ConnectionStrings__Tkp = Read-Host 'Полная строка подключения к локальной БД' -MaskInput
$env:Jwt__Key = [Convert]::ToBase64String([Security.Cryptography.RandomNumberGenerator]::GetBytes(48))
$env:Admin__Enabled = 'true'
$env:Admin__Email = Read-Host 'Email первого администратора'
$env:Admin__Password = Read-Host 'Новый пароль администратора' -MaskInput
dotnet run --project backend/TkpApi --no-launch-profile
```

Команды требуют PowerShell 7. После первого успешного запуска выключите bootstrap:

```powershell
$env:Admin__Enabled = 'false'
Remove-Item Env:Admin__Password, Env:Admin__Email
dotnet run --project backend/TkpApi --no-launch-profile
```

При остановке первого процесса ключ JWT остаётся в текущей оболочке. Сохраните
его в выбранном локальном хранилище, если токены должны переживать новую сессию.
Альтернатива переменным для Development — .NET User Secrets с идентификатором
`TkpApi-local-development`; файл находится вне репозитория. User Secrets не
шифрует значения и не предназначен для production. Не записывайте секреты в JSON
проекта или в команды, сохраняемые shell history.

Адрес API — `http://localhost:5085`, Swagger — `/swagger`, разрешённый origin
frontend — `http://localhost:3000`. Для другого порта задайте
`Cors__AllowedOrigins__0` явно. API применяет существующие миграции и seed каталога
при запуске; используйте тестовую БД. У существующего bootstrap-пользователя
не меняются пароль и роли; параметр не восстанавливает утраченные права.

## Production-шаблон

`runtime-config.example.txt` перечисляет параметры без рабочих секретов.
Это справочник: приложение не загружает этот файл или `.env` автоматически.
Среда запуска должна передать значения. Используется стандартный порядок
ASP.NET Core: JSON, Development User Secrets, переменные окружения, аргументы.
Не передавайте секреты аргументами командной строки. При смене JWT-ключа ранее
выданные токены перестают приниматься и пользователям потребуется новый вход.

Для same-origin размещения укажите origin приложения в CORS allowlist.
Настройка CORS не заменяет авторизацию. TLS, reverse proxy, backups и конкретный
домен остаются предметом полного ADR-006. Не запускайте production с Development.

Основания: [ASP.NET Core configuration](https://learn.microsoft.com/en-us/aspnet/core/fundamentals/configuration/?view=aspnetcore-8.0),
[User Secrets](https://learn.microsoft.com/en-us/aspnet/core/security/app-secrets?view=aspnetcore-8.0).
