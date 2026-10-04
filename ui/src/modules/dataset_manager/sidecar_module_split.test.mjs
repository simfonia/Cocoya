import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.join(here, '..', '..', '..', '..');
const read = (...p) => fs.readFileSync(path.join(repoRoot, ...p), 'utf8');
const dmDir = path.join(repoRoot, 'resources', 'dataset_manager');
// 專案慣用 Python（AGENTS.md：python.exe 不在 PATH）。可用 COCOYA_PYTHON 覆寫。
//
// ⚠️ **為何必須 fallback 到 PATH 的 'python'**（2026-10-04 CI 實測教訓）：
//   初版只認 COCOYA_PYTHON 與本機寫死路徑 `C:/WPy64-31160/...`，
//   兩者都不存在時就**直接把寫死路徑當答案**，於是 GitHub runner 上
//   spawn 到不存在的執行檔 -> 測試報 `ModuleNotFoundError: No module named 'numpy'`
//   —— **症狀（缺套件）與病因（用錯 Python）完全無關**，浪費一輪排查。
//
//   正確做法：候選依序嘗試，都不可用才 null（測試 skip 並說明原因）。
function resolvePython() {
    const candidates = [
        process.env.COCOYA_PYTHON,
        'C:/WPy64-31160/python-3.11.6.amd64/python.exe',  // 本機慣用
        'python',   // PATH（含 CI 上 setup-python 安裝的直譯器）
        'py',       // Windows Python Launcher
    ].filter(Boolean);
    for (const exe of candidates) {
        const probe = spawnSync(exe, ['-c', 'import sys,numpy;print(sys.version_info[0])'],
            { encoding: 'utf8', env: { ...process.env, PYTHONIOENCODING: 'utf-8', PYTHONUTF8: '1' } });
        // 同時驗「可執行」與「有 numpy」——缺套件的直譯器不比沒有的好
        if (probe.status === 0) return exe;
    }
    return null;
}

const pythonExe = resolvePython();
const PY_NOTE = pythonExe
    ? ''
    : '\n（找不到「可執行且具 numpy」的 Python：' +
      '請設 COCOYA_PYTHON 指向專案慣用直譯器，或 pip install -r requirements-dev.txt）';

const pyModules = fs.readdirSync(dmDir).filter((f) => f.endsWith('.py') && !f.startsWith('__'));

test('P2-3 守門 1：每個 sidecar 模組皆可獨立匯入（循環 import 守門）', () => {
    // ⚠️ 找不到 Python 時**明確失敗**而非靜默 skip ——
    //   CI 上靜默 skip 會讓「守門通過」變成假綠燈（實際上一個測試都沒跑）。
    assert.ok(pythonExe, '找不到可用的 Python' + PY_NOTE);
    // 本次拆分踩到的真實坑：remote_sync / remote_docker 反向 import remote_ssh 的 helper，
    // 頂層雙向 import 只有在特定 import 順序下才僥倖可用 —— 單獨 import remote_sync 立刻報
    // partially initialized module 的 ImportError。
    // 以單一子行程批次執行：每個模組 import 前先清除同族模組的 sys.modules 殘留，
    // 使各模組都在「乾淨」狀態下載入（模擬獨立 import），順序不論。
    // 不用逐模組 spawn：cv2/media_pipe 每次啟動約 2s，10 個模組會讓本測近 20s。
    assert.ok(pyModules.length >= 8, `dataset_manager 模組數 ${pyModules.length}，預期 >= 8`);
    const names = pyModules.map((f) => f.replace(/\.py$/, ''));
    const script = [
        'import sys, importlib',
        'names = ' + JSON.stringify(names),
        'for n in names:',
        '    for m in list(sys.modules):',
        "        if m.split('.')[0] in names:",
        '            del sys.modules[m]',
        '    importlib.import_module(n)',
        'print("ALL_OK")',
    ].join('\n');
    // ⚠️ PYTHONIOENCODING 必須携：`encoding` 只管讀取端，
    //   Python 寫出端在 Windows 預設是系統 ANSI 編碼（CI runner 是 cp1252）。
    const r = spawnSync(pythonExe, ['-c', script], {
        cwd: dmDir, encoding: 'utf-8', timeout: 180000,
        env: { ...process.env, PYTHONIOENCODING: 'utf-8', PYTHONUTF8: '1' }
    });
    assert.equal(r.status, 0,
        `側車模組獨立匯入失敗（循環 import？）\n${(r.stderr || '').slice(0, 500)}`);
    assert.ok((r.stdout || '').includes('ALL_OK'), '匯入批次未完成');
});

test('P2-3 守門 2：每個 sidecar 模組皆可 py_compile 且具模組層 docstring', () => {
    assert.ok(pythonExe, '找不到可用的 Python' + PY_NOTE);
    for (const f of pyModules) {
        const r = spawnSync(pythonExe, ['-m', 'py_compile', f], {
            cwd: dmDir, encoding: 'utf-8', timeout: 90000,
            env: { ...process.env, PYTHONIOENCODING: 'utf-8', PYTHONUTF8: '1' }
        });
        assert.equal(r.status, 0, `py_compile ${f} 失敗：\n${(r.stderr || '').slice(0, 300)}`);
        if (f === 'dataset_sidecar.py') continue;
        const src = fs.readFileSync(path.join(dmDir, f), 'utf8');
        assert.ok(/^\s*"""/m.test(src), `${f} 缺模組層 docstring（拆分後須說明職責與搬移來源）`);
    }
});

test('P2-3 守門 3：主檔不得長回巨型 if/elif 鏈，且指令分派須與預期集合完全一致', () => {
    const src = read('resources', 'dataset_manager', 'dataset_sidecar.py');
    const lines = src.split('\n').length;
    assert.ok(lines < 600, `dataset_sidecar.py 仍有 ${lines} 行（拆分目標 < 600）`);
    // 注意：首個分支是 `if command ==`，其餘為 `elif` —— 只抓 elif 會少算一個
    const dispatch = [...src.matchAll(/(?:^|\s)(?:el)?if command == "(\w+)":/gm)].map((m) => m[1]);

    // 判準落在「與預期集合完全一致」，不是「數量 >= N」。
    // 變異測試證實：只驗數量時，把 stopTraining 改名為 stopTrainingX 仍全綠（總數不變）
    // —— 指令靜默失效。使用者按下「中斷訓練」將無任何反應。
    const EXPECTED = [
        'ping', 'listCameras', 'getCameraStatus', 'startCamera', 'stopCamera',
        'captureImage', 'collectFeature', 'exportDataset',
        'checkRemoteEnvironment', 'uploadDataset', 'trainRemote', 'stopTraining',
        'trainLocal', 'exit',
    ];
    assert.deepEqual(dispatch.slice().sort(), EXPECTED.slice().sort(),
        '指令分派集合與預期不符（新增/遺失/更名皆須同步本清單與對應模組 handler）');

    // 刻意留在主檔的分支（附原因，不得擴大）：
    // exportDataset：166 行，本次拆分聚焦「遠端訓練」這條最長的鏈，匯出留待後續
    // ping：輕量健康檢查（單行回覆），抽成模組只會增加一次 import 成本
    // 拍到/特徵等相機指令：走 CameraService（已於 Stage 4 抽出），本檔只做分派
    const STILL_LOCAL = new Set(['exportDataset', 'ping', 'listCameras', 'getCameraStatus',
        'startCamera', 'stopCamera', 'captureImage', 'collectFeature', 'exit']);
    for (const cmd of dispatch) {
        if (STILL_LOCAL.has(cmd)) continue;
        const idx = src.indexOf(`command == "${cmd}"`);
        const seg = src.slice(idx, idx + 400);
        assert.ok(/^\s*(handle_|start_)/m.test(seg),
            `指令 ${cmd} 未委派給抽出模組的 handler`);
    }
    // 反向：EXPECTED 中不 STILL_LOCAL 的每個指令，其 handler 必須真的存在於某模組
    for (const cmd of dispatch) {
        if (STILL_LOCAL.has(cmd)) continue;
        const idx = src.indexOf(`command == "${cmd}"`);
        const seg = src.slice(idx, idx + 400);
        const fnName = (seg.match(/^\s*((?:handle_|start_)\w+)\(/m) || [])[1];
        assert.ok(fnName, `指令 ${cmd} 未能解析出 handler 函式名`);
        const all = pyModules.map((f) => fs.readFileSync(path.join(dmDir, f), 'utf8')).join('\n');
        assert.ok(new RegExp('def ' + fnName + '\\(').test(all),
            `指令 ${cmd} 呼叫的 ${fnName} 在任何模組中都不存在（分派會擲 NameError）`);
    }
});

test('P2-3 守門 4：抽出模組不得反向 import dataset_sidecar（循環與職責反轉）', () => {
    const offenders = [];
    for (const f of pyModules) {
        if (f === 'dataset_sidecar.py') continue;
        const src = fs.readFileSync(path.join(dmDir, f), 'utf8');
        if (/^\s*(from|import)\s+dataset_sidecar\b/m.test(src)) offenders.push(f);
    }
    assert.deepEqual(offenders, [],
        '抽出模組反向 import 主檔（循環 import 與職責反轉）：' + offenders.join(', '));
});

test('P2-3 守門 5：延遲 import 必須有註解說明（否則日後有人會「整理」回頂層而炸）', () => {
    // 本次為解決循環 import 用了函式內延遲 import；這是必要之惡，必須留下理由，
    // 否則 lint 整理時會被改回頂層 → ImportError。
    const src = read('resources', 'dataset_manager', 'remote_ssh.py');
    const lazy = [...src.matchAll(/^\s+(?:from remote_(?:sync|docker) import [^\n]+)$/gm)];
    for (const m of lazy) {
        const before = src.slice(Math.max(0, m.index - 320), m.index);
        assert.ok(/延遲 import|循環/.test(before),
            '延遲 import 附近缺「循環 import」原因註解：' + m[0].trim());
    }
});

test('P2-3 守門 6：遠端腳本映射 SSOT 單一（remote_ssh 宣告，remote_docker 不得內聯）', () => {
    const ssh = read('resources', 'dataset_manager', 'remote_ssh.py');
    const docker = read('resources', 'dataset_manager', 'remote_docker.py');
    assert.ok(/REMOTE_SCRIPTS\s*=\s*\{/.test(ssh), 'REMOTE_SCRIPTS 應宣告於 remote_ssh.py');
    assert.ok(/resolve_remote_script\(task_type\)/.test(docker),
        'remote_docker 未使用 resolve_remote_script（映射需單一來源）');
    assert.ok(!/script_rel\s*=\s*"image_classification\/image_classification_train\.py"/.test(docker),
        'remote_docker 又內聯了一份 script_rel 映射');
});

test('P2-3 守門 7：trainLocal task→腳本映射與前端分派一致，且模板目錄存在', () => {
    const localPy = read('resources', 'dataset_manager', 'local_training.py');
    const gen = read('ui', 'src', 'modules', 'ai_inference', 'ai_inference_generators.js');
    const localMap = Object.fromEntries(
        [...localPy.matchAll(/"(\w+)":\s*"(\w+)_train\.py"/g)].map((m) => [m[1], m[2]]));
    assert.ok(Object.keys(localMap).length >= 5,
        `local_training.TASK_SCRIPTS 僅 ${Object.keys(localMap).length} 項`);
    for (const task of ['image_classification', 'object_detection', 'line_following', 'table', 'feature']) {
        assert.ok(localMap[task], `local_training.TASK_SCRIPTS 缺 ${task}`);
        assert.ok(gen.includes(`${task}_train.py`),
            `前端 generators 未引用 ${task}_train.py（與 sidecar 映射不一致）`);
        assert.ok(fs.existsSync(path.join(repoRoot, 'resources', 'train_templates', task)),
            `train_templates/${task} 不存在於磁碟（映射寫死不存在的路徑）`);
    }
});

test('P2-3 守門 8：paramiko 缺裝錯誤碼在主檔與抽出模組間一致', () => {
    const sidecar = read('resources', 'dataset_manager', 'dataset_sidecar.py');
    const ssh = read('resources', 'dataset_manager', 'remote_ssh.py');
    const code = 'SSH_PARAMIKO_MISSING';
    assert.ok(sidecar.includes(`PARAMIKO_MISSING = "${code}"`), '主檔錯誤碼常數不符');
    assert.ok(ssh.includes(`PARAMIKO_MISSING = "${code}"`), 'remote_ssh 錯誤碼常數不符');
    // 抽出後 remote_ssh 必須自帶 _require_paramiko（不得依賴主檔）
    assert.ok(/def _require_paramiko\(\)/.test(ssh), 'remote_ssh 缺自帶的 _require_paramiko');
    assert.ok(!/from dataset_sidecar import/.test(ssh), 'remote_ssh 不得 import 主檔');
});

// ---------------------------------------------------------------------------
// P2-5：Rust commands 拆分成子模組後的結構契約
// ---------------------------------------------------------------------------

const tauriSrc = path.join(repoRoot, 'src-tauri', 'src');

function readRs(rel) {
    return fs.readFileSync(path.join(tauriSrc, ...rel.split('/')), 'utf8');
}

function rsFiles() {
    const out = [];
    const walk = (d, prefix) => {
        for (const e of fs.readdirSync(d, { withFileTypes: true })) {
            const full = path.join(d, e.name);
            if (e.isDirectory()) walk(full, prefix + e.name + '/');
            else if (e.name.endsWith('.rs')) out.push({ mod: prefix + e.name.replace(/\.rs$/, ''), src: fs.readFileSync(full, 'utf8') });
        }
    };
    walk(path.join(tauriSrc, 'commands'), '');
    return out;
}

test('P2-5 守門 1：mcu / file 巨型檔已拆分為目錄模組，且無同名舊檔', () => {
    for (const name of ['mcu', 'file']) {
        const dir = path.join(tauriSrc, 'commands', name);
        assert.ok(fs.existsSync(dir) && fs.statSync(dir).isDirectory(), `commands/${name}/ 目錄不存在`);
        assert.ok(!fs.existsSync(path.join(tauriSrc, 'commands', name + '.rs')),
            `commands/${name}.rs 舊檔仍存在（會與 ${name}/ 目錄同名衝突）`);
        const sub = fs.readdirSync(dir).filter((f) => f.endsWith('.rs'));
        assert.ok(sub.includes('mod.rs'), `commands/${name}/mod.rs 缺失`);
        assert.ok(sub.length >= 5, `commands/${name}/ 僅 ${sub.length} 檔，拆分未生效`);
        // 單檔不得再長回 500 行以上
        for (const f of sub) {
            const n = fs.readFileSync(path.join(dir, f), 'utf8').split('\n').length;
            assert.ok(n < 500, `commands/${name}/${f} 有 ${n} 行（拆分目標每檔 < 500）`);
        }
    }
});

test('P2-5 守門 2：lib.rs 的 command 註冊必用完整子模組路徑（Tauri __cmd__ 巨集限制）', () => {
    // 本次踩到的真實坑：`#[tauri::command]` 產生的 `__cmd__<fn>` 巨集**無法經 pub use 跨模組轉出**，
    // 寫 `commands::get_serial_ports` 會得到 E0433 failed to resolve。
    // 故凡屬於 mcu/ 或 file/ 子模組的 command，必須寫 `commands::mcu::board::get_serial_ports` 形式。
    const lib = readRs('lib.rs');
    const handler = lib.slice(lib.indexOf('generate_handler!['));
    const entries = [...handler.matchAll(/commands::([\w:]+),/g)].map((m) => m[1]);
    assert.ok(entries.length >= 40, `command 註冊數 ${entries.length}，預期 >= 40`);

    const mcuFns = ['get_serial_ports', 'deploy_mcu', 'open_serial_monitor', 'toggle_serial_monitor',
        'erase_filesystem', 'reset_firmware', 'set_window_focus'];
    const fileFns = ['get_manifest', 'get_module_toolbox', 'open_file', 'open_examples',
        'restore_examples', 'save_file', 'auto_backup', 'clear_backup', 'reject_recovery',
        'check_startup_backup', 'delete_file', 'dataset_rename_label', 'pick_folder',
        'pick_data_file', 'get_project_anchor', 'release_session', 'dataset_save_progress',
        'dataset_load_progress', 'dataset_import_from_folder'];
    for (const fn of [...mcuFns, ...fileFns]) {
        const re = new RegExp('commands::(mcu|file)::\\w+::' + fn + ',');
        assert.ok(re.test(handler),
            `lib.rs 的 ${fn} 未使用完整子模組路徑（__cmd__ 巨集無法經 pub use 轉出）`);
    }
});

test('P2-5 守門 3：每個 #[tauri::command] 都有同名 pub use 或完整路徑註冊（完整性）', () => {
    // 本次搬移的真實教訓：切割邊界把 `#[tauri::command]` / `#[derive(serde::Serialize)]`
    // 留在前一段尾端，清潔時一併刪掉 —— 編譯仍可能通過（少個屬性）但 command 未註冊、
    // 型別未序列化。使用者按鈕會靜默無反應。
    const lib = readRs('lib.rs');
    const handler = lib.slice(lib.indexOf('generate_handler!['));
    for (const { mod, src } of rsFiles()) {
        const cmds = [...src.matchAll(/#\[tauri::command\]\s*(?:#\[[^\]]*\]\s*)*pub (?:async )?fn (\w+)/g)]
            .map((m) => m[1]);
        for (const fn of cmds) {
            // start_training：P1-6 F3 已確認未註冊於 invoke_handler（Tauri 無法呼叫；訓練實際走
            //   py_ai_train_run → run_python / trainRemote）。待 P3-3 刪除整段死碼。
            if (fn === 'start_training') continue;
            const registered = new RegExp('commands::[\\w:]*' + fn + '\\s*[,)]').test(handler);
            assert.ok(registered, `commands/${mod} 的 command ${fn} 未在 lib.rs generate_handler 註冊`);
        }
    }
});

test('P2-5 守門 4：跨邊界回傳型別必須有 #[derive(serde::Serialize)]（AGENTS.md Rust 序列化鐵律）', () => {
    // 本次搬移曾把 RenamedPath 的 derive 屬性丟失 → E0599 blocking_kind 編譯失敗；
    // 但若型別本來就沒 derive，編譯會過而執行期序列化才炸，故在此顯式守門。
    for (const { mod, src } of rsFiles()) {
        // 直接以「pub struct 開頭位置」向前看 200 字元的屬性區塊。
        // （先前以 m.index 反推 start 造成偏移 → 假紅，已改為直接匹配行首。）
        for (const m of src.matchAll(/^pub struct (\w+)/gm)) {
            const name = m[1];
            const before = src.slice(Math.max(0, m.index - 200), m.index);
            const usedInCmd = new RegExp('Result<[^>]*' + name).test(src)
                || new RegExp('->\\s*' + name).test(src);
            if (!usedInCmd) continue;
            // 允許 serde::Serialize 或已 use 後的短名 Serialize（training.rs 用後者）
            const hasDerive = /#\[derive\((?:serde::)?Serialize[^\]]*\)\]/.test(before);
            assert.ok(hasDerive,
                `commands/${mod} 的 ${name} 用於 command 回傳值卻缺 #[derive(Serialize)]`);
            // AGENTS.md：Rust → JS 必須 camelCase
            assert.ok(/#\[serde\(rename_all\s*=\s*"camelCase"\)\]/.test(before),
                `commands/${mod} 的 ${name} 缺 #[serde(rename_all = "camelCase")]（前端會讀到 snake_case 欄位）`);
        }
    }
});

test('P2-5 守門 5：子模組不得反向引用同級子模組的非 pub(crate) 私有項', () => {
    // 編譯器擋得住，但錯誤訊息在跨檔時不易讀；此守門讓意圖顯式化：
    // 若某函式需跨子模組使用，必須在定義處標 pub(crate) 並在 mod.rs 註明用途。
    for (const name of ['mcu', 'file']) {
        const modRs = fs.readFileSync(path.join(tauriSrc, 'commands', name, 'mod.rs'), 'utf8');
        for (const m of modRs.matchAll(/^pub(?:\(crate\))? use [\w:]*::\{?([\w, ]+)\}?;/gm)) {
            const names = m[1].split(',').map((s) => s.trim()).filter(Boolean);
            for (const fn of names) {
                assert.ok(/^pub\(crate\) use/.test(m[0]) || /^pub use/.test(m[0]),
                    `commands/${name}/mod.rs 的 ${fn} 導出方式異常`);
            }
        }
    }
});