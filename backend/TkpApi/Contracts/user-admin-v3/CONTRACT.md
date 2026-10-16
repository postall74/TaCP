# ADMIN-006 — user-admin-v3

Основание: ADMIN-006 в PM ROADMAP. База:
`6b36e210223c804cf6581fdae4880e75f2eef3a1`, содержащая ADMIN-003,
ADMIN-004, SEC-004 и текущий DOOR-кандидат. NEED-001 остаётся partial.

## HTTP

`PUT /api/auth/users/{id}` использует прежнюю policy `AdminOnly`.

Request:

```json
{
  "fullName": "Иван Петров",
  "position": "Ведущий инженер",
  "phone": "+7 900 000-00-00",
  "email": "ivan.petrov@example.test"
}
```

Все поля optional. Отсутствующий или `null` сохраняет прежнее значение;
переданная строка обрезается по краям. Пустая строка по-прежнему очищает
`fullName`, `position` или `phone`, но пустой/пробельный `email` недопустим.

200 возвращает существующий AuthUser DTO:

```json
{
  "id": "user-id",
  "email": "ivan.petrov@example.test",
  "fullName": "Иван Петров",
  "position": "Ведущий инженер",
  "phone": "+7 900 000-00-00",
  "roles": ["engineer"]
}
```

Переданный email одновременно становится `Email` и `UserName`. Нормализованные
значения вычисляет ASP.NET Identity. Уникальность регистронезависима по правилам
Identity; изменение только регистра адреса текущего пользователя разрешено.
После успеха старый адрес больше не подходит для login, новый подходит с тем же
id, паролем и ролями. Уже выданный JWT остаётся действительным до expiry,
поскольку идентификация идёт по NameIdentifier; отзыв токенов не добавлен.

## Атомарность и ошибки

Email, login и переданные поля профиля сохраняются одним проверенным
`UserManager.UpdateAsync`. Ответ 200 не выдаётся при неуспешном IdentityResult.
Валидация или занятый email возвращают 400 `{ "errors": ["..."] }` без
частичного сохранения. Identity concurrency failure возвращает 409 с тем же
стабильным форматом. В ответ не попадают внутренние Identity-коды или детали БД.
Неизвестный id — 404; анонимный запрос — 401; manager/engineer — 403.
Непредусмотренные ошибки БД сохраняют стандартный 500.

## Совместимость и границы

Старые клиенты без `email` совместимы. `PUT /api/auth/me` продолжает принимать
`UpdateProfileDto` только с `fullName`, `position`, `phone`; самостоятельная
смена email не открывается. Схема БД, миграции, роли, JWT shape, password,
register/delete/role endpoints не меняются.

Backend следует публиковать раньше frontend ADMIN-007. Старый backend молча
игнорирует email и может создать ложный успех. При rollback сначала откатывают
frontend, затем backend; миграционный rollback не нужен.

Fixture: [fixture.json](fixture.json). Независимый QA проверяет успех и отказ на
изолированной PostgreSQL через HTTP и свежий DbContext, включая 401/403/404,
старый/новый login, self-edit, duplicate exact/case variant, invalid/blank,
omitted/null, case-only update, concurrency и регрессии register/role/delete/me.
