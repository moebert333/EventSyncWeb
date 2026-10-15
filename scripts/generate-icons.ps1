Add-Type -AssemblyName System.Drawing

function Save-Png([string]$path, [int]$size, [scriptblock]$draw) {
  $bmp = New-Object System.Drawing.Bitmap $size, $size
  $g = [System.Drawing.Graphics]::FromImage($bmp)
  $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
  $g.TextRenderingHint = [System.Drawing.Text.TextRenderingHint]::AntiAliasGridFit
  & $draw $g $size
  $dir = Split-Path $path
  if ($dir -and -not (Test-Path $dir)) { New-Item -ItemType Directory -Path $dir | Out-Null }
  $bmp.Save($path, [System.Drawing.Imaging.ImageFormat]::Png)
  $g.Dispose()
  $bmp.Dispose()
}

$bg = [System.Drawing.Color]::FromArgb(255, 17, 17, 17)
$yellow = [System.Drawing.Color]::FromArgb(255, 245, 197, 24)
$white = [System.Drawing.Color]::White
$orange = [System.Drawing.Color]::FromArgb(255, 255, 106, 0)
$lime = [System.Drawing.Color]::FromArgb(255, 190, 242, 100)

function Draw-Mark($g, [int]$size) {
  $g.Clear($bg)
  $pen = New-Object System.Drawing.Pen $yellow, ([single]([Math]::Max(2, $size * 0.045)))
  $wheel = [single]($size * 0.16)
  $g.DrawEllipse($pen, [single]($size * 0.12), [single]($size * 0.62), $wheel, $wheel)
  $g.DrawEllipse($pen, [single]($size * 0.68), [single]($size * 0.62), $wheel, $wheel)
  $font = New-Object System.Drawing.Font "Arial", ([single]($size * 0.34)), ([System.Drawing.FontStyle]::Bold), ([System.Drawing.GraphicsUnit]::Pixel)
  $brush = New-Object System.Drawing.SolidBrush $yellow
  $sf = New-Object System.Drawing.StringFormat
  $sf.Alignment = [System.Drawing.StringAlignment]::Center
  $sf.LineAlignment = [System.Drawing.StringAlignment]::Center
  $rect = New-Object System.Drawing.RectangleF 0, ([single]($size * 0.06)), ([single]$size), ([single]($size * 0.55))
  $g.DrawString("ES", $font, $brush, $rect, $sf)
  $pen.Dispose()
  $font.Dispose()
  $brush.Dispose()
}

$root = Split-Path $PSScriptRoot -Parent
Save-Png (Join-Path $root "public\pwa-192x192.png") 192 { param($g, $s) Draw-Mark $g $s }
Save-Png (Join-Path $root "public\pwa-512x512.png") 512 { param($g, $s) Draw-Mark $g $s }
Save-Png (Join-Path $root "public\apple-touch-icon.png") 180 { param($g, $s) Draw-Mark $g $s }

$fav = New-Object System.Drawing.Bitmap 32, 32
$fg = [System.Drawing.Graphics]::FromImage($fav)
$fg.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
Draw-Mark $fg 32
$icon = [System.Drawing.Icon]::FromHandle($fav.GetHicon())
$fs = [System.IO.File]::Create((Join-Path $root "public\favicon.ico"))
$icon.Save($fs)
$fs.Close()
$fg.Dispose()
$fav.Dispose()

$posters = @(
  @{ file = "news-1.png"; title = "MXA"; accent = $yellow },
  @{ file = "news-2.png"; title = "SX"; accent = $orange },
  @{ file = "news-3.png"; title = "VITAL"; accent = $white },
  @{ file = "news-4.png"; title = "AMA"; accent = $yellow },
  @{ file = "news-5.png"; title = "PRO"; accent = $lime },
  @{ file = "news-6.png"; title = "NEWS"; accent = $yellow }
)

function Draw-Poster($g, [int]$size, [string]$title, $accent) {
  $g.Clear($bg)
  $bar = New-Object System.Drawing.SolidBrush $yellow
  $g.FillRectangle($bar, 0, ($size - 48), $size, 48)
  $font = New-Object System.Drawing.Font "Arial", 92, ([System.Drawing.FontStyle]::Bold), ([System.Drawing.GraphicsUnit]::Pixel)
  $brush = New-Object System.Drawing.SolidBrush $accent
  $sf = New-Object System.Drawing.StringFormat
  $sf.Alignment = [System.Drawing.StringAlignment]::Center
  $sf.LineAlignment = [System.Drawing.StringAlignment]::Center
  $rect = New-Object System.Drawing.RectangleF 24, 40, ($size - 48), ($size - 140)
  $g.DrawString($title, $font, $brush, $rect, $sf)
  $bar.Dispose()
  $font.Dispose()
  $brush.Dispose()
}

foreach ($poster in $posters) {
  $title = [string]$poster.title
  $accent = $poster.accent
  Save-Png (Join-Path $root ("public\" + $poster.file)) 640 {
    param($g, $size)
    Draw-Poster $g $size $title $accent
  }.GetNewClosure()
}

Get-ChildItem (Join-Path $root "public") -File | Select-Object Name, Length
