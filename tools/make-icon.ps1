param([string]$OutFile, [int]$Size = 1024)

Add-Type -AssemblyName System.Drawing

$S = [double]$Size
function U([double]$v) { return [float]($v * $S / 1024.0) }   # design units -> pixels

function New-RoundedRect([double]$x, [double]$y, [double]$w, [double]$h, [double]$r) {
  $p = New-Object System.Drawing.Drawing2D.GraphicsPath
  $d = [float](2 * (U $r))
  $px = U $x; $py = U $y; $pw = U $w; $ph = U $h
  $p.AddArc($px, $py, $d, $d, 180, 90)
  $p.AddArc($px + $pw - $d, $py, $d, $d, 270, 90)
  $p.AddArc($px + $pw - $d, $py + $ph - $d, $d, $d, 0, 90)
  $p.AddArc($px, $py + $ph - $d, $d, $d, 90, 90)
  $p.CloseFigure()
  return $p
}

function C([string]$hex) {
  return [System.Drawing.ColorTranslator]::FromHtml($hex)
}

$bmp = New-Object System.Drawing.Bitmap([int]$Size, [int]$Size, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
$g = [System.Drawing.Graphics]::FromImage($bmp)
$g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
$g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
$g.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
$g.Clear([System.Drawing.Color]::Transparent)

# --- Backdrop: the app's own dark surface, as a rounded square badge ---
$bg = New-RoundedRect 0 0 1024 1024 200
$bgBrush = New-Object System.Drawing.Drawing2D.LinearGradientBrush(
  (New-Object System.Drawing.PointF(0, 0)),
  (New-Object System.Drawing.PointF((U 1024), (U 1024))),
  (C "#1b2331"), (C "#0a0c11"))
$g.FillPath($bgBrush, $bg)

# --- Three game cards, fanned: one per store family ---
# Back cards only show an edge, which is all that survives at 16px anyway.
$cardW = 390.0; $cardH = 585.0; $cardR = 46.0
$edgePen = New-Object System.Drawing.Pen((C "#0a0c11"), (U 14))
$edgePen.LineJoin = [System.Drawing.Drawing2D.LineJoin]::Round

function Draw-Card([double]$cx, [double]$cy, [double]$angle, [string]$top, [string]$bottom) {
  $state = $g.Save()
  $g.TranslateTransform((U $cx), (U $cy))
  $g.RotateTransform([float]$angle)
  $g.TranslateTransform(-(U $cx), -(U $cy))

  $x = $cx - $cardW / 2.0
  $y = $cy - $cardH / 2.0
  $path = New-RoundedRect $x $y $cardW $cardH $cardR
  $brush = New-Object System.Drawing.Drawing2D.LinearGradientBrush(
    (New-Object System.Drawing.PointF((U $x), (U $y))),
    (New-Object System.Drawing.PointF((U ($x + $cardW)), (U ($y + $cardH)))),
    (C $top), (C $bottom))
  $g.DrawPath($edgePen, $path)
  $g.FillPath($brush, $path)

  $brush.Dispose(); $path.Dispose()
  $g.Restore($state)
}

# EA orange on the left, Ubisoft blue on the right, Steam cyan in front:
# the same accents the sidebar uses for its platform dots.
#
# The back cards sit low enough that their rotated top corners stay under the
# front card, otherwise they surface as two dark nubs along its top edge.
Draw-Card 350 566 -17 "#ff8564" "#e8462a"
Draw-Card 674 566  17 "#5a9bff" "#1f5fd8"
Draw-Card 512 512   0 "#8fd4fb" "#3ba3e6"

# --- Play triangle, punched out of the front card ---
# Sized to about two thirds of the card: any smaller and it disappears in a
# 16px taskbar button, any larger and the card stops reading as a card.
$tri = New-Object System.Drawing.Drawing2D.GraphicsPath
$tri.AddPolygon(@(
  (New-Object System.Drawing.PointF((U 428), (U 368))),
  (New-Object System.Drawing.PointF((U 428), (U 656))),
  (New-Object System.Drawing.PointF((U 676), (U 512)))
))
$triBrush = New-Object System.Drawing.SolidBrush((C "#0a1520"))
$g.FillPath($triBrush, $tri)

$g.Dispose()
$bmp.Save($OutFile, [System.Drawing.Imaging.ImageFormat]::Png)
$bmp.Dispose()
Write-Output ("ecrit: " + $OutFile + " (" + $Size + "x" + $Size + ")")
