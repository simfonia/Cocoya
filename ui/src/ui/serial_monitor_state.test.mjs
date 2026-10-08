import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, '../../..');

function createUi() {
    const classes = new Set();
    const attributes = new Map();
    const button = {
        title: 'Serial Monitor',
        classList: {
            toggle(name, force) {
                if (force) classes.add(name);
                else classes.delete(name);
            },
            contains(name) {
                return classes.has(name);
            }
        },
        setAttribute(name, value) {
            attributes.set(name, value);
        },
        getAttribute(name) {
            return attributes.get(name);
        }
    };
    const window = { CocoyaUI: {} };
    const document = { getElementById: () => button };
    const source = fs.readFileSync(path.join(repoRoot, 'ui/src/ui/hardware.js'), 'utf8');
    vm.runInNewContext(source, { window, document });
    return { ui: window.CocoyaUI, button, classes };
}

test('monitor active and reconnecting states remain distinct and accessible', () => {
    const fixture = createUi();

    fixture.ui.setSerialMonitorState({ active: true, connected: false });
    assert.equal(fixture.classes.has('active'), true);
    assert.equal(fixture.classes.has('reconnecting'), true);
    assert.equal(fixture.button.getAttribute('aria-pressed'), 'true');
    assert.equal(fixture.button.getAttribute('data-serial-state'), 'reconnecting');
    assert.match(fixture.button.title, /waiting for the port to reconnect/i);

    fixture.ui.setSerialMonitorState({ active: true, connected: true });
    assert.equal(fixture.classes.has('active'), true);
    assert.equal(fixture.classes.has('reconnecting'), false);
    assert.equal(fixture.button.getAttribute('data-serial-state'), 'connected');

    fixture.ui.setSerialMonitorState({ active: false, connected: false });
    assert.equal(fixture.classes.has('active'), false);
    assert.equal(fixture.button.getAttribute('aria-pressed'), 'false');
    assert.equal(fixture.button.getAttribute('data-serial-state'), 'stopped');
});
