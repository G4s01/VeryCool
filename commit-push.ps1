<#
commit-and-push.ps1
Script aggiornato: rileva automaticamente Git Credential Manager (core o legacy),
prova a leggere una credenziale già salvata e la riutilizza; se non esiste la
chiede e la salva. Poi esegue checkout/pull/add/commit/push su main.

USO:
  powershell -ExecutionPolicy Bypass -File .\commit-and-push.ps1
#>

param(
  [string]$RepoRemote = "origin",
  [switch]$ForcePrompt
)

function Read-Secret($prompt) {
  $secure = Read-Host -Prompt $prompt -AsSecureString
  $ptr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)
  try { return [Runtime.InteropServices.Marshal]::PtrToStringBSTR($ptr) }
  finally { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($ptr) }
}

function Find-GCM {
  $candidates = @('git-credential-manager-core','git-credential-manager')
  foreach ($c in $candidates) {
    $cmd = Get-Command $c -ErrorAction SilentlyContinue
    if ($cmd) { return $cmd.Path }
  }
  $fallbacks = @(
    "C:\Program Files\Git\mingw64\bin\git-credential-manager-core.exe",
    "C:\Program Files\Git\mingw64\bin\git-credential-manager.exe",
    "C:\Program Files\Git\cmd\git-credential-manager.exe"
  )
  foreach ($f in $fallbacks) {
    if (Test-Path $f) { return $f }
  }
  return $null
}

function Get-StoredCredential($gcmPath) {
  if (-not $gcmPath) { return $null }

  $probe = "protocol=https`nhost=github.com`n"
  try {
    # use a direct pipe, consistent with how you tested manually
    $out = $probe | & "$gcmPath" get
  } catch {
    return $null
  }

  if (-not $out) { return $null }

  # Normalize output to array of lines
  if ($out -is [string]) {
    $lines = $out -split "`r?`n"
  } else {
    $lines = $out
  }

  # Parse key=value pairs
  $map = @{}
  foreach ($l in $lines) {
    $trim = $l.Trim()
    if ($trim -eq '') { continue }
    $parts = $trim -split '=', 2
    if ($parts.Count -eq 2) {
      $k = $parts[0].Trim()
      $v = $parts[1].Trim()
      $map[$k] = $v
    }
  }

  if ($map.ContainsKey('username') -and $map.ContainsKey('password')) {
    # only return username/password (don't print the password)
    return [pscustomobject]@{ Username = $map['username']; Password = $map['password'] }
  }

  return $null
}

function Store-Credential($gcmPath, $user, $token) {
  if (-not $gcmPath) { return $false }
  $credInput = "protocol=https`nhost=github.com`nusername=$user`npassword=$token`n"
  try {
    $credInput | & "$gcmPath" store
    return ($LASTEXITCODE -eq 0)
  } catch {
    return $false
  }
}

# --- Start script ---
if (-not (Get-Command git -ErrorAction SilentlyContinue)) {
  Write-Error "git non trovato. Installa Git e riprova."
  exit 1
}

$gcmPath = Find-GCM
if ($gcmPath) {
  Write-Host "Git Credential Manager rilevato in: $gcmPath"
} else {
  Write-Warning "Git Credential Manager non trovato; lo script chiederà le credenziali interattivamente."
}

# Try to detect an existing stored credential
$stored = $null
if (-not $ForcePrompt) {
  if ($gcmPath) {
    $stored = Get-StoredCredential $gcmPath
    if ($stored) {
      Write-Host "Usando credenziale salvata per utente: $($stored.Username)"
    } else {
      Write-Host "Nessuna credenziale trovata in GCM per github.com."
    }
  }
}

# ask if not found or forced
if (-not $stored) {
  $user = Read-Host -Prompt "GitHub username (es. G4s01)"
  $token = Read-Secret "PAT (incolla il token, invisibile)"
  if ($gcmPath) {
    $ok = Store-Credential $gcmPath $user $token
    if ($ok) {
      Write-Host "Credenziale salvata in Credential Manager."
    } else {
      Write-Warning "Impossibile salvare la credenziale via GCM; verrà richiesta al push."
    }
  }
} else {
  $user = $stored.Username
  $token = $stored.Password
}

# Ensure git credential helper configured sensibly
try {
  if ($gcmPath -and ($gcmPath -like '*manager-core*')) {
    git config --global credential.helper manager-core | Out-Null
  } elseif ($gcmPath) {
    git config --global credential.helper manager | Out-Null
  }
} catch {
  Write-Warning "Impossibile impostare credential.helper; procedo comunque."
}

# Git workflow
Write-Host "`nVerifico branch main e sincronizzo..."
git checkout main
if ($LASTEXITCODE -ne 0) { Write-Error "Errore nel checkout su main. Controlla lo stato del repo."; exit 1 }

git pull $RepoRemote main
if ($LASTEXITCODE -ne 0) { Write-Warning "git pull ha restituito un errore. Continua con cautela."; }

$msg = Read-Host -Prompt "Commit message"
if ([string]::IsNullOrWhiteSpace($msg)) { Write-Warning "Messaggio vuoto; operazione annullata."; exit 1 }

Write-Host "Eseguo git add ."
git add .
if ($LASTEXITCODE -ne 0) { Write-Error "git add fallito."; exit 1 }

Write-Host "Eseguo git commit"
git commit -m "$msg"
if ($LASTEXITCODE -ne 0) { Write-Warning "git commit ha fallito o non ci sono modifiche da committare."; }

Write-Host "Eseguo git push $RepoRemote main (potrebbe chiedere credenziali se GCM non è configurato)"
git push $RepoRemote main
if ($LASTEXITCODE -ne 0) {
  Write-Error "git push fallito. Controlla i messaggi di errore (es. protezioni branch)."
  exit 1
}

Write-Host "Push completato con successo."

# zero out sensitive values
$token = $null
if ($stored) { $stored.Password = $null }
[GC]::Collect()
[GC]::WaitForPendingFinalizers()