# Доска PM

Дата: 2026-09-22. PM: задача Codex «PM manager».
Источник статусов — сообщения исполнителей; завершение требует независимого QA.

| ID | Владелец | Статус | Контракт | Ветка | Следующий handoff |
|---|---|---|---|---|---|
| CORE-001 | Frontend | in progress: handoff получен, ждёт QA/PR | HTTP не меняется | codex/frontend/core-001-user-forms, 0d095d42 | независимые проверки QA |
| CORE-002 | QA | in progress: проверки приняты, ждёт PR/CI | HTTP не меняется | codex/qa/core-002-test-baseline, 49c21df4 | PR и штатные версии CI |
| CORE-003 | QA | ready: техническая база CORE-002 проверена | ci-v1 | назначена отдельная ветка QA | единый workflow и план очистки tracked artifacts |
| CORE-004 | PM | in progress | процесс; HTTP не меняется | codex/pm/core-004-coordination | решения, реестр и назначения; подтверждения команды |
| CORE-005 | Backend | in progress | runtime-config-v1 | codex/backend/core-005-runtime-config | backend-core-005 worktree; negative cases → QA |
| SEC-001 | Backend | blocked: CORE-005 handoff | auth-v2 | — | отдельная задача; не менять AuthExtensions одновременно |

## Передача результатов

Следующая frontend-задача: SEC-002, `auth-v2`, ready. Исправить предложение
анонимной регистрации в серверном LoginGate по уточнению ROADMAP/ADR-008.
Реальный API smoke ожидает backend fixture. Область не пересекается с CORE-005.

## Контакты и handoff

CORE-003: PM проверил и согласовал список QA `qa/core-003-tracked-artifacts.txt`:
16042 пути, только node_modules/ (15914), backend/TkpApi/bin/ (98),
backend/TkpApi/obj/ (30). Разрешены dry-run и `git rm -r --cached` ровно для
этих трёх каталогов; без force, удаления с диска и переписывания истории.
QA сравнивает staged deletions со списком и подтверждает наличие локальных
каталогов. Workflow просмотрен PM; фактический GitHub Actions run и branch
protection ещё не подтверждены. Это согласование плана, не приёмка результата.

Frontend developer: `01a0ca37-b2cf-7461-b3d0-008ff133cd0f`.
Backend developer: `01a0ca37-66ff-7f62-9c84-d47738886e31`.
QA engineer: `01a0ca39-0d43-7082-8714-a198f97acc92`.
PM manager: `01a0ca40-f569-7630-b660-708190bd34e8`.

Каждый handoff содержит ID, SHA, worktree, изменённые пути, версии контрактов,
команды и результаты, миграцию/откат, ограничения и следующий адресат.
Дефект QA: воспроизведение, expected/actual, серьёзность, SHA и владелец.
PM передаёт дефект владельцу, исправление возвращает QA на том же SHA.
Не принимать «тесты прошли» из другой ветки как доказательство интеграции.

## Текущие блокеры выпуска

Обновление 2026-09-23: QA сообщил выполнение согласованной очистки индекса
16042 путей с точным сравнением списка и сохранением локальных каталогов;
PM независимо подтвердил число staged deletions. Дополнительно PM проверил
пять tracked dist-файлов (index.html и vendor-core/other/recharts/xlsx assets)
и согласовал dry-run, затем `git rm -r --cached -- dist`, без force/удаления
с диска. Ожидаемый итог очистки артефактов — 16047 путей; результат ещё ждёт QA.

Snapshots Frontend и Backend показывают остановку из-за usage limit, а не
провала тестов. Frontend сообщил успешные проверки SEC-002, но завершённый
handoff/SHA пока не получен. PM однократно запросил продолжение обоих агентов
с текущего состояния и передачу QA. Релизные gates остаются открытыми.

Финальный QA handoff CORE-002: commit 49c21df4 поверх cherry-pick CORE-001
9ba1def4 (исходный 0d095d42). Независимо: typecheck успешен, 76/76 frontend
тестов, frontend build успешен, backend 57/57 и Release build успешны.
QA использовал Node 24.19.0/npm 11.17.0/SDK 10.0.400 с target net8.0;
Node 22/SDK 8 в CI ещё не проверены. Чистая установка была до интеграции,
CORE-001 зависимостей не меняет. Ручные формы подтверждены автором, не QA.
PM принимает техническую базу для начала CORE-003; формальный done и merge
не объявлены без PR/CI. Следующий шаг QA — workflow и план очистки индекса.
Инвентаризация QA: 15914 tracked node_modules, 98 bin, 30 obj; исключены из
индекса QA-ветки, не приняты в основную ветку.

Frontend передал 0d095d42: 3 production-файла, успешные typecheck/build и
71 Vitest test прямой командой; ручные локальные формы в двух темах проверены.
`npm test` отсутствует до CORE-002; реальный API не проверялся. Есть warning
о circular vendor chunks; QA должен оценить его отдельно от исправления типов.
Статус review по ROADMAP требует PR, которого пока нет.

Backend подтвердил получение ADR-006a и начало CORE-005. Предложенные параметры
runtime-config-v1: ConnectionStrings__Tkp, Jwt__Key/Issuer/Audience/ExpireMinutes,
Cors__AllowedOrigins__0..., AllowedHosts, Swagger__Enabled,
Admin__Enabled/Email/Password. Точные defaults и validation — в backend handoff.

- Анонимная регистрация принимает роль admin: подтверждено PM чтением
  `backend/TkpApi/AuthExtensions.cs`; нужен SEC-001 и независимый тест.
- Backend сообщил 57 успешных тестов и успешную Release-сборку; это baseline,
  не доказательство безопасности регистрации или готовности production.
- CORE-001/002/003 ещё не приняты; два CI workflow и tracked build artifacts.
- Нет подтверждённого целевого сервера, домена и готового release pipeline.
- Docker и изоляция клиентов — план, не реализованная возможность.

## Внешний релиз

PM отвечает за критерии и разрешение релиза; QA владеет CI и доказательствами;
Backend — runtime, миграциями и серверным контейнером; Frontend — web-сборкой.
Последовательность и задачи: [ROADMAP](ROADMAP.md),
[план эксплуатации](DEPLOYMENT_PLAN.md). Решения: [DECISIONS](DECISIONS.md).
