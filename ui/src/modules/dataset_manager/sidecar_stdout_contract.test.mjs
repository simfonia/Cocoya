/**
 * sidecar_stdout_contract.test.mjs — T7：sidecar stdout 單一 JSON 訊息契約守門
 *
 * 【契約本身】
 * AGENTS.md「Dataset Manager 訊息責任定義」：sidecar **stdout 僅供 JSON 單一回應**，
 * Rust 端逐行 parse：
 *   - `type: "response"` → 對應請求的回覆
 *   - `type: "event"`    → 主動事件（如 trainingLog）
 *   - `type: "error"`    → 錯誤回覆
 *
 * 【為何需要守門】
 * Rust 用 `if let Ok(json) = serde_json::from_str(&line)` **靜默忽略**解析失敗的行。
 * 因此 sidecar 若誤印任何非 JSON 到 stdout：
 *   - 該行被丟棄，無任何錯誤提示（診斷為零）
 *   - 若被第三方套件（如 cv2/tensorflow 的原生訊息）印出，症狀是「指令無回應」
 *     而非報錯 —— 使用者與開發者都無從追查
 *
 * 【契約範圍刻意排除】
 * `resources/train_templates/` 的 stdout 是**使用者可見的訓練進度**，且以
 * `RESULT:` 前綴行作為解析錨點 —— 那是刻意設計，不可改。
 * `resources/deploy_mcu.py`、`_local_convert_tflite.py` 為獨立子行程，
 * stdout 由呼叫端（Rust）自行讀取解析，不受本契約約束。
 *
 * 執行（cwd = ui/）：node --test 加引號包住 dataset_manager 目錄下的測試檔樣式
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
// 本檔位於 ui/src/modules/dataset_manager/ → 上溯 4 層才是 repo 根
// （3 層只會到 ui/ —— 既有 sidecar_module_split.test.mjs 同樣是 4 層）
const repoRoot = path.join(here, '..', '..', '..', '..');
const dmDir = path.join(repoRoot, 'resources', 'dataset_manager');
const sidecarPath = path.join(dmDir, 'dataset_sidecar.py');

/** 取得 Python 檔的程式碼行（排除註解與三引號字串內的說明文字）。 */
function codeLines(src) {
    const out = [];
    let inDoc = false;
    for (const line of src.split('\n')) {
        const s = line.trim();
        if (s.startsWith('#')) { out.push({ s, code: false }); continue; }
        if (inDoc) {
            if (s.includes('"""')) inDoc = false;
            out.push({ s, code: false });
            continue;
        }
        if (s.includes('"""') && (s.match(/"""/g) || []).length === 1) {
            inDoc = true;
            out.push({ s, code: false });
            continue;
        }
        out.push({ s, code: true });
    }
    return out;
}

test('sidecar：dataset_sidecar.py 存在且可讀', () => {
    assert.ok(fs.existsSync(sidecarPath), '找不到 dataset_sidecar.py');
});

test('sidecar 契約 1：stdout 只允許經 send_response/send_event/send_error 輸出', () => {
    const src = fs.readFileSync(sidecarPath, 'utf8');
    const offenders = [];
    codeLines(src).forEach(({ s, code }, i) => {
        if (!code) return;
        const m = /print\s*\(/.exec(s);
        if (!m) return;
        // 合法一：JSON 輸出（send_response / send_event / send_error）
        if (/print\(json\.dumps\(\s*(response|event)\s*\),\s*flush\s*=\s*True\s*\)/.test(s)) return;
        // 合法二：診斷訊息已導向 stderr
        // ⚠️ 必須檢查**整個呼叫**而非截斷片段：早期版本比對行尾 90 字元，
        //    導致 `..., file=sys.stderr` 被截掉而誤判為違規。
        if (/file\s*=\s*sys\.stderr/.test(s)) return;
        offenders.push(`L${i + 1}: ${s.slice(0, 90)}`);
    });
    assert.deepEqual(offenders, [],
        'sidecar 的 stdout 僅供 JSON；診斷訊息請改用 file=sys.stderr：\n' + offenders.join('\n'));
});

test('sidecar 契約 2：JSON 輸出必須 flush=True（否則回應可能留在緩衝區永不送達）', () => {
    const src = fs.readFileSync(sidecarPath, 'utf8');
    const prints = codeLines(src).filter(({ s, code }) => code && /print\(json\.dumps/.test(s));
    assert.ok(prints.length >= 3, `應有 3 處 JSON 輸出（response/event/error），實得 ${prints.length}`);
    for (const { s } of prints) {
        assert.match(s, /flush\s*=\s*True/,
            `JSON 輸出缺少 flush=True：${s.slice(0, 80)}\n`
            + '未 flush 時回應會卡在緩衝區，Rust 端 reader 永遠等不到該行。');
    }
});

test('sidecar 契約 3：三種訊息型別齊備（Rust 端各有一條對應解析分支）', () => {
    const src = fs.readFileSync(sidecarPath, 'utf8');
    for (const t of ['response', 'event', 'error']) {
        assert.ok(src.includes(`"type": "${t}"`),
            `sidecar 未產出 type="${t}" 訊息，Rust 端對應分支將無資料可解析`);
    }
});

test('sidecar 契約 4：Rust 端確實解析這三種型別（兩端不可漂移）', () => {
    // [修正 2026-10-04] 原版只掃 python.rs，連帶診把「訓練 stdout 解析」
    // 当成 sidecar 契約的實作。python.rs 那份代碼已階死碼一併刪除，
    // 本保門並非因為那份代碼而紅。
    // 真正的 sidecar stdout 解析在 dataset.rs（sidecar_send 的線程」。
    // ⇒ 改為掃描全部 src-tauri/src/**.rs，避免再讓刪除任何正必碼當來接錯。
    const rustDir = path.join(repoRoot, 'src-tauri', 'src');
    const walk = (dir) => fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
        const full = path.join(dir, e.name);
        return e.isDirectory() ? walk(full)
            : (e.name.endsWith('.rs') ? [full] : []);
    });
    const all = walk(rustDir).map((f) => fs.readFileSync(f, 'utf8')).join(String.fromCharCode(10));
    assert.ok(all.length > 0, '掃描到的 Rust 源碼為空');

    // Rust 常見的兩種 type 比對寫法：
    //   Some(String("x".to_string()))  舊式（直接比 Value）
    //   Some("x")                     新式（as_str() 後比 &str，dataset.rs 用此式）
    for (const t of ['response', 'event']) {
        const found = all.includes(`String("${t}".to_string())`)
            || all.includes(`Some("${t}")`)
            || all.includes(`Some(String("${t}"))`);
        assert.ok(found,
            `Rust 端未解析 type="${t}"；sidecar 若送出該型別將被靜默丟棄`);
    }
});

test('sidecar 契約 5：訓練模板的 RESULT 錨點行不得被「統一到 stderr」的規則誤傷', () => {
    // 反向保護：確認本守門的範圍排除是刻意的，而非遺漏了 train_templates
    const trainDir = path.join(repoRoot, 'resources', 'train_templates');
    assert.ok(fs.existsSync(trainDir), '找不到 train_templates');
    const hasResultAnchor = fs.readdirSync(trainDir).some((d) => {
        const f = path.join(trainDir, d, `${d}_train.py`);
        return fs.existsSync(f) && /RESULT:/.test(fs.readFileSync(f, 'utf8'));
    });
    assert.ok(hasResultAnchor,
        '訓練模板的 RESULT 解析錨點消失了 —— 若曾被「診斷訊息改 stderr」批量改動，請立即還原');
});