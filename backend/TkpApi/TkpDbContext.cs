using Microsoft.AspNetCore.Identity.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore;

namespace TkpApi;

/* ============================================================
   КОНТЕКСТ EF CORE: схема PostgreSQL (см. DOCS.md).
   Наследуем IdentityDbContext<AppUser> — при EnsureCreated/миграциях
   создаются и таблицы Identity (AspNetUsers, AspNetRoles, AspNetUserRoles…),
   и наши доменные таблицы.

   Создание БД:  dotnet ef migrations add Init && dotnet ef database update
   ============================================================ */

public class TkpDbContext(DbContextOptions<TkpDbContext> options) : IdentityDbContext<AppUser>(options)
{
    public DbSet<Equipment> Equipment => Set<Equipment>();
    public DbSet<Project> Projects => Set<Project>();
    public DbSet<Cabinet> Cabinets => Set<Cabinet>();
    public DbSet<LineItem> Items => Set<LineItem>();
    public DbSet<ProjectVersion> Versions => Set<ProjectVersion>();
    public DbSet<CompanySettingsRow> CompanySettings => Set<CompanySettingsRow>();
    public DbSet<DeletedEquipment> DeletedEquipment => Set<DeletedEquipment>();
    public DbSet<CabinetTemplate> CabinetTemplates => Set<CabinetTemplate>();

    protected override void OnModelCreating(ModelBuilder mb)
    {
        // таблицы Identity (пользователи, роли, связи)
        base.OnModelCreating(mb);

        mb.Entity<Equipment>(e =>
        {
            e.ToTable("equipment_catalog");
            e.HasIndex(x => x.Sku).IsUnique();
            e.Property(x => x.Purchase).HasColumnType("numeric(12,2)");
            e.Property(x => x.RatedCurrent).HasColumnType("numeric(8,2)");
        });

        mb.Entity<Project>(p =>
        {
            p.ToTable("projects");
            p.HasIndex(x => x.Number).IsUnique();
            p.HasIndex(x => x.OwnerId); // фильтр «мои проекты»
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
            i.Property(x => x.Purchase).HasColumnType("numeric(12,2)");
        });

        mb.Entity<CompanySettingsRow>(s =>
        {
            s.ToTable("company_settings");
            s.HasIndex(x => x.UserId).IsUnique(); // одна строка реквизитов на пользователя
        });

        mb.Entity<DeletedEquipment>(d =>
        {
            d.ToTable("deleted_equipment");
            d.HasIndex(x => x.Sku);          // «воскрешение» при повторном добавлении артикула
            d.HasIndex(x => x.DeletedAt);    // чистка по истечении 90 дней
            d.Property(x => x.Purchase).HasColumnType("numeric(12,2)");
            d.Property(x => x.RatedCurrent).HasColumnType("numeric(8,2)");
        });

        mb.Entity<ProjectVersion>(v =>
        {
            v.ToTable("project_versions");
            v.Property(x => x.Snapshot).HasColumnType("jsonb");
        });
    }
}
