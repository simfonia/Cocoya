import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

const hardwareSource = fs.readFileSync(new URL('./hardware.js', import.meta.url), 'utf8');
// [2026-10-04] 使用者偏好已收斂至 core/settings.js（掛 globalThis.CocoyaSettings）。
// 瀏覽器的 index.html 會先載 settings.js；此沙箱須如實反映該載入順序，
// 否則 hardware.js 的 CocoyaSettings 引用會 ReferenceError（測試誤報或盲點）。
const settingsSource = fs.readFileSync(new URL('../core/settings.js', import.meta.url), 'utf8');

function createHarness() {
    const values = new Map();
    const classes = new Set();
    const toggle = {
        classList: {
            toggle(name, enabled) {
                if (enabled) classes.add(name);
                else classes.delete(name);
            }
        },
        setAttribute(name, value) {
            this[name] = value;
        }
    };
    const context = {
        console,
        localStorage: {
            getItem(key) { return values.has(key) ? values.get(key) : null; },
            setItem(key, value) { values.set(key, value); },
            removeItem(key) { values.delete(key); }
        },
        document: {
            getElementById(id) {
                return id === 'btn-serial-raw-dump' ? toggle : null;
            }
        }
    };
    // ⚠️ 瀏覽器中 window === globalThis；沙箱預設 window 是獨立物件，
    //   會讓 settings.js 掛到 window.CocoyaSettings、而 hardware.js 在全域找不到
    //   → 假的 ReferenceError。此處顯式讓兩者同一參考，如實反映瀏覽器。
    context.window = context;
    // 先載 settings.js（SSOT），再載 hardware.js —— 對應 index.html 的實際順序
    vm.runInNewContext(settingsSource, context, { filename: 'settings.js' });
    vm.runInNewContext(hardwareSource, context, { filename: 'hardware.js' });
    return { ui: context.window.CocoyaUI, toggle, values };
}

test('Raw Dump switch defaults off and persists click changes', () => {
    const { ui, toggle, values } = createHarness();
    ui.initSerialRawDumpToggle();
    assert.equal(ui.isSerialRawDumpEnabled(), false);
    assert.equal(toggle['aria-checked'], 'false');

    toggle.onclick();
    assert.equal(ui.isSerialRawDumpEnabled(), true);
    // [2026-10-04] 偏好收斂至 core/settings.js 後，boolean 序列化為 '1'/'0'
    //   （舊碼以 String(bool) 寫出 'true'/'false'）。讀取端兩者皆相容（coerce），
    //   但新寫入一律為 '1'/'0' —— 斷言須反映現行契約。
    assert.equal(values.get('cocoya_serial_raw_dump_enabled'), '1');
    assert.equal(toggle['aria-checked'], 'true');

    toggle.onclick();
    assert.equal(ui.isSerialRawDumpEnabled(), false);
    // [2026-10-04] boolean 序列化為 '1'/'0'（舊碼為 'true'/'false'）
    assert.equal(values.get('cocoya_serial_raw_dump_enabled'), '0');
});

test('Raw Dump switch supports keyboard activation', () => {
    const { ui, toggle } = createHarness();
    ui.initSerialRawDumpToggle();
    toggle.onkeydown({ key: 'Enter', preventDefault() {} });
    assert.equal(ui.isSerialRawDumpEnabled(), true);
    toggle.onkeydown({ key: ' ', preventDefault() {} });
    assert.equal(ui.isSerialRawDumpEnabled(), false);
});
