# SYNC-003 — дефект пересечения project.upsert/project.delete

## Статус

- Результат: FAIL
- Серьёзность: high
- Владелец исправления: Frontend
- Candidate: `56e55cb34451ecd4112710a116f9165736a9180c`
- Base: `65dcf44f320178201e42436d3002ca9cc26b8dfb`

## Условия

Для одного проекта в outbox последовательно находятся операции:

1. `project.upsert` — локальное изменение не было отправлено;
2. `project.delete` — затем проект удалили локально.

Локального payload проекта уже нет, а сервер при hydrate ещё возвращает старую запись.

## Воспроизведение

1. Установить `projects: []`.
2. Установить outbox с `project.upsert` и следующим за ним `project.delete` для одного ID.
3. Вернуть этот проект из `GET /api/projects`.
4. Вызвать `hydrateFromApi()` и дождаться автоматического `flushOutbox()`.

Автоматизированное воспроизведение: `src/store.sync003.test.ts`, сценарий
`lets delete win when pending upsert and delete target the same project`.

## Ожидаемое поведение

- Pending delete имеет приоритет над более ранним upsert того же ID.
- Проект не появляется в локальном списке.
- Выполняется `DELETE /api/projects/{id}`.
- После успешного DELETE обе устаревшие операции удаляются из outbox.

## Фактическое поведение

- Проект не появляется в локальном списке.
- `flushOutbox()` первым обрабатывает `project.upsert`, не находит payload и выполняет ранний `return`.
- DELETE не вызывается ни разу.
- Обе операции остаются в outbox; последующие flush повторяют тупиковое состояние.

## Лог

```text
FAIL src/store.sync003.test.ts
expected DELETE mock to be called once, but got 0 times
1 failed | 1 passed
```

## Ретест

После исправления повторить оба сценария `src/store.sync003.test.ts`. Допустимые
варианты реализации: удалять/игнорировать более ранний upsert при постановке delete
либо пропускать upsert без payload, если далее существует delete того же ID.

## Ограничения среды

Нет. Дефект воспроизводится детерминированно в unit-тесте без внешнего сервера.
