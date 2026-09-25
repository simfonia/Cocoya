import * as path from 'path';

/** VS Code terminal 的 shell 類型；Windows 未設定 shell 時沿用既有 PowerShell 行為。 */
export type SerialShellKind = 'powershell' | 'cmd' | 'bash';

export function detectSerialShellKind(shell: string, platform: string): SerialShellKind {
    const normalized = (shell || '').toLowerCase().replace(/\\/g, '/');
    if (normalized.includes('powershell') || normalized.includes('pwsh')) return 'powershell';
    if (normalized.includes('cmd.exe') || normalized.endsWith('/cmd')) return 'cmd';
    if (normalized.includes('bash') || normalized.includes('zsh')) return 'bash';
    return platform === 'win32' ? 'powershell' : 'bash';
}

function quoteForPowerShell(value: string): string {
    return `'${value.replace(/'/g, "''")}'`;
}

function quoteForBash(value: string): string {
    return `'${value.replace(/'/g, `'"'"'`)}'`;
}

/**
 * 產生只在目前 VS Code terminal 命令生效的 Raw Dump 環境前綴。
 * 關閉時明確設 0 並清除路徑，避免繼承使用者先前 export 的診斷設定。
 */
export function buildSerialRawDumpEnvPrefix(
    enabled: boolean,
    projectRoot: string | undefined,
    shellKind: SerialShellKind
): string {
    if (!enabled) {
        if (shellKind === 'powershell') {
            return "$env:COCOYA_SERIAL_RAW_DUMP='0'; Remove-Item Env:COCOYA_SERIAL_RAW_DUMP_PATH -ErrorAction SilentlyContinue; ";
        }
        if (shellKind === 'cmd') {
            return 'set "COCOYA_SERIAL_RAW_DUMP=0" && set "COCOYA_SERIAL_RAW_DUMP_PATH=" && ';
        }
        return 'export COCOYA_SERIAL_RAW_DUMP=0; unset COCOYA_SERIAL_RAW_DUMP_PATH; ';
    }

    if (!projectRoot) throw new Error('PROJECT_ROOT_REQUIRED');
    const dumpPath = path.join(projectRoot, 'raw_dump.log');
    if (shellKind === 'powershell') {
        return `$env:COCOYA_SERIAL_RAW_DUMP='1'; $env:COCOYA_SERIAL_RAW_DUMP_PATH=${quoteForPowerShell(dumpPath)}; `;
    }
    if (shellKind === 'cmd') {
        return `set "COCOYA_SERIAL_RAW_DUMP=1" && set "COCOYA_SERIAL_RAW_DUMP_PATH=${dumpPath}" && `;
    }
    return `export COCOYA_SERIAL_RAW_DUMP=1; export COCOYA_SERIAL_RAW_DUMP_PATH=${quoteForBash(dumpPath)}; `;
}

/** 依 shell 產生 Python 呼叫前綴；PowerShell 執行檔需使用 call operator。 */
export function buildPythonInvocationPrefix(pythonPath: string, shellKind: SerialShellKind): string {
    return shellKind === 'powershell' ? `& "${pythonPath}"` : `"${pythonPath}"`;
}
