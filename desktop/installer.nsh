!macro customUnInstall
  MessageBox MB_YESNO|MB_ICONQUESTION "Remove all Connect CalAIM Desktop data and legacy components?" IDYES removeData IDNO done
  removeData:
    RMDir /r "$APPDATA\Connect CalAIM Desktop"
    RMDir /r "$LOCALAPPDATA\Connect CalAIM Desktop"
    RMDir /r "$APPDATA\Connect CalAIM"
    RMDir /r "$LOCALAPPDATA\Connect CalAIM"
  done:
!macroend
