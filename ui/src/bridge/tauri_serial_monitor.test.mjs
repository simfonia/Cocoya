import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { BridgeTauri } from './tauri.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, '../../..');

function makeBridge() {
    const bridge = Object.create(BridgeTauri.prototype);
    bridge._serialMonitorSnapshot = { generation: 0, revision: 0 };
    const snapshots = [];
    const previousWindow = globalThis.window;
    globalThis.window = {
        CocoyaUI: {
            setSerialMonitorState(snapshot) {
                snapshots.push(snapshot);
            }
        }
    };
    return {
        bridge,
        snapshots,
        restore() {
            if (previousWindow === undefined) delete globalThis.window;
            else globalThis.window = previousWindow;
        }
    };
}

test('serial state snapshot reconciliation ignores stale generation and revision', () => {
    const fixture = makeBridge();
    try {
        fixture.bridge._applySerialMonitorSnapshot({ active: true, connected: true, generation: 8, revision: 3 });
        fixture.bridge._applySerialMonitorSnapshot({ active: false, connected: false, generation: 7, revision: 99 });
        fixture.bridge._applySerialMonitorSnapshot({ active: false, connected: false, generation: 8, revision: 2 });
        fixture.bridge._applySerialMonitorSnapshot({ active: false, connected: false, generation: 8, revision: 4 });

        assert.equal(fixture.snapshots.length, 2);
        assert.equal(fixture.snapshots[1].revision, 4);
        assert.equal(fixture.bridge._serialMonitorSnapshot.generation, 8);
        assert.equal(fixture.bridge._serialMonitorSnapshot.revision, 4);
    } finally {
        fixture.restore();
    }
});

test('serial state initialization subscribes before invoking the snapshot command', () => {
    const src = fs.readFileSync(path.join(repoRoot, 'ui/src/bridge/tauri.js'), 'utf8');
    const listenAt = src.indexOf("appWindow.listen('serial-monitor-state'");
    const snapshotAt = src.indexOf("this.tauriInvoke('get_serial_monitor_state')");
    assert.notEqual(listenAt, -1, 'serial-monitor-state listener is required');
    assert.notEqual(snapshotAt, -1, 'initial monitor state snapshot is required');
    assert.ok(listenAt < snapshotAt, 'snapshot must be queried after the state listener is registered');
});

test('Python and Tauri use matching control markers and Tauri-only output', () => {
    const python = fs.readFileSync(path.join(repoRoot, 'resources/deploy/base.py'), 'utf8');
    const monitor = fs.readFileSync(path.join(repoRoot, 'src-tauri/src/commands/mcu/monitor.rs'), 'utf8');
    const deploy = fs.readFileSync(path.join(repoRoot, 'src-tauri/src/commands/mcu/deploy.rs'), 'utf8');
    const markers = [
        '__COCOYA_MONITOR_ACTIVE__',
        '__COCOYA_SERIAL_CONNECTED__',
        '__COCOYA_SERIAL_DISCONNECTED__'
    ];
    for (const marker of markers) {
        assert.ok(python.includes(marker), `Python marker missing: ${marker}`);
        assert.ok(monitor.includes(marker), `dedicated monitor parser missing: ${marker}`);
        assert.ok(deploy.includes(marker), `deploy parser missing: ${marker}`);
    }
    assert.match(python, /if not is_tauri:\s*return\s*marker =/,
        'serial state markers must not be printed in VSIX terminals');
});

test('dedicated monitor EOF reaps only its matching stored generation', () => {
    const src = fs.readFileSync(path.join(repoRoot, 'src-tauri/src/commands/mcu/monitor.rs'), 'utf8');
    assert.match(src, /finished_monitors\.lock\(\)[\s\S]*?session\.generation\) == Some\(generation\)/,
        'EOF cleanup must compare generation before removing the monitor session');
    assert.match(src, /if let Some\(mut session\) = finished_session\s*\{\s*let _ = session\.child\.wait\(\);/,
        'EOF cleanup must wait/reap the matching monitor process');
});
