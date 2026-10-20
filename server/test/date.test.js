// 零依赖单测：基于 Node 内置 node:test，运行前先 `npm run build`（产物在 dist/）
const test = require('node:test');
const assert = require('node:assert/strict');
const { localDateStr, localDayRange, dateStrToRange } = require('../dist/utils/date.js');

test('localDateStr 输出 YYYY-MM-DD', () => {
  const s = localDateStr(new Date(2026, 0, 5, 23, 30));
  assert.match(s, /^\d{4}-\d{2}-\d{2}$/);
  assert.equal(s, '2026-01-05');
});

test('localDayRange 为本地自然日半开区间，跨度 86400 秒', () => {
  const { start, end } = localDayRange(new Date(2026, 5, 19, 15, 0));
  assert.equal(end - start, 86400);
  // start 是当天本地 00:00:00
  const sd = new Date(start * 1000);
  assert.equal(sd.getHours(), 0);
  assert.equal(sd.getMinutes(), 0);
});

test('dateStrToRange 解析合法日期，非法/空值返回 null', () => {
  const r = dateStrToRange('2026-10-19');
  assert.ok(r);
  assert.equal(r.end - r.start, 86400);
  assert.equal(dateStrToRange('bad'), null);
  assert.equal(dateStrToRange(undefined), null);
  assert.equal(dateStrToRange(null), null);
});
