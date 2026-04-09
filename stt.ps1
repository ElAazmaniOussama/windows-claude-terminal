# stt.ps1 — Offline speech-to-text via Windows SAPI (System.Speech)
# Usage: powershell -File stt.ps1 [-Lang en-US]
# Recognised text is written to stdout, one line per utterance.
param([string]$Lang = "en-US")

Add-Type -AssemblyName System.Speech

# Try the requested locale, fall back to the system default recogniser
$recognizer = $null
try {
    $recognizer = New-Object System.Speech.Recognition.SpeechRecognitionEngine($Lang)
} catch {
    try {
        $recognizer = New-Object System.Speech.Recognition.SpeechRecognitionEngine
    } catch {
        [Console]::Error.WriteLine("ERROR: Could not create SpeechRecognitionEngine: $_")
        exit 1
    }
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
