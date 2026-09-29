namespace TkpApi;

// Persistence only: the public Rates DTO remains unchanged.
public sealed class RatesRow
{
    public int Id { get; set; } = 1;
    public decimal Design { get; set; }
    public decimal Production { get; set; }
    public decimal Software { get; set; }
    public decimal Smr { get; set; }
    public decimal Pnr { get; set; }
}
