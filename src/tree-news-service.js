/**
 * Tree News (Tree of Alpha) Real-time WebSocket & SSE Service
 * Connects to wss://news.treeofalpha.com/ws for millisecond-level breaking financial news.
 * Pre-populates recent news via https://news.treeofalpha.com/api/news.
 * 100% Free public access with optional TREE_NEWS_API_KEY authentication support.
 */

export function normalizeTreeItem(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const time = Number(raw.time) || Date.now();
  const rawTitle = String(raw.title || raw.text || raw.en || '').trim();
  if (!rawTitle) return null;

  const id = String(raw._id || raw.id || `${time}-${rawTitle.slice(0, 30)}`);
  const rawSource = String(raw.sourceName || raw.source || '').trim();
  const lowerSource = rawSource.toLowerCase();
  const lowerTitle = rawTitle.toLowerCase();

  let source = rawSource || 'Tree News';
  let sourceType = 'wire';
  let badge = '实时快讯';
  let badgeClass = 'source-pill-web';

  if (lowerSource.includes('bloomberg') || lowerTitle.startsWith('bloomberg')) {
    source = 'Bloomberg (彭博终端)';
    sourceType = 'bloomberg';
    badge = '彭博专线 · 突发';
    badgeClass = 'source-pill-bloomberg';
  } else if (lowerSource.includes('reuters') || lowerTitle.startsWith('reuters')) {
    source = 'Reuters (路透社)';
    sourceType = 'reuters';
    badge = '路透快讯 · 突发';
    badgeClass = 'source-pill-reuters';
  } else if (lowerSource.includes('sec') || lowerTitle.includes('form 8-k') || lowerTitle.includes('sec edgar')) {
    source = 'SEC EDGAR 官方';
    sourceType = 'sec';
    badge = '官方披露 · 8-K';
    badgeClass = 'source-pill-wsj';
  } else if (lowerSource.includes('twitter') || lowerSource.includes('x.com')) {
    source = 'X (Twitter 速递)';
    sourceType = 'twitter';
    badge = '社交即时 · 待核实';
    badgeClass = 'source-pill-x';
  } else if (lowerSource.includes('binance')) {
    source = 'Binance 公告';
    sourceType = 'crypto';
    badge = '交易所公告';
    badgeClass = 'source-pill-reddit';
  } else if (lowerSource.includes('blogs') || lowerSource.includes('press')) {
    source = rawSource || '企业官方公告';
    sourceType = 'official';
    badge = '官方公告';
    badgeClass = 'source-pill-wsj';
  }

  // Extract clean symbols
  const rawSymbols = Array.isArray(raw.symbols) ? raw.symbols : [];
  const symbolSet = new Set();
  for (const sym of rawSymbols) {
    if (typeof sym === 'string') {
      const clean = sym.replace(/(_USDT|_PERP|_USD|\.US|\.HK)$/i, '').toUpperCase().trim();
      if (clean && clean.length <= 10) symbolSet.add(clean);
    }
  }

  // Also match tickers from headline if prefixed with $ or uppercase tags
  const matchedTickers = rawTitle.match(/(?:\$)([A-Z]{1,6})\b/g);
  if (matchedTickers) {
    for (const t of matchedTickers) symbolSet.add(t.replace('$', '').toUpperCase());
  }

  const importance = Number(raw.importance) || 1.0;
  const isBreaking = importance >= 2.0 || /BREAKING|突发|紧急|SEC|FOMC|RATE CUT|RATE HIKE|POWELL|EARNINGS/i.test(rawTitle);

  return {
    id,
    title: rawTitle,
    body: String(raw.text || raw.body || '').trim(),
    source,
    sourceType,
    rawSource,
    badge,
    badgeClass,
    url: String(raw.url || '').trim(),
    time,
    timeIso: new Date(time).toISOString(),
    symbols: [...symbolSet],
    importance,
    isBreaking
  };
}

export class TreeNewsService {
  constructor(options = {}) {
    this.wsUrl = options.wsUrl || process.env.TREE_NEWS_WS_URL || 'wss://news.treeofalpha.com/ws';
    this.restUrl = options.restUrl || process.env.TREE_NEWS_REST_URL || 'https://news.treeofalpha.com/api/news';
    this.apiKey = options.apiKey ?? (process.env.TREE_NEWS_API_KEY || '');
    this.bufferLimit = Math.max(1, Number(options.bufferLimit) || 200);
    this.WebSocketImpl = options.WebSocketImpl || globalThis.WebSocket;
    this.fetchImpl = options.fetchImpl || globalThis.fetch;
    this.enableWs = options.enableWs !== false;

    this.buffer = [];
    this.seenIds = new Set();
    this.sseClients = new Set();
    this.status = 'disconnected';
    this.statusReason = '未初始化';
    this.reconnectTimer = null;
    this.reconnectCount = 0;
    this.ws = null;
    this.isClosed = false;

    this.stats = {
      totalReceived: 0,
      connectedAt: null,
      lastMessageAt: null,
      reconnectCount: 0
    };

    if (options.autoConnect !== false && this.enableWs && process.env.NODE_ENV !== 'test') {
      this.init().catch(() => {});
    }
  }

  async init() {
    this.isClosed = false;
    await this.fetchInitialHistory();
    if (this.enableWs) {
      this.connectWs();
    }
  }

  async fetchInitialHistory() {
    if (!this.fetchImpl) return;
    try {
      const resp = await this.fetchImpl(`${this.restUrl}?limit=50`, {
        headers: { 'Accept': 'application/json' },
        signal: AbortSignal.timeout(6000)
      });
      if (resp.ok) {
        const list = await resp.json();
        if (Array.isArray(list)) {
          // Process oldest to newest so newest stays at index 0
          for (let i = list.length - 1; i >= 0; i--) {
            this.addItem(list[i], false);
          }
        }
      }
    } catch {
      // Graceful fallback: WS stream will still provide live items
    }
  }

  connectWs() {
    if (this.isClosed || !this.WebSocketImpl) return;
    if (this.ws && (this.ws.readyState === 0 || this.ws.readyState === 1)) return;

    this.status = 'connecting';
    this.statusReason = `正在连接 ${this.wsUrl}...`;

    try {
      this.ws = new this.WebSocketImpl(this.wsUrl);

      this.ws.onopen = () => {
        this.status = 'connected';
        this.statusReason = '已连接 Tree News 毫秒级突发流';
        this.stats.connectedAt = Date.now();
        this.reconnectCount = 0;
        this.stats.reconnectCount = 0;

        // Optional VIP authentication
        if (this.apiKey) {
          try {
            this.ws.send(`login ${this.apiKey}`);
          } catch {}
        }
      };

      this.ws.onmessage = event => {
        try {
          const raw = typeof event.data === 'string' ? JSON.parse(event.data) : event.data;
          this.addItem(raw, true);
        } catch {
          // Ignored if non-json keep-alive
        }
      };

      this.ws.onerror = err => {
        this.status = 'error';
        this.statusReason = err?.message || 'WebSocket 连接异常';
      };

      this.ws.onclose = () => {
        if (this.isClosed) return;
        this.status = 'disconnected';
        this.statusReason = '连接已断开，准备重连...';
        this.scheduleReconnect();
      };
    } catch (err) {
      this.status = 'error';
      this.statusReason = err?.message || 'WebSocket 创建失败';
      this.scheduleReconnect();
    }
  }

  scheduleReconnect() {
    if (this.isClosed || this.reconnectTimer) return;
    this.reconnectCount++;
    this.stats.reconnectCount = this.reconnectCount;
    const delay = Math.min(30000, 1000 * Math.pow(1.5, Math.min(8, this.reconnectCount)));
    this.status = 'reconnecting';
    this.statusReason = `${Math.round(delay / 1000)} 秒后尝试第 ${this.reconnectCount} 次重连...`;

    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      if (!this.isClosed) {
        this.connectWs();
      }
    }, delay);
    this.reconnectTimer?.unref?.();
  }

  addItem(raw, broadcast = true) {
    const item = normalizeTreeItem(raw);
    if (!item) return null;

    if (this.seenIds.has(item.id)) return null;

    // Prune seenIds set to prevent unbounded growth
    if (this.seenIds.size >= 1000) {
      const firstKey = this.seenIds.values().next().value;
      this.seenIds.delete(firstKey);
    }
    this.seenIds.add(item.id);

    // Prepend to circular buffer
    this.buffer.unshift(item);
    if (this.buffer.length > this.bufferLimit) {
      this.buffer.pop();
    }

    this.stats.totalReceived++;
    this.stats.lastMessageAt = Date.now();

    if (broadcast) {
      this.broadcast(item);
    }

    return item;
  }

  broadcast(item) {
    if (!this.sseClients.size) return;
    const payload = `data: ${JSON.stringify({ type: 'news', data: item })}\n\n`;
    for (const client of this.sseClients) {
      try {
        client.res.write(payload);
      } catch {
        this.sseClients.delete(client);
      }
    }
  }

  addClient(req, res) {
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-store, no-transform',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no',
      'Access-Control-Allow-Origin': '*'
    });
    res.flushHeaders?.();

    const client = { req, res };
    this.sseClients.add(client);

    // Initial ping and recent buffer snapshot
    const initialPayload = {
      type: 'snapshot',
      status: this.getStatus(),
      items: this.buffer.slice(0, 50)
    };
    res.write(`data: ${JSON.stringify(initialPayload)}\n\n`);

    req.on('close', () => {
      this.sseClients.delete(client);
    });
  }

  getHistory(params = {}) {
    let list = [...this.buffer];

    // Filter by ticker / symbol
    const symbol = String(params.symbol || params.ticker || '').trim().toUpperCase();
    if (symbol) {
      list = list.filter(item => item.symbols.includes(symbol) || item.title.toUpperCase().includes(symbol));
    }

    // Filter by search keyword
    const q = String(params.query || params.q || '').trim().toLowerCase();
    if (q) {
      list = list.filter(item => item.title.toLowerCase().includes(q) || item.body.toLowerCase().includes(q));
    }

    // Filter by source type
    const source = String(params.source || '').trim().toLowerCase();
    if (source && source !== 'all') {
      list = list.filter(item => item.sourceType === source || item.rawSource.toLowerCase().includes(source));
    }

    const limit = Math.min(100, Math.max(1, Number(params.limit) || 50));
    return {
      ok: true,
      total: list.length,
      items: list.slice(0, limit),
      status: this.getStatus()
    };
  }

  getStatus() {
    return {
      ok: this.status === 'connected',
      status: this.status,
      statusReason: this.statusReason,
      wsUrl: this.wsUrl,
      clientsCount: this.sseClients.size,
      bufferedCount: this.buffer.length,
      totalReceived: this.stats.totalReceived,
      connectedAt: this.stats.connectedAt ? new Date(this.stats.connectedAt).toISOString() : null,
      lastMessageAt: this.stats.lastMessageAt ? new Date(this.stats.lastMessageAt).toISOString() : null,
      isVip: Boolean(this.apiKey)
    };
  }

  close() {
    this.isClosed = true;
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.ws) {
      try {
        this.ws.close();
      } catch {}
      this.ws = null;
    }
    for (const client of this.sseClients) {
      try {
        client.res.end();
      } catch {}
    }
    this.sseClients.clear();
    this.status = 'disconnected';
    this.statusReason = '已主动关闭服务';
  }
}

let defaultTreeNewsService = null;
export function getTreeNewsService(options) {
  if (!defaultTreeNewsService || options) {
    defaultTreeNewsService = new TreeNewsService(options);
  }
  return defaultTreeNewsService;
}
