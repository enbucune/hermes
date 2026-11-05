// ===== 📅 LẬP BẢNG TÀI (bản 46) =====
// Nạp file Excel bảng tài của 1 tuyến (mỗi sheet 1 ngày) -> lấy 1 ngày làm MẪU:
//   lốt = chuỗi chuyến của 1 xe trong ngày; mỗi bến xuất phát là 1 VÒNG lốt; tổ ôm xe (LX/TV ca sáng + ca chiều) đi theo xe.
// Ngày khác ngày mẫu: mỗi vòng xoay 1 nấc/ngày (xe chạy lốt đầu hôm nay -> mai xuống lốt cuối, các xe khác lên 1 lốt),
//   tổ ôm xe đổi ca sáng/chiều mỗi thứ Hai (người ghi (s)/(c) sau tên thì cố định ca). Đúng như bảng tài 157/159/160/161.
// Xoá xe (đi xưởng/sự cố) / thêm xe (dự phòng/mượn): chuyến trống được DỒN TÀI — xe nào về tới bến sớm nhất nhận chuyến kế tiếp,
//   thời gian quay đầu ngắn nhất học từ các ngày cũ trong file. Thêm xe "thay cho" xe đã xoá thì xe mới nhận nguyên lốt + tổ của xe cũ.
// Chỉ chạy trên trình duyệt, lưu ở máy này (localStorage). KHÔNG ghi gì lên FUTA.

// ---------- tiện ích ----------
const lapNorm = s => String(s == null ? '' : s).replace(/\s+/g, ' ').trim();
const lapPlate = s => String(s || '').toUpperCase().replace(/[\s.\-]/g, '');
const lapIsPlate = s => /^\d\d[A-Z]{1,2}\d{4,6}$/.test(s);
const lapFixOf = s => { const m = String(s || '').match(/\(\s*(s|c)\s*\)/i); return m ? m[1].toUpperCase() : ''; };
// bỏ ghi chú trong ngoặc + đuôi "VT NTG", "N4G"... mà điều độ hay gõ sau tên
// cùng 1 người dù gõ tắt chữ lót: "Nguyễn H Thanh Tâm" = "Nguyễn Hoàng Thanh Tâm"
function lapSame(a, b) {
  const bare = v => lapClean(v).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/g, 'd'); // "Thủy" = "Thuỷ"
  a = bare(a); b = bare(b); if (!a || !b) return false; if (a === b) return true;
  const x = a.split(' '), y = b.split(' ');
  return x.length === y.length && x[0] === y[0] && x[x.length - 1] === y[y.length - 1] && x.every((w, i) => w[0] === y[i][0]);
}
const lapClean = s => lapNorm(String(s || '').replace(/\([^)]*\)/g, ' ').replace(/(\s+(VT|NTG|N4G|TGM))+\s*$/i, ''));
const lapHm = m => m == null || m < 0 ? '' : String(Math.floor(m / 60) % 24).padStart(2, '0') + ':' + String(m % 60).padStart(2, '0');
function lapTm(v) { // ô giờ Excel (số phần ngày / chữ "05:00") -> phút trong ngày
  if (typeof v === 'number' && isFinite(v) && v >= 0) { const f = v - Math.floor(v); return f === 0 && v >= 1 ? null : Math.round(f * 1440) % 1440; }
  const m = String(v == null ? '' : v).match(/^\s*(\d{1,2})\s*[:hH]\s*(\d{2})/);
  return m && +m[1] < 24 ? +m[1] * 60 + +m[2] : null;
}
function lapParseHm(s) { const m = String(s || '').trim().match(/^(\d{1,2})(?:[:hH.](\d{1,2}))?$/); return m && +m[1] < 24 && +(m[2] || 0) < 60 ? +m[1] * 60 + +(m[2] || 0) : null; }
const lapUtc = iso => { const p = iso.split('-').map(Number); return Date.UTC(p[0], p[1] - 1, p[2]); };
const lapDays = (a, b) => Math.round((lapUtc(b) - lapUtc(a)) / 864e5);
const lapWeek = iso => Math.floor((lapUtc(iso) / 864e5 + 3) / 7); // tuần bắt đầu thứ Hai (01/01/1970 là thứ Năm)
const lapThu = iso => ['Chủ nhật', 'Thứ Hai', 'Thứ Ba', 'Thứ Tư', 'Thứ Năm', 'Thứ Sáu', 'Thứ Bảy'][new Date(lapUtc(iso)).getUTCDay()];
const lapVn = iso => iso ? iso.slice(8, 10) + '/' + iso.slice(5, 7) + '/' + iso.slice(0, 4) : '';
const lapMod = (a, n) => ((a % n) + n) % n;
const lapSdt = v => { const d = String(v == null ? '' : v).replace(/\D/g, ''); return d.length === 9 && d[0] !== '0' ? '0' + d : d || lapNorm(v); }; // Excel lưu SĐT dạng số -> mất số 0 đầu

// ---------- đọc file .xlsx (tự giải nén, chỉ mở sheet cần dùng — file 20MB vẫn nhanh) ----------
async function lapZip(buf) {
  const dv = new DataView(buf), u8 = new Uint8Array(buf), td = new TextDecoder();
  let e = buf.byteLength - 22;
  while (e >= 0 && dv.getUint32(e, true) !== 0x06054b50) e--;
  if (e < 0) throw new Error('File không phải .xlsx (Excel). Mở bằng Excel rồi "Lưu thành" .xlsx');
  const n = dv.getUint16(e + 10, true); let p = dv.getUint32(e + 16, true);
  const ents = {};
  for (let i = 0; i < n && dv.getUint32(p, true) === 0x02014b50; i++) {
    const nl = dv.getUint16(p + 28, true), xl = dv.getUint16(p + 30, true), cl = dv.getUint16(p + 32, true);
    ents[td.decode(u8.subarray(p + 46, p + 46 + nl))] = { meth: dv.getUint16(p + 10, true), csz: dv.getUint32(p + 20, true), off: dv.getUint32(p + 42, true) };
    p += 46 + nl + xl + cl;
  }
  return {
    has: k => !!ents[k],
    text: async function (k) {
      const x = ents[k]; if (!x) return '';
      const st = x.off + 30 + dv.getUint16(x.off + 26, true) + dv.getUint16(x.off + 28, true), data = u8.subarray(st, st + x.csz);
      if (x.meth === 0) return td.decode(data);
      if (typeof DecompressionStream === 'undefined') throw new Error('Trình duyệt quá cũ, không giải nén được Excel. Dùng Chrome / Safari bản mới.');
      return new Response(new Blob([data]).stream().pipeThrough(new DecompressionStream('deflate-raw'))).text();
    }
  };
}
const lapX = s => s.replace(/&(lt|gt|quot|apos|amp|#x[0-9a-f]+|#\d+);/gi, function (m, k) {
  return k === 'lt' ? '<' : k === 'gt' ? '>' : k === 'quot' ? '"' : k === 'apos' ? "'" : k === 'amp' ? '&'
    : String.fromCodePoint(k[1] === 'x' || k[1] === 'X' ? parseInt(k.slice(2), 16) : +k.slice(1));
});
const lapAttr = (s, k) => { const m = s.match(new RegExp('(?:^|\\s)' + k + '="([^"]*)"')); return m ? lapX(m[1]) : ''; };
const lapTexts = s => { let o = '', m; const re = /<t(?:\s[^>]*)?>([\s\S]*?)<\/t>/g; while ((m = re.exec(s))) o += m[1]; return lapX(o); };
async function lapBook(buf) {
  const z = await lapZip(buf);
  const wb = await z.text('xl/workbook.xml'), rels = await z.text('xl/_rels/workbook.xml.rels');
  if (!wb) throw new Error('File Excel thiếu xl/workbook.xml');
  const tg = {}; let m;
  const rr = /<Relationship\b([^>]*)>/g; while ((m = rr.exec(rels))) tg[lapAttr(m[1], 'Id')] = lapAttr(m[1], 'Target');
  const sheets = []; const rs = /<sheet\b([^>]*)>/g;
  while ((m = rs.exec(wb))) {
    let t = tg[lapAttr(m[1], 'r:id')] || ''; t = t[0] === '/' ? t.slice(1) : 'xl/' + t.replace(/^\.\//, '');
    sheets.push({ name: lapAttr(m[1], 'name'), path: t, idx: sheets.length });
  }
  const ss = []; const sx = await z.text('xl/sharedStrings.xml'); const rsi = /<si>([\s\S]*?)<\/si>/g;
  while ((m = rsi.exec(sx))) ss.push(lapTexts(m[1].replace(/<rPh\b[\s\S]*?<\/rPh>/g, '')));
  return {
    sheets: sheets,
    grid: async function (sh, maxRow, maxCol) { // -> mảng dòng (0-based) của mảng ô
      const xml = await z.text(sh.path), g = []; const rc = /<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g; let c;
      while ((c = rc.exec(xml))) {
        const ref = lapAttr(c[1], 'r').match(/^([A-Z]+)(\d+)$/); if (!ref) continue;
        const r = +ref[2] - 1; if (r >= maxRow) continue;
        let col = 0; for (const ch of ref[1]) col = col * 26 + ch.charCodeAt(0) - 64; col--;
        if (col >= maxCol || !c[2]) continue;
        const t = lapAttr(c[1], 't'), vm = c[2].match(/<v>([\s\S]*?)<\/v>/);
        let v = t === 'inlineStr' ? lapTexts(c[2]) : vm ? lapX(vm[1]) : '';
        if (t === 's') v = ss[+v] || ''; else if (t !== 'str' && t !== 'inlineStr' && t !== 'e' && t !== 'b' && v !== '' && !isNaN(v)) v = +v;
        (g[r] = g[r] || [])[col] = v;
      }
      for (let i = 0; i < g.length; i++) g[i] = g[i] || [];
      return g;
    }
  };
}
function lapSheetDate(name) { // "05.11", "05.11.15", "21.10 16 XE" -> {d, m} ; năm suy theo hôm nay
  const m = String(name).match(/^\s*(\d{1,2})\.(\d{1,2})(?!\d)/); if (!m || +m[2] < 1 || +m[2] > 12 || +m[1] < 1 || +m[1] > 31) return '';
  const now = new Date(); let y = now.getFullYear();
  const iso = yy => yy + '-' + m[2].padStart(2, '0') + '-' + m[1].padStart(2, '0');
  if (lapUtc(iso(y)) - now.getTime() > 60 * 864e5) y--;
  return iso(y);
}

// ---------- đọc 1 sheet ngày ----------
function lapParseDay(g) {
  const U = v => lapNorm(v).toUpperCase();
  let hdr = -1;
  for (let i = 0; i < Math.min(g.length, 30); i++) if (g[i].some(v => U(v) === 'GIỜ XB') && g[i].some(v => U(v) === 'LÁI XE')) { hdr = i; break; }
  if (hdr < 0) return null;
  const h = g[hdr].map(U), blocks = [];
  for (let c = 0; c < h.length; c++) {
    if (h[c] !== 'GIỜ XB') continue;
    const b = { t: c };
    for (let c2 = c + 1; c2 < Math.min(c + 12, h.length) && h[c2] !== 'GIỜ XB'; c2++) {
      const v = h[c2];
      if ((v === 'SỐ XE' || v === 'BKS') && b.bus == null) b.bus = c2;
      else if (v === 'LÁI XE' && b.lx == null) b.lx = c2;
      else if (v === 'TIẾP VIÊN' && b.tv == null) b.tv = c2;
      else if (v === 'MSNV') { if (b.tv == null) { if (b.lxMs == null) b.lxMs = c2; } else if (b.tvMs == null) b.tvMs = c2; }
      else if (v === 'SĐT' || v === 'ĐT') { if (b.tv == null) { if (b.lxDt == null) b.lxDt = c2; } else if (b.tvDt == null) b.tvDt = c2; }
    }
    if (b.bus != null && b.lx != null) blocks.push(b);
  }
  if (!blocks.length) return null;
  const dirs = blocks.map(function (b, i) { // tên chiều: "LƯỢT ĐI (BXB VĂN THÁNH ====> TRƯƠNG GIA MÔ)" -> trong ngoặc
    for (let r = hdr - 1; r >= Math.max(0, hdr - 3); r--) {
      for (const c of [b.t, b.t - 1, b.t + 1, b.t - 2, b.t + 2]) {
        if (c < 0) continue;
        const v = lapNorm(g[r][c]); if (!v || /^\d/.test(v) || /^NGÀY/i.test(v)) continue;
        const m = v.match(/\(([^)]+)\)/); return lapNorm((m ? m[1] : v).replace(/=+>|-+>/g, '→'));
      }
    }
    return 'Chiều ' + (i + 1);
  });
  const trips = [], info = {};
  const note = (name, ms, dt) => { const k = lapClean(name); if (!k) return; const o = info[k] = info[k] || {}; if (ms && !o.ms) o.ms = lapNorm(ms); if (dt && !o.dt) o.dt = lapNorm(dt); };
  for (let r = hdr + 1; r < g.length; r++) {
    const row = g[r];
    if (row.slice(0, 10).some(v => /XUỐNG CA/i.test(lapNorm(v)))) break;
    blocks.forEach(function (b, di) {
      const t = lapTm(row[b.t]), bus = lapPlate(row[b.bus]);
      if (t == null || !lapIsPlate(bus)) return;
      const lx = lapNorm(row[b.lx]), tv = b.tv != null ? lapNorm(row[b.tv]) : '';
      trips.push({ dir: di, t: t, bus: bus, lx: lx, tv: tv });
      note(lx, b.lxMs != null && row[b.lxMs], b.lxDt != null && row[b.lxDt]);
      note(tv, b.tvMs != null && row[b.tvMs], b.tvDt != null && row[b.tvDt]);
    });
  }
  let title = '';
  for (let r = 0; r < Math.min(hdr, 4); r++) title += ' ' + g[r].filter(v => typeof v === 'string').join(' ');
  const code = (title.match(/TUYẾN[^0-9]{0,20}(\d{2,3}[A-Z]?)/i) || [])[1] || '';
  return { dirs: dirs, trips: trips, info: info, code: code, one: blocks.length === 1 };
}
// bảng "BÀN GIAO PHƯƠNG TIỆN": BKS | LX1 | LX2 | TV1 | TV2 (thứ tự cột mỗi tuyến khác nhau) -> tổ ôm xe chính thức
function lapRoster(g) {
  const out = {};
  Object.defineProperty(out, '_fix', { value: {}, enumerable: false });
  for (let r = 0; r < g.length; r++) {
    const row = g[r];
    for (let c = 0; c < row.length; c++) {
      if (lapNorm(row[c]).toUpperCase() !== 'BKS') continue;
      const col = {};
      for (let c2 = c + 1; c2 < Math.min(c + 12, row.length); c2++) { const v = lapNorm(row[c2]).toUpperCase(); if (/^(LX|TV)[12]$/.test(v)) col[v] = c2; }
      if (!col.LX1 || !col.LX2) continue;
      for (let r2 = r + 1; r2 < Math.min(r + 30, g.length); r2++) {
        const bus = lapPlate(g[r2][c]); if (!lapIsPlate(bus)) { if (lapNorm(g[r2][c])) break; continue; }
        const v = k => col[k] != null ? lapNorm(g[r2][col[k]]) : '';
        const e = { lx: [v('LX1'), v('LX2')], tv: [v('TV1'), v('TV2')] };
        e.lx.concat(e.tv).forEach(n => { const f = lapFixOf(n); if (f) out._fix[lapClean(n)] = f; });
        if (!out[bus]) out[bus] = e; // có nhiều bảng bàn giao: lấy bảng đầu, ô trống thì lấy bảng sau
        else ['lx', 'tv'].forEach(k => out[bus][k].forEach((x, i) => { if (!x) out[bus][k][i] = e[k][i]; }));
      }
    }
  }
  return out;
}

// ---------- dựng MẪU từ 1 ngày + học thời gian quay đầu từ các ngày khác ----------
function lapGaps(days) { // thời gian ngắn nhất từ lúc xe xuất bến tới lúc xe xuất bến chuyến kế (theo chiều + nửa giờ)
  const L = {};
  days.forEach(function (d) {
    const by = {};
    d.trips.forEach(t => (by[t.bus] = by[t.bus] || []).push(t));
    Object.keys(by).forEach(function (b) {
      const ts = by[b].sort((x, y) => x.t - y.t);
      for (let i = 0; i + 1 < ts.length; i++) {
        const gp = ts[i + 1].t - ts[i].t;
        if (gp > 0 && gp < 240 && (d.one || ts[i + 1].dir !== ts[i].dir)) (L[ts[i].dir + '_' + Math.floor(ts[i].t / 30)] = L[ts[i].dir + '_' + Math.floor(ts[i].t / 30)] || []).push(gp);
      }
    });
  });
  const G = {};
  Object.keys(L).forEach(function (k) { // nhỏ nhất, bỏ số gõ nhầm (dưới 70% trung vị)
    const a = L[k].sort((x, y) => x - y), med = a[Math.floor(a.length / 2)];
    G[k] = a.find(x => x >= med * 0.7) || med;
  });
  return G;
}
function lapNeed(G, dir, t) {
  const b = Math.floor(t / 30);
  for (let d = 0; d < 48; d++) { if (G[dir + '_' + (b + d)]) return G[dir + '_' + (b + d)]; if (G[dir + '_' + (b - d)]) return G[dir + '_' + (b - d)]; }
  return 60;
}
function lapBuildTpl(day, roster, others, meta) {
  const by = {};
  day.trips.forEach(t => (by[t.bus] = by[t.bus] || []).push(t));
  day.iso = day.iso || meta.date;
  const fixed = {};
  const markFix = n => { const f = lapFixOf(n), k = lapClean(n); if (f && k) fixed[k] = f; };
  day.trips.forEach(t => { markFix(t.lx); markFix(t.tv); });
  Object.keys(roster).forEach(b => roster[b].lx.concat(roster[b].tv).forEach(markFix));
  Object.assign(fixed, roster._fix || {});
  const lots = [], crew = {};
  const top = arr => { const c = {}; let best = '', n = 0; arr.forEach(x => { if (!x) return; c[x] = (c[x] || 0) + 1; if (c[x] > n) { n = c[x]; best = x; } }); return best; };
  const split = function (names) { // điểm giao ca = chỗ đổi tên gần giữa lốt nhất (bỏ qua người lót chạy vài chuyến)
    let best = null;
    for (let j = 1; j < names.length; j++) if (names[j] && names[j] !== names[j - 1] && (best == null || Math.abs(j - names.length / 2) < Math.abs(best - names.length / 2))) best = j;
    return best;
  };
  Object.keys(by).forEach(function (bus) {
    const ts = by[bus].sort((a, b) => a.t - b.t), lx = ts.map(t => lapClean(t.lx)), tv = ts.map(t => lapClean(t.tv));
    const ho = split(lx), hoTv = split(tv);
    lots.push({ bus: bus, ring: day.one ? 0 : ts[0].dir, trips: ts.map(t => [t.dir, t.t]), ho: ho, hoTv: hoTv });
    const c = { lx: [top(ho == null ? lx : lx.slice(0, ho)), ho == null ? '' : top(lx.slice(ho))], tv: [top(hoTv == null ? tv : tv.slice(0, hoTv)), hoTv == null ? '' : top(tv.slice(hoTv))] };
    const ro = roster[bus];
    if (ro) ['lx', 'tv'].forEach(function (k) { // ngày mẫu có người lót thì lấy người ôm xe trong bảng bàn giao
      const R = ro[k].map(lapClean).filter(Boolean); if (R.length !== 2) return;
      const p = c[k], inR = p.map(x => R.some(y => lapSame(x, y)));
      if (inR[0] && !inR[1]) p[1] = R.find(x => !lapSame(x, p[0]));
      else if (!inR[0] && inR[1]) p[0] = R.find(x => !lapSame(x, p[1]));
    });
    crew[bus] = c;
  });
  // Tổ ôm xe thật = người chạy xe đó nhiều nhất ở mỗi ca trong 21 ngày gần nhất — ngày mẫu có người lót cũng không nhầm.
  // So 2 cách: tổ đổi ca mỗi thứ Hai, hay tổ giữ nguyên ca (có xe 1 người luôn chạy sáng dù không ghi (s)); cách nào khớp lịch sử hơn thì dùng.
  const vote = {}, keep = {};
  [day].concat(others).forEach(function (d) {
    if (!d.iso || lapDays(d.iso, meta.date) > 21 || lapDays(d.iso, meta.date) < 0) return;
    const sw = lapMod(lapWeek(d.iso) - lapWeek(meta.date), 2) === 1, bb = {};
    d.trips.forEach(t => (bb[t.bus] = bb[t.bus] || []).push(t));
    Object.keys(bb).forEach(function (bus) {
      if (!crew[bus]) return;
      const ts = bb[bus].sort((a, b) => a.t - b.t);
      ['lx', 'tv'].forEach(function (k) {
        const ns = ts.map(t => lapClean(t[k])), ho = split(ns); if (ho == null) return;
        const v = (vote[bus + k] = vote[bus + k] || { n: 0, S: {}, C: {}, fS: {}, fC: {} }), a = top(ns.slice(0, ho)), b = top(ns.slice(ho));
        v.n++; const S = sw ? b : a, C = sw ? a : b, inc = (o, x) => { if (x) o[x] = (o[x] || 0) + 1; };
        inc(v.S, S); inc(v.C, C); inc(v.fS, a); inc(v.fC, b);
      });
    });
  });
  const orig = JSON.parse(JSON.stringify(crew)), power = {};
  Object.keys(crew).forEach(function (bus) {
    ['lx', 'tv'].forEach(function (k) {
      const v = vote[bus + k]; if (!v || v.n < 3) return;
      const best = (o, not) => Object.keys(o).filter(x => x !== not).sort((x, y) => o[y] - o[x])[0];
      const score = (oS, oC) => { const S = best(oS), C = best(oC, S); return { S: S, C: C, n: (oS[S] || 0) + (oC[C] || 0), okS: (oS[S] || 0) >= 2, okC: (oC[C] || 0) >= 2 }; };
      const fl = score(v.S, v.C), fx = score(v.fS, v.fC), w = fx.n > fl.n ? fx : fl;
      if (fx.n > fl.n) (keep[bus] = keep[bus] || {})[k] = true;
      const src = fx.n > fl.n ? [v.fS, v.fC] : [v.S, v.C], R = roster[bus] ? roster[bus][k] : [];
      [[w.S, w.okS], [w.C, w.okC]].forEach(function (z, i) {
        const cur = crew[bus][k][i];
        // tên ngày mẫu là người chạy ca này nhiều nhất (hoặc có trong bảng bàn giao mà người kia không có) thì giữ; ngược lại đó là người lót -> thay
        const inR = n => R.some(r => lapSame(r, n));
        const strong = cur && (cur === z[0] || !z[1] || (inR(cur) && !inR(z[0])));
        if (strong) { power[bus + k + i] = 1000 + (src[i][cur] || 0); return; }
        if (z[0] && z[1]) { crew[bus][k][i] = z[0]; power[bus + k + i] = src[i][z[0]]; }
      });
    });
  });
  // 1 người chỉ ôm 1 xe: trùng thì giữ ở xe người đó chạy nhiều nhất, xe kia lấy lại tên ngày mẫu
  ['lx', 'tv'].forEach(function (k) {
    for (let lap = 0; lap < 3; lap++) {
      const seen = {};
      Object.keys(crew).forEach(bus => crew[bus][k].forEach(function (n, i) { if (n) (seen[n] = seen[n] || []).push([bus, i, power[bus + k + i] || 0]); }));
      let changed = false;
      Object.keys(seen).forEach(function (n) {
        const a = seen[n]; if (a.length < 2) return;
        a.sort((x, y) => y[2] - x[2]).slice(1).forEach(function (x) { const o = orig[x[0]][k][x[1]]; crew[x[0]][k][x[1]] = o !== n ? o : ''; power[x[0] + k + x[1]] = 0; changed = true; });
      });
      if (!changed) break;
    }
  });
  lots.sort((a, b) => a.ring - b.ring || a.trips[0][1] - b.trips[0][1]);
  // lốt không có giao ca (ngày mẫu có người chạy cả ngày): lấy giờ giao ca giữa của các lốt cùng bến
  const hos = lots.filter(l => l.ho != null).map(l => l.trips[l.ho][1]).sort((a, b) => a - b), mid = hos[Math.floor(hos.length / 2)];
  lots.forEach(function (l) {
    if (l.ho == null && mid != null && l.trips.length > 4) {
      let j = 1; l.trips.forEach((x, i) => { if (i && Math.abs(x[1] - mid) < Math.abs(l.trips[j][1] - mid)) j = i; }); l.ho = j; l.hoGuess = true;
    }
    if (l.hoTv == null) l.hoTv = l.ho;
  });
  // Giờ giao ca của từng lốt: có tuyến xen kẽ 2 kiểu theo ngày chẵn/lẻ (157) -> học từ lịch sử, lưu theo độ lệch ngày chẵn/lẻ so với ngày mẫu
  const lk = {}; lots.forEach(l => { lk[l.trips[0][0] + '_' + l.trips[0][1] + '_' + l.trips.length] = l; });
  [day].concat(others).forEach(function (d) {
    if (!d.iso || lapDays(d.iso, meta.date) > 21 || lapDays(d.iso, meta.date) < 0) return;
    const par = lapMod(lapDays(meta.date, d.iso), 2), bb = {};
    d.trips.forEach(t => (bb[t.bus] = bb[t.bus] || []).push(t));
    Object.keys(bb).forEach(function (bus) {
      const ts = bb[bus].sort((a, b) => a.t - b.t), l = lk[ts[0].dir + '_' + ts[0].t + '_' + ts.length]; if (!l) return;
      ['ho', 'hoTv'].forEach(function (f) {
        const j = split(ts.map(t => lapClean(t[f === 'ho' ? 'lx' : 'tv']))); if (j == null) return;
        const v = (l['_' + f] = l['_' + f] || [{}, {}]); v[par][j] = (v[par][j] || 0) + 1;
      });
    });
  });
  lots.forEach(function (l) {
    ['ho', 'hoTv'].forEach(function (f) {
      const v = l['_' + f]; delete l['_' + f]; if (!v) return;
      const pick = o => { const ks = Object.keys(o).sort((a, b) => o[b] - o[a]); return ks.length && o[ks[0]] >= 2 ? +ks[0] : null; };
      const a = pick(v[0]), b = pick(v[1]);
      if (a != null || b != null) l[f + 'P'] = [a != null ? a : l[f], b != null ? b : a != null ? a : l[f]];
    });
  });
  const rings = {};
  lots.forEach((l, i) => (rings[l.ring] = rings[l.ring] || []).push(i));
  const names = {}; // gợi ý tên khi sửa: mọi người có trong các ngày đã đọc
  [day].concat(others).forEach(function (d) {
    d.trips.forEach(function (t) {
      [['lx', t.lx], ['tv', t.tv]].forEach(function (p) { const k = lapClean(p[1]); if (!k) return; const o = names[k] = names[k] || { lx: 0, tv: 0 }; o[p[0]]++; });
    });
    Object.keys(d.info).forEach(function (k) { const o = names[k]; if (o) { if (!o.ms && d.info[k].ms) o.ms = d.info[k].ms; if (!o.dt && d.info[k].dt) o.dt = d.info[k].dt; } });
  });
  return Object.assign({ v: 1, dirs: day.dirs, one: day.one, lots: lots, rings: rings, crew: crew, keep: keep, fixed: fixed, names: names, G: lapGaps([day].concat(others)) }, meta);
}

// ---------- LẬP BẢNG TÀI 1 NGÀY ----------
// day: { del: {bus: {from, why}}, add: [{bus, from, dir, note, thay}], crew: {bus: {lx:[S,C], tv:[S,C]}}, ho: {bus: phút}, trip: {"dir_t": {lx, tv}}, seg: [{bus, ca, from, role, name}] }
function lapFlip(pair, flip, fixed) {
  if (!flip) return pair.slice();
  const fa = fixed[pair[0]] || '', fb = fixed[pair[1]] || '';
  return fa === 'S' || fb === 'C' ? pair.slice() : [pair[1], pair[0]];
}
const LAP_MAX_TRE = 10; // xe tới bến trễ quá 10 phút thì để THIẾU XE (cắt chuyến) chứ không dồn trễ dây chuyền
function lapPlan(tpl, iso, day) {
  day = day || {};
  const k = lapDays(tpl.date, iso), flip = lapMod(lapWeek(iso) - lapWeek(tpl.date), 2) === 1;
  const lotBus = [];
  Object.keys(tpl.rings).forEach(function (r) { const L = tpl.rings[r], n = L.length; L.forEach((li, i) => { lotBus[li] = tpl.lots[L[lapMod(i + k, n)]].bus; }); });
  const lotOf = {}; lotBus.forEach((b, li) => { lotOf[b] = li; });
  const all = [];
  tpl.lots.forEach((lot, li) => lot.trips.forEach((x, j) => all.push({ dir: x[0], t: x[1], lot: li, j: j, base: lotBus[li], bus: lotBus[li] })));
  all.sort((a, b) => a.t - b.t || a.dir - b.dir);
  const del = day.del || {}, add = (day.add || []).filter(a => a && a.bus), warn = [];
  const src = {}; // xe -> xe gốc mà nó nhận lốt + tổ (xe thay)
  const av = {}; // xe -> [từ, tới) được chạy
  lotBus.forEach(b => { av[b] = [0, del[b] ? del[b].from : 1e9]; });
  const subst = {}, late = {};
  add.forEach(function (a) {
    av[a.bus] = [a.from || 0, 1e9];
    if (a.thay && del[a.thay] && lotOf[a.thay] != null) { src[a.bus] = a.thay; if ((a.from || 0) <= del[a.thay].from && !subst[a.thay]) subst[a.thay] = a.bus; else late[a.bus] = a.thay; }
  });
  // 1) xe thay vào đúng lúc xe cũ nghỉ: nhận nguyên phần còn lại của lốt, không xáo trộn xe khác
  all.forEach(function (x) { const d = del[x.bus]; if (d && x.t >= d.from && subst[x.bus]) x.bus = subst[x.bus]; });
  // 2) còn chuyến trống / có xe tăng cường: dồn tài từ lúc thay đổi sớm nhất
  let T0 = 1e9;
  Object.keys(del).forEach(function (b) { if (lotOf[b] != null && !subst[b] && all.some(x => x.bus === b && x.t >= del[b].from)) T0 = Math.min(T0, del[b].from); });
  add.forEach(function (a) { if (!(a.thay && subst[a.thay] === a.bus)) T0 = Math.min(T0, a.from || 0); });
  let nDon = 0;
  if (T0 < 1e9) {
    const st = {};
    const ids = lotBus.concat(add.map(a => a.bus)).filter((b, i, s) => s.indexOf(b) === i);
    ids.forEach(function (b) {
      const li = lotOf[b] != null ? lotOf[b] : lotOf[src[b]];
      st[b] = { pos: li != null ? tpl.lots[li].ring : 0, ready: -1, order: li != null ? tpl.lots[li].trips[0][1] : 5000 };
    });
    all.forEach(function (x) { if (x.t < T0 && st[x.bus]) { st[x.bus].pos = tpl.one ? x.dir : 1 - x.dir; st[x.bus].ready = x.t + lapNeed(tpl.G, x.dir, x.t); st[x.bus].ran = 1; } });
    add.forEach(function (a) {
      const s = st[a.bus], sb = subst[a.thay] === a.bus && st[a.thay];
      if (s.ran) return;
      if (sb) { s.pos = sb.pos; s.ready = Math.max(sb.ready, a.from || 0); s.order = sb.order; } // xe thay đúng lúc: tiếp vị trí xe cũ
      else { s.pos = a.dir || 0; s.ready = Math.max(a.from || 0, -1); s.order = 4000 + (a.from || 0); }
    });
    all.forEach(function (x) {
      if (x.t < T0) return;
      let best = null, bestLate = null;
      ids.forEach(function (b) {
        const s = st[b]; if (s.pos !== x.dir || x.t < av[b][0] || x.t >= av[b][1]) return;
        if (s.ready <= x.t) { if (!best || s.ready < st[best].ready || (s.ready === st[best].ready && s.order < st[best].order)) best = b; }
        else if (!bestLate || s.ready < st[bestLate].ready) bestLate = b;
      });
      const b = best || (bestLate && st[bestLate].ready - x.t <= LAP_MAX_TRE ? bestLate : null);
      if (!b) { x.bus = ''; return; }
      const dep = Math.max(x.t, st[b].ready);
      if (dep > x.t) x.late = dep - x.t;
      if (b !== x.base) nDon++;
      x.bus = b; st[b].pos = tpl.one ? x.dir : 1 - x.dir; st[b].ready = dep + lapNeed(tpl.G, x.dir, x.t); st[b].order = dep;
    });
  }
  // 3) tổ lái theo xe + giao ca
  const fixed = tpl.fixed || {}, buses = {};
  all.forEach(x => { if (x.bus) (buses[x.bus] = buses[x.bus] || []).push(x); });
  const busInfo = [];
  const crewBase = function (b) {
    const s = tpl.crew[src[b] || b];
    if (!s) return { lx: ['', ''], tv: ['', ''] };
    const kp = (tpl.keep || {})[src[b] || b] || {};
    return { lx: lapFlip(s.lx, flip && !kp.lx, fixed), tv: lapFlip(s.tv, flip && !kp.tv, fixed) };
  };
  ids2().forEach(function (b) {
    const ts = buses[b] || [], li = lotOf[b] != null ? lotOf[b] : lotOf[src[b]], lot = li != null ? tpl.lots[li] : null;
    const crew = (day.crew && day.crew[b]) || crewBase(b);
    const hoI = lot ? (lot.hoP ? lot.hoP[lapMod(k, 2)] : lot.ho) : null, hoTvI = lot ? (lot.hoTvP ? lot.hoTvP[lapMod(k, 2)] : lot.hoTv) : null;
    let hoT = day.ho && day.ho[b] != null ? day.ho[b] : hoI != null ? lot.trips[hoI][1] : null;
    const hoDir = hoI != null ? lot.trips[hoI][0] : null;
    if (hoT != null && day.ho && day.ho[b] === -1) hoT = null; // -1 = 1 tổ chạy cả ngày
    const find = function (T, dirWant) {
      if (T == null) return ts.length;
      let j = ts.findIndex(x => x.t >= T - 10 && (dirWant == null || x.dir === dirWant));
      if (j < 0) j = ts.findIndex(x => x.t >= T);
      return j < 0 ? ts.length : j;
    };
    const hoL = find(hoT, day.ho && day.ho[b] != null ? null : hoDir);
    let hoV = hoL;
    if (hoTvI != null && hoTvI !== hoI && !(day.ho && day.ho[b] != null)) hoV = find(lot.trips[hoTvI][1], lot.trips[hoTvI][0]);
    ts.forEach(function (x, j) {
      x.ca = j >= hoL ? 'C' : 'S';
      x.lx = crew.lx[j >= hoL ? 1 : 0] || ''; x.tv = crew.tv[j >= hoV ? 1 : 0] || '';
      x.dau = j === 0 || j === hoL; x.n = j;
    });
    busInfo.push({ bus: b, lot: li, n: ts.length, crew: crew, hoT: hoL < ts.length ? ts[hoL].t : null, first: ts[0] ? ts[0] : null, last: ts[ts.length - 1] || null,
      del: del[b] || null, add: add.find(a => a.bus === b) || null, src: src[b] || '', own: !!(day.crew && day.crew[b]), hoOwn: !!(day.ho && day.ho[b] != null), hoGuess: lot && lot.hoGuess });
  });
  function ids2() { return lotBus.concat(add.map(a => a.bus)).filter((b, i, s) => s.indexOf(b) === i); }
  // 4) tên sửa riêng: từ chuyến X tới hết ca, hoặc chỉ 1 chuyến
  (day.seg || []).forEach(function (s) { all.forEach(function (x) { if (x.bus === s.bus && x.ca === s.ca && x.t >= s.from) { x[s.role] = s.name; x['sua_' + s.role] = true; } }); });
  all.forEach(function (x) { const o = day.trip && day.trip[x.dir + '_' + x.t]; if (o) { if (o.lx != null) { x.lx = o.lx; x.sua_lx = true; } if (o.tv != null) { x.tv = o.tv; x.sua_tv = true; } } });
  all.forEach(function (x) { x.key = x.dir + '_' + x.t; x.doi = !!x.bus && x.bus !== x.base; });
  // số TÀI như bảng tài FUTA: tài 1..N = ca 1 của lốt, tài N+1..2N = ca 2 (tài đi theo lốt, xe xoay qua các tài mỗi ngày)
  const N = tpl.lots.length;
  all.forEach(function (x) { const l = tpl.lots[x.lot], h = l.hoP ? l.hoP[lapMod(k, 2)] : l.ho; x.tai = x.lot + 1 + (h != null && x.j >= h ? N : 0); });
  busInfo.forEach(function (b) { b.tai = b.lot != null ? b.lot + 1 : null; });
  const thieu = all.filter(x => !x.bus).length, tre = all.filter(x => x.late).length;
  if (thieu) warn.push('🔴 ' + thieu + ' chuyến THIẾU XE (không xe nào về bến kịp, trễ quá ' + LAP_MAX_TRE + ' phút) — thêm xe dự phòng / xe mượn, hoặc cắt chuyến.');
  if (tre) warn.push('🟠 ' + tre + ' chuyến xe tới bến không kịp giờ (trễ tối đa ' + Math.max.apply(null, all.map(x => x.late || 0)) + ' phút) — thiếu xe, nên thêm xe hoặc giãn giờ.');
  busInfo.forEach(function (b) { if (b.n && (!b.crew.lx[0] || (b.hoT != null && !b.crew.lx[1]))) warn.push('🟡 Xe ' + b.bus + ' chưa có tên lái xe ' + (!b.crew.lx[0] ? 'ca 1' : 'ca 2') + ' — sửa ở cột 🚌 Danh sách xe bên trái.'); });
  return { iso: iso, k: k, flip: flip, rows: all, buses: busInfo, warn: warn, nDon: nDon, thieu: thieu, tre: tre };
}
function lapStats(plan) {
  const P = {};
  plan.rows.forEach(function (x) {
    if (!x.bus) return;
    [['lx', x.lx], ['tv', x.tv]].forEach(function (p) {
      const name = lapClean(p[1]) || '(chưa có tên)', k = p[0] + '|' + name;
      const o = P[k] = P[k] || { role: p[0], name: name, n: 0, seg: {}, ts: [] };
      o.n++; o.seg[x.bus + ' ca ' + (x.ca === 'C' ? '2' : '1')] = 1; o.ts.push(x);
    });
  });
  return Object.keys(P).map(function (k) {
    const o = P[k]; o.ts.sort((a, b) => a.t - b.t);
    o.cas = Object.keys(o.seg); o.hai = new Set(o.ts.map(x => x.ca)).size > 1; o.doiXe = !o.hai && new Set(o.ts.map(x => x.bus)).size > 1;
    o.trung = o.ts.some((x, i) => i && x.t - o.ts[i - 1].t < 15 && (x.bus !== o.ts[i - 1].bus || x.dir !== o.ts[i - 1].dir));
    o.tu = o.ts[0].t; o.den = o.ts[o.ts.length - 1].t;
    return o;
  }).sort((a, b) => (a.role > b.role ? 1 : a.role < b.role ? -1 : 0) || b.n - a.n || a.name.localeCompare(b.name, 'vi'));
}

if (typeof module !== 'undefined') module.exports = { lapBook, lapParseDay, lapRoster, lapBuildTpl, lapPlan, lapStats, lapSheetDate, lapNeed, lapHm };

// ================= GIAO DIỆN =================
if (typeof document !== 'undefined' && document.getElementById('btnLap')) (function () {
  const LAP = { code: '', tpl: null, day: null, plan: null, view: 'bt', book: null, file: '', cand: [], pop: null, sel: '' };
  const K_TPL = c => 'lap_tpl_' + c, K_DAY = (c, iso) => 'lap_day_' + c + '_' + iso;
  const store = {
    get: function (k) { try { return JSON.parse(localStorage.getItem(k) || 'null'); } catch (e) { return null; } },
    set: function (k, v) { try { localStorage.setItem(k, JSON.stringify(v)); return true; } catch (e) { msg('❌ Máy hết chỗ lưu (localStorage): ' + e.message, 'err'); return false; } },
    del: function (k) { try { localStorage.removeItem(k); } catch (e) { /* bỏ qua */ } }
  };
  const codes = () => { const o = []; for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); if (/^lap_tpl_/.test(k)) o.push(k.slice(8)); } return o.sort(); };
  const routeCode = () => (String($('route').value || '').match(/\d{2,3}[A-Z]?/i) || [''])[0].toUpperCase();

  function drawTpls() {
    const cs = codes();
    $('lapTpls').innerHTML = cs.length
      ? '<span class="lap-tl">Mẫu đã nạp:</span>' + cs.map(function (c) {
        const t = store.get(K_TPL(c)) || {};
        return '<span class="lap-tpl' + (c === LAP.code ? ' on' : '') + '"><button type="button" data-tpl="' + esc(c) + '">' + esc(c) + ' · ' + esc(t.sheet || '') + ' <small>(' + (t.lots ? t.lots.length : 0) + ' xe)</small></button>' +
          '<button type="button" class="lap-x" data-tpldel="' + esc(c) + '" title="Xoá mẫu tuyến ' + esc(c) + ' khỏi máy này" aria-label="Xoá mẫu">×</button></span>';
      }).join('')
      : '<span class="lap-tl">Chưa có mẫu nào. Bấm 📥 để nạp file bảng tài của tuyến (vd "Bảng tài tuyến 161.xlsx").</span>';
  }
  $('lapTpls').onclick = function (ev) {
    const a = ev.target.closest('[data-tpl]'), d = ev.target.closest('[data-tpldel]');
    if (a) { LAP.code = a.dataset.tpl; run(); }
    else if (d && confirm('Xoá mẫu bảng tài tuyến ' + d.dataset.tpldel + ' khỏi máy này?\n(Thay đổi từng ngày đã lưu vẫn giữ, nạp lại file là dùng tiếp.)')) {
      store.del(K_TPL(d.dataset.tpldel)); if (LAP.code === d.dataset.tpldel) { LAP.code = ''; LAP.tpl = null; } drawTpls();
    }
  };

  // ----- nạp file -----
  $('btnLapFile').onclick = function () { $('lapFile').value = ''; $('lapFile').click(); };
  $('lapFile').onchange = function () {
    const f = $('lapFile').files[0]; if (!f) return;
    $('btnLapFile').disabled = true; msg('Đang đọc file ' + f.name + '...');
    f.arrayBuffer().then(lapBook).then(function (book) {
      LAP.book = book; LAP.file = f.name;
      LAP.cand = book.sheets.map(s => Object.assign({ iso: lapSheetDate(s.name) }, s)).filter(s => s.iso)
        .sort((a, b) => (a.iso < b.iso ? 1 : a.iso > b.iso ? -1 : b.idx - a.idx));
      if (!LAP.cand.length) throw new Error('Không thấy sheet nào đặt tên theo ngày (dd.mm) trong file này.');
      return pickDefault().then(s => useSheet(s));
    }).catch(function (e) { msg('❌ ' + e.message, 'err'); })
      .then(function () { $('btnLapFile').disabled = false; });
  };
  function pickDefault() { // ngày mới nhất; ngày đó có nhiều bản (vd 12 xe / 13 xe) thì lấy bản có số xe hay chạy nhất
    const top = LAP.cand.slice(0, 12);
    return Promise.all(top.map(s => LAP.book.grid(s, 140, 20).then(g => { const d = lapParseDay(g); s.nXe = d ? new Set(d.trips.map(t => t.bus)).size : 0; }))).then(function () {
      const ok = top.filter(s => s.nXe), cnt = {};
      ok.forEach(s => { cnt[s.nXe] = (cnt[s.nXe] || 0) + 1; });
      const mode = +Object.keys(cnt).sort((a, b) => cnt[b] - cnt[a])[0];
      return ok.find(s => s.nXe === mode && s.iso === ok[0].iso) || ok.find(s => s.nXe === mode) || ok[0] || LAP.cand[0];
    });
  }
  function useSheet(s) {
    msg('Đang dựng mẫu từ sheet ' + s.name + ' và học thời gian quay đầu từ các ngày trước...');
    return LAP.book.grid(s, 160, 45).then(function (g) {
      const day = lapParseDay(g);
      if (!day || !day.trips.length) throw new Error('Sheet ' + s.name + ' không đọc được bảng chuyến (cần dòng tiêu đề có "GIỜ XB", "LÁI XE").');
      const back = LAP.cand.filter(x => x !== s && x.iso <= s.iso && lapDays(x.iso, s.iso) <= 45).slice(0, 30);
      return Promise.all(back.map(x => LAP.book.grid(x, 140, 20).then(lapParseDay).then(o => (o && (o.iso = x.iso), o)).catch(() => null))).then(function (others) {
        const code = day.code || (LAP.file.match(/\d{2,3}[A-Z]?/i) || [''])[0].toUpperCase();
        if (!code) throw new Error('Không biết file này của tuyến nào (tiêu đề không có "TUYẾN ...").');
        const tpl = lapBuildTpl(day, lapRoster(g), others.filter(o => o && o.trips.length && o.dirs.length === day.dirs.length),
          { code: code, file: LAP.file, sheet: s.name, date: s.iso, nap: new Date().toISOString().slice(0, 10), hocNgay: others.filter(Boolean).length });
        if (!store.set(K_TPL(code), tpl)) return;
        LAP.code = code; LAP.tpl = tpl; run(true);
        msg('✅ Đã nạp mẫu tuyến ' + code + ': sheet ' + s.name + ' (' + tpl.lots.length + ' xe, ' + day.trips.length + ' chuyến). Học thời gian quay đầu từ ' + tpl.hocNgay + ' ngày.' +
          (tpl.lots.some(l => l.hoGuess) ? ' Có xe ngày mẫu không giao ca, web tự đoán giờ giao ca — xem lại giờ giao ca ở cột 🚌 Danh sách xe.' : ''), 'ok');
      });
    });
  }

  // ----- lập + vẽ -----
  $('btnLap').onclick = function () { run(); };
  $('tabLap').addEventListener('click', function () { if (MODE !== 'lap' && (LAP.tpl || codes().length)) run(true); });
  $('date').addEventListener('change', function () { if (MODE === 'lap') run(true); });
  function run(quiet) {
    const iso = isoDate(); if (!iso) { msg('❌ Ngày gõ dạng dd/mm/yyyy.', 'err'); return; }
    const rc = routeCode(), cs = codes();
    let code = cs.indexOf(rc) >= 0 && (!LAP.code || rc !== LAP.lastRoute) ? rc : LAP.code || (cs.indexOf(rc) >= 0 ? rc : cs[0]);
    LAP.lastRoute = rc;
    if (!code) { drawTpls(); msg('📥 Chưa có mẫu bảng tài. Bấm "📥 Nạp file bảng tài" và chọn file Excel của tuyến.', 'info'); return; }
    if (!LAP.tpl || LAP.tpl.code !== code) LAP.tpl = store.get(K_TPL(code));
    if (!LAP.tpl) { msg('❌ Không đọc được mẫu tuyến ' + code + ', nạp lại file.', 'err'); return; }
    LAP.code = code; LAP.iso = iso; LAP.day = store.get(K_DAY(code, iso)) || {};
    MODE = 'lap'; LAP.pop = null;
    $('btnCopy').style.display = 'none'; $('btnXlsx').style.display = 'none'; $('lvcRules').hidden = true;
    drawTpls(); calc(); render();
    if (!quiet || MODE === 'lap') msg(summary(), LAP.plan.thieu || LAP.plan.tre ? 'warn' : 'ok');
  }
  function calc() { LAP.plan = lapPlan(LAP.tpl, LAP.iso, LAP.day); LAP.stats = lapStats(LAP.plan); }
  function summary() {
    const p = LAP.plan, t = LAP.tpl, d = LAP.day, nd = Object.keys(d.del || {}).length, na = (d.add || []).length;
    return (p.thieu || p.tre ? '⚠️ ' : '✅ ') + 'Bảng tài ' + t.code + ' — ' + lapThu(LAP.iso) + ' ' + lapVn(LAP.iso) + ': ' + p.buses.filter(b => b.n).length + ' xe, ' + p.rows.filter(x => x.bus).length + ' chuyến' +
      (nd ? ' · rút ' + nd + ' xe' : '') + (na ? ' · thêm ' + na + ' xe' : '') + (p.nDon ? ' · dồn tài ' + p.nDon + ' chuyến' : '') + (p.thieu ? ' · ' + p.thieu + ' chuyến thiếu xe' : '') + (p.tre ? ' · ' + p.tre + ' chuyến trễ' : '');
  }
  function save() {
    const d = LAP.day, empty = !Object.keys(d.del || {}).length && !(d.add || []).length && !Object.keys(d.crew || {}).length && !Object.keys(d.ho || {}).length && !Object.keys(d.trip || {}).length && !(d.seg || []).length;
    if (empty) store.del(K_DAY(LAP.code, LAP.iso)); else store.set(K_DAY(LAP.code, LAP.iso), d);
    // dọn thay đổi của các ngày quá 60 ngày
    for (let i = localStorage.length - 1; i >= 0; i--) { const k = localStorage.key(i), m = k && k.match(/^lap_day_.+_(\d{4}-\d\d-\d\d)$/); if (m && lapDays(m[1], LAP.iso) > 60) localStorage.removeItem(k); }
    calc(); render(); msg(summary(), LAP.plan.thieu || LAP.plan.tre ? 'warn' : 'ok');
  }
  window.renderLap = render;

  const dirName = i => (LAP.tpl.dirs[i] || 'Chiều ' + (i + 1));
  const benOf = i => dirName(i).split(/\s*(?:→|-|–)\s*/)[0];
  const nm = s => s ? esc(lapClean(s) || s) : '<span class="lap-no">— chưa có —</span>';
  // ===== GIAO DIỆN BẢN 48: cột trái = danh sách xe (ca 1 / ca 2, LX + TV), bên phải = bảng tài kiểu "lịch làm việc" FUTA =====
  const dirTo = i => esc(LAP.tpl.code + ' - ' + dirName(i).replace(/\s*(?:→|-|–)\s*/, ' đến '));
  const phone = n => { const o = (LAP.tpl.names || {})[lapClean(n)]; return o && o.dt ? esc(lapSdt(o.dt)) : ''; };
  function render() {
    if (MODE !== 'lap' || !LAP.plan) return;
    const p = LAP.plan, t = LAP.tpl, d = LAP.day;
    const st = LAP.stats.filter(o => o.name !== '(chưa có tên)'), nLx = st.filter(o => o.role === 'lx').length, nTv = st.filter(o => o.role === 'tv').length;
    $('stats').innerHTML = '<div class="stat e-n"><b>' + p.rows.filter(x => x.bus).length + '</b>Chuyến</div>' +
      '<div class="stat e-ok"><b>' + p.buses.filter(b => b.n).length + '</b>Xe chạy</div>' +
      '<div class="stat ' + (p.nDon ? 'e-warn' : 'e-ok') + '"><b>' + p.nDon + '</b>Chuyến đổi xe (dồn tài)</div>' +
      '<div class="stat ' + (p.thieu || p.tre ? 'e-nopc' : 'e-ok') + '"><b>' + (p.thieu + p.tre) + '</b>Thiếu xe / trễ</div>' +
      '<div class="stat e-n"><b>' + nLx + ' · ' + nTv + '</b>Lái xe · tiếp viên</div>';
    const head = '<div class="lap-head"><div class="lh-l"><b class="lap-h">📅 Tuyến ' + esc(t.code) + ' · ' + lapThu(LAP.iso) + ' ' + lapVn(LAP.iso) + '</b>' +
      '<span class="pill p-ok" title="Mẫu lấy từ file ' + esc(t.file || '') + '">Mẫu: sheet ' + esc(t.sheet) + '</span>' +
      '<span class="pill p-info">' + (p.k === 0 ? 'Đúng ngày mẫu' : 'Xoay ' + (p.k > 0 ? '+' : '') + p.k + ' ngày') + ' · ' + (p.flip ? 'tổ ĐỔI ca so với mẫu' : 'tổ cùng ca với mẫu') + '</span>' +
      (LAP.book && t.file === LAP.file ? '<label class="lap-sh">Sheet mẫu <select data-lap="sheet">' + LAP.cand.slice(0, 40).map(s => '<option value="' + s.idx + '"' + (s.name === t.sheet ? ' selected' : '') + '>' + esc(s.name) + '</option>').join('') + '</select></label>' : '') +
      '</div><div class="lap-acts"><button type="button" class="btn-soft" data-lap="reset"' + (Object.keys(d).length ? '' : ' disabled') + '>↺ Bỏ thay đổi ngày này</button>' +
      '<button type="button" class="btn-soft btn-solid" data-lap="xlsx">⬇️ Tải Excel</button></div></div>';
    const warn = p.warn.length ? '<div class="lap-warn">' + p.warn.map(esc).join('<br>') + '</div>' : '';
    const views = '<div class="lap-views">' + [['bt', '🗓 Bảng tài'], ['ns', '👥 Số chuyến từng người']].map(v => '<button type="button" data-lapv="' + v[0] + '" class="' + (LAP.view === v[0] ? 'on' : '') + '">' + v[1] + '</button>').join('') +
      (LAP.sel ? '<span class="lv-sel">Đang chọn xe <b>' + esc(LAP.sel) + '</b> <button type="button" data-lapsel="' + esc(LAP.sel) + '" title="Bỏ chọn">×</button></span>' : '') + '</div>';
    const names = '<datalist id="lapNames">' + Object.keys(t.names || {}).sort((a, b) => a.localeCompare(b, 'vi')).map(n => '<option value="' + esc(n) + '">').join('') + '</datalist>';
    const keep = $('out').querySelector('.lap-side'), keepTop = keep ? keep.scrollTop : 0;
    $('out').innerHTML = '<div class="lap">' + head + warn + '<div class="lap-grid">' + side() + '<section class="lap-main">' + views + (LAP.view === 'ns' ? viewNs() : viewBt()) + '</section></div>' + names + '</div>' + (LAP.pop ? pop() : '');
    const s2 = $('out').querySelector('.lap-side'); if (s2) s2.scrollTop = keepTop;
    const f = $('out').querySelector('.lap-pop [autofocus]'); if (f) f.focus();
  }

  // cột trái: mỗi xe 1 thẻ — tài, lốt hôm nay, ca 1 / ca 2 (LX + TV sửa ngay), giờ giao ca, nút Rút xe
  function side() {
    const p = LAP.plan;
    const inp = (b, f, v, ph) => '<input type="text" class="lap-in" list="lapNames" data-bus="' + esc(b) + '" data-f="' + f + '" value="' + esc(lapClean(v) || v || '') + '" placeholder="' + ph + '" autocomplete="off" spellcheck="false">';
    const card = function (b) {
      const on = LAP.sel === b.bus, cls = (on ? ' sel' : '') + (b.add ? ' new' : '') + (b.del ? (b.n ? ' part' : ' off') : '') + (b.own || b.hoOwn ? ' own' : '');
      const end = b.last ? lapHm(b.last.t) : '', ho = b.hoT != null ? lapHm(b.hoT) : '';
      const tag = b.add ? '<span class="pill p-ok">' + (b.src ? 'thay ' + esc(b.src) : esc(b.add.note || 'xe thêm')) + (b.add.from ? ' · từ ' + lapHm(b.add.from) : '') + '</span>'
        : b.del ? '<span class="pill p-err">' + esc(b.del.why || 'Rút') + (b.del.from ? ' · từ ' + lapHm(b.del.from) : ' · cả ngày') + '</span>' : '';
      const btn = b.del ? '<button type="button" class="ls-btn ok" data-lap="undel" data-bus="' + esc(b.bus) + '" title="Cho xe chạy lại">↺ Chạy lại</button>'
        : b.add ? '<button type="button" class="ls-btn" data-lap="unadd" data-bus="' + esc(b.bus) + '" title="Bỏ xe này khỏi ngày này">Bỏ xe</button>'
        : '<button type="button" class="ls-btn" data-lap="del" data-bus="' + esc(b.bus) + '" title="Rút xe (đi xưởng / sự cố)">Rút xe</button>';
      const body = b.n ? '<div class="ls-ca"><div class="ls-cn">Ca 1 <small>' + (b.first ? lapHm(b.first.t) : '') + '–' + (ho || end) + '</small></div>' + inp(b.bus, 'lx0', b.crew.lx[0], 'Lái xe ca 1') + inp(b.bus, 'tv0', b.crew.tv[0], 'Tiếp viên ca 1') + '</div>' +
        '<div class="ls-ca"><div class="ls-cn">Ca 2 <label class="ls-ho" title="Giờ giao ca — để trống = 1 tổ chạy cả ngày">giao <input type="text" class="lap-in lap-ho" data-bus="' + esc(b.bus) + '" data-f="ho" value="' + ho + '" placeholder="--:--"></label><small>–' + end + '</small></div>' +
        (b.hoT != null ? inp(b.bus, 'lx1', b.crew.lx[1], 'Lái xe ca 2') + inp(b.bus, 'tv1', b.crew.tv[1], 'Tiếp viên ca 2') : '<small class="ls-one">1 tổ chạy cả ngày</small>') + '</div>' : '';
      return '<div class="ls-card' + cls + '" data-lapsel="' + esc(b.bus) + '"><div class="ls-h"><b>' + esc(b.bus) + '</b>' + (b.tai ? '<span class="ls-tai">Tài ' + b.tai + '</span>' : '') + btn + '</div>' +
        '<div class="ls-sub">' + (b.first ? lapHm(b.first.t) + ' ' + esc(benOf(b.first.dir)) + ' → ' + end + ' · <b>' + b.n + '</b> chuyến' : 'không chạy chuyến nào') + ' ' + tag +
        (b.own || b.hoOwn ? ' <button type="button" class="ls-mini" data-lap="crewreset" data-bus="' + esc(b.bus) + '" title="Về tổ theo lịch xoay">↺ tổ gốc</button>' : '') + '</div>' + body + '</div>';
    };
    const dang = p.buses.filter(b => b.n || (b.add && !b.del)), off = p.buses.filter(b => !b.n && b.del);
    return '<aside class="lap-side"><div class="ls-top"><div><b>🚌 Danh sách xe</b><small>' + dang.length + ' xe chạy' + (off.length ? ' · ' + off.length + ' xe rút' : '') + '</small></div>' +
      '<button type="button" class="btn-soft btn-solid ls-add" data-lap="add">➕ Thêm xe</button></div>' +
      '<p class="ls-note">Bấm vào xe để xem chuyến của xe trong bảng. Sửa tên ở đây = cả ca của xe, chỉ ngày ' + lapVn(LAP.iso) + '.</p>' +
      dang.map(card).join('') + (off.length ? '<div class="ls-sec">Xe đã rút</div>' + off.map(card).join('') : '') +
      (p.buses.some(b => b.own) ? '<button type="button" class="lap-mini ls-fix" data-lap="crewfix">💾 Lưu tổ đã sửa làm tổ ôm xe cố định từ nay</button>' : '') + '</aside>';
  }

  // bảng tài giống file "lịch làm việc" tải từ FUTA: TÀI | GIỜ TÀI | SỐ XE | LÁI XE | ĐIỆN THOẠI | TIẾP VIÊN | ĐIỆN THOẠI mỗi chiều
  function viewBt() {
    const p = LAP.plan, nd = LAP.tpl.dirs.length, q = $('q').value.trim().toLowerCase(), only = $('onlyWarn').checked, sel = LAP.sel;
    const cols = [];
    for (let i = 0; i < nd; i++) cols.push(p.rows.filter(x => x.dir === i));
    const n = Math.max.apply(null, cols.map(c => c.length));
    const hit = x => q && ((x.bus || '').toLowerCase().indexOf(q.replace(/[\s.\-]/g, '')) >= 0 || lapClean(x.lx).toLowerCase().indexOf(q) >= 0 || lapClean(x.tv).toLowerCase().indexOf(q) >= 0);
    const bad = x => x && (!x.bus || x.late || x.doi || !x.lx || !x.tv);
    let h1 = '<tr>', h2 = '<tr>';
    for (let i = 0; i < nd; i++) {
      h1 += (i ? '<th class="bt-gap" rowspan="2"></th>' : '') + '<th colspan="7" class="bt-ben lap-dir' + i + '">' + dirTo(i) + '</th>';
      h2 += '<th>TÀI</th><th>GIỜ TÀI</th><th>SỐ XE</th><th>LÁI XE</th><th>ĐIỆN THOẠI</th><th>TIẾP VIÊN</th><th>ĐIỆN THOẠI</th>';
    }
    let body = '';
    for (let r = 0; r < n; r++) {
      const xs = cols.map(c => c[r]);
      if (only && !xs.some(bad)) continue;
      body += '<tr' + (xs.some(x => x && hit(x)) ? ' class="lap-hit"' : '') + '>' + xs.map(function (x, i) {
        const gap = i ? '<td class="bt-gap"></td>' : '';
        if (!x) return gap + '<td></td><td></td><td></td><td></td><td></td><td></td><td></td>';
        const giao = x.dau && x.n > 0, me = sel && x.bus === sel ? ' lap-me' : sel ? ' lap-dim' : '';
        return gap + '<td class="lap-tai' + me + '">' + (x.tai || '') + '</td>' +
          '<td class="lap-gio' + (x.dau ? ' dau' : '') + (giao ? ' giao' : '') + me + '" title="' + (x.n === 0 ? 'Chuyến đầu ngày của xe' : giao ? 'Giao ca: tổ ca 2 nhận xe' : '') + '">' + lapHm(x.t) + (x.late ? '<small class="lap-tre">trễ ' + x.late + '\'</small>' : '') + '</td>' +
          '<td class="lap-xe' + (!x.bus ? ' thieu' : x.doi ? ' doi' : '') + me + '"' + (x.bus ? ' data-lapsel="' + esc(x.bus) + '"' : '') + ' title="' + (x.doi ? 'Dồn tài: lịch xoay là xe ' + esc(x.base) + ' · ' : '') + 'Bấm để chọn xe">' + (x.bus ? esc(x.bus) : 'THIẾU XE') + '</td>' +
          ['lx', 'tv'].map(rl => '<td class="lap-nm' + (x['sua_' + rl] ? ' sua' : '') + me + '"' + (x.bus ? ' data-lapk="' + x.key + '" data-role="' + rl + '" title="Bấm để đổi người chuyến này"' : '') + '>' + (x.bus ? nm(x[rl]) : '') + '</td>' +
            '<td class="lap-dt' + me + '">' + (x.bus ? phone(x[rl]) : '') + '</td>').join('');
      }).join('') + '</tr>';
    }
    return '<div class="lap-title">LỊCH LÀM VIỆC TUYẾN BUÝT ' + esc(LAP.tpl.code) + ' · NGÀY ' + lapVn(LAP.iso) + '</div>' +
      '<p class="panel-note">Tài 1–' + LAP.tpl.lots.length + ' = ca 1, tài ' + (LAP.tpl.lots.length + 1) + '–' + LAP.tpl.lots.length * 2 + ' = ca 2. Bấm tên để đổi người 1 chuyến / tới hết ca, bấm biển số để chọn xe. ' +
      '<span class="lap-key dau">giờ đỏ</span> chuyến đầu ca · <span class="lap-key doi">xe vàng</span> dồn tài · <span class="lap-key sua">tên xanh</span> sửa tay.</p>' +
      '<div class="lap-tw"><table class="bt lap-t"><thead>' + h1 + '</tr>' + h2 + '</tr></thead><tbody>' + (body || '<tr><td colspan="15">Không có chuyến nào' + (only ? ' cần chú ý' : '') + '</td></tr>') + '</tbody></table></div>';
  }
  function viewNs() {
    const st = LAP.stats, q = $('q').value.trim().toLowerCase();
    const part = function (role, title) {
      const a = st.filter(o => o.role === role && o.name !== '(chưa có tên)'), none = st.find(o => o.role === role && o.name === '(chưa có tên)');
      if (!a.length && !none) return '';
      const avg = a.reduce((s, o) => s + o.n, 0) / (a.length || 1), mx = Math.max.apply(null, a.map(o => o.n).concat([1]));
      const rows = a.filter(o => !q || o.name.toLowerCase().indexOf(q) >= 0).map(function (o, i) {
        const lv = o.n >= avg * 1.4 ? 'hi' : o.n <= avg * 0.6 ? 'lo' : '';
        return '<tr class="' + (lv ? 'lap-' + lv : '') + '"><td>' + (i + 1) + '</td><td class="lap-ten">' + esc(o.name) + '</td>' +
          '<td class="lap-sl"><span class="lap-pg"><i style="width:' + Math.round(o.n / mx * 100) + '%"></i></span><b>' + o.n + '</b></td>' +
          '<td>' + esc(o.cas.join(' + ')) + '</td><td>' + lapHm(o.tu) + ' → ' + lapHm(o.den) + '</td><td>' +
          (o.hai ? '<span class="pill p-err">2 ca</span> ' : o.doiXe ? '<span class="pill p-info">đổi xe</span> ' : '') + (o.trung ? '<span class="pill p-err">trùng giờ</span> ' : '') +
          (lv === 'hi' ? '<span class="pill p-warn">đi nhiều</span>' : lv === 'lo' ? '<span class="pill p-info">đi ít</span>' : '') + '</td></tr>';
      }).join('');
      return '<h4 class="lap-sub">' + title + ' · ' + a.length + ' người · trung bình ' + avg.toFixed(1) + ' chuyến' +
        (a.length ? (a[0].n === a[a.length - 1].n ? ' · mọi người đều ' + a[0].n + ' chuyến'
          : ' · nhiều nhất ' + esc(a[0].name) + ' (' + a[0].n + ') · ít nhất ' + esc(a[a.length - 1].name) + ' (' + a[a.length - 1].n + ')') : '') +
        (none ? ' · <span class="lap-no">' + none.n + ' chuyến chưa có tên</span>' : '') + '</h4>' +
        '<table class="lap-ns"><thead><tr><th>#</th><th>Họ tên</th><th>Số chuyến</th><th>Xe · ca</th><th>Giờ đầu → cuối</th><th>Ghi chú</th></tr></thead><tbody>' + rows + '</tbody></table>';
    };
    return part('lx', '🚍 Lái xe') + part('tv', '🎫 Tiếp viên');
  }
  // ----- hộp nhập (thêm xe / xoá xe / đổi tên) -----
  function pop() {
    const P = LAP.pop, p = LAP.plan, t = LAP.tpl;
    const benSel = (v) => '<select name="dir">' + t.dirs.map((x, i) => '<option value="' + i + '"' + (+v === i ? ' selected' : '') + '>' + esc(benOf(i)) + '</option>').join('') + '</select>';
    let body = '';
    if (P.type === 'del') {
      const b = p.buses.find(x => x.bus === P.bus) || {};
      body = '<h4>🚫 Rút xe ' + esc(P.bus) + '</h4><small>Các chuyến của xe từ giờ này được dồn cho xe khác (xe về bến sớm nhất nhận chuyến kế tiếp).</small>' +
        '<div class="lap-f"><label>Từ giờ <input name="from" value="' + (P.from != null ? lapHm(P.from) : '') + '" placeholder="trống = cả ngày" autofocus></label>' +
        '<label>Lý do <input name="why" list="lapWhy" value="' + esc(P.why || 'Đi xưởng') + '"></label></div>' +
        '<datalist id="lapWhy"><option value="Đi xưởng"><option value="Sự cố"><option value="Hư xe"><option value="Bảo dưỡng"><option value="Cho tuyến khác mượn"></datalist>' +
        (b.first ? '<small>Lốt hôm nay: ' + lapHm(b.first.t) + ' ' + esc(benOf(b.first.dir)) + ', ' + b.n + ' chuyến.</small>' : '');
    } else if (P.type === 'add') {
      const dels = p.buses.filter(b => b.del && !p.buses.some(x => x.src === b.bus));
      body = '<h4>➕ Thêm xe</h4><small>Xe dự phòng hoặc xe mượn tuyến khác. Chọn "Thay cho" để xe mới nhận nguyên lốt + tổ của xe đã rút.</small>' +
        '<div class="lap-f"><label>Biển số <input name="bus" placeholder="vd 50H70218" autofocus autocomplete="off" spellcheck="false"></label>' +
        '<label>Thay cho <select name="thay"><option value="">— xe tăng cường (dồn tài) —</option>' + dels.map((b, i) => '<option value="' + esc(b.bus) + '"' + (i === 0 ? ' selected' : '') + '>' + esc(b.bus) + ' (' + esc(b.del.why || 'đã xoá') + ')</option>').join('') + '</select></label>' +
        '<label>Từ giờ <input name="from" placeholder="trống = cả ngày"></label>' +
        '<label>Vào ở bến ' + benSel(0) + '</label>' +
        '<label>Ghi chú <input name="note" list="lapNote" value="Dự phòng"></label></div>' +
        '<datalist id="lapNote"><option value="Dự phòng"><option value="Mượn tuyến 157"><option value="Mượn tuyến 159"><option value="Mượn tuyến 160"><option value="Mượn tuyến 161"></datalist>' +
        (dels.length ? '' : '<small>Chưa rút xe nào nên xe thêm sẽ là xe tăng cường: các xe cùng dồn tài từ giờ xe vào.</small>');
    } else if (P.type === 'name') {
      const x = p.rows.find(r => r.key === P.key); if (!x) return '';
      body = '<h4>✏️ Đổi ' + (P.role === 'lx' ? 'lái xe' : 'tiếp viên') + ' · ' + lapHm(x.t) + ' ' + esc(dirName(x.dir)) + ' · xe ' + esc(x.bus) + ' (ca ' + (x.ca === 'C' ? '2' : '1') + ')</h4>' +
        '<div class="lap-f"><label>Họ tên <input name="name" list="lapNames" value="' + esc(lapClean(x[P.role])) + '" autofocus autocomplete="off" spellcheck="false"></label></div>' +
        '<div class="lap-rad"><label><input type="radio" name="scope" value="1" checked> Chỉ chuyến này</label><label><input type="radio" name="scope" value="ca"> Từ chuyến này tới hết ca ' + (x.ca === 'C' ? '2' : '1') + '</label></div>' +
        '<small>Muốn đổi cả ca cho xe này thì sửa ở cột 🚌 Danh sách xe bên trái.</small>' +
        ((LAP.day.trip && LAP.day.trip[x.key] && LAP.day.trip[x.key][P.role] != null) || (LAP.day.seg || []).some(s => s.bus === x.bus && s.ca === x.ca && s.role === P.role && s.from <= x.t) ? '<button type="button" class="lap-mini" data-lap="nameclr">↺ Bỏ tên sửa tay ở chuyến này</button>' : '');
    }
    return '<div class="lap-pop" role="dialog"><form class="lap-pf" data-lapf="' + P.type + '">' + body +
      '<div class="lap-pb"><button type="submit" class="btn-soft btn-solid">' + (P.type === 'del' ? 'Rút xe' : P.type === 'add' ? 'Thêm xe' : 'Lưu') + '</button><button type="button" class="btn-soft" data-lap="close">Huỷ</button></div></form></div>';
  }

  $('out').addEventListener('click', function (ev) {
    if (MODE !== 'lap' || !LAP.plan) return;
    const v = ev.target.closest('[data-lapv]'); if (v) { LAP.view = v.dataset.lapv; render(); return; }
    const k = ev.target.closest('[data-lapk]'); if (k) { LAP.pop = { type: 'name', key: k.dataset.lapk, role: k.dataset.role }; render(); return; }
    const sl = ev.target.closest('[data-lapsel]');
    if (sl && !ev.target.closest('input, label, [data-lap]')) {
      LAP.sel = LAP.sel === sl.dataset.lapsel ? '' : sl.dataset.lapsel; LAP.view = 'bt'; render();
      if (LAP.sel) { const r = $('out').querySelector('.lap-t td.lap-me'); if (r) r.scrollIntoView({ block: 'center', behavior: 'smooth' });
        if (sl.tagName === 'TD') { const c = $('out').querySelector('.ls-card.sel'); if (c) c.scrollIntoView({ block: 'nearest', behavior: 'smooth' }); } }
      return;
    }
    const a = ev.target.closest('[data-lap]'); if (!a || a.tagName === 'SELECT') return;
    const d = LAP.day, act = a.dataset.lap, bus = a.dataset.bus;
    if (act === 'close') { LAP.pop = null; render(); }
    else if (act === 'add') { LAP.pop = { type: 'add' }; render(); }
    else if (act === 'del') { LAP.pop = { type: 'del', bus: bus }; render(); }
    else if (act === 'undel') { delete d.del[bus]; (d.add || []).forEach(x => { if (x.thay === bus) x.thay = ''; }); save(); }
    else if (act === 'unadd') { d.add = (d.add || []).filter(x => x.bus !== bus); if (d.crew) delete d.crew[bus]; if (d.ho) delete d.ho[bus]; save(); }
    else if (act === 'reset') { if (confirm('Bỏ hết thay đổi của ngày ' + lapVn(LAP.iso) + ' (xe xoá/thêm, tên sửa tay)?')) { LAP.day = {}; save(); } }
    else if (act === 'crewreset') { if (d.crew) delete d.crew[bus]; if (d.ho) delete d.ho[bus]; save(); }
    else if (act === 'crewfix') {
      if (!confirm('Lưu tổ lái đã sửa của ngày ' + lapVn(LAP.iso) + ' làm tổ ôm xe cố định?\nCác ngày khác (kể cả ngày trước) sẽ dùng tổ mới, vẫn tự đổi ca mỗi thứ Hai.')) return;
      const p = LAP.plan;
      Object.keys(d.crew || {}).forEach(function (b) {
        const target = p.buses.find(x => x.bus === b); const key = target && target.src ? target.src : b;
        if (!LAP.tpl.crew[key]) return;
        const kp = (LAP.tpl.keep || {})[key] || {};
        const c = d.crew[b], back = (pair, k) => lapFlip(pair.map(lapClean), p.flip && !kp[k], LAP.tpl.fixed); // đổi ngược về ca của ngày mẫu
        [c.lx, c.tv].forEach(pr => pr.forEach(n => { const f = lapFixOf(n); if (f) LAP.tpl.fixed[lapClean(n)] = f; }));
        LAP.tpl.crew[key] = { lx: back(c.lx, 'lx'), tv: back(c.tv, 'tv') };
      });
      store.set(K_TPL(LAP.code), LAP.tpl); d.crew = {}; save(); msg('💾 Đã lưu tổ ôm xe mới cho tuyến ' + LAP.code + '.', 'ok');
    }
    else if (act === 'nameclr') {
      const P = LAP.pop, x = LAP.plan.rows.find(r => r.key === P.key);
      if (d.trip && d.trip[P.key]) { delete d.trip[P.key][P.role]; if (!Object.keys(d.trip[P.key]).length) delete d.trip[P.key]; }
      d.seg = (d.seg || []).filter(s => !(x && s.bus === x.bus && s.ca === x.ca && s.role === P.role && s.from <= x.t));
      LAP.pop = null; save();
    }
    else if (act === 'xlsx') xlsx();
  });
  $('out').addEventListener('change', function (ev) {
    if (MODE !== 'lap' || !LAP.plan) return;
    const s = ev.target.closest('select[data-lap="sheet"]');
    if (s) { const sh = LAP.cand.find(x => x.idx === +s.value); if (sh) useSheet(sh).catch(e => msg('❌ ' + e.message, 'err')); return; }
    const inp = ev.target.closest('.lap-in'); if (!inp) return;
    const d = LAP.day, b = inp.dataset.bus, f = inp.dataset.f, info = LAP.plan.buses.find(x => x.bus === b);
    if (f === 'ho') {
      const v = inp.value.trim(), m = v ? lapParseHm(v) : -1;
      if (m == null) { msg('❌ Giờ giao ca gõ dạng hh:mm (vd 13:30), để trống = 1 tổ cả ngày.', 'err'); return; }
      d.ho = d.ho || {}; d.ho[b] = m;
    } else {
      d.crew = d.crew || {};
      const c = d.crew[b] || { lx: info.crew.lx.slice(), tv: info.crew.tv.slice() };
      c[f.slice(0, 2)][+f[2]] = lapNorm(inp.value); d.crew[b] = c;
    }
    save();
  });
  $('out').addEventListener('submit', function (ev) {
    const fm = ev.target.closest('.lap-pf'); if (!fm) return;
    ev.preventDefault();
    const d = LAP.day, P = LAP.pop, val = n => fm.elements[n] ? String(fm.elements[n].value || '').trim() : '';
    if (P.type === 'del') {
      const from = val('from') ? lapParseHm(val('from')) : 0;
      if (from == null) { msg('❌ Giờ gõ dạng hh:mm (vd 09:30), để trống = cả ngày.', 'err'); return; }
      d.del = d.del || {}; d.del[P.bus] = { from: from, why: val('why') };
    } else if (P.type === 'add') {
      const bus = lapPlate(val('bus')), from = val('from') ? lapParseHm(val('from')) : 0;
      if (!lapIsPlate(bus)) { msg('❌ Biển số chưa đúng (vd 50H70218).', 'err'); return; }
      if (from == null) { msg('❌ Giờ gõ dạng hh:mm, để trống = cả ngày.', 'err'); return; }
      if (LAP.plan.buses.some(b => b.bus === bus && !b.del)) { msg('❌ Xe ' + bus + ' đang có trong bảng tài ngày này rồi.', 'err'); return; }
      const thay = val('thay');
      if (thay && LAP.day.del[thay] && LAP.day.del[thay].from === 0 && from > 0 && !confirm('Xe ' + thay + ' nghỉ cả ngày mà xe mới tới ' + lapHm(from) + ' mới vào. Các chuyến trước đó sẽ dồn tài cho xe khác. Tiếp tục?')) return;
      d.add = (d.add || []).filter(x => x.bus !== bus);
      let dir = +val('dir') || 0;
      if (thay && !fm.elements.dir.dataset.touched) { const r = LAP.plan.rows.find(x => x.base === thay && x.t >= Math.max(from, LAP.day.del[thay].from)); if (r) dir = r.dir; }
      d.add.push({ bus: bus, from: from, dir: dir, note: val('note'), thay: thay });
    } else if (P.type === 'name') {
      const x = LAP.plan.rows.find(r => r.key === P.key), name = lapNorm(val('name'));
      if (!x) return;
      if (fm.querySelector('input[name="scope"]:checked').value === 'ca') {
        d.seg = (d.seg || []).filter(s => !(s.bus === x.bus && s.ca === x.ca && s.role === P.role && s.from >= x.t));
        d.seg.push({ bus: x.bus, ca: x.ca, from: x.t, role: P.role, name: name });
        if (d.trip) Object.keys(d.trip).forEach(function (k) { const r = LAP.plan.rows.find(y => y.key === k); if (r && r.bus === x.bus && r.ca === x.ca && r.t >= x.t) delete d.trip[k][P.role]; });
      } else { d.trip = d.trip || {}; d.trip[P.key] = d.trip[P.key] || {}; d.trip[P.key][P.role] = name; }
    }
    LAP.pop = null; save();
  });
  $('out').addEventListener('input', function (ev) { if (ev.target.name === 'dir' && ev.target.closest('.lap-pf')) ev.target.dataset.touched = '1'; });
  document.addEventListener('keydown', function (ev) { if (ev.key === 'Escape' && MODE === 'lap' && LAP.pop) { LAP.pop = null; render(); } });

  // ----- Excel: giống bảng tài đang dùng (STT, giờ, xe, LX + MSNV + SĐT, TV + MSNV + SĐT mỗi chiều) + sheet nhân sự + tổ lái -----
  function xlsx() {
    msg('Đang tạo file Excel...');
    loadExcelJS().then(function (ExcelJS) {
      const p = LAP.plan, t = LAP.tpl, nd = t.dirs.length, N = t.names || {};
      const wb = new ExcelJS.Workbook(), nXe = p.buses.filter(b => b.n).length;
      // giống file "lịch làm việc" tải từ FUTA: TÀI | GIỜ TÀI | SỐ XE | LÁI XE | ĐIỆN THOẠI | TIẾP VIÊN | ĐIỆN THOẠI mỗi chiều
      const ws = wb.addWorksheet('BẢNG TÀI ' + nXe + ' XE ' + LAP.iso.slice(8, 10) + '.' + LAP.iso.slice(5, 7), { views: [{ state: 'frozen', ySplit: 3 }] });
      const font = { name: 'Times New Roman', size: 12 }, mid = { horizontal: 'center', vertical: 'middle', wrapText: true };
      const fill = c => ({ type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF' + c } });
      const thin = { style: 'thin', color: { argb: 'FF9AA7BF' } }, box = { top: thin, left: thin, bottom: thin, right: thin };
      const W = 7, cols = nd * W;
      ws.mergeCells(1, 1, 1, cols); ws.getCell(1, 1).value = 'LỊCH LÀM VIỆC TUYẾN BUÝT ' + t.code + ' NGÀY ' + lapVn(LAP.iso) + ' (' + lapThu(LAP.iso) + ') · ' + nXe + ' XE';
      ws.getCell(1, 1).font = Object.assign({}, font, { bold: true, size: 15 }); ws.getCell(1, 1).alignment = mid; ws.getRow(1).height = 26;
      const hd = ['TÀI', 'GIỜ TÀI', 'SỐ XE', 'LÁI XE', 'ĐIỆN THOẠI', 'TIẾP VIÊN', 'ĐIỆN THOẠI'];
      for (let i = 0; i < nd; i++) {
        ws.mergeCells(2, i * W + 1, 2, i * W + W); const c = ws.getCell(2, i * W + 1); c.value = t.code + ' - ' + dirName(i).replace(/\s*(?:→|-|–)\s*/, ' đến ');
        c.font = Object.assign({}, font, { bold: true }); c.alignment = mid; c.fill = fill(i ? 'FFDDB0' : 'CFE2FF');
        hd.forEach(function (h, j) { const x = ws.getCell(3, i * W + j + 1); x.value = h; x.font = Object.assign({}, font, { bold: true }); x.alignment = mid; x.border = box; x.fill = fill('E6EDFD'); });
      }
      const colz = []; for (let i = 0; i < nd; i++) colz.push(p.rows.filter(x => x.dir === i));
      const n = Math.max.apply(null, colz.map(c => c.length));
      for (let r = 0; r < n; r++) {
        colz.forEach(function (c, i) {
          const x = c[r], base = i * W + 1, row = ws.getRow(r + 4);
          const vals = x ? [x.tai || '', x.t / 1440, x.bus || 'THIẾU XE', lapClean(x.lx), lapSdt((N[lapClean(x.lx)] || {}).dt), lapClean(x.tv), lapSdt((N[lapClean(x.tv)] || {}).dt)] : new Array(W).fill('');
          vals.forEach(function (v, j) {
            const cell = row.getCell(base + j); cell.value = v; cell.font = font; cell.alignment = mid; cell.border = box;
            if (j === 1 && x) { cell.numFmt = 'hh:mm'; if (x.dau) { cell.fill = fill('FF5B5B'); cell.font = Object.assign({}, font, { bold: true, color: { argb: 'FFFFFFFF' } }); } }
            if (j === 2 && x && (!x.bus || x.late)) cell.fill = fill(!x.bus ? 'FF9C9C' : 'FFD08A');
            else if (j === 2 && x && x.doi) cell.fill = fill('FFF1A8');
            if ((j === 3 || j === 5) && x && x[j === 3 ? 'sua_lx' : 'sua_tv']) cell.font = Object.assign({}, font, { color: { argb: 'FF1F44B8' }, bold: true });
          });
          if (x && x.late) row.getCell(base + 1).note = 'Xe tới bến trễ ' + x.late + ' phút';
        });
      }
      [7, 10, 13, 26, 14, 26, 14].forEach((w, j) => { for (let i = 0; i < nd; i++) ws.getColumn(i * W + j + 1).width = w; });
      // nhân sự
      const ns = wb.addWorksheet('Nhân sự');
      ns.addRow(['Chức vụ', 'Họ tên', 'Số chuyến', 'Xe · ca', 'Giờ đầu', 'Giờ cuối', 'Ghi chú']).eachCell(c => { c.font = Object.assign({}, font, { bold: true }); c.fill = fill('E6EDFD'); c.border = box; });
      LAP.stats.forEach(function (o) {
        const r = ns.addRow([o.role === 'lx' ? 'Lái xe' : 'Tiếp viên', o.name, o.n, o.cas.join(' + '), o.tu / 1440, o.den / 1440, [o.hai ? '2 ca' : o.doiXe ? 'đổi xe' : '', o.trung ? 'trùng giờ' : ''].filter(Boolean).join(', ')]);
        r.eachCell(c => { c.font = font; c.border = box; }); r.getCell(5).numFmt = r.getCell(6).numFmt = 'hh:mm';
        if (o.hai || o.trung || o.name === '(chưa có tên)') r.getCell(2).font = Object.assign({}, font, { color: { argb: 'FFC9303F' }, bold: true });
      });
      [12, 28, 11, 34, 10, 10, 18].forEach((w, j) => { ns.getColumn(j + 1).width = w; });
      // tổ lái + xe thay đổi
      const to = wb.addWorksheet('Danh sách xe');
      to.addRow(['BKS', 'Tài · lốt', 'Số chuyến', 'LX ca 1', 'TV ca 1', 'Giao ca', 'LX ca 2', 'TV ca 2', 'Ghi chú']).eachCell(c => { c.font = Object.assign({}, font, { bold: true }); c.fill = fill('E6EDFD'); c.border = box; });
      p.buses.forEach(function (b) {
        const r = to.addRow([b.bus, (b.tai ? 'Tài ' + b.tai + ' · ' : '') + (b.first ? lapHm(b.first.t) + ' ' + benOf(b.first.dir) : ''), b.n, lapClean(b.crew.lx[0]), lapClean(b.crew.tv[0]), b.hoT != null ? lapHm(b.hoT) : 'cả ngày', lapClean(b.crew.lx[1]), lapClean(b.crew.tv[1]),
          b.del ? 'Xoá ' + (b.del.from ? 'từ ' + lapHm(b.del.from) : 'cả ngày') + ' — ' + (b.del.why || '') : b.add ? (b.src ? 'Thay ' + b.src : 'Thêm') + (b.add.from ? ' từ ' + lapHm(b.add.from) : '') + ' — ' + (b.add.note || '') : '']);
        r.eachCell(c => { c.font = font; c.border = box; });
        if (b.del || b.add) r.getCell(1).fill = fill(b.del ? 'FF9C9C' : 'C8F0D4');
      });
      [14, 16, 10, 24, 24, 10, 24, 24, 34].forEach((w, j) => { to.getColumn(j + 1).width = w; });
      return wb.xlsx.writeBuffer();
    }).then(function (buf) {
      const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }));
      a.download = 'Bảng tài ' + LAP.tpl.code + ' - ' + lapVn(LAP.iso).replace(/\//g, '.') + '.xlsx'; document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(a.href), 5000);
      msg('✅ Đã tải Excel bảng tài ' + LAP.tpl.code + ' ngày ' + lapVn(LAP.iso) + ' (3 sheet: bảng tài kiểu lịch làm việc FUTA, nhân sự, danh sách xe).', 'ok');
    }).catch(function (e) { msg('❌ Không tạo được Excel: ' + e.message, 'err'); });
  }

  drawTpls();
  // thẻ ẩn: mở khoá xong (tự mở lại bằng mã cũ) mà đang ở thẻ này thì lập luôn
  new MutationObserver(function () { if (!$('tabLap').hidden && TAB === 'lap' && MODE !== 'lap' && codes().length) run(true); }).observe($('tabLap'), { attributes: true, attributeFilter: ['hidden', 'class'] });
})();
