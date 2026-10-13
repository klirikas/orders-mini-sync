export const SOURCE_URL = 'https://test.ooobs.ru/api/orders';

export function normalizePhone(value) {
  if (typeof value !== 'string' && typeof value !== 'number') return null;
  let digits = String(value).replace(/\D/g, '');
  if (digits.length === 10) digits = '7' + digits;
  if (digits.length === 11 && digits[0] === '8') digits = '7' + digits.slice(1);
  return /^7\d{10}$/.test(digits) ? '+' + digits : null;
}

export function synchronize(orders) {
  if (!Array.isArray(orders)) throw new TypeError('Expected an array of orders');
  const winners = new Map();
  let invalid = 0;
  for (const order of orders) {
    const phone = normalizePhone(order?.phone);
    if (!phone) { invalid++; continue; }
    const amount = Number(order.amount);
    const timestamp = Date.parse(order.created_at);
    if (!Number.isFinite(amount) || !Number.isFinite(timestamp)) throw new TypeError('Invalid upstream record');
    const client = { name: String(order.name ?? ''), phone, email: String(order.email ?? ''), amount };
    const previous = winners.get(phone);
    const tie = JSON.stringify(client);
    if (!previous || amount > previous.client.amount ||
        (amount === previous.client.amount && timestamp > previous.timestamp) ||
        (amount === previous.client.amount && timestamp === previous.timestamp && tie < previous.tie)) {
      winners.set(phone, { client, timestamp, tie });
    }
  }
  const clients = [...winners.values()].map(({ client }) => client)
    .sort((a, b) => a.phone < b.phone ? -1 : a.phone > b.phone ? 1 : 0);
  return { clients, stats: {
    received: orders.length, unique: clients.length,
    duplicates_merged: orders.length - invalid - clients.length, invalid_dropped: invalid,
  } };
}

export async function handleRequest(request, env = {}, fetcher = fetch) {
  if (!['/', '/api/clients', '/api/sync'].includes(new URL(request.url).pathname)) {
    return Response.json({ error: 'Not found' }, { status: 404 });
  }
  if (!['GET', 'HEAD', 'POST'].includes(request.method)) {
    return Response.json({ error: 'Method not allowed' }, { status: 405, headers: { Allow: 'GET, HEAD, POST' } });
  }
  try {
    const response = await fetcher(env.ORDERS_URL || SOURCE_URL, {
      headers: { Accept: 'application/json' }, signal: AbortSignal.timeout(10000), cache: 'no-store',
    });
    if (!response.ok) throw new Error('Upstream HTTP ' + response.status);
    const result = synchronize(await response.json());
    return new Response(request.method === 'HEAD' ? null : JSON.stringify(result), {
      headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' },
    });
  } catch {
    return Response.json({ error: 'Upstream orders unavailable or invalid' }, {
      status: 502, headers: { 'Cache-Control': 'no-store' },
    });
  }
}

// Do not pass the Workers execution context as the injectable test fetcher.
export default { fetch: (request, env) => handleRequest(request, env) };
