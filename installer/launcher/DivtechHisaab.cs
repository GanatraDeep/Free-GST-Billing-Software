// Divtech Hisaab - the program the Desktop and Start-menu icons open
// ("Divtech Hisaab.exe", installed by Divtech-Hisaab-Setup.exe).
//
// It starts the app's local server with the Node.js that ships inside the app
// folder (_system\node\node.exe), waits for it to answer, and opens the app in
// an Edge app window (no tabs or address bar), else the default browser. If
// the server is already running it only opens the window.
//
// It replaces the PowerShell scripts the ZIP version starts the app with, which
// antivirus programs (Bitdefender) block as a "script launched with execution
// policy bypass" pattern. Built with the .NET Framework compiler that comes
// with Windows (see .github/workflows/release.yml); no extra runtime needed.
using System;
using System.Diagnostics;
using System.IO;
using System.Net;
using System.Text;
using System.Threading;
using System.Windows.Forms;

internal static class DivtechHisaab
{
    private const int DefaultPort = 47371;
    private const string Help = "WhatsApp / call Divtech: +91 94299 11067\nEmail: hello@divtech.in";

    [STAThread]
    private static int Main()
    {
        string root = AppDomain.CurrentDomain.BaseDirectory.TrimEnd('\\');
        string sys = Path.Combine(root, "_system");
        string serverJs = Path.Combine(sys, "server.js");
        if (!File.Exists(serverJs))
        {
            Fail("The app files are missing from\n" + sys + "\n\nRun Divtech-Hisaab-Setup.exe again to repair it.");
            return 1;
        }

        // One start at a time for this folder (a double click starts two).
        bool first;
        using (var mutex = new Mutex(true, "Local\\DivtechHisaab-" + Hash(root), out first))
        {
            if (!first)
            {
                // Another start is under way: wait for it, then just open the app.
                try { mutex.WaitOne(TimeSpan.FromSeconds(60)); }
                catch (AbandonedMutexException) { }
            }
            try
            {
                return Run(sys, serverJs);
            }
            finally
            {
                try { mutex.ReleaseMutex(); } catch (ApplicationException) { }
            }
        }
    }

    private static int Run(string sys, string serverJs)
    {
        int port = ReadPort(sys);
        if (IsOurServer(port))
        {
            OpenApp(port);
            return 0;
        }

        string node = Path.Combine(sys, "node", "node.exe");
        if (!File.Exists(node))
        {
            Fail("Node.js is missing from\n" + Path.GetDirectoryName(node) + "\n\nRun Divtech-Hisaab-Setup.exe again to repair it.");
            return 1;
        }

        Process server;
        try
        {
            var psi = new ProcessStartInfo(node, "\"" + serverJs + "\"")
            {
                WorkingDirectory = sys,
                UseShellExecute = false,
                CreateNoWindow = true,
                WindowStyle = ProcessWindowStyle.Hidden,
            };
            server = Process.Start(psi);
        }
        catch (Exception e)
        {
            Fail("Divtech Hisaab could not start:\n" + e.Message);
            return 1;
        }

        // The server picks the port and writes it to data\port.txt; the first
        // start after an install or update can take a while on a slow PC.
        DateTime until = DateTime.Now.AddSeconds(90);
        while (DateTime.Now < until)
        {
            if (server.HasExited)
            {
                Fail("Divtech Hisaab stopped while starting (code " + server.ExitCode + ").\n\nDetails are in\n"
                    + Path.Combine(sys, "data", "errors.log"));
                return 1;
            }
            port = ReadPort(sys);
            if (IsOurServer(port))
            {
                OpenApp(port);
                return 0;
            }
            Thread.Sleep(700);
        }
        Fail("Divtech Hisaab did not answer after 90 seconds.\n\nRestart the computer and try again. If it happens again, send Divtech the file\n"
            + Path.Combine(sys, "data", "errors.log"));
        return 1;
    }

    private static int ReadPort(string sys)
    {
        try
        {
            string text = File.ReadAllText(Path.Combine(Path.Combine(sys, "data"), "port.txt")).Trim();
            int p;
            if (int.TryParse(text, out p) && p >= 1024 && p <= 65535) return p;
        }
        catch (IOException) { }
        catch (UnauthorizedAccessException) { }
        return DefaultPort;
    }

    // Is it Divtech Hisaab answering on that port (not some other program)?
    private static bool IsOurServer(int port)
    {
        try
        {
            var req = (HttpWebRequest)WebRequest.Create("http://127.0.0.1:" + port + "/api/health");
            req.Timeout = 2000;
            req.ReadWriteTimeout = 2000;
            req.Proxy = null;
            using (var resp = (HttpWebResponse)req.GetResponse())
            using (var reader = new StreamReader(resp.GetResponseStream(), Encoding.UTF8))
            {
                return resp.StatusCode == HttpStatusCode.OK && reader.ReadToEnd().Contains("\"ok\":true");
            }
        }
        catch (WebException) { return false; }
        catch (IOException) { return false; }
    }

    private static void OpenApp(int port)
    {
        string url = "http://localhost:" + port + "/";
        string[] bases =
        {
            Environment.GetEnvironmentVariable("ProgramFiles(x86)"),
            Environment.GetEnvironmentVariable("ProgramFiles"),
            Environment.GetEnvironmentVariable("LOCALAPPDATA"),
        };
        foreach (string b in bases)
        {
            if (string.IsNullOrEmpty(b)) continue;
            string edge = Path.Combine(b, "Microsoft\\Edge\\Application\\msedge.exe");
            if (!File.Exists(edge)) continue;
            try
            {
                Process.Start(new ProcessStartInfo(edge, "--app=" + url) { UseShellExecute = false });
                return;
            }
            catch (Exception) { }
        }
        try { Process.Start(new ProcessStartInfo(url) { UseShellExecute = true }); }
        catch (Exception e) { Fail("Open " + url + " in your browser.\n(" + e.Message + ")"); }
    }

    private static void Fail(string message)
    {
        MessageBox.Show(message + "\n\n" + Help, "Divtech Hisaab", MessageBoxButtons.OK, MessageBoxIcon.Warning);
    }

    private static string Hash(string s)
    {
        uint h = 2166136261;
        foreach (char c in s.ToLowerInvariant()) { h ^= c; h *= 16777619; }
        return h.ToString("x8");
    }
}
