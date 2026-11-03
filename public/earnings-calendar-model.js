/**
 * Earnings Calendar & Macro Calendar Model
 * 大型科技股与 AI 产业链财报周历 (Earnings Whispers 原版视觉规范) & 宏观数据日历 (CPI/PPI)
 */

export const AI_SECTOR_FILTERS = [
  { id: 'all', label: '全部标的', count: 28 },
  { id: 'chips', label: '🤖 AI 算力与芯片', count: 6, color: '#2563eb' },
  { id: 'datacenter', label: '⚡ 数据中心与制冷', count: 5, color: '#0891b2' },
  { id: 'energy', label: '🔋 电力与能源', count: 5, color: '#d97706' },
  { id: 'memory', label: '💾 存储与 HBM', count: 4, color: '#9333ea' },
  { id: 'cloud', label: '☁️ 云计算与大模型', count: 6, color: '#10b981' },
  { id: 'interconnect', label: '🔌 高速互联与通信', count: 2, color: '#ec4899' }
];

export const CURRENT_WEEK_DAYS = [
  { id: 'mon', label: '周一 (Monday)', dateStr: '11月02日', fullDate: '2026-11-02', isKeyDay: false, highlight: 'Palantir · 恩智浦 · 莱迪思' },
  { id: 'tue', label: '周二 (Tuesday)', dateStr: '11月03日', fullDate: '2026-11-03', isToday: true, isKeyDay: true, highlight: '超微电脑 · 格芯 · 优步' },
  { id: 'wed', label: '周三 (Wednesday)', dateStr: '11月04日', fullDate: '2026-11-04', isKeyDay: true, highlight: '高通 · ARM · AppLovin' },
  { id: 'thu', label: '周四 (Thursday)', dateStr: '11月05日', fullDate: '2026-11-05', isKeyDay: true, highlight: 'Arista · Datadog · Cloudflare' },
  { id: 'fri', label: '周五 (Friday)', dateStr: '11月06日', fullDate: '2026-11-06', isKeyDay: false, highlight: 'The Trade Desk · DraftKings' }
];

export const PREV_WEEK_DAYS = [
  { id: 'mon', label: '周一 (Monday)', dateStr: '10月26日', fullDate: '2026-10-26', isKeyDay: false },
  { id: 'tue', label: '周二 (Tuesday)', dateStr: '10月27日', fullDate: '2026-10-27', isKeyDay: true, highlight: '谷歌 · AMD · 希捷' },
  { id: 'wed', label: '周三 (Wednesday)', dateStr: '10月28日', fullDate: '2026-10-28', isKeyDay: true, highlight: '微软 · Meta · 维谛Vertiv' },
  { id: 'thu', label: '周四 (Thursday)', dateStr: '10月29日', fullDate: '2026-10-29', isKeyDay: true, highlight: '苹果 · 亚马逊 · 英特尔' },
  { id: 'fri', label: '周五 (Friday)', dateStr: '10月30日', fullDate: '2026-10-30', isKeyDay: false, highlight: '埃克森美孚 · Enphase' }
];

export const NEXT_WEEK_DAYS = [
  { id: 'mon', label: '周一 (Monday)', dateStr: '11月09日', fullDate: '2026-11-09', isKeyDay: false, highlight: '中概互联与软件前瞻' },
  { id: 'tue', label: '周二 (Tuesday)', dateStr: '11月10日', fullDate: '2026-11-10', isKeyDay: false, highlight: '家得宝 · 工业自动控制' },
  { id: 'wed', label: '周三 (Wednesday)', dateStr: '11月11日', fullDate: '2026-11-11', isKeyDay: true, highlight: '思科 CSCO · 迪士尼' },
  { id: 'thu', label: '周四 (Thursday)', dateStr: '11月12日', fullDate: '2026-11-12', isKeyDay: true, highlight: '应用材料 AMAT · 泛林 LRCX' },
  { id: 'fri', label: '周五 (Friday)', dateStr: '11月13日', fullDate: '2026-11-13', isKeyDay: false, highlight: '阿里巴巴 BABA · 零售消费' }
];

export const EARNINGS_DAYS = CURRENT_WEEK_DAYS;

// SVG Logos for Top Corporate Brands (Crisp, Infinite Resolution, Brand Accents)
export const CORPORATE_LOGOS = {
  MSFT: `
    <svg viewBox="0 0 130 32" fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect x="2" y="5" width="10" height="10" fill="#F25022"/>
      <rect x="14" y="5" width="10" height="10" fill="#7FBA00"/>
      <rect x="2" y="17" width="10" height="10" fill="#00A4EF"/>
      <rect x="14" y="17" width="10" height="10" fill="#FFB900"/>
      <text x="30" y="22" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" font-size="15" font-weight="700" fill="currentColor">Microsoft</text>
    </svg>
  `,
  GOOGL: `
    <svg viewBox="0 0 115 32" fill="none" xmlns="http://www.w3.org/2000/svg">
      <text x="4" y="23" font-family="-apple-system, BlinkMacSystemFont, 'Product Sans', Roboto, sans-serif" font-size="20" font-weight="700" letter-spacing="-0.5">
        <tspan fill="#4285F4">G</tspan><tspan fill="#EA4335">o</tspan><tspan fill="#FBBC05">o</tspan><tspan fill="#4285F4">g</tspan><tspan fill="#34A853">l</tspan><tspan fill="#EA4335">e</tspan>
      </text>
    </svg>
  `,
  AMZN: `
    <svg viewBox="0 0 115 32" fill="none" xmlns="http://www.w3.org/2000/svg">
      <text x="4" y="19" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" font-size="17" font-weight="800" fill="currentColor" letter-spacing="-0.5">amazon</text>
      <path d="M 8 24 Q 38 31 66 21 Q 42 28 11 23 Z" fill="#FF9900"/>
      <path d="M 64 19 L 68 22 L 63 24 Z" fill="#FF9900"/>
    </svg>
  `,
  AAPL: `
    <svg viewBox="0 0 100 32" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M 15 7 Q 17 4 20 4 Q 21 6 19 8 Q 17 9 15 7 Z" fill="currentColor"/>
      <path d="M 19 10 C 23 10 24 13 24 13 C 24 13 22 15 22 17 C 22 20 25 21 25 21 C 24 23 23 25 21 27 C 20 28 18 28 17 28 C 15 28 14 27 13 27 C 11 27 10 28 9 28 C 7 28 6 25 5 23 C 3 19 4 14 7 12 C 9 10 11 10 13 10 C 15 10 16 11 17 11 C 18 11 18 10 19 10 Z" fill="currentColor"/>
      <text x="31" y="22" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" font-size="15" font-weight="700" fill="currentColor">Apple</text>
    </svg>
  `,
  META: `
    <svg viewBox="0 0 105 32" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M 6 16 C 6 12 9 9 12 9 C 15 9 18 13 20 16 C 22 13 25 9 28 9 C 31 9 34 12 34 16 C 34 20 31 23 28 23 C 25 23 22 19 20 16 C 18 19 15 23 12 23 C 9 23 6 20 6 16 Z" stroke="#0081FB" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>
      <text x="40" y="22" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" font-size="16" font-weight="800" fill="currentColor">Meta</text>
    </svg>
  `,
  AMD: `
    <svg viewBox="0 0 105 32" fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect x="4" y="7" width="18" height="18" fill="#00B140"/>
      <polygon points="13,7 22,7 22,16 17,16 17,12 13,12" fill="#FFFFFF"/>
      <polygon points="4,16 9,16 9,20 13,20 13,25 4,25" fill="#FFFFFF"/>
      <text x="28" y="22" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" font-size="16" font-weight="900" fill="currentColor" letter-spacing="0.5">AMD</text>
    </svg>
  `,
  INTC: `
    <svg viewBox="0 0 100 32" fill="none" xmlns="http://www.w3.org/2000/svg">
      <text x="4" y="22" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" font-size="20" font-weight="800" fill="#0071C5" letter-spacing="-0.8">intel</text>
      <circle cx="10" cy="7" r="2.2" fill="#00C7FD"/>
    </svg>
  `,
  VRT: `
    <svg viewBox="0 0 115 32" fill="none" xmlns="http://www.w3.org/2000/svg">
      <polygon points="5,6 23,6 14,24" fill="#0F172A" stroke="currentColor" stroke-width="1.5"/>
      <polygon points="9,9 19,9 14,19" fill="#00B140"/>
      <text x="28" y="21" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" font-size="15" font-weight="900" fill="currentColor" letter-spacing="1">VERTIV</text>
    </svg>
  `,
  GEV: `
    <svg viewBox="0 0 135 32" fill="none" xmlns="http://www.w3.org/2000/svg">
      <circle cx="15" cy="16" r="11" fill="#005EB8"/>
      <text x="15" y="21" font-family="Georgia, serif" font-size="13" font-weight="bold" font-style="italic" fill="#FFFFFF" text-anchor="middle">GE</text>
      <text x="32" y="17" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" font-size="11" font-weight="900" fill="currentColor" letter-spacing="1">VERNOVA</text>
      <text x="32" y="26" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" font-size="8.5" font-weight="700" fill="#005EB8" letter-spacing="0.5">ENERGY TECH</text>
    </svg>
  `,
  SKHY: `
    <svg viewBox="0 0 130 32" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M 4 23 L 13 9 L 17 18 Z" fill="#ED1C24"/>
      <path d="M 13 9 L 24 16 L 15 23 Z" fill="#F37021"/>
      <text x="28" y="15" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" font-size="12" font-weight="900" fill="#ED1C24">SK</text>
      <text x="48" y="15" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" font-size="12" font-weight="700" fill="currentColor">hynix</text>
      <text x="28" y="25" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" font-size="8" font-weight="800" fill="#F37021" letter-spacing="0.5">HBM3e LEADER</text>
    </svg>
  `,
  STX: `
    <svg viewBox="0 0 120 32" fill="none" xmlns="http://www.w3.org/2000/svg">
      <circle cx="14" cy="16" r="9" stroke="#00A3E0" stroke-width="2.5" fill="none"/>
      <path d="M 9 16 C 9 11 19 11 19 16 C 19 21 9 21 9 16" stroke="#00B140" stroke-width="2.5" fill="none"/>
      <text x="29" y="21" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" font-size="13" font-weight="800" fill="currentColor" letter-spacing="0.8">SEAGATE</text>
    </svg>
  `,
  SNDK: `
    <svg viewBox="0 0 115 32" fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect x="3" y="6" width="20" height="20" rx="3" fill="#CC0000"/>
      <text x="7" y="21" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" font-size="15" font-weight="900" fill="#FFFFFF">S</text>
      <text x="28" y="21" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" font-size="14" font-weight="900" fill="#CC0000" letter-spacing="0.5">SanDisk</text>
    </svg>
  `,
  KLAC: `
    <svg viewBox="0 0 100 32" fill="none" xmlns="http://www.w3.org/2000/svg">
      <text x="4" y="22" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" font-size="18" font-weight="900" fill="#5B2B82" letter-spacing="1">KLA</text>
      <rect x="52" y="10" width="10" height="3" fill="#00A3E0"/>
      <rect x="55.5" y="6.5" width="3" height="10" fill="#00A3E0"/>
    </svg>
  `,
  CDNS: `
    <svg viewBox="0 0 115 32" fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect x="4" y="8" width="16" height="16" rx="2" fill="#E4002B"/>
      <circle cx="12" cy="16" r="4" fill="#FFFFFF"/>
      <text x="25" y="21" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" font-size="14" font-weight="700" fill="currentColor">cādence</text>
    </svg>
  `,
  APH: `
    <svg viewBox="0 0 120 32" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M 4 21 Q 12 7 20 21" stroke="#0054A6" stroke-width="3" fill="none"/>
      <text x="25" y="21" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" font-size="15" font-weight="800" fill="#0054A6">Amphenol</text>
    </svg>
  `,
  NOW: `
    <svg viewBox="0 0 125 32" fill="none" xmlns="http://www.w3.org/2000/svg">
      <circle cx="13" cy="16" r="9" stroke="#81B5A1" stroke-width="3" fill="none"/>
      <circle cx="13" cy="16" r="3.5" fill="#293E40"/>
      <text x="27" y="21" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" font-size="14" font-weight="800" fill="currentColor">servicenow</text>
    </svg>
  `,
  CARR: `
    <svg viewBox="0 0 110 32" fill="none" xmlns="http://www.w3.org/2000/svg">
      <ellipse cx="14" cy="16" rx="11" ry="8" stroke="#003882" stroke-width="2.5" fill="none"/>
      <text x="30" y="21" font-family="Georgia, serif" font-size="16" font-weight="bold" font-style="italic" fill="#003882">Carrier</text>
    </svg>
  `,
  CEG: `
    <svg viewBox="0 0 135 32" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M 12 5 L 14 12 L 21 14 L 14 16 L 12 23 L 10 16 L 3 14 L 10 12 Z" fill="#F59E0B"/>
      <text x="25" y="21" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" font-size="13" font-weight="800" fill="currentColor">Constellation</text>
    </svg>
  `,
  RDDT: `
    <svg viewBox="0 0 105 32" fill="none" xmlns="http://www.w3.org/2000/svg">
      <circle cx="14" cy="16" r="10" fill="#FF4500"/>
      <circle cx="11" cy="15" r="1.5" fill="#FFFFFF"/>
      <circle cx="17" cy="15" r="1.5" fill="#FFFFFF"/>
      <path d="M 11 19 Q 14 21 17 19" stroke="#FFFFFF" stroke-width="1.2" fill="none"/>
      <text x="29" y="21" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" font-size="16" font-weight="800" fill="currentColor">reddit</text>
    </svg>
  `,
  SMCI: `
    <svg viewBox="0 0 130 32" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M 4 20 C 4 10 18 10 18 20" stroke="#CC0000" stroke-width="2.5" fill="none"/>
      <path d="M 12 20 C 12 13 22 13 22 20" stroke="#0F172A" stroke-width="2" fill="none"/>
      <text x="27" y="20" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" font-size="12" font-weight="900" fill="currentColor" letter-spacing="0.5">SUPERMICRO</text>
    </svg>
  `,
  COIN: `
    <svg viewBox="0 0 115 32" fill="none" xmlns="http://www.w3.org/2000/svg">
      <circle cx="14" cy="16" r="10" fill="#0052FF"/>
      <circle cx="14" cy="16" r="4.5" fill="#FFFFFF"/>
      <rect x="14" y="13.5" width="6" height="5" fill="#0052FF"/>
      <text x="29" y="21" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" font-size="15" font-weight="800" fill="currentColor">coinbase</text>
    </svg>
  `,
  CAT: `
    <svg viewBox="0 0 130 32" fill="none" xmlns="http://www.w3.org/2000/svg">
      <polygon points="4,24 16,5 28,24" fill="#FFCD00"/>
      <text x="16" y="21" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" font-size="10" font-weight="900" fill="#000000" text-anchor="middle">CAT</text>
      <text x="32" y="20" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" font-size="12" font-weight="900" fill="currentColor" letter-spacing="0.5">CATERPILLAR</text>
    </svg>
  `,
  CCJ: `
    <svg viewBox="0 0 110 32" fill="none" xmlns="http://www.w3.org/2000/svg">
      <circle cx="14" cy="16" r="9" fill="#002D62"/>
      <polygon points="14,8 16,16 14,24 12,16" fill="#D4AF37"/>
      <polygon points="8,16 16,14 24,16 16,18" fill="#D4AF37"/>
      <text x="28" y="21" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" font-size="14" font-weight="800" fill="currentColor">Cameco</text>
    </svg>
  `,
  AMKR: `
    <svg viewBox="0 0 105 32" fill="none" xmlns="http://www.w3.org/2000/svg">
      <polygon points="4,22 14,7 24,22" fill="#005596"/>
      <polygon points="9,22 14,14 19,22" fill="#FFFFFF"/>
      <text x="28" y="21" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" font-size="14" font-weight="800" fill="currentColor">Amkor</text>
    </svg>
  `,
  ENPH: `
    <svg viewBox="0 0 115 32" fill="none" xmlns="http://www.w3.org/2000/svg">
      <circle cx="13" cy="16" r="9" stroke="#EA580C" stroke-width="2.5" fill="none"/>
      <rect x="9" y="10" width="8" height="2" fill="#EA580C"/>
      <rect x="9" y="15" width="6" height="2" fill="#EA580C"/>
      <rect x="9" y="20" width="8" height="2" fill="#EA580C"/>
      <text x="27" y="21" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" font-size="12" font-weight="800" fill="currentColor">ENPHASE</text>
    </svg>
  `,
  HOOD: `
    <svg viewBox="0 0 120 32" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M 17 6 C 11 12 8 18 10 24 C 11 25 12 24 12 23 C 12 20 14 16 18 13 C 19 19 17 23 15 25 C 19 23 21 17 21 11 C 21 7 19 6 17 6 Z" fill="#00C805"/>
      <text x="26" y="21" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" font-size="13" font-weight="800" fill="currentColor">Robinhood</text>
    </svg>
  `,
  SOFI: `
    <svg viewBox="0 0 95 32" fill="none" xmlns="http://www.w3.org/2000/svg">
      <circle cx="6" cy="16" r="2.5" fill="#00A2B8"/>
      <circle cx="12" cy="11" r="2.5" fill="#00A2B8"/>
      <circle cx="12" cy="21" r="2.5" fill="#00A2B8"/>
      <circle cx="18" cy="16" r="2.5" fill="#00A2B8"/>
      <text x="25" y="22" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" font-size="18" font-weight="900" fill="#00A2B8">SoFi</text>
    </svg>
  `,
  RMBS: `
    <svg viewBox="0 0 105 32" fill="none" xmlns="http://www.w3.org/2000/svg">
      <polygon points="5,6 18,6 13,24 5,24" fill="#00529B"/>
      <text x="8" y="19" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" font-size="13" font-weight="900" fill="#FFFFFF">R</text>
      <text x="24" y="21" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" font-size="14" font-weight="800" fill="currentColor">Rambus</text>
    </svg>
  `,
  TWLO: `
    <svg viewBox="0 0 105 32" fill="none" xmlns="http://www.w3.org/2000/svg">
      <circle cx="14" cy="16" r="9" stroke="#F22F46" stroke-width="2.2" fill="none"/>
      <circle cx="14" cy="16" r="5" stroke="#F22F46" stroke-width="1.8" fill="none"/>
      <circle cx="14" cy="16" r="2" fill="#F22F46"/>
      <text x="28" y="21" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" font-size="14" font-weight="800" fill="currentColor">twilio</text>
    </svg>
  `,
  FDX: `
    <svg viewBox="0 0 100 32" fill="none" xmlns="http://www.w3.org/2000/svg">
      <text x="4" y="22" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" font-size="18" font-weight="900" letter-spacing="-0.5">
        <tspan fill="#4D148C">Fed</tspan><tspan fill="#FF6600">Ex</tspan>
      </text>
    </svg>
  `,
  XOM: `
    <svg viewBox="0 0 120 32" fill="none" xmlns="http://www.w3.org/2000/svg">
      <text x="4" y="22" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" font-size="16" font-weight="900" fill="#ED1B2D" letter-spacing="-0.5">ExxonMobil</text>
    </svg>
  `,
  CVX: `
    <svg viewBox="0 0 115 32" fill="none" xmlns="http://www.w3.org/2000/svg">
      <polygon points="5,10 15,18 25,10 20,8 15,13 10,8" fill="#005B94"/>
      <polygon points="5,17 15,25 25,17 20,15 15,20 10,15" fill="#ED1B2D"/>
      <text x="29" y="21" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" font-size="14" font-weight="800" fill="currentColor">Chevron</text>
    </svg>
  `,
  PLTR: `
    <svg viewBox="0 0 120 32" fill="none" xmlns="http://www.w3.org/2000/svg">
      <circle cx="14" cy="16" r="8" stroke="currentColor" stroke-width="2"/>
      <circle cx="14" cy="16" r="3.5" fill="currentColor"/>
      <line x1="14" y1="24" x2="14" y2="28" stroke="currentColor" stroke-width="2"/>
      <text x="28" y="21" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" font-size="13" font-weight="800" fill="currentColor" letter-spacing="1.2">PALANTIR</text>
    </svg>
  `,
  QCOM: `
    <svg viewBox="0 0 125 32" fill="none" xmlns="http://www.w3.org/2000/svg">
      <circle cx="14" cy="16" r="9" stroke="#3253DC" stroke-width="2.5" fill="none"/>
      <line x1="19" y1="21" x2="25" y2="27" stroke="#3253DC" stroke-width="3" stroke-linecap="round"/>
      <text x="28" y="21" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" font-size="14" font-weight="800" fill="#3253DC">Qualcomm</text>
    </svg>
  `,
  ARM: `
    <svg viewBox="0 0 95 32" fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect x="3" y="7" width="18" height="18" rx="4" fill="#0091BD"/>
      <text x="8" y="21" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" font-size="14" font-weight="900" fill="#FFFFFF">a</text>
      <text x="26" y="22" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" font-size="18" font-weight="800" fill="#0091BD" letter-spacing="-0.5">arm</text>
    </svg>
  `,
  GFS: `
    <svg viewBox="0 0 140 32" fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect x="4" y="8" width="6" height="6" fill="#F36F21"/>
      <rect x="12" y="8" width="6" height="6" fill="#F36F21"/>
      <rect x="4" y="16" width="6" height="6" fill="#F36F21"/>
      <rect x="12" y="16" width="6" height="6" fill="#004370"/>
      <text x="24" y="16" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" font-size="10" font-weight="900" fill="currentColor" letter-spacing="0.5">GLOBAL</text>
      <text x="24" y="25" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" font-size="9" font-weight="700" fill="#F36F21" letter-spacing="0.5">FOUNDRIES</text>
    </svg>
  `,
  NXPI: `
    <svg viewBox="0 0 100 32" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M 4 8 L 10 24 L 16 8 Z" fill="#F48024"/>
      <text x="20" y="22" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" font-size="18" font-weight="900" letter-spacing="0.5">
        <tspan fill="#71BF44">N</tspan><tspan fill="#3E6DB5">X</tspan><tspan fill="#F48024">P</tspan>
      </text>
    </svg>
  `,
  ANET: `
    <svg viewBox="0 0 115 32" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M 5 22 L 14 6 L 23 22 Z" fill="#0C4A7A"/>
      <circle cx="14" cy="18" r="3" fill="#009BD9"/>
      <text x="28" y="21" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" font-size="15" font-weight="800" fill="currentColor">ARISTA</text>
    </svg>
  `,
  DDOG: `
    <svg viewBox="0 0 115 32" fill="none" xmlns="http://www.w3.org/2000/svg">
      <circle cx="14" cy="16" r="9" fill="#632CA6"/>
      <text x="10" y="21" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" font-size="12" font-weight="900" fill="#FFFFFF">D</text>
      <text x="28" y="21" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" font-size="14" font-weight="800" fill="#632CA6">datadog</text>
    </svg>
  `,
  NET: `
    <svg viewBox="0 0 120 32" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M 12 11 C 10 11 8 13 8 15 C 6 15 4 17 4 19 C 4 21 6 23 8 23 L 22 23 C 24 23 26 21 26 19 C 26 17 24 15 22 15 C 22 12 19 10 16 10 C 14 10 13 11 12 11 Z" fill="#F38020"/>
      <text x="30" y="21" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" font-size="13" font-weight="800" fill="currentColor">CLOUDFLARE</text>
    </svg>
  `,
  SQ: `
    <svg viewBox="0 0 95 32" fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect x="4" y="7" width="18" height="18" rx="4" stroke="currentColor" stroke-width="2.5" fill="none"/>
      <rect x="9" y="12" width="8" height="8" rx="1.5" fill="currentColor"/>
      <text x="28" y="22" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" font-size="16" font-weight="800" fill="currentColor">Block</text>
    </svg>
  `,
  APP: `
    <svg viewBox="0 0 120 32" fill="none" xmlns="http://www.w3.org/2000/svg">
      <circle cx="14" cy="16" r="9" fill="#00AEEF"/>
      <polygon points="14,10 20,21 8,21" fill="#FFFFFF"/>
      <text x="28" y="21" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" font-size="14" font-weight="900" fill="currentColor" letter-spacing="0.5">AppLovin</text>
    </svg>
  `,
  TTD: `
    <svg viewBox="0 0 125 32" fill="none" xmlns="http://www.w3.org/2000/svg">
      <circle cx="14" cy="16" r="9" fill="#008080"/>
      <text x="14" y="21" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" font-size="11" font-weight="900" fill="#FFFFFF" text-anchor="middle">TTD</text>
      <text x="28" y="21" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" font-size="12" font-weight="800" fill="currentColor">thetradedesk</text>
    </svg>
  `,
  FTNT: `
    <svg viewBox="0 0 115 32" fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect x="4" y="8" width="5" height="15" fill="#EE3124"/>
      <rect x="11" y="8" width="5" height="15" fill="#EE3124"/>
      <rect x="18" y="8" width="5" height="15" fill="#EE3124"/>
      <text x="28" y="21" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" font-size="14" font-weight="800" fill="currentColor">FORTINET</text>
    </svg>
  `,
  HUBS: `
    <svg viewBox="0 0 115 32" fill="none" xmlns="http://www.w3.org/2000/svg">
      <circle cx="14" cy="16" r="7" stroke="#FF7A59" stroke-width="2.5" fill="none"/>
      <circle cx="14" cy="9" r="2.5" fill="#FF7A59"/>
      <text x="28" y="21" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" font-size="14" font-weight="800" fill="#FF7A59">HubSpot</text>
    </svg>
  `,
  UBER: `
    <svg viewBox="0 0 95 32" fill="none" xmlns="http://www.w3.org/2000/svg">
      <text x="4" y="22" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" font-size="18" font-weight="900" fill="currentColor" letter-spacing="-0.5">Uber</text>
    </svg>
  `,
  EMR: `
    <svg viewBox="0 0 115 32" fill="none" xmlns="http://www.w3.org/2000/svg">
      <circle cx="14" cy="16" r="9" stroke="#004B87" stroke-width="2.5" fill="none"/>
      <text x="28" y="21" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" font-size="13" font-weight="800" fill="#004B87">EMERSON</text>
    </svg>
  `,
  MOD: `
    <svg viewBox="0 0 105 32" fill="none" xmlns="http://www.w3.org/2000/svg">
      <circle cx="14" cy="16" r="9" fill="#003366"/>
      <polygon points="14,10 18,18 10,18" fill="#F58220"/>
      <text x="28" y="21" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" font-size="14" font-weight="800" fill="currentColor">MODINE</text>
    </svg>
  `,
  CNP: `
    <svg viewBox="0 0 125 32" fill="none" xmlns="http://www.w3.org/2000/svg">
      <circle cx="14" cy="16" r="9" stroke="#0072CE" stroke-width="2.5" fill="none"/>
      <path d="M 8 16 Q 14 8 20 16" stroke="#78BE20" stroke-width="2" fill="none"/>
      <text x="28" y="21" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" font-size="11" font-weight="800" fill="currentColor">CenterPoint</text>
    </svg>
  `,
  LSCC: `
    <svg viewBox="0 0 110 32" fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect x="7" y="9" width="14" height="14" transform="rotate(45 14 16)" fill="#006699"/>
      <text x="28" y="21" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" font-size="13" font-weight="800" fill="currentColor">LATTICE</text>
    </svg>
  `,
  ZTS: `
    <svg viewBox="0 0 100 32" fill="none" xmlns="http://www.w3.org/2000/svg">
      <circle cx="14" cy="16" r="8" fill="#FF5A00"/>
      <text x="27" y="21" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" font-size="14" font-weight="800" fill="#FF5A00">zoetis</text>
    </svg>
  `,
  DVN: `
    <svg viewBox="0 0 100 32" fill="none" xmlns="http://www.w3.org/2000/svg">
      <circle cx="14" cy="16" r="8" fill="#005A36"/>
      <text x="26" y="21" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" font-size="14" font-weight="800" fill="currentColor">devon</text>
    </svg>
  `,
  ISRG: `
    <svg viewBox="0 0 115 32" fill="none" xmlns="http://www.w3.org/2000/svg">
      <circle cx="14" cy="16" r="9" stroke="#0096D6" stroke-width="2.5" fill="none"/>
      <circle cx="14" cy="16" r="4" fill="#0096D6"/>
      <text x="28" y="21" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" font-size="13" font-weight="800" fill="currentColor">INTUITIVE</text>
    </svg>
  `,
  CVS: `
    <svg viewBox="0 0 105 32" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M 14 12 C 12 8 8 9 8 13 C 8 17 14 22 14 22 C 14 22 20 17 20 13 C 20 9 16 8 14 12 Z" fill="#CC0000"/>
      <text x="26" y="22" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" font-size="16" font-weight="900" fill="#CC0000">CVS</text>
    </svg>
  `,
  DKNG: `
    <svg viewBox="0 0 125 32" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M 6 12 L 10 20 L 14 14 L 18 20 L 22 12 L 20 23 L 8 23 Z" fill="#53B848"/>
      <text x="28" y="21" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" font-size="13" font-weight="900" fill="currentColor">DRAFTKINGS</text>
    </svg>
  `,
  CSCO: `
    <svg viewBox="0 0 105 32" fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect x="5" y="14" width="2" height="8" fill="#1BA0D7"/>
      <rect x="9" y="10" width="2" height="12" fill="#1BA0D7"/>
      <rect x="13" y="6" width="2" height="16" fill="#1BA0D7"/>
      <rect x="17" y="10" width="2" height="12" fill="#1BA0D7"/>
      <rect x="21" y="14" width="2" height="8" fill="#1BA0D7"/>
      <text x="28" y="21" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" font-size="14" font-weight="900" fill="#1BA0D7">cisco</text>
    </svg>
  `,
  AMAT: `
    <svg viewBox="0 0 115 32" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M 6 22 L 14 6 L 22 22 Z" fill="#004C97"/>
      <text x="26" y="21" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" font-size="14" font-weight="900" fill="#004C97">APPLIED</text>
    </svg>
  `,
  DIS: `
    <svg viewBox="0 0 100 32" fill="none" xmlns="http://www.w3.org/2000/svg">
      <text x="4" y="23" font-family="Georgia, serif" font-size="18" font-weight="bold" font-style="italic" fill="currentColor">Disney</text>
    </svg>
  `,
  LRCX: `
    <svg viewBox="0 0 105 32" fill="none" xmlns="http://www.w3.org/2000/svg">
      <polygon points="5,8 18,8 14,24 5,24" fill="#00529B"/>
      <text x="26" y="21" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" font-size="14" font-weight="900" fill="currentColor">Lam</text>
    </svg>
  `,
  BABA: `
    <svg viewBox="0 0 115 32" fill="none" xmlns="http://www.w3.org/2000/svg">
      <circle cx="14" cy="16" r="9" fill="#FF6A00"/>
      <text x="14" y="21" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" font-size="12" font-weight="900" fill="#FFFFFF" text-anchor="middle">淘</text>
      <text x="28" y="21" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" font-size="14" font-weight="900" fill="#FF6A00">Alibaba</text>
    </svg>
  `
};

export const DEFAULT_TECH_EARNINGS = [
  // --- Monday (周一 10/26) ---
  {
    symbol: 'CDNS',
    name: 'Cadence Design Systems',
    day: 'mon',
    timing: 'AMC',
    reportStatus: 'beat',
    statusBadgeText: '超预期 · EDA与仿真满产',
    epsActual: '$1.46',
    epsPrev: '$1.26',
    revActual: '$1.21B',
    revPrev: '$1.02B',
    revQoq: '+6.2%',
    sectorId: 'chips',
    sectorName: 'AI 算力与芯片',
    isAiSupplyChain: true,
    aiTag: 'EDA 芯片设计底座',
    epsConsensus: '$1.44',
    revConsensus: '$1.18B',
    revYoy: '+16.5%',
    aiCatalyst: '定制化 AI 芯片爆发推动 EDA 授权持续超预期，Palladium 硬件仿真满载。'
  },
  {
    symbol: 'AMKR',
    name: 'Amkor Technology',
    day: 'mon',
    timing: 'AMC',
    reportStatus: 'beat',
    statusBadgeText: '稳健超预期 · 先进封装满载',
    epsActual: '$0.51',
    epsPrev: '$0.27',
    revActual: '$1.86B',
    revPrev: '$1.46B',
    revQoq: '+27.4%',
    sectorId: 'chips',
    sectorName: 'AI 算力与芯片',
    isAiSupplyChain: true,
    aiTag: 'CoWoS 先进封装外包',
    epsConsensus: '$0.49',
    revConsensus: '$1.84B',
    revYoy: '+7.2%',
    aiCatalyst: '2.5D/3D 高密度异构封装产能扩充，AI 加速卡外包封测份额提升。'
  },
  {
    symbol: 'RMBS',
    name: 'Rambus Inc.',
    day: 'mon',
    timing: 'AMC',
    reportStatus: 'beat',
    statusBadgeText: '超预期 · DDR5与PCIe6放量',
    epsActual: '$0.50',
    epsPrev: '$0.40',
    revActual: '$145.8M',
    revPrev: '$132.1M',
    revQoq: '+10.4%',
    sectorId: 'memory',
    sectorName: '存储与 HBM',
    isAiSupplyChain: true,
    aiTag: 'DDR5/CXL 接口芯片',
    epsConsensus: '$0.48',
    revConsensus: '$145M',
    revYoy: '+22.1%',
    aiCatalyst: '服务器 DDR5 内存缓冲接口芯片 (RCD) 与 PCIe 6.0 互连 IP 授权放量。'
  },

  // --- Tuesday (周二 10/27) ---
  {
    symbol: 'CAT',
    name: 'Caterpillar Inc.',
    day: 'tue',
    timing: 'BMO',
    reportStatus: 'miss',
    statusBadgeText: '不及预期 · 经销商库存去化',
    epsActual: '$5.17',
    epsPrev: '$5.52',
    revActual: '$16.11B',
    revPrev: '$16.81B',
    revQoq: '-4.2%',
    sectorId: 'energy',
    sectorName: '电力与能源',
    isAiSupplyChain: true,
    aiTag: '数据中心应急电力',
    epsConsensus: '$5.34',
    revConsensus: '$16.1B',
    revYoy: '+4.5%',
    aiCatalyst: 'AI 数据中心后备重型柴油与天然气发电机组在手积压订单创历史新高。'
  },
  {
    symbol: 'CARR',
    name: 'Carrier Global',
    day: 'tue',
    timing: 'BMO',
    reportStatus: 'beat',
    statusBadgeText: '符合预期 · 数据中心水冷提速',
    epsActual: '$0.83',
    epsPrev: '$0.87',
    revActual: '$6.60B',
    revPrev: '$6.70B',
    revQoq: '-1.5%',
    sectorId: 'datacenter',
    sectorName: '数据中心与制冷',
    isAiSupplyChain: true,
    aiTag: '数据中心工业温控',
    epsConsensus: '$0.81',
    revConsensus: '$6.58B',
    revYoy: '+12.4%',
    aiCatalyst: '北美超大规模数据中心高效水冷与排热机组交付加速。'
  },
  {
    symbol: 'SOFI',
    name: 'SoFi Technologies',
    day: 'tue',
    timing: 'BMO',
    reportStatus: 'beat',
    statusBadgeText: '超预期 · 会员与存贷款激增',
    epsActual: '$0.05',
    epsPrev: '$0.01',
    revActual: '$697M',
    revPrev: '$598M',
    revQoq: '+16.5%',
    sectorId: 'cloud',
    sectorName: '云计算与大模型',
    isAiSupplyChain: false,
    aiTag: '数字金融科技',
    epsConsensus: '$0.04',
    revConsensus: '$632M',
    revYoy: '+18.2%',
    aiCatalyst: '金融核心平台 Galileo 技术输出与会员存贷款规模健康回升。'
  },
  {
    symbol: 'GOOGL',
    name: 'Alphabet / Google',
    day: 'tue',
    timing: 'AMC',
    reportStatus: 'beat',
    statusBadgeText: '大超预期 · Google Cloud增速达35%',
    epsActual: '$2.12',
    epsPrev: '$1.89',
    revActual: '$88.27B',
    revPrev: '$84.74B',
    revQoq: '+4.2%',
    sectorId: 'cloud',
    sectorName: '云计算与大模型',
    isAiSupplyChain: true,
    aiTag: 'GCP 云与 TPU 算力',
    epsConsensus: '$1.85',
    revConsensus: '$86.3B',
    revYoy: '+13.8%',
    aiCatalyst: '关注 Google Cloud 营收增速是否达 28%+，自研 TPU v5p 部署及 Gemini API 变现。'
  },
  {
    symbol: 'AMD',
    name: 'Advanced Micro Devices',
    day: 'tue',
    timing: 'AMC',
    reportStatus: 'miss',
    statusBadgeText: '指引不及最高预期 · 盘后承压',
    epsActual: '$0.92',
    epsPrev: '$0.69',
    revActual: '$6.82B',
    revPrev: '$5.83B',
    revQoq: '+16.9%',
    sectorId: 'chips',
    sectorName: 'AI 算力与芯片',
    isAiSupplyChain: true,
    aiTag: 'MI300X AI 算力芯片',
    epsConsensus: '$0.92',
    revConsensus: '$6.71B',
    revYoy: '+15.7%',
    aiCatalyst: 'MI300X 及 MI325X 出货规模，全年 AI GPU 销售预期是否由 45 亿上调至 50 亿美元以上。'
  },
  {
    symbol: 'SKHY',
    name: 'SK Hynix (SK海力士)',
    day: 'tue',
    timing: 'AMC',
    reportStatus: 'beat',
    statusBadgeText: '历史新高 · HBM3e出货大满贯',
    epsActual: '₩5,200',
    epsPrev: '₩3,450',
    revActual: '₩17.57T',
    revPrev: '₩16.42T',
    revQoq: '+7.0%',
    sectorId: 'memory',
    sectorName: '存储与 HBM',
    isAiSupplyChain: true,
    aiTag: 'HBM3e 独家出货龙头',
    epsConsensus: '₩4,850',
    revConsensus: '₩18.1T',
    revYoy: '+85.0%',
    aiCatalyst: '12 层 HBM3e 产能售罄至 2025 年底，营业利润率冲刺 35%+。'
  },
  {
    symbol: 'STX',
    name: 'Seagate Technology',
    day: 'tue',
    timing: 'AMC',
    reportStatus: 'beat',
    statusBadgeText: '超预期 · HAMR大容量存储复苏',
    epsActual: '$1.58',
    epsPrev: '$1.05',
    revActual: '$2.17B',
    revPrev: '$1.89B',
    revQoq: '+14.8%',
    sectorId: 'memory',
    sectorName: '存储与 HBM',
    isAiSupplyChain: true,
    aiTag: '大容量 HAMR 存储',
    epsConsensus: '$1.48',
    revConsensus: '$2.12B',
    revYoy: '+46.0%',
    aiCatalyst: '云厂商 AI 原始训练集冷数据扩容，30TB+ HAMR 机械硬盘订单全面复苏。'
  },
  {
    symbol: 'RDDT',
    name: 'Reddit Inc.',
    day: 'tue',
    timing: 'AMC',
    reportStatus: 'beat',
    statusBadgeText: '超预期扭亏 · AI语料授权暴增',
    epsActual: '$0.16',
    epsPrev: '-$0.16',
    revActual: '$348.4M',
    revPrev: '$281.2M',
    revQoq: '+23.9%',
    sectorId: 'cloud',
    sectorName: '云计算与大模型',
    isAiSupplyChain: true,
    aiTag: 'AI 大模型语料许可',
    epsConsensus: '-$0.07',
    revConsensus: '$312M',
    revYoy: '+48.0%',
    aiCatalyst: '与 Google、OpenAI 签署的高毛利 AI 数据训练许可协议带来丰厚利润。'
  },
  {
    symbol: 'SMCI',
    name: 'Super Micro Computer',
    day: 'tue',
    timing: 'AMC',
    reportStatus: 'miss',
    statusBadgeText: '审计审查推迟 · 独立报告发布',
    epsActual: '$0.75 (初估)',
    epsPrev: '$0.62',
    revActual: '$5.95B',
    revPrev: '$5.31B',
    revQoq: '+12.1%',
    sectorId: 'datacenter',
    sectorName: '数据中心与制冷',
    isAiSupplyChain: true,
    aiTag: 'AI 液冷机柜与服务器',
    epsConsensus: '$0.75',
    revConsensus: '$5.90B',
    revYoy: '+180.0%',
    aiCatalyst: '直接液冷 (DLC) 模块供货能力与 AI GPU 服务器机柜出货交付放量。'
  },

  // --- Wednesday (周三 10/28 · 超级巨头日) ---
  {
    symbol: 'VRT',
    name: 'Vertiv Holdings',
    day: 'wed',
    timing: 'BMO',
    reportStatus: 'beat',
    statusBadgeText: '大超预期 · Blackwell液冷订单排满',
    epsActual: '$0.76',
    epsPrev: '$0.67',
    revActual: '$2.07B',
    revPrev: '$1.95B',
    revQoq: '+6.2%',
    sectorId: 'datacenter',
    sectorName: '数据中心与制冷',
    isAiSupplyChain: true,
    aiTag: '数据中心液冷温控龙头',
    epsConsensus: '$0.69',
    revConsensus: '$1.98B',
    revYoy: '+19.2%',
    aiCatalyst: 'NVIDIA Blackwell NVL72 机柜液冷配水系统关键供货商，订单出货比显著 > 1.2。'
  },
  {
    symbol: 'GEV',
    name: 'GE Vernova',
    day: 'wed',
    timing: 'BMO',
    reportStatus: 'beat',
    statusBadgeText: '超预期 · 燃气轮机与电网订单激增',
    epsActual: '$0.35',
    epsPrev: '-$0.24',
    revActual: '$8.91B',
    revPrev: '$8.20B',
    revQoq: '+8.7%',
    sectorId: 'energy',
    sectorName: '电力与能源',
    isAiSupplyChain: true,
    aiTag: '数据中心燃机与电网',
    epsConsensus: '$0.35',
    revConsensus: '$8.90B',
    revYoy: '+8.6%',
    aiCatalyst: 'AI 数据中心现场独立供电燃气轮机订单井喷，高压电网变压器交付排期长达数年。'
  },
  {
    symbol: 'APH',
    name: 'Amphenol Corporation',
    day: 'wed',
    timing: 'BMO',
    reportStatus: 'beat',
    statusBadgeText: '超预期 · NVL72铜互联缆线爆发',
    epsActual: '$0.50',
    epsPrev: '$0.44',
    revActual: '$4.04B',
    revPrev: '$3.61B',
    revQoq: '+11.9%',
    sectorId: 'interconnect',
    sectorName: '高速互联与通信',
    isAiSupplyChain: true,
    aiTag: 'NVL72 铜缆高速背板',
    epsConsensus: '$0.45',
    revConsensus: '$3.80B',
    revYoy: '+21.0%',
    aiCatalyst: 'GB200 NVL72 服务器机架内部高速铜缆连接器核心独供，毛利率维持高位。'
  },
  {
    symbol: 'CCJ',
    name: 'Cameco Corporation',
    day: 'wed',
    timing: 'BMO',
    reportStatus: 'miss',
    statusBadgeText: '不及预期 · 铀矿交付周期波动',
    epsActual: '$0.00',
    epsPrev: '$0.14',
    revActual: '$721M',
    revPrev: '$593M',
    revQoq: '+21.6%',
    sectorId: 'energy',
    sectorName: '电力与能源',
    isAiSupplyChain: true,
    aiTag: '核能原料铀矿巨头',
    epsConsensus: '$0.26',
    revConsensus: '$720M',
    revYoy: '+24.5%',
    aiCatalyst: '科技巨头寻求零碳全天候基荷电力推动长期核能采购长单，铀长约价逼近历史高位。'
  },
  {
    symbol: 'MSFT',
    name: 'Microsoft Corporation',
    day: 'wed',
    timing: 'AMC',
    reportStatus: 'beat',
    statusBadgeText: '超预期 · Azure增速达33%',
    epsActual: '$3.30',
    epsPrev: '$2.99',
    revActual: '$65.59B',
    revPrev: '$56.52B',
    revQoq: '+1.3%',
    sectorId: 'cloud',
    sectorName: '云计算与大模型',
    isAiSupplyChain: true,
    aiTag: 'Azure AI 与资本开支',
    epsConsensus: '$3.10',
    revConsensus: '$65.8B',
    revYoy: '+14.2%',
    aiCatalyst: 'Azure AI 对智能云增速的贡献度（预期 > 8%），以及超 190 亿美元单季度 AI Capex。'
  },
  {
    symbol: 'META',
    name: 'Meta Platforms',
    day: 'wed',
    timing: 'AMC',
    reportStatus: 'beat',
    statusBadgeText: '超预期 · 广告转化与Llama赋能',
    epsActual: '$6.03',
    epsPrev: '$4.39',
    revActual: '$40.59B',
    revPrev: '$39.07B',
    revQoq: '+3.9%',
    sectorId: 'cloud',
    sectorName: '云计算与大模型',
    isAiSupplyChain: true,
    aiTag: '开源大模型与算力集群',
    epsConsensus: '$5.25',
    revConsensus: '$40.3B',
    revYoy: '+18.0%',
    aiCatalyst: 'Llama 3/4 商业化生态赋能广告推荐转化率，2025 全年 Capex 指引是否进一步上调。'
  },
  {
    symbol: 'KLAC',
    name: 'KLA Corporation',
    day: 'wed',
    timing: 'AMC',
    reportStatus: 'beat',
    statusBadgeText: '超预期 · 先进封装量测设备强劲',
    epsActual: '$7.33',
    epsPrev: '$6.60',
    revActual: '$2.84B',
    revPrev: '$2.57B',
    revQoq: '+10.5%',
    sectorId: 'chips',
    sectorName: 'AI 算力与芯片',
    isAiSupplyChain: true,
    aiTag: '先进制程光学检测量测',
    epsConsensus: '$7.02',
    revConsensus: '$2.75B',
    revYoy: '+14.6%',
    aiCatalyst: '台积电等晶圆代工厂在 3nm/2nm 节点良率检测设备采购需求饱满。'
  },
  {
    symbol: 'HOOD',
    name: 'Robinhood Markets',
    day: 'wed',
    timing: 'AMC',
    reportStatus: 'miss',
    statusBadgeText: '不及预期 · 衍生品加密交易量放缓',
    epsActual: '$0.17',
    epsPrev: '$0.21',
    revActual: '$637M',
    revPrev: '$682M',
    revQoq: '-6.6%',
    sectorId: 'cloud',
    sectorName: '云计算与大模型',
    isAiSupplyChain: false,
    aiTag: '散户市场交易情绪',
    epsConsensus: '$0.18',
    revConsensus: '$660M',
    revYoy: '+39.0%',
    aiCatalyst: '隔夜美股全天候交易、预测市场与加密货币散户资金活跃度。'
  },

  // --- Thursday (周四 10/29 · 消费与云端对决) ---
  {
    symbol: 'INTC',
    name: 'Intel Corporation',
    day: 'thu',
    timing: 'BMO',
    reportStatus: 'miss',
    statusBadgeText: '爆雷 · 代工巨亏与Gaudi3指引下调',
    epsActual: '-$0.46',
    epsPrev: '$0.02',
    revActual: '$13.28B',
    revPrev: '$12.83B',
    revQoq: '+3.5%',
    sectorId: 'chips',
    sectorName: 'AI 算力与芯片',
    isAiSupplyChain: true,
    aiTag: 'Gaudi 3 与代工进展',
    epsConsensus: '-$0.24',
    revConsensus: '$13.0B',
    revYoy: '-8.5%',
    aiCatalyst: 'Gaudi 3 交付进展、至强 6 能效核 CPU 订单，以及 Intel 18A 工艺代工外部客户披露。'
  },
  {
    symbol: 'SNDK',
    name: 'SanDisk (西部数据/闪迪)',
    day: 'thu',
    timing: 'BMO',
    reportStatus: 'beat',
    statusBadgeText: '超预期 · QLC企业级SSD渗透提速',
    epsActual: '$1.82',
    epsPrev: '$1.44',
    revActual: '$4.28B',
    revPrev: '$3.76B',
    revQoq: '+13.8%',
    sectorId: 'memory',
    sectorName: '存储与 HBM',
    isAiSupplyChain: true,
    aiTag: '企业级 QLC eSSD',
    epsConsensus: '$1.77',
    revConsensus: '$4.10B',
    revYoy: '+50.2%',
    aiCatalyst: 'AI 推理服务器对高容量 30TB/60TB 企业级固态硬盘需求强劲，闪存颗粒均价上涨。'
  },
  {
    symbol: 'CEG',
    name: 'Constellation Energy',
    day: 'thu',
    timing: 'BMO',
    reportStatus: 'beat',
    statusBadgeText: '超预期 · 20年核电直供微软溢价',
    epsActual: '$2.74',
    epsPrev: '$1.68',
    revActual: '$6.55B',
    revPrev: '$5.48B',
    revQoq: '+19.5%',
    sectorId: 'energy',
    sectorName: '电力与能源',
    isAiSupplyChain: true,
    aiTag: '数据中心核电直供',
    epsConsensus: '$2.64',
    revConsensus: '$6.52B',
    revYoy: '+11.8%',
    aiCatalyst: '与微软签署 20 年三里岛核电站 835MW 直供大单，溢价清洁电力合同示范效应。'
  },
  {
    symbol: 'AMZN',
    name: 'Amazon.com',
    day: 'thu',
    timing: 'AMC',
    reportStatus: 'beat',
    statusBadgeText: '大超预期 · AWS增速达19%利润创新高',
    epsActual: '$1.43',
    epsPrev: '$1.26',
    revActual: '$158.88B',
    revPrev: '$147.98B',
    revQoq: '+7.4%',
    sectorId: 'cloud',
    sectorName: '云计算与大模型',
    isAiSupplyChain: true,
    aiTag: 'AWS 云与自研算力芯片',
    epsConsensus: '$1.14',
    revConsensus: '$157.2B',
    revYoy: '+10.1%',
    aiCatalyst: 'AWS 营收增速是否达 19%+，Trainium 2 自研芯片降低资本开支成效。'
  },
  {
    symbol: 'AAPL',
    name: 'Apple Inc.',
    day: 'thu',
    timing: 'AMC',
    reportStatus: 'beat',
    statusBadgeText: '稳健超预期 · iPhone 16早期出货强劲',
    epsActual: '$1.64',
    epsPrev: '$1.40',
    revActual: '$94.93B',
    revPrev: '$85.78B',
    revQoq: '+10.7%',
    sectorId: 'cloud',
    sectorName: '云计算与大模型',
    isAiSupplyChain: true,
    aiTag: '端侧 Apple Intelligence',
    epsConsensus: '$1.60',
    revConsensus: '$94.9B',
    revYoy: '+6.1%',
    aiCatalyst: 'Apple Intelligence 上线对 iPhone 16 系列换机周期刺激，服务收入创新高。'
  },
  {
    symbol: 'NOW',
    name: 'ServiceNow',
    day: 'thu',
    timing: 'AMC',
    reportStatus: 'beat',
    statusBadgeText: '超预期 · GenAI Pro席位续订高增',
    epsActual: '$3.72',
    epsPrev: '$3.13',
    revActual: '$2.80B',
    revPrev: '$2.63B',
    revQoq: '+6.5%',
    sectorId: 'cloud',
    sectorName: '云计算与大模型',
    isAiSupplyChain: true,
    aiTag: '企业级 AI Agent 落地',
    epsConsensus: '$3.46',
    revConsensus: '$2.74B',
    revYoy: '+22.4%',
    aiCatalyst: 'Now Assist 生成式 AI 企业自动化工作流签约提速，高续费率支撑高估值。'
  },
  {
    symbol: 'COIN',
    name: 'Coinbase Global',
    day: 'thu',
    timing: 'AMC',
    reportStatus: 'miss',
    statusBadgeText: '不及预期 · 现货交易量环比缩量',
    epsActual: '$0.28',
    epsPrev: '$0.14',
    revActual: '$1.21B',
    revPrev: '$1.45B',
    revQoq: '-16.6%',
    sectorId: 'cloud',
    sectorName: '云计算与大模型',
    isAiSupplyChain: false,
    aiTag: '加密生态与 AI 微支付',
    epsConsensus: '$0.42',
    revConsensus: '$1.25B',
    revYoy: '+86.0%',
    aiCatalyst: 'Base L2 生态与 AI Agent 自动化链上结算协议采用度，现货与衍生品交易量。'
  },

  // --- Friday (周五 10/30 · 能源压轴) ---
  {
    symbol: 'XOM',
    name: 'Exxon Mobil',
    day: 'fri',
    timing: 'BMO',
    reportStatus: 'beat',
    statusBadgeText: '超预期 · 二叠纪先锋资产产量井喷',
    epsActual: '$1.92',
    epsPrev: '$2.14',
    revActual: '$95.0B',
    revPrev: '$93.06B',
    revQoq: '+2.1%',
    sectorId: 'energy',
    sectorName: '电力与能源',
    isAiSupplyChain: true,
    aiTag: '数据中心天然气与低碳电',
    epsConsensus: '$1.88',
    revConsensus: '$93.9B',
    revYoy: '+3.4%',
    aiCatalyst: '先锋自然资源并表产量，与科技企业合作的数据中心天然气现场发电供电合同。'
  },
  {
    symbol: 'ENPH',
    name: 'Enphase Energy',
    day: 'fri',
    timing: 'BMO',
    reportStatus: 'miss',
    statusBadgeText: '爆雷 · 欧洲渠道去库存拖累严重',
    epsActual: '$0.65',
    epsPrev: '$0.43',
    revActual: '$380.9M',
    revPrev: '$303.5M',
    revQoq: '+25.5%',
    sectorId: 'energy',
    sectorName: '电力与能源',
    isAiSupplyChain: true,
    aiTag: '工商业分布式微逆储能',
    epsConsensus: '$0.78',
    revConsensus: '$392M',
    revYoy: '-28.0%',
    aiCatalyst: '欧洲渠道库存出清进度与工商业分布式光储与边缘算力微电网合作。'
  }
];

// --- 本周重磅科技与 AI 财报列表 (2026年11月02日 - 11月06日 · 芯片/AI应用核心周) ---
export const CURRENT_WEEK_EARNINGS = [
  // --- Monday (周一 11/02) ---
  {
    symbol: 'PLTR',
    name: 'Palantir Technologies',
    day: 'mon',
    timing: 'AMC',
    reportStatus: 'beat',
    statusBadgeText: '超预期大捷 · AIP商业化爆发',
    sectorId: 'cloud',
    sectorName: '云计算与大模型',
    isAiSupplyChain: true,
    aiTag: 'AI Agent 操作系统 / AIP 龙头',
    epsConsensus: '$0.09',
    epsActual: '$0.10',
    epsPrev: '$0.07',
    revConsensus: '$703M',
    revActual: '$725.5M',
    revPrev: '$678.1M',
    revYoy: '+29.8%',
    revQoq: '+7.0%',
    aiCatalyst: 'AIP (Artificial Intelligence Platform) 商业化井喷，美国商业客户增速超 50%，标普 500 纳入后首份全景财报。'
  },
  {
    symbol: 'NXPI',
    name: 'NXP Semiconductors',
    day: 'mon',
    timing: 'AMC',
    reportStatus: 'beat',
    statusBadgeText: '稳健微超 · 汽车微控去库拐点',
    sectorId: 'chips',
    sectorName: 'AI 算力与芯片',
    isAiSupplyChain: true,
    aiTag: '汽车芯片与边缘 AI 处理器',
    epsConsensus: '$3.43',
    epsActual: '$3.45',
    epsPrev: '$3.20',
    revConsensus: '$3.25B',
    revActual: '$3.25B',
    revPrev: '$3.13B',
    revYoy: '-5.2%',
    revQoq: '+3.8%',
    aiCatalyst: '汽车与工业边缘微控制器 (MCU/MPU) 去库存拐点，i.MX95 边缘神经网络芯片定点上车。'
  },
  {
    symbol: 'LSCC',
    name: 'Lattice Semiconductor',
    day: 'mon',
    timing: 'AMC',
    reportStatus: 'miss',
    statusBadgeText: '终端放缓 · 处于库存消化筑底期',
    sectorId: 'chips',
    sectorName: 'AI 算力与芯片',
    isAiSupplyChain: true,
    aiTag: '低功耗 FPGA 与端侧 AI 控制',
    epsConsensus: '$0.24',
    epsActual: '$0.22',
    epsPrev: '$0.23',
    revConsensus: '$127M',
    revActual: '$124.8M',
    revPrev: '$124.1M',
    revYoy: '-34.0%',
    revQoq: '+0.6%',
    aiCatalyst: 'Avant 平台高端 FPGA 推进加速，服务器基板安全管理 (BMC) 与端侧 AI 加速需求回升。'
  },

  // --- Tuesday (周二 11/03 · 今日 / Today) ---
  {
    symbol: 'GFS',
    name: 'GlobalFoundries',
    day: 'tue',
    timing: 'BMO',
    reportStatus: 'beat',
    statusBadgeText: '超预期 · 硅光800G放量',
    sectorId: 'chips',
    sectorName: 'AI 算力与芯片',
    isAiSupplyChain: true,
    aiTag: '专业晶圆代工与射频硅光',
    epsConsensus: '$0.38',
    epsActual: '$0.41',
    epsPrev: '$0.34',
    revConsensus: '$1.73B',
    revActual: '$1.74B',
    revPrev: '$1.63B',
    revYoy: '-6.1%',
    revQoq: '+6.7%',
    aiCatalyst: '硅光子 (Silicon Photonics) 晶圆代工量产推进，数据中心 800G 光收发模块代工良率突破。'
  },
  {
    symbol: 'EMR',
    name: 'Emerson Electric',
    day: 'tue',
    timing: 'BMO',
    reportStatus: 'beat',
    statusBadgeText: '超预期 · 数据中心温控自动化强劲',
    sectorId: 'datacenter',
    sectorName: '数据中心与制冷',
    isAiSupplyChain: true,
    aiTag: '数据中心自动化与热管理测控',
    epsConsensus: '$1.48',
    epsActual: '$1.52',
    epsPrev: '$1.42',
    revConsensus: '$4.55B',
    revActual: '$4.62B',
    revPrev: '$4.38B',
    revYoy: '+13.8%',
    revQoq: '+5.5%',
    aiCatalyst: '数据中心自动化温控与配电监测系统订单强劲，过程控制软件 AspenTech 协同效应显现。'
  },
  {
    symbol: 'ZTS',
    name: 'Zoetis Inc.',
    day: 'tue',
    timing: 'BMO',
    reportStatus: 'beat',
    statusBadgeText: '稳健超预期 · 动保创新药放量',
    sectorId: 'cloud',
    sectorName: '云计算与大模型',
    isAiSupplyChain: false,
    aiTag: '动保医疗健康科技',
    epsConsensus: '$1.46',
    epsActual: '$1.48',
    epsPrev: '$1.36',
    revConsensus: '$2.29B',
    revActual: '$2.31B',
    revPrev: '$2.15B',
    revYoy: '+6.5%',
    revQoq: '+7.4%',
    aiCatalyst: '伴侣动物创新药物 Librela 渗透率与全球诊断耗材数字化增长。'
  },
  {
    symbol: 'SMCI',
    name: 'Super Micro Computer',
    day: 'tue',
    timing: 'AMC',
    reportStatus: 'miss',
    statusBadgeText: '审计延期承压 · 特别调查披露',
    sectorId: 'datacenter',
    sectorName: '数据中心与制冷',
    isAiSupplyChain: true,
    aiTag: 'AI 液冷机柜与 Blackwell 服务器',
    epsConsensus: '$0.75',
    epsActual: '$0.75 (初估)',
    epsPrev: '$0.34',
    revConsensus: '$5.90B',
    revActual: '$5.95B',
    revPrev: '$5.31B',
    revYoy: '+181.0%',
    revQoq: '+12.0%',
    aiCatalyst: '独家公布审计委员会特别审查独立结论、新审计师聘任进展及 Blackwell 液冷系统量产交付节奏。'
  },
  {
    symbol: 'UBER',
    name: 'Uber Technologies',
    day: 'tue',
    timing: 'AMC',
    reportStatus: 'miss',
    statusBadgeText: '总预订量微逊预期 · 核心出行业务强',
    sectorId: 'cloud',
    sectorName: '云计算与大模型',
    isAiSupplyChain: true,
    aiTag: 'Robotaxi 自动驾驶网络与 AI 调度',
    epsConsensus: '$0.41',
    epsActual: '$0.40',
    epsPrev: '$0.47',
    revConsensus: '$10.98B',
    revActual: '$10.92B',
    revPrev: '$10.70B',
    revYoy: '+18.0%',
    revQoq: '+2.1%',
    aiCatalyst: '与 Waymo、Cruise 战略合作落地，自动驾驶运力接入与全球出行订单总额持续超预期。'
  },
  {
    symbol: 'DVN',
    name: 'Devon Energy',
    day: 'tue',
    timing: 'AMC',
    reportStatus: 'beat',
    statusBadgeText: '超预期 · 二叠纪井位效益攀升',
    sectorId: 'energy',
    sectorName: '电力与能源',
    isAiSupplyChain: true,
    aiTag: '页岩油气上游开发与能源基石',
    epsConsensus: '$1.10',
    epsActual: '$1.14',
    epsPrev: '$1.08',
    revConsensus: '$3.85B',
    revActual: '$3.92B',
    revPrev: '$3.61B',
    revYoy: '+1.8%',
    revQoq: '+8.6%',
    aiCatalyst: '二叠纪盆地优质井位钻探效率提升，数据中心天然气原位发电潜在供气协议。'
  },

  // --- Wednesday (周三 11/04) ---
  {
    symbol: 'ISRG',
    name: 'Intuitive Surgical',
    day: 'wed',
    timing: 'BMO',
    reportStatus: 'pending',
    statusBadgeText: '待公布 · da Vinci 5 渗透',
    sectorId: 'chips',
    sectorName: 'AI 算力与芯片',
    isAiSupplyChain: true,
    aiTag: '达芬奇机器人与 AI 手术系统',
    epsConsensus: '$1.63',
    epsActual: '待公布',
    epsPrev: '$1.46',
    revConsensus: '$2.02B',
    revActual: '待公布',
    revPrev: '$1.89B',
    revYoy: '+16.1%',
    revQoq: '+6.9%',
    aiCatalyst: '第五代达芬奇机器人 (da Vinci 5) 临床铺设加速，计算能力提升 10,000 倍赋能 AI 影像辅助。'
  },
  {
    symbol: 'CVS',
    name: 'CVS Health',
    day: 'wed',
    timing: 'BMO',
    reportStatus: 'pending',
    statusBadgeText: '待公布 · 管理层重组与控费',
    sectorId: 'cloud',
    sectorName: '云计算与大模型',
    isAiSupplyChain: false,
    aiTag: '医保与药店连锁巨头',
    epsConsensus: '$1.51',
    epsActual: '待公布',
    epsPrev: '$1.83',
    revConsensus: '$92.7B',
    revActual: '待公布',
    revPrev: '$91.2B',
    revYoy: '+3.2%',
    revQoq: '+1.6%',
    aiCatalyst: '医疗服务成本率 (MLR) 控制改善与管理层换帅后的战略重组路线图。'
  },
  {
    symbol: 'QCOM',
    name: 'Qualcomm Inc.',
    day: 'wed',
    timing: 'AMC',
    reportStatus: 'pending',
    statusBadgeText: '待公布 · 骁龙8 Elite 首发',
    sectorId: 'chips',
    sectorName: 'AI 算力与芯片',
    isAiSupplyChain: true,
    aiTag: '端侧 AI 手机与骁龙 PC 芯片',
    epsConsensus: '$2.56',
    epsActual: '待公布',
    epsPrev: '$2.33',
    revConsensus: '$9.90B',
    revActual: '待公布',
    revPrev: '$9.39B',
    revYoy: '+14.2%',
    revQoq: '+5.4%',
    aiCatalyst: 'Snapdragon 8 Elite 首发出货，骁龙 X Elite AI PC 渗透率提升，手机厂商端侧 GenAI 换机潮。'
  },
  {
    symbol: 'ARM',
    name: 'Arm Holdings',
    day: 'wed',
    timing: 'AMC',
    reportStatus: 'pending',
    statusBadgeText: '待公布 · v9 架构授权费翻倍',
    sectorId: 'chips',
    sectorName: 'AI 算力与芯片',
    isAiSupplyChain: true,
    aiTag: 'AI 芯片 IP 架构与算力授权',
    epsConsensus: '$0.32',
    epsActual: '待公布',
    epsPrev: '$0.36',
    revConsensus: '$808M',
    revActual: '待公布',
    revPrev: '$806M',
    revYoy: '-0.3%',
    revQoq: '+0.2%',
    aiCatalyst: 'Armv9 架构授权版税率翻倍，Neoverse 数据中心 AI 加速芯片设计采纳率与自研芯片生态。'
  },
  {
    symbol: 'APP',
    name: 'AppLovin Corp.',
    day: 'wed',
    timing: 'AMC',
    reportStatus: 'pending',
    statusBadgeText: '待公布 · AXON 2.0 AI广告引擎',
    sectorId: 'cloud',
    sectorName: '云计算与大模型',
    isAiSupplyChain: true,
    aiTag: 'AXON 2.0 AI 广告推荐引擎',
    epsConsensus: '$1.25',
    epsActual: '待公布',
    epsPrev: '$0.67',
    revConsensus: '$1.13B',
    revActual: '待公布',
    revPrev: '$1.08B',
    revYoy: '+31.0%',
    revQoq: '+4.6%',
    aiCatalyst: 'AXON 2.0 广告 AI 模型将转化率提升数倍，电商广告客户网络爆发，自由现金流利润率突破 50%。'
  },
  {
    symbol: 'HUBS',
    name: 'HubSpot Inc.',
    day: 'wed',
    timing: 'AMC',
    reportStatus: 'pending',
    statusBadgeText: '待公布 · Breeze AI 客服融入',
    sectorId: 'cloud',
    sectorName: '云计算与大模型',
    isAiSupplyChain: true,
    aiTag: 'Breeze AI 智能营销与客服',
    epsConsensus: '$1.91',
    epsActual: '待公布',
    epsPrev: '$1.59',
    revConsensus: '$647M',
    revActual: '待公布',
    revPrev: '$637M',
    revYoy: '+18.5%',
    revQoq: '+1.6%',
    aiCatalyst: 'Breeze AI Agent 全面融入营销中台，中小企业智能化续订率与净扩张率提升。'
  },

  // --- Thursday (周四 11/05) ---
  {
    symbol: 'DDOG',
    name: 'Datadog Inc.',
    day: 'thu',
    timing: 'BMO',
    reportStatus: 'pending',
    statusBadgeText: '待公布 · LLM可观测性订阅',
    sectorId: 'cloud',
    sectorName: '云计算与大模型',
    isAiSupplyChain: true,
    aiTag: '云可观测性与 LLM 监控平台',
    epsConsensus: '$0.40',
    epsActual: '待公布',
    epsPrev: '$0.36',
    revConsensus: '$638M',
    revActual: '待公布',
    revPrev: '$547M',
    revYoy: '+16.5%',
    revQoq: '+4.1%',
    aiCatalyst: 'LLM Observability 观测工具被顶级 AI 实验室采用，云迁移与多云安全需求回升。'
  },
  {
    symbol: 'MOD',
    name: 'Modine Manufacturing',
    day: 'thu',
    timing: 'BMO',
    reportStatus: 'pending',
    statusBadgeText: '待公布 · 数据中心冷却塔订单',
    sectorId: 'datacenter',
    sectorName: '数据中心与制冷',
    isAiSupplyChain: true,
    aiTag: '数据中心精密温控与冷却机组',
    epsConsensus: '$0.97',
    epsActual: '待公布',
    epsPrev: '$0.89',
    revConsensus: '$660M',
    revActual: '待公布',
    revPrev: '$624M',
    revYoy: '+6.3%',
    revQoq: '+5.8%',
    aiCatalyst: 'Airedale 数据中心冷水机组与冷却塔订单激增，AI 算力中心制冷扩产放量。'
  },
  {
    symbol: 'ANET',
    name: 'Arista Networks',
    day: 'thu',
    timing: 'AMC',
    reportStatus: 'pending',
    statusBadgeText: '待公布 · 800G/1.6T 以太网龙头',
    sectorId: 'interconnect',
    sectorName: '高速互联与通信',
    isAiSupplyChain: true,
    aiTag: '800G/1.6T AI 以太网交换机龙头',
    epsConsensus: '$2.08',
    epsActual: '待公布',
    epsPrev: '$1.83',
    revConsensus: '$1.74B',
    revActual: '待公布',
    revPrev: '$1.57B',
    revYoy: '+15.2%',
    revQoq: '+4.8%',
    aiCatalyst: 'Ethernet AI 交换机在超大规模数据中心渗透加速，对英伟达 InfiniBand 形成强力替代。'
  },
  {
    symbol: 'NET',
    name: 'Cloudflare Inc.',
    day: 'thu',
    timing: 'AMC',
    reportStatus: 'pending',
    statusBadgeText: '待公布 · Workers AI 边缘推理',
    sectorId: 'cloud',
    sectorName: '云计算与大模型',
    isAiSupplyChain: true,
    aiTag: 'Workers AI 边缘推理与安全',
    epsConsensus: '$0.18',
    epsActual: '待公布',
    epsPrev: '$0.16',
    revConsensus: '$424M',
    revActual: '待公布',
    revPrev: '$401M',
    revYoy: '+26.3%',
    revQoq: '+5.7%',
    aiCatalyst: 'Workers AI 全球节点无服务器推理调用量激增，AI 爬虫封锁与网络安全大单加速转化。'
  },
  {
    symbol: 'SQ',
    name: 'Block Inc.',
    day: 'thu',
    timing: 'AMC',
    reportStatus: 'pending',
    statusBadgeText: '待公布 · Cash App 毛利扩张',
    sectorId: 'cloud',
    sectorName: '云计算与大模型',
    isAiSupplyChain: false,
    aiTag: '数字支付与 Cash App 金融科技',
    epsConsensus: '$0.87',
    epsActual: '待公布',
    epsPrev: '$0.75',
    revConsensus: '$6.24B',
    revActual: '待公布',
    revPrev: '$6.16B',
    revYoy: '+11.0%',
    revQoq: '+1.3%',
    aiCatalyst: 'Cash App 活跃用户毛利扩张，Rule of 40 财务纪律执行，企业销售团队改革成效。'
  },
  {
    symbol: 'TTD',
    name: 'The Trade Desk',
    day: 'thu',
    timing: 'AMC',
    reportStatus: 'pending',
    statusBadgeText: '待公布 · Kokai AI 出价竞价',
    sectorId: 'cloud',
    sectorName: '云计算与大模型',
    isAiSupplyChain: true,
    aiTag: 'Kokai AI 驱动数字广告竞价平台',
    epsConsensus: '$0.39',
    epsActual: '待公布',
    epsPrev: '$0.33',
    revConsensus: '$620M',
    revActual: '待公布',
    revPrev: '$585M',
    revYoy: '+25.8%',
    revQoq: '+6.0%',
    aiCatalyst: 'Kokai AI 智能出价算法全面普及，智能电视 (CTV) 广告支出强劲与 Cookie 替代方案落地。'
  },
  {
    symbol: 'FTNT',
    name: 'Fortinet Inc.',
    day: 'thu',
    timing: 'AMC',
    reportStatus: 'pending',
    statusBadgeText: '待公布 · SASE 网安统一平台',
    sectorId: 'cloud',
    sectorName: '云计算与大模型',
    isAiSupplyChain: true,
    aiTag: 'AI 网络安全与 SASE 统一平台',
    epsConsensus: '$0.51',
    epsActual: '待公布',
    epsPrev: '$0.43',
    revConsensus: '$1.48B',
    revActual: '待公布',
    revPrev: '$1.43B',
    revYoy: '+10.8%',
    revQoq: '+3.5%',
    aiCatalyst: 'FortiOS 7.6 融入 GenAI 防御，安全接入服务边缘 (SASE) 与 SecOps 订阅合同高增。'
  },

  // --- Friday (周五 11/06) ---
  {
    symbol: 'DKNG',
    name: 'DraftKings Inc.',
    day: 'fri',
    timing: 'BMO',
    reportStatus: 'pending',
    statusBadgeText: '待公布 · NFL 赛事投注热潮',
    sectorId: 'cloud',
    sectorName: '云计算与大模型',
    isAiSupplyChain: false,
    aiTag: '数字体育博彩与 AI 赔率引擎',
    epsConsensus: '-$0.41',
    epsActual: '待公布',
    epsPrev: '-$0.61',
    revConsensus: '$1.11B',
    revActual: '待公布',
    revPrev: '$1.10B',
    revYoy: '+39.7%',
    revQoq: '+0.9%',
    aiCatalyst: 'NFL 赛季用户参与度创新高，AI 动态赔率算法提升 Hold Rate 结构性利润率。'
  },
  {
    symbol: 'CNP',
    name: 'CenterPoint Energy',
    day: 'fri',
    timing: 'BMO',
    reportStatus: 'pending',
    statusBadgeText: '待公布 · 数据中心电网扩容',
    sectorId: 'energy',
    sectorName: '电力与能源',
    isAiSupplyChain: true,
    aiTag: '得州电网与数据中心输配电',
    epsConsensus: '$0.36',
    epsActual: '待公布',
    epsPrev: '$0.33',
    revConsensus: '$2.05B',
    revActual: '待公布',
    revPrev: '$1.91B',
    revYoy: '+10.2%',
    revQoq: '+7.3%',
    aiCatalyst: '大休斯敦地区数据中心巨额并网申请，电网韧性投资与基建资本支出计划。'
  }
];

// --- 下周前瞻财报列表 (2026年11月09日 - 11月13日) ---
export const NEXT_WEEK_EARNINGS = [
  {
    symbol: 'CSCO',
    name: 'Cisco Systems',
    day: 'wed',
    timing: 'AMC',
    reportStatus: 'pending',
    statusBadgeText: '等待披露 · 下周前瞻',
    epsActual: null,
    epsPrev: '$0.87',
    revActual: null,
    revPrev: '$13.6B',
    revQoq: '-',
    sectorId: 'interconnect',
    sectorName: '高速互联与通信',
    isAiSupplyChain: true,
    aiTag: '数据中心以太网与 Splunk 安全集成',
    epsConsensus: '$0.87',
    revConsensus: '$13.7B',
    revYoy: '-6.5%',
    aiCatalyst: 'Splunk 整合后的 ARR 经常性收入增长与 Silicon One 交换芯片在 AI 集群中的订单放量。'
  },
  {
    symbol: 'DIS',
    name: 'The Walt Disney Company',
    day: 'wed',
    timing: 'AMC',
    reportStatus: 'pending',
    statusBadgeText: '等待披露 · 下周前瞻',
    epsActual: null,
    epsPrev: '$0.82',
    revActual: null,
    revPrev: '$22.3B',
    revQoq: '-',
    sectorId: 'cloud',
    sectorName: '云计算与大模型',
    isAiSupplyChain: false,
    aiTag: '流媒体盈利与内容数字化',
    epsConsensus: '$1.10',
    revConsensus: '$22.5B',
    revYoy: '+6.1%',
    aiCatalyst: 'Disney+ 与 Hulu 流媒体业务扭亏为盈后的营业利润率提升，主题乐园客单价稳定性。'
  },
  {
    symbol: 'AMAT',
    name: 'Applied Materials',
    day: 'thu',
    timing: 'AMC',
    reportStatus: 'pending',
    statusBadgeText: '等待披露 · 下周前瞻',
    epsActual: null,
    epsPrev: '$2.12',
    revActual: null,
    revPrev: '$6.78B',
    revQoq: '-',
    sectorId: 'chips',
    sectorName: 'AI 算力与芯片',
    isAiSupplyChain: true,
    aiTag: '半导体先进制程设备 / GAA & 封装',
    epsConsensus: '$2.19',
    revConsensus: '$6.95B',
    revYoy: '+3.5%',
    aiCatalyst: 'Gate-All-Around (GAA) 晶体管与背面供电 (BSPDN) 制造设备订单放量，AI 芯片资本支出驱动。'
  },
  {
    symbol: 'LRCX',
    name: 'Lam Research',
    day: 'thu',
    timing: 'AMC',
    reportStatus: 'pending',
    statusBadgeText: '等待披露 · 下周前瞻',
    epsActual: null,
    epsPrev: '$0.76',
    revActual: null,
    revPrev: '$3.87B',
    revQoq: '-',
    sectorId: 'chips',
    sectorName: 'AI 算力与芯片',
    isAiSupplyChain: true,
    aiTag: '高深宽比刻蚀与 HBM 存储设备',
    epsConsensus: '$0.81',
    revConsensus: '$4.05B',
    revYoy: '+16.4%',
    aiCatalyst: '3D NAND 与 HBM 堆叠刻蚀设备采购回暖，先进封装清洗刻蚀良率设备需求强劲。'
  },
  {
    symbol: 'BABA',
    name: 'Alibaba Group (阿里巴巴)',
    day: 'fri',
    timing: 'BMO',
    reportStatus: 'pending',
    statusBadgeText: '等待披露 · 下周前瞻',
    epsActual: null,
    epsPrev: '$1.98',
    revActual: null,
    revPrev: '$32.8B',
    revQoq: '-',
    sectorId: 'cloud',
    sectorName: '云计算与大模型',
    isAiSupplyChain: true,
    aiTag: '阿里云与通义千问大模型开源生态',
    epsConsensus: '$2.11',
    revConsensus: '$34.2B',
    revYoy: '+5.5%',
    aiCatalyst: '阿里云公共云收入双位数增长，AI 相关产品营收连续三位数高增，通义千问企业级 API 商业化。'
  }
];

// --- 多周财报配置聚合映射 (周历切换器核心数据源) ---
export const EARNINGS_WEEKS = {
  current: {
    id: 'current',
    label: '本周 (11/02 - 11/06)',
    rangeText: '2026 Q3/Q4 核心披露周 · 11月02日 - 11月06日',
    theme: '芯片、AI边缘与企业软件周',
    summary: '覆盖 Palantir、高通、ARM、超微电脑、阿里斯塔网络等核心标的',
    days: CURRENT_WEEK_DAYS,
    items: CURRENT_WEEK_EARNINGS
  },
  prev: {
    id: 'prev',
    label: '上周 (10/26 - 10/30)',
    rangeText: '2026 Q3/Q4 超级披露周 · 10月26日 - 10月30日 (已发布复盘)',
    theme: '科技七巨头超级财报周',
    summary: '覆盖 谷歌、微软、Meta、苹果、亚马逊等科技巨头与 AI 链条',
    days: PREV_WEEK_DAYS,
    items: DEFAULT_TECH_EARNINGS
  },
  next: {
    id: 'next',
    label: '下周 (11/09 - 11/13)',
    rangeText: '2026 Q3/Q4 前瞻周 · 11月09日 - 11月13日',
    theme: '半导体设备、网络安全与中概前瞻',
    summary: '覆盖 思科、应用材料、泛林半导体、迪士尼、阿里巴巴等重点公司',
    days: NEXT_WEEK_DAYS,
    items: NEXT_WEEK_EARNINGS
  }
};

// 宏观重磅经济日历 (CPI / PPI / 非农 / 美联储)，附带明确的多空指引
export const MACRO_CALENDAR_ITEMS = [
  {
    id: 'cpi-headline',
    name: '美国 9 月未季调 CPI 年率',
    category: 'inflation',
    dateStr: '10月10日 20:30',
    previous: '2.5%',
    forecast: '2.3%',
    actual: '2.4%',
    bias: 'neutral',
    biasText: '符合预期 · 中性震荡',
    biasCls: 'kpi-pill-amber',
    analysis: '整体通胀平稳回落至 2.4%，能源价格走低抑制综合通胀，支持美联储稳步降息节奏。'
  },
  {
    id: 'cpi-core',
    name: '美国 9 月核心 CPI 年率 (不含食品与能源)',
    category: 'inflation',
    dateStr: '10月10日 20:30',
    previous: '3.2%',
    forecast: '3.2%',
    actual: '3.3%',
    bias: 'bearish',
    biasText: '微超预期 · 偏空承压',
    biasCls: 'kpi-pill-red',
    analysis: '核心服务业通胀粘性较强，使得 10Y 美债收益率冲高反弹，对无风险贴现率敏感的科技股形成阶段估值压制。'
  },
  {
    id: 'ppi-final',
    name: '美国 9 月最终需求 PPI 月率',
    category: 'inflation',
    dateStr: '10月11日 20:30',
    previous: '0.2%',
    forecast: '0.1%',
    actual: '0.0%',
    bias: 'bullish',
    biasText: '低于预期 · 偏多利好',
    biasCls: 'kpi-pill-green',
    analysis: '出厂端 PPI 环比零增长，显示工业品出厂成本没有二次反弹，向后几个月 PCE 通胀传导压力大为减轻。'
  },
  {
    id: 'pce-core',
    name: '美国 9 月核心 PCE 物价指数年率 (美联储锚定)',
    category: 'inflation',
    dateStr: '10月31日 20:30',
    previous: '2.7%',
    forecast: '2.6%',
    actual: '待发布',
    bias: 'bullish',
    biasText: '预期降温 · 偏多利好',
    biasCls: 'kpi-pill-green',
    analysis: '作为美联储制定基准利率最看重的通胀锚，核心 PCE 若如期向 2.6% 靠近，将彻底扫清年内继续降息的障碍。'
  },
  {
    id: 'nfp',
    name: '美国 10 月季调后非农就业人口变动',
    category: 'employment',
    dateStr: '11月01日 20:30',
    previous: '25.4万',
    forecast: '11.5万',
    actual: '待发布',
    bias: 'neutral',
    biasText: '受飓风扰动 · 预期偏弱',
    biasCls: 'kpi-pill-amber',
    analysis: '因受连续两次飓风和波音罢工影响，10 月非农预计显著放缓。市场若认同为一次性天气扰动，则股市影响有限。'
  },
  {
    id: 'jobless-claims',
    name: '美国至 10 月 19 日当周初请失业金人数',
    category: 'employment',
    dateStr: '10月24日 20:30',
    previous: '24.2万',
    forecast: '24.3万',
    actual: '22.7万',
    bias: 'bullish',
    biasText: '大幅回落 · 偏多利好',
    biasCls: 'kpi-pill-green',
    analysis: '初请失业金人数由高位迅速回落 1.5 万人，显示裁员潮未大范围蔓延，美国宏观经济韧性仍强，软着陆概率大。'
  },
  {
    id: 'fomc',
    name: '美联储 FOMC 11 月利率决议与政策声明',
    category: 'fed',
    dateStr: '11月08日 03:00',
    previous: '4.75% - 5.00%',
    forecast: '4.50% - 4.75%',
    actual: '待发布',
    bias: 'bullish',
    biasText: '大概率降息 25BP · 偏多利好',
    biasCls: 'kpi-pill-green',
    analysis: 'CME 联储观察工具定价 11 月降息 25 个基点的概率高达 95%+，流动性环境持续改善，支撑风险资产估值中枢。'
  }
];

/**
 * 过滤获取指定天的财报列表
 */
export function filterEarningsByDay(list, dayId, sectorId = 'all', timingFilter = 'all', aiOnly = false) {
  if (!Array.isArray(list)) return [];
  return list.filter(item => {
    if (dayId && item.day !== dayId) return false;
    if (sectorId !== 'all' && item.sectorId !== sectorId) return false;
    if (timingFilter !== 'all' && item.timing !== timingFilter) return false;
    if (aiOnly && !item.isAiSupplyChain) return false;
    return true;
  });
}

/**
 * 解析财务指标数值（支持 $0.41, $1.74B, $725.5M 等）
 */
export function parseMetricNumber(s) {
  if (s === null || s === undefined) return null;
  const str = String(s).trim();
  const m = str.match(/-?[\d.]+/);
  if (!m) return null;
  let val = parseFloat(m[0]);
  if (isNaN(val)) return null;
  if (str.toUpperCase().includes('B')) val *= 1000;
  return val;
}

/**
 * 计算实际值与一致预期的超预期差额及超预期百分比
 */
export function getMetricSurprise(actualStr, consensusStr) {
  if (!actualStr || !consensusStr) return null;
  const a = parseMetricNumber(actualStr);
  const c = parseMetricNumber(consensusStr);
  if (a === null || c === null || c === 0) return null;
  const diff = a - c;
  const pct = (diff / Math.abs(c)) * 100;
  const isRev = String(actualStr).toUpperCase().includes('B') || String(actualStr).toUpperCase().includes('M') ||
                String(consensusStr).toUpperCase().includes('B') || String(consensusStr).toUpperCase().includes('M');
  const isPositive = diff >= 0;
  const sign = diff >= 0 ? '+' : '-';
  const absDiff = Math.abs(diff);
  const pctFormatted = (pct >= 0 ? '+' : '') + pct.toFixed(1) + '%';
  if (isRev) {
    const diffFormatted = absDiff >= 1000 ? `${sign}$${(absDiff / 1000).toFixed(2)}B` : `${sign}$${absDiff.toFixed(1)}M`;
    return {
      diff: diffFormatted,
      pct: pctFormatted,
      isPositive,
      badgeText: isPositive ? `超预期 ${pctFormatted}` : `不及预期 ${pctFormatted}`
    };
  }
  const diffFormatted = `${sign}$${absDiff.toFixed(2)}`;
  return {
    diff: diffFormatted,
    pct: pctFormatted,
    isPositive,
    badgeText: isPositive ? `超预期 ${pctFormatted}` : `不及预期 ${pctFormatted}`
  };
}

/**
 * 计算实际值相比上年同期前值的同比增速
 */
export function getMetricYoy(actualStr, prevStr) {
  if (!actualStr || !prevStr) return null;
  const a = parseMetricNumber(actualStr);
  const p = parseMetricNumber(prevStr);
  if (a === null || p === null || p === 0) return null;
  const diff = a - p;
  const pct = (diff / Math.abs(p)) * 100;
  const sign = pct >= 0 ? '+' : '';
  return `${sign}${pct.toFixed(1)}%`;
}

