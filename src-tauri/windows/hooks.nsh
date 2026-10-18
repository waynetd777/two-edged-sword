; Copyright © 2026 Wayne Davies. Free software under the GNU General Public License, version 3 or later.
; SPDX-License-Identifier: GPL-3.0-or-later. See LICENSE in the project root.

; The uninstaller's "Delete the application data" box clears %APPDATA%\<identifier>, but the app
; keeps its data in %APPDATA%\Two-edged Sword (store.rs data_dir). With the box ticked, and not
; for an update, that goes too, with the update installers the updater left in Temp. The journal,
; in Documents, stays: it is the user's writing.
!macro NSIS_HOOK_POSTUNINSTALL
  ${If} $DeleteAppDataCheckboxState = 1
  ${AndIf} $UpdateMode <> 1
    SetShellVarContext current
    RmDir /r "$APPDATA\${PRODUCTNAME}"
    FindFirst $0 $1 "$TEMP\${PRODUCTNAME}-*-updater-*"
    ${DoWhile} $1 != ""
      RmDir /r "$TEMP\$1"
      FindNext $0 $1
    ${Loop}
    FindClose $0
  ${EndIf}
!macroend
