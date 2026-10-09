using TkpApi;
using Xunit;

namespace TkpApi.Tests;

public class CabinetItemQuantityTests
{
    [Theory]
    [InlineData("0", false)]
    [InlineData("-0.001", false)]
    [InlineData("-10", false)]
    [InlineData("0.001", true)]
    [InlineData("1.5", true)]
    public void IsValid_RequiresPositiveDecimal(string raw, bool expected)
    {
        Assert.Equal(expected, CabinetItemQuantity.IsValid(decimal.Parse(raw,
            System.Globalization.CultureInfo.InvariantCulture)));
    }

    [Fact]
    public void InvalidDetail_IsStable()
    {
        Assert.Equal("Количество должно быть больше нуля", CabinetItemQuantity.InvalidDetail);
    }
}
