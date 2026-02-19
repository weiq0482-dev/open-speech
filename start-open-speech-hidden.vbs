' Open-Speech 隐藏启动器 - 用于开机自启（不弹出黑窗口）
Set WshShell = CreateObject("WScript.Shell")
WshShell.Run """" & Replace(WScript.ScriptFullName, "start-open-speech-hidden.vbs", "start-open-speech.bat") & """", 0, False
Set WshShell = Nothing
