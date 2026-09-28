using System;
using System.Diagnostics;
using System.IO;
using System.Reflection;
using System.Text;
using System.Windows.Forms;

[assembly: AssemblyTitle("学术派")]
[assembly: AssemblyProduct("Insight")]
[assembly: AssemblyCompany("Insight")]

internal static class InsightLauncher
{
    [STAThread]
    private static void Main(string[] args)
    {
        string executable = Path.Combine(AppDomain.CurrentDomain.BaseDirectory, "runtime", "Insight.exe");
        if (!File.Exists(executable))
        {
            MessageBox.Show("运行组件缺失。请完整解压 Insight 压缩包后再启动。", "学术派", MessageBoxButtons.OK, MessageBoxIcon.Error);
            return;
        }

        var launch = new ProcessStartInfo(executable);
        launch.WorkingDirectory = Path.GetDirectoryName(executable);
        launch.UseShellExecute = true;
        launch.Arguments = JoinArguments(args);
        try { Process.Start(launch); }
        catch (Exception error)
        {
            MessageBox.Show("启动学术派失败：" + error.Message, "学术派", MessageBoxButtons.OK, MessageBoxIcon.Error);
        }
    }

    private static string JoinArguments(string[] args)
    {
        var result = new StringBuilder();
        foreach (string arg in args)
        {
            if (result.Length > 0) result.Append(' ');
            result.Append('"');
            int slashes = 0;
            foreach (char character in arg)
            {
                if (character == '\\') { slashes++; continue; }
                if (character == '"')
                {
                    result.Append('\\', slashes * 2 + 1);
                    result.Append('"');
                    slashes = 0;
                    continue;
                }
                result.Append('\\', slashes);
                slashes = 0;
                result.Append(character);
            }
            result.Append('\\', slashes * 2);
            result.Append('"');
        }
        return result.ToString();
    }
}
