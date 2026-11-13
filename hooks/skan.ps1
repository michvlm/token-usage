# Czyta nowe linie transkryptów Claude Code od zapisanych offsetów i wypisuje TSV.
# stdin: linie "sciezka<TAB>offset". stdout: "R<TAB>ts,effort,model,id,in,out,think,cw,cr" i "F<TAB>sciezka<TAB>nowyOffset<TAB>typSubagenta".
# -Agenci: dla podanych plików subagentów tylko "A<TAB>sciezka<TAB>typ<TAB>(pola R pierwszego rekordu)" - jednorazowe uzupełnienie licznika wywołań.
# -Do: stdin "sciezka<TAB>limit" - rekordy R z bajtów [0, limit) każdego pliku i "F<TAB>sciezka" (dni jednej sesji).
param([switch]$Agenci, [switch]$Do)
$ErrorActionPreference = 'Stop'
$maks = 15000
$ini = @{}
foreach ($w in ([Console]::In.ReadToEnd() -split "`n")) {
    $c = $w.TrimEnd("`r") -split "`t"
    if ($c.Length -eq 2) { $ini[$c[0]] = [long]$c[1] }
}
$baza = if ($env:CLAUDE_CONFIG_DIR) { $env:CLAUDE_CONFIG_DIR } else { Join-Path $env:USERPROFILE '.claude' }
$proj = Join-Path $baza 'projects'
if (-not (Test-Path $proj)) { exit 0 }
$utf = New-Object Text.UTF8Encoding($false)
$sb = New-Object Text.StringBuilder
$licz = 0
function Dop($tekst, $wzor, $dom) {
    $m = [regex]::Match($tekst, $wzor)
    if ($m.Success) { $m.Groups[1].Value } else { $dom }
}
# Pola rekordu usage z linii transkryptu (bez "R") albo $null.
function Rek($l) {
    if (-not ($l.Contains('"type":"assistant"') -and $l.Contains('"usage":{'))) { return $null }
    $model = Dop $l '"model":"([^"]+)"' ''
    if ($model -eq '' -or $model -eq '<synthetic>') { return $null }
    $u = $l.Substring($l.IndexOf('"usage":{'))
    $in = [long](Dop $u '"input_tokens":(\d+)' 0)
    $out = [long](Dop $u '"output_tokens":(\d+)' 0)
    $cw = [long](Dop $u '"cache_creation_input_tokens":(\d+)' 0)
    $cr = [long](Dop $u '"cache_read_input_tokens":(\d+)' 0)
    if (($in + $out + $cw + $cr) -eq 0) { return $null }
    return (Dop $l '"timestamp":"([^"]+)"' '') + "`t" + (Dop $l '"effort":"([^"]+)"' '?') + "`t$model`t" + (Dop $l '"id":"(msg_[^"]+)"' '') + "`t$in`t$out`t" + (Dop $u '"thinking_tokens":(\d+)' 0) + "`t$cw`t$cr"
}
# Typ subagenta (general-purpose, Explore...) z agent-x.meta.json obok transkryptu.
function Typ($p) {
    $m = [IO.Path]::ChangeExtension($p, '.meta.json')
    if (Test-Path -LiteralPath $m) { Dop ([IO.File]::ReadAllText($m)) '"agentType":"([^"]+)"' '?' } else { '?' }
}
if ($Agenci) {
    foreach ($p in $ini.Keys) {
        if (-not (Test-Path -LiteralPath $p)) { continue }
        $sr = New-Object IO.StreamReader([IO.File]::Open($p, 'Open', 'Read', 'ReadWrite'), $utf)
        try {
            while ($null -ne ($l = $sr.ReadLine())) {
                $r = Rek $l
                if ($null -ne $r) { [void]$sb.Append("A`t$p`t" + (Typ $p) + "`t$r`n"); break }
            }
        } finally { $sr.Dispose() }
    }
    [Console]::Out.Write($sb.ToString())
    exit 0
}
if ($Do) {
    # Ponowny odczyt od początku do podanego offsetu (już policzonego) - do dat jednej sesji.
    foreach ($p in $ini.Keys) {
        if (-not (Test-Path -LiteralPath $p)) { continue }
        $fs = [IO.File]::Open($p, 'Open', 'Read', 'ReadWrite')
        try {
            $dl = [Math]::Min([long]$ini[$p], $fs.Length)
            $buf = New-Object byte[] $dl
            $got = $fs.Read($buf, 0, $buf.Length)
        } finally { $fs.Dispose() }
        if ($got -gt 0) {
            foreach ($l in ($utf.GetString($buf, 0, $got) -split "`n")) {
                $r = Rek $l
                if ($null -ne $r) { [void]$sb.Append("R`t$r`n") }
            }
        }
        [void]$sb.Append("F`t$p`n")
    }
    [Console]::Out.Write($sb.ToString())
    exit 0
}
foreach ($f in Get-ChildItem $proj -Recurse -Filter *.jsonl -File) {
    if ($licz -ge $maks) { break }
    $p = $f.FullName
    $off = 0
    if ($ini.ContainsKey($p)) { $off = $ini[$p] }
    if ($f.Length -lt $off) { $off = 0 }
    if ($f.Length -eq $off) { continue }
    $fs = [IO.File]::Open($p, 'Open', 'Read', 'ReadWrite')
    try {
        $fs.Seek($off, 'Begin') | Out-Null
        $buf = New-Object byte[] ($fs.Length - $off)
        $got = $fs.Read($buf, 0, $buf.Length)
    } finally { $fs.Dispose() }
    $ost = [Array]::LastIndexOf($buf, [byte]10, $got - 1)
    if ($ost -lt 0) { continue }
    $zuzyte = 0
    foreach ($l in ($utf.GetString($buf, 0, $ost + 1) -split "`n")) {
        if ($l.Length -eq 0) { continue }
        if ($licz -ge $maks) { break }
        $zuzyte += $utf.GetByteCount($l) + 1
        $r = Rek $l
        if ($null -eq $r) { continue }
        $licz++
        [void]$sb.Append("R`t$r`n")
    }
    $typ = if ($p -match '\\subagents\\') { Typ $p } else { '' }
    [void]$sb.Append("F`t$p`t" + ($off + $zuzyte) + "`t$typ`n")
}
[Console]::Out.Write($sb.ToString())
