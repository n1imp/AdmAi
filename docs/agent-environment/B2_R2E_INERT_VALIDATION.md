# B2-R2E — harness monitorado e validação inerte

## Causa da falha anterior

O harness anterior atribuiu o ID observado à variável `$pid`. No Windows PowerShell,
nomes são case-insensitive e `$PID` é uma variável automática com opções `Constant,
AllScope`. A atribuição falhou durante o monitoramento da árvore, antes da serialização do
objeto final. A exceção não era capturada pelo harness externo; por isso a chamada terminou
sem evidência estruturada.

Correção mínima: usar `$processId`, manter um objeto de resultado inicializado desde a
entrada e transformar toda falha controlada em evidência com etapa, tipo e mensagem
redigida.

## Bloco executável

<!-- B2E-HARNESS-CODE-BEGIN -->
```powershell
Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

function Get-B2EHarnessSnapshot {
  $rows = @(Get-CimInstance -ClassName Win32_Process -ErrorAction Stop)
  if ($null -eq $rows -or $rows.Count -eq 0) { throw 'COLLECTOR_EMPTY' }
  return $rows
}

function Get-B2ERedactedMessage([string]$Stage, [Exception]$Exception) {
  switch -Regex ($Stage) {
    '^collector' { return 'Falha redigida do coletor.' }
    '^serialization' { return 'Falha redigida de serializacao.' }
    '^validation' { return 'Saida estruturada invalida ou divergente.' }
    '^timeout' { return 'Timeout do processo filho.' }
    '^cleanup' { return 'Falha redigida de cleanup.' }
    default { return ('Falha redigida em ' + $Stage + ' (' + $Exception.GetType().Name + ').') }
  }
}

function Test-B2EAllowedStderr([string]$Stderr) {
  if ([string]::IsNullOrWhiteSpace($Stderr)) { return $true }
  if ($Stderr -notmatch '^#< CLIXML\s*') { return $false }
  try {
    [xml]$xml = [regex]::Replace($Stderr, '^#< CLIXML\s*', '')
    if ($xml.DocumentElement.LocalName -ne 'Objs') { return $false }
    $records = @($xml.DocumentElement.ChildNodes | Where-Object { $_.NodeType -eq 'Element' })
    if ($records.Count -ne 1 -or $records[0].LocalName -ne 'Obj' -or
        $records[0].GetAttribute('S') -cne 'progress') { return $false }
    $streamNodes = @($xml.SelectNodes('//*[@S]'))
    if (@($streamNodes | Where-Object { $_.GetAttribute('S') -cne 'progress' }).Count -ne 0) {
      return $false
    }
    $types = @($xml.SelectNodes('//*[local-name()="T"]') | ForEach-Object { $_.InnerText })
    $progressRecords = @($xml.SelectNodes('//*[local-name()="PR" and @N="Record"]'))
    return $progressRecords.Count -eq 1 -and
      $types -contains 'System.Management.Automation.PSCustomObject' -and
      $types -notcontains 'System.Management.Automation.ErrorRecord'
  } catch {
    return $false
  }
}

function Get-B2EClassification([string]$Name, [string]$Path) {
  $normalizedName = $Name.ToLowerInvariant()
  if ($normalizedName -eq 'claude.exe') { return 'CLAUDE_FORBIDDEN' }
  if ($normalizedName -match '^(node|npm|npx|codex)\.exe$' -or $normalizedName -like '*mcp*') {
    return 'FORBIDDEN'
  }
  $allowed = @{
    'cmd.exe' = 'C:\Windows\System32\cmd.exe'
    'conhost.exe' = 'C:\Windows\System32\conhost.exe'
    'powershell.exe' = 'C:\Windows\System32\WindowsPowerShell\v1.0\powershell.exe'
    'git.exe' = @(
      'C:\Program Files\Git\cmd\git.exe',
      'C:\Program Files\Git\mingw64\bin\git.exe'
    )
    'findstr.exe' = 'C:\Windows\System32\findstr.exe'
    'reg.exe' = 'C:\Windows\System32\reg.exe'
    'tasklist.exe' = 'C:\Windows\System32\tasklist.exe'
    'where.exe' = 'C:\Windows\System32\where.exe'
  }
  if (-not $allowed.ContainsKey($normalizedName) -or $Path -eq '[UNAVAILABLE]') {
    return 'UNEXPECTED'
  }
  $resolvedPath = [IO.Path]::GetFullPath($Path)
  if (@($allowed[$normalizedName] | Where-Object {
    [string]::Equals($resolvedPath, $_, [StringComparison]::OrdinalIgnoreCase)
  }).Count -eq 0) { return 'UNEXPECTED' }
  return 'EXPECTED'
}

function Add-B2ETreeRows(
  [object[]]$Rows,
  [hashtable]$BaselineIds,
  [hashtable]$Tree,
  [Collections.ArrayList]$Evidence
) {
  $changed = $true
  while ($changed) {
    $changed = $false
    foreach ($row in $Rows) {
      $processId = [int]$row.ProcessId
      if ($BaselineIds.ContainsKey($processId) -or $Tree.ContainsKey($processId) -or
          -not $Tree.ContainsKey([int]$row.ParentProcessId)) { continue }
      $name = if ([string]::IsNullOrWhiteSpace([string]$row.Name)) { 'UNKNOWN' } else { [string]$row.Name }
      $pathSource = 'CIM ExecutablePath'
      $path = if ([string]::IsNullOrWhiteSpace([string]$row.ExecutablePath)) {
        $resolvedLivePath = '[UNAVAILABLE]'
        try {
          $liveProcess = [Diagnostics.Process]::GetProcessById($processId)
          try {
            $resolvedLivePath = [IO.Path]::GetFullPath($liveProcess.MainModule.FileName)
            $pathSource = 'Process.MainModule'
          }
          finally { $liveProcess.Dispose() }
        } catch { }
        if ($resolvedLivePath -eq '[UNAVAILABLE]') {
          $commandLine = [string]$row.CommandLine
          $candidatePath = if ($commandLine.StartsWith('"')) {
            $closingQuote = $commandLine.IndexOf('"', 1)
            if ($closingQuote -gt 1) { $commandLine.Substring(1, $closingQuote - 1) } else { $null }
          } else { @($commandLine -split '\s+', 2)[0] }
          if (-not [string]::IsNullOrWhiteSpace($candidatePath) -and
              [IO.Path]::IsPathRooted($candidatePath) -and
              [IO.Path]::GetFileName($candidatePath) -ieq $name -and
              (Test-Path -LiteralPath $candidatePath -PathType Leaf)) {
            $resolvedLivePath = [IO.Path]::GetFullPath($candidatePath)
            $pathSource = 'CIM CommandLine executable'
          }
        }
        if ($resolvedLivePath -eq '[UNAVAILABLE]') {
          $resolvedCommand = Get-Command $name -CommandType Application -ErrorAction SilentlyContinue |
            Select-Object -First 1
          if ($null -ne $resolvedCommand -and
              [IO.Path]::GetFileName($resolvedCommand.Source) -ieq $name) {
            $resolvedLivePath = [IO.Path]::GetFullPath($resolvedCommand.Source)
            $pathSource = 'Get-Command exact name'
          }
        }
        $resolvedLivePath
      } else { [IO.Path]::GetFullPath([string]$row.ExecutablePath) }
      $created = if ($null -eq $row.CreationDate) { '[UNAVAILABLE]' } else { ([datetime]$row.CreationDate).ToUniversalTime().ToString('o') }
      $record = [pscustomobject]@{
        Pid = $processId
        ParentPid = [int]$row.ParentProcessId
        Name = $name
        Path = $path
        CreatedUtc = $created
        CommandLine = "$name [ARGUMENTOS REDIGIDOS]"
        Relation = 'descendant'
        Source = 'CIM Win32_Process; path=' + $pathSource
        Classification = Get-B2EClassification $name $path
      }
      $Tree[$processId] = $record
      [void]$Evidence.Add($record)
      $changed = $true
    }
  }
}

function Stop-B2ETrackedTree([Diagnostics.Process]$RootProcess, [hashtable]$Tree) {
  if ($null -ne $RootProcess -and -not $RootProcess.HasExited) {
    if (-not $Tree.ContainsKey([int]$RootProcess.Id)) { throw 'ROOT_IDENTITY_MISSING' }
    $rootRecord = $Tree[[int]$RootProcess.Id]
    $candidate = [Diagnostics.Process]::GetProcessById([int]$rootRecord.Pid)
    try {
      if ($candidate.StartTime.ToUniversalTime().ToString('o') -ne [string]$rootRecord.CreatedUtc) {
        throw 'ROOT_IDENTITY_DIVERGED'
      }
      [void]$candidate.CloseMainWindow()
    } finally {
      $candidate.Dispose()
    }
    Start-Sleep -Milliseconds 200
    $RootProcess.Refresh()
    if (-not $RootProcess.HasExited) {
      $taskkill = 'C:\Windows\System32\taskkill.exe'
      if (-not (Test-Path -LiteralPath $taskkill -PathType Leaf)) { throw 'TASKKILL_MISSING' }
      $killInfo = New-Object Diagnostics.ProcessStartInfo
      $killInfo.FileName = $taskkill
      $killInfo.Arguments = "/PID $($RootProcess.Id) /T /F"
      $killInfo.UseShellExecute = $false
      $killInfo.CreateNoWindow = $true
      $killInfo.RedirectStandardOutput = $true
      $killInfo.RedirectStandardError = $true
      $killProcess = [Diagnostics.Process]::Start($killInfo)
      $killStdout = $killProcess.StandardOutput.ReadToEndAsync()
      $killStderr = $killProcess.StandardError.ReadToEndAsync()
      if (-not $killProcess.WaitForExit(2000) -or -not $killStdout.Wait(2000) -or
          -not $killStderr.Wait(2000)) { throw 'TASKKILL_TIMEOUT' }
      $killProcess.Dispose()
      if (-not $RootProcess.WaitForExit(2000)) { throw 'ROOT_CONTAINMENT_FAILED' }
    }
  }
  foreach ($record in @($Tree.Values | Sort-Object Relation)) {
    try {
      $candidate = [Diagnostics.Process]::GetProcessById([int]$record.Pid)
      if ($candidate.StartTime.ToUniversalTime().ToString('o') -eq [string]$record.CreatedUtc) {
        $candidate.Kill()
        [void]$candidate.WaitForExit(2000)
      }
      $candidate.Dispose()
    } catch [ArgumentException] { }
  }
  foreach ($record in @($Tree.Values)) {
    try {
      $candidate = [Diagnostics.Process]::GetProcessById([int]$record.Pid)
      $same = $candidate.StartTime.ToUniversalTime().ToString('o') -eq [string]$record.CreatedUtc
      $candidate.Dispose()
      if ($same) { return $false }
    } catch [ArgumentException] { }
  }
  return $true
}

function Test-B2EResultShape([object]$Result) {
  $required = @(
    'HarnessStarted', 'HarnessCompleted', 'HarnessExitCode', 'ChildStarted',
    'ChildPid', 'ChildExitCode', 'StdoutCaptured', 'StderrCaptured',
    'StructuredEvidenceValid', 'ClaudeObserved', 'UnexpectedProcessObserved',
    'CleanupCompleted', 'FailureStage', 'FailureType', 'FailureMessageRedacted'
  )
  foreach ($name in $required) {
    if (-not ($Result.PSObject.Properties.Name -contains $name)) { return $false }
  }
  return $true
}

function Invoke-B2EMonitoredHarness {
  [CmdletBinding()]
  param(
    [Parameter(Mandatory = $true)][string]$FilePath,
    [Parameter(Mandatory = $true)][string]$Arguments,
    [Parameter(Mandatory = $true)][string]$WorkingDirectory,
    [Parameter(Mandatory = $true)][scriptblock]$EvidenceValidator,
    [scriptblock]$SnapshotProvider = ${function:Get-B2EHarnessSnapshot},
    [scriptblock]$EvidenceSerializer = { param($Value) $Value | ConvertTo-Json -Depth 8 -Compress },
    [int]$TimeoutSeconds = 15
  )

  $result = [pscustomobject]@{
    HarnessStarted = $true
    HarnessCompleted = $false
    HarnessExitCode = 90
    ChildStarted = $false
    ChildPid = $null
    ChildExitCode = $null
    StdoutCaptured = $false
    StderrCaptured = $false
    StructuredEvidenceValid = $false
    ClaudeObserved = $false
    UnexpectedProcessObserved = $false
    CleanupCompleted = $false
    FailureStage = $null
    FailureType = $null
    FailureMessageRedacted = $null
    CollectorState = 'NOT_CREATED'
    StructuredObjectState = 'INITIALIZED'
    StartedUtc = [datetime]::UtcNow.ToString('o')
    EndedUtc = $null
    ObservedProcesses = @()
    StdoutEvidence = '[NOT_CAPTURED]'
    StderrEvidence = '[NOT_CAPTURED]'
  }
  $stage = 'initialization'
  $rootProcess = $null
  $stdoutTask = $null
  $stderrTask = $null
  $tree = @{}
  $evidence = New-Object Collections.ArrayList
  $stdout = ''
  $stderr = ''
  try {
    if ([string]::IsNullOrWhiteSpace($FilePath) -or [string]::IsNullOrWhiteSpace($WorkingDirectory) -or
        $null -eq $EvidenceValidator -or $null -eq $SnapshotProvider -or $null -eq $EvidenceSerializer) {
      throw 'REQUIRED_VALUE_MISSING'
    }
    $resolvedFile = [IO.Path]::GetFullPath($FilePath)
    if ([IO.Path]::GetFileName($resolvedFile) -ieq 'claude.exe') { throw 'CLAUDE_TARGET_FORBIDDEN' }
    if (-not (Test-Path -LiteralPath $resolvedFile -PathType Leaf)) { throw 'CHILD_FILE_MISSING' }
    $resolvedWorkingDirectory = [IO.Path]::GetFullPath($WorkingDirectory)
    if (-not (Test-Path -LiteralPath $resolvedWorkingDirectory -PathType Container)) { throw 'WORKDIR_MISSING' }

    $stage = 'collector-initialization'
    $baseline = @(& $SnapshotProvider)
    if ($null -eq $baseline -or $baseline.Count -eq 0) { throw 'COLLECTOR_INVALID' }
    $baselineIds = @{}
    foreach ($row in $baseline) { $baselineIds[[int]$row.ProcessId] = $true }
    $result.CollectorState = 'READY'

    $stage = 'process-start'
    $startInfo = New-Object Diagnostics.ProcessStartInfo
    $startInfo.FileName = $resolvedFile
    $startInfo.Arguments = $Arguments
    $startInfo.WorkingDirectory = $resolvedWorkingDirectory
    $startInfo.UseShellExecute = $false
    $startInfo.CreateNoWindow = $true
    $startInfo.RedirectStandardInput = $true
    $startInfo.RedirectStandardOutput = $true
    $startInfo.RedirectStandardError = $true
    $rootProcess = New-Object Diagnostics.Process
    $rootProcess.StartInfo = $startInfo
    if (-not $rootProcess.Start()) { throw 'CHILD_START_FAILED' }
    $result.ChildStarted = $true
    $result.ChildPid = $rootProcess.Id
    $rootRecord = [pscustomobject]@{
      Pid = $rootProcess.Id
      ParentPid = $PID
      Name = [IO.Path]::GetFileName($resolvedFile)
      Path = $resolvedFile
      CreatedUtc = $rootProcess.StartTime.ToUniversalTime().ToString('o')
      CommandLine = "$([IO.Path]::GetFileName($resolvedFile)) [ARGUMENTOS REDIGIDOS]"
      Relation = 'root'
      Source = 'Process.Start return object'
      Classification = Get-B2EClassification ([IO.Path]::GetFileName($resolvedFile)) $resolvedFile
    }
    $tree[$rootProcess.Id] = $rootRecord
    [void]$evidence.Add($rootRecord)
    $stdoutTask = $rootProcess.StandardOutput.ReadToEndAsync()
    $stderrTask = $rootProcess.StandardError.ReadToEndAsync()

    $stage = 'tree-monitoring'
    $deadline = [datetime]::UtcNow.AddSeconds($TimeoutSeconds)
    while (-not $rootProcess.HasExited) {
      $rows = @(& $SnapshotProvider)
      if ($null -eq $rows -or $rows.Count -eq 0) { throw 'COLLECTOR_INVALID' }
      Add-B2ETreeRows $rows $baselineIds $tree $evidence
      $result.ClaudeObserved = @($evidence | Where-Object { $_.Classification -eq 'CLAUDE_FORBIDDEN' }).Count -ne 0
      $result.UnexpectedProcessObserved = @($evidence | Where-Object { $_.Classification -ne 'EXPECTED' }).Count -ne 0
      if ($result.ClaudeObserved -or $result.UnexpectedProcessObserved) { throw 'UNEXPECTED_PROCESS' }
      if ([datetime]::UtcNow -ge $deadline) { $stage = 'timeout'; throw [TimeoutException]::new('CHILD_TIMEOUT') }
      Start-Sleep -Milliseconds 50
      $rootProcess.Refresh()
    }
    $stage = 'final-collection'
    $rows = @(& $SnapshotProvider)
    if ($null -eq $rows -or $rows.Count -eq 0) { throw 'COLLECTOR_INVALID' }
    Add-B2ETreeRows $rows $baselineIds $tree $evidence
  } catch {
    $result.FailureStage = $stage
    $result.FailureType = $_.Exception.GetType().FullName
    $result.FailureMessageRedacted = Get-B2ERedactedMessage $stage $_.Exception
  } finally {
    $result.ObservedProcesses = @($evidence)
    if ($null -ne $rootProcess) {
      try {
        $result.CleanupCompleted = Stop-B2ETrackedTree $rootProcess $tree
      } catch {
        $result.CleanupCompleted = $false
        $result.FailureStage = 'cleanup'
        $result.FailureType = $_.Exception.GetType().FullName
        $result.FailureMessageRedacted = Get-B2ERedactedMessage 'cleanup' $_.Exception
      }
      if ($rootProcess.HasExited) { $result.ChildExitCode = $rootProcess.ExitCode }
      if ($null -ne $stdoutTask) {
        try {
          if (-not $stdoutTask.Wait(2000)) { throw [TimeoutException]::new('STDOUT_CAPTURE_TIMEOUT') }
          $stdout = [string]$stdoutTask.Result
          $result.StdoutCaptured = $true
        } catch {
          $result.FailureStage = 'stdout-capture'
          $result.FailureType = $_.Exception.GetType().FullName
          $result.FailureMessageRedacted = 'Falha redigida na captura de stdout.'
        }
      }
      if ($null -ne $stderrTask) {
        try {
          if (-not $stderrTask.Wait(2000)) { throw [TimeoutException]::new('STDERR_CAPTURE_TIMEOUT') }
          $stderr = [string]$stderrTask.Result
          $result.StderrCaptured = $true
        } catch {
          $result.FailureStage = 'stderr-capture'
          $result.FailureType = $_.Exception.GetType().FullName
          $result.FailureMessageRedacted = 'Falha redigida na captura de stderr.'
        }
      }
      $rootProcess.Dispose()
    } else {
      $result.CleanupCompleted = $true
    }
  }

  if ($null -eq $result.FailureStage) {
    $stage = 'validation'
    try {
      $valid = [bool](& $EvidenceValidator $stdout $stderr $result.ChildExitCode)
      if (-not $valid) { throw 'EVIDENCE_VALIDATION_FAILED' }
      $result.StructuredEvidenceValid = $true
      $result.HarnessExitCode = 0
    } catch {
      $result.StructuredEvidenceValid = $false
      $result.HarnessExitCode = 90
      $result.FailureStage = $stage
      $result.FailureType = $_.Exception.GetType().FullName
      $result.FailureMessageRedacted = Get-B2ERedactedMessage $stage $_.Exception
    }
  }
  $result.StdoutEvidence = if ([string]::IsNullOrWhiteSpace($stdout)) { '[EMPTY]' } else { '[NONEMPTY_REDACTED]' }
  $result.StderrEvidence = if ([string]::IsNullOrWhiteSpace($stderr)) { '[EMPTY]' } else { '[NONEMPTY_REDACTED]' }

  $result.HarnessCompleted = $true
  $result.EndedUtc = [datetime]::UtcNow.ToString('o')
  $result.StructuredObjectState = 'SERIALIZED_AND_VALIDATED'
  $stage = 'serialization'
  try {
    $serialized = [string](& $EvidenceSerializer $result)
    if ([string]::IsNullOrWhiteSpace($serialized)) { throw 'SERIALIZATION_EMPTY' }
    $roundTrip = $serialized | ConvertFrom-Json
    if (-not (Test-B2EResultShape $roundTrip) -or -not $roundTrip.HarnessCompleted -or
        [string]::IsNullOrWhiteSpace([string]$roundTrip.EndedUtc)) {
      throw 'SERIALIZED_SHAPE_INVALID'
    }
  } catch {
    $result.StructuredEvidenceValid = $false
    $result.HarnessExitCode = 90
    $result.FailureStage = $stage
    $result.FailureType = $_.Exception.GetType().FullName
    $result.FailureMessageRedacted = Get-B2ERedactedMessage $stage $_.Exception
    $result.StructuredObjectState = 'SERIALIZATION_FAILED'
  }
  return $result
}
```
<!-- B2E-HARNESS-CODE-END -->

## Diagnóstico isolado da R1-1

Definição original:

```text
processo raiz: powershell.exe
script pretendido: produzir um objeto JSON { ok: true } e encerrar com código 0
validador: exit 0, stderr vazio e stdout convertido por ConvertFrom-Json com ok=true
asserção: HarnessCompleted && HarnessExitCode=0 && ChildStarted &&
          ChildExitCode=0 && StructuredEvidenceValid && CleanupCompleted
```

Executável esperado e observado:
`C:\Windows\System32\WindowsPowerShell\v1.0\powershell.exe`.

Árvore observada em `2026-07-27T23:47:34.0569991Z`:

| PID | Parent PID | Nome | Path | Fonte | Classificação |
| ---: | ---: | --- | --- | --- | --- |
| 21940 | 18240 | `powershell.exe` | `C:\Windows\System32\WindowsPowerShell\v1.0\powershell.exe` | objeto retornado por `Process.Start` | `EXPECTED` |
| 17436 | 21940 | `conhost.exe` | `C:\Windows\system32\conhost.exe` | CIM | `EXPECTED` |

### Esperado versus observado

| Campo | Esperado | Observado | Aprovado |
| --- | --- | --- | ---: |
| `HarnessStarted` | true | true | sim |
| `HarnessCompleted` | true | true | sim |
| `HarnessExitCode` | 0 | 90 | não |
| `ChildStarted` | true | true | sim |
| `ChildPid` | maior que zero | 21940 | sim |
| `ChildExitCode` | 0 | 1 | não |
| `StdoutCaptured` | true | true | sim |
| `StderrCaptured` | true | true | sim |
| `StructuredEvidenceValid` | true | false | não |
| `ClaudeObserved` | false | false | sim |
| `UnexpectedProcessObserved` | false | false | sim |
| `CleanupCompleted` | true | true | sim |
| `FailureStage` | nulo | `validation` | não |
| `FailureType` | nulo | `RuntimeException` | não |
| `FailureMessageRedacted` | nulo | saída estruturada inválida/divergente | não |
| `CollectorState` | `READY` | `READY` | sim |
| `StructuredObjectState` | `SERIALIZED_AND_VALIDATED` | `SERIALIZED_AND_VALIDATED` | sim* |
| processos observados | um ou mais, todos esperados | 2, ambos `EXPECTED` | sim |
| `StdoutEvidence` | não vazio/redigido | vazio | não |
| `StderrEvidence` | vazio | não vazio/redigido | não |
| processos residuais | 0 | 0 | sim |

O asterisco indica defeito independente: o objeto foi serializado antes de
`HarnessCompleted=true` e antes do preenchimento final de `EndedUtc`. O objeto retornado
foi atualizado depois, mas a serialização usada como prova não representava o estado final.

### Classificação da causa

- captura assíncrona incompleta: **não observada**; ambas as tasks foram capturadas;
- classificação/path/relação pai-filho: **corretos**;
- cleanup: **correto**;
- serialização prematura: **confirmada, mas não foi a causa do exit 1 do filho**;
- expectativa da fixture: **incorreta**;
- outro defeito: **quoting do script JSON no runner produziu comando filho inválido**.

O filho encerrou com código 1 antes de produzir o JSON pretendido. O stderr bruto não foi
persistido; somente sua presença foi registrada. A combinação exit 1 + stdout vazio +
stderr não vazio, com árvore/classificação normais, localiza a falha na construção da
fixture, não no monitor ou no validador.

### Correção aplicada, não reexecutada

O runner futuro deve construir a fixture sem JSON literal aninhado:

```powershell
$fixtureSource = '[pscustomobject]@{ok=$true} | ConvertTo-Json -Compress; exit 0'
$fixtureArguments = '-NoLogo -NoProfile -NonInteractive -EncodedCommand ' +
  [Convert]::ToBase64String([Text.Encoding]::Unicode.GetBytes($fixtureSource))
```

O harness passou a aguardar `stdoutTask` e `stderrTask` por até dois segundos, com falha
específica de captura, e agora define `HarnessCompleted`/`EndedUtc` antes de serializar e
validar o estado final. Essas correções não foram executadas neste gate.

## Estado

O bloco passou no parser do Windows PowerShell `5.1.19041.6456`, com zero erro, strict
mode e erro terminante ativos. SHA-256 do bloco executável UTF-8:

```text
F82CCD785B67A8FD8F03557D766DF614C3605485F3A0B6D6DD51780E106045CD
```

A execução diagnóstica única da R1-1 determinou os campos divergentes e a causa raiz. A
fixture construiu um comando filho inválido: exit 1, stdout vazio e stderr não vazio. O
harness, a árvore, a classificação e o cleanup funcionaram; a validação falhou corretamente
porque o JSON esperado não existia. A rodada original continua não aprovada.

Conforme a regra de parada do checkpoint:

- a fixture foi executada uma única vez para diagnóstico e não foi repetida após a causa;
- as demais 19 execuções planejadas não ocorreram;
- os casos A e B do launcher real não foram executados;
- nenhuma revisão independente foi solicitada;
- E2, E3, E4 e E5 não foram iniciados.

Estado posterior: zero Claude, zero processo com nome MCP, zero npm/npx, hash do launcher
`4AF414DBF6287F978E729DC9E0DB65444EB6DA15B24543795A754B26C7E998BA` e
`.oauth_refresh.lock` preservado. O harness corrigido ainda não foi executado.
**VALIDAÇÃO DO HARNESS CONTINUA PENDENTE.**

## Execução única autorizada da R1-1 corrigida

Execução iniciada em `2026-07-27T23:57:33.5953927Z`, sem retry. O bloco
executável usado manteve SHA-256
`F82CCD785B67A8FD8F03557D766DF614C3605485F3A0B6D6DD51780E106045CD`; o
launcher permaneceu com SHA-256
`4AF414DBF6287F978E729DC9E0DB65444EB6DA15B24543795A754B26C7E998BA`.

Comando lógico, sem stdout bruto:

```text
powershell.exe -NoLogo -NoProfile -NonInteractive -EncodedCommand <PSCustomObject JSON inerte>
```

| Campo | Esperado | Observado | Aprovado |
| --- | --- | --- | ---: |
| `HarnessStarted` | true | true | sim |
| `HarnessCompleted` | true | true | sim |
| `HarnessExitCode` | 0 | 90 | não |
| `ChildStarted` | true | true | sim |
| `ChildPid` | maior que zero | 7968 | sim |
| `ChildExitCode` | 0 | 0 | sim |
| `StdoutCaptured` | true | true | sim |
| `StderrCaptured` | true | true | sim |
| `StructuredEvidenceValid` | true | false | não |
| `ClaudeObserved` | false | false | sim |
| `UnexpectedProcessObserved` | false | false | sim |
| `CleanupCompleted` | true | true | sim |
| `FailureStage` | nulo | `validation` | não |
| `FailureType` | nulo | `System.Management.Automation.RuntimeException` | não |
| `FailureMessageRedacted` | nulo | `Saida estruturada invalida ou divergente.` | não |
| `CollectorState` | `READY` | `READY` | sim |
| `StructuredObjectState` | estado serializado válido | `SERIALIZED_AND_VALIDATED` | sim |
| `StdoutEvidence` | não vazio/redigido | `NONEMPTY_REDACTED` | sim |
| `StderrEvidence` | vazio | `NONEMPTY_REDACTED` | não |
| processos residuais | zero | zero | sim |

Árvore observada:

| PID | Parent PID | Nome | Path | Relação | Classificação |
| ---: | ---: | --- | --- | --- | --- |
| 7968 | 24072 | `powershell.exe` | `C:\Windows\System32\WindowsPowerShell\v1.0\powershell.exe` | raiz | `EXPECTED` |
| 20320 | 7968 | `conhost.exe` | `C:\Windows\system32\conhost.exe` | filho válido da raiz | `EXPECTED` |

Captura assíncrona: `stdoutTask.Wait(2000)` e `stderrTask.Wait(2000)` concluíram;
não houve timeout; ambos os streams foram capturados antes da validação; nenhuma
task permaneceu pendente depois do cleanup. O stdout foi mantido redigido e não vazio.
O stderr foi mantido redigido, porém estava inesperadamente não vazio.

Serialização final: `EndedUtc=2026-07-27T23:57:29.7450037Z`,
`HarnessCompleted=true`, estado `SERIALIZED_AND_VALIDATED` e round-trip correspondente
ao objeto final retornado. Como o stderr não estava vazio, o validador rejeitou a
evidência antes de executar `ConvertFrom-Json`; portanto esta execução não comprovou
nem o parse do stdout nem a propriedade booleana `ok=true`.

Estado posterior: zero Claude, MCP, Node/npm/npx/Codex ou processo residual; zero
processo novo proibido; perfil e worktree inalterados; todos os processos observados
foram `EXPECTED`. O hard stop foi aplicado sem retry, sem executar outra fixture,
casos A/B ou qualquer gate E2–E5.

Veredito da execução: **R1-1 REPROVADA** por stderr inesperado e evidência
estruturada não validada. A revisão independente condicionada à aprovação da R1-1
não foi solicitada.
