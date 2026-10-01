using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Storage;

namespace TkpApi.Services;

public static class AdminInvariantTransaction
{
    public static async Task<IDbContextTransaction> BeginAsync(TkpDbContext db, CancellationToken ct)
    {
        var transaction = await db.Database.BeginTransactionAsync(ct);
        try
        {
            // Both role changes and deletion acquire these locks before reading
            // users or roles, including requests handled by other API processes.
            await db.Database.ExecuteSqlRawAsync(
                "LOCK TABLE \"AspNetUsers\", \"AspNetRoles\", \"AspNetUserRoles\" IN SHARE ROW EXCLUSIVE MODE", ct);
            return transaction;
        }
        catch
        {
            await transaction.DisposeAsync();
            throw;
        }
    }
}