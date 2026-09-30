using Microsoft.EntityFrameworkCore;

namespace TkpApi.Services;

public static class CatalogRestoreService
{
    public static async Task<IResult> RestoreAsync(string id, TkpDbContext db, CancellationToken ct)
    {
        await using var transaction = await db.Database.BeginTransactionAsync(ct);
        // Serialize this infrequent administrative operation with all catalog writers.
        // The SKU index is case-sensitive; row locks alone cannot protect an absent
        // case-insensitive SKU from concurrent inserts through existing routes.
        await db.Database.ExecuteSqlRawAsync(
            "LOCK TABLE equipment_catalog, deleted_equipment IN SHARE ROW EXCLUSIVE MODE", ct);

        var snapshot = await db.DeletedEquipment.SingleOrDefaultAsync(x => x.Id == id, ct);
        if (snapshot is null)
            return await db.Equipment.AnyAsync(x => x.Id == id, ct)
                ? Results.NoContent()
                : Results.NotFound();

        var sku = snapshot.Sku.ToLower();
        if (await db.Equipment.AnyAsync(x => x.Id == id || x.Sku.ToLower() == sku, ct))
            return Results.Conflict();

        db.Equipment.Add(new Equipment
        {
            Id = snapshot.Id,
            Sku = snapshot.Sku,
            Name = snapshot.Name,
            Brand = snapshot.Brand,
            Category = snapshot.Category,
            Direction = snapshot.Direction,
            Unit = snapshot.Unit,
            Purchase = snapshot.Purchase,
            RatedCurrent = snapshot.RatedCurrent,
            Attrs = snapshot.Attrs
        });
        db.DeletedEquipment.Remove(snapshot);
        await db.SaveChangesAsync(ct);
        await transaction.CommitAsync(ct);
        return Results.NoContent();
    }
}