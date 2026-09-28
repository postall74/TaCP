using System.Diagnostics;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.FileProviders;
using Microsoft.Extensions.Hosting;
using TkpApi;
using Xunit;

namespace TkpApi.Tests;

public class StartupConfigurationTests
{
    private sealed class Host(string name) : IHostEnvironment
    {
        public string EnvironmentName { get; set; } = name;
        public string ApplicationName { get; set; } = "QA";
        public string ContentRootPath { get; set; } = AppContext.BaseDirectory;
        public IFileProvider ContentRootFileProvider { get; set; } = new NullFileProvider();
    }

    private static Dictionary<string, string?> Valid() => new()
    {
        ["ConnectionStrings:Tkp"] = "Host=127.0.0.1;Database=qa_only;Username=qa",
        ["Jwt:Key"] = new string('Q', 32),
        ["Jwt:ExpireMinutes"] = "480",
        ["Jwt:Issuer"] = "qa-issuer",
        ["Jwt:Audience"] = "qa-audience",
        ["AllowedHosts"] = "localhost;127.0.0.1",
        ["Cors:AllowedOrigins:0"] = "http://localhost:5187",
    };

    private static void Validate(Dictionary<string, string?> values, string env = "Production") =>
        StartupConfiguration.Validate(new ConfigurationBuilder().AddInMemoryCollection(values).Build(), new Host(env));

    [Theory]
    [InlineData("Production")]
    [InlineData("Staging")]
    [InlineData("Development")]
    public void ValidConfigurationDoesNotRequireBootstrapOrDatabasePassword(string env) => Validate(Valid(), env);

    [Theory]
    [InlineData("ConnectionStrings:Tkp", null)]
    [InlineData("ConnectionStrings:Tkp", "Host=localhost;Username=qa")]
    [InlineData("ConnectionStrings:Tkp", "not-a-connection-string")]
    [InlineData("Jwt:Key", null)]
    [InlineData("Jwt:Key", "short")]
    [InlineData("Jwt:Key", "CHANGE_ME_to_a_key_that_is_long_enough")]
    [InlineData("Jwt:ExpireMinutes", "0")]
    [InlineData("Jwt:ExpireMinutes", "525601")]
    [InlineData("Jwt:ExpireMinutes", "1.5")]
    [InlineData("Jwt:Issuer", null)]
    [InlineData("Jwt:Audience", " ")]
    [InlineData("AllowedHosts", "*")]
    [InlineData("AllowedHosts", "https://localhost")]
    [InlineData("AllowedHosts", "localhost:5187")]
    [InlineData("Cors:AllowedOrigins:0", null)]
    [InlineData("Cors:AllowedOrigins:0", "https://example.test/")]
    [InlineData("Cors:AllowedOrigins:0", "https://example.test/path")]
    [InlineData("Cors:AllowedOrigins:0", "https://*.example.test")]
    [InlineData("Cors:AllowedOrigins:0", "https://user:secret@example.test")]
    [InlineData("Cors:AllowedOrigins:0", "https://example.test?query=1")]
    [InlineData("Cors:AllowedOrigins:0", "file:///tmp")]
    [InlineData("Admin:Enabled", "yes")]
    [InlineData("Swagger:Enabled", "yes")]
    public void InvalidConfigurationIsRejectedWithParameterName(string name, string? value)
    {
        var config = Valid();
        config[name] = value;
        var error = Assert.Throws<RuntimeConfigurationException>(() => Validate(config));
        Assert.Contains(name.StartsWith("Cors:") ? "Cors:AllowedOrigins" : name, error.Message);
        if (!string.IsNullOrEmpty(config["Jwt:Key"])) Assert.DoesNotContain(config["Jwt:Key"]!, error.Message);
    }

    [Theory]
    [InlineData("1")]
    [InlineData("525600")]
    public void TokenLifetimeBoundariesAreAccepted(string minutes)
    {
        var config = Valid(); config["Jwt:ExpireMinutes"] = minutes; Validate(config);
    }

    [Fact]
    public void KeyLengthIsMeasuredInUtf8Bytes()
    {
        var config = Valid(); config["Jwt:Key"] = new string('Ж', 16); Validate(config);
        config["Jwt:Key"] = new string('Ж', 15);
        Assert.Throws<RuntimeConfigurationException>(() => Validate(config));
    }

    [Fact]
    public void DevelopmentMayOmitProductionOnlySettingsButNotSecrets()
    {
        var config = Valid();
        foreach (var name in new[] { "Jwt:Issuer", "Jwt:Audience", "AllowedHosts", "Cors:AllowedOrigins:0" }) config.Remove(name);
        Validate(config, "Development");
        config.Remove("Jwt:Key");
        Assert.Throws<RuntimeConfigurationException>(() => Validate(config, "Development"));
    }

    [Theory]
    [InlineData(null, "Strong123!")]
    [InlineData("invalid", "Strong123!")]
    [InlineData("qa@example.test", null)]
    [InlineData("qa@example.test", "abc12")]
    [InlineData("qa@example.test", "abcdef")]
    [InlineData("qa@example.test", "REPLACE_ME_123")]
    public void EnabledBootstrapRejectsMissingOrInvalidCredentials(string? email, string? password)
    {
        var config = Valid(); config["Admin:Enabled"] = " true ";
        config["Admin:Email"] = email; config["Admin:Password"] = password;
        Assert.Throws<RuntimeConfigurationException>(() => Validate(config));
    }

    [Fact]
    public void BootstrapIsOptInAndAcceptsExplicitValidCredentials()
    {
        var config = Valid(); config["Admin:Enabled"] = "false"; Validate(config);
        config["Admin:Enabled"] = "true"; config["Admin:Email"] = "qa@example.test";
        config["Admin:Password"] = "SyntheticOnly123!"; Validate(config);
    }

    [Theory]
    [InlineData("Production")]
    [InlineData("Development")]
    public async Task InvalidStartupExitsCleanlyBeforeDatabaseAccess(string environment)
    {
        var info = new ProcessStartInfo("dotnet")
        {
            WorkingDirectory = AppContext.BaseDirectory, UseShellExecute = false,
            RedirectStandardError = true, RedirectStandardOutput = true, CreateNoWindow = true,
        };
        info.ArgumentList.Add(Path.Combine(AppContext.BaseDirectory, "TkpApi.dll"));
        foreach (var key in info.Environment.Keys.ToArray())
            if (key.StartsWith("Jwt", StringComparison.OrdinalIgnoreCase) || key.StartsWith("ConnectionStrings", StringComparison.OrdinalIgnoreCase) || key.StartsWith("Admin", StringComparison.OrdinalIgnoreCase)) info.Environment.Remove(key);
        info.Environment["DOTNET_ENVIRONMENT"] = environment;
        info.Environment["ASPNETCORE_ENVIRONMENT"] = environment;
        info.Environment["ConnectionStrings__Tkp"] = "Host=127.0.0.1;Port=1;Database=qa_only;Username=qa;Timeout=30;Password=QaSentinelSecret789";
        info.Environment["Jwt__Key"] = "QaShortKey";
        using var process = Process.Start(info)!;
        var stdout = process.StandardOutput.ReadToEndAsync();
        var stderr = process.StandardError.ReadToEndAsync();
        using var timeout = new CancellationTokenSource(TimeSpan.FromSeconds(15));
        try { await process.WaitForExitAsync(timeout.Token); }
        finally { if (!process.HasExited) process.Kill(entireProcessTree: true); }
        var error = await stderr; var output = await stdout;
        Assert.Equal(1, process.ExitCode);
        Assert.Contains("Invalid runtime-config-v1 configuration", error);
        Assert.Contains("Jwt:Key", error);
        Assert.DoesNotContain("QaSentinelSecret789", error + output);
        Assert.DoesNotContain("QaShortKey", error + output);
        Assert.DoesNotContain("Unhandled exception", error + output);
        Assert.DoesNotContain("NpgsqlException", error + output);
        Assert.DoesNotContain("Now listening", error + output);
    }
}

