import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { loadTaskList } from '../task-list.js';

const TMP = join(import.meta.dirname, '.tmp-task-list-test');

function setup() {
  rmSync(TMP, { recursive: true, force: true });
  mkdirSync(TMP, { recursive: true });
}

function teardown() {
  rmSync(TMP, { recursive: true, force: true });
}

describe('loadTaskList', () => {
  it('parses mixed done/undone checkboxes', () => {
    setup();
    const f = join(TMP, 'mixed.md');
    writeFileSync(f, '- [ ] First task\n- [x] Second task\n- [ ] Third task\n');
    const result = loadTaskList(f);
    assert.deepEqual(result, [
      { title: 'First task', done: false },
      { title: 'Second task', done: true },
      { title: 'Third task', done: false },
    ]);
    teardown();
  });

  it('returns empty array for empty file', () => {
    setup();
    const f = join(TMP, 'empty.md');
    writeFileSync(f, '');
    assert.deepEqual(loadTaskList(f), []);
    teardown();
  });

  it('returns empty array for missing file', () => {
    assert.deepEqual(loadTaskList('/tmp/nonexistent-gsd-test-file.md'), []);
  });

  it('skips non-checkbox lines', () => {
    setup();
    const f = join(TMP, 'mixed-content.md');
    writeFileSync(f, '# Heading\n\nSome prose.\n\n- [ ] Real task\n- plain list item\n');
    const result = loadTaskList(f);
    assert.deepEqual(result, [{ title: 'Real task', done: false }]);
    teardown();
  });

  it('treats uppercase [X] as done', () => {
    setup();
    const f = join(TMP, 'upper.md');
    writeFileSync(f, '- [X] Done with uppercase\n');
    assert.deepEqual(loadTaskList(f), [{ title: 'Done with uppercase', done: true }]);
    teardown();
  });

  it('matches indented checkboxes', () => {
    setup();
    const f = join(TMP, 'indented.md');
    writeFileSync(f, '  - [ ] Indented task\n    - [x] Deeply indented\n');
    const result = loadTaskList(f);
    assert.deepEqual(result, [
      { title: 'Indented task', done: false },
      { title: 'Deeply indented', done: true },
    ]);
    teardown();
  });
});
