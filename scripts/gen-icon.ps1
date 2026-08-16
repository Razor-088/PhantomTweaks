Add-Type -AssemblyName System.Drawing

$outDir = Join-Path $PSScriptRoot '..\build'
if (-not (Test-Path $outDir)) { New-Item -ItemType Directory -Path $outDir | Out-Null }

function Add-RoundedRectPath([System.Drawing.Drawing2D.GraphicsPath]$path, [float]$x, [float]$y, [float]$w, [float]$h, [float]$r) {
  $d = $r * 2
  $path.AddArc($x, $y, $d, $d, 180, 90)
  $path.AddArc($x + $w - $d, $y, $d, $d, 270, 90)
  $path.AddArc($x + $w - $d, $y + $h - $d, $d, $d, 0, 90)
  $path.AddArc($x, $y + $h - $d, $d, $d, 90, 90)
  $path.CloseFigure()
}

function New-GhostBitmap([int]$size) {
  $bmp = New-Object System.Drawing.Bitmap($size, $size, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
  $g = [System.Drawing.Graphics]::FromImage($bmp)
  $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
  $g.Clear([System.Drawing.Color]::Transparent)

  $s = $size / 512.0
  $g.ScaleTransform($s, $s)

  $cx = 256.0
  $cy = 258.0
  $simple = $size -le 48

  # --- glow ---
  $glow = New-Object System.Drawing.Drawing2D.GraphicsPath
  $glow.AddEllipse(($cx - 210), ($cy - 250), 420, 470)
  $glow.AddRectangle([System.Drawing.RectangleF]::new(($cx - 205), ($cy - 30), 410, 180))
  $glow.CloseFigure()
  $glowBrush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(50, 0, 200, 95))
  $g.FillPath($glowBrush, $glow)

  # --- body: dome + swoosh tail ---
  $body = New-Object System.Drawing.Drawing2D.GraphicsPath
  $body.AddArc([System.Drawing.RectangleF]::new(($cx - 195), ($cy - 235), 390, 330), 180, 180)
  $body.AddLine(($cx + 195), ($cy - 70), ($cx + 192), ($cy + 130))
  $body.AddBezier(($cx + 192), ($cy + 130), ($cx + 235), ($cy + 160), ($cx + 245), ($cy + 200), ($cx + 182), ($cy + 232))
  $body.AddBezier(($cx + 182), ($cy + 232), ($cx + 120), ($cy + 262), ($cx + 40), ($cy + 262), $cx, ($cy + 258))
  $body.AddBezier($cx, ($cy + 258), ($cx - 50), ($cy + 258), ($cx - 110), ($cy + 254), ($cx - 130), ($cy + 244))
  $body.AddBezier(($cx - 130), ($cy + 244), ($cx - 190), ($cy + 230), ($cx - 200), ($cy + 195), ($cx - 192), ($cy + 130))
  $body.AddLine(($cx - 192), ($cy + 130), ($cx - 195), ($cy - 70))
  $body.CloseFigure()

  $gradRect = [System.Drawing.RectangleF]::new(($cx - 200), ($cy - 240), 400, 500)
  $grad = [System.Drawing.Drawing2D.LinearGradientBrush]::new($gradRect, [System.Drawing.Color]::FromArgb(255, 178, 255, 208), [System.Drawing.Color]::FromArgb(255, 0, 182, 92), [single]90.0)
  $g.FillPath($grad, $body)

  $pen = New-Object System.Drawing.Pen([System.Drawing.Color]::FromArgb(255, 0, 140, 70), 11)
  $pen.LineJoin = [System.Drawing.Drawing2D.LineJoin]::Round
  $g.DrawPath($pen, $body)

  # --- visor eyes ---
  $eyePath = New-Object System.Drawing.Drawing2D.GraphicsPath
  Add-RoundedRectPath $eyePath ($cx - 132) ($cy - 126) 100 56 28
  Add-RoundedRectPath $eyePath ($cx + 32) ($cy - 126) 100 56 28
  $eyeBrush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(255, 4, 26, 16))
  $g.FillPath($eyeBrush, $eyePath)

  $hiBrush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(255, 175, 240, 205))
  if (-not $simple) {
    $g.FillEllipse($hiBrush, ($cx - 108), ($cy - 112), 18, 26)
    $g.FillEllipse($hiBrush, ($cx + 56), ($cy - 112), 18, 26)
  }

  # --- lightning bolt (skip on small sizes to keep the silhouette legible) ---
  $bolt = [System.Drawing.PointF[]]@(
    [System.Drawing.PointF]::new(($cx - 36), ($cy - 58)),
    [System.Drawing.PointF]::new(($cx + 32), ($cy - 58)),
    [System.Drawing.PointF]::new(($cx - 12), ($cy - 6)),
    [System.Drawing.PointF]::new(($cx + 28), ($cy - 6)),
    [System.Drawing.PointF]::new(($cx - 30), ($cy + 70)),
    [System.Drawing.PointF]::new(($cx - 4), ($cy + 12)),
    [System.Drawing.PointF]::new(($cx - 42), ($cy + 12))
  )
  if (-not $simple) {
    $boltBrush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(255, 234, 255, 196))
    $g.FillPolygon($boltBrush, $bolt)
    $boltPen = New-Object System.Drawing.Pen([System.Drawing.Color]::FromArgb(255, 150, 200, 90), 4)
    $boltPen.LineJoin = [System.Drawing.Drawing2D.LineJoin]::Round
    $g.DrawPolygon($boltPen, $bolt)
  }

  $g.Dispose()
  return $bmp
}

function Write-Png([System.Drawing.Bitmap]$bmp, [string]$path) {
  $bmp.Save($path, [System.Drawing.Imaging.ImageFormat]::Png)
}

function New-IcoFromPngs([string[]]$pngPaths, [string]$icoPath) {
  $entries = @()
  foreach ($p in $pngPaths) {
    $bytes = [System.IO.File]::ReadAllBytes($p)
    $name = [System.IO.Path]::GetFileName($p)
    $size = [int]($name -replace 'icon-(\d+)\.png', '$1')
    $entries += @{
      size  = $size
      bytes = $bytes
    }
  }
  $count = $entries.Count
  $headerSize = 6
  $entrySize = 16
  $offset = $headerSize + ($entrySize * $count)
  $ms = New-Object System.IO.MemoryStream
  $bw = New-Object System.IO.BinaryWriter($ms)

  $bw.Write([uint16]0)
  $bw.Write([uint16]1)
  $bw.Write([uint16]$count)

  foreach ($e in $entries) {
    $dim = if ($e.size -ge 256) { 0 } else { $e.size }
    $bw.Write([byte]$dim)
    $bw.Write([byte]$dim)
    $bw.Write([byte]0)
    $bw.Write([byte]0)
    $bw.Write([uint16]1)
    $bw.Write([uint16]32)
    $bw.Write([uint32]$e.bytes.Length)
    $bw.Write([uint32]$offset)
    $offset += $e.bytes.Length
  }

  foreach ($e in $entries) {
    $bw.Write($e.bytes)
  }

  $bw.Flush()
  [System.IO.File]::WriteAllBytes($icoPath, $ms.ToArray())
  $bw.Dispose()
  $ms.Dispose()
}

$sizes = @(16, 20, 24, 32, 40, 48, 64, 128, 256)
$pngs = @()
foreach ($sz in $sizes) {
  $bmp = New-GhostBitmap $sz
  $p = Join-Path $outDir "icon-$sz.png"
  Write-Png $bmp $p
  $bmp.Dispose()
  $pngs += $p
}

$big = New-GhostBitmap 512
Write-Png $big (Join-Path $outDir 'icon.png')
$big.Dispose()

# tray icon: mismo diseño, sin fondo, en alta resolución para DPI
$tray = New-GhostBitmap 32
Write-Png $tray (Join-Path $outDir 'tray.png')
$tray.Dispose()
$tray2x = New-GhostBitmap 64
Write-Png $tray2x (Join-Path $outDir 'tray@2x.png')
$tray2x.Dispose()

New-IcoFromPngs $pngs (Join-Path $outDir 'icon.ico')
foreach ($p in $pngs) { Remove-Item $p -Force }

Write-Output 'OK: build/icon.ico + build/icon.png + build/tray.png + build/tray@2x.png generados'
