using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace TkpApi.Migrations
{
    /// <inheritdoc />
    public partial class AddCabinetDoorGeometry : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "door_geometry",
                table: "project_cabinets",
                type: "jsonb",
                nullable: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "door_geometry",
                table: "project_cabinets");
        }
    }
}
