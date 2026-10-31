# Mot de passe du compte administrateur « postgres » perdu : en pose un nouveau sur le PostgreSQL 16 natif,
# puis crée la base locale de Menupulse (scripts/create-local-db.ps1). À lancer une fois, dans un
# PowerShell ouvert « en tant qu'administrateur », depuis la racine du projet :
#   powershell -ExecutionPolicy Bypass -File scripts/reset-postgres-password.ps1
#
# Procédure standard : pendant quelques secondes, pg_hba.conf laisse le compte postgres se connecter sans
# mot de passe, depuis cette machine seulement ; le nouveau mot de passe est posé, puis pg_hba.conf est
# remis octet pour octet. PostgreSQL redémarre deux fois : les applications connectées (Planevo en local)
# perdent leur connexion un instant. Aucune base n'est modifiée en dehors du mot de passe de postgres.
param(
  [string]$Service = 'postgresql-x64-16',
  [string]$DataDir = 'C:\Program Files\PostgreSQL\16\data',
  [string]$Psql = 'C:\Program Files\PostgreSQL\16\bin\psql.exe',
  [int]$Port = 5432
)
$ErrorActionPreference = 'Stop'

$principal = [Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()
if (-not $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
  throw "À lancer dans un PowerShell ouvert « en tant qu'administrateur » (clic droit sur PowerShell)."
}
$hba = Join-Path $DataDir 'pg_hba.conf'
if (-not (Test-Path $hba)) { throw "pg_hba.conf introuvable : $hba (option -DataDir pour indiquer le dossier des données)" }
if (-not (Test-Path $Psql)) { throw "psql introuvable : $Psql (option -Psql pour indiquer son chemin)" }

function Read-Secret([string]$prompt) {
  $secure = Read-Host $prompt -AsSecureString
  $bstr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)
  try { return [Runtime.InteropServices.Marshal]::PtrToStringBSTR($bstr) } finally { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($bstr) }
}
$password = Read-Secret 'Nouveau mot de passe du compte « postgres » (12 caractères au moins, à noter dans un gestionnaire de mots de passe)'
if ($password.Length -lt 12) { throw 'Mot de passe trop court : rien n''a été modifié.' }
if ($password -ne (Read-Secret 'Confirmez-le')) { throw 'Les deux saisies diffèrent : rien n''a été modifié.' }

$original = [IO.File]::ReadAllBytes($hba)
$backup = "$hba.avant-reinitialisation"
[IO.File]::WriteAllBytes($backup, $original) # filet de sécurité si le script était interrompu
# fichier SQL temporaire plutôt qu'un argument : un mot de passe sur la ligne de commande est visible dans la liste des processus
$sqlFile = Join-Path ([IO.Path]::GetTempPath()) ("menupulse-postgres-{0}.sql" -f [Guid]::NewGuid())
try {
  # Les premières lignes de pg_hba.conf l'emportent : connexion sans mot de passe pour postgres, en local seulement
  $trust = [Text.Encoding]::ASCII.GetBytes("host all postgres 127.0.0.1/32 trust`r`nhost all postgres ::1/128 trust`r`n")
  [IO.File]::WriteAllBytes($hba, [byte[]]($trust + $original))
  Write-Host 'Redémarrage de PostgreSQL (accès local temporaire)...'
  Restart-Service $Service

  [IO.File]::WriteAllText($sqlFile, "ALTER ROLE postgres WITH PASSWORD '$($password.Replace("'", "''"))';")
  & $Psql -h 127.0.0.1 -p $Port -U postgres -d postgres -w -v ON_ERROR_STOP=1 -q -f $sqlFile
  if ($LASTEXITCODE -ne 0) { throw 'psql a échoué : le mot de passe n''a pas été changé.' }
  Write-Host 'Nouveau mot de passe posé.'
} finally {
  Remove-Item $sqlFile -ErrorAction SilentlyContinue
  [IO.File]::WriteAllBytes($hba, $original)
  Write-Host 'pg_hba.conf remis à l''identique, redémarrage de PostgreSQL...'
  Restart-Service $Service
}
$restored = [IO.File]::ReadAllBytes($hba)
if ([Convert]::ToBase64String($restored) -ne [Convert]::ToBase64String($original)) {
  throw "pg_hba.conf diffère de l'original : le restaurer depuis $backup"
}
Remove-Item $backup

# Base de Menupulse avec le nouveau mot de passe (psql le lit dans PGPASSWORD, sans le redemander)
$env:PGPASSWORD = $password
try {
  & (Join-Path $PSScriptRoot 'create-local-db.ps1') -Psql $Psql -Port $Port
} finally {
  Remove-Item Env:PGPASSWORD -ErrorAction SilentlyContinue
}
Write-Host 'Terminé. Ensuite : npm run seed:demo'
