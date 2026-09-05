# Construit une version signee et assemble le latest.json que l'updater lit.
#
# La cle privee vit hors du depot (par defaut %USERPROFILE%\.gamlib\updater.key)
# et n'est jamais commitee. Sans elle, Tauri produit bien un installeur mais pas
# de signature, et l'application refusera la mise a jour.
#
# Le script ne publie rien : il prepare les fichiers et affiche la commande de
# publication a lancer quand on le decide.

param(
  [string]$KeyPath = "$env:USERPROFILE\.gamlib\updater.key",
  [string]$KeyPassword = "",
  [string]$Notes = ""
)

$ErrorActionPreference = "Stop"
$root = Split-Path $PSScriptRoot -Parent
Set-Location $root

if (-not (Test-Path $KeyPath)) {
  throw "Cle privee introuvable : $KeyPath. Generer avec : bun run tauri signer generate -w $KeyPath"
}

$version = (Get-Content "package.json" -Raw | ConvertFrom-Json).version
Write-Output "Version : $version"

$env:TAURI_SIGNING_PRIVATE_KEY = Get-Content $KeyPath -Raw
$env:TAURI_SIGNING_PRIVATE_KEY_PASSWORD = $KeyPassword

bun run tauri build
if ($LASTEXITCODE -ne 0) { throw "le build a echoue" }

$nsis = Join-Path $root "src-tauri\target\release\bundle\nsis"
$installer = Get-ChildItem $nsis -Filter "*-setup.exe" | Select-Object -First 1
$signature = Get-ChildItem $nsis -Filter "*-setup.exe.sig" | Select-Object -First 1

if (-not $installer) { throw "installeur introuvable dans $nsis" }
if (-not $signature) {
  throw "signature introuvable : verifier createUpdaterArtifacts dans tauri.conf.json"
}

# L'URL doit pointer sur l'asset de la release qui sera creee pour ce tag.
$tag = "v$version"
$url = "https://github.com/Corentinjsn/GAMLIB/releases/download/$tag/$($installer.Name)"

$latest = [ordered]@{
  version   = $version
  notes     = $Notes
  pub_date  = (Get-Date).ToUniversalTime().ToString("yyyy-MM-ddTHH:mm:ssZ")
  platforms = [ordered]@{
    "windows-x86_64" = [ordered]@{
      signature = (Get-Content $signature.FullName -Raw).Trim()
      url       = $url
    }
  }
}

$latestPath = Join-Path $nsis "latest.json"
$latest | ConvertTo-Json -Depth 5 | Set-Content $latestPath -Encoding utf8

Write-Output ""
Write-Output "Prets a publier :"
Write-Output ("  " + $installer.FullName)
Write-Output ("  " + $latestPath)
Write-Output ""
Write-Output "Publier avec :"
Write-Output "  gh release create $tag --title `"Gamlib $tag`" --notes `"...`" ``"
Write-Output "    `"$($installer.FullName)`" `"$latestPath`""
Write-Output ""
Write-Output "latest.json doit etre un asset de la release *la plus recente* :"
Write-Output "l'updater le lit via /releases/latest/download/latest.json."
