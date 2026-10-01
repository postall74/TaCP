using System.Security.Claims;
using Microsoft.EntityFrameworkCore;

namespace TkpApi.Services;

public static class UserDeleteService
{
    public static async Task<IResult> DeleteAsync(
        string id, ClaimsPrincipal actor, TkpDbContext db, CancellationToken ct)
    {
        var actorId = actor.FindFirstValue(ClaimTypes.NameIdentifier);
        if (actorId is null) return Results.Unauthorized();

        await using var transaction = await AdminInvariantTransaction.BeginAsync(db, ct);

        var user = await db.Users.SingleOrDefaultAsync(x => x.Id == id, ct);
        if (user is null) return Results.NotFound();
        if (id == actorId) return Results.Conflict();

        var admins = from membership in db.UserRoles
                     join role in db.Roles on membership.RoleId equals role.Id
                     where role.NormalizedName == "ADMIN"
                     select membership.UserId;
        if (await admins.AnyAsync(x => x == id, ct) &&
            !await admins.AnyAsync(x => x != id, ct))
            return Results.Conflict();

        // Only existing Identity FK cascades apply; project ownership is untouched.
        db.Users.Remove(user);
        await db.SaveChangesAsync(ct);
        await transaction.CommitAsync(ct);
        return Results.NoContent();
    }
}