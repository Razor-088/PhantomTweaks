; Custom uninstall macro for PhantomTweaks
; Cleans up license data and user data directory on uninstall

!macro customUnInit
  ; No custom init needed
!macroend

!macro customUnInstall
  ; Remove license file and all user data
  ; %APPDATA%\PhantomTweaks\ contains: license.json, settings.json, logs, profiles, etc.
  RMDir /r "$APPDATA\PhantomTweaks"
  
  ; Also try the home directory fallback (in case userData was set differently)
  RMDir /r "$PROFILE\PhantomTweaks"
!macroend
