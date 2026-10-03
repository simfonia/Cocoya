// P1-6 守門：外部進程啟動（Rust Command / Node terminal.sendText）的安全與正確性。
// 原始出發點：稽核計畫 §3 P1-6「Rust 15 處 Command::new 未見集中白名單」。
// 本次複核確認三類真實缺陷並修正：
//   F1 reset_firmware 的 esptool 硬編碼 "python"，忽略使用者設定的 python_path
//   F2 VSIX firmwareOps 以 terminal.sendText 送進互動式 PowerShell，插入值未跳脫（注入）
//   F3 start_training 未註冊於 invoke_handler（Tauri 無法呼叫；且其 Command::new("python") 同 F1 病根）
// 本檔為「掃描型」守門：新增進程啟動點時自動被涵蓋，非列清單。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.join(here, '..', '..', '..', '..');
const read = (...p) => fs.readFileSync(path.join(repoRoot, ...p), 'utf8');

function rustSources() {
    const dir = path.join(repoRoot, 'src-tauri', 'src');
    const out = [];
    const walk = (d) => {
        for (const entry of fs.readdirSync(d, { withFileTypes: true })) {
            const full = path.join(d, entry.name);
            if (entry.isDirectory()) walk(full);
            else if (entry.name.endsWith('.rs')) out.push({ file: path.relative(repoRoot, full), src: fs.readFileSync(full, 'utf8') });
        }
    };
    walk(dir);
    return out;
}

const rust = rustSources();

test('P1-6 守門 1：Rust 不得以 shell 啟動外部進程', () => {
    const offenders = [];
    for (const { file, src } of rust) {
        if (/(Command::new\s*\(\s*"(?:sh|bash|cmd(?:\.exe)?)"\s*\)[^;]{0,300}?-[cu]\b)/s.test(src)) {
            offenders.push(file);
        }
    }
    assert.deepEqual(offenders, [], 'Rust 以 shell 啟動進程：' + offenders.join(', '));
});

test('P1-6 守門 2：Rust 使用者輸入必須以 argv 陣列逐項傳入（非字串格式化）', () => {
    const offenders = [];
    for (const { file, src } of rust) {
        const hits = [...src.matchAll(/\.arg\(\s*format!\(/g)];
        if (hits.length) offenders.push(file + ' ×' + hits.length);
    }
    assert.deepEqual(offenders, [], '.arg(format!(...)) 會失去 argv 邊界：' + offenders.join(', '));
});

// 先剝除行註解（Rust）—— 否則註解裡舉例的 Command::new("python") 會被當成真實程式碼（假紅）
function stripLineComments(src) {
    return src.replace(/\/\/.*$/gm, '');
}

test('P1-6 守門 3：不得硬編碼 Command::new("python")，須使用使用者設定的 python_path', () => {
    // F1 病根：燒錄/執行鏈忽略硬體頁設定的 Python。使用者指向 venv 時會失敗。
    // 放行的僅限「已查證的 fallback 語境」（非直接硬編碼啟動）。
    const offenders = [];
    for (const { file, src } of rust) {
        const code = stripLineComments(src);
        const codeLines = code.split('\n');
        for (const m of code.matchAll(/Command::new\(\s*"python"\s*\)/g)) {
            const lineNo = code.slice(0, m.index).split('\n').length;
            const lineText = codeLines[lineNo - 1] || '';
            const isFallback = /_ =>|unwrap_or_else|reset_firmware_python/.test(lineText);
            if (!isFallback) offenders.push(file + ':' + lineNo + '  ' + lineText.trim());
        }
    }
    assert.deepEqual(offenders, [], '硬編碼 Command::new("python")：' + offenders.join(' | '));
});

test('P1-6 守門 3b：接受 python_path 的 command 不得棄用它而回退常數（F1 迴歸）', () => {
    // 變異測試抓到的缺口：把 `python_path.unwrap_or_else(...)` 改成 `let py = "python"` 時，
    // 守門 3 抓不到（已非 Command::new("python") 字面）。故另立此守門：
    // 凡簽名含 python_path 的 command，函式體內必須實際引用 python_path。
    const offenders = [];
    for (const { file, src } of rust) {
        const code = stripLineComments(src);
        for (const m of code.matchAll(/#\[tauri::command\][\s\S]{0,200}?pub\s+(?:async\s+)?fn\s+(\w+)\s*\(([\s\S]*?)\)\s*->/g)) {
            const fnName = m[1];
            const params = m[2];
            if (!/python_path:\s*(Option<String>|String)/.test(params)) continue;
            const params2 = rustSignature(code, fnName) || '';
            if (!/python_path:\s*(Option<String>|String)/.test(params2)) continue;
            // 取出函式體（大括號配對）
            const bodyStart = code.indexOf('{', code.indexOf('fn ' + fnName));
            let depth = 0, end = bodyStart;
            for (let i = bodyStart; i < code.length; i++) {
                if (code[i] === '{') depth++;
                else if (code[i] === '}') { depth--; if (depth === 0) { end = i; break; } }
            }
            const body = code.slice(bodyStart, end);
            if (!/\bpython_path\b/.test(body)) {
                offenders.push(file + '::' + fnName + '（簽名收了 python_path，函式體卻未使用）');
            }
        }
    }
    assert.deepEqual(offenders, [], 'python_path 遭棄用（F1 迴歸）：' + offenders.join(' | '));
});

// 取出 Rust 函式簽名區塊（大括號配對前的參數清單），避免用 slice 猜長度
function rustSignature(src, fnName) {
    const start = src.indexOf('fn ' + fnName + '(');
    if (start < 0) return null;
    const open = src.indexOf('(', start);
    let depth = 0;
    for (let i = open; i < src.length; i++) {
        if (src[i] === '(') depth++;
        else if (src[i] === ')') { depth--; if (depth === 0) return src.slice(open + 1, i); }
    }
    return null;
}

test('P1-6 守門 4：reset_firmware 簽名含 python_path 且燒錄使用它（F1）', () => {
    const mcu = read('src-tauri', 'src', 'commands', 'mcu', 'firmware.rs');
    const params = rustSignature(mcu, 'reset_firmware');
    assert.ok(params, 'reset_firmware 簽名未找到');
    assert.ok(/python_path:\s*Option<String>/.test(params),
        'reset_firmware 未接收 python_path（F1 迴歸）');
    assert.ok(/Command::new\(reset_firmware_python\(&python_path\)\)/.test(mcu),
        'reset_firmware 燒錄未使用 reset_firmware_python(&python_path)');
    assert.ok(/Some\(p\) if !p\.trim\(\)\.is_empty\(\) => p\.trim\(\)/.test(mcu),
        'reset_firmware_python 未處理空白字串');
    assert.ok(/_ => "python"/.test(mcu), 'reset_firmware_python 缺少空值回退');
});

test('P1-6 守門 5：前端 reset_firmware invoke 必須帶 pythonPath（跨語言簽名同步鐵律）', () => {
    const tauriJs = read('ui', 'src', 'bridge', 'tauri.js');
    // 以 Rust 簽名反推前端必須送齊的參數，避免在本檔寫死字串比對
    const mcu = read('src-tauri', 'src', 'commands', 'mcu', 'firmware.rs');
    const params = rustSignature(mcu, 'reset_firmware');
    const rustParams = [...params.matchAll(/(\w+):\s*(Option<String>|String|bool)/g)]
        .map((m) => ({ name: m[1], type: m[2] }));
    assert.ok(rustParams.length >= 4, '解析 Rust 參數失敗');

    // 以 case 分隔取得真正的 reset_firmware 區段（lastIndexOf 會取到檔尾的無關 case）
    const caseIdx = tauriJs.indexOf("case 'resetFirmware'");
    const nextIdx = tauriJs.indexOf("\n                case '", caseIdx + 10);
    const invokeBlock = tauriJs.slice(caseIdx, nextIdx < 0 ? caseIdx + 900 : nextIdx);
    assert.ok(invokeBlock.includes("'reset_firmware'"), 'tauri.js 找不到 reset_firmware 呼叫端');
    for (const p of rustParams) {
        const camel = p.name.replace(/_([a-z])/g, (_, c) => c.toUpperCase());
        assert.ok(new RegExp('\\b' + camel + ':').test(invokeBlock),
            `tauri.js reset_firmware 未送 ${camel}（Rust 參數 ${p.name}: ${p.type}）`);
    }
    assert.ok(/pythonPath: localStorage\.getItem\('pythonPath'\)/.test(invokeBlock),
        'pythonPath 應取自 localStorage 權威來源（非不存在的欄位）');
});
test('P1-6 守門 6：terminal.sendText 的插入值必須經 psQuote 跳脫（F2 注入）', () => {
    const fw = read('src', 'handlers', 'firmwareOps.ts');
    // 先切掉 psQuote 函式本體（其 template literal 內含 ${}，會自我匹配）
    const psQuoteEnd = fw.indexOf('function psQuote');
    const scanRegion = psQuoteEnd < 0 ? fw : fw.slice(0, psQuoteEnd) + fw.slice(fw.indexOf('}', fw.indexOf('return', psQuoteEnd)) + 1);
    // 掃描範圍必須涵蓋「組出 shell 字串」的所有位置：
    //   (a) sendText(`...`) 直接呼叫
    //   (b) `cmd += ...` 先累積再 sendText(cmd) 的間接組法
    // 只抓 (a) 會漏掉 (b) —— 本守門初版正是這樣假綠（變異測試抓出）。
    const shellBuilders = [
        ...[...scanRegion.matchAll(/sendText\(\s*`([\s\S]*?)`\s*\)/g)].map((m) => m[1]),
        ...[...scanRegion.matchAll(/=\s*`([^`]*\$\{[^`]*`)/g)].map((m) => m[1]),
    ];
    assert.ok(shellBuilders.length >= 3, `預期至少 3 處 shell 字串組裝，實得 ${shellBuilders.length}`);
    for (const body of shellBuilders) {
        const interps = [...body.matchAll(/\$\{([^}]+)\}/g)].map((m) => m[1]);
        for (const expr of interps) {
            // chip 為程式內部三元結果、非使用者輸入，可直接插入（白名單附原因）
            if (/^chip$/.test(expr.trim())) continue;
            assert.ok(/psQuote\(/.test(expr),
                `shell 字串插入值未經 psQuote 跳脫（P1-6 F2 注入面）：\${${expr}}`);
        }
    }
    assert.ok(!/sendText\(`[^`]*& "\$\{/.test(fw), 'sendText 仍有未跳脫的 & "${...}" 寫法');
    assert.ok(!/\+=\s*`[^`]*\$\{(?:seg|serialPort|pythonPath|e[A-Z]\w*)\b/.test(fw),
        '仍有以未跳脫方式累積使用者輸入的 shell 字串');
});

test('P1-6 守門 7：psQuote 實作正確（以函式行為驗證，不只驗原始碼字串）', () => {
    const fw = read('src', 'handlers', 'firmwareOps.ts');
    const m = fw.match(/function psQuote\(value: string\): string \{\s*return (`[^`]+`);/);
    assert.ok(m, 'psQuote 定義不存在或不是單行 template literal');
    // 自原碼抽出表達式實際求值 —— 照抄偵測邏輯只會驗到複製品。
    // 注意：new Function(...) 本身即為函式，不可再立即呼叫（否則拿到的是呼叫結果而非函式）
    const psQuote = new Function('value', 'return ' + m[1]);
    assert.equal(typeof psQuote, 'function');
    assert.equal(psQuote('C:\\a b\\python.exe'), "'C:\\a b\\python.exe'");
    assert.equal(psQuote("it's"), "'it''s'", '單引號必須加倍');
    assert.equal(psQuote('a$(Get-Process)b'), "'a$(Get-Process)b'", '單引號內不應展開子表達式');
    assert.equal(psQuote('x"y'), "'x\"y'", '單引號內雙引號無特殊意義');
});

test('P1-6 守門 8：#[tauri::command] 未註冊於 invoke_handler 者須列入白名單且真實存在（F3）', () => {
    const libRs = read('src-tauri', 'src', 'lib.rs');
    const handler = libRs.slice(libRs.indexOf('generate_handler!['));
    // P2-5 後 command 註冊改用完整子模組路徑（commands::mcu::board::get_serial_ports），
    // 故比對時取路徑最後一段為函式名。
    const registered = new Set([...handler.matchAll(/commands::([\w:]+)/g)]
        .map((m) => m[1].split('::').pop()));
    // 白名單：每項必須附原因，且真的存在（避免過期白名單默默放寬守門）
    const UNREGISTERED_OK = [
        { name: 'start_training', reason: 'P1-6 F3：已停用（Tauri 訓練走 py_ai_train_run → run_python / trainRemote），待 P3-3 刪除' },
    ];
    const okSet = new Set(UNREGISTERED_OK.map((x) => x.name));
    const commands = new Set();
    for (const { src } of rust) {
        for (const m of src.matchAll(/#\[tauri::command\]\s*(?:#\[[^\]]*\]\s*)*pub\s+(?:async\s+)?fn\s+(\w+)/g)) {
            commands.add(m[1]);
        }
    }
    for (const c of [...commands].filter((c) => !registered.has(c))) {
        assert.ok(okSet.has(c), `#[tauri::command] ${c} 未註冊於 invoke_handler 且未列入白名單（Tauri 無法呼叫）`);
    }
    for (const x of UNREGISTERED_OK) {
        assert.ok(x.reason && x.reason.length > 10, `白名單 ${x.name} 必須附原因`);
        assert.ok(commands.has(x.name), `白名單 ${x.name} 已不存在，請移除白名單`);
    }
});

test('P1-6 守門 9：docs/backend_api_manifest.md 的 reset_firmware 參數與 Rust 簽名一致（SSOT）', () => {
    const doc = read('docs', 'backend_api_manifest.md');
    // 取「參數表」中的那一列（含 `| mcu |` 前綴），排除摘要表首列
    const row = doc.split('\n').find((l) => /^\|\s*mcu\s*\|\s*reset_firmware\s*\|/.test(l));
    assert.ok(row, 'manifest 參數表缺 reset_firmware 列');
    assert.ok(/python_path: Option<String>/.test(row), 'manifest 未記錄 python_path（F1 新增參數）');
    assert.ok(/pythonPath\?/.test(row), 'manifest 前端欄位未記錄 pythonPath?');
});