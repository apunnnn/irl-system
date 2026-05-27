!macro customInstall
  ; 1. Ekstrak installer Tailscale dari dalam paket ke folder sementara Windows
  File "/oname=$PLUGINSDIR\tailscale-setup.exe" "${BUILD_RESOURCES_DIR}\tailscale-setup.exe"
  
  ; 2. Jalankan installer Tailscale dan TUNGGU sampai klien selesai menginstalnya
  ExecWait '"$PLUGINSDIR\tailscale-setup.exe"'
!macroend