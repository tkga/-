// รัน: node --test tests/
const test = require('node:test');
const assert = require('node:assert/strict');
const L = require('../logic.js');
const { build } = require('./fixture.js');

const TODAY = '2026-10-26';
const close = (a, b, eps = 0.005) => assert.ok(Math.abs(a - b) < eps, `${a} ≠ ${b}`);

test('ตัวเลขรายเดือนตรงกับแอปเดิม (สกรีนช็อต)', () => {
  const m = L.createEngine(build(), TODAY).month(2026, 10);
  const t = m.totals;
  close(t.grabIncome, 1300);
  close(t.grabExpense, 200);
  close(t.reserve, 587.90);      // 575 เสื่อม + 12.90 โทรศัพท์
  close(t.depreciation, 575);
  close(t.grabNet, 512.10);
  assert.equal(m.activeDays, 3);
  close(m.avgPerActiveDay, 170.70);
  close(m.best.grabNet, 526.77);
  assert.equal(m.best.date, '2026-10-25');
  close(m.profitPerHour, 512.10 / 11);   // 46.55
  // ข้อมูลทดสอบนี้ใช้ค่าเก่าที่กรอกมือ (413 เที่ยว) + เที่ยวที่นับจากรายการแกร็ป 3 วัน (ทิปไม่นับ) = 416
  assert.equal(t.trips, 416);
  assert.equal(t.km, 115);
  assert.equal(Math.round(m.costRatio * 100), 61);
});

test('ตัวเลขรายวันตรงกับตารางเดิม', () => {
  const e = L.createEngine(build(), TODAY);
  close(e.day('2026-10-26').grabNet, -3.23);
  close(e.day('2026-10-25').grabNet, 526.77);
  close(e.day('2026-10-24').grabNet, 106.77);
  close(e.day('2026-10-23').grabNet, -118.23);
  close(e.day('2026-10-25').reserve, 503.23);
  close(e.day('2026-10-23').reserve, 78.23);
});

test('วันก่อนวันแรกที่มีข้อมูลไม่ถูกหักค่าประจำ (เหมือน 20 ต.ค. ในสกรีนช็อต)', () => {
  const e = L.createEngine(build(), TODAY);
  const d = e.day('2026-10-20');
  assert.equal(d.charged, false);
  assert.equal(d.grabNet, 0);
});

test('สัดส่วนต้นทุนและรายรับแยกหมวด', () => {
  const m = L.createEngine(build(), TODAY).month(2026, 10);
  const byName = Object.fromEntries(m.costBreakdown.map(x => [x.name, x.value]));
  close(byName[L.DEP_LABEL], 575);
  close(byName['น้ำมัน/ค่าชาร์จ'], 200);
  close(byName['ค่าโทรศัพท์'], 12.90);
  assert.equal(Math.round(575 / m.costTotal * 100), 73);
  const inc = Object.fromEntries(m.incomeBreakdown.map(x => [x.name, x.value]));
  close(inc['รับผู้โดยสาร'], 1290);
  close(inc['ทิป'], 10);
});

test('ช่องทางอื่นไม่ปนกับกำไรแกร็ป', () => {
  const s = build();
  s.entries.push({ id: 'g1', date: '2026-10-25', time: '', type: 'income', source: 'game', category: 'ขายไอเท็ม', amount: 300, pay: 'transfer', note: '' });
  s.entries.push({ id: 'g2', date: '2026-10-25', time: '', type: 'expense', source: 'game', category: 'ซื้อไอเท็ม', amount: 120, note: '' });
  s.entries.push({ id: 'o1', date: '2026-10-26', time: '', type: 'income', source: 'other', category: 'ขายของ', amount: 50, pay: 'cash', note: '' });
  s.entries.push({ id: 'p1', date: '2026-10-26', time: '', type: 'expense', source: 'personal', category: 'อาหาร', amount: 80, note: '' });
  const m = L.createEngine(s, TODAY).month(2026, 10);
  close(m.totals.grabNet, 512.10);       // ไม่เปลี่ยน
  close(m.totals.gameNet, 180);
  close(m.totals.otherNet, 50);
  close(m.totals.allNet, 512.10 + 180 + 50);
  close(m.totals.personalTotal, 80);
  close(m.totals.remain, 512.10 + 230 - 80);
  assert.equal(m.activeDays, 3);         // รายได้เกม/อื่นๆ ไม่ทำให้นับเป็นวันที่ออกวิ่ง
  close(m.costRatio, (200 + 587.903225806) / 1300, 0.0001);  // ต้นทุนต่อรายรับ คิดจากแกร็ปล้วน ไม่ถูกเกม/อื่นๆ ดึง
});

test('โหมดเป้าหมาย: แกร็ปอย่างเดียว vs ทุกช่องทาง', () => {
  const s = build();
  s.entries.push({ id: 'g1', date: '2026-10-25', time: '', type: 'income', source: 'game', category: 'ขายไอเท็ม', amount: 300, pay: 'cash', note: '' });
  let e = L.createEngine(s, TODAY);
  close(e.measure('2026-10-25'), 526.77);
  s.settings.targetMode = 'all';
  e = L.createEngine(s, TODAY);
  close(e.measure('2026-10-25'), 826.77);
});

test('ค่าประจำรายปีหารด้วยจำนวนวันในปี และส่วนตัวไม่เข้ากำไรแกร็ป', () => {
  const s = build();
  s.fixed = [
    { id: 'a', name: 'ภาษีรถ', amount: 3650, every: 'year', scope: 'grab' },
    { id: 'b', name: 'ค่าเน็ตบ้าน', amount: 310, every: 'month', scope: 'personal' }
  ];
  const d = L.createEngine(s, TODAY).day('2026-10-26');
  close(d.fixedGrab, 3650 / 365);
  close(d.fixedPersonal, 310 / 31);
  close(d.grabNet, -10);
  close(d.remain, -10 - 10);
});

test('นำเข้าข้อมูลเสีย: ล้างค่าที่ผิดและไม่พัง', () => {
  const s = L.normalize({
    settings: { target: 'abc', targetMode: 'zzz', depPerKm: -3 },
    fixed: [{ name: '', amount: 5 }, { name: 'ok', amount: '100', every: 'year' }, null],
    entries: [
      { date: '2026-02-30', type: 'income', amount: 5 },                    // วันที่ไม่มีจริง
      { date: '2026-10-01', type: 'income', amount: -5 },                   // ติดลบ
      { date: '2026-10-01', type: 'bogus', amount: 5 },                     // ประเภทมั่ว
      { date: '2026-10-01', type: 'expense', source: 'other', amount: 9 },  // expense ไม่มี other → personal
      { date: '2026-10-01', type: 'income', source: 'personal', amount: 9 } // income ไม่มี personal → other
    ],
    days: { '2026-10-01': { trips: -1, hours: 'x', km: 3 }, 'junk': { km: 1 } }
  });
  assert.equal(s.settings.target, 0);
  assert.equal(s.settings.targetMode, 'grab');
  assert.equal(s.settings.depPerKm, 0);
  assert.equal(s.fixed.length, 1);
  assert.equal(s.fixed[0].every, 'year');
  assert.equal(s.entries.length, 2);
  assert.equal(s.entries[0].source, 'personal');
  assert.equal(s.entries[1].source, 'other');
  assert.deepEqual(s.days, { '2026-10-01': { trips: 0, hours: 0, km: 3 } });
});

test('รูปแบบเงิน', () => {
  assert.equal(L.money(1300), '฿1,300');
  assert.equal(L.money(512.1), '฿512.10');
  assert.equal(L.money(-3.2258), '−฿3.23');
  assert.equal(L.money(185, { plus: true }), '+฿185');
  assert.equal(L.money(-0.001), '฿0');
  assert.equal(L.money(0), '฿0');
});

test('CSV: escape และกันสูตร', () => {
  const s = build();
  s.entries.push({ id: 'x', date: '2026-10-25', time: '10:00', type: 'income', source: 'grab', category: 'ทิป', amount: 20, pay: 'cash', note: '=SUM(A1), "ลูกค้า"' });
  const csv = L.entriesCsv(s, '2026-10');
  assert.ok(csv.includes(`"'=SUM(A1), ""ลูกค้า"""`));
  assert.ok(L.daysCsv(L.createEngine(s, TODAY).month(2026, 10)).split('\r\n').length >= 6);
});

test('ข้อมูลการวิ่งรวมจากรายการแกร็ป: เที่ยว/กม./เวลา, ทิปไม่นับเที่ยว', () => {
  const s = L.emptyState();
  s.fixed = [];
  const add = (cat, amount, extra) => s.entries.push(Object.assign({ id: L.uid(), date: '2026-10-26', time: '', type: 'income', source: 'grab', category: cat, amount, pay: 'cash', note: '' }, extra || {}));
  add('รับผู้โดยสาร', 100, { km: 5.5, hours: 0.25 });
  add('ส่งอาหาร', 60, { km: 3, hours: 0.5 });
  add('ทิป', 20, { km: 99, hours: 9 });           // ทิปไม่นับเที่ยว และไม่เก็บ กม./เวลา
  s.entries.push({ id: 'g', date: '2026-10-26', time: '', type: 'income', source: 'game', category: 'ขายไอเท็ม', amount: 50, pay: 'cash', note: '', km: 40 });
  const n = L.normalize(s);
  assert.equal(n.entries.find((e) => e.category === 'ทิป').km, undefined);
  assert.equal(n.entries.find((e) => e.source === 'game').km, undefined);
  s.settings.depPerKm = 5;
  const d = L.createEngine(n, '2026-10-26').day('2026-10-26');
  assert.equal(d.trips, 2);
  close(d.km, 8.5);
  close(d.hours, 0.75);
  close(d.depreciation, 42.5);
  close(d.grabNet, 180 - 42.5);
  assert.equal(d.active, true);
});
