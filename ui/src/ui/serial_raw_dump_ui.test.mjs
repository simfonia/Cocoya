import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

const hardwareSource = fs.readFileSync(new URL('./hardware.js', import.meta.url), 'utf8');

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
            setItem(key, value) { values.set(key, value); }
        },
        document: {
            getElementById(id) {
                return id === 'btn-serial-raw-dump' ? toggle : null;
            }
        },
        window: {}
    };
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
    assert.equal(values.get('cocoya_serial_raw_dump_enabled'), 'true');
    assert.equal(toggle['aria-checked'], 'true');

    toggle.onclick();
    assert.equal(ui.isSerialRawDumpEnabled(), false);
    assert.equal(values.get('cocoya_serial_raw_dump_enabled'), 'false');
});

test('Raw Dump switch supports keyboard activation', () => {
    const { ui, toggle } = createHarness();
    ui.initSerialRawDumpToggle();
    toggle.onkeydown({ key: 'Enter', preventDefault() {} });
    assert.equal(ui.isSerialRawDumpEnabled(), true);
    toggle.onkeydown({ key: ' ', preventDefault() {} });
    assert.equal(ui.isSerialRawDumpEnabled(), false);
});
