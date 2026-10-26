/* logic.js — ส่วนคำนวณล้วนๆ ไม่แตะ DOM (ทดสอบด้วย node ได้)
 *
 * แนวคิดหลัก
 *  - ทุกรายการมี "ช่องทาง" (source): grab = แกร็ป, game = เกม, other = รายได้อื่น, personal = ใช้จ่ายส่วนตัว
 *  - กำไรแกร็ป = รายรับแกร็ป − รายจ่ายแกร็ป − ค่าเสื่อม(กม. × อัตรา) − ค่าใช้จ่ายประจำ(รายวัน)
 *  - กำไรเกม   = รายรับเกม − รายจ่ายเกม
 *  - ค่าใช้จ่ายประจำถูกหารเป็นรายวัน และหักทุกวันตั้งแต่ "วันแรกที่มีข้อมูล" จนถึงวันนี้
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.Ledger = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  /* ---------- ค่าคงที่ ---------- */
  var SOURCES = {
    grab:     { label: 'แกร็ป',    color: '#4ed08b' },
    game:     { label: 'เกม',      color: '#7aa2ff' },
    other:    { label: 'อื่นๆ',    color: '#f5b335' },
    personal: { label: 'ส่วนตัว',  color: '#ff8a65' }
  };
  var INCOME_SOURCES = ['grab', 'game', 'other'];
  var EXPENSE_SOURCES = ['grab', 'game', 'personal'];
  var CATEGORIES = {
    income: {
      grab:  ['รับผู้โดยสาร', 'ส่งอาหาร', 'ส่งพัสดุ', 'ทิป', 'โบนัส/โปรโมชั่น', 'อื่นๆ'],
      game:  ['ขายไอเท็ม', 'ขายเงิน/เหรียญเกม', 'ขายไอดี', 'อื่นๆ'],
      other: ['ขายของ', 'งานเสริม', 'มีคนโอนให้', 'อื่นๆ']
    },
    expense: {
      grab:     ['น้ำมัน/ค่าชาร์จ', 'ทางด่วน', 'ค่าล้างรถ', 'ซ่อม/อะไหล่', 'ค่าจอดรถ', 'อื่นๆ'],
      game:     ['ซื้อไอเท็ม', 'เติมเงินเกม', 'อื่นๆ'],
      personal: ['อาหาร', 'เดินทาง', 'ของใช้', 'ที่พัก/น้ำไฟ', 'สุขภาพ', 'บันเทิง', 'อื่นๆ']
    }
  };
  var FIXED_PRESETS = ['ผ่อนรถ', 'ประกันภัย', 'ภาษีรถ/พ.ร.บ.', 'ค่าเช่ารถ', 'ค่าโทรศัพท์'];
  var DEP_LABEL = 'ค่าเสื่อมรถ (ต่อ กม.)';
  // หมวดที่นับเป็น "1 เที่ยว" (ทิป/โบนัสไม่นับ)
  var TRIP_CATEGORIES = ['รับผู้โดยสาร', 'ส่งอาหาร', 'ส่งพัสดุ'];
  function isTrip(e) {
    return e.type === 'income' && e.source === 'grab' && TRIP_CATEGORIES.indexOf(e.category) >= 0;
  }

  /* ---------- ตัวช่วยทั่วไป ---------- */
  function num(x) { x = parseFloat(x); return isFinite(x) ? x : 0; }
  function round2(x) { return Math.round((+x || 0) * 100) / 100; }
  function str(x, max) {
    if (x === null || x === undefined) return '';
    return String(x).trim().slice(0, max);
  }
  function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 8); }

  /* ---------- วันที่ (ใช้เวลาท้องถิ่นของเครื่อง) ---------- */
  function pad(n) { return (n < 10 ? '0' : '') + n; }
  function toYmd(d) { return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }
  function parseYmd(s) { var p = s.split('-'); return new Date(+p[0], +p[1] - 1, +p[2]); }
  function isYmd(s) { return typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s) && toYmd(parseYmd(s)) === s; }
  function addDays(s, n) { var d = parseYmd(s); d.setDate(d.getDate() + n); return toYmd(d); }
  function daysInMonth(y, m) { return new Date(y, m, 0).getDate(); } // m = 1..12
  function daysInYear(y) { return ((y % 4 === 0 && y % 100 !== 0) || y % 400 === 0) ? 366 : 365; }

  /* ---------- รูปแบบตัวเลข ---------- */
  // จำนวนเต็มไม่แสดงทศนิยม (฿1,300) ถ้ามีเศษแสดง 2 ตำแหน่ง (฿512.10)
  function money(v, opts) {
    opts = opts || {};
    var x = round2(v);
    if (x === 0) x = 0;
    var neg = x < 0, a = Math.abs(x);
    var isInt = Math.abs(a - Math.round(a)) < 0.005;
    var s = a.toLocaleString('en-US', {
      minimumFractionDigits: isInt ? 0 : 2,
      maximumFractionDigits: isInt ? 0 : 2
    });
    var sign = neg ? '−' : (opts.plus && x > 0 ? '+' : '');
    return sign + '฿' + s;
  }
  function plain(v, maxDp) {
    return (+v || 0).toLocaleString('en-US', { maximumFractionDigits: maxDp === undefined ? 2 : maxDp });
  }

  /* ---------- สถานะเริ่มต้น + ตรวจ/ล้างข้อมูลที่นำเข้า ---------- */
  function emptyState() {
    return {
      v: 1,
      settings: { target: 1000, targetMode: 'grab', depPerKm: 5 },
      fixed: [],     // {id,name,amount,every:'month'|'year',scope:'grab'|'personal'}
      entries: [],   // {id,date,time,type,source,category,amount,pay,note}
      days: {},      // 'YYYY-MM-DD' -> {trips,hours,km}
      meta: { lastBackup: null, tipDismissed: false }
    };
  }

  function normalize(raw) {
    var s = emptyState();
    if (!raw || typeof raw !== 'object') return s;

    var st = raw.settings || {};
    if (st.target !== undefined) s.settings.target = Math.max(0, num(st.target));
    s.settings.targetMode = st.targetMode === 'all' ? 'all' : 'grab';
    if (st.depPerKm !== undefined) s.settings.depPerKm = Math.max(0, num(st.depPerKm));

    var seen = {};
    function freshId(id) {
      id = (typeof id === 'string' && id) ? id.slice(0, 40) : uid();
      while (seen[id]) id = uid();
      seen[id] = 1;
      return id;
    }

    (Array.isArray(raw.fixed) ? raw.fixed : []).forEach(function (f) {
      if (!f || typeof f !== 'object') return;
      var amount = num(f.amount), name = str(f.name, 60);
      if (!(amount > 0) || !name) return;
      s.fixed.push({
        id: freshId(f.id), name: name, amount: round2(amount),
        every: f.every === 'year' ? 'year' : 'month',
        scope: f.scope === 'personal' ? 'personal' : 'grab'
      });
    });

    (Array.isArray(raw.entries) ? raw.entries : []).forEach(function (e) {
      if (!e || typeof e !== 'object') return;
      var amount = num(e.amount);
      if (!isYmd(e.date) || !(amount > 0)) return;
      var type = e.type === 'expense' ? 'expense' : (e.type === 'income' ? 'income' : null);
      if (!type) return;
      var allowed = type === 'income' ? INCOME_SOURCES : EXPENSE_SOURCES;
      var source = allowed.indexOf(e.source) >= 0 ? e.source : (type === 'income' ? (e.source === 'personal' ? 'other' : 'grab') : (e.source === 'other' ? 'personal' : 'grab'));
      var entry = {
        id: freshId(e.id), date: e.date,
        time: /^\d{2}:\d{2}$/.test(e.time || '') ? e.time : '',
        type: type, source: source,
        category: str(e.category, 40) || 'อื่นๆ',
        amount: round2(amount),
        note: str(e.note, 200)
      };
      if (type === 'income') entry.pay = e.pay === 'transfer' ? 'transfer' : 'cash';
      if (isTrip(entry)) {
        var km = round2(Math.max(0, num(e.km)));
        var hrs = Math.round(Math.max(0, num(e.hours)) * 10000) / 10000;
        if (km > 0) entry.km = km;
        if (hrs > 0) entry.hours = hrs;
      }
      s.entries.push(entry);
    });

    var days = raw.days && typeof raw.days === 'object' ? raw.days : {};
    Object.keys(days).forEach(function (k) {
      if (!isYmd(k)) return;
      var r = days[k] || {};
      var rec = { trips: Math.max(0, num(r.trips)), hours: Math.max(0, num(r.hours)), km: Math.max(0, num(r.km)) };
      if (rec.trips || rec.hours || rec.km) s.days[k] = rec;
    });

    var meta = raw.meta || {};
    s.meta.lastBackup = isYmd(meta.lastBackup) ? meta.lastBackup : null;
    s.meta.tipDismissed = !!meta.tipDismissed;
    return s;
  }

  /* ---------- เครื่องคำนวณ ---------- */
  // today = 'YYYY-MM-DD' ของวันนี้ (ส่งเข้ามาเพื่อให้ทดสอบได้)
  function createEngine(state, today) {
    var byDate = {};
    var first = null;

    state.entries.forEach(function (e) {
      (byDate[e.date] = byDate[e.date] || []).push(e);
      if (first === null || e.date < first) first = e.date;
    });
    Object.keys(state.days).forEach(function (d) {
      var r = state.days[d];
      if (num(r.trips) > 0 || num(r.hours) > 0 || num(r.km) > 0) {
        if (first === null || d < first) first = d;
      }
    });

    var cache = {};

    function fixedPerDay(f, date) {
      var y = +date.slice(0, 4), m = +date.slice(5, 7);
      return f.every === 'year' ? f.amount / daysInYear(y) : f.amount / daysInMonth(y, m);
    }

    function day(date) {
      if (cache[date]) return cache[date];
      var list = byDate[date] || [];
      var r = {
        date: date, entries: list,
        grabIncome: 0, grabExpense: 0, grabCash: 0,
        gameIncome: 0, gameExpense: 0, otherIncome: 0,
        personalExpense: 0, incomeAll: 0, cashAll: 0
      };
      var eTrips = 0, eHours = 0, eKm = 0;
      list.forEach(function (e) {
        if (isTrip(e)) { eTrips++; eHours += num(e.hours); eKm += num(e.km); }
        if (e.type === 'income') {
          r.incomeAll += e.amount;
          if (e.pay === 'cash') r.cashAll += e.amount;
          if (e.source === 'grab') {
            r.grabIncome += e.amount;
            if (e.pay === 'cash') r.grabCash += e.amount;
          } else if (e.source === 'game') r.gameIncome += e.amount;
          else r.otherIncome += e.amount;
        } else {
          if (e.source === 'grab') r.grabExpense += e.amount;
          else if (e.source === 'game') r.gameExpense += e.amount;
          else r.personalExpense += e.amount;
        }
      });

      var rec = state.days[date] || {};
      // ข้อมูลการวิ่ง = รวมจากรายการแกร็ปของวัน (+ ค่าเก่าที่เคยกรอกมือ ถ้ามี)
      r.legacy = { trips: num(rec.trips), hours: num(rec.hours), km: num(rec.km) };
      r.hasLegacy = r.legacy.trips > 0 || r.legacy.hours > 0 || r.legacy.km > 0;
      r.trips = r.legacy.trips + eTrips;
      r.hours = r.legacy.hours + eHours;
      r.km = r.legacy.km + eKm;

      r.charged = first !== null && date >= first && date <= today;
      r.fixedGrab = 0; r.fixedPersonal = 0;
      if (r.charged) {
        state.fixed.forEach(function (f) {
          var per = fixedPerDay(f, date);
          if (f.scope === 'personal') r.fixedPersonal += per; else r.fixedGrab += per;
        });
      }
      r.depreciation = r.km * state.settings.depPerKm;
      r.reserve = r.depreciation + r.fixedGrab;                       // ประจำ + เสื่อม (ฝั่งแกร็ป)
      r.grabNet = r.grabIncome - r.grabExpense - r.reserve;
      r.gameNet = r.gameIncome - r.gameExpense;
      r.otherNet = r.otherIncome;
      r.allNet = r.grabNet + r.gameNet + r.otherNet;                  // ทุกช่องทาง ก่อนหักส่วนตัว
      r.personalTotal = r.personalExpense + r.fixedPersonal;
      r.remain = r.allNet - r.personalTotal;                          // คงเหลือจริง
      r.active = r.grabIncome > 0 || r.trips > 0 || r.hours > 0 || r.km > 0;
      cache[date] = r;
      return r;
    }

    // ตัวเลขที่ใช้เทียบกับเป้าหมาย ขึ้นกับการตั้งค่า (แกร็ปอย่างเดียว / ทุกช่องทาง)
    function measure(date) {
      var r = day(date);
      return state.settings.targetMode === 'all' ? r.allNet : r.grabNet;
    }

    function month(y, m) {
      var N = daysInMonth(y, m), ym = y + '-' + pad(m);
      var keys = ['grabIncome', 'grabExpense', 'depreciation', 'fixedGrab', 'reserve', 'grabNet',
        'gameIncome', 'gameExpense', 'gameNet', 'otherNet', 'allNet',
        'personalExpense', 'fixedPersonal', 'personalTotal', 'remain',
        'trips', 'hours', 'km', 'incomeAll', 'cashAll'];
      var t = {}; keys.forEach(function (k) { t[k] = 0; });
      var days = [], rows = [], activeDays = 0, best = null;
      var cost = {}, inc = {};

      function addTo(map, name, kind, v) {
        var k = kind + ':' + name;
        if (!map[k]) map[k] = { name: name, kind: kind, value: 0 };
        map[k].value += v;
      }

      for (var d = 1; d <= N; d++) {
        var ds = ym + '-' + pad(d);
        var r = day(ds);
        days.push(r);
        keys.forEach(function (k) { t[k] += r[k]; });
        if (r.active) {
          activeDays++;
          if (best === null || r.grabNet > best.grabNet) best = r;
        }
        if (r.charged || r.entries.length || r.trips || r.hours || r.km) rows.push(r);

        r.entries.forEach(function (e) {
          if (e.source !== 'grab') return;
          if (e.type === 'income') addTo(inc, e.category, 'income', e.amount);
          else addTo(cost, e.category, 'expense', e.amount);
        });
        if (r.depreciation > 0) addTo(cost, DEP_LABEL, 'dep', r.depreciation);
        if (r.charged) {
          state.fixed.forEach(function (f) {
            if (f.scope !== 'personal') addTo(cost, f.name, 'fixed', fixedPerDay(f, ds));
          });
        }
      }

      function list(map) {
        return Object.keys(map).map(function (k) { return map[k]; })
          .filter(function (x) { return x.value > 0.0001; })
          .sort(function (a, b) { return b.value - a.value; });
      }
      var costList = list(cost), incList = list(inc);
      var costTotal = costList.reduce(function (s, x) { return s + x.value; }, 0);
      var incTotal = incList.reduce(function (s, x) { return s + x.value; }, 0);

      return {
        year: y, month: m, days: days, rows: rows.slice().reverse(), totals: t,
        activeDays: activeDays, best: best,
        avgPerActiveDay: activeDays ? t.grabNet / activeDays : null,
        profitPerHour: t.hours > 0 ? t.grabNet / t.hours : null,
        costRatio: t.grabIncome > 0 ? (t.grabExpense + t.reserve) / t.grabIncome : null,
        costBreakdown: costList, costTotal: costTotal,
        incomeBreakdown: incList, incomeTotal: incTotal
      };
    }

    return { first: first, today: today, day: day, measure: measure, month: month };
  }

  /* ---------- CSV ---------- */
  function csvCell(v) {
    if (v === null || v === undefined) return '';
    if (typeof v === 'string' && /^[=+\-@]/.test(v)) v = "'" + v;   // กันสูตรใน Excel
    v = String(v);
    return /[",\n\r]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v;
  }
  function csvRow(a) { return a.map(csvCell).join(','); }
  function f2(x) { return round2(x).toFixed(2); }

  function daysCsv(m) {
    var out = [csvRow(['วันที่', 'รายรับแกร็ป', 'รายจ่ายแกร็ป', 'ค่าเสื่อมรถ', 'ค่าใช้จ่ายประจำ(แกร็ป)', 'กำไรแกร็ป',
      'กำไรเกม', 'รายได้อื่นๆ', 'ใช้จ่ายส่วนตัว(รวมประจำส่วนตัว)', 'คงเหลือสุทธิ', 'เที่ยว', 'ชั่วโมง', 'กม.'])];
    m.rows.slice().reverse().forEach(function (r) {
      out.push(csvRow([r.date, f2(r.grabIncome), f2(r.grabExpense), f2(r.depreciation), f2(r.fixedGrab), f2(r.grabNet),
        f2(r.gameNet), f2(r.otherNet), f2(r.personalTotal), f2(r.remain), r.trips, r.hours, r.km]));
    });
    var t = m.totals;
    out.push(csvRow(['รวม', f2(t.grabIncome), f2(t.grabExpense), f2(t.depreciation), f2(t.fixedGrab), f2(t.grabNet),
      f2(t.gameNet), f2(t.otherNet), f2(t.personalTotal), f2(t.remain), t.trips, t.hours, t.km]));
    return out.join('\r\n');
  }

  function entriesCsv(state, ym) {
    var rows = state.entries.filter(function (e) { return e.date.slice(0, 7) === ym; })
      .sort(function (a, b) { return (a.date + a.time) < (b.date + b.time) ? -1 : 1; });
    var out = [csvRow(['วันที่', 'เวลา', 'ประเภท', 'ช่องทาง', 'หมวด', 'จำนวนเงิน', 'วิธีรับเงิน', 'กม.', 'นาที', 'บันทึก'])];
    rows.forEach(function (e) {
      out.push(csvRow([e.date, e.time, e.type === 'income' ? 'รายรับ' : 'รายจ่าย', SOURCES[e.source].label, e.category,
        f2(e.amount), e.type === 'income' ? (e.pay === 'cash' ? 'เงินสด' : 'โอน') : '',
        e.km || '', e.hours ? Math.round(e.hours * 60) : '', e.note]));
    });
    return out.join('\r\n');
  }

  return {
    SOURCES: SOURCES, INCOME_SOURCES: INCOME_SOURCES, EXPENSE_SOURCES: EXPENSE_SOURCES,
    CATEGORIES: CATEGORIES, FIXED_PRESETS: FIXED_PRESETS, DEP_LABEL: DEP_LABEL,
    TRIP_CATEGORIES: TRIP_CATEGORIES, isTrip: isTrip,
    num: num, round2: round2, uid: uid,
    pad: pad, toYmd: toYmd, parseYmd: parseYmd, isYmd: isYmd, addDays: addDays,
    daysInMonth: daysInMonth, daysInYear: daysInYear,
    money: money, plain: plain,
    emptyState: emptyState, normalize: normalize, createEngine: createEngine,
    daysCsv: daysCsv, entriesCsv: entriesCsv
  };
});
