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

export const EARNINGS_DAYS = [
  { id: 'mon', label: '周一 (Monday)', dateStr: '10月26日', fullDate: '2026-10-26', isKeyDay: false },
  { id: 'tue', label: '周二 (Tuesday)', dateStr: '10月27日', fullDate: '2026-10-27', isKeyDay: true, highlight: '谷歌 · AMD · 希捷' },
  { id: 'wed', label: '周三 (Wednesday)', dateStr: '10月28日', fullDate: '2026-10-28', isKeyDay: true, highlight: '微软 · Meta · 维谛Vertiv' },
  { id: 'thu', label: '周四 (Thursday)', dateStr: '10月29日', fullDate: '2026-10-29', isKeyDay: true, highlight: '苹果 · 亚马逊 · 英特尔' },
  { id: 'fri', label: '周五 (Friday)', dateStr: '10月30日', fullDate: '2026-10-30', isKeyDay: false, highlight: '埃克森美孚 · Enphase' }
];

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
  `
};

export const DEFAULT_TECH_EARNINGS = [
  // --- Monday (周一 10/26) ---
  {
    symbol: 'CDNS',
    name: 'Cadence Design Systems',
    day: 'mon',
    timing: 'AMC',
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
