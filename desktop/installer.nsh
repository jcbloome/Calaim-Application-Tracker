!macro customInit
  ; Force-close running app/tray instances so NSIS update does not get blocked.
  nsExec::ExecToLog 'taskkill /F /IM "Connect CalAIM Desktop.exe"'
  nsExec::ExecToLog 'taskkill /F /IM "Connect-CalAIM-Desktop.exe"'
  nsExec::ExecToLog 'taskkill /F /IM "calaim-desktop.exe"'
  Sleep 700
!macroend

!macro customInstall
  ; Run a second close pass right before install file operations.
  nsExec::ExecToLog 'taskkill /F /IM "Connect CalAIM Desktop.exe"'
  nsExec::ExecToLog 'taskkill /F /IM "Connect-CalAIM-Desktop.exe"'
  nsExec::ExecToLog 'taskkill /F /IM "calaim-desktop.exe"'
  Sleep 400
!macroend

!macro customUnInstall
  MessageBox MB_YESNO|MB_ICONQUESTION "Remove all Connect CalAIM Desktop data and legacy components?" IDYES removeData IDNO done
  removeData:
    RMDir /r "$APPDATA\Connect CalAIM Desktop"
    RMDir /r "$LOCALAPPDATA\Connect CalAIM Desktop"
    RMDir /r "$APPDATA\Connect CalAIM"
    RMDir /r "$LOCALAPPDATA\Connect CalAIM"
  done:
!macroend
