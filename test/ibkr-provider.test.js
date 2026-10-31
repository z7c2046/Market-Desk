import test from 'node:test';
import assert from 'node:assert/strict';
import net from 'node:net';
import {
  IbkrProvider,
  toIbkrSymbol,
  fromIbkrSymbol,
  buildIbkrContract,
  encodeIbkrMsg,
  decodeIbkrFrames,
  TICK_TYPES
} from '../src/quote-providers/ibkr.js';
import { WatchlistQuoteService, createQuoteProvider } from '../src/watchlist-quotes.js';
import { createServer } from '../src/server.js';

test('toIbkrSymbol & fromIbkrSymbol: handles US dual-class shares and exchange suffixes', () => {
  assert.equal(toIbkrSymbol('AAPL'), 'AAPL');
  assert.equal(toIbkrSymbol('NVDA'), 'NVDA');
  assert.equal(toIbkrSymbol('BRK.B'), 'BRK B');
  assert.equal(toIbkrSymbol('BRK-B'), 'BRK B');
  assert.equal(toIbkrSymbol('BF-B'), 'BF B');
  assert.equal(toIbkrSymbol('TSLA.US'), 'TSLA');

  assert.equal(fromIbkrSymbol('BRK B'), 'BRK-B');
  assert.equal(fromIbkrSymbol('BF B'), 'BF-B');
  assert.equal(fromIbkrSymbol('AAPL'), 'AAPL');
});

test('buildIbkrContract: builds SMART USD contract for US stocks and SEHK for HK', () => {
  const usContract = buildIbkrContract('AAPL');
  assert.equal(usContract.symbol, 'AAPL');
  assert.equal(usContract.secType, 'STK');
  assert.equal(usContract.exchange, 'SMART');
  assert.equal(usContract.currency, 'USD');

  const hkContract = buildIbkrContract('0700.HK');
  assert.equal(hkContract.symbol, '0700');
  assert.equal(hkContract.secType, 'STK');
  assert.equal(hkContract.exchange, 'SEHK');
  assert.equal(hkContract.currency, 'HKD');
});

test('encodeIbkrMsg & decodeIbkrFrames: framed buffer serialization round-trip', () => {
  const fields = ['1', '101', '4', '145.50', '200', '1'];
  const encoded = encodeIbkrMsg(fields);

  // Length prefix is 4 bytes big endian
  assert.ok(encoded.length > 4);
  const payloadLen = encoded.readUInt32BE(0);
  assert.equal(encoded.length, 4 + payloadLen);

  const { frames, remainder } = decodeIbkrFrames(encoded);
  assert.equal(frames.length, 1);
  assert.deepEqual(frames[0], fields);
  assert.equal(remainder.length, 0);

  // Test partial chunking
  const half = encoded.subarray(0, 10);
  const rest = encoded.subarray(10);
  const res1 = decodeIbkrFrames(half);
  assert.equal(res1.frames.length, 0);
  assert.equal(res1.remainder.length, 10);

  const res2 = decodeIbkrFrames(Buffer.concat([res1.remainder, rest]));
  assert.equal(res2.frames.length, 1);
  assert.deepEqual(res2.frames[0], fields);
});

test('createQuoteProvider factory picks IbkrProvider or LongbridgeProvider based on environment', () => {
  const oldProv = process.env.QUOTE_PROVIDER;
  const oldLbKey = process.env.LONGBRIDGE_APP_KEY;
  try {
    delete process.env.LONGBRIDGE_APP_KEY;
    delete process.env.LONGPORT_APP_KEY;

    process.env.QUOTE_PROVIDER = 'ibkr';
    const p1 = createQuoteProvider();
    assert.equal(p1.name, 'Interactive Brokers (IB Gateway)');
    assert.equal(p1.isConfigured(), true);

    process.env.QUOTE_PROVIDER = 'longbridge';
    const p2 = createQuoteProvider();
    assert.equal(p2.name, 'Longbridge');

    // Auto mode with no Longbridge credentials defaults to IbkrProvider ready for local gateway
    process.env.QUOTE_PROVIDER = 'auto';
    const p3 = createQuoteProvider();
    assert.equal(p3.name, 'Interactive Brokers (IB Gateway)');
  } finally {
    if (oldProv !== undefined) process.env.QUOTE_PROVIDER = oldProv;
    else delete process.env.QUOTE_PROVIDER;
    if (oldLbKey !== undefined) process.env.LONGBRIDGE_APP_KEY = oldLbKey;
  }
});

test('IbkrProvider connects to local IB Gateway mock, performs v100+ handshake, and parses streaming ticks', async t => {
  let clientSocket = null;
  const receivedMessages = [];

  // Start mock IB Gateway TCP Server
  const server = net.createServer(socket => {
    clientSocket = socket;
    let recvBuf = Buffer.alloc(0);
    let handshakeDone = false;

    socket.on('data', chunk => {
      recvBuf = Buffer.concat([recvBuf, chunk]);

      // Expect "API\0" prefix for v100+ connection
      if (!handshakeDone && recvBuf.length >= 8) {
        const prefixStr = recvBuf.subarray(0, 4).toString('utf8');
        assert.equal(prefixStr, 'API\0');
        const vLen = recvBuf.readUInt32BE(4);
        if (recvBuf.length >= 8 + vLen) {
          handshakeDone = true;
          recvBuf = recvBuf.subarray(8 + vLen);

          // Reply with serverVersion (176) and serverTime
          const reply = encodeIbkrMsg(['176', '20261031 22:00:00 EST']);
          socket.write(reply);
        }
      }

      if (handshakeDone) {
        const { frames, remainder } = decodeIbkrFrames(recvBuf);
        recvBuf = remainder;
        for (const f of frames) {
          receivedMessages.push(f);
          const msgId = Number(f[0]);

          // START_API (71) -> Send NEXT_VALID_ID (9)
          if (msgId === 71) {
            socket.write(encodeIbkrMsg(['9', '1', '1001']));
          }

          // REQ_MKT_DATA (1) -> Push tick prices and volume for testing
          if (msgId === 1) {
            const reqId = (f.length >= 3 && f[1] === '11') ? f[2] : f[1];
            // Push tick 9: CLOSE = 120.00
            socket.write(encodeIbkrMsg(['1', '1', reqId, String(TICK_TYPES.CLOSE), '120.00', '0', '0']));
            // Push tick 4: LAST = 126.00
            socket.write(encodeIbkrMsg(['1', '1', reqId, String(TICK_TYPES.LAST), '126.00', '100', '0']));
            // Push tick 8: VOLUME = 50000000
            socket.write(encodeIbkrMsg(['2', '1', reqId, String(TICK_TYPES.VOLUME), '50000000']));
          }
        }
      }
    });
  });

  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const port = server.address().port;

  t.after(() => {
    provider.destroy();
    return new Promise(resolve => {
      server.close(resolve);
      if (clientSocket) clientSocket.destroy();
    });
  });

  const provider = new IbkrProvider({
    host: '127.0.0.1',
    port,
    clientId: 99,
    timeout: 3000,
    autoReconnect: false
  });

  const updates = [];
  provider.onQuoteUpdate(ev => updates.push(ev));

  // 1. Connect and verify handshake
  const connected = await provider.connect();
  assert.equal(connected, true, 'Successfully connected to mock IB Gateway');
  assert.equal(provider.status, 'connected');
  assert.equal(provider.serverVersion, 176);

  // 2. Subscribe and verify tick parsing
  await provider.subscribe(['NVDA']);

  // Wait for tick events to arrive
  await new Promise(r => setTimeout(r, 80));

  assert.ok(updates.length > 0, 'Received streaming tick updates');
  const lastUpdate = updates.find(u => u.price === 126.00);
  assert.ok(lastUpdate, 'Received LAST tick with price 126.00');
  assert.equal(lastUpdate.symbol, 'NVDA');
  assert.equal(lastUpdate.provider, 'Interactive Brokers');

  // 3. Verify internal multi-session quote assembly
  const quotes = await provider.quote(['NVDA']);
  const nvda = quotes.NVDA;
  assert.ok(nvda);
  assert.equal(nvda.meta.provider, 'Interactive Brokers');
  assert.equal(nvda.regularPrevClose, 120.00);
  assert.equal(nvda.regular.volume, 50000000);

  // 4. Verify getStatus diagnostics
  const status = provider.getStatus();
  assert.equal(status.name, 'Interactive Brokers (IB Gateway)');
  assert.equal(status.status, 'connected');
  assert.equal(status.port, port);
  assert.equal(status.subscribedCount, 1);
  assert.deepEqual(status.subscribedSymbols, ['NVDA']);
});

test('HTTP API /api/ibkr/status and /api/ibkr/reconnect respond with gateway diagnostics', async t => {
  const provider = new IbkrProvider({ host: '127.0.0.1', port: 4002, autoReconnect: false });
  const quoteService = new WatchlistQuoteService({ provider });
  const server = createServer({ quoteService });

  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;

  t.after(() => {
    provider.destroy();
    quoteService.destroy();
    return new Promise(resolve => server.close(resolve));
  });

  const res = await fetch(`${base}/api/ibkr/status`);
  assert.equal(res.status, 200);
  const data = await res.json();
  assert.equal(data.name, 'Interactive Brokers (IB Gateway)');
  assert.equal(data.port, 4002);
  assert.equal(typeof data.status, 'string');

  const reconnRes = await fetch(`${base}/api/ibkr/reconnect`);
  assert.equal(reconnRes.status, 200);
  const reconnData = await reconnRes.json();
  assert.ok('ok' in reconnData);
});

