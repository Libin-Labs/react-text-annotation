import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import test from 'node:test';
import { JSDOM } from 'jsdom';
import React, { act } from 'react';
import * as api from '../dist/esm/index.js';

async function setup(t, props) {
  const dom = new JSDOM('<div id="mount"></div>');
  const saved = new Map();
  for (const [key, value] of Object.entries({
    window: dom.window,
    document: dom.window.document,
    IS_REACT_ACT_ENVIRONMENT: true,
  })) {
    saved.set(key, Object.getOwnPropertyDescriptor(globalThis, key));
    Object.defineProperty(globalThis, key, { configurable: true, writable: true, value });
  }
  const { createRoot } = await import('react-dom/client');
  const root = createRoot(document.getElementById('mount'));
  const render = async (extra = {}) =>
    act(() => root.render(React.createElement(api.TextAnnotator, { ...props, ...extra })));
  t.after(async () => {
    await act(() => root.unmount());
    dom.window.close();
    for (const [key, descriptor] of saved) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor);
      else delete globalThis[key];
    }
  });
  await render();
  return { dom, render };
}

const ranges = [
  { id: 'a', start: 0, end: 4, comment: 'first' },
  { id: 'b', start: 2, end: 6, comment: 'second' },
];

test('ESM and CommonJS exports match without a DOM', () => {
  assert.deepEqual(
    Object.keys(createRequire(import.meta.url)('../dist/cjs/index.js')).sort(),
    Object.keys(api).sort(),
  );
});

test('splits overlaps without losing text and uses UTF-16 offsets', () => {
  const segments = api.segmentAnnotations('abcdef', ranges);
  assert.deepEqual(
    segments.map((item) => item.annotationIds),
    [['a'], ['a', 'b'], ['b']],
  );
  assert.equal(segments.map((item) => item.text).join(''), 'abcdef');
  assert.equal(
    api.segmentAnnotations('A\uD83D\uDE00B', [{ id: 'emoji', start: 1, end: 3, comment: '' }])[1]
      .text,
    '\uD83D\uDE00',
  );
  assert.deepEqual(api.segmentAnnotations('', []), []);
});

test('validates ranges and versioned serialization round trips', () => {
  const serialized = api.serializeAnnotations('abcdef', ranges);
  assert.deepEqual(api.deserializeAnnotations(serialized), { text: 'abcdef', annotations: ranges });
  assert.throws(() => api.deserializeAnnotations('{'), SyntaxError);
  assert.throws(() => api.deserializeAnnotations('{"version":2}'), TypeError);
  assert.throws(
    () => api.validateAnnotations('a', [{ id: 'a', start: 0, end: 2, comment: '' }]),
    RangeError,
  );
  assert.throws(() => api.validateAnnotations('abcdef', [ranges[0], ranges[0]]), RangeError);
  assert.throws(() => api.validateAnnotations('abcdef', [null]), RangeError);
});

test('rebase drops intersected ranges, shifts later ones, and defines insertion affinity', () => {
  const original = [
    { id: 'before', start: 0, end: 2, comment: '' },
    { id: 'overlap', start: 2, end: 5, comment: '' },
    { id: 'after', start: 5, end: 8, comment: '' },
  ];
  assert.deepEqual(api.rebaseAnnotations(original, { start: 2, end: 5, insertedText: 'X' }), [
    original[0],
    { ...original[2], start: 3, end: 6 },
  ]);
  assert.equal(
    api.rebaseAnnotations(original, { start: 2, end: 2, insertedText: 'X' })[1].start,
    3,
  );
  assert.deepEqual(
    api.rebaseAnnotations([original[1]], { start: 3, end: 3, insertedText: 'X' }),
    [],
  );
  assert.deepEqual(
    api.rebaseAnnotations(original, { start: 3, end: 3, insertedText: '' }),
    original,
  );
  assert.throws(
    () => api.rebaseAnnotations([], { start: -1, end: 0, insertedText: '' }),
    RangeError,
  );
});

test('renders user text and comments as inert text, including overlapping marks', async (t) => {
  await setup(t, {
    text: '<script>abcdef</script>',
    annotations: [{ id: 'x', start: 0, end: 8, comment: '<img onerror=alert(1)>' }],
  });
  assert.equal(document.querySelector('script'), null);
  assert.equal(document.querySelector('img'), null);
  assert.ok(document.querySelector('mark'));
  assert.ok(document.querySelector('li').textContent.includes('<img'));
});

test('selection crossing text nodes adds an annotation and editing/removing emits arrays', async (t) => {
  const changes = [];
  const { dom, render } = await setup(t, {
    text: 'abcdef',
    annotations: ranges,
    createId: () => 'new',
    onChange: (value) => changes.push(value),
  });
  const text = document.querySelector('.lp-annotations-text');
  const selection = document.getSelection();
  const range = document.createRange();
  range.setStart(text.firstChild.firstChild, 1);
  range.setEnd(text.lastChild.firstChild, 1);
  selection.addRange(range);
  await act(() => text.dispatchEvent(new dom.window.MouseEvent('mouseup', { bubbles: true })));
  assert.ok(document.querySelector('textarea'));
  await act(() =>
    document
      .querySelector('form')
      .dispatchEvent(new dom.window.Event('submit', { bubbles: true, cancelable: true })),
  );
  assert.deepEqual(changes.at(-1).at(-1), { id: 'new', start: 1, end: 5, comment: '' });
  await render({ annotations: changes.at(-1) });
  await act(() => document.querySelector('li button').click());
  assert.equal(document.querySelector('textarea').value, 'first');
  const textarea = document.querySelector('textarea');
  await act(() => {
    Object.getOwnPropertyDescriptor(dom.window.HTMLTextAreaElement.prototype, 'value').set.call(
      textarea,
      'Updated comment',
    );
    textarea.dispatchEvent(new dom.window.Event('input', { bubbles: true }));
  });
  await act(() =>
    document
      .querySelector('form')
      .dispatchEvent(new dom.window.Event('submit', { bubbles: true, cancelable: true })),
  );
  assert.equal(changes.at(-1)[0].comment, 'Updated comment');
  await act(() => document.querySelectorAll('li button')[1].click());
  assert.ok(!changes.at(-1).some((item) => item.id === 'a'));
});

test('read-only suppresses edit controls and stale text selections cannot save', async (t) => {
  const changes = [];
  const { dom, render } = await setup(t, {
    text: 'abc',
    annotations: [],
    onChange: (value) => changes.push(value),
  });
  const text = document.querySelector('.lp-annotations-text');
  const range = document.createRange();
  range.selectNodeContents(text);
  document.getSelection().addRange(range);
  await act(() =>
    text.dispatchEvent(new dom.window.KeyboardEvent('keyup', { key: 'Shift', bubbles: true })),
  );
  assert.ok(document.querySelector('form'));
  await render({ text: 'xyz' });
  assert.equal(document.querySelector('form'), null);
  await render({ text: 'abcdef', annotations: ranges, readOnly: true });
  assert.equal(document.querySelector('button'), null);
  assert.equal(changes.length, 0);
});
