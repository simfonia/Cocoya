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
const pythonExe = process.env.COCOYA_PYTHON
    || 'C:/WPy64-31160/python-3.11.6.amd64/python.exe';

const pyModules = fs.readdirSync(dmDir).filter((f) => f.endsWith('.py') && !f.startsWith('__'));

test('P2-3 守門 1：每個 sidecar 模組皆可獨立匯入（循環 import 守門）', () => {
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
    const r = spawnSync(pythonExe, ['-c', script], { cwd: dmDir, encoding: 'utf-8', timeout: 180000 });
    assert.equal(r.status, 0,
        `側車模組獨立匯入失敗（循環 import？）\n${(r.stderr || '').slice(0, 500)}`);
    assert.ok((r.stdout || '').includes('ALL_OK'), '匯入批次未完成');
});

test('P2-3 守門 2：每個 sidecar 模組皆可 py_compile 且具模組層 docstring', () => {
    for (const f of pyModules) {
        const r = spawnSync(pythonExe, ['-m', 'py_compile', f], {
            cwd: dmDir, encoding: 'utf-8', timeout: 90000
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