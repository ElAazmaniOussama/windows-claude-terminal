# stt.ps1 — Offline speech-to-text via Windows SAPI (System.Speech)
# Usage: powershell -File stt.ps1 [-Lang en-US]
# Recognised text is written to stdout, one line per utterance.
param(
    [string]$Lang = "en-US",
    [switch]$ListLanguages   # When set: print installed recognizer cultures as JSON and exit
)

Add-Type -AssemblyName System.Speech

if ($ListLanguages) {
    $installed = [System.Speech.Recognition.SpeechRecognitionEngine]::InstalledRecognizers()
    $names = $installed | ForEach-Object { $_.Culture.Name }
    [Console]::WriteLine(($names | ConvertTo-Json -Compress))
    exit 0
}

# Check whether the requested locale has an installed recognizer
$installed = [System.Speech.Recognition.SpeechRecognitionEngine]::InstalledRecognizers()
$match = $installed | Where-Object { $_.Culture.Name -eq $Lang } | Select-Object -First 1

if (-not $match) {
    $available = ($installed | ForEach-Object { $_.Culture.Name }) -join ', '
    if ($available) {
        [Console]::Error.WriteLine("ERROR: No speech recognition engine for '$Lang'. Installed: $available")
    } else {
        [Console]::Error.WriteLine("ERROR: No speech recognition engines installed. Go to Settings > Time & Language > Speech to install one.")
    }
    exit 1
}

$recognizer = $null
try {
    $recognizer = New-Object System.Speech.Recognition.SpeechRecognitionEngine($match.Culture)
} catch {
    [Console]::Error.WriteLine("ERROR: Could not create SpeechRecognitionEngine for '$Lang': $_")
    exit 1
}

try {
    $recognizer.SetInputToDefaultAudioDevice()
} catch {
    [Console]::Error.WriteLine("ERROR: No default audio input device found: $_")
    exit 1
}

# Dictation grammar — free-form speech, no fixed commands
$grammar = New-Object System.Speech.Recognition.DictationGrammar
$recognizer.LoadGrammar($grammar)

# Silence thresholds — tune these if recognition feels too eager/slow
$recognizer.BabbleTimeout                = [TimeSpan]::FromSeconds(3)
$recognizer.EndSilenceTimeout            = [TimeSpan]::FromSeconds(0.8)
$recognizer.EndSilenceTimeoutAmbiguous   = [TimeSpan]::FromSeconds(1.2)

# Signal that we started successfully
[Console]::WriteLine("READY")
[Console]::Out.Flush()

while ($true) {
    try {
        # Block until speech+silence (up to 30 s), then return result or $null
        $result = $recognizer.Recognize([TimeSpan]::FromSeconds(30))
        if ($result -and $result.Text) {
            [Console]::WriteLine($result.Text)
            [Console]::Out.Flush()
        }
    } catch [System.OperationCanceledException] {
        break
    } catch {
        # Transient errors (e.g. audio glitch) — keep going
        Start-Sleep -Milliseconds 200
    }
}

$recognizer.Dispose()
