import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const source = fs.readFileSync(path.join(here, 'io_generators.js'), 'utf8');

function loadGenerators() {
    const Blockly = {
        Python: {
            forBlock: {},
            ORDER_NONE: 0,
            ORDER_FUNCTION_CALL: 1,
            ORDER_RELATIONAL: 2
        },
        Msg: { COLOUR_IO: '#123456' }
    };
    vm.runInNewContext(source, { Blockly });
    return Blockly;
}

function valueGenerator(platform, fields) {
    return {
        PLATFORM: platform,
        definitions_: {},
        valueToCode(_block, name) {
            return fields[name] || '';
        }
    };
}

test('PC serial init selects the Tauri Hub proxy when enabled and native pyserial otherwise', () => {
    const Blockly = loadGenerators();
    const generator = valueGenerator('PC', { PORT: "'COM7'" });
    const block = { getFieldValue: () => '115200' };

    const code = Blockly.Python.forBlock.py_io_serial_init(block, generator);
    const imports = generator.definitions_.import_serial;
    assert.match(imports, /COCOYA_SERIAL_HUB_ENABLED/);
    assert.match(imports, /from serial_hub import SerialProxy as _CocoyaSerial/);
    assert.match(imports, /_CocoyaSerial = _cocoya_serial\.Serial/);
    assert.match(code, /_CocoyaSerial\('COM7', 115200, timeout=0\.01, write_timeout=0\)/);
});

test('PC serial read/write/available/flush keep using the shared ser compatibility surface', () => {
    const Blockly = loadGenerators();
    const generator = valueGenerator('PC', { DATA: "'ping'" });
    const block = { getFieldValue: () => '115200' };

    Blockly.Python.forBlock.py_io_serial_init(block, generator);
    const read = Blockly.Python.forBlock.py_io_serial_read({}, generator)[0];
    const write = Blockly.Python.forBlock.py_io_serial_write({}, generator);
    const available = Blockly.Python.forBlock.py_io_serial_available({}, generator)[0];
    const flush = Blockly.Python.forBlock.py_io_serial_flush({}, generator);

    assert.equal(read, 'cocoya_get_latest_serial(ser)');
    assert.match(generator.definitions_.func_get_latest_serial, /s\.readline\(\)/);
    assert.match(write, /ser\.write\(/);
    assert.match(available, /ser\.in_waiting/);
    assert.equal(flush, 'ser.reset_input_buffer()\n');
});

test('MicroPython serial init stays on the device REPL path', () => {
    const Blockly = loadGenerators();
    const generator = valueGenerator('MicroPython', {});
    const code = Blockly.Python.forBlock.py_io_serial_init({}, generator);
    assert.match(code, /initialized via REPL/);
    assert.deepEqual(Object.keys(generator.definitions_), []);
});