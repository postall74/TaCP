# ADMIN-006 — Backend handoff

- Worktree: `E:/dev/TaCP/.worktrees/admin-006-backend`.
- Branch: `codex/backend/admin-006-email-update`.
- Base SHA: `6b36e210223c804cf6581fdae4880e75f2eef3a1`.
- Контракт: `user-admin-v3`; NEED-001 partial.
- Миграции нет; rollback и rollout описаны в [CONTRACT.md](CONTRACT.md).

## Изменённые файлы

```text
modified: backend/TkpApi/AuthExtensions.cs
added: backend/TkpApi/Contracts/user-admin-v3/CONTRACT.md
added: backend/TkpApi/Contracts/user-admin-v3/fixture.json
added: backend/TkpApi/Contracts/user-admin-v3/HANDOFF.md
```

Административный PUT теперь принимает отдельный `AdminUpdateUserDto` с email,
одним проверенным UpdateAsync сохраняет email/login и профиль, возвращает 400
для validation/duplicate и 409 для concurrency. `/api/auth/me`, права, роли,
schema и остальные endpoints не менялись. Fixture готов для Frontend ADMIN-007
и независимого QA.

## Проверки

- `dotnet test backend/TkpApi.Tests --configuration Release`: 154 passed,
  0 failed/skipped.
- `dotnet build backend/TkpApi/TkpApi.csproj --configuration Release`:
  0 warnings / 0 errors.
- `git diff --check`: PASS; `fixture.json` прочитан `ConvertFrom-Json`.

## Ограничения

Автор не менял QA-тесты и не выполнял PostgreSQL/HTTP roundtrip: независимый QA
должен подтвердить сохранение и отсутствие частичной записи на реальной БД,
login старым/новым email, self-edit, case-only/duplicate/invalid/null/omitted,
401/403/404/409 и регрессии Identity. Frontend ADMIN-007 остаётся заблокирован
до фиксации PM и передачи этого fixture. Commit/push/merge не выполнялись.
