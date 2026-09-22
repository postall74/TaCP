using System.Net.Mail;
using System.Security.Cryptography;
using System.Text;
using Npgsql;

namespace TkpApi;

public sealed class RuntimeConfigurationException(string message) : InvalidOperationException(message) { }

/// <summary>runtime-config-v1: validate before database access; never include secret values in errors.</summary>
public static class StartupConfiguration
{
    // Fingerprints of the retired demo credentials, not usable credentials.
    private static readonly HashSet<string> DemoHashes = new(StringComparer.Ordinal)
    {
        "F4410A582D72641C7AA4F8D879FC34397AA2EBDA2642183C47C43D022C09E7E1",
        "5F795BC3873F97BC4ED1E1CF4EE1706022F42D8AE011EBAAAFA6916F5EEE4608",
        "03AC674216F3E15C761EE1A5E255F067953623C8B388B4459E13F978D7C846F4",
    };

    public static void Validate(IConfiguration config, IHostEnvironment environment)
    {
        var errors = new List<string>();
        var connection = config.GetConnectionString("Tkp");
        if (string.IsNullOrWhiteSpace(connection))
            errors.Add("ConnectionStrings:Tkp is required");
        else
        {
            try
            {
                var db = new NpgsqlConnectionStringBuilder(connection);
                if (string.IsNullOrWhiteSpace(db.Host) || string.IsNullOrWhiteSpace(db.Database) ||
                    string.IsNullOrWhiteSpace(db.Username))
                    errors.Add("ConnectionStrings:Tkp must specify Host, Database and Username");
                if (!string.IsNullOrEmpty(db.Password) && IsDemo(db.Password))
                    errors.Add("ConnectionStrings:Tkp contains a retired demo password or placeholder");
            }
            catch (ArgumentException)
            {
                errors.Add("ConnectionStrings:Tkp is invalid");
            }
        }

        var key = config["Jwt:Key"];
        if (string.IsNullOrWhiteSpace(key) || Encoding.UTF8.GetByteCount(key) < 32 || IsDemo(key))
            errors.Add("Jwt:Key must be an externally supplied secret of at least 32 UTF-8 bytes, not a demo value");
        if (!int.TryParse(config["Jwt:ExpireMinutes"], out var minutes) || minutes <= 0 || minutes > 525600)
            errors.Add("Jwt:ExpireMinutes must be an integer between 1 and 525600");

        var origins = config.GetSection("Cors:AllowedOrigins").Get<string[]>() ?? [];
        if (origins.Any(origin => !IsOrigin(origin)))
            errors.Add("Cors:AllowedOrigins must contain HTTP(S) origins without paths, credentials or wildcards");
        if (!environment.IsDevelopment())
        {
            foreach (var name in new[] { "Jwt:Issuer", "Jwt:Audience" })
                if (string.IsNullOrWhiteSpace(config[name]) || IsDemo(config[name]!))
                    errors.Add($"{name} is required outside Development");
            if (origins.Length == 0)
                errors.Add("Cors:AllowedOrigins is required outside Development");
            var hosts = config["AllowedHosts"]?.Split(';', StringSplitOptions.TrimEntries);
            if (hosts is null || hosts.Length == 0 || hosts.Any(host =>
                    string.IsNullOrWhiteSpace(host) || host.Contains('*') || Uri.CheckHostName(host) == UriHostNameType.Unknown))
                errors.Add("AllowedHosts must contain explicit host names separated by semicolons outside Development");
        }

        ValidateBoolean(config, "Admin:Enabled", errors);
        ValidateBoolean(config, "Swagger:Enabled", errors);
        if (bool.TryParse(config["Admin:Enabled"], out var bootstrapEnabled) && bootstrapEnabled)
        {
            var email = config["Admin:Email"];
            if (string.IsNullOrWhiteSpace(email) || !MailAddress.TryCreate(email, out var parsed) || parsed.Address != email)
                errors.Add("Admin:Email must be an explicit email address when Admin:Enabled is true");
            var password = config["Admin:Password"];
            if (string.IsNullOrWhiteSpace(password) || password.Length < 6 || !password.Any(char.IsDigit) || IsDemo(password))
                errors.Add("Admin:Password must be an external non-demo password with at least 6 characters and a digit when Admin:Enabled is true");
        }

        if (errors.Count != 0)
            throw new RuntimeConfigurationException("Invalid runtime-config-v1 configuration: " + string.Join("; ", errors));
    }

    private static void ValidateBoolean(IConfiguration config, string name, List<string> errors)
    {
        if (config[name] is { } value && !bool.TryParse(value, out _))
            errors.Add($"{name} must be true or false");
    }

    private static bool IsDemo(string value) =>
        (value.StartsWith('<') && value.EndsWith('>')) ||
        value.Contains("CHANGE_ME", StringComparison.OrdinalIgnoreCase) ||
        value.Contains("REPLACE_ME", StringComparison.OrdinalIgnoreCase) ||
        DemoHashes.Contains(Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(value))));

    private static bool IsOrigin(string origin) =>
        !string.IsNullOrWhiteSpace(origin) && Uri.TryCreate(origin, UriKind.Absolute, out var uri) &&
        (uri.Scheme == Uri.UriSchemeHttp || uri.Scheme == Uri.UriSchemeHttps) &&
        !origin.Contains('*') && uri.UserInfo.Length == 0 &&
        string.Equals(origin, uri.GetLeftPart(UriPartial.Authority), StringComparison.OrdinalIgnoreCase);
}
