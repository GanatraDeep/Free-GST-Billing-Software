; Divtech Hisaab - Windows installer (Inno Setup 6).
; Built by .github/workflows/release.yml on a Windows runner:
;   iscc /DAppVersion=1.11.1 /DSourceDir=<extracted Divtech-Hisaab> /DLauncherExe=<Divtech Hisaab.exe> installer\divtech-hisaab.iss
;
; - Installs for the current user, no administrator rights; any folder or drive.
; - Ships Node.js inside the app (_system\node), so nothing is downloaded and
;   no PowerShell script runs: the icons open "Divtech Hisaab.exe".
; - Installing over an existing copy updates it. The data folder
;   (_system\data) is never part of the installer and is kept on uninstall.

#ifndef AppVersion
  #define AppVersion "0.0.0"
#endif
#ifndef SourceDir
  #define SourceDir "..\release-build\Divtech-Hisaab"
#endif
#ifndef LauncherExe
  #define LauncherExe "..\release-build\Divtech Hisaab.exe"
#endif

[Setup]
AppId={{6E3B9A52-4C1D-4F8E-9B7A-2D5C8E1F0A93}
AppName=Divtech Hisaab
AppVersion={#AppVersion}
AppVerName=Divtech Hisaab {#AppVersion}
AppPublisher=Divtech
AppPublisherURL=https://divtech.in
AppSupportURL=https://divtech.in
AppContact=hello@divtech.in
VersionInfoVersion={#AppVersion}
VersionInfoCompany=Divtech
VersionInfoDescription=Divtech Hisaab Setup
VersionInfoProductName=Divtech Hisaab
DefaultDirName={autopf}\Divtech Hisaab
UsePreviousAppDir=yes
DisableDirPage=no
DisableProgramGroupPage=yes
PrivilegesRequired=lowest
ArchitecturesAllowed=x64compatible
ArchitecturesInstallIn64BitMode=x64compatible
OutputDir=..\release-build
OutputBaseFilename=Divtech-Hisaab-Setup-v{#AppVersion}
SetupIconFile={#SourceDir}\_system\app-icon.ico
UninstallDisplayIcon={app}\Divtech Hisaab.exe
UninstallDisplayName=Divtech Hisaab
WizardStyle=modern
Compression=lzma2
SolidCompression=yes
CloseApplications=force
RestartApplications=no

[Messages]
SelectDirDesc=Where should Divtech Hisaab be installed? Your invoices and data are kept in this folder too.

[InstallDelete]
; Launchers of the ZIP version, if this folder held one: the icons now open
; Divtech Hisaab.exe.
Type: files; Name: "{app}\Divtech Hisaab - WINDOWS.hta"
Type: files; Name: "{app}\Divtech Hisaab - MAC.command"
Type: files; Name: "{app}\Divtech Hisaab - LINUX.sh"

[Files]
Source: "{#SourceDir}\_system\*"; DestDir: "{app}\_system"; Excludes: "\data\*"; Flags: recursesubdirs createallsubdirs ignoreversion
Source: "{#LauncherExe}"; DestDir: "{app}"; DestName: "Divtech Hisaab.exe"; Flags: ignoreversion

[Dirs]
Name: "{app}\_system\data"; Flags: uninsneveruninstall

[INI]
; Marks a Setup install (server.js: SETUP_INSTALL).
Filename: "{app}\_system\installed-by-setup.txt"; Section: "DivtechHisaab"; Key: "Version"; String: "{#AppVersion}"

[Icons]
Name: "{autodesktop}\Divtech Hisaab"; Filename: "{app}\Divtech Hisaab.exe"; WorkingDir: "{app}"
Name: "{autoprograms}\Divtech Hisaab"; Filename: "{app}\Divtech Hisaab.exe"; WorkingDir: "{app}"

[Run]
Filename: "{app}\Divtech Hisaab.exe"; Description: "Open Divtech Hisaab"; Flags: nowait postinstall
