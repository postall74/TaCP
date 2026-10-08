# Backend continuity

- Thread: `01a0ca37-66ff-7f62-9c84-d47738886e31`.
- Reference main: `1edff933afe9f488f11137ffa9251bae6744c720`.
- Current assignment: confirm the proposed `CATALOG-001` defect on an isolated
  local test database without repository changes: existing catalog row PUT
  versus unknown-id PUT control.
- Candidate risk: `PUT /api/catalog/{id}` may track the entity returned by
  `FindAsync` and then attach another instance with the same key via `Update`.
  This is not an accepted task until expected/actual behavior is reproduced.
- Runtime blocker: RATE-001/OPS-001 still needs Docker Engine + Compose with
  PostgreSQL 17 for restart/recreate, named-volume persistence and two-tenant
  isolation. Local PostgreSQL 18 is insufficient and must not be repurposed.
- Required handoff: trigger, status/exception, base SHA, environment, minimal
  scope, compatibility, fixture and proposed acceptance criteria. Backend does
  not commit or push unless PM assigns an accepted task.
- Next safe step after context loss: finish only the isolated reproduction;
  otherwise report the exact blocker and do not implement the candidate.

