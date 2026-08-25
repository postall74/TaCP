using Microsoft.EntityFrameworkCore;

namespace TkpApi;

/* ============================================================
   КОНТЕКСТ EF CORE: схема PostgreSQL (см. DOCS.md, раздел 3).
   Создание БД:  dotnet ef migrations add Init && dotnet ef database update
   ============================================================ */

public class TkpDbContext(DbContextOptions<TkpDbContext> options) : DbContext(options)
{
    public DbSet<Equipment> Equipment => Set<Equipment>();
    public DbSet<Project> Projects => Set<Project>();
    public DbSet<Cabinet> Cabinets => Set<Cabinet>();
    public DbSet<LineItem> Items => Set<LineItem>();
    public DbSet<ProjectVersion> Versions => Set<ProjectVersion>();

    protected override void OnModelCreating(ModelBuilder mb)
    {
        mb.Entity<Equipment>(e =>
        {
            e.ToTable("equipment_catalog");
            e.HasIndex(x => x.Sku).IsUnique();
            e.Property(x => x.Purchase).HasColumnType("numeric(12,2)");
            e.Property(x => x.Price).HasColumnType("numeric(12,2)");
        });

        mb.Entity<Project>(p =>
        {
            p.ToTable("projects");
            p.HasIndex(x => x.Number).IsUnique();
            // cascade: проект удаляется вместе со шкафами и версиями
            p.HasMany(x => x.Cabinets).WithOne().OnDelete(DeleteBehavior.Cascade);
            p.HasMany(x => x.Versions).WithOne().OnDelete(DeleteBehavior.Cascade);
        });

        mb.Entity<Cabinet>(c =>
        {
            c.ToTable("project_cabinets");
            c.HasMany(x => x.Items).WithOne().OnDelete(DeleteBehavior.Cascade);
        });

        mb.Entity<LineItem>(i =>
        {
            i.ToTable("project_items");
            i.Property(x => x.Qty).HasColumnType("numeric(12,3)");
            i.Property(x => x.Price).HasColumnType("numeric(12,2)");
            i.Property(x => x.Purchase).HasColumnType("numeric(12,2)");
        });

        mb.Entity<ProjectVersion>(v =>
        {
            v.ToTable("project_versions");
            v.Property(x => x.Snapshot).HasColumnType("jsonb");
        });
    }
}
