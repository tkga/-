// ข้อมูลทดสอบ = ตัวเลขจากสกรีนช็อตแอปเดิม (23–26 ต.ค. 2569/2026)
// ผลที่ต้องได้: กำไรแกร็ป 512.10 · รายรับ 1,300 · รายจ่าย 200 · ประจำ+เสื่อม 587.90
const L = require('../logic.js');

function build() {
  const s = L.emptyState();
  s.settings = { target: 1000, targetMode: 'grab', depPerKm: 5 };
  s.fixed.push({ id: 'f1', name: 'ค่าโทรศัพท์', amount: 100, every: 'month', scope: 'grab' });
  let n = 0;
  const add = (date, type, source, category, amount, pay) => {
    const e = { id: 'e' + (++n), date, time: '09:00', type, source, category, amount, note: '' };
    if (type === 'income') e.pay = pay || 'cash';
    s.entries.push(e);
  };
  // ศุกร์ 23
  add('2026-10-23', 'income', 'grab', 'รับผู้โดยสาร', 60);
  add('2026-10-23', 'expense', 'grab', 'น้ำมัน/ค่าชาร์จ', 100);
  s.days['2026-10-23'] = { trips: 13, hours: 4, km: 15 };
  // เสาร์ 24 (ไม่กรอก กม.)
  add('2026-10-24', 'income', 'grab', 'รับผู้โดยสาร', 100);
  add('2026-10-24', 'income', 'grab', 'ทิป', 10);
  // อาทิตย์ 25
  add('2026-10-25', 'income', 'grab', 'รับผู้โดยสาร', 1130, 'transfer');
  add('2026-10-25', 'expense', 'grab', 'น้ำมัน/ค่าชาร์จ', 100);
  s.days['2026-10-25'] = { trips: 400, hours: 7, km: 100 };
  // จันทร์ 26 ไม่มีข้อมูลเลย → โดนหักค่าประจำอย่างเดียว
  return s;
}

module.exports = { build };
