# Compose l'icone de l'application a partir du logo (public/GAMLIB.png).
#
# Le logo est un aplat sombre (#222222) avec un G creme (#F6F4F0). Pose tel quel
# sur une barre des taches Windows sombre il disparait, donc il est centre sur
# une pastille creme reprise de son propre G : le contraste vient du logo
# lui-meme, aucune couleur n'est inventee.

param(
  [string]$LogoFile,
  [string]$OutFile,
  [int]$Size = 1024,
  # Part du cote occupee par le logo. Le reste est la marge de la pastille.
  [double]$Inset = 0.72,
  [string]$Background = "#F6F4F0"
)

Add-Type -AssemblyName System.Drawing

$S = [double]$Size

function New-RoundedRect([double]$x, [double]$y, [double]$w, [double]$h, [double]$r) {
  $p = New-Object System.Drawing.Drawing2D.GraphicsPath
  $d = [float](2 * $r)
  $p.AddArc([float]$x, [float]$y, $d, $d, 180, 90)
  $p.AddArc([float]($x + $w - $d), [float]$y, $d, $d, 270, 90)
  $p.AddArc([float]($x + $w - $d), [float]($y + $h - $d), $d, $d, 0, 90)
  $p.AddArc([float]$x, [float]($y + $h - $d), $d, $d, 90, 90)
  $p.CloseFigure()
  return $p
}

$logo = New-Object System.Drawing.Bitmap($LogoFile)

# Rogne les marges transparentes pour que le cadrage depende du dessin et non
# de la taille du fichier.
$minX = $logo.Width; $maxX = 0; $minY = $logo.Height; $maxY = 0
for ($y = 0; $y -lt $logo.Height; $y++) {
  for ($x = 0; $x -lt $logo.Width; $x++) {
    if ($logo.GetPixel($x, $y).A -gt 20) {
      if ($x -lt $minX) { $minX = $x }
      if ($x -gt $maxX) { $maxX = $x }
      if ($y -lt $minY) { $minY = $y }
      if ($y -gt $maxY) { $maxY = $y }
    }
  }
}
$srcRect = New-Object System.Drawing.Rectangle($minX, $minY, ($maxX - $minX + 1), ($maxY - $minY + 1))

$bmp = New-Object System.Drawing.Bitmap([int]$Size, [int]$Size, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
$g = [System.Drawing.Graphics]::FromImage($bmp)
$g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
$g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
$g.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
$g.Clear([System.Drawing.Color]::Transparent)

# Pastille arrondie, rayon a ~19.5% du cote comme les icones systeme.
$badge = New-RoundedRect 0 0 $S $S ($S * 0.195)
$brush = New-Object System.Drawing.SolidBrush([System.Drawing.ColorTranslator]::FromHtml($Background))
$g.FillPath($brush, $badge)

# Logo centre, ratio d'origine preserve.
$scale = ($S * $Inset) / [Math]::Max($srcRect.Width, $srcRect.Height)
$w = $srcRect.Width * $scale
$h = $srcRect.Height * $scale
$destRect = New-Object System.Drawing.RectangleF(
  [float](($S - $w) / 2.0), [float](($S - $h) / 2.0), [float]$w, [float]$h)
$g.DrawImage($logo, $destRect, $srcRect, [System.Drawing.GraphicsUnit]::Pixel)

$g.Dispose()
$bmp.Save($OutFile, [System.Drawing.Imaging.ImageFormat]::Png)
$bmp.Dispose()
$logo.Dispose()

Write-Output ("ecrit: " + $OutFile + " (" + $Size + "x" + $Size + ", logo rogne a " + $srcRect.Width + "x" + $srcRect.Height + ")")
