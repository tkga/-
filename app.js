/* app.js — หน้าจอและการโต้ตอบ (ตรรกะคำนวณอยู่ใน logic.js) */
(() => {
  'use strict';

  const L = window.Ledger;
  const M = L.money;
  const SRC = L.SOURCES;
  const KEY = 'driver-ledger-v1';

  const DOW = ['อาทิตย์', 'จันทร์', 'อังคาร', 'พุธ', 'พฤหัสบดี', 'ศุกร์', 'เสาร์'];
  const MON_S = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'];
  const MON_F = ['มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน', 'พฤษภาคม', 'มิถุนายน', 'กรกฎาคม', 'สิงหาคม', 'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม'];

  /* ---------- ตัวช่วยเล็กๆ ---------- */
  const $ = (s, r = document) => r.querySelector(s);
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const nowYmd = () => L.toYmd(new Date());
  const thaiShort = (ymd) => { const d = L.parseYmd(ymd); return `${d.getDate()} ${MON_S[d.getMonth()]}`; };
  const thaiShortDow = (ymd) => `${DOW[L.parseYmd(ymd).getDay()]} ${thaiShort(ymd)}`;
  const thaiFull = (ymd) => `${thaiShort(ymd)} ${L.parseYmd(ymd).getFullYear() + 543}`;
  const cls = (v) => (v > 0.005 ? 'pos' : v < -0.005 ? 'neg' : '');
  const dotHtml = (color) => `<i class="cd" style="background:${color}"></i>`;

  // รับเฉพาะตัวเลข (แปลงเลขไทยเป็นเลขอารบิก) และจุดทศนิยมตัวเดียว
  function cleanNum(s) {
    s = String(s).replace(/[๐-๙]/g, (d) => String(d.charCodeAt(0) - 0x0E50)).replace(/[^\d.]/g, '');
    const i = s.indexOf('.');
    return i < 0 ? s : s.slice(0, i + 1) + s.slice(i + 1).replace(/\./g, '');
  }

  /* ---------- เก็บข้อมูลในเครื่อง ---------- */
  let storageOK = true;
  let persistAsked = false;

  function load() {
    let raw = null;
    try { raw = localStorage.getItem(KEY); } catch (_) { storageOK = false; }
    if (raw) {
      try { return L.normalize(JSON.parse(raw)); }
      catch (_) { try { localStorage.setItem(`${KEY}-corrupt-${Date.now()}`, raw); } catch (__) { /* ไม่เป็นไร */ } }
    }
    return L.emptyState();
  }

  function save() {
    try {
      localStorage.setItem(KEY, JSON.stringify(state));
      if (!persistAsked && navigator.storage && navigator.storage.persist) {
        persistAsked = true;               // ขอให้เบราว์เซอร์ "ไม่ลบข้อมูลเองเวลาที่เก็บเต็ม"
        navigator.storage.persist().catch(() => {});
      }
    } catch (_) {
      storageOK = false;
      toast('บันทึกลงเครื่องไม่ได้ — เบราว์เซอร์อาจปิดการเก็บข้อมูลไว้');
    }
  }

  function stash(tag) {   // เก็บข้อมูลเดิมไว้ก่อนนำเข้า/ลบทั้งหมด เผื่อพลาด
    try { localStorage.setItem(`${KEY}-${tag}`, JSON.stringify(state)); } catch (_) { /* ไม่เป็นไร */ }
  }

  /* ---------- สถานะแอป ---------- */
  let state = load();
  let today = nowYmd();
  let engine = L.createEngine(state, today);

  const ui = {
    tab: 'day',
    date: today,
    month: { y: +today.slice(0, 4), m: +today.slice(5, 7) },
    tableMode: 'grab',
    form: { type: 'income', source: 'grab', category: 'รับผู้โดยสาร', pay: 'cash', amount: '', km: '', min: '', note: '', editId: null },
    fixedForm: { name: '', amount: '', every: 'month', scope: 'grab' }
  };

  function commit() {
    save();
    engine = L.createEngine(state, today);
  }

  /* ---------- toast ---------- */
  let toastTimer = null;
  function hideToast() { $('#toast').classList.remove('show'); }
  function toast(msg, action) {
    const t = $('#toast');
    t.innerHTML = `<span>${esc(msg)}</span>${action ? `<button type="button" id="toast-act">${esc(action.label)}</button>` : ''}`;
    t.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(hideToast, action ? 6500 : 2400);
    if (action) $('#toast-act').onclick = () => { hideToast(); action.fn(); };
  }

  /* =====================================================================
   *  แท็บ "รายวัน"
   * ===================================================================== */
  function categoriesFor(f) {
    const list = L.CATEGORIES[f.type][f.source].slice();
    if (f.editId && f.category && list.indexOf(f.category) < 0) list.push(f.category);
    return list;
  }

  function ensureForm() {
    const f = ui.form;
    const srcs = f.type === 'income' ? L.INCOME_SOURCES : L.EXPENSE_SOURCES;
    if (srcs.indexOf(f.source) < 0) f.source = 'grab';
    const cats = categoriesFor(f);
    if (cats.indexOf(f.category) < 0) f.category = cats[0];
    if (f.pay !== 'cash' && f.pay !== 'transfer') f.pay = 'cash';
  }

  function resetForm() {
    Object.assign(ui.form, { amount: '', km: '', min: '', note: '', editId: null });
  }

  const payLabel = (source, pay) => (pay === 'cash' ? 'เงินสด' : source === 'grab' ? 'โอนเข้าแอป' : 'โอน/เข้าบัญชี');

  const formIsTrip = (f) => f.type === 'income' && f.source === 'grab' && L.TRIP_CATEGORIES.indexOf(f.category) >= 0;
  function fmtDur(h) {
    const t = Math.round(h * 60);
    if (t <= 0) return '0';
    const hh = Math.floor(t / 60), mm = t % 60;
    return hh ? `${hh} <small>ชม.</small> ${mm} <small>น.</small>` : `${mm} <small>น.</small>`;
  }

  function dayBar() {
    const d = L.parseYmd(ui.date);
    const isToday = ui.date === today;
    return `<div class="datebar">
      <button class="icon-btn" data-act="prev-day" aria-label="วันก่อนหน้า">‹</button>
      <label class="datecenter">
        <span class="dow">วัน${DOW[d.getDay()]}${isToday ? ' · วันนี้' : ''}</span>
        <span class="dtxt">${thaiFull(ui.date)}</span>
        <input type="date" data-f="date-pick" value="${ui.date}" max="${today}" aria-label="เลือกวันที่">
      </label>
      <button class="icon-btn" data-act="next-day" aria-label="วันถัดไป" ${isToday ? 'disabled' : ''}>›</button>
      <button class="today-btn" data-act="today" ${isToday ? 'disabled' : ''}>วันนี้</button>
    </div>`;
  }

  function cell(k, v, c) {
    return `<div class="cell"><div class="k">${k}</div><div class="v ${c || ''}">${v}</div></div>`;
  }

  function dayHero() {
    const r = engine.day(ui.date);
    const all = state.settings.targetMode === 'all';
    const profit = all ? r.allNet : r.grabNet;
    const income = all ? r.incomeAll : r.grabIncome;
    const expense = all ? r.grabExpense + r.gameExpense : r.grabExpense;
    const cash = all ? r.cashAll : r.grabCash;
    const target = state.settings.target;
    const pct = target > 0 ? Math.max(0, Math.min(100, (profit / target) * 100)) : 0;

    let tgt;
    if (!(target > 0)) tgt = 'ยังไม่ตั้งเป้าหมาย';
    else if (L.round2(profit) >= target) tgt = `เป้า ${M(target)} · ถึงเป้าแล้ว`;
    else tgt = `เป้า ${M(target)} · อีก ${M(target - profit)}`;

    const chips = [];
    if (r.reserve > 0.005) chips.push(`${dotHtml('#8c9b92')}หักค่าเสื่อม/ค่าประจำแล้ว <b>${M(-r.reserve)}</b>`);
    if (all) {
      if (r.grabIncome || r.grabExpense || r.reserve) chips.push(`${dotHtml(SRC.grab.color)}แกร็ป <b>${M(r.grabNet, { plus: true })}</b>`);
    }
    if (r.gameIncome || r.gameExpense) chips.push(`${dotHtml(SRC.game.color)}เกม <b>${M(r.gameNet, { plus: true })}</b>`);
    if (r.otherIncome) chips.push(`${dotHtml(SRC.other.color)}อื่นๆ <b>${M(r.otherNet, { plus: true })}</b>`);
    if (r.personalTotal > 0.005) chips.push(`${dotHtml(SRC.personal.color)}ส่วนตัว <b>${M(-r.personalTotal)}</b>`);

    return `<div class="hero">
      <div class="head"><span>กำไรสุทธิ${all ? ' (ทุกช่องทาง)' : ' (แกร็ป)'}</span><span class="r">${tgt}</span></div>
      <div class="big ${profit < -0.005 ? 'neg' : ''}">${M(profit)}</div>
      <div class="bar"><i style="width:${pct.toFixed(1)}%"></i></div>
      <div class="cells">${cell('รายรับ', M(income))}${cell('รายจ่าย', M(expense))}${cell('รับเป็นเงินสด', M(cash))}</div>
      ${chips.length ? `<div class="chiprow">${chips.map((c) => `<span>${c}</span>`).join('')}</div>` : ''}
    </div>`;
  }

  function dayForm() {
    ensureForm();
    const f = ui.form;
    const isInc = f.type === 'income';
    const srcs = isInc ? L.INCOME_SOURCES : L.EXPENSE_SOURCES;
    const cats = categoriesFor(f);
    const btnLabel = f.editId ? 'บันทึกการแก้ไข' : isInc ? 'บันทึกรายรับ' : 'บันทึกรายจ่าย';
    const srcHelp = f.source === 'personal'
      ? 'ค่าใช้จ่ายส่วนตัวจะแสดงแยก ไม่ถูกนับเป็นต้นทุนแกร็ป'
      : f.source === 'game' ? 'กำไรเกมคิดแยก ไม่ปนกับกำไรแกร็ป'
      : f.source === 'other' ? 'รายได้อื่นๆ คิดแยก ไม่ปนกับกำไรแกร็ป' : '';

    return `<div class="card stack">
      <div class="seg ${isInc ? '' : 'exp'}">
        <button type="button" class="${isInc ? 'on' : ''}" data-act="type" data-v="income">รายรับ</button>
        <button type="button" class="${isInc ? '' : 'on'}" data-act="type" data-v="expense">รายจ่าย</button>
      </div>
      <div>
        <div class="small muted" style="margin-bottom:6px">ช่องทาง</div>
        <div class="chips">${srcs.map((s) => `<button type="button" class="chip s-${s} ${f.source === s ? 'on' : ''}" data-act="source" data-v="${s}"><i class="cdot" style="background:${SRC[s].color}"></i>${SRC[s].label}</button>`).join('')}</div>
        ${srcHelp ? `<p class="help" style="margin-top:6px">${srcHelp}</p>` : ''}
      </div>
      <div class="chips">${cats.map((c) => `<button type="button" class="chip ${f.category === c ? 'on' : ''}" data-act="cat" data-v="${esc(c)}">${esc(c)}</button>`).join('')}</div>
      <label class="fld"><span>จำนวนเงิน (บาท)</span>
        <div class="money-wrap"><input class="in big" id="f-amount" data-f="amount" inputmode="decimal" autocomplete="off" placeholder="0" value="${esc(f.amount)}"></div>
      </label>
      ${formIsTrip(f) ? `<div><div class="row">
          <label class="fld"><span>กิโลเมตร (ไม่บังคับ)</span><input class="in" data-f="f-km" inputmode="decimal" autocomplete="off" placeholder="0" value="${esc(f.km)}"></label>
          <label class="fld"><span>เวลาที่ใช้ นาที (ไม่บังคับ)</span><input class="in" data-f="f-min" inputmode="numeric" autocomplete="off" placeholder="0" value="${esc(f.min)}"></label>
        </div><p class="help" style="margin-top:6px">บันทึกแล้วนับเป็น 1 เที่ยว และรวมกิโลเมตร/เวลาเข้า “ข้อมูลการวิ่ง” ของวันให้อัตโนมัติ</p></div>` : ''}
      ${isInc ? `<div><div class="small muted" style="margin-bottom:6px">รับเงินแบบไหน</div>
        <div class="chips">
          <button type="button" class="chip ${f.pay === 'cash' ? 'on' : ''}" data-act="pay" data-v="cash">เงินสด</button>
          <button type="button" class="chip ${f.pay === 'transfer' ? 'on' : ''}" data-act="pay" data-v="transfer">${payLabel(f.source, 'transfer')}</button>
        </div></div>` : ''}
      <label class="fld"><span>บันทึกเพิ่มเติม (ไม่บังคับ)</span>
        <input class="in" data-f="note" maxlength="200" autocomplete="off" placeholder="เช่น สนามบิน, ปิ๊บแถวบ้าน" value="${esc(f.note)}">
      </label>
      <div class="stack">
        <button type="button" class="btn ${isInc ? '' : 'exp'}" data-act="submit">${btnLabel}</button>
        ${f.editId ? '<button type="button" class="btn ghost" data-act="cancel-edit">ยกเลิกการแก้ไข</button>' : ''}
      </div>
    </div>`;
  }

  function entryRow(e) {
    const inc = e.type === 'income';
    return `<div class="ent">
      <div class="t">${esc(e.time || '')}</div>
      <div>
        <div class="name"><span class="badge ${e.source}">${SRC[e.source].label}</span>${esc(e.category)}</div>
        ${(() => { const x = []; if (e.km) x.push(`${L.plain(e.km, 1)} กม.`); if (e.hours) x.push(`${Math.round(e.hours * 60)} นาที`); if (e.note) x.push(esc(e.note)); return x.length ? `<div class="note">${x.join(' · ')}</div>` : ''; })()}
      </div>
      <div class="amt ${inc ? 'pos' : 'neg'}">${inc ? '+' : '−'}${M(e.amount)}${inc ? `<span class="pay">${payLabel(e.source, e.pay)}</span>` : ''}</div>
      <div class="acts">
        <button type="button" class="link" data-act="edit-entry" data-id="${esc(e.id)}">แก้ไข</button>
        <button type="button" class="link" data-act="del-entry" data-id="${esc(e.id)}">ลบ</button>
      </div>
    </div>`;
  }

  function dayEntries() {
    const r = engine.day(ui.date);
    if (!r.entries.length) {
      return `<div class="card entries">
        <div class="ent example">
          <div class="t">09:30</div>
          <div><div class="name"><span class="badge ex">ตัวอย่าง</span>รับผู้โดยสาร</div><div class="note">สนามบิน</div></div>
          <div class="amt pos">+${M(185)}</div>
        </div>
        <p class="help" style="margin:4px 0 12px">ยังไม่มีรายการของวันนี้ เลือกประเภท ช่องทาง และหมวด กรอกจำนวนเงิน แล้วกดบันทึก</p>
      </div>`;
    }
    return `<div class="card entries">${r.entries.slice().reverse().map(entryRow).join('')}</div>`;
  }

  function dayReal() {
    const r = engine.day(ui.date);
    const p = r.grabNet;
    const per = (n) => (n > 0 ? M(p / n) : '—');
    const rate = state.settings.depPerKm;
    let hint = '';
    if (r.km > 0 && rate > 0) hint = `หักค่าเสื่อมรถ ${M(r.depreciation)} แล้ว (${L.plain(r.km, 1)} กม. × ${M(rate)})`;
    else if (!(r.km > 0) && rate > 0) hint = 'ใส่กิโลเมตรตอนจดรายการแกร็ป เพื่อให้ระบบหักค่าเสื่อมรถให้อัตโนมัติ';
    const lg = r.legacy;
    const legacy = r.hasLegacy
      ? `<p class="help">รวมข้อมูลเดิมที่เคยกรอกมือไว้ (${L.plain(lg.trips, 0)} เที่ยว · ${L.plain(lg.hours, 1)} ชม. · ${L.plain(lg.km, 1)} กม.) <button type="button" class="link u" data-act="clear-legacy">ล้างส่วนนี้</button></p>` : '';
    return `<div class="grid3">
        ${cell('จำนวนเที่ยว', L.plain(r.trips, 0))}${cell('ชั่วโมงที่วิ่ง', fmtDur(r.hours))}${cell('กิโลเมตร', L.plain(r.km, 1))}
      </div>
      <div class="grid3" style="margin-top:14px;padding-top:12px;border-top:1px solid var(--line)">
        ${cell('กำไรต่อชั่วโมง', per(r.hours))}${cell('กำไรต่อกิโลเมตร', per(r.km))}${cell('กำไรต่อเที่ยว', per(r.trips))}
      </div>${hint ? `<p class="help hint">${hint}</p>` : ''}${legacy}`;
  }

  function dayView() {
    const tip = (!state.entries.length && !state.meta.tipDismissed)
      ? `<div class="tip"><span><b>เริ่มต้นง่ายๆ</b> ไปที่แท็บ “ตั้งค่า” เพิ่มค่าผ่อนรถ/ค่าโทรศัพท์ แล้วกลับมาจดรายการแรกที่นี่ เลือก “ช่องทาง” ให้ตรง (แกร็ป / เกม / อื่นๆ) ตัวเลขจะไม่ปนกัน</span><button type="button" class="link" data-act="dismiss-tip">ปิด</button></div>` : '';
    return `${tip}${dayBar()}
      <div id="d-hero">${dayHero()}</div>
      <h2 class="sec" id="d-form-title">${ui.form.editId ? 'แก้ไขรายการ' : 'เพิ่มรายการ'}</h2>
      <div id="d-form">${dayForm()}</div>
      <h2 class="sec">รายการของวัน</h2>
      <div id="d-entries">${dayEntries()}</div>
      <h2 class="sec">ข้อมูลการวิ่ง<small>รวมจากรายการแกร็ปของวัน</small></h2>
      <div class="card real"><div id="d-real">${dayReal()}</div></div>`;
  }

  const setHtml = (sel, html) => { const el = $(sel); if (el) el.innerHTML = html; };
  function refreshDay() { setHtml('#d-hero', dayHero()); setHtml('#d-entries', dayEntries()); setHtml('#d-real', dayReal()); }
  function refreshForm() { setHtml('#d-form', dayForm()); setHtml('#d-form-title', ui.form.editId ? 'แก้ไขรายการ' : 'เพิ่มรายการ'); }
  function refreshCurrent() { if (ui.tab === 'day') { refreshDay(); refreshForm(); } else render(); }

  function setDate(d) {
    if (!L.isYmd(d) || d > today) return;
    ui.date = d;
    resetForm();
    render();
  }

  function submitEntry() {
    ensureForm();
    const f = ui.form;
    const amount = L.round2(parseFloat(f.amount));
    if (!(amount > 0)) {
      const box = $('#f-amount');
      if (box) { box.classList.add('err'); box.focus(); }
      toast('กรอกจำนวนเงินก่อนนะ');
      return;
    }
    const base = { type: f.type, source: f.source, category: f.category, amount, note: f.note.trim().slice(0, 200) };
    if (f.type === 'income') base.pay = f.pay;
    if (formIsTrip(f)) {
      const km = parseFloat(f.km), mn = parseFloat(f.min);
      if (km > 0) base.km = L.round2(km);
      if (mn > 0) base.hours = Math.round((mn / 60) * 10000) / 10000;
    }

    if (f.editId) {
      const e = state.entries.find((x) => x.id === f.editId);
      if (e) { delete e.km; delete e.hours; Object.assign(e, base); if (f.type === 'expense') delete e.pay; }
      toast('แก้ไขรายการแล้ว');
    } else {
      const now = new Date();
      const time = ui.date === today ? `${L.pad(now.getHours())}:${L.pad(now.getMinutes())}` : '';
      state.entries.push(Object.assign({ id: L.uid(), date: ui.date, time }, base));
      toast(`${f.type === 'income' ? 'บันทึกรายรับ' : 'บันทึกรายจ่าย'} ${M(amount)} (${SRC[f.source].label}) แล้ว`);
    }
    resetForm();
    commit();
    refreshDay();
    refreshForm();
  }

  function startEdit(id) {
    const e = state.entries.find((x) => x.id === id);
    if (!e) return;
    ui.form = { type: e.type, source: e.source, category: e.category, pay: e.pay || 'cash', amount: String(e.amount), km: e.km ? String(e.km) : '', min: e.hours ? String(Math.round(e.hours * 60)) : '', note: e.note || '', editId: e.id };
    refreshForm();
    const t = $('#d-form-title');
    if (t) t.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function deleteEntry(id) {
    const idx = state.entries.findIndex((x) => x.id === id);
    if (idx < 0) return;
    const [removed] = state.entries.splice(idx, 1);
    if (ui.form.editId === id) resetForm();
    commit();
    refreshCurrent();
    toast('ลบรายการแล้ว', {
      label: 'เลิกทำ',
      fn: () => { state.entries.splice(Math.min(idx, state.entries.length), 0, removed); commit(); refreshCurrent(); }
    });
  }

  /* =====================================================================
   *  แท็บ "สรุปรายเดือน"
   * ===================================================================== */
  function niceStep(raw) {
    const p = Math.pow(10, Math.floor(Math.log(raw) / Math.LN10));
    for (const c of [1, 2, 2.5, 5, 10]) if (c * p >= raw) return c * p;
    return 10 * p;
  }

  function chartSVG(mo) {
    const W = 360, H = 190, ml = 36, mr = 8, mt = 16, mb = 22;
    const pw = W - ml - mr, ph = H - mt - mb;
    const N = mo.days.length;
    const vals = mo.days.map((r) => engine.measure(r.date));
    const target = state.settings.target;
    let maxV = Math.max(target, 0, ...vals);
    const minV = Math.min(0, ...vals);
    if (!(maxV - minV > 0)) maxV = 100;
    const step = niceStep((maxV - minV) / 4);
    const ymax = Math.ceil(maxV / step - 1e-9) * step;
    const ymin = Math.floor(minV / step + 1e-9) * step;
    const Y = (v) => mt + ((ymax - v) / (ymax - ymin)) * ph;
    const tick = (v) => (v === 0 ? '0' : `${v < 0 ? '−' : ''}${Math.abs(v) >= 1000 ? `${Math.abs(v) / 1000}k` : Math.abs(v)}`);

    let g = '';
    for (let v = ymin; v <= ymax + 1e-9; v += step) {
      const y = Y(v).toFixed(1);
      g += `<line x1="${ml}" x2="${W - mr}" y1="${y}" y2="${y}" stroke="${v === 0 ? '#3a4a41' : '#1c2721'}" stroke-width="1"/>`;
      g += `<text x="${ml - 6}" y="${(+y + 3).toFixed(1)}" text-anchor="end">${tick(Math.round(v * 100) / 100)}</text>`;
    }
    const slot = pw / N, bw = Math.max(2, slot * 0.62);
    vals.forEach((v, i) => {
      const x = ml + i * slot;
      if (Math.abs(v) >= 0.005) {
        const y0 = Y(0), y1 = Y(v), top = Math.min(y0, y1), h = Math.max(1.5, Math.abs(y1 - y0));
        g += `<rect x="${(x + (slot - bw) / 2).toFixed(1)}" y="${top.toFixed(1)}" width="${bw.toFixed(1)}" height="${h.toFixed(1)}" fill="${v > 0 ? '#4ed08b' : '#ff8a65'}" rx="1"/>`;
      }
      g += `<rect class="hit" data-act="open-day" data-date="${mo.days[i].date}" x="${x.toFixed(1)}" y="${mt}" width="${slot.toFixed(1)}" height="${ph}"><title>${thaiShort(mo.days[i].date)}: ${M(v)}</title></rect>`;
    });
    [1, 5, 10, 15, 20, 25, 30].filter((d) => d <= N).forEach((d) => {
      g += `<text x="${(ml + (d - 0.5) * slot).toFixed(1)}" y="${H - 6}" text-anchor="middle">${d}</text>`;
    });
    if (target > 0) {
      const y = Y(target).toFixed(1);
      g += `<line x1="${ml}" x2="${W - mr}" y1="${y}" y2="${y}" stroke="#f5b335" stroke-width="1.4" stroke-dasharray="4 3"/>`;
      g += `<text class="tl" x="${ml + 4}" y="${(+y - 4).toFixed(1)}">เป้า ${M(target)}</text>`;
    }
    return `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="กราฟกำไรสุทธิรายวันของเดือน${MON_F[mo.month - 1]}">${g}</svg>`;
  }

  function breakdownHtml(list, total, color) {
    if (!list.length) return '<p class="help" style="margin:0">ยังไม่มีข้อมูลเดือนนี้</p>';
    const max = list[0].value;
    return list.map((x) => `<div class="li">
      <div class="top2"><span>${esc(x.name)}</span><span>${M(x.value)}<em>${Math.round((x.value / total) * 100)}%</em></span></div>
      <div class="trk"><i style="width:${((x.value / max) * 100).toFixed(1)}%;background:${color}"></i></div>
    </div>`).join('');
  }

  function channelsHtml(mo) {
    const t = mo.totals;
    const hasGame = t.gameIncome > 0 || t.gameExpense > 0;
    const hasOther = t.otherNet > 0;
    const li = (name, color, val, sub) => `<div class="li"><div class="nm">${dotHtml(color)}${name}</div><div class="vl ${cls(val)}">${M(val)}</div>${sub ? `<div class="sb">${sub}</div>` : ''}</div>`;

    const parts = [[t.grabNet, SRC.grab.color], [t.gameNet, SRC.game.color], [t.otherNet, SRC.other.color]].filter((p) => p[0] > 0.005);
    const sum = parts.reduce((s, p) => s + p[0], 0);
    const stackbar = parts.length > 1 ? `<div class="stackbar">${parts.map((p) => `<i style="width:${((p[0] / sum) * 100).toFixed(1)}%;background:${p[1]}"></i>`).join('')}</div>` : '';

    let h = stackbar;
    h += li('แกร็ป', SRC.grab.color, t.grabNet, `รายรับ ${M(t.grabIncome)} − ต้นทุน ${M(t.grabExpense + t.reserve)}`);
    h += li('เกม', SRC.game.color, t.gameNet, hasGame ? `รายรับ ${M(t.gameIncome)} − ต้นทุน ${M(t.gameExpense)}` : 'ยังไม่มีรายการ · เลือกช่องทาง “เกม” ตอนเพิ่มรายการ');
    h += li('อื่นๆ', SRC.other.color, t.otherNet, hasOther ? '' : 'ยังไม่มีรายการ');
    h += `<div class="li sum"><div class="nm">รวมทุกช่องทาง</div><div class="vl ${cls(t.allNet)}">${M(t.allNet)}</div></div>`;
    if (t.personalTotal > 0.005) {
      h += li('ใช้จ่ายส่วนตัว', SRC.personal.color, -t.personalTotal, t.fixedPersonal > 0.005 ? `รวมค่าประจำส่วนตัว ${M(t.fixedPersonal)}` : '');
      h += `<div class="li sum"><div class="nm">คงเหลือสุทธิ</div><div class="vl ${cls(t.remain)}">${M(t.remain)}</div></div>`;
    }
    return h;
  }

  function monthTable(mo) {
    const all = ui.tableMode === 'all';
    const t = mo.totals;
    const money = (v, c) => `<td class="${c === undefined ? cls(v) : c}">${M(v)}</td>`;
    const zero = (v) => (Math.abs(v) < 0.005 ? 'z' : cls(v));
    let head, rows, total;
    if (!all) {
      head = '<th>วันที่</th><th>รายรับ</th><th>รายจ่าย</th><th>ประจำ/เสื่อม</th><th>สุทธิ</th>';
      rows = mo.rows.map((r) => `<tr><td><button type="button" class="link u" data-act="open-day" data-date="${r.date}">${thaiShortDow(r.date)}</button></td>
        ${money(r.grabIncome, '')}${money(r.grabExpense, '')}${money(r.reserve, '')}${money(r.grabNet)}</tr>`).join('');
      total = `<td>รวม</td>${money(t.grabIncome, '')}${money(t.grabExpense, '')}${money(t.reserve, '')}${money(t.grabNet)}`;
    } else {
      head = '<th>วันที่</th><th>แกร็ป</th><th>เกม</th><th>อื่นๆ</th><th>ส่วนตัว</th><th>คงเหลือ</th>';
      rows = mo.rows.map((r) => `<tr><td><button type="button" class="link u" data-act="open-day" data-date="${r.date}">${thaiShortDow(r.date)}</button></td>
        ${money(r.grabNet, zero(r.grabNet))}${money(r.gameNet, zero(r.gameNet))}${money(r.otherNet, zero(r.otherNet))}${money(-r.personalTotal, Math.abs(r.personalTotal) < 0.005 ? 'z' : 'neg')}${money(r.remain)}</tr>`).join('');
      total = `<td>รวม</td>${money(t.grabNet)}${money(t.gameNet, zero(t.gameNet))}${money(t.otherNet, zero(t.otherNet))}${money(-t.personalTotal, Math.abs(t.personalTotal) < 0.005 ? 'z' : 'neg')}${money(t.remain)}`;
    }
    if (!mo.rows.length) return '<p class="help" style="padding:0 14px 14px">ยังไม่มีข้อมูลเดือนนี้</p>';
    return `<div class="tablewrap"><table><thead><tr>${head}</tr></thead><tbody>${rows}<tr class="total">${total}</tr></tbody></table></div>`;
  }

  function monthView() {
    const { y, m } = ui.month;
    const mo = engine.month(y, m);
    const t = mo.totals;
    const isCur = y === +today.slice(0, 4) && m === +today.slice(5, 7);
    const all = state.settings.targetMode === 'all';
    const stat = (k, v, s) => `<div><div class="k">${k}</div><div class="v">${v}</div>${s ? `<div class="s">${s}</div>` : ''}</div>`;
    const none = '—';

    return `<div class="datebar">
        <button class="icon-btn" data-act="prev-month" aria-label="เดือนก่อนหน้า">‹</button>
        <div class="datecenter"><span class="dow">พ.ศ. ${y + 543}</span><span class="dtxt">${MON_F[m - 1]}</span></div>
        <button class="icon-btn" data-act="next-month" aria-label="เดือนถัดไป" ${isCur ? 'disabled' : ''}>›</button>
      </div>

      <div class="hero">
        <div class="head"><span>กำไรสุทธิ (แกร็ป)</span><span class="r">${mo.activeDays ? `${mo.activeDays} วันที่ออกวิ่ง · เฉลี่ย ${M(mo.avgPerActiveDay)} ต่อวัน` : 'ยังไม่มีวันที่ออกวิ่ง'}</span></div>
        <div class="big ${t.grabNet < -0.005 ? 'neg' : ''}">${M(t.grabNet)}</div>
        <div class="cells" style="margin-top:6px">${cell('รายรับ', M(t.grabIncome))}${cell('รายจ่าย', M(t.grabExpense))}${cell('ประจำ + เสื่อม', M(t.reserve))}</div>
      </div>

      <h2 class="sec">รายได้ทุกช่องทาง<small>แกร็ป · เกม · อื่นๆ</small></h2>
      <div class="card chan">${channelsHtml(mo)}</div>

      <div class="card stats" style="margin-top:14px">
        ${stat('กำไรเฉลี่ยต่อวันที่วิ่ง', mo.avgPerActiveDay === null ? none : M(mo.avgPerActiveDay))}
        ${stat('วันที่ทำเงินได้สูงสุด', mo.best ? M(mo.best.grabNet) : none, mo.best ? thaiShort(mo.best.date) : '')}
        ${stat('กำไรต่อชั่วโมง', mo.profitPerHour === null ? none : M(mo.profitPerHour))}
        ${stat('เที่ยวทั้งหมด', t.trips ? `${L.plain(t.trips, 0)} <small>เที่ยว</small>` : none)}
        ${stat('ระยะทางรวม', t.km ? `${L.plain(t.km, 1)} <small>กม.</small>` : none)}
        ${stat('ต้นทุนรวมต่อรายรับ', mo.costRatio === null ? none : `${Math.round(mo.costRatio * 100)}%`)}
      </div>

      <h2 class="sec">กำไรสุทธิรายวัน<small>${all ? 'ทุกช่องทาง' : 'แกร็ป'}</small></h2>
      <div class="card chartwrap">
        ${chartSVG(mo)}
        <div class="legend"><span><i style="background:#4ed08b"></i>มีกำไร</span><span><i style="background:#ff8a65"></i>ขาดทุน</span><span><i style="background:#f5b335"></i>เส้นประ = เป้าหมายรายวัน</span></div>
        <p class="help">แตะแท่งกราฟเพื่อเปิดดูวันนั้น วันที่ไม่ได้วิ่งจะติดลบเท่าค่าใช้จ่ายประจำเฉลี่ย</p>
      </div>

      <h2 class="sec">ต้นทุนแยกหมวด<small>แกร็ป</small></h2>
      <div class="card brk">${breakdownHtml(mo.costBreakdown, mo.costTotal, '#ff9a78')}</div>

      <h2 class="sec">รายรับแยกประเภท<small>แกร็ป</small></h2>
      <div class="card brk">${breakdownHtml(mo.incomeBreakdown, mo.incomeTotal, '#4ed08b')}</div>

      <h2 class="sec">รายวัน</h2>
      <div class="card tbl-card">
        <div class="tbl-head"><div class="seg mini">
          <button type="button" class="${ui.tableMode === 'grab' ? 'on' : ''}" data-act="table-mode" data-v="grab">แกร็ป</button>
          <button type="button" class="${ui.tableMode === 'all' ? 'on' : ''}" data-act="table-mode" data-v="all">ทุกช่องทาง</button>
        </div></div>
        ${monthTable(mo)}
      </div>

      <div class="stack" style="margin-top:14px">
        <button type="button" class="btn line" data-act="csv-days">ดาวน์โหลดสรุปรายวันเดือนนี้ (CSV)</button>
        <button type="button" class="btn line" data-act="csv-entries">ดาวน์โหลดรายการทุกรายการเดือนนี้ (CSV)</button>
      </div>`;
  }

  /* =====================================================================
   *  แท็บ "ตั้งค่า"
   * ===================================================================== */
  function fixedPerDayNow(f) {
    const y = +today.slice(0, 4), m = +today.slice(5, 7);
    return f.every === 'year' ? f.amount / L.daysInYear(y) : f.amount / L.daysInMonth(y, m);
  }

  function daysBetween(a, b) {
    return Math.round((L.parseYmd(b) - L.parseYmd(a)) / 86400000);
  }

  function settingsView() {
    const s = state.settings, ff = ui.fixedForm;
    const grabFx = state.fixed.filter((f) => f.scope !== 'personal');
    const perFx = state.fixed.filter((f) => f.scope === 'personal');
    const sumGrab = grabFx.reduce((a, f) => a + fixedPerDayNow(f), 0);
    const sumPer = perFx.reduce((a, f) => a + fixedPerDayNow(f), 0);

    const fixedRows = state.fixed.length
      ? state.fixed.map((f) => `<div class="fx">
          <div><div class="nm">${esc(f.name)}${f.scope === 'personal' ? '<span class="badge personal">ส่วนตัว</span>' : ''}</div>
          <div class="ds">${M(f.amount)} ต่อ${f.every === 'year' ? 'ปี' : 'เดือน'} · เฉลี่ยวันละ ${M(fixedPerDayNow(f))}</div></div>
          <button type="button" class="link" data-act="del-fixed" data-id="${esc(f.id)}">ลบ</button>
        </div>`).join('')
      : '<p class="empty-fx">ยังไม่มีค่าใช้จ่ายประจำ เช่น ค่าผ่อนรถ ค่าโทรศัพท์ ประกัน</p>';

    const fixedTotal = state.fixed.length
      ? `<div class="fx-total">รวมเฉลี่ยวันละ ${M(sumGrab)}${sumPer > 0.005 ? `<div class="ds muted small" style="font-weight:400">ส่วนตัว (ไม่นับเป็นต้นทุนแกร็ป) ${M(sumPer)} ต่อวัน</div>` : ''}</div>` : '';

    const lb = state.meta.lastBackup;
    const hasData = state.entries.length > 0;
    const stale = hasData && (!lb || daysBetween(lb, today) >= 7);
    const backupStatus = lb
      ? `สำรองล่าสุด ${thaiFull(lb)}${daysBetween(lb, today) > 0 ? ` (${daysBetween(lb, today)} วันก่อน)` : ' (วันนี้)'}`
      : 'ยังไม่เคยดาวน์โหลดไฟล์สำรองจากเครื่องนี้';

    return `<h2 class="sec">เป้าหมาย</h2>
      <div class="card stack">
        <label class="fld"><span>กำไรสุทธิที่อยากได้ต่อวัน (บาท)</span>
          <input class="in big" data-f="target" inputmode="numeric" placeholder="0" value="${s.target > 0 ? s.target : ''}"></label>
        <div>
          <div class="small muted" style="margin-bottom:6px">นับเป้าหมายจาก</div>
          <div class="seg">
            <button type="button" class="${s.targetMode === 'grab' ? 'on' : ''}" data-act="target-mode" data-v="grab">แกร็ปอย่างเดียว</button>
            <button type="button" class="${s.targetMode === 'all' ? 'on' : ''}" data-act="target-mode" data-v="all">ทุกช่องทาง</button>
          </div>
          <p class="help">${s.targetMode === 'grab'
            ? 'แนะนำ: ขายของในเกมได้เงินวันไหน ก็ไม่ทำให้รู้สึกว่าขับถึงเป้าแล้วทั้งที่ยังไม่ถึง'
            : 'รายได้จากเกมและรายได้อื่นจะถูกรวมเข้าไปในแถบความคืบหน้าและกราฟรายเดือนด้วย'}</p>
        </div>
        <div class="saved" id="saved-a">บันทึกอัตโนมัติแล้ว</div>
      </div>

      <h2 class="sec">ค่าเสื่อมและเงินสำรองซ่อม</h2>
      <div class="card">
        <label class="fld"><span>กันเงินไว้ต่อกิโลเมตร (บาท)</span>
          <input class="in big" data-f="dep" inputmode="decimal" placeholder="0" value="${s.depPerKm > 0 ? s.depPerKm : ''}"></label>
        <p class="help">ระบบนำไปคูณกับกิโลเมตรที่กรอกในแต่ละวัน แล้วหักจากกำไร เพื่อสำรองไว้สำหรับยาง น้ำมันเครื่อง และการสึกหรอของรถ ถ้าไม่ต้องการให้หัก ปล่อยว่างไว้</p>
        <div class="saved" id="saved-b">บันทึกอัตโนมัติแล้ว</div>
      </div>

      <h2 class="sec">ค่าใช้จ่ายประจำ</h2>
      <div class="card">
        ${fixedRows}${fixedTotal}
        <div class="fx-sub stack">
          <div>
            <div class="lbl">เพิ่มรายการใหม่</div>
            <div class="chips">${L.FIXED_PRESETS.map((p) => `<button type="button" class="chip ${ff.name === p ? 'on' : ''}" data-act="preset" data-v="${esc(p)}">${esc(p)}</button>`).join('')}</div>
          </div>
          <label class="fld"><span>ชื่อรายการ</span><input class="in big" id="fx-name" data-f="fixed-name" maxlength="60" autocomplete="off" placeholder="เช่น ค่าผ่อนรถ" value="${esc(ff.name)}"></label>
          <div class="row">
            <label class="fld"><span>จำนวนเงิน (บาท)</span><input class="in big" id="fx-amount" data-f="fixed-amount" inputmode="decimal" autocomplete="off" placeholder="0" value="${esc(ff.amount)}"></label>
            <div><div class="small muted" style="margin-bottom:6px">จ่ายทุก</div>
              <div class="seg"><button type="button" class="${ff.every === 'month' ? 'on' : ''}" data-act="fixed-every" data-v="month">เดือน</button><button type="button" class="${ff.every === 'year' ? 'on' : ''}" data-act="fixed-every" data-v="year">ปี</button></div></div>
          </div>
          <div><div class="small muted" style="margin-bottom:6px">นับเป็นต้นทุนของ</div>
            <div class="seg"><button type="button" class="${ff.scope === 'grab' ? 'on' : ''}" data-act="fixed-scope" data-v="grab">แกร็ป</button><button type="button" class="${ff.scope === 'personal' ? 'on' : ''}" data-act="fixed-scope" data-v="personal">ส่วนตัว</button></div>
            <p class="help" style="margin-top:6px">${ff.scope === 'grab' ? 'หักจากกำไรแกร็ปทุกวัน' : 'แสดงเป็นค่าใช้จ่ายส่วนตัว ไม่หักจากกำไรแกร็ป (เช่น ค่าเน็ตบ้าน)'}</p></div>
          <button type="button" class="btn" data-act="add-fixed">เพิ่มค่าใช้จ่ายประจำ</button>
        </div>
        <p class="help">ระบบหารเป็นรายวันให้เอง และนับตั้งแต่วันแรกที่คุณบันทึกข้อมูลเป็นต้นไป วันที่ไม่ได้ออกวิ่งก็ถูกหักด้วย เพราะค่าผ่อนรถยังต้องจ่าย การเพิ่ม/ลบรายการมีผลย้อนหลังกับทุกวันที่นับแล้ว</p>
      </div>

      <h2 class="sec">สำรองและกู้คืนข้อมูล</h2>
      <div class="card stack">
        <p class="help" style="margin:0">ข้อมูลเก็บอยู่ในเบราว์เซอร์ของเครื่องนี้เท่านั้น ถ้าล้างข้อมูลเบราว์เซอร์ ถอนการติดตั้ง หรือเปลี่ยนเครื่อง ข้อมูลจะหาย จึงควรดาวน์โหลดไฟล์สำรองเก็บไว้เป็นระยะ แล้วนำเข้าที่เครื่องใหม่ได้</p>
        <p class="help ${stale ? 'warn' : ''}" style="margin:0">${backupStatus}${stale ? ' · ควรสำรองข้อมูลตอนนี้' : ''}</p>
        <p class="help" style="margin:0">ตอนนี้มี ${state.entries.length} รายการ · ${Object.keys(state.days).length} วันที่กรอกข้อมูลการวิ่ง</p>
        <div class="row">
          <button type="button" class="btn line" data-act="backup">ดาวน์โหลดไฟล์สำรอง</button>
          <button type="button" class="btn line" data-act="import">นำเข้าจากไฟล์สำรอง</button>
        </div>
        <input type="file" id="import-file" accept=".json,application/json" hidden>
        <button type="button" class="btn danger" data-act="wipe">ลบข้อมูลทั้งหมดในเครื่องนี้</button>
      </div>`;
  }

  function flashSaved(id) {
    const el = document.getElementById(id);
    if (!el) return;
    el.classList.add('show');
    clearTimeout(flashSaved.t);
    flashSaved.t = setTimeout(() => el.classList.remove('show'), 1200);
  }

  function addFixed() {
    const ff = ui.fixedForm;
    const name = ff.name.trim();
    const amount = L.round2(parseFloat(ff.amount));
    const bad = [];
    if (!name) bad.push('#fx-name');
    if (!(amount > 0)) bad.push('#fx-amount');
    if (bad.length) {
      bad.forEach((s) => { const el = $(s); if (el) el.classList.add('err'); });
      const first = $(bad[0]); if (first) first.focus();
      toast(!name ? 'ใส่ชื่อรายการก่อนนะ' : 'กรอกจำนวนเงินก่อนนะ');
      return;
    }
    state.fixed.push({ id: L.uid(), name: name.slice(0, 60), amount, every: ff.every, scope: ff.scope });
    ui.fixedForm = { name: '', amount: '', every: ff.every, scope: ff.scope };
    commit();
    render();
    toast(`เพิ่ม “${name}” แล้ว`);
  }

  /* ---------- ไฟล์: ดาวน์โหลด / นำเข้า ---------- */
  function download(name, text, mime, bom) {
    const blob = new Blob([bom ? '﻿' + text : text], { type: `${mime};charset=utf-8` });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = name;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
  }

  function doBackup() {
    state.meta.lastBackup = today;
    download(`driver-ledger-backup-${today}.json`, JSON.stringify(state, null, 2), 'application/json');
    commit();
    render();
    toast('ดาวน์โหลดไฟล์สำรองแล้ว เก็บไว้ในที่ปลอดภัยนะ');
  }

  function doImport(file) {
    const rd = new FileReader();
    rd.onerror = () => alert('อ่านไฟล์ไม่สำเร็จ');
    rd.onload = () => {
      let raw;
      try { raw = JSON.parse(rd.result); } catch (_) { alert('ไฟล์นี้อ่านไม่ได้ ไม่ใช่ไฟล์สำรองของแอปนี้'); return; }
      if (!raw || typeof raw !== 'object' || !Array.isArray(raw.entries)) { alert('ไฟล์นี้ไม่ใช่ไฟล์สำรองของแอปนี้'); return; }
      const next = L.normalize(raw);
      const msg = `นำเข้า ${next.entries.length} รายการจากไฟล์นี้?\n\nข้อมูลเดิมในเครื่อง (${state.entries.length} รายการ) จะถูกแทนที่ทั้งหมด`;
      if (!confirm(msg)) return;
      stash('before-import');
      state = next;
      ui.form = { type: 'income', source: 'grab', category: 'รับผู้โดยสาร', pay: 'cash', amount: '', km: '', min: '', note: '', editId: null };
      commit();
      render();
      toast(`นำเข้า ${next.entries.length} รายการแล้ว`);
    };
    rd.readAsText(file);
  }

  function doWipe() {
    if (!confirm('ลบข้อมูลทั้งหมดในเครื่องนี้?\n\nรายการ ค่าประจำ และการตั้งค่าจะหายหมด (ควรดาวน์โหลดไฟล์สำรองก่อน)')) return;
    if (!confirm('แน่ใจนะ? ลบแล้วเอากลับมาไม่ได้')) return;
    stash('before-wipe');
    state = L.emptyState();
    ui.date = today;
    commit();
    render();
    toast('ลบข้อมูลทั้งหมดแล้ว');
  }

  /* =====================================================================
   *  วาดหน้า + จัดการเหตุการณ์
   * ===================================================================== */
  const view = $('#view');

  function render() {
    document.querySelectorAll('.tabs button').forEach((b) => {
      const on = b.dataset.tab === ui.tab;
      b.setAttribute('aria-selected', String(on));
    });
    const warn = storageOK ? '' : '<div class="tip"><span><b>เก็บข้อมูลไม่ได้</b> เบราว์เซอร์นี้บล็อกการเก็บข้อมูล (อาจเปิดโหมดส่วนตัวอยู่) ข้อมูลจะหายเมื่อปิดหน้านี้</span></div>';
    view.innerHTML = warn + (ui.tab === 'day' ? dayView() : ui.tab === 'month' ? monthView() : settingsView());
  }

  function switchTab(tab) {
    ui.tab = tab;
    render();
    window.scrollTo(0, 0);
  }

  $('.tabs').addEventListener('click', (e) => {
    const b = e.target.closest('[data-tab]');
    if (b) switchTab(b.dataset.tab);
  });

  view.addEventListener('click', (e) => {
    const el = e.target.closest('[data-act]');
    if (!el) return;
    const { act, v, id, date } = el.dataset;

    switch (act) {
      /* รายวัน */
      case 'prev-day': setDate(L.addDays(ui.date, -1)); break;
      case 'next-day': if (ui.date < today) setDate(L.addDays(ui.date, 1)); break;
      case 'today': setDate(today); break;
      case 'type': ui.form.type = v; ensureForm(); refreshForm(); break;
      case 'source': ui.form.source = v; ensureForm(); refreshForm(); break;
      case 'cat': ui.form.category = v; refreshForm(); break;
      case 'pay': ui.form.pay = v; refreshForm(); break;
      case 'submit': submitEntry(); break;
      case 'cancel-edit': resetForm(); refreshForm(); break;
      case 'edit-entry': startEdit(id); break;
      case 'del-entry': deleteEntry(id); break;
      case 'clear-legacy': delete state.days[ui.date]; commit(); refreshDay(); toast('ล้างข้อมูลเดิมของวันนี้แล้ว'); break;
      case 'dismiss-tip': state.meta.tipDismissed = true; commit(); render(); break;

      /* รายเดือน */
      case 'prev-month': {
        const d = new Date(ui.month.y, ui.month.m - 2, 1);
        ui.month = { y: d.getFullYear(), m: d.getMonth() + 1 };
        render(); break;
      }
      case 'next-month': {
        const cur = { y: +today.slice(0, 4), m: +today.slice(5, 7) };
        if (ui.month.y * 12 + ui.month.m < cur.y * 12 + cur.m) {
          const d = new Date(ui.month.y, ui.month.m, 1);
          ui.month = { y: d.getFullYear(), m: d.getMonth() + 1 };
          render();
        }
        break;
      }
      case 'open-day': ui.tab = 'day'; setDate(date); window.scrollTo(0, 0); break;
      case 'table-mode': ui.tableMode = v; render(); break;
      case 'csv-days': {
        const mo = engine.month(ui.month.y, ui.month.m);
        download(`driver-ledger-${ui.month.y}-${L.pad(ui.month.m)}-days.csv`, L.daysCsv(mo), 'text/csv', true);
        break;
      }
      case 'csv-entries':
        download(`driver-ledger-${ui.month.y}-${L.pad(ui.month.m)}-entries.csv`, L.entriesCsv(state, `${ui.month.y}-${L.pad(ui.month.m)}`), 'text/csv', true);
        break;

      /* ตั้งค่า */
      case 'target-mode': state.settings.targetMode = v; commit(); render(); flashSaved('saved-a'); break;
      case 'preset': ui.fixedForm.name = v; render(); break;
      case 'fixed-every': ui.fixedForm.every = v; render(); break;
      case 'fixed-scope': ui.fixedForm.scope = v; render(); break;
      case 'add-fixed': addFixed(); break;
      case 'del-fixed': {
        const f = state.fixed.find((x) => x.id === id);
        if (f && confirm(`ลบ “${f.name}” ออกจากค่าใช้จ่ายประจำ?\n\nตัวเลขของทุกวันที่ผ่านมาจะคำนวณใหม่`)) {
          state.fixed = state.fixed.filter((x) => x.id !== id);
          commit(); render();
        }
        break;
      }
      case 'backup': doBackup(); break;
      case 'import': { const inp = $('#import-file'); if (inp) inp.click(); break; }
      case 'wipe': doWipe(); break;
      default: break;
    }
  });

  view.addEventListener('input', (e) => {
    const t = e.target, f = t.dataset.f;
    if (!f) return;
    switch (f) {
      case 'amount': t.value = cleanNum(t.value); ui.form.amount = t.value; t.classList.remove('err'); break;
      case 'note': ui.form.note = t.value; break;
      case 'f-km': t.value = cleanNum(t.value); ui.form.km = t.value; break;
      case 'f-min': t.value = t.value.replace(/\D/g, ''); ui.form.min = t.value; break;
      case 'target': t.value = cleanNum(t.value); state.settings.target = Math.max(0, L.num(t.value)); commit(); flashSaved('saved-a'); break;
      case 'dep': t.value = cleanNum(t.value); state.settings.depPerKm = Math.max(0, L.num(t.value)); commit(); flashSaved('saved-b'); break;
      case 'fixed-name': ui.fixedForm.name = t.value; t.classList.remove('err'); break;
      case 'fixed-amount': t.value = cleanNum(t.value); ui.fixedForm.amount = t.value; t.classList.remove('err'); break;
      default: break;
    }
  });

  view.addEventListener('change', (e) => {
    const t = e.target;
    if (t.dataset.f === 'date-pick' && t.value) setDate(t.value);
    if (t.id === 'import-file' && t.files && t.files[0]) { doImport(t.files[0]); t.value = ''; }
  });

  view.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter' || e.isComposing) return;
    const f = e.target.dataset && e.target.dataset.f;
    if (f === 'amount' || f === 'note' || f === 'f-km' || f === 'f-min') { e.preventDefault(); submitEntry(); }
    if (f === 'fixed-name' || f === 'fixed-amount') { e.preventDefault(); addFixed(); }
  });

  /* ---------- ข้ามเที่ยงคืน: อัปเดต "วันนี้" ให้เอง ---------- */
  function tick() {
    const t = nowYmd();
    if (t === today) return;
    const follow = ui.date === today;
    const monthFollow = ui.month.y === +today.slice(0, 4) && ui.month.m === +today.slice(5, 7);
    today = t;
    if (follow) ui.date = t;
    if (monthFollow) ui.month = { y: +t.slice(0, 4), m: +t.slice(5, 7) };
    engine = L.createEngine(state, today);
    const a = document.activeElement;
    if (!(a && (a.tagName === 'INPUT' || a.tagName === 'TEXTAREA'))) render();   // ไม่ตัดจังหวะตอนกำลังพิมพ์
  }
  setInterval(tick, 30000);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) tick(); });

  render();

  if ('serviceWorker' in navigator && /^https?:$/.test(location.protocol)) {
    window.addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => {}));
  }
})();
