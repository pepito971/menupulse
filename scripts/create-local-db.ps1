# Crée la base PostgreSQL locale de Menupulse (rôle « menupulse » + base « menupulse ») et écrit
# DATABASE_URL dans .env. À lancer une fois, depuis la racine du projet :
#   powershell -ExecutionPolicy Bypass -File scripts/create-local-db.ps1
# psql demande le mot de passe du compte administrateur « postgres » (choisi à l'installation de PostgreSQL).
# Rejouable : si le rôle existe, son mot de passe est remplacé ; la base n'est créée que si elle manque.
param(
  [string]$Psql = 'C:\Program Files\PostgreSQL\16\bin\psql.exe',
  [string]$PgHost = 'localhost',
  [int]$Port = 5432,
  [string]$AdminUser = 'postgres'
)
$ErrorActionPreference = 'Stop'

if (-not (Test-Path $Psql)) { throw "psql introuvable : $Psql (option -Psql pour indiquer son chemin)" }

# mot de passe aléatoire, sans caractère à échapper dans une URL
$bytes = New-Object byte[] 18
[Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($bytes)
$password = [Convert]::ToBase64String($bytes).Replace('+', 'x').Replace('/', 'y').Replace('=', '')

$sql = @"
DO `$`$
BEGIN
  IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'menupulse') THEN
    ALTER ROLE menupulse WITH LOGIN PASSWORD '$password';
  ELSE
    CREATE ROLE menupulse WITH LOGIN PASSWORD '$password';
  END IF;
END
`$`$;
SELECT 'CREATE DATABASE menupulse OWNER menupulse ENCODING ''UTF8'' TEMPLATE template0'
WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = 'menupulse')\gexec
"@
$sqlFile = Join-Path ([IO.Path]::GetTempPath()) 'menupulse-create-db.sql'
[IO.File]::WriteAllText($sqlFile, $sql)
try {
  Write-Host "Connexion à PostgreSQL ($PgHost`:$Port) avec le compte $AdminUser..."
  & $Psql -h $PgHost -p $Port -U $AdminUser -d postgres -v ON_ERROR_STOP=1 -q -f $sqlFile
  if ($LASTEXITCODE -ne 0) { throw 'psql a échoué : rien n''a été écrit dans .env.' }
} finally {
  Remove-Item $sqlFile -ErrorAction SilentlyContinue
}

# .env : DATABASE_URL remplacée (ou ajoutée), le reste du fichier est conservé
$url = "postgres://menupulse:$password@$PgHost`:$Port/menupulse"
$envFile = Join-Path $PSScriptRoot '..\.env'
if (-not (Test-Path $envFile)) { Copy-Item (Join-Path $PSScriptRoot '..\.env.example') $envFile }
$lines = [IO.File]::ReadAllLines($envFile) | Where-Object { $_ -notmatch '^\s*DATABASE_URL\s*=' }
$lines = @("DATABASE_URL=$url") + $lines
[IO.File]::WriteAllText($envFile, (($lines -join "`n") + "`n"))

Write-Host 'Base « menupulse » prête, DATABASE_URL écrite dans .env.'
Write-Host 'Ensuite : npm run seed:demo   (migrations appliquées puis établissement de démonstration)'
