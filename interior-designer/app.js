'use strict';
/* 室內空間 3D 設計器 — 單位：平面座標 mm（原點＝房間內側左上角，x 向東、y 向南），3D 場景單位 m */
const PING = 3.30579, CHI = 303, SHEET = 1.22 * 2.44;
const $ = s => document.querySelector(s), $$ = s => [...document.querySelectorAll(s)];
const fmt = n => Math.round(n).toLocaleString('en-US');
const fx = (n, d = 2) => Number(n).toFixed(d);
const money = n => 'NT$ ' + fmt(n);
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const rad = d => d * Math.PI / 180;
let uidN = 0; const nid = p => p + Date.now().toString(36) + (uidN++).toString(36);

/* ---------- 資料表 ---------- */
const FLOORS = {
  oak: { name: '超耐磨木地板・橡木', price: 3800, waste: .08, pat: 'plank', c1: '#b88a5a', c2: '#9c7146' },
  walnut: { name: '超耐磨木地板・胡桃', price: 4200, waste: .08, pat: 'plank', c1: '#6e4a32', c2: '#583a26' },
  spc: { name: 'SPC 石塑地板・淺灰', price: 3200, waste: .06, pat: 'plank', c1: '#bdb6ab', c2: '#a59e92' },
  tile60: { name: '拋光石英磚 60×60', price: 4800, waste: .10, pat: 'tile', ts: 600, c1: '#dcd9d2', c2: '#cfccc4' },
  tile80: { name: '霧面石英磚 80×80', price: 5600, waste: .10, pat: 'tile', ts: 800, c1: '#9c9991', c2: '#8f8c84' },
  epoxy: { name: '環氧樹脂地坪', price: 2800, waste: 0, pat: 'plain', c1: '#8f969c', c2: '#848b91' },
  carpet: { name: '方塊地毯 50×50', price: 2600, waste: .05, pat: 'tile', ts: 500, c1: '#5b6470', c2: '#4f5762' },
};
const ROOMTYPES = { living: ['客廳', 200], bed: ['臥室', 150], dining: ['餐廳／廚房', 300], study: ['書房', 500], office: ['辦公室', 500], bath: ['衛浴', 200] };
const AC_STD = [2.2, 2.8, 3.6, 4.1, 5.0, 5.6, 6.3, 7.1, 8.0, 9.0, 10.0, 11.2, 12.5, 14.0];
const WALL_COLORS = ['#e9e5dd', '#f4f3ef', '#d8dcdf', '#c9bfae', '#a9b8a6', '#9fb3c8', '#5d6670', '#3a4048'];
const ITEM_COLORS = ['#7d8794', '#3e4a5a', '#2f3540', '#c9b79c', '#a07850', '#6b4f3a', '#e6e1d8', '#f4f4f2', '#8fa3b8', '#4d8a55', '#b5574b', '#d9a441'];
const CATS = [['living', '客廳'], ['bed', '臥室'], ['dining', '餐廳'], ['study', '書房辦公'], ['kitchen', '廚房'], ['bath', '衛浴'], ['storage', '系統櫃'], ['office', '辦公室'], ['ceiling', '天花設備'], ['wall', '壁掛'], ['deco', '裝飾']];
const OPK = { door: '門', slide: '拉門', window: '窗', open: '開口' };
const WALLN = { N: '北牆', S: '南牆', W: '西牆', E: '東牆' };

/* build: 3D/平面符號；pricing chi＝系統櫃以「尺」計價；front＝前方操作淨空；minor＝不檢查一般通道；tuck／table＝可收入桌下 */
const LIB = {
  sofa3: { cat: 'living', name: '三人沙發', w: 2100, d: 900, h: 820, color: '#7d8794', price: 38000, build: 'sofa', seats: 3 },
  sofa2: { cat: 'living', name: '雙人沙發', w: 1600, d: 900, h: 820, color: '#7d8794', price: 28000, build: 'sofa', seats: 2 },
  sofaL: { cat: 'living', name: 'L 型沙發', w: 2700, d: 1650, h: 820, color: '#8a8f96', price: 56000, build: 'sofaL' },
  armchair: { cat: 'living', name: '單人主人椅', w: 850, d: 850, h: 820, color: '#c9b79c', price: 15000, build: 'sofa', seats: 1 },
  coffee: { cat: 'living', name: '茶几', w: 1200, d: 600, h: 420, color: '#a07850', price: 8500, build: 'table', minor: true },
  tvstand: { cat: 'living', name: '電視櫃＋電視', w: 1800, d: 450, h: 500, color: '#e6e1d8', price: 18000, build: 'tvstand', front: 600 },
  rug: { cat: 'living', name: '地毯', w: 2000, d: 1400, h: 10, color: '#b9a58a', price: 6000, build: 'rug', flat: true },
  floorlamp: { cat: 'living', name: '立燈', w: 400, d: 400, h: 1600, color: '#e0d6c2', price: 3500, build: 'lamp', minor: true },
  bedK: { cat: 'bed', name: '雙人加大床 6×6.2尺', w: 1820, d: 1880, h: 1000, color: '#9b8a76', price: 42000, build: 'bed' },
  bedQ: { cat: 'bed', name: '標準雙人床 5×6.2尺', w: 1520, d: 1880, h: 1000, color: '#9b8a76', price: 32000, build: 'bed' },
  bedS: { cat: 'bed', name: '單人床 3.5×6.2尺', w: 1060, d: 1880, h: 900, color: '#9b8a76', price: 18000, build: 'bed' },
  wardrobe: { cat: 'bed', name: '衣櫃（系統）', w: 1800, d: 600, h: 2200, color: '#e6e1d8', pricing: 'chi', chiPrice: 7500, build: 'cabinet', front: 900 },
  nightstand: { cat: 'bed', name: '床頭櫃', w: 450, d: 400, h: 500, color: '#a07850', price: 4500, build: 'drawer', minor: true },
  dresser: { cat: 'bed', name: '化妝台', w: 1000, d: 450, h: 760, color: '#e6e1d8', price: 9800, build: 'desk', table: true, front: 600 },
  dtable4: { cat: 'dining', name: '四人餐桌', w: 1400, d: 800, h: 750, color: '#a07850', price: 16000, build: 'table', table: true },
  dtable6: { cat: 'dining', name: '六人餐桌', w: 1800, d: 900, h: 750, color: '#a07850', price: 22000, build: 'table', table: true },
  rtable: { cat: 'dining', name: '圓餐桌 Ø1000', w: 1000, d: 1000, h: 750, color: '#a07850', price: 14000, build: 'roundtable', table: true },
  chair: { cat: 'dining', name: '餐椅', w: 450, d: 520, h: 850, color: '#3e4a5a', price: 3800, build: 'chair', tuck: true, minor: true },
  desk: { cat: 'study', name: '書桌', w: 1400, d: 700, h: 750, color: '#c9b79c', price: 9800, build: 'desk', table: true, front: 700 },
  ochair: { cat: 'study', name: '辦公椅', w: 620, d: 620, h: 1050, color: '#2f3540', price: 8800, build: 'ochair', tuck: true, minor: true },
  bookshelf: { cat: 'study', name: '書櫃（開放）', w: 900, d: 350, h: 2000, color: '#e6e1d8', pricing: 'chi', chiPrice: 5500, build: 'shelf', front: 600 },
  kitchenI: { cat: 'kitchen', name: '一字型廚具＋吊櫃', w: 2400, d: 600, h: 2200, color: '#eceae6', pricing: 'chi', chiPrice: 11000, build: 'kitchen', front: 900 },
  fridge: { cat: 'kitchen', name: '雙門冰箱', w: 700, d: 720, h: 1800, color: '#c9ced4', price: 32000, build: 'fridge', front: 800 },
  island: { cat: 'kitchen', name: '中島吧台', w: 1800, d: 900, h: 900, color: '#eceae6', price: 45000, build: 'island', table: true },
  toilet: { cat: 'bath', name: '馬桶', w: 400, d: 700, h: 780, color: '#f4f4f2', price: 12000, build: 'toilet', front: 600, minor: true },
  basin: { cat: 'bath', name: '浴櫃＋面盆', w: 800, d: 480, h: 850, color: '#c9b79c', price: 15000, build: 'basin', front: 600, minor: true },
  shower: { cat: 'bath', name: '淋浴拉門 90×90', w: 900, d: 900, h: 2000, color: '#9fc6dd', price: 18000, build: 'shower' },
  tub: { cat: 'bath', name: '浴缸 150 cm', w: 1500, d: 750, h: 550, color: '#f4f4f2', price: 22000, build: 'tub' },
  cab: { cat: 'storage', name: '系統高櫃', w: 1200, d: 600, h: 2400, color: '#e6e1d8', pricing: 'chi', chiPrice: 7000, build: 'cabinet', front: 900 },
  lowcab: { cat: 'storage', name: '系統矮櫃（抽屜）', w: 1200, d: 450, h: 900, color: '#e6e1d8', pricing: 'chi', chiPrice: 4200, build: 'drawer', front: 600 },
  shoecab: { cat: 'storage', name: '鞋櫃', w: 900, d: 380, h: 1100, color: '#c9b79c', pricing: 'chi', chiPrice: 4800, build: 'cabinet', front: 600 },
  plant: { cat: 'deco', name: '大型盆栽', w: 500, d: 500, h: 1200, color: '#4d8a55', price: 2800, build: 'plant', minor: true },
  lamp2: { cat: 'deco', name: '桌燈', w: 300, d: 300, h: 550, color: '#e0d6c2', price: 1800, build: 'lamp', minor: true, flat: true },
  ws: { cat: 'office', name: 'OA 屏風工作站', w: 1200, d: 700, h: 1100, color: '#e6e1d8', price: 12000, build: 'workstation', table: true },
  ws4: { cat: 'office', name: '四人 OA 工作站組', w: 2400, d: 1400, h: 1100, color: '#e6e1d8', price: 46000, build: 'ws4', table: true },
  ldesk: { cat: 'office', name: 'L 型主管桌', w: 1800, d: 1600, h: 750, color: '#6b4f3a', price: 38000, build: 'ldesk', table: true },
  mtable: { cat: 'office', name: '會議桌 8 人', w: 2400, d: 1200, h: 750, color: '#a07850', price: 26000, build: 'table', table: true },
  mtable10: { cat: 'office', name: '會議桌 10 人', w: 3600, d: 1400, h: 750, color: '#a07850', price: 42000, build: 'table', table: true },
  filecab: { cat: 'office', name: '鋼製公文櫃', w: 900, d: 450, h: 1800, color: '#c9ced4', price: 9800, build: 'filecab', front: 900 },
  pedestal: { cat: 'office', name: '活動櫃 三抽', w: 400, d: 520, h: 600, color: '#c9ced4', price: 4200, build: 'drawer', minor: true, tuck: true },
  partition: { cat: 'office', name: '屏風隔板', w: 1200, d: 50, h: 1500, color: '#6d7f94', price: 3500, build: 'panel' },
  reception: { cat: 'office', name: '接待櫃台', w: 2000, d: 700, h: 1100, color: '#e6e1d8', price: 52000, build: 'counter', front: 900 },
  printer: { cat: 'office', name: '多功能事務機', w: 600, d: 650, h: 1150, color: '#d8dade', price: 65000, build: 'printer', front: 800 },
  fan: { cat: 'ceiling', name: '吊扇 52 吋', w: 1320, d: 1320, h: 450, color: '#f2f2f2', price: 6800, build: 'fan', mount: 'ceiling', fan: true, minor: true },
  clight: { cat: 'ceiling', name: '吸頂燈 Ø500', w: 500, d: 500, h: 120, color: '#ffffff', price: 3200, build: 'clight', mount: 'ceiling', lm: 3500, minor: true },
  downlight: { cat: 'ceiling', name: 'LED 嵌燈 Ø150', w: 150, d: 150, h: 40, color: '#ffffff', price: 650, build: 'dlight', mount: 'ceiling', lm: 1000, minor: true },
  pendant: { cat: 'ceiling', name: '吊燈 Ø400', w: 400, d: 400, h: 900, color: '#2f3540', price: 5800, build: 'pendant', mount: 'ceiling', lm: 1500, minor: true },
  lpanel: { cat: 'ceiling', name: 'LED 平板燈 60×60', w: 600, d: 600, h: 40, color: '#ffffff', price: 1600, build: 'lpanel', mount: 'ceiling', lm: 3600, minor: true },
  linear: { cat: 'ceiling', name: '線型燈 120 cm', w: 1200, d: 60, h: 60, color: '#ffffff', price: 1800, build: 'lpanel', mount: 'ceiling', lm: 2400, minor: true },
  cassette: { cat: 'ceiling', name: '嵌入式冷氣 5.6 kW', w: 840, d: 840, h: 300, color: '#f4f4f4', price: 62000, build: 'cassette', mount: 'ceiling', kw: 5.6, minor: true },
  projector: { cat: 'ceiling', name: '吊掛投影機', w: 400, d: 320, h: 450, color: '#e8e8e8', price: 28000, build: 'projector', mount: 'ceiling', minor: true },
  smoke: { cat: 'ceiling', name: '偵煙器', w: 110, d: 110, h: 50, color: '#ffffff', price: 900, build: 'dlight', mount: 'ceiling', minor: true },
  splitAC: { cat: 'wall', name: '壁掛冷氣 3.6 kW', w: 900, d: 250, h: 300, z: 2200, color: '#f4f4f4', price: 36000, build: 'splitac', mount: 'wall', kw: 3.6, minor: true },
  tvwall: { cat: 'wall', name: '壁掛電視 65 吋', w: 1450, d: 60, h: 830, z: 1000, color: '#111111', price: 32000, build: 'tvwall', mount: 'wall', minor: true },
  wallcab: { cat: 'wall', name: '吊櫃（系統）', w: 1200, d: 350, h: 700, z: 1500, color: '#e6e1d8', pricing: 'chi', chiPrice: 4500, build: 'cabinet', mount: 'wall', minor: true },
  board: { cat: 'wall', name: '白板', w: 1800, d: 30, h: 1200, z: 900, color: '#9aa3ad', price: 6500, build: 'board', mount: 'wall', minor: true },
  curtain: { cat: 'wall', name: '落地窗簾', w: 2000, d: 150, h: 2500, z: 50, color: '#c9b79c', price: 9000, build: 'curtain', mount: 'wall', minor: true, curtain: true },
  art: { cat: 'wall', name: '掛畫', w: 900, d: 30, h: 600, z: 1400, color: '#3e4a5a', price: 4500, build: 'art', mount: 'wall', minor: true },
  wshelf: { cat: 'wall', name: '壁掛層板', w: 900, d: 250, h: 30, z: 1300, color: '#a07850', price: 1800, build: 'wshelf', mount: 'wall', minor: true },
};
const ROUND_B = { roundtable: 1, plant: 1, lamp: 1, fan: 1, clight: 1, dlight: 1, pendant: 1 };
const CAB_BUILDS = { cabinet: 1, drawer: 1, shelf: 1 };

/* ---------- 狀態 ---------- */
function defaultPrices() {
  return { floor: Object.fromEntries(Object.entries(FLOORS).map(([k, v]) => [k, v.price])), paint: 1200, ceiling: 3800, ceilGrid: 2200, skirting: 280, light: 1500, acKw: 9800, design: 3000, mgmt: 10, tax: 5, board: 1450, back: 650, hinge: 180, handle: 120, slide: 420 };
}
function blankState() {
  return {
    room: { W: 5000, D: 4200, H: 2800, T: 120, floor: 'oak', wall: '#e9e5dd', ceiling: 'flat', type: 'living', west: false, top: false, lm: 1100 },
    items: [], openings: [], prices: defaultPrices(), set: { snap: 50, minPath: 600, cut: true, ceil: true, ceilLayer: true }, meta: { name: '室內設計案', designer: '' }
  };
}
function mkItem(type, x, y, rot = 0, over = {}) {
  const L = LIB[type];
  return Object.assign({ id: nid('i'), type, name: L.name, w: L.w, d: L.d, h: L.h, z: L.z || 0, x, y, rot, color: L.color, price: L.price || 0, chiPrice: L.chiPrice || 0, lock: false }, over);
}
function mkOp(kind, wall, offset, width, height, sill) {
  return { id: nid('o'), kind, wall, offset, width, height, sill };
}
const TPL = {
  living: { name: '客廳 5.0 × 4.2 m', room: { W: 5000, D: 4200, H: 2800, type: 'living', floor: 'oak', ceiling: 'flat' },
    ops: [['door', 'S', 300, 900, 2100, 0], ['window', 'W', 1000, 2000, 1500, 900]],
    items: [['rug', 2500, 1450, 0], ['sofa3', 2500, 450, 0], ['coffee', 2500, 1500, 0], ['tvstand', 2500, 3975, 180], ['armchair', 800, 1900, 270], ['floorlamp', 4350, 350, 0], ['plant', 4600, 3800, 0], ['fan', 2500, 1700, 0]] },
  bedroom: { name: '主臥室 4.0 × 3.6 m', room: { W: 4000, D: 3600, H: 2800, type: 'bed', floor: 'walnut', ceiling: 'flat' },
    ops: [['door', 'S', 2950, 900, 2100, 0], ['window', 'E', 800, 1500, 1400, 900]],
    items: [['bedQ', 1700, 940, 0], ['nightstand', 695, 220, 0], ['nightstand', 2705, 220, 0], ['wardrobe', 920, 3300, 180], ['dresser', 3775, 1500, 90], ['fan', 1900, 1500, 0]] },
  study: { name: '書房 4.0 × 3.2 m', room: { W: 4000, D: 3200, H: 2800, type: 'study', floor: 'spc', ceiling: 'flat' },
    ops: [['door', 'S', 1300, 900, 2100, 0], ['window', 'N', 900, 1800, 1400, 900]],
    items: [['desk', 1800, 350, 0], ['ochair', 1800, 1000, 180], ['bookshelf', 175, 1100, 270], ['bookshelf', 175, 2050, 270], ['sofa2', 3550, 1700, 90], ['plant', 3700, 400, 0]] },
  dining: { name: '餐廚 4.2 × 3.6 m', room: { W: 4200, D: 3600, H: 2800, type: 'dining', floor: 'tile60', ceiling: 'flat' },
    ops: [['door', 'W', 2400, 900, 2100, 0], ['window', 'E', 1000, 1500, 1200, 1000]],
    items: [['kitchenI', 1300, 300, 0], ['fridge', 2900, 360, 0], ['dtable4', 2100, 2500, 0], ['chair', 1750, 1840, 0], ['chair', 2450, 1840, 0], ['chair', 1750, 3160, 180], ['chair', 2450, 3160, 180]] },
  bath: { name: '衛浴 2.7 × 1.8 m', room: { W: 2700, D: 1800, H: 2600, type: 'bath', floor: 'tile60', ceiling: 'flat' },
    ops: [['door', 'S', 900, 800, 2100, 0], ['window', 'S', 1900, 600, 600, 1500]],
    items: [['toilet', 500, 350, 0], ['basin', 1250, 240, 0], ['shower', 2250, 450, 0]] },
  office: { name: '開放式辦公室 9.0 × 7.2 m', room: { W: 9000, D: 7200, H: 3000, type: 'office', floor: 'carpet', ceiling: 'grid' },
    ops: [['door', 'S', 600, 1000, 2100, 0], ['window', 'N', 1000, 2400, 1500, 900], ['window', 'N', 5200, 2400, 1500, 900]],
    items: [['ws4', 2700, 2600, 0], ['ochair', 2100, 1600, 0], ['ochair', 2100, 3600, 180], ['ochair', 3300, 1600, 0], ['ochair', 3300, 3600, 180], ['ws4', 6200, 2600, 0], ['ochair', 5600, 1600, 0], ['ochair', 5600, 3600, 180], ['ochair', 6800, 1600, 0], ['ochair', 6800, 3600, 180], ['ws4', 2700, 5400, 0], ['ochair', 2100, 4400, 0], ['ochair', 2100, 6400, 180], ['ochair', 3300, 4400, 0], ['ochair', 3300, 6400, 180], ['ws4', 6200, 5400, 0], ['ochair', 5600, 4400, 0], ['ochair', 5600, 6400, 180], ['ochair', 6800, 4400, 0], ['ochair', 6800, 6400, 180], ['filecab', 8775, 1000, 90], ['filecab', 8775, 1900, 90], ['filecab', 8775, 2800, 90], ['printer', 8675, 6500, 90], ['board', 15, 3600, 270], ['plant', 400, 400, 0], ['lpanel', 900, 900, 0], ['lpanel', 900, 2700, 0], ['lpanel', 900, 4500, 0], ['lpanel', 900, 6300, 0], ['lpanel', 2700, 900, 0], ['lpanel', 2700, 2700, 0], ['lpanel', 2700, 4500, 0], ['lpanel', 2700, 6300, 0], ['lpanel', 4500, 900, 0], ['lpanel', 4500, 2700, 0], ['lpanel', 4500, 4500, 0], ['lpanel', 4500, 6300, 0], ['lpanel', 6300, 900, 0], ['lpanel', 6300, 2700, 0], ['lpanel', 6300, 4500, 0], ['lpanel', 6300, 6300, 0], ['lpanel', 8100, 900, 0], ['lpanel', 8100, 2700, 0], ['lpanel', 8100, 4500, 0], ['lpanel', 8100, 6300, 0], ['cassette', 2700, 3600, 0], ['cassette', 6300, 3600, 0]] },
  meeting: { name: '會議室 6.0 × 4.5 m', room: { W: 6000, D: 4500, H: 2800, type: 'office', floor: 'carpet', ceiling: 'grid' },
    ops: [['door', 'S', 4800, 900, 2100, 0], ['window', 'N', 1200, 3600, 1500, 900]],
    items: [['mtable10', 3000, 2250, 0], ['chair', 1650, 1350, 0], ['chair', 1650, 3150, 180], ['chair', 2550, 1350, 0], ['chair', 2550, 3150, 180], ['chair', 3450, 1350, 0], ['chair', 3450, 3150, 180], ['chair', 4350, 1350, 0], ['chair', 4350, 3150, 180], ['chair', 1000, 2250, 270], ['chair', 5000, 2250, 90], ['board', 15, 2250, 270], ['tvwall', 5970, 2250, 90], ['lowcab', 1500, 4275, 180], ['lpanel', 1200, 1300, 0], ['lpanel', 1200, 3200, 0], ['lpanel', 2400, 1300, 0], ['lpanel', 2400, 3200, 0], ['lpanel', 3600, 1300, 0], ['lpanel', 3600, 3200, 0], ['lpanel', 4800, 1300, 0], ['lpanel', 4800, 3200, 0], ['cassette', 3000, 2250, 0]] },
  manager: { name: '主管辦公室 4.5 × 4.5 m', room: { W: 4500, D: 4500, H: 2800, type: 'office', floor: 'oak', ceiling: 'grid' },
    ops: [['door', 'S', 3300, 900, 2100, 0], ['window', 'E', 800, 2400, 1500, 900]],
    items: [['ldesk', 2250, 1300, 0], ['ochair', 2600, 900, 0], ['chair', 1950, 2420, 180], ['chair', 2550, 2420, 180], ['sofa2', 450, 3500, 270], ['coffee', 1400, 3500, 90], ['filecab', 225, 650, 270], ['filecab', 225, 1550, 270], ['plant', 4150, 350, 0], ['splitAC', 125, 3500, 270], ['lpanel', 1200, 1200, 0], ['lpanel', 1200, 3000, 0], ['lpanel', 2300, 1200, 0], ['lpanel', 2300, 3000, 0], ['lpanel', 3400, 1200, 0], ['lpanel', 3400, 3000, 0]] },
  empty: { name: '空房間（自行配置）', room: { W: 4000, D: 3500, H: 2800, type: 'living', floor: 'oak', ceiling: 'flat' }, ops: [['door', 'S', 400, 900, 2100, 0]], items: [] },
};
function applyTpl(key) {
  const t = TPL[key], st = blankState();
  if (S) { st.prices = S.prices; st.set = S.set; st.meta = S.meta; st.room.wall = S.room.wall; st.room.T = S.room.T; }
  Object.assign(st.room, t.room);
  st.openings = t.ops.map(o => mkOp(...o));
  st.items = t.items.map(([ty, x, y, r, o]) => mkItem(ty, x, y, r, o || {}));
  return st;
}

let S = null, sel = null, hist = [], curCat = 'living', view = '3d', btab = 'bom', checks = { list: [], flags: {} };
const LS = 'interior3d.v1';
function save() { try { localStorage.setItem(LS, JSON.stringify(S)); } catch (e) { } }
function load() {
  try {
    const t = localStorage.getItem(LS); if (!t) return null;
    const s = JSON.parse(t); return normalize(s);
  } catch (e) { return null; }
}
function normalize(s) {
  const b = blankState();
  if (!s || typeof s !== 'object') return b;
  b.room = Object.assign(b.room, s.room || {});
  b.prices = Object.assign(b.prices, s.prices || {}); b.prices.floor = Object.assign(defaultPrices().floor, (s.prices || {}).floor || {});
  b.set = Object.assign(b.set, s.set || {});
  b.meta = Object.assign(b.meta, s.meta || {});
  b.items = (s.items || []).filter(i => LIB[i.type]).map(i => Object.assign(mkItem(i.type, 0, 0), i));
  b.openings = (s.openings || []).filter(o => OPK[o.kind] && WALLN[o.wall]).map(o => Object.assign(mkOp('door', 'S', 0, 900, 2100, 0), o));
  return b;
}
function pushHist() { hist.push(JSON.stringify(S)); if (hist.length > 60) hist.shift(); }
function undo() { if (!hist.length) return; S = normalize(JSON.parse(hist.pop())); if (sel && !findSel()) sel = null; refresh(true); }
const itemById = id => S.items.find(i => i.id === id);
const opById = id => S.openings.find(o => o.id === id);
function findSel() { return sel ? (sel.kind === 'item' ? itemById(sel.id) : opById(sel.id)) : null; }

/* ---------- 幾何 ---------- */
function itemPoly(it, z) { // z: 額外區域 {x0,x1,y0,y1} in local
  const r = rad(it.rot), c = Math.cos(r), s = Math.sin(r);
  const b = z || { x0: -it.w / 2, x1: it.w / 2, y0: -it.d / 2, y1: it.d / 2 };
  return [[b.x0, b.y0], [b.x1, b.y0], [b.x1, b.y1], [b.x0, b.y1]].map(([lx, ly]) => [it.x + lx * c - ly * s, it.y + lx * s + ly * c]);
}
function bbox(p) {
  const xs = p.map(q => q[0]), ys = p.map(q => q[1]);
  return { x0: Math.min(...xs), x1: Math.max(...xs), y0: Math.min(...ys), y1: Math.max(...ys) };
}
function rectPoly(x0, y0, x1, y1) { return [[x0, y0], [x1, y0], [x1, y1], [x0, y1]]; }
function overlap(p, q, tol = 5) {
  for (const poly of [p, q]) {
    for (let i = 0; i < poly.length; i++) {
      const a = poly[i], b = poly[(i + 1) % poly.length];
      const nx = -(b[1] - a[1]), ny = b[0] - a[0], L = Math.hypot(nx, ny) || 1;
      let pa = Infinity, pb = -Infinity, qa = Infinity, qb = -Infinity;
      for (const v of p) { const d = (v[0] * nx + v[1] * ny) / L; pa = Math.min(pa, d); pb = Math.max(pb, d); }
      for (const v of q) { const d = (v[0] * nx + v[1] * ny) / L; qa = Math.min(qa, d); qb = Math.max(qb, d); }
      if (Math.min(pb, qb) - Math.max(pa, qa) <= tol) return false;
    }
  }
  return true;
}
function segDist(p, a, b) {
  const dx = b[0] - a[0], dy = b[1] - a[1], L = dx * dx + dy * dy;
  const t = L ? clamp(((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / L, 0, 1) : 0;
  return Math.hypot(p[0] - a[0] - t * dx, p[1] - a[1] - t * dy);
}
function polyDist(p, q) {
  if (overlap(p, q, 0)) return 0;
  let m = Infinity;
  for (const [A, B] of [[p, q], [q, p]]) for (const v of A) for (let i = 0; i < B.length; i++) m = Math.min(m, segDist(v, B[i], B[(i + 1) % B.length]));
  return m;
}
function wallSpan(o) { // 開口在平面上的範圍（牆內側面）
  const { W, D } = S.room;
  const a0 = o.offset, a1 = o.offset + o.width;
  if (o.wall === 'N') return { a0, a1, along: 'x', fixed: 0, nIn: [0, 1], dir: [1, 0], hinge: [a0, 0] };
  if (o.wall === 'S') return { a0, a1, along: 'x', fixed: D, nIn: [0, -1], dir: [1, 0], hinge: [a0, D] };
  if (o.wall === 'W') return { a0, a1, along: 'y', fixed: 0, nIn: [1, 0], dir: [0, 1], hinge: [0, a0] };
  return { a0, a1, along: 'y', fixed: W, nIn: [-1, 0], dir: [0, 1], hinge: [W, a0] };
}
function wallLen(w) { return (w === 'N' || w === 'S') ? S.room.W : S.room.D; }
function swingPoly(o) {
  const sp = wallSpan(o), w = o.width, n = sp.nIn;
  const p0 = sp.hinge, p1 = [p0[0] + sp.dir[0] * w, p0[1] + sp.dir[1] * w];
  return [p0, p1, [p1[0] + n[0] * w, p1[1] + n[1] * w], [p0[0] + n[0] * w, p0[1] + n[1] * w]];
}

/* ---------- 計價 ---------- */
const chis = w => Math.ceil(w / CHI * 2) / 2;
function itemPrice(it) {
  const L = LIB[it.type];
  if (L.pricing === 'chi') return Math.round(chis(it.w) * it.chiPrice * Math.max(.5, it.h / L.h));
  return it.price || 0;
}

/* ---------- 動線／干涉檢查 ---------- */
function itemZ(it) { return LIB[it.type].mount === 'ceiling' ? S.room.H - it.h : (it.z || 0); }
function zOv(a, b) { const az = itemZ(a), bz = itemZ(b); return az < bz + b.h - 5 && bz < az + a.h - 5; }
const onFloor = it => !LIB[it.type].mount && !(it.z > 0);
function acNeed() { const r = S.room, ping = r.W * r.D / 1e6 / PING; return ping * 450 * (r.west ? 1.2 : 1) * (r.top ? 1.15 : 1) / 860; }
function runChecks(only) { // only：只計算與某件物件有關的問題（優化用）
  const list = [], flags = {}, { W, D, H } = S.room, mp = S.set.minPath;
  const flag = (id, lv) => { if (flags[id] !== 'bad') flags[id] = lv === 'err' ? 'bad' : 'warn'; };
  const add = (lv, msg, ids) => { if (only && !ids.includes(only)) return; list.push({ lv, msg, ids }); ids.forEach(id => flag(id, lv)); };
  const rel = (...ids) => !only || ids.includes(only);
  const polys = new Map(S.items.map(it => [it.id, itemPoly(it)]));
  for (const it of S.items) {
    if (!rel(it.id)) continue;
    const b = bbox(polys.get(it.id));
    if (b.x0 < -2 || b.y0 < -2 || b.x1 > W + 2 || b.y1 > D + 2) add('err', `${it.name} 超出房間範圍`, [it.id]);
    if (itemZ(it) + it.h > H + 2) add('err', `${it.name} 頂部 ${fmt(itemZ(it) + it.h)} 超出天花高度 ${fmt(H)}`, [it.id]);
    if (LIB[it.type].fan) {
      const bz = itemZ(it), m = Math.min(b.x0, W - b.x1, b.y0, D - b.y1);
      if (bz < 2100) add('warn', `${it.name} 葉片離地 ${fmt(bz)} mm（應 ≥ 2100）`, [it.id]);
      if (m < 450) add('warn', `${it.name} 葉片距牆 ${fmt(Math.max(0, m))} mm（應 ≥ 450）`, [it.id]);
    }
  }
  const solid = S.items.filter(i => !LIB[i.type].flat);
  for (let i = 0; i < solid.length; i++) for (let j = i + 1; j < solid.length; j++) {
    const a = solid[i], b = solid[j]; if (!rel(a.id, b.id)) continue;
    const La = LIB[a.type], Lb = LIB[b.type];
    const pa = polys.get(a.id), pb = polys.get(b.id);
    const tuck = (La.tuck && Lb.table) || (Lb.tuck && La.table);
    if (zOv(a, b) && overlap(pa, pb)) { if (!tuck) add('err', `${a.name} 與 ${b.name} 重疊干涉`, [a.id, b.id]); continue; }
    if (La.fan && Lb.mount === 'ceiling' || Lb.fan && La.mount === 'ceiling') { if (overlap(pa, pb)) add('err', `${a.name} 與 ${b.name} 在天花上重疊（吊扇轉動範圍）`, [a.id, b.id]); continue; }
    if (La.minor || Lb.minor || !onFloor(a) || !onFloor(b)) continue;
    const d = polyDist(pa, pb);
    if (d >= 100 && d < mp) add('warn', `${a.name} ↔ ${b.name} 通道寬 ${fmt(d)} mm（< ${mp} mm）`, [a.id, b.id]);
  }
  for (const it of S.items) {
    const L = LIB[it.type]; if (!L.front) continue;
    const z = itemPoly(it, { x0: -it.w / 2, x1: it.w / 2, y0: it.d / 2, y1: it.d / 2 + L.front });
    const zb = bbox(z);
    if (rel(it.id) && (zb.x0 < -2 || zb.y0 < -2 || zb.x1 > W + 2 || zb.y1 > D + 2)) add('warn', `${it.name} 前方操作空間超出牆面（需 ${L.front} mm）`, [it.id]);
    for (const o of solid) {
      if (o.id === it.id || LIB[o.type].tuck || itemZ(o) > 1800 || !rel(it.id, o.id)) continue;
      if (overlap(z, polys.get(o.id))) add('warn', `${it.name} 前方 ${L.front} mm 操作空間被 ${o.name} 佔用`, [it.id, o.id]);
    }
  }
  for (const op of S.openings) {
    const sp = wallSpan(op), lab = `${WALLN[op.wall]}${OPK[op.kind]}`;
    if (!only && (op.offset < 0 || op.offset + op.width > wallLen(op.wall))) add('err', `${lab} 超出牆面長度`, []);
    if (op.kind === 'door') {
      const z = swingPoly(op);
      for (const it of solid) if (rel(it.id) && itemZ(it) < op.height && overlap(z, polys.get(it.id))) add('err', `${it.name} 擋住${lab}開門範圍`, [it.id]);
    } else if (op.kind === 'slide' || op.kind === 'open') {
      const n = sp.nIn, h = sp.hinge, d2 = 600;
      const z = [h, [h[0] + sp.dir[0] * op.width, h[1] + sp.dir[1] * op.width], [h[0] + sp.dir[0] * op.width + n[0] * d2, h[1] + sp.dir[1] * op.width + n[1] * d2], [h[0] + n[0] * d2, h[1] + n[1] * d2]];
      for (const it of solid) if (rel(it.id) && itemZ(it) < op.height && overlap(z, polys.get(it.id))) add('warn', `${it.name} 擋住${lab}出入動線`, [it.id]);
    } else if (op.kind === 'window') {
      for (const it of solid) {
        if (!rel(it.id) || LIB[it.type].curtain) continue;
        const iz = itemZ(it); if (iz + it.h <= op.sill + 50 || iz >= op.sill + op.height) continue;
        const b = bbox(polys.get(it.id));
        const near = sp.along === 'x' ? (op.wall === 'N' ? b.y0 < 150 : b.y1 > S.room.D - 150) : (op.wall === 'W' ? b.x0 < 150 : b.x1 > S.room.W - 150);
        const lo = sp.along === 'x' ? b.x0 : b.y0, hi = sp.along === 'x' ? b.x1 : b.y1;
        if (near && hi > sp.a0 + 20 && lo < sp.a1 - 20) add('warn', `${it.name}（${fmt(iz)}～${fmt(iz + it.h)}）遮擋${lab}（窗台 ${op.sill}）`, [it.id]);
      }
    }
  }
  if (!only) {
    const lights = S.items.filter(i => LIB[i.type].lm), lm = lights.reduce((s, i) => s + (i.lm || LIB[i.type].lm), 0);
    const need = ROOMTYPES[S.room.type][1] * W * D / 1e6 / .48;
    if (lights.length && lm < need * .9) add('warn', `已配置燈具 ${fmt(lm)} lm，低於需求 ${fmt(need)} lm（${ROOMTYPES[S.room.type][0]} ${ROOMTYPES[S.room.type][1]} lx）`, lights.map(i => i.id));
    const acs = S.items.filter(i => LIB[i.type].kw), kw = acs.reduce((s, i) => s + LIB[i.type].kw, 0);
    if (acs.length && kw < acNeed() * .95) add('warn', `已配置冷氣 ${fx(kw, 1)} kW，低於需求 ${fx(acNeed(), 1)} kW`, acs.map(i => i.id));
  }
  return { list, flags };
}

/* ---------- 一鍵優化：門窗位置固定，移動有問題且未鎖定的家具 ---------- */
const issueCost = id => runChecks(id).list.reduce((s, x) => s + (x.lv === 'err' ? 1000 : 150), 0);
function optCandidates(it) {
  const { W, D } = S.room, out = [];
  for (const dx of [-900, -600, -400, -200, 0, 200, 400, 600, 900]) for (const dy of [-900, -600, -400, -200, 0, 200, 400, 600, 900]) out.push({ x: it.x + dx, y: it.y + dy, rot: it.rot });
  if (LIB[it.type].mount !== 'ceiling') for (const side of ['N', 'S', 'W', 'E']) {
    const rot = { N: 0, S: 180, W: 270, E: 90 }[side], hx = rot % 180 ? it.d / 2 : it.w / 2, hy = rot % 180 ? it.w / 2 : it.d / 2;
    const horiz = side === 'N' || side === 'S', len = horiz ? W : D, h0 = horiz ? hx : hy, n = Math.max(1, Math.min(40, Math.floor((len - 2 * h0) / 150)));
    for (let k = 0; k <= n; k++) {
      const a = h0 + (len - 2 * h0) * k / n;
      out.push(side === 'N' ? { x: a, y: hy, rot } : side === 'S' ? { x: a, y: D - hy, rot } : side === 'W' ? { x: hx, y: a, rot } : { x: W - hx, y: a, rot });
    }
  }
  const st = Math.max(250, Math.sqrt(W * D / 220));
  for (let x = st / 2; x < W; x += st) for (let y = st / 2; y < D; y += st) { out.push({ x, y, rot: it.rot }); out.push({ x, y, rot: (it.rot + 90) % 360 }); }
  return out;
}
function optimize() {
  const before = runChecks().list.length; if (!before) { toast('目前沒有需要優化的問題。'); return; }
  pushHist();
  const moved = new Set();
  for (let pass = 0; pass < 4; pass++) {
    const ids = [...new Set(runChecks().list.flatMap(x => x.ids))];
    const bad = ids.map(itemById).filter(it => it && !it.lock).sort((a, b) => b.w * b.d - a.w * a.d);
    let improved = false;
    for (const it of bad) {
      const att = LIB[it.type].table ? S.items.filter(o => o !== it && LIB[o.type].tuck && !o.lock && polyDist(itemPoly(o), itemPoly(it)) <= 60).map(o => {
        const r = rad(-it.rot), dx = o.x - it.x, dy = o.y - it.y; return { o, lx: dx * Math.cos(r) - dy * Math.sin(r), ly: dx * Math.sin(r) + dy * Math.cos(r), dr: o.rot - it.rot, x0: o.x, y0: o.y, r0: o.rot };
      }) : [];
      const orig = { x: it.x, y: it.y, rot: it.rot };
      const apply = c => {
        it.x = c.x; it.y = c.y; it.rot = c.rot; snapItem(it); const r = rad(it.rot);
        att.forEach(a => { a.o.x = Math.round(it.x + a.lx * Math.cos(r) - a.ly * Math.sin(r)); a.o.y = Math.round(it.y + a.lx * Math.sin(r) + a.ly * Math.cos(r)); a.o.rot = ((a.dr + it.rot) % 360 + 360) % 360; });
      };
      const restore = () => { Object.assign(it, orig); att.forEach(a => { a.o.x = a.x0; a.o.y = a.y0; a.o.rot = a.r0; }); };
      const total = () => issueCost(it.id) + att.reduce((s, a) => s + issueCost(a.o.id), 0);
      const base = total(); let best = null, bestV = base;
      for (const c of optCandidates(it)) {
        apply(c);
        const v = total() + Math.hypot(it.x - orig.x, it.y - orig.y) / 1000 * 30 + (it.rot !== orig.rot ? 20 : 0);
        if (v < bestV - 1) { bestV = v; best = { x: it.x, y: it.y, rot: it.rot }; }
      }
      restore();
      if (best) { apply(best); moved.add(it.id); att.forEach(a => moved.add(a.o.id)); improved = true; }
    }
    if (!improved) break;
  }
  const after = runChecks().list.length;
  sel = null; refresh();
  toast(moved.size ? `優化完成：問題 ${before} → ${after} 項，移動 ${moved.size} 件家具（門窗與鎖定家具不動）。可按「復原」還原。` : `找不到更好的位置（問題 ${before} 項）。可調整門窗或加大房間後再試。`, 7000);
}

/* ---------- 計算 ---------- */
function calc() {
  const r = S.room, P = S.prices, fl = FLOORS[r.floor] || FLOORS.oak;
  const A = r.W * r.D / 1e6, ping = A / PING;
  const needPing = ping * (1 + fl.waste);
  const floorUnit = P.floor[r.floor] ?? fl.price;
  const tiles = fl.pat === 'tile' ? Math.ceil(A * (1 + fl.waste) / (fl.ts * fl.ts / 1e6)) : 0;
  const perim = 2 * (r.W + r.D) / 1000;
  const openA = S.openings.reduce((s, o) => s + o.width * Math.min(o.height, r.H - o.sill) / 1e6, 0);
  const wallA = Math.max(0, perim * r.H / 1000 - openA);
  const paintA = wallA + A, paintPing = paintA / PING, paintL = paintA * 2 / 10;
  const ceilPing = r.ceiling === 'none' ? 0 : ping, ceilUnit = r.ceiling === 'grid' ? P.ceilGrid : P.ceiling;
  const doorW = S.openings.filter(o => o.kind !== 'window').reduce((s, o) => s + o.width, 0) / 1000;
  const skirt = Math.max(0, perim - doorW);
  const lux = ROOMTYPES[r.type][1], lumens = lux * A / (0.6 * 0.8), lights = Math.max(1, Math.ceil(lumens / r.lm));
  const pl = S.items.filter(i => LIB[i.type].lm), plm = pl.reduce((s, i) => s + (i.lm || LIB[i.type].lm), 0), plLux = plm * .48 / A;
  const pac = S.items.filter(i => LIB[i.type].kw), pkw = pac.reduce((s, i) => s + LIB[i.type].kw, 0);
  const kcal = ping * 450 * (r.west ? 1.2 : 1) * (r.top ? 1.15 : 1), kw = kcal / 860;
  const acKw = AC_STD.find(v => v >= kw) || Math.ceil(kw);
  const furn = S.items.reduce((s, it) => s + itemPrice(it), 0);
  const foot = S.items.filter(i => !LIB[i.type].flat && onFloor(i)).reduce((s, i) => s + i.w * i.d / 1e6, 0);
  const rows = [
    { k: 'furn', name: '家具、系統櫃及設備', spec: `${S.items.length} 件`, qty: 1, unit: '式', price: furn, total: furn, eng: false },
    { k: 'floor', name: '地板工程', spec: `${fl.name}（含損耗 ${Math.round(fl.waste * 100)}%）`, qty: needPing, unit: '坪', price: floorUnit, total: needPing * floorUnit, eng: true },
    { k: 'paint', name: '油漆工程', spec: '牆面＋天花 批土兩底兩度', qty: paintPing, unit: '坪', price: P.paint, total: paintPing * P.paint, eng: true },
    { k: 'ceiling', name: '天花板工程', spec: r.ceiling === 'flat' ? '矽酸鈣板平釘' : r.ceiling === 'grid' ? '輕鋼架礦纖板' : '不施作', qty: ceilPing, unit: '坪', price: ceilUnit, total: ceilPing * ceilUnit, eng: true },
    { k: 'skirting', name: '踢腳板', spec: '扣除門及開口寬', qty: skirt, unit: 'm', price: P.skirting, total: skirt * P.skirting, eng: true },
    pl.length ? { k: 'light', name: '照明燈具', spec: `已配置 ${pl.length} 盞 ${fmt(plm)} lm（約 ${Math.round(plLux)} lx），已計入設備`, qty: 0, unit: '盞', price: P.light, total: 0, eng: true } : { k: 'light', name: '照明燈具', spec: `嵌燈 ${r.lm} lm／盞・目標 ${lux} lx`, qty: lights, unit: '盞', price: P.light, total: lights * P.light, eng: true },
    pac.length ? { k: 'ac', name: '空調設備', spec: `已配置 ${fx(pkw, 1)} kW（需求 ${fx(kw, 2)} kW），已計入設備`, qty: 0, unit: 'kW', price: P.acKw, total: 0, eng: true } : { k: 'ac', name: '空調設備', spec: `分離式變頻 ${acKw} kW（含安裝）`, qty: acKw, unit: 'kW', price: P.acKw, total: acKw * P.acKw, eng: true },
  ];
  const eng = rows.filter(x => x.eng).reduce((s, x) => s + x.total, 0);
  const design = ping * P.design, mgmt = eng * P.mgmt / 100;
  const sub = furn + eng + design + mgmt, tax = sub * P.tax / 100;
  return { pl, plm, plLux, pac, pkw, ceilUnit, A, ping, needPing, tiles, perim, openA, wallA, paintA, paintPing, paintL, ceilPing, skirt, lux, lumens, lights, kcal, kw, acKw, furn, foot, rows, eng, design, mgmt, sub, tax, total: sub + tax, fl };
}

/* 系統櫃拆單：18 mm 塑合板（側板、頂底板、層板、門板／抽屜面板）、8 mm 背板 */
function cutList() {
  const out = [];
  S.items.forEach((it, idx) => {
    const L = LIB[it.type]; if (!CAB_BUILDS[L.build] || L.pricing !== 'chi') return;
    const w = it.w, d = it.d, h = it.h, t = 18, iw = w - 2 * t;
    const tag = `#${idx + 1} ${it.name}`;
    const doors = L.build === 'cabinet' ? Math.max(1, Math.round(w / 450)) : 0;
    const drawers = L.build === 'drawer' ? Math.max(1, Math.round(h / 250)) : 0;
    const shelves = L.build === 'drawer' ? 0 : Math.max(1, Math.round(h / 380) - 1);
    const kick = h > 1200 ? 80 : 0;
    const p = (part, a, b, n, th) => out.push({ tag, id: it.id, part, a: Math.round(a), b: Math.round(b), n, th });
    p('側板', h, d, 2, t);
    p('頂板／底板', iw, d, 2, t);
    if (shelves) p('層板', iw - 2, d - 20, shelves, t);
    if (kick) p('踢腳板', iw, kick, 1, t);
    p('背板', w - 4, h - 4 - kick, 1, 8);
    if (doors) p('門板', w / doors - 3, h - kick - 3, doors, t);
    if (drawers) { p('抽屜面板', w - 3, (h - kick) / drawers - 3, drawers, t); p('抽屜箱板（左右）', d - 60, (h - kick) / drawers - 70, drawers * 2, 15); }
    const hingeN = doors * (h > 1800 ? 4 : h > 1100 ? 3 : 2);
    out.push({ tag, id: it.id, hw: true, hinge: hingeN, handle: doors + drawers, slide: drawers });
  });
  const parts = out.filter(x => !x.hw), hw = out.filter(x => x.hw);
  const a18 = parts.filter(x => x.th >= 15).reduce((s, x) => s + x.a * x.b * x.n / 1e6, 0);
  const a8 = parts.filter(x => x.th === 8).reduce((s, x) => s + x.a * x.b * x.n / 1e6, 0);
  const s18 = Math.ceil(a18 / (SHEET * .82)), s8 = Math.ceil(a8 / (SHEET * .85));
  const edge = parts.filter(x => x.th >= 15).reduce((s, x) => s + 2 * (x.a + x.b) * x.n / 1000, 0);
  const hinge = hw.reduce((s, x) => s + x.hinge, 0), handle = hw.reduce((s, x) => s + x.handle, 0), slide = hw.reduce((s, x) => s + x.slide, 0);
  return { parts, a18, a8, s18, s8, edge, hinge, handle, slide };
}

/* ---------- Three.js 3D ---------- */
let ceilM = null, ringMat = null, hitMat = null;
let renderer, scene, camera, sun, roomG, itemsG, helperG, dirty = true, walls3d = [], labels = [], floorTex = null;
const BOXG = new THREE.BoxGeometry(1, 1, 1);
const matCache = new Map();
function mat(c, o) {
  o = o || {};
  const k = c + '|' + (o.op || 1) + '|' + (o.m || 0) + '|' + (o.r ?? .75) + '|' + (o.e || '');
  if (!matCache.has(k)) matCache.set(k, new THREE.MeshStandardMaterial({ color: c, roughness: o.r ?? .75, metalness: o.m || 0, transparent: !!o.op, opacity: o.op || 1, emissive: o.e || '#000000', depthWrite: !o.op }));
  return matCache.get(k);
}
function shade(hex, f) {
  const c = new THREE.Color(hex); c.r = clamp(c.r * f, 0, 1); c.g = clamp(c.g * f, 0, 1); c.b = clamp(c.b * f, 0, 1); return '#' + c.getHexString();
}
function B(g, w, h, d, x, y, z, c, o) {
  const m = new THREE.Mesh(BOXG, mat(c, o));
  m.scale.set(Math.max(w, .001), Math.max(h, .001), Math.max(d, .001)); m.position.set(x, y + h / 2, z);
  m.castShadow = !(o && o.op); m.receiveShadow = true; g.add(m); return m;
}
function C(g, rt, rb, h, x, y, z, c, o, seg = 28) {
  const m = new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, seg), mat(c, o));
  m.position.set(x, y + h / 2, z); m.castShadow = true; m.receiveShadow = true; g.add(m); return m;
}
function rng(seed) { return () => { seed |= 0; seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }

const BUILD = {
  sofa(g, w, d, h, c, L) {
    const lg = .08, aw = Math.min(.2, w * .14), bd = .2, n = L.seats || Math.max(1, Math.round(w / .7));
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) B(g, .05, lg, .05, sx * (w / 2 - .08), 0, sz * (d / 2 - .08), '#2a2a2a');
    B(g, w, .26, d, 0, lg, 0, c); B(g, w, h - lg, bd, 0, lg, -d / 2 + bd / 2, c);
    for (const s of [-1, 1]) B(g, aw, .6 - lg, d, s * (w / 2 - aw / 2), lg, 0, c);
    const iw = w - 2 * aw, cw = iw / n, cc = shade(c, 1.12);
    for (let i = 0; i < n; i++) {
      const x = -iw / 2 + cw * (i + .5);
      B(g, cw - .02, .14, d - bd - .04, x, lg + .26, bd / 2 + .01, cc);
      B(g, cw - .03, .38, .14, x, lg + .4, -d / 2 + bd + .07, cc);
    }
  },
  sofaL(g, w, d, h, c) {
    const lg = .08, d1 = Math.min(.95, d * .6), cw = Math.min(.95, w * .4), cc = shade(c, 1.12);
    B(g, w, .26, d1, 0, lg, -d / 2 + d1 / 2, c); B(g, cw, .26, d - d1, w / 2 - cw / 2, lg, -d / 2 + d1 + (d - d1) / 2, c);
    B(g, w, h - lg, .2, 0, lg, -d / 2 + .1, c); B(g, .2, .6 - lg, d1, -w / 2 + .1, lg, -d / 2 + d1 / 2, c); B(g, .2, .6 - lg, d, w / 2 - .1, lg, 0, c);
    const iw = w - .4, n = Math.max(2, Math.round(iw / .75)), sw = iw / n;
    for (let i = 0; i < n; i++) { const x = -w / 2 + .2 + sw * (i + .5); B(g, sw - .02, .14, d1 - .24, x, lg + .26, -d / 2 + .2 + (d1 - .2) / 2, cc); B(g, sw - .03, .38, .14, x, lg + .4, -d / 2 + .27, cc); }
    B(g, cw - .22, .14, d - d1 - .04, w / 2 - cw / 2 - .1, lg + .26, -d / 2 + d1 + (d - d1) / 2, cc);
  },
  table(g, w, d, h, c) {
    B(g, w, .04, d, 0, h - .04, 0, c);
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) B(g, .05, h - .04, .05, sx * (w / 2 - .07), 0, sz * (d / 2 - .07), shade(c, .7));
  },
  roundtable(g, w, d, h, c) { C(g, w / 2, w / 2, .04, 0, h - .04, 0, c, null, 40); C(g, .05, .05, h - .04, 0, 0, 0, shade(c, .7)); C(g, .25, .28, .03, 0, 0, 0, shade(c, .6)); },
  chair(g, w, d, h, c) {
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) B(g, .03, .45, .03, sx * (w / 2 - .04), 0, sz * (d / 2 - .04), '#2a2a2a');
    B(g, w, .05, d - .02, 0, .43, .01, c); B(g, w, h - .48, .04, 0, .48, -d / 2 + .03, c);
  },
  ochair(g, w, d, h, c) {
    C(g, .3, .3, .03, 0, .04, 0, '#333', { m: .5, r: .4 }, 5); C(g, .025, .025, .4, 0, .06, 0, '#777', { m: .7, r: .3 });
    B(g, w * .8, .08, d * .78, 0, .45, .02, c); B(g, w * .72, h - .62, .06, 0, .6, -d / 2 + .1, c);
    for (const s of [-1, 1]) B(g, .04, .22, d * .5, s * (w * .4 + .02), .5, 0, '#333');
  },
  desk(g, w, d, h, c) {
    B(g, w, .03, d, 0, h - .03, 0, c);
    for (const s of [-1, 1]) B(g, .03, h - .03, d, s * (w / 2 - .015), 0, 0, shade(c, .9));
    B(g, w - .06, .35, .02, 0, h - .4, -d / 2 + .05, shade(c, .9));
    if (w > 1.1) B(g, .4, .45, d - .05, w / 2 - .25, h - .48, 0, shade(c, .95));
  },
  cabinet(g, w, d, h, c) {
    const kick = h > 1.2 ? .08 : 0; B(g, w, kick || .001, d - .05, 0, 0, -.025, '#3a3a3a');
    B(g, w, h - kick, d, 0, kick, 0, c);
    const n = Math.max(1, Math.round(w / .45)), dw = w / n;
    for (let i = 1; i < n; i++) B(g, .004, h - kick - .02, .005, -w / 2 + dw * i, kick + .01, d / 2 + .002, shade(c, .55));
    for (let i = 0; i < n; i++) { const x = -w / 2 + dw * i + (i % 2 ? .05 : dw - .05); B(g, .015, Math.min(.3, h * .2), .02, x, kick + (h - kick) * .45, d / 2 + .01, '#8d9399', { m: .7, r: .3 }); }
  },
  drawer(g, w, d, h, c) {
    B(g, w, h, d, 0, 0, 0, c);
    const n = Math.max(1, Math.round(h / .25)), dh = h / n;
    for (let i = 1; i < n; i++) B(g, w - .02, .004, .005, 0, dh * i, d / 2 + .002, shade(c, .55));
    for (let i = 0; i < n; i++) B(g, Math.min(.25, w * .4), .015, .02, 0, dh * i + dh * .55, d / 2 + .01, '#8d9399', { m: .7, r: .3 });
  },
  shelf(g, w, d, h, c) {
    for (const s of [-1, 1]) B(g, .018, h, d, s * (w / 2 - .009), 0, 0, c);
    B(g, w, h, .008, 0, 0, -d / 2 + .004, shade(c, .85));
    const n = Math.max(2, Math.round(h / .38)), sh = (h - .018) / n, R = rng(Math.round(w * 1000 + h * 7));
    const bc = ['#7a4a3a', '#2f5d7c', '#c4a35a', '#4d6b4a', '#8a3b3b', '#d8d2c4', '#3e3e52'];
    for (let i = 0; i <= n; i++) {
      B(g, w - .036, .018, d - .01, 0, sh * i, .005, c);
      if (i < n && i > 0) { let x = -w / 2 + .03; while (x < w / 2 - .12) { const bw = .025 + R() * .03, bh = sh * (.55 + R() * .3); B(g, bw, bh, d * .7, x + bw / 2, sh * i + .018, 0, bc[Math.floor(R() * bc.length)]); x += bw + .002 + (R() < .1 ? .08 : 0); } }
    }
  },
  tvstand(g, w, d, h, c) {
    BUILD.drawer(g, w, d, h, c);
    const tw = Math.min(w * .8, 1.45), th = tw * .5625;
    B(g, .28, .03, .2, 0, h, -d / 2 + .14, '#333'); B(g, .05, .1, .03, 0, h + .02, -d / 2 + .12, '#333');
    B(g, tw, th, .04, 0, h + .1, -d / 2 + .12, '#111', { r: .3 }); B(g, tw - .02, th - .02, .002, 0, h + .11, -d / 2 + .141, '#1c2b40', { r: .15, e: '#08101c' });
  },
  rug(g, w, d, h, c) { const m = B(g, w, .012, d, 0, 0, 0, c, { r: 1 }); m.castShadow = false; },
  lamp(g, w, d, h, c) { C(g, w * .35, w * .4, .03, 0, 0, 0, '#333', { m: .5 }); C(g, .012, .012, h - .3, 0, .03, 0, '#888', { m: .7 }); C(g, w * .32, w * .45, .3, 0, h - .3, 0, c, { e: '#4a4030' }); },
  bed(g, w, d, h, c) {
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) B(g, .06, .06, .06, sx * (w / 2 - .06), 0, sz * (d / 2 - .06), '#2a2a2a');
    B(g, w, .26, d, 0, .06, 0, c); B(g, w - .05, .22, d - .1, 0, .32, .03, '#f1efe9', { r: .95 });
    B(g, w + .02, h, .08, 0, 0, -d / 2 + .04, shade(c, .85));
    const n = w > 1.3 ? 2 : 1, pw = (w - .2) / n - .05;
    for (let i = 0; i < n; i++) B(g, pw, .12, .38, -w / 2 + .1 + (pw + .05) * i + pw / 2 + .025, .54, -d / 2 + .32, '#ffffff', { r: .95 });
    B(g, w - .02, .06, d * .62, 0, .53, d / 2 - d * .31 - .03, '#8fa3b8', { r: .95 });
  },
  kitchen(g, w, d, h, c) {
    B(g, w, .1, d - .07, 0, 0, -.035, '#3a3a3a'); B(g, w, .75, d - .02, 0, .1, -.01, c);
    B(g, w, .04, d, 0, .85, 0, '#cbc6bd', { r: .4 });
    const n = Math.max(1, Math.round(w / .6)), dw = w / n;
    for (let i = 1; i < n; i++) B(g, .004, .72, .005, -w / 2 + dw * i, .12, d / 2 - .008, shade(c, .55));
    B(g, .7, .005, .42, -w * .25, .891, .02, '#9aa3ad', { m: .6, r: .3 }); C(g, .015, .015, .25, -w * .25, .89, -d / 2 + .1, '#aab', { m: .8, r: .2 });
    B(g, .7, .012, .5, w * .25, .89, .01, '#111', { r: .2 });
    if (h > 1.6) {
      B(g, w, .6, .02, 0, .89, -d / 2 + .01, '#dfe6ea', { r: .3 });
      B(g, w, Math.min(.75, h - 1.5), .35, 0, h - Math.min(.75, h - 1.5), -d / 2 + .175, c);
      for (let i = 1; i < n; i++) B(g, .004, Math.min(.75, h - 1.5) - .02, .005, -w / 2 + dw * i, h - Math.min(.75, h - 1.5) + .01, -d / 2 + .352, shade(c, .55));
      B(g, .8, .35, .5, w * .25, h - Math.min(.75, h - 1.5) - .35, -d / 2 + .25, '#9aa3ad', { m: .6, r: .35 });
    }
  },
  fridge(g, w, d, h, c) {
    B(g, w, h, d, 0, 0, 0, c, { m: .3, r: .4 }); B(g, w - .01, .006, .005, 0, h * .62, d / 2 + .002, '#555');
    for (const y of [h * .3, h * .8]) B(g, .02, .35, .03, -w / 2 + .06, y - .17, d / 2 + .015, '#777', { m: .7 });
  },
  island(g, w, d, h, c) { B(g, w - .1, h - .04, d - .2, 0, 0, -.05, c); B(g, w, .04, d, 0, h - .04, 0, '#cbc6bd', { r: .4 }); },
  toilet(g, w, d, h, c) {
    B(g, w * .9, .4, .18, 0, .38, -d / 2 + .09, c, { r: .3 });
    const b = C(g, w * .45, w * .35, .4, 0, 0, .05, c, { r: .3 }); b.scale.z = 1.35;
    const s = C(g, w * .47, w * .47, .03, 0, .4, .05, '#ffffff', { r: .3 }); s.scale.z = 1.35;
  },
  basin(g, w, d, h, c) {
    B(g, w, h - .06, d, 0, 0, 0, c); B(g, .004, h - .1, .005, 0, .02, d / 2 + .002, shade(c, .55));
    B(g, w, .06, d, 0, h - .06, 0, '#f4f4f2', { r: .3 }); B(g, w * .5, .004, d * .5, 0, h, .03, '#cfd8df', { r: .2 });
    C(g, .015, .015, .18, 0, h, -d / 2 + .06, '#aab', { m: .8, r: .2 });
    B(g, w * .8, .75, .02, 0, h + .3, -d / 2 + .01, '#bcd3e3', { m: .8, r: .08 });
  },
  shower(g, w, d, h, c) {
    B(g, w, .05, d, 0, 0, 0, '#f0f0f0', { r: .3 });
    const gl = { op: .28, r: .05, m: .1 };
    B(g, w, h - .05, .008, 0, .05, d / 2 - .004, c, gl); B(g, .008, h - .05, d, w / 2 - .004, .05, 0, c, gl);
    B(g, w, .02, .02, 0, h - .02, d / 2 - .01, '#aab', { m: .8 }); B(g, .02, .02, d, w / 2 - .01, h - .02, 0, '#aab', { m: .8 });
    C(g, .1, .1, .02, -w / 4, h - .15, -d / 4, '#aab', { m: .8, r: .2 });
  },
  tub(g, w, d, h, c) { B(g, w, h, d, 0, 0, 0, c, { r: .3 }); B(g, w - .12, .006, d - .12, 0, h, 0, '#cfe2ee', { r: .15 }); },
  plant(g, w, d, h, c) {
    C(g, w * .32, w * .25, .38, 0, 0, 0, '#8b6a50');
    const r = Math.min(w, d) / 2;
    const s1 = new THREE.Mesh(new THREE.SphereGeometry(r, 16, 12), mat(c, { r: .9 })); s1.position.set(0, h - r, 0); s1.castShadow = true; g.add(s1);
    const s2 = new THREE.Mesh(new THREE.SphereGeometry(r * .7, 14, 10), mat(shade(c, 1.2), { r: .9 })); s2.position.set(r * .35, h - r * 1.6, r * .2); s2.castShadow = true; g.add(s2);
    C(g, .02, .02, h - r - .3, 0, .3, 0, '#5a4430');
  },
};
Object.assign(BUILD, {
  workstation(g, w, d, h, c) { const t = .72; B(g, w, .025, d - .05, 0, t, .025, c); for (const s of [-1, 1]) B(g, .03, t, d - .08, s * (w / 2 - .015), 0, .04, shade(c, .85)); B(g, w, h, .05, 0, 0, -d / 2 + .025, '#6d7f94', { r: .95 }); },
  ws4(g, w, d, h, c) {
    const t = .72, dd = (d - .05) / 2;
    for (const s of [-1, 1]) B(g, w, .025, dd, 0, t, s * (.025 + dd / 2), c);
    for (const sx of [-1, 0, 1]) B(g, .03, t, d - .1, sx ? sx * (w / 2 - .015) : 0, 0, 0, shade(c, .85));
    B(g, w, h, .05, 0, 0, 0, '#6d7f94', { r: .95 });
  },
  ldesk(g, w, d, h, c) {
    const t = h - .03, k = shade(c, .85);
    B(g, w, .03, .75, 0, t, d / 2 - .375, c); B(g, .6, .03, d - .75, -w / 2 + .3, t, -.375, c);
    B(g, w - .04, .45, .02, 0, .25, d / 2 - .03, k); B(g, .03, t, .73, w / 2 - .015, 0, d / 2 - .375, k); B(g, .02, t, d - .02, -w / 2 + .01, 0, 0, k);
    B(g, .45, .6, .55, -w / 2 + .32, .02, -d / 2 + .35, shade(c, .95));
  },
  filecab(g, w, d, h, c) {
    B(g, w, h, d, 0, 0, 0, c, { m: .3, r: .5 });
    const n = Math.max(2, Math.round(h / .45)), dh = h / n;
    for (let i = 1; i < n; i++) B(g, w - .02, .004, .005, 0, dh * i, d / 2 + .002, '#555');
    for (let i = 0; i < n; i++) B(g, .2, .02, .02, 0, dh * i + dh * .7, d / 2 + .01, '#666', { m: .7 });
  },
  counter(g, w, d, h, c) {
    B(g, w, h, .06, 0, 0, d / 2 - .03, c); B(g, w + .04, .03, .34, 0, h, d / 2 - .15, '#cbc6bd', { r: .4 });
    B(g, w - .08, .03, d - .1, 0, .72, -.03, c); for (const s of [-1, 1]) B(g, .04, h, d, s * (w / 2 - .02), 0, 0, c);
  },
  panel(g, w, d, h, c) { B(g, w, h - .03, d, 0, 0, 0, c, { r: .95 }); B(g, w, .03, d + .01, 0, h - .03, 0, '#9aa3ad', { m: .5 }); },
  printer(g, w, d, h, c) { B(g, w, h * .75, d, 0, 0, 0, c); B(g, w * .95, h * .22, d * .8, 0, h * .75, -d * .08, shade(c, .92)); B(g, w * .6, .02, d * .3, 0, h * .75, d * .32, '#333'); },
  fan(g, w, d, h, c) {
    const r = w / 2;
    C(g, .07, .09, .06, 0, h - .06, 0, c); C(g, .012, .012, Math.max(.02, h - .24), 0, .18, 0, '#888', { m: .6 }); C(g, .13, .13, .12, 0, .06, 0, c, { m: .3 });
    for (let i = 0; i < 5; i++) { const bg = new THREE.Group(); bg.rotation.y = i * 2 * Math.PI / 5; B(bg, r - .13, .012, .14, .13 + (r - .13) / 2, .08, 0, '#a07850'); g.add(bg); }
  },
  clight(g, w, d, h, c) { C(g, w / 2, w / 2 * .9, h, 0, 0, 0, c, { e: '#fff1cc' }, 32); },
  dlight(g, w, d, h, c) { C(g, w / 2, w / 2, h, 0, 0, 0, c, { e: '#fff1cc' }, 20); },
  pendant(g, w, d, h, c) { C(g, .005, .005, Math.max(.02, h - .25), 0, .25, 0, '#222'); C(g, w * .12, w / 2, .25, 0, 0, 0, c); C(g, w * .44, w * .44, .006, 0, .001, 0, '#fff1cc', { e: '#fff1cc' }); },
  lpanel(g, w, d, h, c) { B(g, w, h, d, 0, 0, 0, c, { e: '#e3e9ee' }); },
  cassette(g, w, d, h, c) { B(g, w, h, d, 0, 0, 0, c); B(g, w * .62, .004, d * .62, 0, -.004, 0, '#b9bec4'); },
  projector(g, w, d, h, c) { C(g, .02, .02, Math.max(.02, h - .15), 0, .15, 0, '#888', { m: .6 }); B(g, w, .15, d, 0, 0, 0, c); B(g, .09, .09, .03, -w * .25, .03, d / 2 + .015, '#222'); },
  splitac(g, w, d, h, c) { B(g, w, h, d, 0, 0, 0, c, { r: .4 }); B(g, w * .85, .02, .02, 0, .05, d / 2, '#555'); },
  tvwall(g, w, d, h, c) { B(g, w, h, d, 0, 0, 0, '#111', { r: .3 }); B(g, w - .02, h - .02, .002, 0, .01, d / 2 + .001, '#1c2b40', { r: .15, e: '#08101c' }); },
  board(g, w, d, h, c) { B(g, w, h, d, 0, 0, 0, c, { m: .5 }); B(g, w - .04, h - .04, .004, 0, .02, d / 2 + .002, '#fafafa', { r: .2 }); B(g, w * .5, .03, .06, 0, 0, d / 2 + .03, c, { m: .5 }); },
  curtain(g, w, d, h, c) {
    const n = Math.max(4, Math.round(w / .12)), fw = w / n;
    for (let i = 0; i < n; i++) B(g, fw + .01, h - .03, .03, -w / 2 + fw * (i + .5), 0, (i % 2 ? .03 : -.03), c, { r: 1 });
    B(g, w + .1, .025, .025, 0, h - .03, -d / 2 + .02, '#888', { m: .6 });
  },
  art(g, w, d, h, c) { B(g, w, h, d, 0, 0, 0, '#2a2a2a'); B(g, w - .06, h - .06, .004, 0, .03, d / 2 + .002, c); },
  wshelf(g, w, d, h, c) { B(g, w, h, d, 0, 0, 0, c); },
});
function buildItem(it) {
  const g = new THREE.Group(), L = LIB[it.type];
  BUILD[L.build](g, it.w / 1000, it.d / 1000, it.h / 1000, it.color, L);
  g.userData.id = it.id; return g;
}
function disposeTree(o) { o.traverse(c => { if (c.geometry && c.geometry !== BOXG) c.geometry.dispose(); }); }
function clearG(g) { while (g.children.length) { const c = g.children.pop(); disposeTree(c); } }

function floorTexture(fl) {
  const cv = document.createElement('canvas'); cv.width = cv.height = 512; const x = cv.getContext('2d'), R = rng(7);
  const mix = (a, b, t) => { const A = new THREE.Color(a), Bc = new THREE.Color(b); return '#' + A.lerp(Bc, t).getHexString(); };
  let meters = 2.4;
  if (fl.pat === 'plank') {
    const rows = 12, rh = 512 / rows, pl = 256;
    for (let r = 0; r < rows; r++) {
      const off = ((r * 97) % 3) * 85;
      for (let s = -1; s < 3; s++) {
        const x0 = s * pl + off; x.fillStyle = mix(fl.c1, fl.c2, R()); x.fillRect(x0, r * rh, pl, rh);
        x.strokeStyle = 'rgba(0,0,0,.06)'; for (let k = 0; k < 4; k++) { x.beginPath(); const yy = r * rh + 4 + R() * (rh - 8); x.moveTo(x0, yy); x.bezierCurveTo(x0 + 80, yy + 3, x0 + 170, yy - 3, x0 + pl, yy); x.stroke(); }
        x.fillStyle = 'rgba(0,0,0,.28)'; x.fillRect(x0, r * rh, 1.5, rh);
      }
      x.fillStyle = 'rgba(0,0,0,.25)'; x.fillRect(0, r * rh, 512, 1.2);
    }
  } else if (fl.pat === 'tile') {
    meters = fl.ts * 4 / 1000; const ts = 128;
    for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) { x.fillStyle = mix(fl.c1, fl.c2, R()); x.fillRect(i * ts, j * ts, ts, ts); }
    x.fillStyle = 'rgba(0,0,0,.035)'; for (let k = 0; k < 900; k++) x.fillRect(R() * 512, R() * 512, 2, 2);
    x.fillStyle = 'rgba(70,70,70,.45)'; for (let i = 0; i < 4; i++) { x.fillRect(i * ts, 0, 2, 512); x.fillRect(0, i * ts, 512, 2); }
  } else {
    x.fillStyle = fl.c1; x.fillRect(0, 0, 512, 512); for (let k = 0; k < 3000; k++) { x.fillStyle = `rgba(${R() > .5 ? '255,255,255' : '0,0,0'},.04)`; x.fillRect(R() * 512, R() * 512, 3, 3); }
  }
  const t = new THREE.CanvasTexture(cv); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 4; return { t, meters };
}

function buildRoom() {
  clearG(roomG); walls3d = []; if (floorTex) floorTex.dispose();
  const r = S.room, W = r.W / 1000, D = r.D / 1000, H = r.H / 1000, T = r.T / 1000;
  const { t, meters } = floorTexture(FLOORS[r.floor] || FLOORS.oak); floorTex = t; t.repeat.set(W / meters, D / meters);
  const fm = new THREE.Mesh(new THREE.PlaneGeometry(W, D), new THREE.MeshStandardMaterial({ map: t, roughness: .7 }));
  fm.rotation.x = -Math.PI / 2; fm.receiveShadow = true; roomG.add(fm);
  B(roomG, W + 2 * T, .02, D + 2 * T, 0, -.021, 0, '#2a3442').userData.stepColor = (FLOORS[r.floor] || FLOORS.oak).c1;
  const wc = r.wall;
  const defs = [{ k: 'N', ax: 'x', s0: -T, s1: W + T, n: [0, -1] }, { k: 'S', ax: 'x', s0: -T, s1: W + T, n: [0, 1] }, { k: 'W', ax: 'y', s0: 0, s1: D, n: [-1, 0] }, { k: 'E', ax: 'y', s0: 0, s1: D, n: [1, 0] }];
  for (const df of defs) {
    const g = new THREE.Group(); roomG.add(g); walls3d.push({ g, n: df.n });
    const piece = (a0, a1, b0, b1, th = T, col = wc, o, inset = T / 2) => {
      if (a1 - a0 < 1e-4 || b1 - b0 < 1e-4) return;
      const am = (a0 + a1) / 2, len = a1 - a0;
      let px, pz, sx, sz;
      if (df.ax === 'x') { px = am; pz = df.k === 'N' ? -inset : D + inset; sx = len; sz = th; }
      else { pz = am; px = df.k === 'W' ? -inset : W + inset; sx = th; sz = len; }
      return B(g, sx, b1 - b0, sz, px - W / 2, b0, pz - D / 2, col, o);
    };
    const ops = S.openings.filter(o => o.wall === df.k).sort((a, b) => a.offset - b.offset);
    let cur = df.s0;
    for (const o of ops) {
      const a0 = clamp(o.offset / 1000, 0, df.ax === 'x' ? W : D), a1 = clamp((o.offset + o.width) / 1000, a0, df.ax === 'x' ? W : D);
      if (a0 < cur) continue;
      const b0 = o.kind === 'window' ? o.sill / 1000 : 0, b1 = Math.min(H, b0 + o.height / 1000);
      piece(cur, a0, 0, H); piece(a0, a1, 0, b0); piece(a0, a1, b1, H); cur = a1;
      const fc = '#5b6672', tag0 = g.children.length;
      if (o.kind === 'window') {
        piece(a0, a1, b0, b1, .012, '#bfe3f5', { op: .3, r: .05 });
        piece(a0, a1, b0, b0 + .04, T * .7, fc); piece(a0, a1, b1 - .04, b1, T * .7, fc);
        piece(a0, a0 + .04, b0, b1, T * .7, fc); piece(a1 - .04, a1, b0, b1, T * .7, fc); piece((a0 + a1) / 2 - .02, (a0 + a1) / 2 + .02, b0, b1, T * .7, fc);
        piece(a0 - .03, a1 + .03, b0 - .02, b0, T + .06, '#d8d4cc', null, T / 2 - .03);
      } else if (o.kind === 'slide') {
        const m = (a0 + a1) / 2;
        piece(a0, m + .03, 0, b1, .03, '#c9a77c', null, T / 2 - .02); piece(m - .03, a1, 0, b1, .03, '#b8956a', null, T / 2 + .02);
      } else if (o.kind === 'door') {
        const sp = wallSpan(o), w = o.width / 1000, ang = rad(65);
        const dx = sp.dir[0] * Math.cos(ang) + sp.nIn[0] * Math.sin(ang), dy = sp.dir[1] * Math.cos(ang) + sp.nIn[1] * Math.sin(ang);
        const lg = new THREE.Group(); lg.position.set(sp.hinge[0] / 1000 - W / 2, 0, sp.hinge[1] / 1000 - D / 2); lg.rotation.y = -Math.atan2(dy, dx);
        B(lg, w - .01, b1 - .01, .04, w / 2, 0, 0, '#c9a77c'); B(lg, .12, .02, .05, w - .1, 1.0, 0, '#8d9399', { m: .7 }); g.add(lg);
      }
      if (o.kind !== 'window' && o.kind !== 'open') { piece(a0 - .05, a0, 0, b1, T + .02, fc); piece(a1, a1 + .05, 0, b1, T + .02, fc); piece(a0 - .05, a1 + .05, b1, b1 + .05, T + .02, fc); }
      if (o.kind === 'open') piece(a0, a1, 0, .01, T, '#f0883e', { op: .35 });
      g.children.slice(tag0).forEach(m => { m.userData.opId = o.id; });
    }
    piece(cur, df.s1, 0, H);
  }
  ceilM = null;
  if (S.set.ceil) { ceilM = B(roomG, W + 2 * T, .03, D + 2 * T, 0, H, 0, r.ceiling === 'grid' ? '#eceeef' : '#f3f2ee'); ceilM.castShadow = false; ceilM.userData.stepColor = '#f3f2ee'; }
  const s = Math.max(W, D);
  sun.position.set(-s * .6, H * 3 + s, s * .9); sun.target.position.set(0, 0, 0);
  const sc = sun.shadow.camera; sc.left = sc.bottom = -s; sc.right = sc.top = s; sc.near = .1; sc.far = 50; sc.updateProjectionMatrix();
  updateCut(); dirty = true;
}
function buildItems() {
  clearG(itemsG);
  const W = S.room.W / 1000, D = S.room.D / 1000;
  for (const it of S.items) { const g = buildItem(it); placeItem(g, it, W, D); itemsG.add(g); }
  buildHelpers(); dirty = true;
}
function placeItem(g, it, W = S.room.W / 1000, D = S.room.D / 1000) { g.position.set(it.x / 1000 - W / 2, itemZ(it) / 1000, it.y / 1000 - D / 2); g.rotation.y = -rad(it.rot); }
function buildHelpers() {
  clearG(helperG);
  for (const g of itemsG.children) {
    const id = g.userData.id, f = checks.flags[id], isSel = sel && sel.kind === 'item' && sel.id === id;
    if (!isSel && !f) continue;
    const bx = new THREE.Box3().setFromObject(g); bx.expandByScalar(.01);
    helperG.add(new THREE.Box3Helper(bx, new THREE.Color(isSel ? '#f0883e' : f === 'bad' ? '#ff5c5c' : '#f2b441')));
    if (isSel) { // 旋轉環：拖曳環即可手動轉向
      const it = itemById(id), R = Math.max(it.w, it.d) / 2000 + .2, y = itemZ(it) / 1000 + .015, th = rad(it.rot);
      if (!ringMat) { ringMat = new THREE.MeshBasicMaterial({ color: '#f0883e' }); hitMat = new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false }); }
      const ring = new THREE.Mesh(new THREE.TorusGeometry(R, .014, 8, 72), ringMat); ring.rotation.x = -Math.PI / 2; ring.position.set(g.position.x, y, g.position.z); helperG.add(ring);
      const hit = new THREE.Mesh(new THREE.TorusGeometry(R, .09, 6, 48), hitMat); hit.rotation.x = -Math.PI / 2; hit.position.copy(ring.position); hit.userData.gizmo = id; helperG.add(hit);
      const knob = new THREE.Mesh(new THREE.SphereGeometry(.07, 16, 12), ringMat); knob.position.set(g.position.x - R * Math.sin(th), y, g.position.z + R * Math.cos(th)); knob.userData.gizmo = id; helperG.add(knob);
    }
  }
  buildLabels(); dirty = true;
}

/* 自製軌道相機：左鍵旋轉、右鍵/Shift 平移、滾輪縮放、雙指縮放 */
const cam = { th: -.65, ph: .95, r: 9, tg: new THREE.Vector3(0, .9, 0) };
const CAMS = { iso: [-.65, .95], front: [0, 1.42], right: [Math.PI / 2, 1.42], top: [0, .02], in: [0, 1.5] };
function fitCam(k = 'iso') {
  const r = S.room; const s = Math.max(r.W, r.D, r.H) / 1000;
  [cam.th, cam.ph] = CAMS[k]; cam.r = s * (k === 'iso' ? 1.75 : 1.9); cam.tg.set(0, k === 'top' ? 0 : r.H / 2000 * .7, 0);
  if (k === 'in') { cam.r = Math.max(1, r.D / 2000 * .85); cam.tg.set(0, Math.min(1.35, r.H / 2000), 0); }
  updCam();
}
function updCam() {
  const sp = Math.sin(cam.ph);
  camera.position.set(cam.tg.x + cam.r * sp * Math.sin(cam.th), cam.tg.y + cam.r * Math.cos(cam.ph), cam.tg.z + cam.r * sp * Math.cos(cam.th));
  camera.up.set(cam.ph < .05 ? -Math.sin(cam.th) : 0, cam.ph < .05 ? 0 : 1, cam.ph < .05 ? -Math.cos(cam.th) : 0);
  camera.lookAt(cam.tg); updateCut(); dirty = true;
}
function updateCut() {
  const dx = camera.position.x - cam.tg.x, dz = camera.position.z - cam.tg.z, L = Math.hypot(dx, dz, camera.position.y - cam.tg.y) || 1;
  for (const w of walls3d) w.g.visible = !(S.set.cut && (w.n[0] * dx + w.n[1] * dz) / L > .3);
  if (ceilM) ceilM.visible = camera.position.y < S.room.H / 1000 - .03;
  dirty = true;
}
function buildLabels() {
  const host = $('#labels'); host.innerHTML = ''; labels = [];
  const r = S.room, W = r.W / 1000, D = r.D / 1000, H = r.H / 1000;
  const add = (txt, v, cls = '') => { const el = document.createElement('div'); el.className = 'tag ' + cls; el.textContent = txt; host.appendChild(el); labels.push({ el, v }); };
  add(`W ${fmt(r.W)}`, new THREE.Vector3(0, H + .12, -D / 2));
  add(`D ${fmt(r.D)}`, new THREE.Vector3(W / 2 + .1, H + .12, 0));
  add(`H ${fmt(r.H)}`, new THREE.Vector3(-W / 2 - .15, H / 2, D / 2), 'h');
  const it = sel && sel.kind === 'item' ? itemById(sel.id) : null;
  if (it) add(`${it.name}  ${it.w}×${it.d}×${it.h}  ${it.rot}°`, new THREE.Vector3(it.x / 1000 - W / 2, (itemZ(it) + it.h) / 1000 + .18, it.y / 1000 - D / 2), 'sel');
  dirty = true;
}
function placeLabels() {
  const el = renderer.domElement, w = el.clientWidth, h = el.clientHeight;
  for (const l of labels) {
    const p = l.v.clone().project(camera);
    const vis = p.z < 1 && view === '3d';
    l.el.hidden = !vis; if (!vis) continue;
    l.el.style.left = ((p.x + 1) / 2 * w) + 'px'; l.el.style.top = ((1 - p.y) / 2 * h) + 'px';
  }
}
function init3D() {
  const host = $('#v3d');
  renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
  renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
  renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  host.appendChild(renderer.domElement);
  scene = new THREE.Scene(); scene.background = new THREE.Color('#0d1622');
  camera = new THREE.PerspectiveCamera(42, 1, .05, 300);
  scene.add(new THREE.HemisphereLight('#ffffff', '#3a4a5c', .72)); scene.add(new THREE.AmbientLight('#ffffff', .18));
  sun = new THREE.DirectionalLight('#fff6e8', .62); sun.castShadow = true; sun.shadow.mapSize.set(2048, 2048); sun.shadow.bias = -.0006; sun.shadow.radius = 3; scene.add(sun, sun.target);
  const grid = new THREE.GridHelper(60, 120, '#1e3a58', '#14263a'); grid.position.y = -.035; scene.add(grid);
  roomG = new THREE.Group(); itemsG = new THREE.Group(); helperG = new THREE.Group(); scene.add(roomG, itemsG, helperG);
  const resize = () => { const w = host.clientWidth, h = host.clientHeight; if (!w || !h) return; renderer.setSize(w, h); camera.aspect = w / h; camera.updateProjectionMatrix(); dirty = true; };
  new ResizeObserver(resize).observe(host); resize();
  bind3D(renderer.domElement);
  (function loop() { requestAnimationFrame(loop); if (!dirty || view !== '3d') return; dirty = false; renderer.render(scene, camera); placeLabels(); })();
}
function bind3D(cv) {
  const ray = new THREE.Raycaster(), ndc = new THREE.Vector2(), plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0), pts = new Map();
  let mode = null, last = null, moved = false, drag = null, pinch = 0;
  const setNdc = e => { const r = cv.getBoundingClientRect(); ndc.set((e.clientX - r.left) / r.width * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1); ray.setFromCamera(ndc, camera); };
  const floorPt = (zmm = 0) => { plane.constant = -zmm / 1000; const v = new THREE.Vector3(); return ray.ray.intersectPlane(plane, v) ? { x: (v.x + S.room.W / 2000) * 1000, y: (v.z + S.room.D / 2000) * 1000 } : null; };
  const pickOp = () => { const h = ray.intersectObjects(roomG.children.filter(o => o.visible), true)[0]; let o = h && h.object; while (o && o !== roomG && !o.userData.opId) o = o.parent; return o && o.userData.opId ? o.userData.opId : null; };
  const pickGizmo = () => { const h = ray.intersectObjects(helperG.children.filter(o => o.userData.gizmo), false)[0]; return h ? h.object.userData.gizmo : null; };
  const pick = () => { const h = ray.intersectObjects(itemsG.children, true)[0]; let o = h && h.object; while (o && !o.userData.id) o = o.parent; return o ? o.userData.id : null; };
  cv.addEventListener('contextmenu', e => e.preventDefault());
  cv.addEventListener('pointerdown', e => {
    cv.setPointerCapture(e.pointerId); pts.set(e.pointerId, [e.clientX, e.clientY]); moved = false; last = [e.clientX, e.clientY];
    if (pts.size === 2) { const [a, b] = [...pts.values()]; pinch = Math.hypot(a[0] - b[0], a[1] - b[1]); mode = 'pinch'; drag = null; return; }
    setNdc(e);
    const gz = e.button === 0 && !e.shiftKey ? pickGizmo() : null;
    if (gz) { const it = itemById(gz), p = floorPt(itemZ(it)); mode = 'rotate'; drag = { it, a0: p ? Math.atan2(p.y - it.y, p.x - it.x) : 0, r0: it.rot, started: false }; return; }
    const id = e.button === 0 && !e.shiftKey ? pick() : null;
    const oid = e.button === 0 && !e.shiftKey && !id ? pickOp() : null;
    if (id) { const it = itemById(id), p = floorPt(itemZ(it)); select({ kind: 'item', id }); mode = 'drag'; drag = { it, ox: p ? p.x - it.x : 0, oy: p ? p.y - it.y : 0, started: false }; }
    else if (oid) { const o = opById(oid); select({ kind: 'op', id: oid }); mode = 'opdrag'; drag = { o, o0: o.offset, p0: floorPt(0), started: false }; }
    else mode = (e.button === 2 || e.button === 1 || e.shiftKey) ? 'pan' : 'orbit';
  });
  cv.addEventListener('pointermove', e => {
    if (!pts.has(e.pointerId)) return;
    pts.set(e.pointerId, [e.clientX, e.clientY]);
    const dx = e.clientX - last[0], dy = e.clientY - last[1]; last = [e.clientX, e.clientY];
    if (Math.abs(dx) + Math.abs(dy) > 1) moved = true;
    if (mode === 'pinch' && pts.size === 2) { const [a, b] = [...pts.values()], d = Math.hypot(a[0] - b[0], a[1] - b[1]); cam.r = clamp(cam.r * pinch / (d || 1), 1, 60); pinch = d; updCam(); }
    else if (mode === 'orbit') { cam.th -= dx * .008; cam.ph = clamp(cam.ph - dy * .008, .02, 1.56); updCam(); }
    else if (mode === 'pan') {
      const k = cam.r * .0016, right = new THREE.Vector3().setFromMatrixColumn(camera.matrix, 0), fwd = new THREE.Vector3(-Math.sin(cam.th), 0, -Math.cos(cam.th));
      cam.tg.addScaledVector(right, -dx * k).addScaledVector(fwd, dy * k); updCam();
    } else if (mode === 'drag' && drag) {
      setNdc(e); const p = floorPt(itemZ(drag.it)); if (!p) return;
      if (!drag.started) { pushHist(); drag.started = true; }
      drag.it.x = p.x - drag.ox; drag.it.y = p.y - drag.oy; snapItem(drag.it); liveMove(drag.it);
    } else if (mode === 'rotate' && drag) {
      setNdc(e); const it = drag.it, p = floorPt(itemZ(it)); if (!p) return;
      if (!drag.started) { pushHist(); drag.started = true; }
      it.rot = snapRot(drag.r0 + (Math.atan2(p.y - it.y, p.x - it.x) - drag.a0) * 180 / Math.PI, e.shiftKey); liveMove(it);
    } else if (mode === 'opdrag' && drag && drag.p0) {
      setNdc(e); const p = floorPt(0); if (!p) return;
      if (!drag.started) { pushHist(); drag.started = true; }
      moveOp(drag.o, drag.o0 + ((drag.o.wall === 'N' || drag.o.wall === 'S') ? p.x - drag.p0.x : p.y - drag.p0.y)); buildRoom(); checks = runChecks(); buildHelpers(); renderInfo(); renderProps(true);
    }
  });
  const end = e => {
    pts.delete(e.pointerId);
    if (mode === 'orbit' && !moved) select(null);
    if ((mode === 'drag' || mode === 'rotate') && drag && drag.started) refresh();
    if (mode === 'opdrag' && drag && drag.started) refresh(true);
    if (!pts.size) { mode = null; drag = null; }
  };
  cv.addEventListener('pointerup', end); cv.addEventListener('pointercancel', end);
  cv.addEventListener('wheel', e => { e.preventDefault(); cam.r = clamp(cam.r * (1 + Math.sign(e.deltaY) * .1), 1, 60); updCam(); }, { passive: false });
}
function snapRot(r, free) { r = free ? Math.round(r) : Math.round(r / 15) * 15; return ((r % 360) + 360) % 360; }
function moveOp(o, off) { const s = S.set.snap; o.offset = clamp(Math.round(off / s) * s, 0, Math.max(0, wallLen(o.wall) - o.width)); }
function liveMove(it) {
  const g = itemsG.children.find(c => c.userData.id === it.id); if (g) placeItem(g, it);
  checks = runChecks(); buildHelpers(); renderPlan(); renderInfo(); renderProps(true);
}

/* ---------- 吸附 ---------- */
function snapItem(it) {
  const s = S.set.snap, { W, D } = S.room, mg = 80;
  it.x = Math.round(it.x / s) * s; it.y = Math.round(it.y / s) * s;
  let b = bbox(itemPoly(it));
  if (Math.abs(b.x0) < mg) it.x -= b.x0; else if (Math.abs(b.x1 - W) < mg) it.x -= b.x1 - W;
  if (Math.abs(b.y0) < mg) it.y -= b.y0; else if (Math.abs(b.y1 - D) < mg) it.y -= b.y1 - D;
  b = bbox(itemPoly(it));
  if (b.x1 - b.x0 <= W) { if (b.x0 < 0) it.x -= b.x0; if (b.x1 > W) it.x -= b.x1 - W; }
  if (b.y1 - b.y0 <= D) { if (b.y0 < 0) it.y -= b.y0; if (b.y1 > D) it.y -= b.y1 - D; }
  it.x = Math.round(it.x); it.y = Math.round(it.y);
}

/* ---------- 平面符號 ---------- */
function symbol(it) {
  const w = it.w, d = it.d, L = LIB[it.type], b = L.build, x0 = -w / 2, y0 = -d / 2, c = it.color;
  const R = (x, y, ww, hh, cls = 'ln', ex = '') => `<rect x="${x}" y="${y}" width="${Math.max(ww, 1)}" height="${Math.max(hh, 1)}" class="${cls}" ${ex}/>`;
  const Ln = (a, bb, cc, dd) => `<line x1="${a}" y1="${bb}" x2="${cc}" y2="${dd}" class="ln"/>`;
  const E = (cx, cy, rx, ry, cls = 'ln') => `<ellipse cx="${cx}" cy="${cy}" rx="${rx}" ry="${ry}" class="${cls}"/>`;
  const st = `style="--c:${c}"`;
  let s = '';
  if (ROUND_B[b]) s += `<ellipse cx="0" cy="0" rx="${w / 2}" ry="${d / 2}" class="body" ${st}/>`;
  else if (b === 'sofaL') { const d1 = Math.min(950, d * .6), cw = Math.min(950, w * .4); s += `<path d="M${x0} ${y0}H${w / 2}V${d / 2}H${w / 2 - cw}V${y0 + d1}H${x0}Z" class="body" ${st}/>` + R(x0, y0, w, 200) + R(x0, y0, 200, d1) + R(w / 2 - 200, y0, 200, d); }
  else s += R(x0, y0, w, d, 'body', st);
  switch (b) {
    case 'sofa': { const aw = Math.min(200, w * .14), n = L.seats || 1; s += R(x0, y0, w, 200) + R(x0, y0, aw, d) + R(w / 2 - aw, y0, aw, d); for (let i = 1; i < n; i++) { const x = x0 + aw + i * (w - 2 * aw) / n; s += Ln(x, y0 + 200, x, d / 2); } break; }
    case 'bed': { const n = w > 1300 ? 2 : 1, pw = (w - 200) / n - 50; s += R(x0, y0, w, 80); for (let i = 0; i < n; i++) s += R(x0 + 100 + (pw + 50) * i + 25, y0 + 130, pw, 380); s += Ln(x0, y0 + d * .36, w / 2, y0 + d * .36); break; }
    case 'chair': s += R(x0, y0, w, 50); break;
    case 'ochair': s += E(0, 30, w * .38, d * .36) + `<path d="M${-w * .36} ${y0 + 90}Q0 ${y0 - 10} ${w * .36} ${y0 + 90}" class="ln"/>`; break;
    case 'cabinet': s += Ln(x0, d / 2 - 30, w / 2, d / 2 - 30) + Ln(x0, y0, w / 2, d / 2 - 30) + Ln(w / 2, y0, x0, d / 2 - 30); break;
    case 'drawer': s += Ln(x0, d / 2 - 30, w / 2, d / 2 - 30) + Ln(x0, y0, w / 2, d / 2 - 30); break;
    case 'shelf': s += Ln(x0, d / 2 - 30, w / 2, d / 2 - 30); for (let i = 1; i < 4; i++) s += Ln(x0 + w * i / 4, y0, x0 + w * i / 4, d / 2 - 30); break;
    case 'tvstand': { const tw = Math.min(w * .8, 1450); s += R(-tw / 2, y0 + 100, tw, 40, 'dk'); break; }
    case 'kitchen': s += R(-w * .25 - 350, y0 + 90, 700, 420) + [[-170, -110], [170, -110], [-170, 110], [170, 110]].map(([a, bb]) => `<circle cx="${w * .25 + a}" cy="${bb + 10}" r="85" class="ln"/>`).join('') + Ln(x0, y0 + 350, w / 2, y0 + 350).replace('class="ln"', 'class="ln" stroke-dasharray="40 30"'); break;
    case 'fridge': s += Ln(x0, y0, w / 2, d / 2) + Ln(w / 2, y0, x0, d / 2); break;
    case 'island': s += R(x0 + 50, y0 + 50, w - 100, d - 200); break;
    case 'toilet': s += R(-w * .45, y0, w * .9, 180) + E(0, y0 + 180 + (d - 180) / 2, w * .42, (d - 180) / 2 * .95); break;
    case 'basin': s += E(0, 30, w * .28, d * .3); break;
    case 'shower': s += Ln(x0, y0, w / 2, d / 2) + Ln(w / 2, y0, x0, d / 2) + `<circle cx="0" cy="0" r="40" class="ln"/>`; break;
    case 'tub': s += `<rect x="${x0 + 60}" y="${y0 + 60}" width="${w - 120}" height="${d - 120}" rx="${Math.min(200, d / 3)}" class="ln"/>`; break;
    case 'plant': s += `<circle r="${w * .3}" class="ln"/><circle r="${w * .15}" class="ln"/>`; break;
    case 'lamp': s += `<circle r="${w * .18}" class="ln"/>` + Ln(-w / 2, 0, w / 2, 0) + Ln(0, -d / 2, 0, d / 2); break;
    case 'rug': s += `<rect x="${x0 + 80}" y="${y0 + 80}" width="${w - 160}" height="${d - 160}" class="ln" stroke-dasharray="30 30"/>`; break;
    case 'desk': case 'table': s += R(x0 + 40, y0 + 40, w - 80, d - 80); break;
    case 'workstation': s += R(x0, y0, w, 50, 'dk'); break;
    case 'ws4': s += R(x0, -25, w, 50, 'dk') + Ln(0, y0, 0, d / 2); break;
    case 'ldesk': s += R(x0, d / 2 - 750, w, 750) + R(x0, y0, 600, d - 750); break;
    case 'filecab': s += Ln(x0, d / 2 - 30, w / 2, d / 2 - 30) + Ln(x0, y0, w / 2, d / 2 - 30); break;
    case 'counter': s += R(x0, d / 2 - 60, w, 60, 'dk') + R(x0, d / 2 - 340, w, 340); break;
    case 'printer': s += R(x0 + 60, y0 + 60, w - 120, d - 200); break;
    case 'fan': { s += `<circle r="${w * .1}" class="ln"/>`; for (let i = 0; i < 5; i++) { const a = i * 2 * Math.PI / 5; s += Ln(Math.cos(a) * w * .1, Math.sin(a) * w * .1, Math.cos(a) * w * .48, Math.sin(a) * w * .48); } break; }
    case 'clight': case 'dlight': case 'pendant': s += `<circle r="${w * .25}" class="ln"/>` + Ln(-w * .4, 0, w * .4, 0) + Ln(0, -d * .4, 0, d * .4); break;
    case 'lpanel': s += Ln(x0, y0, w / 2, d / 2) + Ln(w / 2, y0, x0, d / 2); break;
    case 'cassette': s += R(-w * .31, -d * .31, w * .62, d * .62) + R(-w * .15, -d * .15, w * .3, d * .3); break;
    case 'projector': s += `<circle cx="${-w * .25}" cy="${d / 2 - 40}" r="40" class="ln"/>`; break;
    case 'splitac': s += Ln(x0, d / 2 - 40, w / 2, d / 2 - 40); break;
    case 'curtain': { let pth = `M${x0} 0`; const n = Math.max(4, Math.round(w / 120)); for (let i = 1; i <= n; i++) pth += `L${x0 + w * i / n} ${i % 2 ? -d * .35 : d * .35}`; s += `<path d="${pth}" class="ln"/>`; break; }
  }
  return s;
}

/* ---------- 平面配置圖 ---------- */
const svg = $('#plan');
function dim(x1, y1, x2, y2, label, cls = '') {
  const fs = Math.max(S.room.W, S.room.D) / 48, len = Math.hypot(x2 - x1, y2 - y1); if (len < 1) return '';
  const ux = (x2 - x1) / len, uy = (y2 - y1) / len, nx = -uy * fs * .45, ny = ux * fs * .45;
  const mx = (x1 + x2) / 2, my = (y1 + y2) / 2, tw = String(label).length * fs * .62 + fs * .7;
  return `<g class="dim ${cls}"><line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}"/><line x1="${x1 - nx}" y1="${y1 - ny}" x2="${x1 + nx}" y2="${y1 + ny}"/><line x1="${x2 - nx}" y1="${y2 - ny}" x2="${x2 + nx}" y2="${y2 + ny}"/>` +
    `<rect x="${mx - tw / 2}" y="${my - fs * .72}" width="${tw}" height="${fs * 1.44}" rx="${fs * .3}"/><text x="${mx}" y="${my + fs * .36}" font-size="${fs}" text-anchor="middle">${label}</text></g>`;
}
let PRINT = false;
function renderPlan(force) {
  if (view !== 'plan' && !force) return;
  const { W, D, T } = S.room, fs = Math.max(W, D) / 48, M = T + fs * (PRINT ? 8.5 : 5.5);
  svg.setAttribute('viewBox', `${-M} ${-M} ${W + 2 * M} ${D + 2 * M}`);
  let h = `<rect class="floor" x="0" y="0" width="${W}" height="${D}"/>`;
  for (let x = 500; x < W; x += 500) h += `<line class="gridl" x1="${x}" y1="0" x2="${x}" y2="${D}"/>`;
  for (let y = 500; y < D; y += 500) h += `<line class="gridl" x1="0" y1="${y}" x2="${W}" y2="${y}"/>`;
  h += `<path class="wall" fill-rule="evenodd" d="M${-T} ${-T}H${W + T}V${D + T}H${-T}Z M0 0V${D}H${W}V0Z"/>`;
  let ops = '';
  for (const o of S.openings) {
    const sp = wallSpan(o), isS = sel && sel.kind === 'op' && sel.id === o.id;
    const rx = sp.along === 'x' ? [o.offset, o.offset + o.width] : null;
    const box = sp.along === 'x' ? { x: o.offset, y: o.wall === 'N' ? -T : D, w: o.width, h: T } : { x: o.wall === 'W' ? -T : W, y: o.offset, w: T, h: o.width };
    h += `<rect class="cut" x="${box.x}" y="${box.y}" width="${box.w}" height="${box.h}"/>`;
    const hg = sp.hinge, n = sp.nIn, dv = sp.dir, w = o.width;
    if (o.kind === 'door') {
      const p1 = [hg[0] + dv[0] * w, hg[1] + dv[1] * w], p2 = [hg[0] + n[0] * w, hg[1] + n[1] * w], sw = (dv[0] * n[1] - dv[1] * n[0]) > 0 ? 1 : 0;
      ops += `<path class="swing" d="M${hg[0]} ${hg[1]}L${p1[0]} ${p1[1]}A${w} ${w} 0 0 ${sw} ${p2[0]} ${p2[1]}Z"/><path class="op" d="M${hg[0]} ${hg[1]}L${p2[0]} ${p2[1]}M${p1[0]} ${p1[1]}A${w} ${w} 0 0 ${sw} ${p2[0]} ${p2[1]}"/>`;
    } else if (o.kind === 'window') {
      for (const f of [.15, .5, .85]) { const ox = -n[0] * T * f, oy = -n[1] * T * f; ops += `<line class="opwin" x1="${hg[0] + ox}" y1="${hg[1] + oy}" x2="${hg[0] + dv[0] * w + ox}" y2="${hg[1] + dv[1] * w + oy}"/>`; }
    } else if (o.kind === 'slide') {
      for (const [f, a, bb] of [[-.3, 0, .55], [-.7, .45, 1]]) ops += `<line class="op" x1="${hg[0] + dv[0] * w * a + n[0] * T * f}" y1="${hg[1] + dv[1] * w * a + n[1] * T * f}" x2="${hg[0] + dv[0] * w * bb + n[0] * T * f}" y2="${hg[1] + dv[1] * w * bb + n[1] * T * f}"/>`;
    }
    ops += `<rect class="op-hit ${isS ? 'sel' : ''}" data-op="${o.id}" x="${box.x - (sp.along === 'y' ? 60 : 0)}" y="${box.y - (sp.along === 'x' ? 60 : 0)}" width="${box.w + (sp.along === 'y' ? 120 : 0)}" height="${box.h + (sp.along === 'x' ? 120 : 0)}"/>`;
    if (isS && !PRINT) {
      const L = wallLen(o.wall), g = fs * 2.4;
      if (sp.along === 'x') { const y = o.wall === 'N' ? -T - g : D + T + g; h += dim(0, y, o.offset, y, fmt(o.offset), 'o') + dim(o.offset, y, o.offset + o.width, y, OPK[o.kind] + ' ' + fmt(o.width), 'o') + dim(o.offset + o.width, y, L, y, fmt(L - o.offset - o.width), 'o'); }
      else { const x = o.wall === 'W' ? -T - g : W + T + g; h += dim(x, 0, x, o.offset, fmt(o.offset), 'o') + dim(x, o.offset, x, o.offset + o.width, fmt(o.width), 'o') + dim(x, o.offset + o.width, x, L, fmt(L - o.offset - o.width), 'o'); }
    }
  }
  h += ops;
  if (PRINT) for (const wk of ['N', 'S', 'W', 'E']) {
    const os = S.openings.filter(o => o.wall === wk).sort((a, b) => a.offset - b.offset); if (!os.length) continue;
    const L = wallLen(wk), g = fs * 2.4, cuts = [0]; os.forEach(o => cuts.push(o.offset, o.offset + o.width)); cuts.push(L);
    for (let i = 0; i < cuts.length - 1; i++) {
      const a = cuts[i], b = cuts[i + 1]; if (b - a < 1) continue; const lab = i % 2 ? OPK[os[(i - 1) / 2].kind] + ' ' + fmt(b - a) : fmt(b - a);
      if (wk === 'N') h += dim(a, -T - g * 2.2, b, -T - g * 2.2, lab, i % 2 ? 'o' : '');
      else if (wk === 'S') h += dim(a, D + T + g * 2.2, b, D + T + g * 2.2, lab, i % 2 ? 'o' : '');
      else if (wk === 'W') h += dim(-T - g * 2.2, a, -T - g * 2.2, b, lab, i % 2 ? 'o' : '');
      else h += dim(W + T + g * 2.2, a, W + T + g * 2.2, b, lab, i % 2 ? 'o' : '');
    }
  }
  const lay = it => LIB[it.type].flat ? 0 : LIB[it.type].mount === 'ceiling' ? 3 : LIB[it.type].mount === 'wall' ? 2 : 1;
  const isC = it => LIB[it.type].mount === 'ceiling';
  const items = [...S.items].filter(it => PRINT === 'floor' ? !isC(it) : PRINT === 'ceil' ? isC(it) : (S.set.ceilLayer || !isC(it))).sort((a, b) => lay(a) - lay(b));
  const sIt = sel && sel.kind === 'item' ? itemById(sel.id) : null;
  if (sIt && LIB[sIt.type].front) { const L = LIB[sIt.type], z = itemPoly(sIt, { x0: -sIt.w / 2, x1: sIt.w / 2, y0: sIt.d / 2, y1: sIt.d / 2 + L.front }); h += `<path class="zone" d="M${z.map(p => p.join(' ')).join('L')}Z"/>`; }
  let txt = '';
  for (const it of items) {
    const f = checks.flags[it.id], cls = (sIt && sIt.id === it.id ? 'sel ' : '') + (f === 'bad' ? 'bad' : f === 'warn' ? 'warn' : '') + (LIB[it.type].mount === 'ceiling' ? ' ceil' : LIB[it.type].mount === 'wall' ? ' wallm' : '') + (it.lock ? ' lock' : '');
    h += `<g class="it sym ${cls}" data-item="${it.id}" transform="translate(${it.x} ${it.y}) rotate(${it.rot})">${symbol(it)}</g>`;
    const tf = Math.min(fs * .82, Math.max(fs * .5, Math.min(it.w, it.d) / 4.2));
    if (Math.min(it.w, it.d) >= 300 && !LIB[it.type].flat) txt += `<text x="${it.x}" y="${it.y + tf * .35}" font-size="${tf}" text-anchor="middle" pointer-events="none">${esc(it.name)}</text>`;
    if (PRINT && Math.min(it.w, it.d) >= 300 && !LIB[it.type].flat) txt += `<text x="${it.x}" y="${it.y + tf * 1.45}" font-size="${tf * .8}" text-anchor="middle" pointer-events="none">${it.w}×${it.d}×${it.h}</text>`;
  }
  h += txt;
  const g1 = T + fs * 2.4;
  h += dim(0, -g1, W, -g1, `W ${fmt(W)}`, 'a') + dim(-g1, 0, -g1, D, `D ${fmt(D)}`, 'a');
  if (sIt) {
    const b = bbox(itemPoly(sIt)), cx = (b.x0 + b.x1) / 2, cy = (b.y0 + b.y1) / 2;
    if (b.x0 > 1) h += dim(0, cy, b.x0, cy, fmt(b.x0), 'o'); if (W - b.x1 > 1) h += dim(b.x1, cy, W, cy, fmt(W - b.x1), 'o');
    if (b.y0 > 1) h += dim(cx, 0, cx, b.y0, fmt(b.y0), 'o'); if (D - b.y1 > 1) h += dim(cx, b.y1, cx, D, fmt(D - b.y1), 'o');
    h += dim(b.x0, D + g1, b.x1, D + g1, fmt(b.x1 - b.x0), 'o') + dim(W + g1, b.y0, W + g1, b.y1, fmt(b.y1 - b.y0), 'o');
    if (!PRINT && (S.set.ceilLayer || LIB[sIt.type].mount !== 'ceiling')) { // 旋轉把手
      const r = rad(sIt.rot), hl = sIt.d / 2 + fs * 2.4, ex = sIt.x + sIt.d / 2 * Math.sin(r), ey = sIt.y - sIt.d / 2 * Math.cos(r), hx = sIt.x + hl * Math.sin(r), hy = sIt.y - hl * Math.cos(r);
      h += `<line class="rot-l" x1="${ex}" y1="${ey}" x2="${hx}" y2="${hy}"/><circle class="rot-h" data-rot="${sIt.id}" cx="${hx}" cy="${hy}" r="${fs * .75}"><title>拖曳旋轉（Shift 為 1°）</title></circle><text x="${hx + fs * 1.1}" y="${hy + fs * .35}" font-size="${fs * .9}" pointer-events="none">${sIt.rot}°</text>`;
    }
  }
  svg.innerHTML = h;
}
function toPlan(e) { const p = svg.createSVGPoint(); p.x = e.clientX; p.y = e.clientY; const m = svg.getScreenCTM(); return m ? p.matrixTransform(m.inverse()) : { x: 0, y: 0 }; }
function bindPlan() {
  let drag = null;
  svg.addEventListener('pointerdown', e => {
    const t = e.target.closest('[data-rot],[data-item],[data-op]'), p = toPlan(e);
    if (t && t.dataset.rot) { const it = itemById(t.dataset.rot); drag = { k: 'rot', it }; }
    else if (t && t.dataset.item) { const it = itemById(t.dataset.item); select({ kind: 'item', id: it.id }); drag = { k: 'item', it, ox: p.x - it.x, oy: p.y - it.y }; }
    else if (t && t.dataset.op) { const o = opById(t.dataset.op); select({ kind: 'op', id: o.id }); drag = { k: 'op', o, o0: o.offset, p0: p }; }
    else { select(null); return; }
    svg.setPointerCapture(e.pointerId); drag.started = false;
  });
  svg.addEventListener('pointermove', e => {
    if (!drag) return; const p = toPlan(e);
    if (!drag.started) { pushHist(); drag.started = true; }
    if (drag.k === 'item') { drag.it.x = p.x - drag.ox; drag.it.y = p.y - drag.oy; snapItem(drag.it); liveMove(drag.it); }
    else if (drag.k === 'rot') { const it = drag.it; it.rot = snapRot(Math.atan2(p.y - it.y, p.x - it.x) * 180 / Math.PI + 90, e.shiftKey); liveMove(it); }
    else {
      const o = drag.o; moveOp(o, drag.o0 + ((o.wall === 'N' || o.wall === 'S') ? p.x - drag.p0.x : p.y - drag.p0.y)); checks = runChecks(); renderPlan(); renderInfo(); renderProps(true);
    }
  });
  const end = () => { if (drag && drag.started) refresh(drag.k === 'op'); else if (drag && drag.k === 'rot') renderPlan(); drag = null; };
  svg.addEventListener('pointerup', end); svg.addEventListener('pointercancel', end);
}

/* ---------- UI ---------- */
function select(s) { sel = s; if (itemsG) buildHelpers(); renderPlan(); renderProps(); renderBottom(); }
function libTiles() {
  $('#cats').innerHTML = CATS.map(([k, n]) => `<button type="button" class="cat ${k === curCat ? 'on' : ''}" data-cat="${k}">${n}</button>`).join('');
  $('#lib').innerHTML = Object.entries(LIB).filter(([, L]) => L.cat === curCat).map(([k, L]) => {
    const it = { type: k, w: L.w, d: L.d, color: L.color }, m = Math.max(L.w, L.d) * .1;
    return `<button type="button" class="tile" data-add="${k}" title="加入 ${L.name}"><svg viewBox="${-L.w / 2 - m} ${-L.d / 2 - m} ${L.w + 2 * m} ${L.d + 2 * m}" class="sym">${symbol(it)}</svg><span>${L.name}</span><small>${L.w}×${L.d}×${L.h}</small></button>`;
  }).join('');
}
function addItem(type) {
  pushHist();
  const L = LIB[type], { W, D } = S.room;
  const it = mkItem(type, W / 2, D / 2, 0);
  if (L.mount === 'wall') { it.y = L.d / 2; snapItem(it); S.items.push(it); sel = { kind: 'item', id: it.id }; refresh(); toast('壁掛物件已放在北牆，可用「靠牆」按鈕換牆或拖曳移動。'); return; }
  const free = (x, y) => { it.x = x; it.y = y; const p = itemPoly(it); return !S.items.some(o => !LIB[o.type].flat && zOv(it, o) && overlap(p, itemPoly(o))); };
  let ok = L.flat || free(W / 2, D / 2);
  for (let r = 300; !ok && r < Math.max(W, D); r += 300) for (let a = 0; a < 16 && !ok; a++) { const x = W / 2 + Math.cos(a * Math.PI / 8) * r, y = D / 2 + Math.sin(a * Math.PI / 8) * r; if (x > L.w / 2 && x < W - L.w / 2 && y > L.d / 2 && y < D - L.d / 2) ok = free(x, y); }
  if (!ok) { it.x = W / 2; it.y = D / 2; }
  snapItem(it); S.items.push(it); sel = { kind: 'item', id: it.id }; refresh();
}
function renderProps(soft) {
  const host = $('#props'), o = findSel();
  if (soft && host.contains(document.activeElement) && document.activeElement.tagName === 'INPUT') { // 拖曳中只更新數值
    host.querySelectorAll('[data-k]').forEach(el => { if (el !== document.activeElement && o && el.dataset.k in o && el.type === 'number') el.value = Math.round(o[el.dataset.k]); }); return;
  }
  if (!sel || !o) {
    const c = calc();
    host.innerHTML = `<h3>選取物件屬性</h3><p class="note">點選 3D 或平面圖中的家具即可修改尺寸、位置、角度、顏色與單價。<br>快捷鍵：<b>R</b> 旋轉 90°、<b>Q／E</b> 旋轉 15°（Shift 1°）、<b>方向鍵</b> 微調、<b>Delete</b> 刪除、<b>Ctrl+D</b> 複製、<b>Ctrl+Z</b> 復原。</p>
      <div class="card"><div class="kv"><span>室內面積</span><b>${fx(c.A)} m²・${fx(c.ping)} 坪</b></div><div class="kv"><span>家具佔地</span><b>${fx(c.foot)} m²（${fx(c.foot / c.A * 100, 1)}%）</b></div><div class="kv"><span>建議佔地率</span><b>≤ 35–40%</b></div></div>`;
    return;
  }
  if (sel.kind === 'item') {
    const it = o, L = LIB[it.type], chi = L.pricing === 'chi';
    host.innerHTML = `<h3>家具屬性・${esc(L.name)}</h3>
    <label class="f"><span>名稱</span><input data-k="name" type="text" id="p-name" value="${esc(it.name)}"></label>
    <div class="grid2">
      <label class="f"><span>寬 W</span><input data-k="w" id="p-w" type="number" step="10" min="50" value="${it.w}"></label>
      <label class="f"><span>深 D</span><input data-k="d" id="p-d" type="number" step="10" min="10" value="${it.d}"></label>
      <label class="f"><span>高 H</span><input data-k="h" id="p-h" type="number" step="10" min="5" value="${it.h}"></label>
      <label class="f"><span>X 中心</span><input data-k="x" id="p-x" type="number" step="10" value="${Math.round(it.x)}"></label>
      <label class="f"><span>Y 中心</span><input data-k="y" id="p-y" type="number" step="10" value="${Math.round(it.y)}"></label>
      <label class="f"><span>角度 °</span><input data-k="rot" id="p-rot" type="number" step="1" value="${it.rot}"></label>
    </div>
    <label class="f"><span>手動轉向（拖曳滑桿；平面圖拖橘色把手；3D 拖橘色圓環）</span><input type="range" id="p-rotr" data-k="rot" min="0" max="359" step="1" value="${it.rot}"></label>
    ${L.mount === 'wall' ? `<label class="f"><span>離地高 Z（下緣）</span><input data-k="z" id="p-z" type="number" step="10" min="0" value="${it.z || 0}"></label>` : ''}
    ${L.mount === 'ceiling' ? `<p class="note">吊掛於天花（${fmt(S.room.H)}），下緣離地 <b>${fmt(S.room.H - it.h)} mm</b>${L.fan ? '；吊扇葉片離地需 ≥ 2100、距牆 ≥ 450 mm' : ''}。改「高 H」可調整吊桿長度。</p>` : ''}
    ${L.lm ? `<label class="f"><span>光通量 lm</span><input data-k="lm" id="p-lm" type="number" step="100" value="${it.lm || L.lm}"></label>` : ''}
    <label class="chk"><input type="checkbox" data-k="lock" id="p-lock" ${it.lock ? 'checked' : ''}>鎖定位置（一鍵優化時不移動）</label>
    <div class="row"><button class="btn sm" data-act="rot-90" type="button">⟲ 90°</button><button class="btn sm" data-act="rot90" type="button">⟳ 90°</button><button class="btn sm" data-act="rot-15" type="button">⟲ 15°</button><button class="btn sm" data-act="rot15" type="button">⟳ 15°</button></div>
    <div class="row"><span class="note">靠牆：</span><button class="btn sm" data-act="wN" type="button">北</button><button class="btn sm" data-act="wS" type="button">南</button><button class="btn sm" data-act="wW" type="button">西</button><button class="btn sm" data-act="wE" type="button">東</button><button class="btn sm" data-act="cx" type="button">左右置中</button><button class="btn sm" data-act="cy" type="button">上下置中</button></div>
    <div class="f"><span>顏色／材質</span><div class="sw-row">${ITEM_COLORS.map(c => `<button type="button" class="sw ${c === it.color ? 'on' : ''}" style="background:${c}" data-color="${c}" aria-label="顏色 ${c}"></button>`).join('')}<input type="color" id="p-color" data-k="color" value="${it.color}" aria-label="自訂顏色"></div></div>
    ${chi ? `<div class="grid2"><label class="f"><span>每尺單價</span><input data-k="chiPrice" id="p-chi" type="number" step="100" value="${it.chiPrice}"></label><div class="f"><span>尺數</span><b style="font-family:var(--mono);padding:6px 0">${chis(it.w)} 尺</b></div><div class="f"><span>小計</span><b style="font-family:var(--mono);padding:6px 0;color:var(--ok)">${fmt(itemPrice(it))}</b></div></div><p class="note">系統櫃以寬度換算台尺（30.3 cm，進位到 0.5 尺）× 每尺單價 × 高度係數（H ÷ ${L.h}）。</p>`
      : `<label class="f"><span>單價 NT$</span><input data-k="price" id="p-price" type="number" step="100" value="${it.price}"></label>`}
    ${L.front ? `<p class="note">前方需保留 <b>${L.front} mm</b> 操作空間（平面圖藍色虛線區）。</p>` : ''}
    <div class="row"><button class="btn sm" data-act="dup" type="button">複製</button><button class="btn sm danger" data-act="del" type="button">刪除</button></div>`;
  } else {
    const op = o;
    host.innerHTML = `<h3>門窗屬性</h3>
    <div class="grid2">
      <label class="f"><span>類型</span><select data-k="kind" id="p-kind">${Object.entries(OPK).map(([k, n]) => `<option value="${k}" ${k === op.kind ? 'selected' : ''}>${n}</option>`).join('')}</select></label>
      <label class="f"><span>牆面</span><select data-k="wall" id="p-wall">${Object.entries(WALLN).map(([k, n]) => `<option value="${k}" ${k === op.wall ? 'selected' : ''}>${n}</option>`).join('')}</select></label>
      <label class="f"><span>距牆起點</span><input data-k="offset" id="p-off" type="number" step="10" value="${op.offset}"></label>
      <label class="f"><span>寬</span><input data-k="width" id="p-ow" type="number" step="10" value="${op.width}"></label>
      <label class="f"><span>高</span><input data-k="height" id="p-oh" type="number" step="10" value="${op.height}"></label>
      <label class="f"><span>窗台高</span><input data-k="sill" id="p-sill" type="number" step="10" value="${op.sill}" ${op.kind === 'window' ? '' : 'disabled'}></label>
    </div>
    <div class="row"><button class="btn sm" data-act="op-" type="button">◀ 移 ${S.set.snap}</button><button class="btn sm" data-act="op+" type="button">移 ${S.set.snap} ▶</button><button class="btn sm" data-act="opc" type="button">置中於牆</button></div>
    <p class="note">北／南牆由西往東量，西／東牆由北往南量。門片以起點為鉸鏈、向室內開。在平面圖或 3D 中可直接拖曳門窗沿牆移動，調整後按「一鍵優化配置」重新排家具。</p>
    <div class="row"><button class="btn sm danger" data-act="del" type="button">刪除</button></div>`;
  }
}
function onProp(e) {
  const el = e.target, k = el.dataset.k, o = findSel(); if (!k || !o) return;
  if (el.type !== 'range') pushHist();
  let v = el.type === 'checkbox' ? el.checked : (el.type === 'number' || el.type === 'range') ? Number(el.value) : el.value;
  if (el.type === 'number' && !isFinite(v)) return;
  if (sel.kind === 'item') {
    if (['w', 'd', 'h'].includes(k)) v = Math.max(10, v);
    if (k === 'rot') v = ((v % 360) + 360) % 360;
    o[k] = v;
  } else {
    o[k] = v; if (k === 'kind') { if (v === 'window') { o.sill = o.sill || 900; o.height = Math.min(o.height, 1500); } else { o.sill = 0; o.height = Math.max(o.height, 2000); } }
    o.offset = clamp(o.offset, 0, Math.max(0, wallLen(o.wall) - o.width));
  }
  refresh(sel.kind === 'op');
}
function onAct(a) {
  const o = findSel(); if (!o) return;
  if (a === 'del') { pushHist(); if (sel.kind === 'item') S.items = S.items.filter(i => i !== o); else S.openings = S.openings.filter(i => i !== o); sel = null; refresh(true); return; }
  if (sel.kind === 'op') {
    if (!a.startsWith('op')) return; pushHist();
    if (a === 'opc') o.offset = Math.max(0, Math.round((wallLen(o.wall) - o.width) / 2)); else moveOp(o, o.offset + (a === 'op+' ? 1 : -1) * S.set.snap);
    refresh(true); return;
  }
  pushHist();
  const it = o, { W, D } = S.room;
  if (a.startsWith('rot')) { it.rot = ((it.rot + Number(a.slice(3))) % 360 + 360) % 360; }
  else if (a === 'dup') { const c = Object.assign({}, it, { id: nid('i'), x: it.x + 200, y: it.y + 200 }); snapItem(c); S.items.push(c); sel = { kind: 'item', id: c.id }; refresh(); return; }
  else if (a[0] === 'w') {
    const side = a[1]; it.rot = { N: 0, S: 180, W: 270, E: 90 }[side];
    const b = bbox(itemPoly(it)), hw = (b.x1 - b.x0) / 2, hd = (b.y1 - b.y0) / 2;
    if (side === 'N') it.y = hd; if (side === 'S') it.y = D - hd; if (side === 'W') it.x = hw; if (side === 'E') it.x = W - hw;
  } else if (a === 'cx') it.x = W / 2; else if (a === 'cy') it.y = D / 2;
  if (a.startsWith('rot')) snapItem(it);
  refresh();
}
function addOp(kind) {
  pushHist();
  const wall = $('#opWall').value, L = wallLen(wall);
  const w = kind === 'window' ? 1500 : kind === 'slide' ? 1600 : kind === 'open' ? 1200 : 900;
  const o = mkOp(kind, wall, Math.max(0, Math.round((L - w) / 2 / 10) * 10), Math.min(w, L), kind === 'window' ? 1400 : 2100, kind === 'window' ? 900 : 0);
  S.openings.push(o); sel = { kind: 'op', id: o.id }; refresh(true);
}

function renderInfo() {
  const c = calc(), r = S.room, nErr = checks.list.filter(x => x.lv === 'err').length, nW = checks.list.length - nErr;
  $('#info').innerHTML = `<b>${fmt(r.W)} × ${fmt(r.D)} × ${fmt(r.H)}</b> mm（${ROOMTYPES[r.type][0]}）<br>面積 <b>${fx(c.A)}</b> m²・<b>${fx(c.ping)}</b> 坪　地板 ${c.fl.name}<br>家具 <b>${S.items.length}</b> 件・佔地 <b>${fx(c.foot / c.A * 100, 1)}%</b>　門窗 <b>${S.openings.length}</b><br>檢查 ${nErr ? `<span class="pill err">干涉 ${nErr}</span>` : ''} ${nW ? `<span class="pill warn">注意 ${nW}</span>` : ''} ${!checks.list.length ? '<span class="pill ok">全部通過</span>' : ''}　含稅估價 <b style="color:var(--ok)">${money(c.total)}</b>`;
  $('#summary').innerHTML = `<span>面積 <b>${fx(c.A)}</b> m² ｜ <b>${fx(c.ping)}</b> 坪</span><span>家具 <b>${S.items.length}</b> 件</span><span>工程 <b>${money(c.eng)}</b></span><span>含稅估價 <b class="tot">${money(c.total)}</b></span>`;
}
function renderBottom() {
  const host = $('#bottomBody'), c = calc(), P = S.prices;
  if (btab === 'bom') {
    const rows = S.items.map((it, i) => {
      const L = LIB[it.type], chi = L.pricing === 'chi', on = sel && sel.kind === 'item' && sel.id === it.id;
      return `<tr class="click ${on ? 'on' : ''}" data-sel="${it.id}"><td>${i + 1}</td><td>${esc(it.name)}</td><td>${CATS.find(x => x[0] === L.cat)[1]}</td><td class="n">${it.w} × ${it.d} × ${it.h}</td><td class="n">${fmt(itemZ(it))}</td><td class="n">${fmt(it.x)}, ${fmt(it.y)}</td><td class="n">${it.rot}°</td><td><span class="dot" style="background:${it.color}"></span>${it.color}</td><td>${chi ? `${chis(it.w)} 尺 × ${fmt(it.chiPrice)}` : '件'}</td><td class="n">${fmt(itemPrice(it))}</td><td>${checks.flags[it.id] === 'bad' ? '<span class="pill err">干涉</span>' : checks.flags[it.id] ? '<span class="pill warn">注意</span>' : '<span class="pill ok">OK</span>'}</td></tr>`;
    }).join('');
    host.innerHTML = `<div class="tbl-wrap"><table><thead><tr><th>#</th><th>品名</th><th>類別</th><th class="n">尺寸 W×D×H mm</th><th class="n">離地 Z</th><th class="n">中心 X, Y</th><th class="n">角度</th><th>顏色</th><th>計價</th><th class="n">小計 NT$</th><th>檢查</th></tr></thead><tbody>${rows || '<tr><td colspan="11" class="note">尚未加入家具，從右側家具庫點選加入。</td></tr>'}</tbody><tfoot><tr><td colspan="9">合計 ${S.items.length} 件・佔地 ${fx(c.foot)} m²</td><td class="n">${fmt(c.furn)}</td><td></td></tr></tfoot></table></div>`;
  } else if (btab === 'mat') {
    const r = S.room, fl = c.fl;
    host.innerHTML = `<div class="calc-grid">
      <div class="card"><h4>地板</h4><div class="kv"><span>室內淨面積</span><b>${fx(c.A)} m²（${fx(c.ping)} 坪）</b></div><div class="kv"><span>損耗率</span><b>${Math.round(fl.waste * 100)}%</b></div><div class="kv"><span>叫料面積</span><b>${fx(c.needPing)} 坪</b></div>${fl.pat === 'tile' ? `<div class="kv"><span>磁磚片數 ${fl.ts}×${fl.ts}</span><b>${fmt(c.tiles)} 片</b></div>` : ''}<label class="kv"><span>單價（元／坪，含工）</span><input type="number" step="100" data-price="floor" id="pr-floor" value="${P.floor[r.floor]}"></label></div>
      <div class="card"><h4>牆面油漆</h4><div class="kv"><span>周長</span><b>${fx(c.perim)} m</b></div><div class="kv"><span>門窗開口扣除</span><b>${fx(c.openA)} m²</b></div><div class="kv"><span>牆面積</span><b>${fx(c.wallA)} m²</b></div><div class="kv"><span>牆＋天花</span><b>${fx(c.paintA)} m²（${fx(c.paintPing)} 坪）</b></div><div class="kv"><span>乳膠漆用量（2 度、10 m²/L）</span><b>${fx(c.paintL, 1)} L（約 ${Math.ceil(c.paintL / 3.785)} 加侖）</b></div><label class="kv"><span>單價（元／坪）</span><input type="number" step="50" data-price="paint" id="pr-paint" value="${P.paint}"></label></div>
      <div class="card"><h4>天花板・踢腳板</h4><div class="kv"><span>天花板</span><b>${fx(c.ceilPing)} 坪</b></div><label class="kv"><span>${r.ceiling === 'grid' ? '輕鋼架' : '平釘'}天花單價（元／坪）</span><input type="number" step="100" data-price="${r.ceiling === 'grid' ? 'ceilGrid' : 'ceiling'}" id="pr-ceil" value="${r.ceiling === 'grid' ? P.ceilGrid : P.ceiling}"></label><div class="kv"><span>踢腳板長度</span><b>${fx(c.skirt)} m</b></div><label class="kv"><span>踢腳板單價（元／m）</span><input type="number" step="10" data-price="skirting" id="pr-skirt" value="${P.skirting}"></label></div>
      <div class="card"><h4>照明計算（流明法）</h4><div class="kv"><span>目標照度（${ROOMTYPES[r.type][0]}）</span><b>${c.lux} lx</b></div><div class="kv"><span>所需光通量 = E×A ÷ (CU 0.6 × MF 0.8)</span><b>${fmt(c.lumens)} lm</b></div><label class="kv"><span>單盞流明 lm</span><input type="number" step="100" id="pr-lm" data-room="lm" value="${r.lm}"></label><div class="kv"><span>建議燈具數</span><b>${c.lights} 盞（約 ${Math.round(c.lights * r.lm / 95)} W LED）</b></div>${c.pl.length ? `<div class="kv"><span>已配置燈具</span><b>${c.pl.length} 盞・${fmt(c.plm)} lm・約 ${Math.round(c.plLux)} lx</b></div>` : ''}<label class="kv"><span>燈具單價（元／盞）</span><input type="number" step="100" data-price="light" id="pr-light" value="${P.light}"></label></div>
      <div class="card"><h4>空調能力估算</h4><div class="kv"><span>基準 450 kcal/h・坪</span><b>${fmt(c.kcal)} kcal/h</b></div><div class="kv"><span>換算</span><b>${fx(c.kw)} kW</b></div><div class="row"><label class="chk"><input type="checkbox" id="pr-west" data-room="west" ${r.west ? 'checked' : ''}>西曬 ×1.2</label><label class="chk"><input type="checkbox" id="pr-top" data-room="top" ${r.top ? 'checked' : ''}>頂樓 ×1.15</label></div><div class="kv"><span>建議機型</span><b class="big">${c.acKw} kW</b></div>${c.pac.length ? `<div class="kv"><span>已配置冷氣</span><b>${c.pac.length} 台・${fx(c.pkw, 1)} kW</b></div>` : ''}<label class="kv"><span>單價（元／kW，含安裝）</span><input type="number" step="100" data-price="acKw" id="pr-ac" value="${P.acKw}"></label></div>
    </div>`;
  } else if (btab === 'cab') {
    const cl = cutList();
    const rows = cl.parts.map(p => `<tr class="click" data-sel="${p.id}"><td>${esc(p.tag)}</td><td>${p.part}</td><td class="n">${fmt(p.a)}</td><td class="n">${fmt(p.b)}</td><td class="n">${p.th}</td><td class="n">${p.n}</td><td class="n">${fx(p.a * p.b * p.n / 1e6, 3)}</td><td>${p.th === 8 ? '背板 8t' : p.th === 15 ? '抽屜板 15t' : 'E1 塑合板 18t・四邊封邊'}</td></tr>`).join('');
    const cost = cl.s18 * P.board + cl.s8 * P.back + cl.hinge * P.hinge + cl.handle * P.handle + cl.slide * P.slide;
    host.innerHTML = cl.parts.length ? `<div class="calc-grid">
      <div class="card"><h4>板材用量（4×8 尺 1220×2440）</h4><div class="kv"><span>18／15 mm 板面積</span><b>${fx(cl.a18)} m² → ${cl.s18} 張（利用率 82%）</b></div><div class="kv"><span>8 mm 背板面積</span><b>${fx(cl.a8)} m² → ${cl.s8} 張</b></div><div class="kv"><span>封邊條長度</span><b>${fx(cl.edge, 1)} m</b></div></div>
      <div class="card"><h4>五金配件</h4><div class="kv"><span>緩衝鉸鏈</span><b>${cl.hinge} 組</b></div><div class="kv"><span>把手</span><b>${cl.handle} 支</b></div><div class="kv"><span>三節滑軌</span><b>${cl.slide} 副</b></div></div>
      <div class="card"><h4>板材＋五金材料費（參考）</h4><label class="kv"><span>18t 板（元／張）</span><input type="number" step="50" data-price="board" id="pr-board" value="${P.board}"></label><label class="kv"><span>8t 背板（元／張）</span><input type="number" step="50" data-price="back" id="pr-back" value="${P.back}"></label><label class="kv"><span>鉸鏈（元／組）</span><input type="number" step="10" data-price="hinge" id="pr-hinge" value="${P.hinge}"></label><div class="kv"><span>材料小計</span><b class="big">${money(cost)}</b></div></div>
    </div><div class="tbl-wrap"><table><thead><tr><th>櫃體</th><th>部件</th><th class="n">長 mm</th><th class="n">寬 mm</th><th class="n">厚</th><th class="n">數量</th><th class="n">面積 m²</th><th>材質／備註</th></tr></thead><tbody>${rows}</tbody></table></div>`
      : '<p class="note" style="padding:12px">目前沒有系統櫃。加入「衣櫃、書櫃、系統高櫃、矮櫃、鞋櫃」後會自動拆出側板、頂底板、層板、背板與門板尺寸。</p>';
  } else if (btab === 'chk') {
    const L = checks.list;
    host.innerHTML = `<div class="row" style="padding:10px 12px 0"><button class="btn primary sm" data-opt="1" type="button">一鍵優化配置</button><span class="note">門窗位置與鎖定的家具不動，其餘有問題的家具自動找最近的可行位置與方向。</span></div><div class="tbl-wrap"><table><thead><tr><th>等級</th><th>檢查項目</th></tr></thead><tbody>${L.length ? L.map(x => `<tr class="click" data-sel="${x.ids[0] || ''}"><td><span class="pill ${x.lv}">${x.lv === 'err' ? '干涉' : '注意'}</span></td><td>${esc(x.msg)}</td></tr>`).join('') : '<tr><td><span class="pill ok">通過</span></td><td>沒有干涉、擋門或通道不足的情況。</td></tr>'}</tbody></table></div>
      <p class="note" style="padding:4px 12px 12px">規則：家具不可重疊（椅子可收入桌下）；主要家具間通道 ≥ 最小通道（目前 ${S.set.minPath} mm，一般 600、輪椅 900）；衣櫃、公文櫃、廚具前 900，冰箱、事務機前 800，書桌前 700；吊扇葉片離地 ≥ 2100、距牆 ≥ 450；已配置燈具與冷氣需達需求；門片 90° 開啟扇形範圍內不可有家具；拉門／開口前 600 mm 保持淨空；高於窗台的家具不可貼窗擺放。</p>`;
  } else if (btab === 'est') {
    const rows = c.rows.map((x, i) => `<tr><td>${i + 1}</td><td>${x.name}</td><td>${esc(x.spec)}</td><td class="n">${x.k === 'furn' ? '—' : fx(x.qty, x.unit === '盞' || x.unit === 'kW' ? (x.unit === 'kW' ? 1 : 0) : 2)}</td><td>${x.unit}</td><td class="n">${x.k === 'furn' ? '—' : fmt(x.price)}</td><td class="n">${fmt(x.total)}</td></tr>`).join('');
    host.innerHTML = `<div class="tbl-wrap"><table><thead><tr><th>#</th><th>工程項目</th><th>規格說明</th><th class="n">數量</th><th>單位</th><th class="n">單價</th><th class="n">複價 NT$</th></tr></thead><tbody>${rows}
      <tr><td>8</td><td>設計費</td><td>依室內坪數計</td><td class="n">${fx(c.ping)}</td><td>坪</td><td class="n"><input type="number" step="100" data-price="design" id="pr-design" value="${P.design}"></td><td class="n">${fmt(c.design)}</td></tr>
      <tr><td>9</td><td>工程管理費</td><td>工程項目（2～7）×</td><td class="n"><input type="number" step="1" data-price="mgmt" id="pr-mgmt" value="${P.mgmt}"></td><td>%</td><td class="n">${fmt(c.eng)}</td><td class="n">${fmt(c.mgmt)}</td></tr>
      </tbody><tfoot><tr><td colspan="6">未稅小計</td><td class="n">${fmt(c.sub)}</td></tr><tr><td colspan="5">營業稅</td><td class="n"><input type="number" step="1" data-price="tax" id="pr-tax" value="${P.tax}"> %</td><td class="n">${fmt(c.tax)}</td></tr><tr><td colspan="6">含稅總價</td><td class="n" style="color:var(--ok);font-size:15px">${fmt(c.total)}</td></tr></tfoot></table></div>
      <p class="note" style="padding:4px 12px 12px">單價為台灣一般住宅裝修參考行情，請依實際廠商報價在「裝修材料計算」與此表修改；系統櫃以台尺計價，家具以件計價。</p>`;
  }
}
function syncParams() {
  const r = S.room;
  $('#mName').value = S.meta.name; $('#rW').value = r.W; $('#rD').value = r.D; $('#rH').value = r.H; $('#rT').value = r.T;
  $('#rType').value = r.type; $('#rFloor').value = r.floor; $('#rCeil').value = r.ceiling;
  $('#sSnap').value = S.set.snap; $('#sPath').value = S.set.minPath; $('#sCut').checked = S.set.cut; $('#sCeil').checked = S.set.ceil; $('#sCeilL').checked = S.set.ceilLayer;
  $('#wallSw').innerHTML = WALL_COLORS.map(c => `<button type="button" class="sw ${c === r.wall ? 'on' : ''}" style="background:${c}" data-wall="${c}" aria-label="牆色 ${c}"></button>`).join('');
}
function refresh(rebuildRoom) {
  checks = runChecks();
  if (rebuildRoom) buildRoom();
  buildItems(); syncParams(); renderPlan(); renderProps(); renderInfo(); renderBottom(); save();
}
function setView(v) {
  view = v; $$('[data-view]').forEach(b => b.classList.toggle('on', b.dataset.view === v));
  $('#v3d').hidden = v !== '3d'; $('#labels').hidden = v !== '3d'; svg.toggleAttribute('hidden', v !== 'plan'); $('#camBtns').hidden = v !== '3d';
  $('#hint').innerHTML = v === '3d' ? '左鍵拖曳家具移動・拖曳空白處旋轉・右鍵／Shift 平移・滾輪縮放' : '拖曳家具或門窗移動・點家具顯示離牆尺寸（橘色）・藍色虛線為前方操作空間';
  if (v === 'plan') renderPlan(); else dirty = true;
}

/* ---------- 匯出 ---------- */
function openDlg(title, body, note = '', copyText = null, extra = '') {
  $('#dlgTitle').textContent = title; $('#dlgBody').innerHTML = body; $('#dlgNote').textContent = note; $('#dlgExtra').innerHTML = extra;
  $('#dlgCopy').hidden = copyText === null; $('#dlgCopy').dataset.text = copyText || '';
  $('#dlgCopy').textContent = '複製';
  $('#dlg').showModal();
}
function csvText() {
  const c = calc(), q = v => `"${String(v).replace(/"/g, '""')}"`, L = [];
  L.push(['室內空間設計清單', `${S.room.W}x${S.room.D}x${S.room.H}mm`, `${fx(c.A)} m2`, `${fx(c.ping)} 坪`].map(q).join(','));
  L.push(''); L.push(['#', '品名', '類別', 'W', 'D', 'H', 'X', 'Y', '角度', '顏色', '計價', '小計'].map(q).join(','));
  S.items.forEach((it, i) => { const Lb = LIB[it.type]; L.push([i + 1, it.name, CATS.find(x => x[0] === Lb.cat)[1], it.w, it.d, it.h, Math.round(it.x), Math.round(it.y), it.rot, it.color, Lb.pricing === 'chi' ? `${chis(it.w)}尺x${it.chiPrice}` : '件', itemPrice(it)].map(q).join(',')); });
  L.push(''); L.push(['工程項目', '規格', '數量', '單位', '單價', '複價'].map(q).join(','));
  c.rows.forEach(x => L.push([x.name, x.spec, fx(x.qty), x.unit, Math.round(x.price), Math.round(x.total)].map(q).join(',')));
  L.push(['設計費', '', fx(c.ping), '坪', S.prices.design, Math.round(c.design)].map(q).join(','));
  L.push(['工程管理費', '', S.prices.mgmt, '%', '', Math.round(c.mgmt)].map(q).join(','));
  L.push(['營業稅', '', S.prices.tax, '%', '', Math.round(c.tax)].map(q).join(','));
  L.push(['含稅總價', '', '', '', '', Math.round(c.total)].map(q).join(','));
  const cl = cutList();
  if (cl.parts.length) { L.push(''); L.push(['櫃體', '部件', '長', '寬', '厚', '數量'].map(q).join(',')); cl.parts.forEach(p => L.push([p.tag, p.part, p.a, p.b, p.th, p.n].map(q).join(','))); }
  return L.join('\n');
}
function exportImg() {
  let url;
  if (view === '3d') { renderer.render(scene, camera); url = renderer.domElement.toDataURL('image/png'); }
  else {
    const clone = svg.cloneNode(true), vb = svg.viewBox.baseVal, css = [...document.styleSheets].flatMap(s => { try { return [...s.cssRules].map(r => r.cssText).filter(t => t.startsWith('#plan') || t.startsWith('.sym')); } catch (e) { return []; } }).join('\n');
    clone.setAttribute('width', 1600); clone.setAttribute('height', Math.round(1600 * vb.height / vb.width)); clone.removeAttribute('hidden');
    clone.insertAdjacentHTML('afterbegin', `<style>${css}</style><rect x="${vb.x}" y="${vb.y}" width="${vb.width}" height="${vb.height}" fill="#0d1622"/>`);
    url = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(new XMLSerializer().serializeToString(clone));
  }
  openDlg(view === '3d' ? '3D 擺設圖' : '平面配置圖', `<img src="${url}" alt="匯出的設計圖">`, '在圖片上按右鍵（手機長按）即可另存圖檔。', null);
}
function projDlg() {
  openDlg('專案存取', `<textarea id="projText" spellcheck="false">${esc(JSON.stringify(S, null, 1))}</textarea>`, '複製文字保存專案；貼上專案文字或選擇 .json 檔後按「載入」。', '__proj__',
    `<label class="btn" for="projFile">選擇檔案</label><input type="file" id="projFile" accept=".json,application/json" hidden> <button class="btn" type="button" id="projLoad">載入</button>`);
}

/* ---------- 事件 ---------- */
function bindUI() {
  $('#tplSel').innerHTML = '<option value="">載入範本…</option>' + Object.entries(TPL).map(([k, t]) => `<option value="${k}">${t.name}</option>`).join('');
  $('#rType').innerHTML = Object.entries(ROOMTYPES).map(([k, v]) => `<option value="${k}">${v[0]}</option>`).join('');
  $('#rFloor').innerHTML = Object.entries(FLOORS).map(([k, v]) => `<option value="${k}">${v.name}</option>`).join('');
  $('#tplSel').addEventListener('change', e => { const k = e.target.value; if (!k) return; pushHist(); S = applyTpl(k); sel = null; e.target.value = ''; refresh(true); fitCam('iso'); });
  const roomNum = (id, key, min) => $(id).addEventListener('change', e => {
    const v = Number(e.target.value); if (!isFinite(v) || v < min) { syncParams(); return; }
    pushHist(); S.room[key] = v; S.openings.forEach(o => { o.width = Math.min(o.width, wallLen(o.wall)); o.offset = clamp(o.offset, 0, wallLen(o.wall) - o.width); });
    refresh(true); if (key !== 'T') fitCam('iso');
  });
  roomNum('#rW', 'W', 1000); roomNum('#rD', 'D', 1000); roomNum('#rH', 'H', 2000); roomNum('#rT', 'T', 60);
  $('#rType').addEventListener('change', e => { pushHist(); S.room.type = e.target.value; refresh(); });
  $('#rFloor').addEventListener('change', e => { pushHist(); S.room.floor = e.target.value; refresh(true); });
  $('#rCeil').addEventListener('change', e => { pushHist(); S.room.ceiling = e.target.value; refresh(); });
  $('#sSnap').addEventListener('change', e => { S.set.snap = Number(e.target.value); save(); });
  $('#sPath').addEventListener('change', e => { const v = Number(e.target.value); if (v >= 300) { S.set.minPath = v; refresh(); } });
  $('#sCut').addEventListener('change', e => { S.set.cut = e.target.checked; updateCut(); save(); });
  $('#wallSw').addEventListener('click', e => { const c = e.target.dataset.wall; if (!c) return; pushHist(); S.room.wall = c; refresh(true); });
  $$('[data-view]').forEach(b => b.addEventListener('click', () => setView(b.dataset.view)));
  $$('[data-cam]').forEach(b => b.addEventListener('click', () => fitCam(b.dataset.cam)));
  $('#cats').addEventListener('click', e => { const k = e.target.closest('[data-cat]'); if (!k) return; curCat = k.dataset.cat; libTiles(); });
  $('#lib').addEventListener('click', e => { const t = e.target.closest('[data-add]'); if (t) addItem(t.dataset.add); });
  $('#props').addEventListener('change', onProp);
  $('#props').addEventListener('pointerdown', e => { if (e.target.type === 'range') pushHist(); });
  $('#props').addEventListener('input', e => { if (e.target.id !== 'p-rotr') return; const it = findSel(); if (!it) return; it.rot = Number(e.target.value); $('#p-rot').value = it.rot; liveMove(it); });
  $$('[data-opt]').forEach(b => b.addEventListener('click', () => optimize()));
  $('#sCeil').addEventListener('change', e => { S.set.ceil = e.target.checked; refresh(true); });
  $('#sCeilL').addEventListener('change', e => { S.set.ceilLayer = e.target.checked; renderPlan(); save(); });
  $('#props').addEventListener('click', e => {
    const a = e.target.closest('[data-act]'); if (a) return onAct(a.dataset.act);
    const c = e.target.closest('[data-color]'); if (c) { const it = findSel(); if (it) { pushHist(); it.color = c.dataset.color; refresh(); } }
  });
  $$('[data-addop]').forEach(b => b.addEventListener('click', () => addOp(b.dataset.addop)));
  $$('[data-bt]').forEach(b => b.addEventListener('click', () => { btab = b.dataset.bt; $$('[data-bt]').forEach(x => x.classList.toggle('on', x === b)); renderBottom(); }));
  $('#bottomBody').addEventListener('click', e => { if (e.target.closest('[data-opt]')) return optimize(); const r = e.target.closest('[data-sel]'); if (r && r.dataset.sel && itemById(r.dataset.sel)) select({ kind: 'item', id: r.dataset.sel }); });
  $('#bottomBody').addEventListener('change', e => {
    const el = e.target;
    if (el.dataset.price) { const v = Number(el.value); if (!isFinite(v)) return; pushHist(); if (el.dataset.price === 'floor') S.prices.floor[S.room.floor] = v; else S.prices[el.dataset.price] = v; }
    else if (el.dataset.room) { pushHist(); S.room[el.dataset.room] = el.type === 'checkbox' ? el.checked : Number(el.value) || 1100; }
    else return;
    renderInfo(); renderBottom(); renderProps(); save();
  });
  $('#undoBtn').addEventListener('click', undo);
  $('#csvBtn').addEventListener('click', () => { const t = csvText(); openDlg('匯出清單（CSV）', `<textarea readonly spellcheck="false">${esc(t)}</textarea>`, '複製後貼到 Excel 或存成 .csv 檔。', t); });
  $('#imgBtn').addEventListener('click', exportImg);
  $('#stepBtn').addEventListener('click', () => exportSTEP());
  $('#pdfBtn').addEventListener('click', () => exportPDF());
  $('#mName').addEventListener('change', e => { S.meta.name = e.target.value.trim() || '室內設計案'; save(); });
  $('#projBtn').addEventListener('click', projDlg);
  $('#dlgClose').addEventListener('click', () => $('#dlg').close());
  $('#dlgCopy').addEventListener('click', e => {
    const btn = e.currentTarget, ta = $('#dlgBody textarea'), t = btn.dataset.text === '__proj__' ? (ta ? ta.value : '') : btn.dataset.text;
    const fallback = () => { if (ta) { ta.focus(); ta.select(); } btn.textContent = '已選取，請按 Ctrl+C'; };
    try { navigator.clipboard.writeText(t).then(() => { btn.textContent = '已複製'; }, fallback); } catch (er) { fallback(); }
  });
  $('#dlg').addEventListener('change', e => {
    if (e.target.id !== 'projFile' || !e.target.files[0]) return;
    const fr = new FileReader(); fr.onload = () => { $('#projText').value = fr.result; $('#dlgNote').textContent = '已讀入檔案，按「載入」套用。'; }; fr.readAsText(e.target.files[0]);
  });
  $('#dlg').addEventListener('click', e => {
    if (e.target.id !== 'projLoad') return;
    try { const s = JSON.parse($('#projText').value); pushHist(); S = normalize(s); sel = null; refresh(true); fitCam('iso'); $('#dlg').close(); }
    catch (er) { $('#dlgNote').textContent = '專案文字格式不正確，請確認是完整的 JSON 內容。'; }
  });
  document.addEventListener('keydown', e => {
    const tag = (document.activeElement || {}).tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || $('#dlg').open) return;
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') { e.preventDefault(); undo(); return; }
    const o = findSel(); if (!o) return;
    if (e.key === 'Delete' || e.key === 'Backspace') { e.preventDefault(); onAct('del'); return; }
    if (sel.kind === 'op') { const k = { ArrowLeft: -1, ArrowUp: -1, ArrowRight: 1, ArrowDown: 1 }[e.key]; if (k) { e.preventDefault(); pushHist(); moveOp(o, o.offset + k * (e.shiftKey ? 10 : S.set.snap)); refresh(true); } return; }
    if (e.key === 'q' || e.key === 'Q' || e.key === 'e' || e.key === 'E') { pushHist(); o.rot = snapRot(o.rot + (e.key.toLowerCase() === 'q' ? -1 : 1) * (e.shiftKey ? 1 : 15), true); refresh(); return; }
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'd') { e.preventDefault(); onAct('dup'); return; }
    if (e.key === 'r' || e.key === 'R') { onAct(e.shiftKey ? 'rot-90' : 'rot90'); return; }
    const mv = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }[e.key];
    if (mv) { e.preventDefault(); pushHist(); const s = e.shiftKey ? 10 : S.set.snap; o.x += mv[0] * s; o.y += mv[1] * s; refresh(); }
  });
}

/* ---------- 啟動 ---------- */
S = load() || applyTpl('living');
bindUI(); libTiles(); bindPlan();
if (window.THREE) { init3D(); refresh(true); fitCam('iso'); }
setView('3d');
