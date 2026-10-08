# AUTH-TYPES-001 — QA-отчёт

Статус: **PASS**.

- Base: `1edff933afe9f488f11137ffa9251bae6744c720`
- Target: `28d5683323f530f4fbbc18189c87947c82136c17`
- QA branch: `codex/qa/auth-types-001`
- Production diff: `src/api/client.ts`, +10/-2.

Добавлен `src/api/client.test.ts` с двумя независимыми contract-сценариями:

- login request body и response `{ token, expiresAt: number, user: AuthUser }`,
  затем `/api/auth/me` с тем же Bearer;
- register request с `position: ""`, компактный response
  `{ id, email, fullName, role }`, затем `/api/auth/users`;
- для register и users подтверждено сохранение `Authorization: Bearer jwt-admin`;
- trailing slash base нормализуется без двойного `/`.

| Проверка | Результат |
|---|---|
| адресный Vitest | PASS, 2/2 |
| `npm run typecheck` | PASS |
| полный Vitest | PASS, 87/87, 10 файлов |
| `npm run build` | PASS, 2011 модулей |

Build сохранил известное предупреждение circular vendor chunks. `npm ci` сообщил
5 advisory (3 moderate, 2 high); зависимости не менялись. Продуктовых дефектов
по критериям AUTH-TYPES-001 нет. Target рекомендован к приёмке.
