import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));

globalThis.window = globalThis;
globalThis.Blockly = {
  Blocks: {},
  Msg: {},
  Python: {
    forBlock: {},
    VARIABLE_CATEGORY_NAME: 'variable',
    ORDER_ATOMIC: 0,
    ORDER_MEMBER: 1,
    ORDER_FUNCTION_CALL: 2,
    ORDER_NONE: 3,
    ORDER_RELATIONAL: 4
  }
};

const load = (fileName) => {
  const source = fs.readFileSync(path.join(here, fileName), 'utf8');
  new Function(source)();
};

load('math/math_generators.js');
load('io/io_generators.js');
load('logic/logic_generators.js');
load('variables/variables_generators.js');
load('types/types_generators.js');

const Py = globalThis.Blockly.Python.forBlock;
const toolboxSources = [
  fs.readFileSync(path.join(here, 'logic/toolbox.xml'), 'utf8'),
  fs.readFileSync(path.join(here, 'variables/toolbox.xml'), 'utf8'),
  fs.readFileSync(path.join(here, 'types/toolbox.xml'), 'utf8')
].join('\n');

const makeGenerator = (values = {}) => ({
  definitions_: {},
  INDENT: '    ',
  nameDB_: { getName: (name) => name },
  valueToCode: (block, name) => block.values[name] || values[name] || '',
  statementToCode: (block, name) => block.statements[name] || ''
});

const makeBlock = ({ fields = {}, values = {}, statements = {}, itemCount_ } = {}) => ({
  getFieldValue: (name) => fields[name],
  values,
  statements,
  itemCount_
});

test('math single operations inject math only when needed', () => {
  const mathGenerator = makeGenerator();
  const mathBlock = makeBlock({ fields: { OP: 'math.sqrt' }, values: { NUM: '9' } });
  assert.deepEqual(Py.py_math_single(mathBlock, mathGenerator), ['math.sqrt(9)', 2]);
  assert.equal(mathGenerator.definitions_.import_math, 'import math');

  const plainGenerator = makeGenerator();
  const plainBlock = makeBlock({ fields: { OP: 'abs' }, values: { NUM: '-9' } });
  assert.deepEqual(Py.py_math_single(plainBlock, plainGenerator), ['abs(-9)', 2]);
  assert.equal(plainGenerator.definitions_.import_math, undefined);
});

test('atan2 injects math and preserves y/x argument order', () => {
  const generator = makeGenerator();
  const block = makeBlock({ values: { Y: '2', X: '1' } });
  assert.deepEqual(Py.py_math_atan2(block, generator), ['math.atan2(2, 1)', 2]);
  assert.equal(generator.definitions_.import_math, 'import math');
});

test('serial flush generates platform-specific code', () => {
  const pcGenerator = makeGenerator();
  assert.equal(Py.py_io_serial_flush(makeBlock(), pcGenerator), 'ser.reset_input_buffer()\n');
  assert.deepEqual(pcGenerator.definitions_, {});

  const mcuGenerator = makeGenerator();
  mcuGenerator.PLATFORM = 'MicroPython';
  const mcuCode = Py.py_io_serial_flush(makeBlock(), mcuGenerator);
  assert.equal(mcuCode, 'cocoya_flush_serial()\n');
  assert.equal(mcuGenerator.definitions_.import_sys, 'import sys');
  assert.equal(mcuGenerator.definitions_.import_uselect, 'import uselect');
  assert.match(mcuGenerator.definitions_.func_flush_serial_mcu, /poll\.register\(sys\.stdin, uselect\.POLLIN\)/);
  assert.match(mcuGenerator.definitions_.func_flush_serial_mcu, /_cocoya_serial_buf = ""/);
  assert.doesNotMatch(mcuCode, /ser\./);
});

test('tuple generator emits valid empty, singleton, and multi-element tuples', () => {
  const empty = Py.py_type_tuple(makeBlock({ itemCount_: 0 }), makeGenerator());
  assert.deepEqual(empty, ['()', 0]);

  const singleton = Py.py_type_tuple(
    makeBlock({ itemCount_: 1, values: { ADD0: 'value' } }),
    makeGenerator()
  );
  assert.deepEqual(singleton, ['(value,)', 0]);

  const multiple = Py.py_type_tuple(
    makeBlock({ itemCount_: 3, values: { ADD0: 'a', ADD1: 'b', ADD2: 'c' } }),
    makeGenerator()
  );
  assert.deepEqual(multiple, ['(a, b, c)', 0]);
});

test('new control and variable generators emit shared Python syntax', () => {
  const tryGenerator = makeGenerator();
  const tryBlock = makeBlock({ statements: { TRY_BODY: '    work()\n', FINALLY_BODY: '    close()\n' } });
  assert.equal(Py.py_try_finally(tryBlock, tryGenerator), 'try:\n    work()\nfinally:\n    close()\n');
  assert.equal(Py.py_logic_pass(), 'pass\n');

  const delGenerator = makeGenerator();
  assert.equal(Py.py_variables_del(makeBlock({ fields: { VAR: 'item' } }), delGenerator), 'del item\n');
  assert.ok(toolboxSources.includes('block type="py_try_finally"'));
  assert.ok(toolboxSources.includes('block type="py_logic_pass"'));
  assert.ok(toolboxSources.includes('block type="py_variables_del"'));
});

test('dictionary generators cover get, items, delete, update, and clear', () => {
  const generator = makeGenerator();
  const getBlock = makeBlock({ fields: { PART: 'items' }, values: { DICT: 'data', KEY: "'name'", DEFAULT: "'unknown'" } });
  assert.deepEqual(Py.py_types_dict_get(getBlock, generator), ["data.get('name', 'unknown')", 2]);
  assert.deepEqual(Py.py_types_dict_get_parts(getBlock, generator), ['list(data.items())', 2]);
  assert.equal(Py.py_types_dict_delete(getBlock, generator), "del data['name']\n");
  assert.equal(Py.py_types_dict_update(makeBlock({ values: { DICT: 'data', OTHER: 'extra' } }), generator), 'data.update(extra)\n');
  assert.equal(Py.py_types_dict_clear(makeBlock({ values: { DICT: 'data' } }), generator), 'data.clear()\n');
});

test('set generators support empty and populated sets plus common operations', () => {
  const generator = makeGenerator();
  assert.deepEqual(Py.py_type_set(makeBlock({ itemCount_: 0 }), generator), ['set()', 2]);
  assert.deepEqual(Py.py_type_set(makeBlock({ itemCount_: 2, values: { ADD0: 'a', ADD1: 'b' } }), generator), ['{a, b}', 0]);
  assert.equal(Py.py_types_set_add(makeBlock({ values: { SET: 'items', ITEM: 'value' } }), generator), 'items.add(value)\n');
  assert.equal(Py.py_types_set_remove(makeBlock({ values: { SET: 'items', ITEM: 'value' } }), generator), 'items.discard(value)\n');
  assert.equal(Py.py_types_set_clear(makeBlock({ values: { SET: 'items' } }), generator), 'items.clear()\n');
  assert.deepEqual(Py.py_types_set_operation(makeBlock({ fields: { OP: 'intersection' }, values: { A: 'left', B: 'right' } }), generator), ['left.intersection(right)', 2]);
  assert.ok(toolboxSources.includes('block type="py_type_set"'));
  assert.ok(toolboxSources.includes('block type="py_types_set_operation"'));
});
