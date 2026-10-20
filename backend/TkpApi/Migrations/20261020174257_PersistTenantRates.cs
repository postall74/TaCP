using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace TkpApi.Migrations
{
    /// <inheritdoc />
    public partial class PersistTenantRates : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "rate_cards",
                columns: table => new
                {
                    Id = table.Column<int>(type: "integer", nullable: false),
                    Design = table.Column<decimal>(type: "numeric", nullable: false),
                    Production = table.Column<decimal>(type: "numeric", nullable: false),
                    Software = table.Column<decimal>(type: "numeric", nullable: false),
                    Smr = table.Column<decimal>(type: "numeric", nullable: false),
                    Pnr = table.Column<decimal>(type: "numeric", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_rate_cards", x => x.Id);
                    table.CheckConstraint("CK_rate_cards_singleton", "\"Id\" = 1");
                });

            migrationBuilder.InsertData(
                table: "rate_cards",
                columns: new[] { "Id", "Design", "Pnr", "Production", "Smr", "Software" },
                values: new object[] { 1, 1800m, 1800m, 1800m, 1800m, 2200m });
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "rate_cards");
        }
    }
}
