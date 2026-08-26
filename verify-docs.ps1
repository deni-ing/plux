# בדיקת "הכל נכנס" — קוד + תיעוד. הריצו מתוך C:\Users\danie\source\plux

Write-Host "`n== 1. המצב המקומי מול GitHub ==" -ForegroundColor Cyan
git fetch origin main
$local  = git rev-parse HEAD
$remote = git rev-parse origin/main
if ($local -eq $remote) {
    Write-Host "OK: main מקומי == origin/main ($($local.Substring(0,7)))" -ForegroundColor Green
} else {
    Write-Host "לא מסונכרן! מקומי=$local  origin=$remote" -ForegroundColor Red
}
git status --short
if (-not (git status --short)) { Write-Host "OK: working tree נקי" -ForegroundColor Green }

Write-Host "`n== 2. שני ה-commits האחרונים ==" -ForegroundColor Cyan
git log -3 --oneline

Write-Host "`n== 3. התוכן החדש קיים בפועל בקבצים ==" -ForegroundColor Cyan
$checks = @{
    "docs\plux-explain.md"  = @("9.29 שלב 7", "9.23 שלב 5", "busyRef", "max_tokens")
    "docs\PROJECT-STATE.md" = @("SNAPSHOT_VERSION", "7/7 שלבים", "8df1808")
    "docs\plux-commands.md" = @("snapshot.mts", "reclassify.mts")
    "docs\plux-glossary.md" = @("stop_reason", "SNAPSHOT_VERSION")
}
foreach ($file in $checks.Keys) {
    foreach ($needle in $checks[$file]) {
        $hit = Select-String -Path $file -Pattern ([regex]::Escape($needle)) -Quiet
        $mark = if ($hit) { "OK " } else { "חסר" }
        $color = if ($hit) { "Green" } else { "Red" }
        Write-Host "  [$mark] $file :: $needle" -ForegroundColor $color
    }
}

Write-Host "`n== 4. CI ==" -ForegroundColor Cyan
Write-Host "פתח: https://github.com/deni-ing/plux/actions"
if (Get-Command gh -ErrorAction SilentlyContinue) {
    gh run list --limit 3
} else {
    Write-Host "(gh CLI לא מותקן — פתח את הקישור למעלה בדפדפן)"
}
