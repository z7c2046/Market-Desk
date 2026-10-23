import './env.js';
import fs from 'node:fs/promises';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { fetchWatchlistSymbols } from './notion.js';
import { createMarketWorkspace } from './market-workspace.js';
import { getWatchlistQuoteService } from './watchlist-quotes.js';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const publicDir = path.join(root, 'public');
const vendor = { '/vendor/vue.js': 'node_modules/vue/dist/vue.global.prod.js', '/vendor/echarts.js': 'node_modules/echarts/dist/echarts.min.js' };
const mime = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.json': 'application/json', '.csv': 'text/csv; charset=utf-8' };
function json(res, status, data) { res.writeHead(status, { 'Content-Type': mime['.json'], 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' }); res.end(JSON.stringify(data)); }
export function createServer({ workspace = createMarketWorkspace(), watchlist = fetchWatchlistSymbols, quoteService = getWatchlistQuoteService() } = {}) {
  return http.createServer(async (req, res) => {
    try {
      const url = new URL(req.url, 'http://localhost');
      if (!['GET', 'HEAD'].includes(req.method)) { res.setHeader('Allow', 'GET, HEAD'); json(res, 405, { error: 'Method not allowed' }); return; }
      const params = Object.fromEntries(url.searchParams);
      if (url.pathname === '/api/watchlist/stream') {
        const symbols = (params.symbols || '').split(',').map(s => s.trim().toUpperCase()).filter(Boolean);
        quoteService.addClient(req, res, symbols);
        return;
      }
      if (url.pathname === '/api/watchlist/quotes') {
        const symbols = (params.symbols || '').split(',').map(s => s.trim().toUpperCase()).filter(Boolean);
        json(res, 200, await quoteService.getQuotes(symbols));
        return;
      }
      const routes = {
        '/api/health': () => ({ ok: true, product: 'Market Desk', version: '1.0.0' }),
        '/api/market/overview': () => workspace.overview(), '/api/market/chart': () => workspace.chart(params),
        '/api/macro': () => (workspace.macro ? workspace.macro() : { items: [] }),
        '/api/crypto': () => (workspace.crypto ? workspace.crypto() : { items: [] }),
        '/api/news': () => workspace.news(params), '/api/options': () => workspace.options(params),
        '/api/watchlist': () => watchlist({ force: params.force === '1' }),
      };
      if (routes[url.pathname]) { json(res, 200, await routes[url.pathname]()); return; }
      if (['/api/market/snapshot', '/api/radar', '/api/backtest'].includes(url.pathname)) { json(res, 410, { error: '拐点研究功能已停用。当前产品为美股信息与分析工作台。' }); return; }
      if (url.pathname.startsWith('/api/')) { json(res, 404, { error: '接口不存在' }); return; }
      const decoded = decodeURIComponent(url.pathname);
      const target = vendor[decoded] ? path.join(root, vendor[decoded]) : path.resolve(publicDir, '.' + (decoded === '/' ? '/index.html' : decoded));
      if (!vendor[decoded] && !target.startsWith(publicDir + path.sep)) { json(res, 403, { error: 'Forbidden' }); return; }
      try {
        const body = await fs.readFile(target);
        res.writeHead(200, { 'Content-Type': mime[path.extname(target)] || 'application/octet-stream', 'Cache-Control': 'no-cache', 'X-Content-Type-Options': 'nosniff' });
        res.end(req.method === 'HEAD' ? undefined : body);
      } catch { json(res, 404, { error: '页面不存在' }); }
    } catch (error) { json(res, error instanceof URIError ? 400 : error.status || 502, { error: error.message || '数据暂不可用' }); }
  });
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const port = Number(process.env.PORT || 5174);
  createServer().listen(port, process.env.HOST || '127.0.0.1', () => console.log(`Market Desk running at http://localhost:${port}`));
}
