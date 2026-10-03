// P1-5 守門：sidecar 不得在未告知使用者下自動 pip install 套件。
// 原始缺陷：dataset_sidecar.py 於 module level 直接 `pip install paramiko`，
// 會在使用者不知情下修改全域 Python 環境（離線必失敗、可能觸及權限提升）。
// 現行契約：一律降級為錯誤碼 SSH_PARAMIKO_MISSING，由前端 i18n 顯示安裝指引。
// 本檔為「掃描型」守門（遍历原始碼斷言），非清單式 —— 新增使用點時自動被涵蓋。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.join(here, '..', '..', '..', '..');
const read = (...p) => fs.readFileSync(path.join(repoRoot, ...p), 'utf8');

const sidecar = read('resources', 'dataset_manager', 'dataset_sidecar.py');
// P2-3（2026-10-03）：paramiko 使用點、task 映射、遠端同步與 Docker 段已抽出為獨立模組
const remoteSsh = read('resources', 'dataset_manager', 'remote_ssh.py');
// 掃描範圍涵蓋全部 sidecar 模組（P2-3 拆分後，新增檔案自動納入）
const scanAll = sidecar + '\n' + remoteSsh + '\n'
    + read('resources', 'dataset_manager', 'local_training.py') + '\n'
    + read('resources', 'dataset_manager', 'remote_tflite.py') + '\n'
    + read('resources', 'dataset_manager', 'remote_sync.py') + '\n'
    + read('resources', 'dataset_manager', 'remote_docker.py');
const tauriJs = read('ui', 'src', 'bridge', 'tauri.js');
const baseJs = read('ui', 'src', 'ui', 'base.js');
const trainingOps = read('src', 'handlers', 'trainingOps.ts');
const envOps = read('src', 'handlers', 'envOps.ts');
const zhHant = read('ui', 'src', 'zh-hant.js');
const en = read('ui', 'src', 'en.js');
const pythonModules = JSON.parse(read('config', 'python_modules.json'));

const ERROR_CODE = 'SSH_PARAMIKO_MISSING';

test('P1-5 守門 1：sidecar 全檔不得自動 pip install 任何套件', () => {
    const offenders = [...scanAll.matchAll(/["']install["']\s*,\s*["'][A-Za-z0-9_.\-=]+["']/g)]
        .map((m) => m[0]);
    assert.deepEqual(offenders, [], 'sidecar 出現 pip install 自動安裝：' + offenders.join(', '));
    // 連 subprocess pip 呼叫整體都不該存在（本專案安裝一律走 UI 明確按鈕）
    assert.ok(!/["']-m["']\s*,\s*["']pip["']/.test(scanAll),
        'sidecar 仍以 python -m pip 呼叫安裝；安裝必須由使用者於 UI 明確觸發');
});

test('P1-5 守門 2：四個 SSH 使用點一律走 _require_paramiko() 並回報錯誤碼', () => {
    // P2-3（2026-10-03）：四個使用點已抽出至 remote_ssh.py，主檔僅保留常數
    const uses = [...remoteSsh.matchAll(/paramiko, _pk_err = _require_paramiko\(\)\s*\n\s*if _pk_err:[\s\S]{0,400}?"errorCode": _pk_err/g)];
    assert.equal(uses.length, 4, `僅 ${uses.length}/4 個使用點在缺裝分支回報 errorCode`);
    assert.ok(/def _require_paramiko\(\)/.test(remoteSsh), 'remote_ssh 缺 _require_paramiko 定義');

    // 兩檔皆不得有裸 import paramiko（模組層 try/except 自動安裝的遺留）
    const bare = [...(sidecar + '\n' + remoteSsh).matchAll(/^\s*import paramiko\s*$/gm)].map((m) => m[0]);
    assert.deepEqual(bare, [], '仍有裸 import paramiko：' + bare.join(' | '));
});

test('P1-5 守門 3：sidecar 不得輸出 paramiko 缺失的展示用文案（文案由前端 i18n 負責）', () => {
    // 判準落在真正送給前端的欄位值（"error": "..."），而非任意中文字串。
    // 曾一度掃全文命中 _require_paramiko 的 docstring（註解本就可以中文）→ 假紅，已收斂。
    const errorValues = [...scanAll.matchAll(/"error":\s*"([^"]*)"/g)].map((m) => m[1]);
    const offenders = [...new Set(errorValues.filter((v) => /paramiko/i.test(v) && /[\u4e00-\u9fff]/.test(v)))];
    assert.deepEqual(offenders, [], 'sidecar 仍回傳中文展示文案：' + offenders.join(' | '));
});

test('P1-5 守門 4：錯誤碼常數與 i18n 鍵雙語系齊備且值相同', () => {
    assert.ok(sidecar.includes(`PARAMIKO_MISSING = "${ERROR_CODE}"`),
        `sidecar 錯誤碼常數應為 "${ERROR_CODE}"`);
    const pick = (src) => {
        const m = src.match(/["']MSG_PARAMIKO_MISSING["']\s*:\s*"([^"]*)"/);
        return m ? m[1] : null;
    };
    const zh = pick(zhHant);
    const enVal = pick(en);
    assert.ok(zh, 'zh-hant.js 缺 MSG_PARAMIKO_MISSING');
    assert.ok(enVal, 'en.js 缺 MSG_PARAMIKO_MISSING');
    assert.notEqual(zh, enVal, '雙語系值相同，未翻譯');
});

test('P1-5 守門 5：兩平台橋接層皆透傳 errorCode 給前端', () => {
    // Tauri：trainRemote 失敗與 uploadDataset 失敗
    const trainDispatch = tauriJs.slice(tauriJs.indexOf("case 'startRemoteTraining'"), tauriJs.indexOf("case 'stopRemoteTraining'"));
    assert.ok(/errorCode: response\.errorCode/.test(trainDispatch),
        'Tauri startRemoteTraining 未透傳 errorCode');
    const uploadDispatch = tauriJs.slice(tauriJs.indexOf("case 'datasetUploadArchive'"));
    assert.ok(/command: 'datasetUploadResult'[\s\S]{0,200}errorCode: response\.errorCode/.test(uploadDispatch),
        'Tauri datasetUploadArchive 未透傳 errorCode');

    // VSIX Host：trainingError / checkRemoteEnvironmentResult
    assert.ok(/command: 'trainingError'[\s\S]{0,200}errorCode: resp\.errorCode/.test(trainingOps),
        'VSIX trainingOps 未透傳 errorCode');
    assert.ok(/command: 'checkRemoteEnvironmentResult'[\s\S]{0,200}errorCode: resp\.errorCode/.test(envOps),
        'VSIX envOps 未透傳 errorCode');
});

test('P1-5 守門 6：前端依錯誤碼轉 i18n 文案，而非直接顯示後端字串', () => {
    const handler = baseJs.slice(baseJs.indexOf("msg.command === 'trainingError'"));
    assert.ok(handler.includes(`'${ERROR_CODE}'`),
        'ui/base.js trainingError 未判斷 paramiko 缺裝錯誤碼');
    assert.ok(/Msg\['MSG_PARAMIKO_MISSING'\]/.test(handler),
        'ui/base.js trainingError 未以 i18n 鍵顯示指引');
});

test('P1-5 守門 7：指引文案所指的安裝途徑確實存在（config/python_modules.json 含 paramiko）', () => {
    const ids = pythonModules.modules.map((m) => m.id);
    assert.ok(ids.includes('paramiko'),
        'python_modules.json 缺 paramiko，則 MSG_PARAMIKO_MISSING 指向的安裝途徑不存在');
});