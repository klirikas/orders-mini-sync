import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizePhone, synchronize, handleRequest } from '../worker/index.js';
const order = (phone, amount = 1, created_at = '2026-10-01T00:00:00Z', name = 'Client') => ({ phone, amount, created_at, name, email: '' });

test('Russian formats converge; invalid numbers are rejected', () => {
  for (const value of ['+7 999 123-45-67', '8 (999) 123 45 67', '79991234567', '9991234567', 79991234567]) assert.equal(normalizePhone(value), '+79991234567');
  for (const value of ['', null, undefined, 'не указан', '123', '+7 999', '799912345678', '19991234567']) assert.equal(normalizePhone(value), null);
});
test('highest amount wins; timestamp breaks ties; winner fields preserved', () => {
  const result = synchronize([
    order('89991234567', 5000, '2026-10-01T00:00:00Z', 'Highest'),
    order('+79991234567', 1000, '2026-10-03T00:00:00Z', 'Newest but smaller'),
    order('89160000001', 200, '2026-10-01T00:00:00Z', 'Older'),
    order('+79160000001', 200, '2026-10-05T00:00:00Z', 'Later'), order('123'), order(''),
  ]);
  assert.deepEqual(result, { clients: [
    { name: 'Later', phone: '+79160000001', email: '', amount: 200 },
    { name: 'Highest', phone: '+79991234567', email: '', amount: 5000 },
  ], stats: { received: 6, unique: 2, duplicates_merged: 2, invalid_dropped: 2 } });
});
test('empty and all-invalid input', () => {
  assert.deepEqual(synchronize([]), { clients: [], stats: { received: 0, unique: 0, duplicates_merged: 0, invalid_dropped: 0 } });
  assert.deepEqual(synchronize([order('abc'), order(null)]).stats, { received: 2, unique: 0, duplicates_merged: 0, invalid_dropped: 2 });
});
test('repeat requests fetch fresh data and return identical bytes', async () => {
  const input = [order('89991234567', 1), order('+79991234567', 2)];
  let calls = 0;
  const fetcher = async () => { calls++; return Response.json(input); };
  const a = await handleRequest(new Request('https://service.test/api/clients'), {}, fetcher);
  const b = await handleRequest(new Request('https://service.test/api/clients'), {}, fetcher);
  assert.equal(a.status, 200);
  assert.match(a.headers.get('Content-Type'), /^application\/json/);
  assert.equal(await a.text(), await b.text());
  assert.equal(calls, 2);
  assert.deepEqual(synchronize(input), synchronize([...input].reverse()));
});
test('upstream errors return 502', async () => {
  for (const fetcher of [async () => new Response('', { status: 503 }), async () => Response.json({}), async () => { throw new Error('network'); }]) {
    assert.equal((await handleRequest(new Request('https://service.test/'), {}, fetcher)).status, 502);
  }
});
test('routes, methods, HEAD', async () => {
  assert.equal((await handleRequest(new Request('https://service.test/missing'))).status, 404);
  assert.equal((await handleRequest(new Request('https://service.test/', { method: 'DELETE' }))).status, 405);
  const head = await handleRequest(new Request('https://service.test/', { method: 'HEAD' }), {}, async () => Response.json([]));
  assert.equal(head.status, 200);
  assert.equal(await head.text(), '');
});
