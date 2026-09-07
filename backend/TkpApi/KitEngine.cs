namespace TkpApi;

public record KitSystem(
    string Id, string Name, string Brand, string Mount, int Ip, string Note,
    int[] Heights, int[] Widths, int[] Depths, int MaxDoors, decimal K
);

public record KitInput(
    string SystemId, int H, int W, int D, int Doors,
    int Joined, bool Pedestal, int ExtraTraverses
);

public record KitLine(
    string Key, string Sku, string Name, int Qty, decimal Purchase, string Group
);

public static class KitEngine
{
    public static readonly KitSystem[] Systems = {
        new("cqen-floor", "CQE N", "DKC", "floor", 54, "Напольный, актуальное поколение (прежний CQE снят с производства)",
            new[]{1800, 2000, 2200}, new[]{600, 800, 1000, 1200}, new[]{400, 600, 800}, 2, 1m),
        new("cqen-wall", "CQE N", "DKC", "wall", 66, "Навесной, повышенная защита для уличной установки",
            new[]{400, 600, 800, 1000}, new[]{300, 400, 600, 800}, new[]{150, 200, 250, 300}, 1, 1m),
        new("provento", "PROVENTO ШРС", "EKF", "floor", 54, "Напольный модульной сборки — экономичная альтернатива",
            new[]{1800, 2000, 2200}, new[]{600, 800, 1000}, new[]{400, 600}, 2, 0.85m)
    };

    public static KitSystem FindSystem(string id) => Systems.FirstOrDefault(s => s.Id == id) ?? Systems[0];

    static int R10(decimal x) => (int)Math.Max(10, Math.Round(x / 10) * 10);

    public static List<KitLine> BuildKit(KitInput input)
    {
        var sys = FindSystem(input.SystemId);
        var n = Math.Max(1, Math.Min(6, input.Joined));
        var extra = Math.Max(0, Math.Min(20, input.ExtraTraverses));
        var k = sys.K;
        var tag = $"{sys.Name} {input.H}×{input.W}×{input.D}";
        var lines = new List<KitLine>();

        if (sys.Mount == "wall")
        {
            var corpus = R10((3600 + 2.2m * (input.H - 400) + 2.6m * (input.W - 300) + 1.4m * (input.D - 150)) * k);
            var side = R10((1050 + 1.3m * (input.H - 400) + 1.6m * (input.D - 150)) * k);
            var mount = R10((950 + 1.2m * (input.H - 400) + 1.4m * (input.W - 300)) * k);
            var door = R10((1500 + 1.5m * (input.H - 400) + 1.8m * (input.W - 300)) * k);
            var joint = R10((900 + 1.1m * (input.W - 300) + 0.8m * (input.D - 150)) * k);

            lines.Add(new($"wall-{input.H}-{input.W}-{input.D}", $"{sys.Name} КОРПУС {input.H}×{input.W}×{input.D}", $"Корпус {tag} (рама + задняя стенка), IP{sys.Ip}", n, corpus, "frame"));
            lines.Add(new($"side-{input.H}-{input.D}", $"{sys.Name} ПБ {input.H}×{input.D}", $"Панель боковая {tag}", n + 1, side, "skin"));
            lines.Add(new($"mount-{input.H}-{input.W}", $"{sys.Name} МП {input.H}×{input.W}", $"Панель монтажная {tag}", n, mount, "mount"));
            lines.Add(new($"door-{input.H}-{input.W}", $"{sys.Name} ДВ {input.H}×{input.W}", $"Дверь {tag}", n, door, "door"));
            if (n > 1) lines.Add(new($"joint-{input.W}-{input.D}", $"{sys.Name} СТЫК {input.W}", $"Комплект стыковой (соединение корпусов)", n - 1, joint, "joint"));
            return lines;
        }

        var p_frame = R10((8200 + 22m * (input.H - 1800)) * k);
        var p_roof = R10((2400 + 3.2m * (input.W - 600) + 2.1m * (input.D - 400)) * k);
        var p_base = R10((2900 + 3.4m * (input.W - 600) + 2.2m * (input.D - 400)) * k);
        var p_trav = R10((1150 + 1.9m * (input.W - 600)) * k);
        var p_side = R10((1900 + 1.6m * (input.H - 1800) + 2.4m * (input.D - 400)) * k);
        var p_mount = R10((1700 + 1.5m * (input.H - 1800) + 1.8m * (input.W - 600)) * k);
        var p_door = R10((3200 + 1.7m * (input.H - 1800) + 2.0m * (input.W - 600)) * k);
        var p_ped = R10((1900 + 2.0m * (input.W - 600) + 1.5m * (input.D - 400)) * k);
        var p_joint = R10((1400 + 1.6m * (input.W - 600) + 1.2m * (input.D - 400)) * k);

        lines.Add(new($"frame-{input.H}", $"{sys.Name} КАРКАС {input.H}", $"Каркас (4 стойки) {tag}", n, p_frame, "frame"));
        lines.Add(new($"roof-{input.W}-{input.D}", $"{sys.Name} КРЫША {input.W}×{input.D}", $"Крыша {tag}", n, p_roof, "frame"));
        lines.Add(new($"base-{input.W}-{input.D}", $"{sys.Name} ДНО {input.W}×{input.D}", $"Основание с кабельным вводом {tag}", n, p_base, "frame"));
        lines.Add(new($"trav-{input.W}", $"{sys.Name} ТРАВЕРСА {input.W}", $"Траверса монтажная {tag}", 2 * n, p_trav, "frame"));
        if (extra > 0) lines.Add(new($"trav-x-{input.W}", $"{sys.Name} ТРАВЕРСА {input.W} (доп.)", $"Траверса монтажная (дополнительная) {tag}", extra, p_trav, "frame"));
        lines.Add(new($"side-{input.H}-{input.D}", $"{sys.Name} ПБ {input.H}×{input.D}", $"Панель боковая {tag}", n + 1, p_side, "skin"));
        lines.Add(new($"mount-{input.H}-{input.W}", $"{sys.Name} МП {input.H}×{input.W}", $"Панель монтажная {tag}", n, p_mount, "mount"));
        var doors = Math.Max(1, Math.Min(sys.MaxDoors, input.Doors));
        lines.Add(new($"door-{input.H}-{input.W}", $"{sys.Name} ДВ {input.H}×{input.W}", $"Дверь {tag}", n * doors, p_door, "door"));
        if (input.Pedestal) lines.Add(new($"ped-{input.W}-{input.D}", $"{sys.Name} ЦОКОЛЬ {input.W}×{input.D}", $"Цоколь 100 мм {tag}", n, p_ped, "base"));
        if (n > 1) lines.Add(new($"joint-{input.W}-{input.D}", $"{sys.Name} СТЫК {input.W}", $"Комплект стыковой (соединение корпусов)", n - 1, p_joint, "joint"));
        return lines;
    }

    public static decimal KitAssemblyHours(KitInput input)
    {
        var sys = FindSystem(input.SystemId);
        var n = Math.Max(1, Math.Min(6, input.Joined));
        var doors = sys.Mount == "wall" ? n : n * Math.Max(1, Math.Min(sys.MaxDoors, input.Doors));
        var per = sys.Mount == "wall" ? 1.5m : 3.5m;
        var h = per * n + (n + 1) * 0.3m + doors * 0.4m + (input.Pedestal ? n * 0.3m : 0) + (n > 1 ? (n - 1) * 0.3m : 0) + Math.Max(0, input.ExtraTraverses) * 0.15m;
        return Math.Round(h * 2) / 2;
    }
}
