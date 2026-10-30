// ===== CẤU HÌNH: URL Web App của Apps Script (kết thúc /exec) =====
const API_URL = 'https://script.google.com/macros/s/AKfycbxWzYaiYmEQiVrl4oNgFCBBxOHUnX8_nIZK396IrXbFDx-H0sz-BAhhozyo14wrWLAs/exec';
function getUrl() { return API_URL; }

let DATA = null, CUR = null;
const $ = id => document.getElementById(id);
const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
function msg(t, cls) { // cls: ok / err / info; trống = đang chạy (có vòng xoay)
  const el = $('msg');
  el.className = cls || ''; el.textContent = t || '';
  // điện thoại: có kết quả mà dòng thông báo đang khuất dưới màn hình thì cuộn xuống cho thấy
  if ((cls === 'ok' || cls === 'err') && t && window.innerWidth < 760) {
    const r = el.getBoundingClientRect();
    if (r.top > window.innerHeight - 60 || r.bottom < 0) el.scrollIntoView({ block: 'start', behavior: 'smooth' });
  }
}
const hm5 = v => String(v || '').slice(-5);
// Mất chuyến (xe KHÔNG chạy: tài xế/tiếp viên "Mất Chuyến") khác Đề xuất mất chuyến (xe CÓ chạy, có giờ đi/đến, chờ duyệt)
const isDx = m => m.loai === 'dexuat' || /đề xuất/i.test(m.trangThai || '');
const clip = (lines, n) => lines.length > n ? lines.slice(0, n).concat(['… và ' + (lines.length - n) + ' dòng nữa']) : lines;
const typePill = m => isDx(m) ? '<span class="pill p-dx" title="Xe có chạy, bị đề xuất tính mất chuyến (chờ duyệt)">Đề xuất mất chuyến</span>'
                              : '<span class="pill p-mat" title="Xe không chạy chuyến này">Mất chuyến</span>';

// Google Cloud OAuth Client ID (loại Web application) để mỗi người lưu ảnh GPS vào Google của họ.
// Để trống = ảnh GPS lưu vào Drive/Sheet chung như cũ.
const GOOGLE_CLIENT_ID = '';

// CÔNG TẮC TÀI KHOẢN: false = TẮT đăng ký / đăng nhập, dùng mã truy cập (WEB_KEY) như cũ.
// Bật lại: đổi thành true VÀ thêm Script Property USER_MODE = on bên Apps Script (2 bên phải giống nhau).
const USER_MODE = false;

// ===== MÃ TRUY CẬP (khi tắt tài khoản, khớp Script Property WEB_KEY) =====
function getKey(reset) {
  let k = localStorage.getItem('web_key');
  if (!k || reset) {
    const input = prompt('Nhập mã truy cập (WEB_KEY):');
    if (input !== null) { k = input.trim(); localStorage.setItem('web_key', k); } // bấm Hủy thì giữ mã cũ
  }
  return k || '';
}
// Tên người dùng (khi dùng mã truy cập chung): hỏi 1 lần, gửi kèm để log biết ai dùng
function getWho(reset) {
  let w = localStorage.getItem('web_who');
  if (!w || reset) {
    const input = prompt('Tên của bạn (để ghi nhận hoạt động, vd: Nguyễn Văn A):', w || '');
    if (input !== null && input.trim()) { w = input.trim().slice(0, 60); localStorage.setItem('web_who', w); }
  }
  return w || '';
}
function authParam() { return USER_MODE ? { sid: getSid(), src: 'web' } : { key: getKey(), who: getWho(), src: 'web' }; }

// ===== ĐĂNG NHẬP (tài khoản web, gắn tài khoản FUTA riêng) =====
function getSid() { try { return localStorage.getItem('web_sid') || ''; } catch (e) { return ''; } }
let ME = null;

// ===== JSONP (tự thử lại khi lỗi kết nối) =====
let _n = 0;
function apiOnce(params, timeoutMs) {
  return new Promise(function (resolve, reject) {
    let url;
    try { url = getUrl(); } catch (e) { reject(e); return; }
    const cb = '__cb' + (++_n) + '_' + Date.now();
    const q = new URLSearchParams(Object.assign(authParam(), { callback: cb }, params));
    const script = document.createElement('script');
    let done = false, timer;
    const clean = function () { done = true; delete window[cb]; script.remove(); clearTimeout(timer); };
    window[cb] = function (data) { clean(); data && data.ok ? resolve(data) : reject(apiErr(data)); };
    script.onerror = function () {
      if (!done) {
        clean();
        const e = new Error('Không kết nối được tới máy chủ (Google hoặc mạng đang chập chờn). Thử lại sau ít giây; nếu vẫn lỗi, mở trang bằng cửa sổ ẩn danh.');
        e.net = true;
        reject(e);
      }
    };
    timer = setTimeout(function () { if (!done) { clean(); reject(new Error('Hết thời gian chờ')); } }, timeoutMs || 120000);
    script.src = url + '?' + q.toString();
    document.body.appendChild(script);
  });
}

// Lỗi từ server: data.login -> hiện màn đăng nhập; data.futa -> phiên FUTA hết hạn, nhập lại ở mục Tài khoản
function apiErr(data) {
  const e = new Error((data && data.error) || 'Lỗi không xác định');
  if (data && data.login && USER_MODE) { e.login = true; showAuth('login'); }
  if (data && data.futa) e.futa = true;
  if (data && data.field) e.field = data.field;
  return e;
}

// POST (mật khẩu, token Google không nằm trên URL). Apps Script trả CORS cho body text/plain.
function apiPost(params, timeoutMs) {
  const ctl = new AbortController(), timer = setTimeout(function () { ctl.abort(); }, timeoutMs || 120000);
  return fetch(getUrl(), { method: 'POST', body: JSON.stringify(Object.assign(authParam(), params)), signal: ctl.signal })
    .then(function (r) { return r.json(); }, function (e) {
      throw new Error(e.name === 'AbortError' ? 'Hết thời gian chờ' : 'Không kết nối được tới máy chủ, thử lại sau ít giây.');
    })
    .then(function (data) { if (!data || !data.ok) throw apiErr(data); return data; })
    .finally(function () { clearTimeout(timer); });
}

function api(params, timeoutMs, tries) {
  tries = tries == null ? 2 : tries; // thử lại tối đa 2 lần
  return apiOnce(params, timeoutMs).catch(function (e) {
    if (e.net && tries > 0) {
      msg('Kết nối chập chờn, đang thử lại...');
      return new Promise(function (r) { setTimeout(r, 1500); })
        .then(function () { return api(params, timeoutMs, tries - 1); });
    }
    throw e;
  });
}

// ===== NGÀY: hiện dd/mm/yyyy, tính theo giờ Việt Nam =====
function vnToday() { // dd/mm/yyyy theo giờ VN, bất kể máy để múi giờ nào
  return new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Ho_Chi_Minh', day: '2-digit', month: '2-digit', year: 'numeric' }).format(new Date());
}
function isoDate() { // dd/mm/yyyy -> yyyy-mm-dd cho server, rỗng nếu gõ sai
  const m = $('date').value.trim().match(/^(\d{1,2})[\/.\-](\d{1,2})[\/.\-](\d{4})$/);
  return m ? m[3] + '-' + m[2].padStart(2, '0') + '-' + m[1].padStart(2, '0') : '';
}

// ===== KHỞI TẠO =====
$('date').value = vnToday();

let ROUTES = [];
let FAV_CODES = []; // tuyến cụm (Script Property FB_ROUTES)
const RP = {};      // ô chọn nhiều tuyến dùng chung (GPS, về bến): tên -> { set, change }, xem rpHtml
const routeText = r => r.code + (r.name ? ' — ' + r.name : '');

function loadRoutes() {
  if (USER_MODE && !getSid()) { showAuth('login'); return; }
  api({ action: 'routes' }).then(function (res) {
    setMe(res.me);
    const favSet = new Set(res.fav); FAV_CODES = (res.fav || []).slice();
    // tuyến "Hay dùng" lên đầu danh sách gợi ý
    ROUTES = res.routes.filter(r => favSet.has(r.code)).concat(res.routes.filter(r => !favSet.has(r.code)));
    const last = localStorage.getItem('last_route');
    if (last && !$('route').value) $('route').value = last;
    $('route').placeholder = 'Bấm để chọn, hoặc gõ số / tên tuyến (vd: 30, 01, cong vien)';
    if (RB) rbDraw(); // đang mở danh sách lúc tuyến tải xong
    msg('');
  }).catch(function (e) { if (!e.login) msg('❌ ' + e.message, 'err'); });
}
loadRoutes();

// Đổi chữ người dùng gõ thành tuyến: khớp đúng cả dòng, hoặc đúng mã tuyến (gõ "1" cũng ra "01"), hoặc chỉ có 1 tuyến chứa chữ đó
// (không phân biệt dấu: "cong vien" = "Công viên")
function findRoute(text) {
  const v = norm(text);
  if (!v || !ROUTES.length) return null;
  const nz = x => norm(x).replace(/^0+(?=\d)/, '');
  let r = ROUTES.find(x => norm(routeText(x)) === v) ||
          ROUTES.find(x => norm(x.code) === v) ||
          ROUTES.find(x => nz(x.code) === nz(v));
  if (!r) {
    const m = ROUTES.filter(x => norm(routeText(x)).indexOf(v) !== -1);
    if (m.length === 1) r = m[0];
  }
  return r || null;
}
function sel() {
  const r = findRoute($('route').value);
  if (!r) return {};
  localStorage.setItem('last_route', routeText(r));
  return { id: String(r.id), code: r.code };
}

$('route').onkeydown = function (e) { if (e.key === 'Enter') { e.preventDefault(); $('btnLoad').click(); } };
$('date').onkeydown = function (e) { if (e.key === 'Enter') { e.preventDefault(); $('btnLoad').click(); } };

// ===== BẤM VÀO Ô LÀ BÔI ĐEN SẴN (gõ đè luôn, khỏi xoá từng chữ) =====
// Chrome / Safari: select() lúc focus bị lần nhả chuột (mouseup) bỏ bôi đen -> chặn đúng lần mouseup đầu tiên sau khi focus.
function selectAll(el) {
  try { el.select(); } catch (e) { return; }
  const up = function (e) { e.preventDefault(); el.removeEventListener('mouseup', up); };
  el.addEventListener('mouseup', up);
  setTimeout(function () {
    el.removeEventListener('mouseup', up);
    if (document.activeElement === el && el.selectionStart === el.selectionEnd) try { el.setSelectionRange(0, el.value.length); } catch (e) { /* iPhone */ }
  }, 0);
}
const SELECT_ON_FOCUS = '#date, #plate, #tFrom, #tTo, #q, input.edit-in';
document.addEventListener('focusin', function (e) {
  const el = e.target;
  if (el.matches && el.matches(SELECT_ON_FOCUS)) selectAll(el);
});
// Nút × trong ô: xoá sạch, giữ con trỏ trong ô (ô tuyến hiện lại danh sách, ô lọc vẽ lại bảng)
document.addEventListener('mousedown', function (e) { if (e.target.closest && e.target.closest('.clr')) e.preventDefault(); });
document.addEventListener('click', function (e) {
  const b = e.target.closest && e.target.closest('.clr');
  if (!b) return;
  const el = $(b.dataset.clr); if (!el) return;
  el.value = ''; el.focus();
  el.dispatchEvent(new Event('input', { bubbles: true }));
});

// ===== Ô CHỌN TUYẾN: gõ tìm + danh sách xổ xuống (thay datalist của trình duyệt) =====
// Dùng cho mọi ô có data-route: "Tuyến" (one), Bảng tài 1-3 (bt), "Thêm tuyến" ở GPS / về bến (multi).
// - Bấm vào ô: bôi đen sẵn + hiện TẤT CẢ tuyến (tuyến cụm lên đầu), không bị lọc theo chữ cũ trong ô.
// - Gõ: lọc theo mã hoặc tên, không cần dấu ("cong vien" ra "Công viên..."); mã đúng / bắt đầu bằng chữ gõ lên đầu.
// - ↑ ↓ chọn, Enter lấy tuyến đang sáng (ô Tuyến: lấy xong tải bảng xe luôn như trước), Esc đóng, bấm chuột chọn.
// - Ô "Thêm tuyến": chọn là thêm luôn vào danh sách tick, ô trống lại để chọn tiếp.
const norm = s => String(s == null ? '' : s).normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/gi, 'd').toLowerCase().trim();
function routeMatches(q) {
  const v = norm(q), nz = x => x.replace(/^0+(?=\d)/, '');
  if (!v) return ROUTES.slice();
  const out = [];
  ROUTES.forEach(function (r, i) {
    const c = norm(r.code), n = norm(r.name), all = c + ' — ' + n;
    const s = (c === v || nz(c) === nz(v) || all === v) ? 0 : (c.indexOf(v) === 0 || nz(c).indexOf(nz(v)) === 0) ? 1
            : (' ' + n).indexOf(' ' + v) !== -1 ? 2 : all.indexOf(v) !== -1 ? 3 : -1;
    if (s >= 0) out.push({ r: r, s: s, i: i });
  });
  out.sort((a, b) => a.s - b.s || a.i - b.i);
  return out.map(x => x.r);
}
const RBL = document.createElement('div');
RBL.className = 'rb-list'; RBL.hidden = true; RBL.setAttribute('role', 'listbox');
document.body.appendChild(RBL);
let RB = null; // { el, items, act, typed }
const rbMulti = el => el.dataset.route === 'multi';
const rbQuery = el => rbMulti(el) ? el.value.split(/[,;]/).pop() : el.value;
function rbOpen(el, typed) {
  const q = typed ? rbQuery(el) : '';
  const items = routeMatches(q).slice(0, 120);
  RB = { el: el, items: items, act: typed && q.trim() && items.length ? 0 : -1, typed: typed };
  rbDraw();
}
function rbClose() { RB = null; RBL.hidden = true; RBL.innerHTML = ''; }
function rbDraw() {
  if (!RB || !RB.el.isConnected) { rbClose(); return; }
  const fav = new Set(FAV_CODES), name = RB.el.dataset.rpInput;
  const chosen = name && RP[name] ? RP[name].set() : new Set();
  RBL.innerHTML = !ROUTES.length ? '<div class="rb-empty">Đang tải danh sách tuyến...</div>'
    : RB.items.length ? RB.items.map((r, i) => '<div class="rb-it' + (i === RB.act ? ' on' : '') + '" data-i="' + i + '" role="option"><b>' + esc(r.code) + '</b><span>' + esc(r.name) +
        '</span>' + (chosen.has(r.code) ? '<em class="ok">✓ đã chọn</em>' : fav.has(r.code) ? '<em>cụm</em>' : '') + '</div>').join('')
    : '<div class="rb-empty">Không thấy tuyến "' + esc(rbQuery(RB.el).trim()) + '"</div>';
  const b = RB.el.getBoundingClientRect(), vh = window.visualViewport ? window.visualViewport.height : window.innerHeight;
  const w = Math.min(Math.max(b.width, 320), window.innerWidth - 16), below = vh - b.bottom - 8, above = b.top - 8;
  RBL.style.width = w + 'px';
  RBL.style.left = Math.max(8, Math.min(b.left, window.innerWidth - w - 8)) + 'px';
  if (below < 200 && above > below) { RBL.style.top = ''; RBL.style.bottom = (window.innerHeight - b.top + 4) + 'px'; RBL.style.maxHeight = Math.min(380, above) + 'px'; }
  else { RBL.style.bottom = ''; RBL.style.top = (b.bottom + 4) + 'px'; RBL.style.maxHeight = Math.min(380, Math.max(below, 140)) + 'px'; }
  RBL.hidden = false;
  const on = RBL.querySelector('.rb-it.on'); if (on) on.scrollIntoView({ block: 'nearest' });
}
// Lấy 1 tuyến. Trả true nếu phím Enter được làm tiếp việc cũ của ô (ô Tuyến: tải bảng xe).
function rbPick(r, viaEnter) {
  const el = RB && RB.el; if (!el || !r) return false;
  if (rbMulti(el)) { // thay chữ đang gõ dở bằng mã tuyến rồi bấm ➕ Thêm (các tuyến gõ trước dấu phẩy cũng được thêm)
    const parts = el.value.split(/[,;]/); parts[parts.length - 1] = r.code;
    el.value = parts.map(x => x.trim()).filter(Boolean).join(', ');
    rbClose();
    const add = document.querySelector('[data-rp-act="add"][data-rp="' + el.dataset.rpInput + '"]');
    if (add) add.click();
    return false;
  }
  el.value = routeText(r);
  rbClose();
  if (el.id === 'route') { localStorage.setItem('last_route', routeText(r)); return viaEnter; }
  if (el.dataset.route === 'bt') { // bảng tài: chọn xong nhảy sang ô tuyến kế tiếp
    localStorage.setItem('bt_' + el.id, el.value);
    const nx = $(BT_IDS[BT_IDS.indexOf(el.id) + 1]); if (nx && !nx.value.trim()) nx.focus();
  }
  return false;
}
document.addEventListener('focusin', function (e) {
  const el = e.target;
  if (!el.matches || !el.matches('input[data-route]')) return;
  if (el._keep) { const t = el._keep.typed; delete el._keep; rbOpen(el, t); return; } // vẽ lại bảng: giữ nguyên chữ đang gõ
  selectAll(el); rbOpen(el, false);
});
// Ô đang có con trỏ sẵn (vừa Enter / Esc) mà bấm lại: danh sách đang đóng thì bôi đen + mở lại
document.addEventListener('click', function (e) {
  const el = e.target;
  if (!el.matches || !el.matches('input[data-route]') || (RB && RB.el === el && !RBL.hidden)) return;
  selectAll(el); rbOpen(el, false);
});
document.addEventListener('input', function (e) { if (e.target.matches && e.target.matches('input[data-route]')) rbOpen(e.target, !!e.target.value.trim()); });
document.addEventListener('focusout', function (e) {
  if (!RB || e.target !== RB.el) return;
  setTimeout(function () { if (RB && document.activeElement !== RB.el) rbClose(); }, 150);
});
RBL.addEventListener('mousedown', function (e) { e.preventDefault(); }); // bấm vào danh sách không làm ô mất con trỏ
RBL.addEventListener('click', function (e) { const it = e.target.closest('.rb-it'); if (it && RB) rbPick(RB.items[+it.dataset.i], false); });
document.addEventListener('keydown', function (e) {
  if (!RB || e.target !== RB.el || RBL.hidden) return;
  const n = RB.items.length;
  if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
    e.preventDefault(); if (!n) return;
    RB.act = e.key === 'ArrowDown' ? (RB.act + 1) % n : (RB.act <= 0 ? n - 1 : RB.act - 1); rbDraw();
  } else if (e.key === 'Escape') { e.preventDefault(); rbClose(); }
  else if (e.key === 'Enter' && RB.act >= 0 && RB.items[RB.act]) {
    if (!rbPick(RB.items[RB.act], true)) { e.preventDefault(); e.stopImmediatePropagation(); }
  } else if (e.key === 'Enter') rbClose();
}, true);
window.addEventListener('resize', function () { if (RB) rbDraw(); });
document.addEventListener('scroll', function (e) { if (RB && e.target !== RBL) rbDraw(); }, true);

// Vẽ lại #out (GPS / về bến) mà KHÔNG làm mất chữ đang gõ trong ô "Thêm tuyến" (trước: lúc đang chụp GPS cứ 10 giây vẽ lại là mất chữ)
function setOut(html) {
  const a = document.activeElement, name = a && a.dataset && a.dataset.rpInput;
  const st = name ? { v: a.value, s: a.selectionStart, e: a.selectionEnd, typed: !!(RB && RB.el === a && RB.typed) } : null;
  $('out').innerHTML = html;
  if (!st) return;
  const n = document.querySelector('[data-rp-input="' + name + '"]');
  if (!n) return;
  n.value = st.v; n._keep = { typed: st.typed }; n.focus();
  try { n.setSelectionRange(st.s, st.e); } catch (e) { /* bỏ qua */ }
}

$('btnUser').onclick = function () { if (!USER_MODE) { getKey(true); getWho(true); loadRoutes(); return; } showAuth(ME ? 'acc' : 'login'); };

$('btnLoad').onclick = function () {
  const s = sel(); if (!s.id || !isoDate()) { msg('❌ Chưa nhập đúng tuyến/ngày (ngày gõ dạng dd/mm/yyyy), hoặc danh sách tuyến chưa tải xong.', 'err'); return; }
  $('btnLoad').disabled = true; msg('Đang tải...'); $('out').innerHTML = ''; $('stats').innerHTML = '';
  api({ action: 'load', routeId: s.id, label: s.code, date: isoDate() }).then(function (res) {
    DATA = res; CUR = s; MODE = 'trips'; $('btnCopy').style.display = 'none'; msg('✅ Tuyến ' + s.code + ' — ' + $('date').value, 'ok'); render();
  }).catch(function (e) { msg('❌ ' + e.message, 'err'); })
    .then(function () { $('btnLoad').disabled = false; });
};

$('q').oninput = $('onlyWarn').onchange = function () { rerender(); };

// ===== SO SÁNH EBMS =====
let EB = null, MODE = 'trips';
let NV = null;
let LV = null;
let ED = null;
let BT = null;
let GP = null;
let UD = null; // màn Hoàn tác
function rerender() {
  if (MODE === 'ebms' && EB) renderEbms();
  else if (MODE === 'nv' && NV) renderNv();
  else if (MODE === 'lvc' && LV) renderLvc();
  else if (MODE === 'edit' && ED) renderEdit();
  else if (MODE === 'auto') { if (AU) renderAuto(); }
  else if (MODE === 'bt' && BT) renderBt();
  else if (MODE === 'gps' && GP) renderGps();
  else if (MODE === 'veben') { if (VB) renderVeben(); }
  else if (MODE === 'undo') { if (UD) renderUndo(); }
  else if (DATA) render();
}

function catOf(loai) {
  loai = String(loai || '');
  if (loai.includes('KHỚP')) return 'ok';
  if (loai.includes('LỆCH GIỜ KẾ HOẠCH')) return 'plan';
  if (loai.includes('LỆCH')) return 'warn';
  if (loai.includes('KHÔNG CÓ PHÂN CÔNG')) return 'nopc';
  if (loai.includes('THIẾU EBMS')) return 'noebms';
  return '';
}

$('btnEbms').onclick = function () {
  const s = sel(); if (!s.id || !isoDate()) { msg('❌ Chưa nhập đúng tuyến/ngày (ngày gõ dạng dd/mm/yyyy), hoặc danh sách tuyến chưa tải xong.', 'err'); return; }
  $('btnEbms').disabled = true; msg('Đang đăng nhập EBMS và so sánh (có thể mất 20-40 giây)...'); $('out').innerHTML = ''; $('stats').innerHTML = '';
  api({ action: 'ebms', routeId: s.id, label: s.code, date: isoDate() }, 180000).then(function (res) {
    if (!res.results) throw new Error('Server chưa có action "ebms". Thêm dòng router vào Web.gs, dán Ebms.gs, rồi Deploy lại BẢN MỚI.');
    EB = res; MODE = 'ebms'; $('btnCopy').style.display = 'none';
    msg('✅ So sánh EBMS tuyến ' + s.code + ' — ngày ' + res.ngay + ' (PC: ' + res.pcCount + ' chuyến, EBMS: ' + res.ebmsCount + ' chuyến' +
        (res.gps ? ' · 🛰 ' + res.gps : '') + ')', 'ok');
    renderEbms();
  }).catch(function (e) { msg('❌ ' + e.message, 'err'); })
    .then(function () { $('btnEbms').disabled = false; });
};

function renderEbms() {
  const cnt = { ok: 0, warn: 0, plan: 0, nopc: 0, noebms: 0 };
  EB.results.forEach(function (r) { const c = catOf(r.loai); if (cnt[c] != null) cnt[c]++; });
  $('stats').innerHTML = [['Tổng dòng', EB.results.length, ''], ['Khớp', cnt.ok, 'e-ok'], ['Lệch giờ', cnt.warn + cnt.plan, 'e-warn'],
    ['Thiếu phân công', cnt.nopc, 'e-nopc'], ['Thiếu EBMS', cnt.noebms, 'e-noebms']]
    .map(x => '<div class="stat ' + x[2] + '"><b>' + x[1] + '</b>' + x[0] + '</div>').join('');

  const q = $('q').value.trim().toLowerCase(), only = $('onlyWarn').checked;
  let html = '';
  EB.results.forEach(function (r) {
    const c = catOf(r.loai);
    if (only && c === 'ok') return;
    const f = [r.loai, r.khDi, r.khDen, r.khXe, r.thXe, r.thDi, r.thDen, r.benDau, r.trangThaiEBMS, r.lichChayPC, r.xePC, r.benXuatPhatPC,
      r.gioDiPC, r.gioDenPC, r.chenhLechDi, r.chenhLechDen, r.gpsDi || '', r.gpsVe || '', r.pcGps || '', r.ebGps || '', r.soBen];
    if (q && (f.join(' ') + ' ' + r.ghi).toLowerCase().indexOf(q) === -1) return;
    html += '<tr class="e-' + c + '">' + f.map(v => '<td>' + esc(v) + '</td>').join('') + '<td class="notes">' + esc(r.ghi) + '</td></tr>';
  });
  const heads = ['Loại', 'KH Đi', 'KH Đến', 'KH Xe', 'TH Xe', 'TH Đi', 'TH Đến', 'Bến đầu', 'TT EBMS', 'Lịch chạy PC', 'Xe PC', 'Bến PC', 'Giờ đi PC', 'Giờ đến PC', 'Lệch Đi', 'Lệch Về',
    'GPS Đi', 'GPS Về', 'PC−GPS (đi/về)', 'EBMS−GPS (đi/về)', 'So bến', 'Ghi chú'];
  $('out').innerHTML = '<table><thead><tr>' + heads.map(x => '<th>' + x + '</th>').join('') + '</tr></thead><tbody>' +
    (html || '<tr><td colspan="' + heads.length + '">Không có dòng nào</td></tr>') + '</tbody></table>';
}

// ===== RENDER =====
function render() {
  const st = DATA.stats, nDx = DATA.missed.filter(isDx).length;
  $('stats').innerHTML = [['Tổng chuyến', st.total], ['Có cảnh báo', st.warn], ['Cặp trùng giờ', st.conflicts], ['Mất chuyến', st.missed - nDx]]
    .concat(nDx ? [['Đề xuất mất chuyến', nDx]] : [])
    .map(x => '<div class="stat' + (x[0] === 'Đề xuất mất chuyến' ? ' e-warn' : '') + '"><b>' + x[1] + '</b>' + x[0] + '</div>').join('');

  const q = $('q').value.trim().toLowerCase(), only = $('onlyWarn').checked;
  let band = false, prev = null, html = '';
  DATA.rows.forEach(function (r) {
    if (r.xe !== prev) { band = !band; prev = r.xe; }
    if (q && r.xe.toLowerCase().indexOf(q) === -1) return;
    if (only && !r.k.join('')) return;
    const cells = r.t.map((v, i) => '<td class="' + r.k[i] + '"' + (r.n[i] ? ' title="' + esc(r.n[i]) + '"' : '') + '>' + esc(v) + '</td>').join('');
    const ch = r.chenh == null ? '' : (r.chenh > 0 ? '+' : '') + r.chenh + ' phút';
    html += '<tr class="' + (band ? 'bandB' : '') + '"><td>' + esc(r.xe) + '</td><td>' + esc(r.lich) + '</td>' + cells +
      '<td class="' + (r.k[1] === 'green' ? 'green' : '') + '">' + ch + '</td></tr>';
  });
  let out = '<table><thead><tr><th>Xe</th><th>Lịch chạy</th><th>Giờ điều xe</th><th>Giờ đi</th><th>Giờ đến</th><th>Giờ về bến</th><th>Chênh lệch giờ đi</th></tr></thead><tbody>' +
    (html || '<tr><td colspan="7">Không có dòng nào</td></tr>') + '</tbody></table>';

  if (DATA.missed.length) {
    // Mất chuyến (xe KHÔNG chạy) và Đề xuất mất chuyến (xe CÓ chạy, chờ duyệt) là 2 loại khác nhau: tách màu + có giờ đi/đến thực tế
    const nDx2 = DATA.missed.filter(isDx).length;
    out += '<h3>⚠️ Mất chuyến (' + (DATA.missed.length - nDx2) + ')' + (nDx2 ? ' · Đề xuất mất chuyến (' + nDx2 + ')' : '') + '</h3>' +
      '<table><thead><tr><th>Loại</th><th>Mã chuyến</th><th>Lịch chạy</th><th>Bến</th><th>Xe</th><th>Đi → đến thực tế</th><th>Tài xế</th><th>Tiếp viên</th><th>Trạng thái</th></tr></thead><tbody>' +
      DATA.missed.slice().sort((a, b) => (isDx(a) - isDx(b)) || String(a.lichChay).localeCompare(String(b.lichChay))).map(m =>
        '<tr class="' + (isDx(m) ? 'gp-dx' : '') + '"><td>' + typePill(m) + '</td><td>' + esc(m.maChuyen) + '</td><td>' + esc(m.lichChay) + '</td><td>' + esc(m.benXuatPhat) + '</td><td>' + esc(m.xe) +
        '</td><td>' + (isDx(m) ? esc(hm5(m.gioDi) || '?') + ' → ' + esc(hm5(m.gioDen) || '?') : '—') + '</td><td>' + esc(m.taiXe) + '</td><td>' + esc(m.tiepVien) + '</td><td class="' + (isDx(m) ? '' : 'red') + '">' + esc(m.trangThai) + '</td></tr>').join('') +
      '</tbody></table>';
  }
  $('out').innerHTML = out;
}


// ===== TRÍCH XUẤT NHÂN VIÊN =====
(function () { const v = localStorage.getItem('nguoi_do'); if (v) $('nguoiDo').value = v; })();

$('btnNv').onclick = function () {
  const s = sel(); if (!s.id || !isoDate()) { msg('❌ Chưa nhập đúng tuyến/ngày (ngày gõ dạng dd/mm/yyyy), hoặc danh sách tuyến chưa tải xong.', 'err'); return; }
  const nd = $('nguoiDo').value.trim(); localStorage.setItem('nguoi_do', nd);
  $('btnNv').disabled = true; msg('Đang trích xuất nhân viên...'); $('out').innerHTML = ''; $('stats').innerHTML = '';
  api({ action: 'nv', routeId: s.id, label: s.code, date: isoDate(), nguoiDo: nd }).then(function (res) {
    if (!res.rows) throw new Error('Server chưa có action "nv". Thêm dòng router vào Web.gs, dán Nv.gs, rồi Deploy lại BẢN MỚI.');
    NV = res; NV.tuyen = s.code; MODE = 'nv'; $('btnCopy').style.display = '';
    msg('✅ Tuyến ' + s.code + ' — ' + res.ngay + ': ' + res.stats.total + ' nhân viên (từ ' + res.tripCount + ' chuyến, đã bỏ chuyến mất và trùng)', 'ok');
    renderNv();
  }).catch(function (e) { msg('❌ ' + e.message, 'err'); })
    .then(function () { $('btnNv').disabled = false; });
};

function nvVisible() {
  const q = $('q').value.trim().toLowerCase();
  return NV.rows.filter(r => !q || (r.ten + ' ' + r.chucVu).toLowerCase().indexOf(q) !== -1);
}

function renderNv() {
  const st = NV.stats;
  $('stats').innerHTML = [['Tổng nhân viên', st.total], ['Lái xe', st.drivers], ['Tiếp viên', st.attendants], ['Trùng tên khác SĐT', st.ambiguous]]
    .map(x => '<div class="stat"><b>' + x[1] + '</b>' + x[0] + '</div>').join('');
  const body = nvVisible().map(r => '<tr class="' + (r.isAmbiguous ? 'e-amb' : '') + '"><td>' + esc(r.ngay) + '</td><td>' + esc(r.tuyen) + '</td><td>' + esc(r.gioDi) +
    '</td><td>' + esc(r.gioXuatBen) + '</td><td>' + esc(r.thoiGianDo) + '</td><td class="left">' + esc(r.ten) + '</td><td>' + esc(r.chucVu) +
    '</td><td>' + (r.trangThai ? '✅' : '⬜') + '</td><td>' + (r.viPham ? '⚠️' : '⬜') + '</td><td>' + esc(r.nguoiDo) + '</td></tr>').join('');
  // nút mở file báo cáo đo nồng độ cồn của tuyến (đọc từ tab DS của file tổng, xem Con.gs)
  const con = (NV.con || []).map(x => '<a class="link-btn" href="' + esc(x.url) + '" target="_blank" rel="noopener">📝 Nhập đo cồn tuyến ' + esc(x.tuyen) + '</a>').join('') ||
    (NV.conAll ? '<span class="edit-hint">Chưa thấy file đo cồn của tuyến ' + esc(NV.tuyen || '') + ' trong tab DS.</span>' : '');
  const bar = con || NV.conAll ? '<div class="panel-bar"><div class="pb-left">' + con + '</div>' +
    (NV.conAll ? '<a class="link-btn soft" href="' + esc(NV.conAll) + '" target="_blank" rel="noopener">📊 File tổng đo cồn</a>' : '') + '</div>' : '';
  $('out').innerHTML = bar + '<table><thead><tr>' + ['Ngày', 'Tuyến', 'Giờ đi', 'Giờ xuất bến', 'Thời gian đo', 'Tên', 'Chức vụ', 'Trạng thái', 'Vi phạm', 'Người đo']
    .map(x => '<th>' + x + '</th>').join('') + '</tr></thead><tbody>' + (body || '<tr><td colspan="10">Không có nhân viên nào</td></tr>') + '</tbody></table>';
}

$('btnCopy').onclick = function () {
  if (MODE === 'bt' && BT) { copyText(btGrid().map(r => r.join('\t')).join('\n'), '📋 Đã copy bảng tài, qua Google Sheet bấm Ctrl+V'); return; }
  if (!NV) return;
  const clean = v => String(v == null ? '' : v).replace(/[\t\r\n]+/g, ' ');
  const text = nvVisible().map(r => [r.ngay, r.tuyen, r.gioDi, r.gioXuatBen, r.thoiGianDo, r.ten, r.chucVu,
    r.trangThai ? 'TRUE' : 'FALSE', r.viPham ? 'TRUE' : 'FALSE', r.nguoiDo].map(clean).join('\t')).join('\n');
  copyText(text, '📋 Đã copy ' + nvVisible().length + ' dòng, qua Google Sheet bấm Ctrl+V');
};
function copyText(text, okMsg) {
  const done = function () { msg(okMsg, 'ok'); };
  if (navigator.clipboard && window.isSecureContext) navigator.clipboard.writeText(text).then(done).catch(function (e) { msg('❌ Không copy được: ' + e.message, 'err'); });
  else { const ta = document.createElement('textarea'); ta.value = text; ta.style.position = 'fixed'; ta.style.opacity = '0'; document.body.appendChild(ta); ta.select(); try { document.execCommand('copy'); done(); } catch (e) { msg('❌ Không copy được', 'err'); } ta.remove(); }
}

// ===== KIỂM TRA LỆNH VẬN CHUYỂN (chỉ tuyến + ngày đang chọn) =====
$('btnLvc').onclick = function () {
  const s = sel(); if (!s.id || !isoDate()) { msg('❌ Chưa nhập đúng tuyến/ngày (ngày gõ dạng dd/mm/yyyy), hoặc danh sách tuyến chưa tải xong.', 'err'); return; }
  $('btnLvc').disabled = true; msg('Đang kiểm tra lệnh vận chuyển tuyến ' + s.code + ' (có thể mất 20-40 giây)...'); $('out').innerHTML = ''; $('stats').innerHTML = '';
  api({ action: 'lvc', routeId: s.id, label: s.code, date: isoDate() }, 180000).then(function (res) {
    if (!res.rows) throw new Error('Server chưa có action "lvc". Thêm dòng router vào Web.gs, dán Lvc.gs, rồi Deploy lại BẢN MỚI.');
    LV = res; MODE = 'lvc'; $('btnCopy').style.display = 'none';
    if (res.rows.length) msg('✅ Lệnh tuyến ' + s.code + ' — ngày ' + res.ngay + ' (' + res.rows.length + ' lệnh)', 'ok');
    else msg('⚠️ Tuyến ' + s.code + ' — ngày ' + res.ngay + ' không có lệnh vận chuyển nào', 'err');
    renderLvc();
  }).catch(function (e) { msg('❌ ' + e.message, 'err'); })
    .then(function () { $('btnLvc').disabled = false; });
};

function renderLvc() {
  const c = { ok: 0, warn: 0, bad: 0 };
  LV.rows.forEach(function (r) { c[r.level]++; });
  $('stats').innerHTML = [['Tổng lệnh', LV.rows.length, ''], ['Đạt', c.ok, 'e-ok'], ['Cảnh báo', c.warn, 'e-warn'], ['Lỗi', c.bad, 'e-nopc']]
    .map(x => '<div class="stat ' + x[2] + '"><b>' + x[1] + '</b>' + x[0] + '</div>').join('');

  const q = $('q').value.trim().toLowerCase(), only = $('onlyWarn').checked;
  const tag = { ok: '✅ ĐẠT', warn: '🟠 CẢNH BÁO', bad: '🔴 LỖI' }, cls = { ok: 'e-ok', warn: 'e-warn', bad: 'e-nopc' };
  let html = '';
  LV.rows.forEach(function (r) {
    if (only && r.level === 'ok') return;
    if (q && [r.xe, r.code, r.lai, r.loi.join(' '), r.cb.join(' ')].join(' ').toLowerCase().indexOf(q) === -1) return;
    const notes = r.loi.map(x => '<div>❌ ' + esc(x) + '</div>').concat(r.cb.map(x => '<div>⚠️ ' + esc(x) + '</div>')).join('');
    html += '<tr class="' + cls[r.level] + '"><td>' + esc(r.xe) + '</td><td>' + esc(r.code) + '</td><td class="left">' + esc(r.lai) +
      '</td><td>' + (r.soChuyen == null ? '' : r.soChuyen) + '</td><td>' + tag[r.level] + '</td><td class="notes">' + notes + '</td></tr>';
  });
  $('out').innerHTML = '<table><thead><tr>' + ['Biển số', 'Mã lệnh', 'Lái xe', 'Số chuyến', 'Kết quả', 'Chi tiết'].map(x => '<th>' + x + '</th>').join('') +
    '</tr></thead><tbody>' + (html || '<tr><td colspan="6">Không có dòng nào</td></tr>') + '</tbody></table>';
}

// ===== TÍNH NĂNG ẨN: SỬA LỆNH =====
// Mở khoá: bấm 5 lần liên tiếp vào biểu tượng 🚌 ở đầu trang, nhập EDIT_KEY. Mã được server kiểm tra (không chỉ ẩn nút).
function getEkey() { try { return localStorage.getItem('edit_key') || ''; } catch (e) { return ''; } }
function setUnlocked(on) {
  $('editGroup').hidden = !on; $('btnLock').hidden = !on; // cả nhóm Sửa lệnh (ô biển số, khoảng giờ, 4 nút) ẩn/hiện cùng lúc
  if (!on) hideUndo();
  if (!on && (MODE === 'edit' || MODE === 'auto' || MODE === 'veben' || MODE === 'undo')) { MODE = 'trips'; ED = null; AU = null; VB = null; UD = null; $('out').innerHTML = ''; $('stats').innerHTML = ''; }
}
function tryUnlock(ekey, silent) {
  return api({ action: 'editauth', ekey: ekey }, 30000, 1).then(function () {
    localStorage.setItem('edit_key', ekey); setUnlocked(true);
    if (!silent) msg('🔓 Đã mở khoá tính năng sửa lệnh', 'ok');
  }).catch(function (e) {
    if (silent) { if (!e.net && !e.login) { localStorage.removeItem('edit_key'); setUnlocked(false); } return; } // chưa đăng nhập thì giữ mã
    msg('❌ ' + e.message, 'err');
  });
}
(function () {
  let n = 0, timer = null;
  $('brandMark').onclick = function () {
    n++; clearTimeout(timer); timer = setTimeout(function () { n = 0; }, 3000);
    if (n < 5) return;
    n = 0;
    const input = prompt('Nhập mã mở khoá:');
    if (input && input.trim()) tryUnlock(input.trim(), false);
  };
  $('btnLock').onclick = function () { localStorage.removeItem('edit_key'); setUnlocked(false); msg('🔒 Đã khoá lại', 'ok'); };
  if (getEkey() && (getSid() || !USER_MODE)) setTimeout(function () { tryUnlock(getEkey(), true); }, 800); // mã cũ còn đúng thì tự mở lại
})();

$('btnEdit').onclick = function () {
  const s = sel(); const plate = $('plate').value.trim();
  if (!s.id || !isoDate()) { msg('❌ Chưa nhập đúng tuyến/ngày (ngày gõ dạng dd/mm/yyyy).', 'err'); return; }
  if (!plate) { msg('❌ Nhập biển số xe cần sửa.', 'err'); $('plate').focus(); return; }
  $('btnEdit').disabled = true; msg('Đang tải lệnh của xe ' + plate + '...'); $('out').innerHTML = ''; $('stats').innerHTML = '';
  loadEdit(s, plate).then(function () { msg('✅ Xe ' + ED.plate + ' — ' + ED.ngay + ': ' + ED.orders.length + ' lệnh. Sửa giờ rồi bấm Lưu.', 'ok'); })
    .catch(function (e) { msg('❌ ' + e.message, 'err'); })
    .then(function () { $('btnEdit').disabled = false; });
};
$('plate').onkeydown = function (e) { if (e.key === 'Enter') { e.preventDefault(); $('btnEdit').click(); } };

function loadEdit(s, plate) {
  return api({ action: 'editlist', ekey: getEkey(), routeId: s.id, label: s.code, date: isoDate(), plate: plate }, 180000).then(function (res) {
    if (!res.orders) throw new Error('Server chưa có action "editlist". Dán Edit.gs, thêm router vào Web.gs, rồi Deploy lại BẢN MỚI.');
    ED = res; ED.sel = s; ED.iso = isoDate(); MODE = 'edit'; $('btnCopy').style.display = 'none';
    renderEdit();
  });
}

function renderEdit() {
  let nTrips = 0; ED.orders.forEach(function (o) { nTrips += o.trips.length; });
  $('stats').innerHTML = [['Biển số', ED.plate], ['Lệnh', ED.orders.length], ['Chuyến', nTrips]]
    .map(x => '<div class="stat"><b>' + esc(x[1]) + '</b>' + x[0] + '</div>').join('');
  // (nút "Điền Giờ về bến = Giờ đến" đã bỏ: theo luật mới, bình thường về bến = đến + 1 phút -> dùng "⚡ Tự chỉnh theo luật")
  let out = '<div class="edit-bar">' +
    '<button class="edit-btn big" data-act="saveAll" id="btnSaveAll">💾 Lưu tất cả thay đổi</button>' +
    '<span class="edit-hint">Ô đã đổi tô vàng. Chỉ tính các chuyến đang hiện (trong khoảng giờ). Lưu 1 lượt cho cả loạt, có xác nhận trước, lưu xong vẫn ↩️ Hoàn tác được.</span></div>';
  ED.orders.forEach(function (o) {
    out += '<div class="ord-h">Lệnh ' + esc(o.lenh) + '<small>' + esc(o.code) + '</small></div>';
    if (o.canhBao.length) out += '<div class="ord-warn">⚠️ Danh sách chuyến bất thường: ' + esc(o.canhBao.join('; ')) + ' — kiểm tra kỹ mã chuyến trước khi sửa.</div>';
    out += '<table><thead><tr>' + ['STT', 'Mã chuyến', 'Lịch tài', 'Giờ điều xe', 'Sửa điều xe', 'Giờ đi', 'Giờ đến', 'Giờ về bến', 'Sửa về bến']
      .map(x => '<th>' + x + '</th>').join('') + '</tr></thead><tbody>';
    o.trips.forEach(function (t) {
      const sm = String(t.tai || '').match(/^(\d{1,2}):(\d{2})/);
      const st = sm ? (+sm[1] * 60 + +sm[2]) : '';
      const ended = !!(t.den && t.veben);
      const base = ' data-oid="' + esc(o.id) + '" data-tid="' + esc(t.id) + '"';
      out += '<tr data-start="' + st + '" data-den="' + esc(hm5(t.den)) + '"><td>' + t.stt + '</td><td>' + esc(t.code) + '</td><td>' + esc(t.tai) + '</td><td>' + esc(hm5(t.dieuxe)) + '</td>' +
        (ended
          ? '<td class="edcell"><input class="edit-in" value="' + esc(hm5(t.dieuxe)) + '" maxlength="5" data-f="dieuxe" data-orig="' + esc(hm5(t.dieuxe)) + '"' + base + '><button class="edit-btn" data-save="dieuxe"' + base + '>Lưu</button></td>'
          : '<td class="ed-off">chưa kết thúc</td>') +
        '<td>' + esc(hm5(t.di)) + '</td><td>' + esc(hm5(t.den)) + '</td><td>' + esc(hm5(t.veben)) + '</td>' +
        (t.den
          ? '<td class="edcell"><input class="edit-in" value="' + esc(hm5(t.veben)) + '" maxlength="5" data-f="veben" data-orig="' + esc(hm5(t.veben)) + '"' + base + '><button class="edit-btn" data-save="veben"' + base + '>Lưu</button></td>'
          : '<td class="ed-off">chưa có giờ đến</td>') + '</tr>';
    });
    out += '</tbody></table>';
  });
  $('out').innerHTML = out;
  applyRange();
}
// Gõ giờ: ô khác giá trị gốc tô vàng, nút "Lưu tất cả" hiện số thay đổi
$('out').addEventListener('input', function (ev) {
  const inp = ev.target;
  if (MODE !== 'edit' || !inp.classList || !inp.classList.contains('edit-in')) return;
  inp.classList.toggle('changed', (inp.value || '').trim() !== inp.dataset.orig);
  editCount();
});
function editCount() {
  const b = $('btnSaveAll'); if (!b) return;
  const n = collectChanges().length;
  b.textContent = n ? '💾 Lưu ' + n + ' thay đổi' : '💾 Lưu tất cả thay đổi';
}

// --- Lọc theo khoảng giờ lịch chạy (chỉ ẩn/hiện dòng, không mất giờ đang gõ) ---
function parseHM(s) {
  const m = String(s || '').trim().match(/^(\d{1,2}):(\d{1,2})$/);
  return m && +m[1] < 24 && +m[2] < 60 ? +m[1] * 60 + +m[2] : null;
}
function applyRange() {
  if (MODE !== 'edit') return;
  const from = parseHM($('tFrom').value), to = parseHM($('tTo').value);
  const has = from !== null || to !== null;
  $('out').querySelectorAll('tr[data-start]').forEach(function (tr) {
    let show = true;
    if (has) {
      const s = tr.dataset.start === '' ? null : +tr.dataset.start;
      if (s === null) show = false;
      else if (from !== null && to !== null) show = from <= to ? (s >= from && s <= to) : (s >= from || s <= to); // qua nửa đêm
      else if (from !== null) show = s >= from;
      else show = s <= to;
    }
    tr.hidden = !show;
  });
}
$('tFrom').oninput = $('tTo').oninput = function () { applyRange(); editCount(); };

// --- Lưu hàng loạt (có xác nhận) ---
function collectChanges() {
  const list = [];
  $('out').querySelectorAll('input.edit-in').forEach(function (inp) {
    const tr = inp.closest('tr');
    if (tr && tr.hidden) return;
    const v = (inp.value || '').trim();
    if (v === inp.dataset.orig) return;
    list.push({ field: inp.dataset.f, oid: inp.dataset.oid, tid: inp.dataset.tid, hhmm: v, input: inp });
  });
  return list;
}
function findTrip(oid, tid) {
  const order = ED.orders.find(o => String(o.id) === String(oid));
  return { order: order, trip: order && order.trips.find(t => String(t.id) === String(tid)) };
}
// LƯU TẤT CẢ: gửi cả loạt trong 1 lượt (editmany, POST vì dữ liệu dài). Máy chủ đọc lại 1 lần, kiểm từng ô y như lưu 1 ô,
// 1 PUT mỗi lệnh, đọc lại kiểm, nhớ hoàn tác. Trước đây mỗi ô 1 lượt + tải lại bảng xe giữa 2 ô cùng chuyến.
function runBatch(ch) {
  const btns = $('out').querySelectorAll('button'); btns.forEach(x => x.disabled = true);
  msg('Đang lưu ' + ch.length + ' thay đổi lên FUTA (1 lượt: đọc lại → kiểm → lưu → đọc lại kiểm)...');
  const changes = ch.map(function (c) {
    const f = findTrip(c.oid, c.tid);
    return { orderId: c.oid, tripId: c.tid, field: c.field, hhmm: c.hhmm, snap: f.trip ? f.trip.snap : '', stt: f.trip ? f.trip.stt : '' };
  });
  return apiPost({ action: 'editmany', ekey: getEkey(), routeId: ED.sel.id, label: ED.sel.code, date: ED.iso, plate: ED.plate, changes: JSON.stringify(changes) }, 300000)
    .then(function (r) {
      if (!r.results) throw new Error('Server chưa có action "editmany". Dán edit.gs + web.gs mới, rồi Deploy lại BẢN MỚI.');
      const okN = [], bad = [];
      r.results.forEach(function (x, i) {
        const c = ch[i], f = findTrip(c.oid, c.tid), name = c.field === 'dieuxe' ? 'Giờ điều xe' : 'Giờ về bến';
        const tag = f.trip ? 'Lệnh ' + f.order.lenh + ' · chuyến ' + f.trip.stt + ' · ' + name : name;
        (x && x.ok ? okN : bad).push(tag + ': ' + (x ? x.message : 'không có kết quả'));
      });
      const text = (bad.length ? '⚠️ ' : '✅ ') + 'Đã xử lý ' + ch.length + ' thay đổi: ' + okN.length + ' thành công, ' + bad.length + ' lỗi' +
        (bad.length ? '\n' + bad.join('\n') : '');
      return loadEdit(ED.sel, ED.plate).then(function () {
        msg(text, bad.length ? 'err' : 'ok');
        showUndo(r.undoId, 'Đã lưu xe ' + ED.plate + '. Lỡ tay?');
      });
    })
    .catch(function (e) { msg('❌ ' + e.message, 'err'); btns.forEach(x => x.disabled = false); });
}

$('out').addEventListener('click', function (ev) {
  const a = ev.target.closest && ev.target.closest('button[data-act]');
  if (!a || MODE !== 'edit' || !ED) return;
  if (a.dataset.act === 'saveAll') {
    const ch = collectChanges();
    if (!ch.length) { msg('Chưa có thay đổi nào để lưu (trong khoảng giờ đang hiện).', 'err'); return; }
    for (let k = 0; k < ch.length; k++) {
      if (parseHM(ch[k].hhmm) === null) { msg('❌ Giờ phải dạng HH:mm (vd 22:36)', 'err'); ch[k].input.focus(); return; }
    }
    const lines = ch.map(function (c) {
      const f = findTrip(c.oid, c.tid);
      const name = c.field === 'dieuxe' ? 'Giờ điều xe' : 'Giờ về bến';
      return '• Lệnh ' + f.order.lenh + ' · chuyến ' + f.trip.stt + ' (' + f.trip.code + ') · ' + name + ': ' + c.input.dataset.orig + ' → ' + c.hhmm;
    });
    const range = ($('tFrom').value.trim() || $('tTo').value.trim()) ? '\nKhoảng giờ lịch chạy: ' + ($('tFrom').value.trim() || '…') + ' – ' + ($('tTo').value.trim() || '…') : '';
    if (!confirm('Xe ' + ED.plate + ' · ' + ED.ngay + range + '\nSẽ lưu ' + ch.length + ' thay đổi lên hệ thống FUTA:\n\n' + clip(lines, 40).join('\n') +
                 '\n\nXác nhận lưu? (lưu xong vẫn hoàn tác được)')) return;
    runBatch(ch);
  }
});

$('out').addEventListener('click', function (ev) {
  const b = ev.target.closest && ev.target.closest('button[data-save]');
  if (!b || MODE !== 'edit' || !ED) return;
  const field = b.dataset.save, oid = b.dataset.oid, tid = b.dataset.tid;
  const input = b.parentNode.querySelector('input[data-f="' + field + '"]');
  const hhmm = (input.value || '').trim();
  const order = ED.orders.find(o => String(o.id) === oid);
  const trip = order && order.trips.find(t => String(t.id) === tid);
  if (!trip) return;
  const name = field === 'dieuxe' ? 'Giờ điều xe' : 'Giờ về bến';
  const curV = field === 'dieuxe' ? trip.dieuxe : trip.veben;
  if (!/^\d{1,2}:\d{1,2}$/.test(hhmm)) { msg('❌ Giờ phải dạng HH:mm (vd 22:36)', 'err'); input.focus(); return; }
  if (!confirm('Xe ' + ED.plate + ' · lệnh ' + order.lenh + ' · chuyến ' + trip.stt + ' (' + trip.code + ')\n' + name + ': ' + hm5(curV) + '  →  ' + hhmm + '\n\nLưu lên hệ thống FUTA?')) return;

  const btns = $('out').querySelectorAll('button'); btns.forEach(x => x.disabled = true);
  msg('Đang lưu...');
  api({ action: 'edit', ekey: getEkey(), routeId: ED.sel.id, label: ED.sel.code, plate: ED.plate, stt: trip.stt, date: ED.iso, orderId: oid, tripId: tid, field: field, hhmm: hhmm, snap: trip.snap }, 120000, 0)
    .then(function (r) {
      const cls = r.same || r.ok ? 'ok' : 'err';
      msg(r.message + (r.warn ? '\n⚠️ ' + r.warn : ''), cls);
      return loadEdit(ED.sel, ED.plate).then(function () { // nạp lại bảng, giữ thông báo
        msg(r.message + (r.warn ? '\n⚠️ ' + r.warn : ''), cls);
        showUndo(r.undoId, 'Đã lưu ' + name + ' chuyến ' + trip.stt + '. Lỡ tay?');
      });
    })
    .catch(function (e) { msg('❌ ' + e.message, 'err'); btns.forEach(x => x.disabled = false); });
});

// ===== CHUYỂN NGÀY TRƯỚC / SAU =====
function shiftDay(n) {
  const v = isoDate(); if (!v) return;
  const p = v.split('-').map(Number), d = new Date(Date.UTC(p[0], p[1] - 1, p[2] + n));
  $('date').value = String(d.getUTCDate()).padStart(2, '0') + '/' + String(d.getUTCMonth() + 1).padStart(2, '0') + '/' + d.getUTCFullYear();
}
$('btnPrev').onclick = function () { shiftDay(-1); };
$('btnNext').onclick = function () { shiftDay(1); };

// ===== CHÚ THÍCH MÀU: chỉ hiện ở màn Bảng xe =====
(function () {
  const lg = document.querySelector('.legend');
  const sync = function () {
    lg.style.display = (MODE === 'trips' && $('out').children.length) ? '' : 'none';
    document.body.dataset.mode = MODE; // CSS ẩn/hiện ô "Chỉ hiện dòng cảnh báo" theo màn đang xem
    $('q').placeholder = { gps: 'Lọc theo tuyến, xe, lịch, bến, tài xế...', undo: 'Lọc theo người lưu, tuyến, xe...', nv: 'Lọc theo tên, chức vụ...',
      auto: 'Lọc theo xe, mã chuyến, lịch...', bt: 'Tìm biển số xe...' }[MODE] || 'Lọc theo xe, tên, bến...';
  };
  new MutationObserver(sync).observe($('out'), { childList: true });
  sync();
})();

// (Khung tiêu chí kiểm tra lệnh: ẩn/hiện ở listener chung "NÚT TÁC VỤ" bên dưới)

// ===== TỰ CHỈNH THEO LUẬT (gọi autoplan / autosave trong edit.gs) =====
// Hiện cùng nút "✏️ Sửa lệnh" sau khi mở khoá. Ô "Biển số xe" trống = cả tuyến; có biển = chỉ xe đó.
// Luật: cặp chuyến (trước, sau), đến >= lịch - 1p = quay đầu: về bến = đến, điều xe = đi = đến + 1p;
// ngược lại: về bến = đến + 1p, điều xe = lịch - 1p, đi = lịch. Đầu ngày: điều xe = lịch - 1p, đi = lịch.
// Cuối ngày: về bến = đến + 1p. Về bến trống (chưa xác nhận) để nguyên. Giờ đến không bao giờ đổi.
let AU = null;

$('btnAuto').onclick = function () { autoPlan(''); };

function autoPlan(prefix) {
  const s = sel();
  if (!s.id || !isoDate()) { msg('❌ Chưa nhập đúng tuyến/ngày (ngày gõ dạng dd/mm/yyyy).', 'err'); return Promise.resolve(); }
  const plate = $('plate').value.trim().toUpperCase();
  $('btnAuto').disabled = true;
  msg((prefix ? prefix + '\n' : '') + 'Đang đọc lệnh ' + (plate ? 'xe ' + plate : 'cả tuyến ' + s.code) + ' và lập kế hoạch (chưa ghi gì)...');
  $('out').innerHTML = ''; $('stats').innerHTML = '';
  return api({ action: 'autoplan', ekey: getEkey(), routeId: s.id, label: s.code, date: isoDate(), plate: plate }, 180000).then(function (res) {
    if (!res.stats) throw new Error('Server chưa có action "autoplan". Dán edit.gs mới, thêm router vào web.gs, rồi Deploy lại BẢN MỚI.');
    AU = res; AU.sel = s; MODE = 'auto'; $('btnCopy').style.display = 'none';
    renderAuto();
    const st = res.stats;
    msg((prefix ? prefix + '\n' : '') + (st.sua ? '✅ ' : '✅ Không còn gì cần sửa. ') +
      (plate ? 'Xe ' + plate : 'Tuyến ' + s.code + ' (' + st.xe + ' xe)') + ' — ' + res.ngay + ': sẽ sửa ' + st.sua + ' chuyến, đã đúng ' + st.dung +
      (st.canXem ? ', CẦN XEM ' + st.canXem : '') + (st.loi ? ', LỖI ' + st.loi : '') + '. Chưa ghi gì lên hệ thống.',
      st.canXem || st.loi ? 'err' : 'ok');
  }).catch(function (e) { msg((prefix ? prefix + '\n' : '') + '❌ ' + e.message, 'err'); })
    .then(function () { $('btnAuto').disabled = false; });
}

function renderAuto() {
  const st = AU.stats;
  $('stats').innerHTML = [['Xe', st.xe, ''], ['Sẽ sửa', st.sua, 'e-warn'], ['Đã đúng', st.dung, 'e-ok'],
    ['Cần xem / lỗi', st.canXem + st.loi, 'e-nopc']]
    .map(function (x) { return '<div class="stat ' + x[2] + '"><b>' + x[1] + '</b>' + x[0] + '</div>'; }).join('');

  const q = $('q').value.trim().toLowerCase();
  const hit = function (r) { return !q || (r.plate + ' ' + r.code + ' ' + r.sched).toLowerCase().indexOf(q) !== -1; };
  const cell = function (r, label) {
    const d = r.diff.filter(function (x) { return x.label === label; })[0];
    return d ? '<td class="green">' + esc(d.from) + ' → ' + esc(d.to) + '</td>' : '<td></td>';
  };

  let out = '';
  if (AU.errors.length || AU.problems.length) {
    out += '<h3>⚠️ Cần xem / lỗi (không tự sửa)</h3><div class="ord-warn">' +
      AU.errors.map(function (e) { return '<div>❌ ' + esc(e) + '</div>'; }).join('') +
      AU.problems.map(function (r) { return '<div>⚠️ ' + esc(r.plate + ' lệnh ' + r.lenh + ' chuyến ' + r.stt + ' (' + r.code + '): ' + r.reason) + '</div>'; }).join('') +
      '</div>';
  }
  if (AU.warns.length) out += '<div class="ord-warn">' + AU.warns.map(function (w) { return '<div>⚠️ ' + esc(w) + '</div>'; }).join('') + '</div>';
  if (AU.done) {
    out += '<div class="panel-note ok">✅ Đã lưu các chuyến dưới đây lên FUTA và đọc lại kiểm khớp' + (AU.undoId ? ' — lỡ tay thì bấm ↩️ Hoàn tác ở trên.' : '.') + '</div>';
  } else if (AU.planId) {
    out += '<div class="edit-bar"><button class="edit-btn big" data-auto="save">💾 Lưu ' + st.sua + ' chuyến theo luật</button>' +
      '<span class="edit-hint">Lưu xong tự đọc lại để kiểm. Dòng nào vừa bị đổi kể từ lúc xem sẽ KHÔNG lưu. Kế hoạch giữ 15 phút. Lưu xong vẫn ↩️ Hoàn tác được.</span></div>';
  }
  let body = '', band = false, prev = null;
  AU.changes.forEach(function (r) {
    if (!hit(r)) return;
    if (r.plate !== prev) { band = !band; prev = r.plate; }
    body += '<tr class="' + (band ? 'bandB' : '') + '"><td>' + esc(r.plate) + '</td><td>' + esc(r.lenh) + '</td><td>' + r.stt + '</td><td>' + esc(r.code) +
      '</td><td>' + esc(r.sched) + '</td><td class="left">' + esc(r.mode) + '</td>' +
      cell(r, 'Giờ điều xe') + cell(r, 'Giờ đi') + cell(r, 'Giờ về bến') +
      '<td class="notes">' + esc([r.note, r.warn && '⚠️ ' + r.warn].filter(Boolean).join(' | ')) + '</td></tr>';
  });
  out += '<table><thead><tr>' + ['Xe', 'Lệnh', 'STT', 'Mã chuyến', 'Lịch', 'Chế độ', 'Giờ điều xe', 'Giờ đi', 'Giờ về bến', 'Ghi chú']
    .map(function (x) { return '<th>' + x + '</th>'; }).join('') + '</tr></thead><tbody>' +
    (body || '<tr><td colspan="10">Không có chuyến nào cần sửa</td></tr>') + '</tbody></table>';
  $('out').innerHTML = out;
}

$('out').addEventListener('click', function (ev) {
  const b = ev.target.closest && ev.target.closest('button[data-auto="save"]');
  if (!b || MODE !== 'auto' || !AU || !AU.planId) return;
  const who = AU.plate ? 'xe ' + AU.plate : 'cả tuyến ' + AU.sel.code + ' (' + AU.stats.xe + ' xe)';
  if (!confirm('Lưu ' + AU.stats.sua + ' chuyến của ' + who + ' · ' + AU.ngay + ' lên hệ thống FUTA theo luật?\n\n' +
               'Giờ đến không bị đổi. Dòng nào vừa bị đổi kể từ lúc xem sẽ bỏ qua.')) return;
  $('out').querySelectorAll('button').forEach(function (x) { x.disabled = true; });
  $('btnAuto').disabled = true;
  msg('Đang lưu ' + AU.stats.sua + ' chuyến (có thể mất 1-3 phút, đừng đóng trang)...');
  const au = AU;
  api({ action: 'autosave', ekey: getEkey(), planId: au.planId, label: au.sel.code, date: String(au.ngay || '').split('/').reverse().join('-') }, 360000, 0).then(function (r) {
    const bad = r.verifyBad.concat(r.failed, r.skipped);
    const line = (bad.length || r.stopped ? '⚠️ ' : '✔ ') + 'Đã lưu + kiểm khớp ' + r.saved + ' chuyến (' + r.elapsed + 's)' +
      (r.verifyBad.length ? ', VERIFY LỆCH ' + r.verifyBad.length : '') + (r.failed.length ? ', lỗi lưu ' + r.failed.length : '') +
      (r.skipped.length ? ', bỏ qua ' + r.skipped.length : '') + (r.stopped ? ', chưa kịp lưu ' + r.stopped + ' (hết giờ, bấm lại)' : '') +
      (bad.length ? '\n' + bad.join('\n') : '');
    showUndo(r.undoId, 'Đã lưu ' + r.saved + ' chuyến theo luật. Lỡ tay?');
    // Lưu khớp hết + không còn gì cần sửa: hiện luôn danh sách vừa lưu, KHỎI đọc lại cả tuyến lần nữa (đỡ tải FUTA / Apps Script)
    if (!bad.length && !r.stopped && r.left === 0) {
      au.done = true; au.planId = ''; au.undoId = r.undoId; $('btnAuto').disabled = false;
      if (MODE === 'auto' && AU === au) renderAuto();
      msg(line + '. Không còn chuyến nào cần sửa.', 'ok');
      return;
    }
    return autoPlan(line); // còn lỗi / còn chuyến cần sửa: lập lại kế hoạch để xem
  }).catch(function (e) { msg('❌ ' + e.message, 'err'); $('btnAuto').disabled = false; });
});

// ===== TỰ XÁC NHẬN XE VỀ BẾN (gọi veben trong veben.gs) =====
// Bật = quét + xác nhận ngay 1 lần, rồi máy chủ Google tự quét mỗi 1h30 (không cần mở web), hết ca thì tự tắt.
// Chỉ bấm chuyến đã Kết thúc + tiếp viên đã bấm giờ đến + chưa có giờ về bến. Xe đang chạy không bao giờ bị bấm.
let VB = null;

$('btnVeben').onclick = function () { vebenCall({}); };
RP.veben = { set: () => VB.pick, change: function () { if (MODE === 'veben' && VB) renderVeben(); } }; // ô chọn tuyến dùng chung (rpHtml)

function vebenCall(extra) {
  $('btnVeben').disabled = true;
  msg(extra.set === 'on' ? 'Đang bật và quét xác nhận về bến lần đầu (có thể mất ~30 giây)...' : 'Đang đọc trạng thái tự xác nhận về bến...');
  return api(Object.assign({ action: 'veben', ekey: getEkey() }, extra), 180000, extra.set ? 0 : 1).then(function (res) {
    if (!res.log) throw new Error('Server chưa có action "veben". Dán veben.gs + web.gs mới, rồi Deploy lại BẢN MỚI.');
    VB = Object.assign(res, { pick: VB && VB.pick && extra.set !== 'on' ? VB.pick : null }); MODE = 'veben'; $('btnCopy').style.display = 'none';
    renderVeben();
    msg(res.on ? '🟢 Đang BẬT tự xác nhận về bến: tuyến ' + res.tuyen.join(', ') + (res.sau ? ' — lượt quét sau lúc ' + res.sau : '') + (res.lich ? '' : ' — ⚠️ CHƯA CÀI LỊCH: chạy veben_cai_dat() trong Apps Script')
               : '⚪ Đang TẮT tự xác nhận về bến', res.on && res.lich ? 'ok' : (res.on ? 'err' : ''));
  }).catch(function (e) { msg('❌ ' + e.message, 'err'); })
    .then(function () { $('btnVeben').disabled = false; });
}

function renderVeben() {
  const ok = VB.log.filter(function (x) { return x.kq === 'OK'; }).length;
  $('stats').innerHTML = [['Trạng thái', VB.on ? 'BẬT' : 'TẮT', VB.on ? 'e-ok' : ''], ['Tuyến', VB.tuyen.join(', ') || '—', ''],
    ['Đã bấm (gần nhất)', ok, 'e-ok'], ['Lỗi', VB.log.length - ok, 'e-nopc']]
    .map(function (x) { return '<div class="stat ' + x[2] + '"><b>' + esc(String(x[1])) + '</b>' + x[0] + '</div>'; }).join('');
  // Ô tick: tuyến cụm (FB_ROUTES) + tuyến đã chọn + tuyến đang mở ở ô Tuyến. Tuyến khác gõ thêm ở ô bên dưới.
  if (!VB.pick) VB.pick = new Set(VB.tuyen.length ? VB.tuyen : (sel().code ? [sel().code] : []));
  let out = '<div class="gp-top">' + rpHtml('veben', VB.pick, VB.tuyen.concat(sel().code ? [sel().code] : []), '🅿️ Chọn tuyến được tự xác nhận về bến (chỉ tuyến được tick, tuyến khác không bấm)') + '</div>' +
    '<div class="edit-bar">' +
    '<button class="edit-btn big" data-vb="on">🟢 ' + (VB.on ? 'Lưu tuyến đã chọn' : 'Bật cho tuyến đã chọn') + '</button> ' +
    (VB.on ? '<button class="edit-btn" data-vb="off">⚪ Tắt</button> ' : '') +
    '<button class="edit-btn" data-vb="reload">🔄 Tải lại</button>' +
    '<span class="edit-hint">Bật = quét ngay 1 lần, sau đó máy chủ tự quét mỗi 1 giờ 30 phút (đóng web vẫn chạy), hết ca (không còn xe chạy) thì tự tắt, ca sau bật lại. Chỉ bấm chuyến ĐÃ KẾT THÚC + tiếp viên đã bấm giờ đến + chưa có giờ về bến. ' +
    'Xe đang chạy, chưa chạy, đề xuất mất chuyến: không bấm. Giờ về bến = lúc bấm, muốn chỉnh theo luật thì dùng ⚡ Tự chỉnh theo luật.</span></div>';
  if (VB.last) out += '<div class="ord-warn"><div>🕒 Lượt quét gần nhất ' + esc(VB.last.at) + ': ' + esc((VB.last.sum || []).join(' | ') || 'không có tuyến') +
    (VB.on && VB.sau ? ' — lượt sau lúc ' + esc(VB.sau) : '') + '</div></div>';
  let body = '';
  VB.log.forEach(function (x) {
    body += '<tr class="' + (x.kq === 'OK' ? '' : 'e-nopc') + '"><td>' + esc(x.at) + '</td><td>' + esc(x.tuyen) + '</td><td>' + esc(x.lich) + '</td><td>' + esc(x.xe) +
      '</td><td>' + esc(x.code) + '</td><td class="left">' + esc(x.chieu) + '</td><td>' + esc(x.di) + '</td><td>' + esc(x.den) + '</td><td>' + esc(x.ve || '') +
      '</td><td class="notes">' + esc(x.kq) + '</td></tr>';
  });
  out += '<table><thead><tr>' + ['Lúc bấm', 'Tuyến', 'Lịch', 'Xe', 'Mã chuyến', 'Chiều', 'Đi', 'Đến', 'Về bến', 'Kết quả']
    .map(function (x) { return '<th>' + x + '</th>'; }).join('') + '</tr></thead><tbody>' +
    (body || '<tr><td colspan="10">Chưa bấm chuyến nào</td></tr>') + '</tbody></table>';
  setOut(out); // giữ chữ đang gõ trong ô Thêm tuyến
}

$('out').addEventListener('click', function (ev) {
  const b = ev.target.closest && ev.target.closest('button[data-vb]');
  if (!b || MODE !== 'veben') return;
  const act = b.getAttribute('data-vb');
  if (act === 'reload') { VB.pick = null; vebenCall({}); return; }
  if (act === 'off') { if (confirm('Tắt tự xác nhận về bến?')) vebenCall({ set: 'off' }); return; }
  const tuyen = Array.from(VB.pick).join(', ');
  if (!tuyen) { msg('❌ Chưa tick tuyến nào', 'err'); return; }
  if (!confirm('Bật tự xác nhận về bến cho tuyến ' + tuyen + '?\n\nQuét ngay 1 lần, sau đó cứ 1 giờ 30 phút quét lại, hết ca thì tự tắt.\nChỉ bấm chuyến ĐÃ KẾT THÚC + tiếp viên đã bấm giờ đến.\n' +
               'Đã xác nhận thì không huỷ kết thúc chuyến được nữa.')) return;
  vebenCall({ set: 'on', tuyen: tuyen });
});

// ===== BẢNG TÀI GHÉP TUYẾN (gọi bangtai trong bangtai.gs) =====
// Chọn 2-3 tuyến + ngày ở trên -> ghép ngang thành 1 bảng: mỗi bến 2 cột GIỜ XB | BKS, 1 cột trống giữa các bến.
const BT_IDS = ['bt1', 'bt2', 'bt3'];
BT_IDS.forEach(function (id) {
  const v = localStorage.getItem('bt_' + id); if (v) $(id).value = v;
  $(id).onkeydown = function (e) { if (e.key === 'Enter') { e.preventDefault(); $('btnBt').click(); } };
});

$('btnBt').onclick = function () {
  if (!isoDate()) { msg('❌ Ngày gõ dạng dd/mm/yyyy.', 'err'); return; }
  if (!ROUTES.length) { msg('❌ Danh sách tuyến chưa tải xong.', 'err'); return; }
  const list = [], bad = [];
  BT_IDS.forEach(function (id, i) {
    const v = $(id).value.trim(); localStorage.setItem('bt_' + id, v);
    if (!v) return;
    const r = findRoute(v);
    if (!r) bad.push('Tuyến ' + (i + 1) + ' "' + v + '"');
    else if (!list.some(x => x.id === String(r.id))) list.push({ id: String(r.id), code: r.code });
  });
  if (bad.length) { msg('❌ Không nhận ra: ' + bad.join(', ') + '. Gõ số tuyến (vd 161) hoặc chọn từ danh sách.', 'err'); return; }
  if (!list.length) { msg('❌ Nhập ít nhất 1 tuyến (thường 2-3 tuyến).', 'err'); $('bt1').focus(); return; }
  const iso = isoDate();
  $('btnBt').disabled = true; $('lvcRules').hidden = true; $('btnXlsx').style.display = 'none';
  msg('Đang lấy lịch chạy ' + list.map(x => x.code).join(', ') + '...'); $('out').innerHTML = ''; $('stats').innerHTML = '';
  Promise.all(list.map(s => api({ action: 'bangtai', routeId: s.id, label: s.code, date: iso }, 180000))).then(function (res) {
    if (!res[0].ben) throw new Error('Server chưa có action "bangtai". Dán bangtai.gs, thêm dòng vào RO trong Web.gs, rồi Deploy lại BẢN MỚI.');
    BT = { ngay: res[0].ngay, iso: iso, routes: res }; MODE = 'bt';
    $('btnCopy').style.display = ''; $('btnXlsx').style.display = '';
    const empty = res.filter(r => !r.ben.length).map(r => r.tuyen);
    msg((empty.length ? '⚠️ Tuyến ' + empty.join(', ') + ' không có chuyến nào. ' : '✅ ') + 'Bảng tài ' + res.map(r => r.tuyen).join(' + ') + ' — ' + BT.ngay +
      '. Bấm "⬇️ Tải Excel" hoặc "📋 Copy".', empty.length ? 'err' : 'ok');
    renderBt();
  }).catch(function (e) { msg('❌ ' + e.message, 'err'); })
    .then(function () { $('btnBt').disabled = false; });
};

// Màu theo đầu xuất phát: xe chạy chuyến đầu ngày ở bến nào thì mang màu bến đó cả ngày (kể cả lúc chạy ở đầu kia)
const BT_COLORS = ['CFE2FF', 'FFDDB0', 'C8F0D4', 'F9D2E4', 'E3D7FB', 'FFF1A8'];
function btBlocks() { // mỗi bến của mỗi tuyến = 1 khối 2 cột, theo thứ tự Tuyến 1 -> 3
  const out = [];
  BT.routes.forEach(function (r) {
    const home = {}, first = {}, base = out.length;
    r.ben.forEach(function (b, bi) {
      b.rows.forEach(function (x) { if (x.xe && (first[x.xe] == null || x.gio < first[x.xe])) { first[x.xe] = x.gio; home[x.xe] = bi; } });
    });
    r.ben.forEach(function (b, bi) {
      out.push({
        tuyen: r.tuyen, ten: b.ten, mau: BT_COLORS[(base + bi) % BT_COLORS.length],
        nXe: Object.keys(home).filter(x => home[x] === bi).length,
        rows: b.rows.map(x => ({ gio: x.gio, xe: x.xe, mau: x.xe ? BT_COLORS[(base + home[x.xe]) % BT_COLORS.length] : '' }))
      });
    });
  });
  return out;
}

// Lưới 2 chiều dùng chung cho màn hình, copy và Excel. Dòng 0: "161 · Văn Thánh", dòng 1: GIỜ XB | BKS, sau đó là dữ liệu.
function btGrid() {
  const bl = btBlocks(), n = Math.max(0, ...bl.map(b => b.rows.length));
  const row = f => { const a = []; bl.forEach(function (b, i) { if (i) a.push(''); a.push.apply(a, f(b)); }); return a; };
  const g = [row(b => [b.tuyen + ' · ' + b.ten + ' (' + b.nXe + ' xe)', '']), row(() => ['GIỜ XB', 'BKS'])];
  for (let k = 0; k < n; k++) g.push(row(b => b.rows[k] ? [b.rows[k].gio, b.rows[k].xe] : ['', '']));
  return g;
}

function renderBt() {
  const bl = btBlocks();
  $('stats').innerHTML = BT.routes.map(r => '<div class="stat e-n"><b>' + r.ben.reduce((s, b) => s + b.rows.length, 0) + '</b>Chuyến tuyến ' + esc(r.tuyen) + '</div>').join('');
  const q = $('q').value.trim().toLowerCase().replace(/[\s.\-]/g, '');
  const gap = '<th class="bt-gap"></th>', gapd = '<td class="bt-gap"></td>';
  let head1 = '', head2 = '';
  bl.forEach(function (b, i) {
    head1 += (i ? gap : '') + '<th class="bt-ben" colspan="2" style="background:#' + b.mau + '">' + esc(b.tuyen + ' · ' + b.ten + ' (' + b.nXe + ' xe)') + '</th>';
    head2 += (i ? gap : '') + '<th>GIỜ XB</th><th>BKS</th>';
  });
  let body = '';
  btGrid().slice(2).forEach(function (r, k) {
    body += '<tr>' + r.map(function (v, j) {
      const c = j % 3; // 0 = giờ, 1 = BKS, 2 = cột trống
      if (c === 2) return gapd;
      const hit = c === 1 && q && v && v.toLowerCase().replace(/[\s.\-]/g, '').indexOf(q) !== -1;
      const x = c === 1 && bl[(j - 1) / 3].rows[k];
      return '<td class="' + (c === 0 ? 'bt-gio' : '') + (hit ? ' bt-hit' : '') + '"' + (x && x.mau ? ' style="background:#' + x.mau + '"' : '') + '>' + esc(v) + '</td>';
    }).join('') + '</tr>';
  });
  $('out').innerHTML = bl.length
    ? '<table class="bt"><thead><tr>' + head1 + '</tr><tr>' + head2 + '</tr></thead><tbody>' + body + '</tbody></table>'
    : '<table><tbody><tr><td>Không có chuyến nào</td></tr></tbody></table>';
}

// --- Tải Excel (ExcelJS chỉ nạp khi bấm lần đầu) ---
let _xl = null;
function loadExcelJS() {
  if (window.ExcelJS) return Promise.resolve(window.ExcelJS);
  if (_xl) return _xl;
  _xl = new Promise(function (resolve, reject) {
    const sc = document.createElement('script');
    sc.src = 'https://cdnjs.cloudflare.com/ajax/libs/exceljs/4.4.0/exceljs.min.js';
    sc.onload = function () { resolve(window.ExcelJS); };
    sc.onerror = function () { _xl = null; reject(new Error('Không tải được thư viện Excel, kiểm tra mạng rồi bấm lại')); };
    document.head.appendChild(sc);
  });
  return _xl;
}

$('btnXlsx').onclick = function () {
  if (MODE !== 'bt' || !BT) return;
  $('btnXlsx').disabled = true; msg('Đang tạo file Excel...');
  loadExcelJS().then(function (ExcelJS) {
    const g = btGrid(), bl = btBlocks(), nBlk = bl.length;
    const wb = new ExcelJS.Workbook(), ws = wb.addWorksheet('Bảng tài', { views: [{ state: 'frozen', ySplit: 2 }] });
    const font = { name: 'Times New Roman', size: 12 }, mid = { horizontal: 'center', vertical: 'middle' };
    const fill = argb => ({ type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF' + argb } });
    g.forEach(function (r, i) {
      const row = ws.getRow(i + 1);
      r.forEach(function (v, j) {
        const c = j % 3;
        if (c === 2) return;
        const cell = row.getCell(j + 1);
        if (i >= 2 && c === 0 && v) { // giờ lưu dạng thời gian thật để Excel tính/sắp được
          const p = v.split(':'); cell.value = (+p[0] * 60 + +p[1]) / 1440; cell.numFmt = 'h:mm';
        } else cell.value = v;
        cell.font = Object.assign({}, font, { bold: i < 2 || c === 0 });
        cell.alignment = mid;
        const b = bl[(j - c) / 3], x = i >= 2 && c === 1 && b.rows[i - 2];
        if (i === 0) cell.fill = fill(b.mau); // tiêu đề bến mang màu của xe xuất phát ở bến đó
        else if (x && x.mau) cell.fill = fill(x.mau);
      });
      row.height = i === 0 ? 30 : 18;
    });
    for (let k = 0; k < nBlk; k++) {
      ws.mergeCells(1, k * 3 + 1, 1, k * 3 + 2);
      ws.getCell(1, k * 3 + 1).alignment = Object.assign({ wrapText: true }, mid);
      ws.getColumn(k * 3 + 1).width = 9; ws.getColumn(k * 3 + 2).width = 13;
      if (k < nBlk - 1) ws.getColumn(k * 3 + 3).width = 3;
    }
    ws.pageSetup = { fitToPage: true, fitToWidth: 1, fitToHeight: 0, orientation: 'portrait', paperSize: 9 };
    return wb.xlsx.writeBuffer();
  }).then(function (buf) {
    const name = 'bang-tai_' + BT.routes.map(r => r.tuyen).join('-') + '_' + BT.ngay.replace(/\//g, '-') + '.xlsx';
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }));
    a.download = name; document.body.appendChild(a); a.click(); a.remove();
    setTimeout(function () { URL.revokeObjectURL(a.href); }, 5000);
    msg('⬇️ Đã tải ' + name, 'ok');
  }).catch(function (e) { msg('❌ ' + e.message, 'err'); })
    .then(function () { $('btnXlsx').disabled = false; });
};

// ===== Ô CHỌN NHIỀU TUYẾN (dùng chung: chụp GPS, tự xác nhận về bến) =====
// Ô tick cho tuyến cụm (FB_ROUTES) + tuyến đã chọn + tuyến đang mở; ô gõ thêm tuyến (nhiều tuyến cách nhau dấu phẩy).
// RP[tên] = { set: () => Set mã tuyến, change: () => vẽ lại } (khai báo ở đầu file).
const RP_SEEN = {}; // tuyến từng chọn trong lần mở web: bỏ tick vẫn giữ ô để tick lại (không biến mất)
function rpHtml(name, set, extra, title) {
  const seen = RP_SEEN[name] = RP_SEEN[name] || new Set();
  set.forEach(c => seen.add(c));
  const all = FAV_CODES.concat(extra || [], Array.from(seen));
  const codes = all.filter((c, i) => c && all.indexOf(c) === i);
  const chips = codes.map(function (c) {
    const r = ROUTES.find(x => x.code === c), on = set.has(c);
    return '<label class="rp-chip' + (on ? ' on' : '') + '" title="' + esc(r ? routeText(r) : c) + '"><input type="checkbox" data-rp="' + name + '" data-code="' + esc(c) + '"' +
      (on ? ' checked' : '') + '><b>' + esc(c) + '</b>' + (r && r.name ? '<span>' + esc(r.name.slice(0, 30)) + '</span>' : '') + '</label>';
  }).join('');
  return '<div class="rp"><div class="rp-head"><b>' + title + '</b><span class="rp-n">Đã chọn ' + set.size + ' tuyến</span><span class="rp-quick">' +
    (FAV_CODES.length ? '<button type="button" class="rp-mini" data-rp-act="fav" data-rp="' + name + '">Chọn cả cụm</button>' : '') +
    '<button type="button" class="rp-mini" data-rp-act="none" data-rp="' + name + '">Bỏ chọn hết</button></span></div>' +
    '<div class="rp-chips">' + (chips || '<i class="rp-empty">Chưa có tuyến nào, gõ mã tuyến ở ô bên dưới</i>') + '</div>' +
    '<div class="rp-add"><input type="text" data-route="multi" data-rp-input="' + name + '" placeholder="Bấm để chọn, hoặc gõ tuyến (vd: 30, 55)" autocomplete="off" spellcheck="false">' +
    '<button type="button" class="edit-btn" data-rp-act="add" data-rp="' + name + '">➕ Thêm</button></div></div>';
}
document.addEventListener('change', function (ev) {
  const el = ev.target;
  if (!el.matches || !el.matches('input[data-rp][data-code]') || !RP[el.dataset.rp]) return;
  const set = RP[el.dataset.rp].set();
  if (el.checked) set.add(el.dataset.code); else set.delete(el.dataset.code);
  RP[el.dataset.rp].change();
});
document.addEventListener('click', function (ev) {
  const b = ev.target.closest && ev.target.closest('[data-rp-act]');
  if (!b || !RP[b.dataset.rp]) return;
  const set = RP[b.dataset.rp].set(), act = b.dataset.rpAct;
  if (act === 'fav') FAV_CODES.forEach(c => set.add(c));
  else if (act === 'none') set.clear();
  else if (act === 'add') {
    const inp = document.querySelector('[data-rp-input="' + b.dataset.rp + '"]');
    const parts = String(inp ? inp.value : '').split(/[,;]+/).map(x => x.trim()).filter(Boolean), bad = [];
    if (!parts.length) { msg('❌ Gõ mã tuyến cần thêm (nhiều tuyến cách nhau dấu phẩy)', 'err'); return; }
    parts.forEach(function (v) {
      const r = findRoute(v);
      if (r) { set.add(r.code); return; }
      const words = v.split(/\s+/), rs = words.map(findRoute); // "30 55 152" gõ cách nhau dấu cách
      if (words.length > 1 && rs.every(Boolean)) rs.forEach(x => set.add(x.code)); else bad.push(v);
    });
    if (bad.length) msg('❌ Không thấy tuyến: ' + bad.join(', '), 'err');
    else if (inp) inp.value = ''; // thêm xong: ô trống lại, danh sách hiện lại để chọn tiếp
  }
  RP[b.dataset.rp].change();
});
document.addEventListener('keydown', function (ev) { // Enter trong ô thêm tuyến = bấm ➕ Thêm
  const el = ev.target;
  if (ev.key !== 'Enter' || !el.matches || !el.matches('input[data-rp-input]')) return;
  ev.preventDefault();
  const b = document.querySelector('[data-rp-act="add"][data-rp="' + el.dataset.rpInput + '"]');
  if (b) b.click();
});

// ===== CHỤP GPS MẤT CHUYẾN (gọi gps / gpsstatus trong gps.gs -> GitHub Actions) =====
// Chọn 1 hoặc NHIỀU tuyến (ô tick, nhớ lại lần sau) -> liệt kê chuyến mất của mọi tuyến đã chọn trong ngày, gom theo tuyến.
// 2 loại khác nhau: MẤT CHUYẾN (xe không chạy) tick sẵn; ĐỀ XUẤT MẤT CHUYẾN (xe có chạy, chờ duyệt) không tick sẵn.
// Bấm "Chụp": gửi GitHub 1 LẦN cho tất cả tuyến (đăng nhập GPS 1 lần), ảnh lên Drive, link ghi vào Google Sheet.
let GPS_RUN = null; // lần chụp GPS đang chạy ngầm (GitHub), xong báo ở dòng thông báo
const GPSR = new Set((function () { try { return JSON.parse(localStorage.getItem('gps_routes') || '[]'); } catch (e) { return []; } })());
RP.gps = { set: () => GPSR, change: function () { localStorage.setItem('gps_routes', JSON.stringify(Array.from(GPSR))); if (MODE === 'gps') renderGps(); } };
function gpsRoutes() { // tuyến đã chọn -> [{id, code}] (bỏ mã không còn trong danh sách tuyến)
  return Array.from(GPSR).map(c => ROUTES.find(r => r.code === c)).filter(Boolean).map(r => ({ id: String(r.id), code: r.code }));
}
const gpsCodes = list => list.map(r => r.code).join(', ');

$('btnGps').onclick = function () {
  if (GPS_RUN) { GP = GPS_RUN; MODE = 'gps'; $('btnCopy').style.display = 'none'; renderGps(); msg('🛰 Đang chụp GPS tuyến ' + GP.sent.codes + ', xem tiến độ bên dưới. Xong sẽ báo ở đây.', 'info'); return; }
  if (!isoDate()) { msg('❌ Ngày gõ dạng dd/mm/yyyy.', 'err'); return; }
  if (!ROUTES.length) { msg('❌ Danh sách tuyến chưa tải xong.', 'err'); return; }
  const s = sel();
  if (s.code && !GPSR.has(s.code)) { GPSR.add(s.code); RP.gps.change(); } // tuyến đang mở luôn được chọn thêm
  MODE = 'gps'; $('btnCopy').style.display = 'none';
  if (GP && GP.iso !== isoDate()) GP = null;
  if (!GPSR.size) { GP = null; renderGps(); msg('Tick chọn tuyến cần chụp GPS rồi bấm 🔎 Tìm chuyến mất.', 'info'); return; }
  gpsFind();
};

function gpsFind() {
  const list = gpsRoutes(), iso = isoDate();
  if (!iso) { msg('❌ Ngày gõ dạng dd/mm/yyyy.', 'err'); return; }
  if (!list.length) { msg('❌ Chưa chọn tuyến nào để chụp GPS.', 'err'); return; }
  MODE = 'gps'; $('btnCopy').style.display = 'none';
  if (!GP || GP.iso !== iso) { GP = null; $('stats').innerHTML = ''; }
  GPS_FINDING = true; renderGps();
  msg('Đang tìm chuyến mất chuyến ' + list.length + ' tuyến (' + gpsCodes(list) + ') ngày ' + $('date').value + '...');
  gToken(50).then(function (gtok) { // xin token Google ngay lúc bấm (đủ dài cho cả lần chụp sau)
    return apiPost({ action: 'gps', dry: '1', gtok: gtok, routes: JSON.stringify(list), routeId: list[0].id, label: list.map(r => r.code).join('+'), date: iso }, 180000);
  }).then(function (res) {
    if (!res.trips) throw new Error('Server chưa có action "gps". Dán gps.gs, thêm router vào Web.gs, rồi Deploy lại BẢN MỚI.');
    if (!res.routes) throw new Error('Máy chủ chưa có bản chụp GPS nhiều tuyến. Dán gps.gs + web.gs mới, rồi Deploy lại BẢN MỚI.');
    const old = GP && GP.iso === iso ? GP : null;
    GP = res; GP.iso = iso; GP.list = list; GP.run = null; GP.filter = old ? old.filter : 'all';
    GP.pick = new Set(res.trips.filter(t => t.chup && !t.daCo && !t.matGps && !t.dangChup && !isDx(t)).map(t => t.key)); // tick sẵn: mất chuyến chưa có ảnh
    const nDx = res.trips.filter(isDx).length;
    if (!res.trips.length) msg('✅ ' + list.length + ' tuyến (' + gpsCodes(list) + ') — ' + res.ngay + ' không có chuyến mất nào.', 'ok');
    else msg(res.ngay + ' · ' + list.length + ' tuyến: ' + (res.trips.length - nDx) + ' mất chuyến' + (nDx ? ', ' + nDx + ' đề xuất mất chuyến' : '') +
      '. Đã tick sẵn ' + GP.pick.size + ' chuyến mất chưa có ảnh, kiểm lại rồi bấm "🛰 Chụp".', 'ok');
  }).catch(function (e) { msg('❌ ' + e.message, 'err'); })
    .then(function () { GPS_FINDING = false; if (MODE === 'gps') renderGps(); });
}
let GPS_FINDING = false;

const MAT_CHUYEN_URL = 'https://docs.google.com/spreadsheets/d/1ysOVfyktQ5p-zlI0L2ZduG8uPneZkJZ3ZHoI7ZZ1KBg/edit?gid=1226700115#gid=1226700115'; // báo cáo mất chuyến
function gpsVisible(t) {
  const q = $('q').value.trim().toLowerCase();
  if (GP.filter === 'mat' && isDx(t)) return false;
  if (GP.filter === 'dexuat' && !isDx(t)) return false;
  return !q || [t.tuyen, t.xe, t.lich, t.ben, t.ma, t.taiXe, t.tiepVien].join(' ').toLowerCase().indexOf(q) !== -1;
}
function renderGps() {
  // 1) ô chọn tuyến + nút Tìm
  const searched = GP && GP.list ? GP.list.map(r => r.code).sort().join(',') : '';
  const changed = GP && searched !== Array.from(GPSR).sort().join(',');
  let out = '<div class="gp-top">' + rpHtml('gps', GPSR, sel().code ? [sel().code] : [], '🛰 Chọn tuyến cần chụp GPS — chụp nhiều tuyến 1 lần') +
    '<div class="rp-go"><button class="edit-btn big" data-gps="find"' + (GPSR.size ? '' : ' disabled') + '>' + (GPS_FINDING ? '⏳ Đang tìm...' : '🔎 Tìm chuyến mất ' + GPSR.size + ' tuyến') + '</button>' +
    '<span class="edit-hint">' + (changed ? '⚠️ Đã đổi tuyến, bấm Tìm để cập nhật danh sách bên dưới. ' : '') + 'Ngày ' + esc($('date').value) +
    '. <b class="t-mat">Mất chuyến</b> = xe không chạy (tick sẵn). <b class="t-dx">Đề xuất mất chuyến</b> = xe có chạy, chờ duyệt (tự tick nếu cần ảnh làm bằng chứng).</span></div></div>';
  if (!GP) { $('stats').innerHTML = ''; setOut(out); return; }

  // 2) số liệu
  const T = GP.trips, nDx = T.filter(isDx).length, daCo = T.filter(t => t.daCo).length;
  $('stats').innerHTML = [['Tuyến', GP.routes.length, 'e-n'], ['Mất chuyến', T.length - nDx, 'e-nopc'], ['Đề xuất mất chuyến', nDx, 'e-warn'],
    ['Đã có ảnh', daCo, 'e-ok'], ['Mất GPS', T.filter(t => t.matGps).length, 'e-noebms'], ['Đã chọn để chụp', GP.pick.size, 'e-n']]
    .map(x => '<div class="stat ' + x[2] + '"><b>' + x[1] + '</b>' + x[0] + '</div>').join('');

  // 3) thanh nút: link Sheet + lọc loại + nút Chụp
  const r = GP.run, sheet = GP.sheet || (r && r.sheet), other = GPS_RUN && GPS_RUN !== GP;
  const picked = T.filter(t => t.chup && GP.pick.has(t.key)), nR = new Set(picked.map(t => t.tuyen)).size;
  const canGo = (!r || r.status === 'completed') && !other && T.some(t => t.chup);
  const fb = (k, label, n) => '<button type="button" class="gp-f' + (GP.filter === k ? ' on' : '') + '" data-gpf="' + k + '">' + label + ' <b>' + n + '</b></button>';
  out += '<div class="panel-bar"><div class="pb-left">' +
    (sheet ? '<a class="link-btn soft" href="' + esc(sheet) + '" target="_blank" rel="noopener">📄 Sheet GPS' + (GP.rieng ? ' của bạn' : '') + '</a>' : '') +
    '<a class="link-btn soft" href="' + MAT_CHUYEN_URL + '" target="_blank" rel="noopener">📋 Báo cáo mất chuyến</a>' +
    '<span class="gp-fs">' + fb('all', 'Tất cả', T.length) + fb('mat', '🔴 Mất chuyến', T.length - nDx) + fb('dexuat', '🟠 Đề xuất', nDx) + '</span></div>' +
    (canGo ? '<button class="edit-btn big" data-gps="go"' + (picked.length ? '' : ' disabled') + '>🛰 Chụp ' + picked.length + ' chuyến' + (nR > 1 ? ' · ' + nR + ' tuyến 1 lần' : '') + '</button>' : '') + '</div>';
  if (r && r.status === 'completed') {
    out += '<div class="panel-note ' + (r.conclusion === 'success' ? 'ok' : 'err') + '">' + (r.conclusion === 'success' ? '✅ Chụp xong, link ảnh đã ghi vào Google Sheet.' : '⚠️ Có chuyến chụp lỗi, xem Google Sheet (hoặc tick chụp lại).') + '</div>';
  } else if (r) {
    out += '<div class="panel-note busy">⏳ Đang chụp ' + esc(GP.sent ? GP.sent.n + ' chuyến · tuyến ' + GP.sent.codes : '') + (r.n > 1 ? ' — xong ' + (r.xong || 0) + '/' + r.n + ' phần' : '') +
      '... có thể mất vài phút. Vẫn bấm được nút khác, xong sẽ báo.' + (r.url ? ' <a href="' + esc(r.url) + '" target="_blank" rel="noopener">Xem trên GitHub</a>' : '') + '</div>';
  } else if (other) {
    out += '<div class="panel-note busy">⏳ Đang có 1 lần chụp khác chạy (tuyến ' + esc(GPS_RUN.sent ? GPS_RUN.sent.codes : '') + '). Chờ xong rồi chụp tiếp, để khỏi quá tải GitHub / Google.</div>';
  } else if (canGo) {
    out += '<div class="panel-note">Tick chọn chuyến cần chụp. Chuyến ✅ đã có ảnh mà tick lại thì chụp lại (link mới ghi đè). Ảnh chuyến đề xuất có đuôi _DE_XUAT.</div>';
  }

  // 4) bảng gom theo tuyến
  const COLS = 9, vis = T.filter(gpsVisible), allChup = vis.filter(t => t.chup);
  const allOn = allChup.length && allChup.every(t => GP.pick.has(t.key));
  let body = '';
  GP.routes.forEach(function (rt) {
    const rows = vis.filter(t => t.tuyen === rt.code), mine = T.filter(t => t.tuyen === rt.code);
    if (!rows.length && (GP.filter !== 'all' || $('q').value.trim()) && mine.length) return;
    const ch = rows.filter(t => t.chup), on = ch.length && ch.every(t => GP.pick.has(t.key));
    body += '<tr class="gp-grp"><td>' + (ch.length ? '<input type="checkbox" class="gps-grp" data-tuyen="' + esc(rt.code) + '" title="Chọn cả tuyến"' + (on ? ' checked' : '') + '>' : '') +
      '</td><td colspan="' + (COLS - 1) + '" class="left"><b>Tuyến ' + esc(rt.code) + '</b>' + (rt.ten ? ' <span class="muted">' + esc(rt.ten) + '</span>' : '') +
      ' · <span class="pill p-mat">' + rt.mat + ' mất chuyến</span>' + (rt.dexuat ? ' <span class="pill p-dx">' + rt.dexuat + ' đề xuất</span>' : '') +
      ' · ' + mine.filter(t => t.daCo).length + ' đã có ảnh</td></tr>';
    if (!mine.length) body += '<tr><td></td><td colspan="' + (COLS - 1) + '" class="left muted">Không có chuyến mất nào</td></tr>';
    rows.forEach(function (t) {
      const anh = t.matGps ? '📡 mất GPS' : t.daCo ? '✅ đã có' : t.dangChup ? '⏳ đang chụp' : t.chup ? '⬜ chưa' : '❌ không có xe';
      body += '<tr class="' + (!t.chup ? 'e-nopc' : t.daCo ? 'e-ok' : isDx(t) ? 'gp-dx' : '') + '"><td>' +
        (t.chup ? '<input type="checkbox" class="gps-pick" data-key="' + esc(t.key) + '"' + (GP.pick.has(t.key) ? ' checked' : '') + '>' : '') + '</td><td>' + anh +
        (t.matGps ? '<br><small>' + esc(t.matGps) + '</small>' : '') + '</td><td>' + typePill(t) + '</td><td>' + esc(t.lich) + '</td><td>' + esc(t.xe || '(không có xe)') +
        '</td><td>' + (isDx(t) ? esc(t.di || '?') + ' → ' + esc(t.den || '?') : '—') + '</td><td class="left">' + esc(t.ben) + '</td><td>' + esc(t.ma) +
        '</td><td class="left">' + (isDx(t) ? esc([t.taiXe, t.tiepVien].filter(Boolean).join(' / ')) : '<span class="muted">—</span>') + '</td></tr>'; // mất chuyến: tài xế/tiếp viên là "Mất Chuyến", khỏi lặp
    });
  });
  out += '<table class="gp-tb"><thead><tr><th><input type="checkbox" class="gps-all" title="Chọn tất cả chuyến đang hiện"' + (allOn ? ' checked' : '') + '></th>' +
    ['Ảnh GPS', 'Loại', 'Lịch chạy', 'Xe', 'Đi → đến thực tế', 'Bến', 'Mã chuyến', 'Tài xế / Tiếp viên'].map(x => '<th>' + x + '</th>').join('') +
    '</tr></thead><tbody>' + (body || '<tr><td colspan="' + COLS + '">Không có chuyến nào</td></tr>') + '</tbody></table>';
  setOut(out); // giữ chữ đang gõ trong ô Thêm tuyến
}

// Tìm / lọc loại / Chụp
$('out').addEventListener('click', function (ev) {
  if (MODE !== 'gps') return;
  const f = ev.target.closest && ev.target.closest('[data-gpf]');
  if (f && GP) { GP.filter = f.dataset.gpf; renderGps(); return; }
  const b = ev.target.closest && ev.target.closest('button[data-gps]');
  if (!b) return;
  if (b.dataset.gps === 'find') { gpsFind(); return; }
  if (b.dataset.gps !== 'go' || !GP) return;
  const picked = GP.trips.filter(t => t.chup && GP.pick.has(t.key));
  if (!picked.length) { msg('Chưa tick chuyến nào.', 'err'); return; }
  const routes = GP.list.filter(r => picked.some(t => t.tuyen === r.code)), lines = [];
  routes.forEach(function (r) {
    const ts = picked.filter(t => t.tuyen === r.code), dx = ts.filter(isDx).length;
    lines.push('Tuyến ' + r.code + ': ' + ts.length + ' chuyến' + (dx ? ' (' + dx + ' đề xuất mất chuyến)' : ''));
    ts.forEach(t => lines.push('   • ' + t.lich + '  ' + t.xe + (isDx(t) ? '  [đề xuất]' : '') + (t.daCo ? '  (chụp lại)' : '')));
  });
  if (!confirm('Chụp GPS ' + picked.length + ' chuyến · ' + routes.length + ' tuyến · ngày ' + GP.ngay + ' (gửi 1 lần):\n\n' + clip(lines, 45).join('\n') +
    '\n\nẢnh lên Drive, link ghi vào Google Sheet.')) return;
  b.disabled = true; msg('Đang gửi lệnh chụp ' + picked.length + ' chuyến (' + routes.length + ' tuyến)...'); askNotify();
  const g = GP;
  gToken(40).then(function (gtok) {
    return apiPost({ action: 'gps', gtok: gtok, routes: JSON.stringify(routes), routeId: routes[0].id, label: routes.map(r => r.code).join('+'),
                     date: g.iso, keys: picked.map(t => t.key).join('\n') }, 180000);
  }).then(function (res) {
    if (!res.started) { msg('⚠️ Không có chuyến nào để chụp (danh sách vừa đổi, bấm 🔎 Tìm lại).', 'err'); b.disabled = false; return; }
    g.sent = { n: res.nChup, codes: gpsCodes(routes), routes: routes, picked: picked };
    g.run = { status: 'queued', n: res.runs || 1 }; GPS_RUN = g;
    picked.forEach(t => { if (!t.daCo) t.dangChup = true; });
    if (MODE === 'gps' && GP === g) renderGps();
    msg('🛰 Đã gửi ' + res.nChup + ' chuyến (' + routes.length + ' tuyến), đang chụp ngầm (vẫn bấm được nút khác). Xong sẽ báo ở đây.', 'ok');
    const title = res.title || (routes.map(r => r.code).join('+') + ' ' + res.ngay), t0 = Date.now();
    (function poll() {
      // chạy ngầm: bấm sang việc khác vẫn theo dõi tới khi xong, chỉ vẽ bảng khi đang xem bảng GPS
      api({ action: 'gpsstatus', since: res.since, title: title, n: res.runs || 1 }, 60000).then(function (st) {
        g.run = st; if (MODE === 'gps' && GP === g) renderGps();
        if (st.status === 'completed') { GPS_RUN = null; gpsReport(g, st); }
        else if (Date.now() - t0 < 90 * 60000) setTimeout(poll, 10000);
        else { GPS_RUN = null; msg('⚠️ Chụp GPS đã chờ 90 phút chưa xong, mở Google Sheet để kiểm tra.', 'err'); }
      }).catch(function () { if (Date.now() - t0 < 90 * 60000) setTimeout(poll, 15000); else GPS_RUN = null; });
    })();
  }).catch(function (e) { msg('❌ ' + e.message, 'err'); b.disabled = false; });
});

// Tick chọn chuyến GPS (giữ lựa chọn khi lọc / vẽ lại bảng)
$('out').addEventListener('change', function (ev) {
  if (MODE !== 'gps' || !GP) return;
  const el = ev.target, set = (t, on) => { if (t.chup) { if (on) GP.pick.add(t.key); else GP.pick.delete(t.key); } };
  if (el.classList.contains('gps-pick')) { if (el.checked) GP.pick.add(el.dataset.key); else GP.pick.delete(el.dataset.key); }
  else if (el.classList.contains('gps-grp')) GP.trips.filter(t => t.tuyen === el.dataset.tuyen && gpsVisible(t)).forEach(t => set(t, el.checked));
  else if (el.classList.contains('gps-all')) GP.trips.filter(gpsVisible).forEach(t => set(t, el.checked));
  else return;
  renderGps();
});

// ===== HOÀN TÁC (gọi undo trong edit.gs) =====
// Mỗi lần lưu lên FUTA (sửa 1 ô, Lưu tất cả, Tự chỉnh theo luật) máy chủ nhớ giá trị TRƯỚC khi lưu, giữ tới 23:55 ngày lưu.
// Hoàn tác = ghi lại giá trị cũ; ô nào đã bị đổi tiếp sau lần lưu đó thì không đụng. Hoàn tác nhầm thì "Làm lại".
// "Xác nhận về bến" không hoàn tác được (FUTA không cho huỷ kết thúc chuyến).
$('btnUndo').onclick = function () { undoList(); };

function undoList(note, cls) {
  msg(note ? note + '\nĐang tải danh sách lần lưu...' : 'Đang tải danh sách lần lưu...');
  return api({ action: 'undo', op: 'list', ekey: getEkey() }, 60000).then(function (res) {
    if (!res.list) throw new Error('Server chưa có action "undo". Dán edit.gs + web.gs mới, rồi Deploy lại BẢN MỚI.');
    UD = res; MODE = 'undo'; $('btnCopy').style.display = 'none';
    renderUndo();
    msg(note || '↩️ ' + res.list.length + ' lần lưu hôm nay (hoàn tác được tới 23:55, quá giờ tự xoá). Bấm "↩️ Hoàn tác" ở lần lưu cần trả lại giá trị cũ.', cls || 'info');
  }).catch(function (e) { msg((note ? note + '\n' : '') + '❌ ' + e.message, 'err'); });
}

function renderUndo() {
  const L = UD.list, done = L.filter(x => x.done).length;
  $('stats').innerHTML = [['Lần lưu', L.length, 'e-n'], ['Hoàn tác được', L.length - done, 'e-warn'], ['Đã hoàn tác', done, 'e-ok']]
    .map(x => '<div class="stat ' + x[2] + '"><b>' + x[1] + '</b>' + x[0] + '</div>').join('');
  const q = $('q').value.trim().toLowerCase();
  let body = '';
  L.forEach(function (x) {
    if (q && [x.who, x.kind, x.tuyen, x.ngay, x.xe, x.of].join(' ').toLowerCase().indexOf(q) === -1) return;
    const st = x.done ? '✅ Đã hoàn tác ' + x.done + (x.doneWho ? ' (' + x.doneWho + ')' : '') : x.of ? '↩️ Là lần hoàn tác của: ' + x.of : 'Có thể hoàn tác';
    body += '<tr class="' + (x.done ? 'e-ok' : '') + '"><td>' + esc(x.at) + '<br><small class="muted">hạn ' + esc(x.het || '23:55') + '</small></td><td class="left">' + esc(x.who) + '</td><td class="left">' + esc(x.kind) +
      '</td><td>' + esc(x.tuyen) + '</td><td>' + esc(x.ngay) + '</td><td class="left">' + esc(x.xe) + '</td><td>' + esc(x.nTrip) + ' chuyến · ' + esc(x.nField) + ' ô' +
      '</td><td class="notes">' + esc(st) + '</td><td class="edcell"><button class="edit-btn soft" data-undo-view="' + esc(x.id) + '">👁 Xem</button>' +
      (x.done ? '' : '<button class="edit-btn red" data-undo="' + esc(x.id) + '">' + (x.of ? '↪️ Làm lại' : '↩️ Hoàn tác') + '</button>') + '</td></tr>';
    if (UD.view && UD.view.entry.id === x.id) {
      body += '<tr class="ud-detail"><td colspan="9" class="left"><div class="ud-list">' + UD.view.items.map(function (it) {
        return '<div>• <b>' + esc([it.xe, it.lenh && 'lệnh ' + it.lenh, it.stt && 'chuyến ' + it.stt].filter(Boolean).join(' · ')) + '</b> (' + esc(it.code) + '): ' +
          it.f.map(f => esc(f.label) + ' <span class="ud-now">' + esc(f.now) + '</span> → hoàn tác về <span class="ud-back">' + esc(f.back) + '</span>').join(', ') + '</div>';
      }).join('') + '</div></td></tr>';
    }
  });
  $('out').innerHTML = '<div class="panel-note">↩️ Hoàn tác = ghi lại giá trị <b>trước</b> lần lưu, làm được tới <b>23:55</b> của ngày lưu (lưu sau 23:55 thì tới 23:55 hôm sau). Máy chủ đọc lại ngay trước khi ghi: ô nào đã bị đổi tiếp sau lần lưu đó ' +
    '(tiếp viên bấm, người khác sửa) thì <b>không đụng</b> và báo ra. Hoàn tác nhầm thì bấm ↪️ Làm lại. <b>Xác nhận về bến không hoàn tác được</b> (FUTA không cho huỷ kết thúc chuyến).</div>' +
    '<table><thead><tr>' + ['Lúc lưu', 'Người lưu', 'Loại', 'Tuyến', 'Ngày', 'Xe', 'Số lượng', 'Trạng thái', ''].map(x => '<th>' + x + '</th>').join('') +
    '</tr></thead><tbody>' + (body || '<tr><td colspan="9">Hôm nay chưa có lần lưu nào (mỗi lần lưu sửa lệnh / tự chỉnh sẽ hiện ở đây tới 23:55)</td></tr>') + '</tbody></table>';
}

// 👁 Xem chi tiết 1 lần lưu (bấm lại thì ẩn)
$('out').addEventListener('click', function (ev) {
  const b = ev.target.closest && ev.target.closest('[data-undo-view]');
  if (!b || MODE !== 'undo' || !UD) return;
  const id = b.dataset.undoView;
  if (UD.view && UD.view.entry.id === id) { UD.view = null; renderUndo(); return; }
  api({ action: 'undo', op: 'view', id: id, ekey: getEkey() }, 60000).then(function (v) { UD.view = v; renderUndo(); msg('', ''); })
    .catch(function (e) { msg('❌ ' + e.message, 'err'); });
});

// ↩️ Hoàn tác / ↪️ Làm lại (ở màn Hoàn tác hoặc thanh "Lỡ tay?" ngay sau khi lưu)
document.addEventListener('click', function (ev) {
  const b = ev.target.closest && ev.target.closest('[data-undo]');
  if (!b || document.body.classList.contains('is-busy')) return;
  undoRun(b.dataset.undo);
});
function undoRun(id) {
  msg('Đang đọc chi tiết lần lưu...');
  api({ action: 'undo', op: 'view', id: id, ekey: getEkey() }, 60000).then(function (v) {
    const e = v.entry;
    if (e.done) { msg('Lần lưu này đã được hoàn tác lúc ' + e.done + (e.doneWho ? ' (' + e.doneWho + ')' : '') + '.', 'err'); return; }
    const lines = v.items.map(it => '• ' + [it.xe, it.lenh && 'lệnh ' + it.lenh, it.stt && 'chuyến ' + it.stt].filter(Boolean).join(' · ') + ' (' + it.code + '): ' +
      it.f.map(f => f.label + ' ' + f.now + ' → ' + f.back).join(', '));
    if (!confirm((e.of ? 'LÀM LẠI (huỷ lần hoàn tác)' : 'HOÀN TÁC') + ': ' + e.kind + ' lúc ' + e.at + ' (' + e.who + ')\nTuyến ' + e.tuyen + ' · ' + e.ngay + (e.xe ? ' · ' + e.xe : '') +
      '\n\nSẽ ghi lại giá trị cũ cho ' + v.items.length + ' chuyến lên FUTA:\n\n' + clip(lines, 40).join('\n') +
      '\n\nÔ nào đã bị đổi tiếp sau lần lưu này sẽ KHÔNG đụng tới. Xác nhận?')) { msg('Đã huỷ, chưa ghi gì.', 'info'); return; }
    msg('Đang hoàn tác ' + v.items.length + ' chuyến (đọc lại → ghi giá trị cũ → đọc lại kiểm, đừng đóng trang)...');
    return api({ action: 'undo', op: 'run', id: id, ekey: getEkey() }, 360000, 0).then(function (r) {
      const bad = r.verifyBad.concat(r.failed, r.skipped);
      const line = (bad.length || r.stopped ? '⚠️ ' : '✅ ') + (e.of ? 'Đã làm lại ' : 'Đã hoàn tác ') + r.restored + '/' + r.total + ' chuyến (' + r.elapsed + 's)' +
        (r.verifyBad.length ? ', KIỂM LỆCH ' + r.verifyBad.length : '') + (r.failed.length ? ', lỗi ghi ' + r.failed.length : '') +
        (r.skipped.length ? ', không khôi phục ' + r.skipped.length : '') + (r.stopped ? ', chưa kịp ' + r.stopped + ' (hết giờ, bấm lại)' : '') +
        (bad.length ? '\n' + bad.join('\n') : '');
      const cls = bad.length || r.stopped ? 'err' : 'ok';
      if (r.redoId) showUndo(r.redoId, e.of ? 'Đã làm lại. Đổi ý?' : 'Đã hoàn tác. Hoàn tác nhầm?', e.of ? '↩️ Hoàn tác lại' : '↪️ Làm lại (ghi lại giá trị vừa bỏ)');
      else hideUndo();
      if (MODE === 'edit' && ED) return loadEdit(ED.sel, ED.plate).then(function () { msg(line, cls); });
      if (MODE === 'auto' && AU) return autoPlan(line);
      return undoList(line, cls);
    });
  }).catch(function (e) { msg('❌ ' + e.message, 'err'); });
}

// Thanh "Lỡ tay?" hiện ngay dưới dòng thông báo sau mỗi lần lưu; ẩn khi bấm sang tác vụ khác hoặc bấm ×
function showUndo(id, text, label) {
  if (!id) return;
  $('undoBar').innerHTML = '<span>↩️ ' + esc((text || 'Lỡ tay?') + ' (được tới 23:55)') + '</span><button class="edit-btn red" data-undo="' + esc(id) + '">' + esc(label || '↩️ Hoàn tác lần lưu vừa rồi') +
    '</button><button type="button" class="ub-x" title="Ẩn" aria-label="Ẩn">×</button>';
  $('undoBar').hidden = false;
}
function hideUndo() { $('undoBar').hidden = true; $('undoBar').innerHTML = ''; }
$('undoBar').addEventListener('click', function (ev) { if (ev.target.closest('.ub-x')) hideUndo(); });

// ===== NÚT TÁC VỤ: vòng xoay trên nút đang chạy, ẩn khung tiêu chí / Excel / "Lỡ tay?" khi đổi tác vụ, nhớ tác vụ để "🔄 Lấy mới" =====
let LAST_BTN = null, LAST_RO = null, FRESH_UNTIL = 0;
const RO_BTN = { btnLoad: 1, btnEbms: 1, btnNv: 1, btnLvc: 1, btnGps: 1, btnBt: 1 };   // tác vụ chỉ đọc (máy chủ dùng chung kết quả 30–60 giây)
const RO_ACT = { load: 1, ebms: 1, nv: 1, lvc: 1, bangtai: 1, gps: 1 };
document.addEventListener('click', function (e) {
  if (!e.target.closest || document.body.classList.contains('is-busy')) return;
  const nb = e.target.closest('.act, .edit-btn.big, [data-undo]');
  if (nb) LAST_BTN = nb;
  const b = e.target.closest('.act');
  if (!b) return;
  $('lvcRules').hidden = (b.id !== 'btnLvc'); $('btnXlsx').style.display = 'none';
  if (b.id !== 'btnUndo') hideUndo();
  if (!RO_BTN[b.id]) { $('dataAt').textContent = ''; $('btnFresh').hidden = true; }
  else LAST_RO = b.id;
}, true);
$('btnFresh').onclick = function () {
  if (document.body.classList.contains('is-busy')) return;
  FRESH_UNTIL = Date.now() + 3000; // các lượt gọi trong 3 giây tới bỏ cache (nocache=1)
  if (MODE === 'gps' && LAST_RO === 'btnGps') gpsFind();
  else if (LAST_RO && $(LAST_RO)) $(LAST_RO).click();
};

// ===== GOOGLE: lưu ảnh GPS vào Drive / Sheet của chính người dùng (quyền drive.file: chỉ file do web tạo) =====
let GTOK = null, GCLIENT = null, GWAIT = null;
if (GOOGLE_CLIENT_ID) {
  const sc = document.createElement('script'); sc.src = 'https://accounts.google.com/gsi/client'; sc.async = true; document.head.appendChild(sc);
}
// Gọi NGAY trong lúc bấm nút để trình duyệt không chặn cửa sổ Google. minLeft: token phải còn ít nhất bấy nhiêu phút.
function gToken(minLeft) {
  if (!GOOGLE_CLIENT_ID) return Promise.resolve('');
  if (GTOK && GTOK.exp > Date.now() + minLeft * 60000) return Promise.resolve(GTOK.t);
  if (!(window.google && google.accounts && google.accounts.oauth2)) return Promise.reject(new Error('Đăng nhập Google chưa tải xong, bấm lại sau vài giây'));
  if (!GCLIENT) GCLIENT = google.accounts.oauth2.initTokenClient({
    client_id: GOOGLE_CLIENT_ID, scope: 'https://www.googleapis.com/auth/drive.file',
    callback: function (r) {
      const w = GWAIT; GWAIT = null; if (!w) return;
      if (r.error || !r.access_token) w.reject(new Error('Google từ chối: ' + (r.error_description || r.error || 'không có token')));
      else { GTOK = { t: r.access_token, exp: Date.now() + Number(r.expires_in || 3600) * 1000 }; w.resolve(GTOK.t); }
    },
    error_callback: function (e) {
      const w = GWAIT; GWAIT = null;
      if (w) w.reject(new Error(e && e.type === 'popup_failed_to_open' ? 'Trình duyệt chặn cửa sổ Google, cho phép popup rồi bấm lại' : 'Chưa đăng nhập Google nên chưa lưu được ảnh GPS'));
    }
  });
  return new Promise(function (resolve, reject) { GWAIT = { resolve: resolve, reject: reject }; GCLIENT.requestAccessToken({ prompt: '' }); });
}

// ===== TÀI KHOẢN: đăng nhập / đăng ký / cập nhật FUTA / đổi mật khẩu =====
function setMe(me) {
  ME = me || null;
  $('btnUser').textContent = !USER_MODE ? '🔑 ' + (localStorage.getItem('web_who') || 'Đổi mã truy cập') : ME ? '👤 ' + ME.name : '👤 Đăng nhập';
}
setMe(null);
function showAuth(tab) {
  $('auth').hidden = false;
  $('authX').hidden = !ME;                 // chưa đăng nhập thì không đóng được
  $('authTabs').hidden = tab === 'acc';
  document.querySelectorAll('#auth [data-pane]').forEach(function (el) { el.hidden = el.dataset.pane !== tab; });
  $('authTabs').querySelectorAll('button').forEach(function (b) { b.classList.toggle('on', b.dataset.tab === tab); });
  document.querySelectorAll('#auth .fe, #auth .auth-err').forEach(function (el) { el.textContent = ''; el.classList.remove('ok'); });
  if (tab === 'acc' && ME) $('accInfo').innerHTML = '<b>' + esc(ME.name) + '</b><span>SĐT: ' + esc(ME.phone) + '</span><span>Tài khoản FUTA đang dùng: ' + esc(ME.futa) + '</span>';
  const f = document.querySelector('#auth [data-pane="' + tab + '"] input');
  if (f) setTimeout(function () { f.focus(); }, 50);
}
function authOk(form, text) { const el = form.querySelector('.auth-err'); el.textContent = text; el.classList.add('ok'); }
function hideAuth() { $('auth').hidden = true; }
function okPass(pw) { return /[A-Z]/.test(pw) && (pw.match(/[a-z]/g) || []).length >= 5; }
const PASS_RULE = 'Mật khẩu cần ít nhất 1 chữ viết hoa và 5 chữ thường';

// Gắn xử lý cho 1 form: check() trả lỗi {field, message} hoặc null; send() trả Promise
function authForm(form, busyText, check, send, done) {
  form.onsubmit = function (ev) {
    ev.preventDefault();
    form.querySelectorAll('.fe, .auth-err').forEach(function (el) { el.textContent = ''; el.classList.remove('ok'); });
    const v = {}; form.querySelectorAll('input[name]').forEach(function (i) { v[i.name] = i.value.trim(); });
    const showErr = function (e) {
      const el = (e.field && form.querySelector('.fe[data-for="' + e.field + '"]')) || form.querySelector('.auth-err');
      el.textContent = '❌ ' + e.message;
    };
    const bad = check(v); if (bad) { showErr(bad); return; }
    const btn = form.querySelector('button[type=submit]'), label = btn.textContent;
    btn.disabled = true; btn.textContent = busyText;
    send(v).then(function (res) { form.reset(); done(res); }).catch(showErr)
      .then(function () { btn.disabled = false; btn.textContent = label; });
  };
}
function onLogin(res) {
  localStorage.setItem('web_sid', res.sid); setMe(res.user); hideAuth();
  msg('✅ Xin chào ' + res.user.name, 'ok'); loadRoutes();
  if (getEkey()) tryUnlock(getEkey(), true); // mở lại tính năng sửa lệnh nếu đã nhập mã trước đó
}

authForm($('fLogin'), 'Đang đăng nhập...', function (v) {
  if (!v.phone) return { field: 'phone', message: 'Chưa nhập số điện thoại' };
  if (!v.pass) return { field: 'pass', message: 'Chưa nhập mật khẩu' };
  return null;
}, function (v) { return apiPost({ action: 'login', phone: v.phone, pass: v.pass }, 60000); }, onLogin);

authForm($('fReg'), 'Đang kiểm tra tài khoản FUTA...', function (v) {
  if (!/^0\d{9}$/.test(v.phone.replace(/[\s.\-]/g, ''))) return { field: 'phone', message: 'Số điện thoại phải gồm 10 số, bắt đầu bằng 0' };
  if (!v.name) return { field: 'name', message: 'Chưa nhập họ tên' };
  if (!okPass(v.pass)) return { field: 'pass', message: PASS_RULE };
  if (v.pass !== v.pass2) return { field: 'pass2', message: 'Nhập lại mật khẩu không khớp' };
  if (!v.futaUser || !v.futaPass) return { field: 'futa', message: 'Chưa nhập đủ tài khoản và mật khẩu FUTA' };
  return null;
}, function (v) {
  return apiPost({ action: 'register', phone: v.phone, name: v.name, pass: v.pass, futaUser: v.futaUser, futaPass: v.futaPass }, 90000);
}, onLogin);

authForm($('fFuta'), 'Đang kiểm tra tài khoản FUTA...', function (v) {
  return v.futaUser && v.futaPass ? null : { field: 'futa', message: 'Chưa nhập đủ tài khoản và mật khẩu FUTA' };
}, function (v) { return apiPost({ action: 'futa', futaUser: v.futaUser, futaPass: v.futaPass }, 90000); },
function (res) { setMe(res.user); showAuth('acc'); authOk($('fFuta'), '✅ Đã cập nhật tài khoản FUTA'); });

authForm($('fPw'), 'Đang đổi...', function (v) {
  if (!v.old) return { field: 'old', message: 'Chưa nhập mật khẩu cũ' };
  if (!okPass(v.pass)) return { field: 'pass', message: PASS_RULE };
  if (v.pass !== v.pass2) return { field: 'pass2', message: 'Nhập lại mật khẩu không khớp' };
  return null;
}, function (v) { return apiPost({ action: 'doimk', old: v.old, pass: v.pass }, 60000); },
function () { authOk($('fPw'), '✅ Đã đổi mật khẩu'); });

$('authTabs').onclick = function (ev) { const b = ev.target.closest('button[data-tab]'); if (b) showAuth(b.dataset.tab); };
$('authX').onclick = hideAuth;
$('btnLogout').onclick = function () {
  apiPost({ action: 'logout' }, 30000).catch(function () {});
  localStorage.removeItem('web_sid'); setMe(null);
  $('out').innerHTML = ''; $('stats').innerHTML = ''; msg('Đã đăng xuất');
  showAuth('login');
};

// ===== KHOÁ NÚT: đang chạy 1 thao tác thì khoá các nút khác (bấm nhiều nút cùng lúc dễ quá tải máy chủ / FUTA) =====
(function () {
  const FREE = { gpsstatus: 1, editauth: 1 }; // chạy nền (hỏi tiến độ GPS, kiểm tra mã): không khoá
  const BTN = '.act, .edit-btn, [data-gps="go"]';
  let n = 0, timer = null;
  let runBtn = null;
  const mark = function () {
    clearTimeout(timer);
    if (n > 0) {
      document.body.classList.add('is-busy');
      if (!runBtn && LAST_BTN) { runBtn = LAST_BTN; runBtn.classList.add('is-run'); } // vòng xoay trên nút vừa bấm
    } else timer = setTimeout(function () { // giữa 2 bước của 1 thao tác không mở khoá
      document.body.classList.remove('is-busy');
      if (runBtn) { runBtn.classList.remove('is-run'); runBtn = null; }
      LAST_BTN = null;
    }, 200);
  };
  const wrap = function (fn) {
    return function (params) {
      const track = !(params && FREE[params.action]);
      if (track) { n++; mark(); }
      const args = Array.prototype.slice.call(arguments);
      if (params && RO_ACT[params.action] && Date.now() < FRESH_UNTIL) args[0] = Object.assign({}, params, { nocache: '1' }); // 🔄 Lấy mới
      return Promise.resolve(fn.apply(this, args)).then(function (res) {
        if (res && res.at) showDataAt(res.at);
        return res;
      }).finally(function () { if (track) { n--; mark(); } });
    };
  };
  api = wrap(api); apiPost = wrap(apiPost);
  // chặn cả bấm chuột lẫn Enter (Enter gọi .click() nên cũng đi qua đây)
  document.addEventListener('click', function (ev) {
    const b = ev.target.closest && ev.target.closest(BTN);
    if (!b || b.hasAttribute('data-rp-act') || !document.body.classList.contains('is-busy')) return; // nút chọn tuyến chỉ đổi lựa chọn trên máy, không khoá
    ev.preventDefault(); ev.stopImmediatePropagation();
  }, true);
})();

// ===== GIỜ DỮ LIỆU: cho biết đang xem dữ liệu lấy lúc nào (máy chủ dùng chung kết quả 30 giây, EBMS 60 giây; "🔄 Lấy mới" để đọc mới) =====
function showDataAt(at) {
  const t = new Intl.DateTimeFormat('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh', hour: '2-digit', minute: '2-digit', second: '2-digit' }).format(new Date(at));
  const ago = Math.round((Date.now() - at) / 1000);
  $('dataAt').textContent = '🕒 Dữ liệu lúc ' + t + (ago >= 5 ? ' (' + ago + ' giây trước)' : '');
  $('btnFresh').hidden = !LAST_RO;
}

// ===== THÔNG BÁO KHI CHỤP GPS XONG: tiếng "ting" + thông báo góc màn hình (chỉ máy người bấm chụp) =====
function askNotify() { try { if (window.Notification && Notification.permission === 'default') Notification.requestPermission(); } catch (e) { /* bỏ qua */ } }
function notifyDone(title, body) {
  try { // tiếng ting 2 nốt
    const ac = new (window.AudioContext || window.webkitAudioContext)();
    [880, 1320].forEach(function (f, i) {
      const o = ac.createOscillator(), g = ac.createGain(), t0 = ac.currentTime + i * 0.18;
      o.frequency.value = f; o.connect(g); g.connect(ac.destination);
      g.gain.setValueAtTime(0.0001, t0); g.gain.exponentialRampToValueAtTime(0.25, t0 + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.3);
      o.start(t0); o.stop(t0 + 0.32);
    });
  } catch (e) { /* không phát được tiếng thì thôi */ }
  try { if (window.Notification && Notification.permission === 'granted') new Notification(title, { body: body }); } catch (e) { /* bỏ qua */ }
}

// ===== Chụp GPS xong: đọc lại Sheet để báo chuyến có ảnh / XE MẤT GPS (bỏ qua, không chụp được) / chuyến lỗi =====
function gpsReport(g, st) {
  const sent = g.sent || { routes: g.list || [], picked: [], codes: '' }, routes = sent.routes, picked = sent.picked;
  const gt = GTOK && GTOK.exp > Date.now() + 60000 ? GTOK.t : '';
  apiPost({ action: 'gps', dry: '1', gtok: gt, routes: JSON.stringify(routes), routeId: routes[0].id, label: routes.map(r => r.code).join('+'), date: g.iso }, 180000).then(function (res) {
    const by = {}; res.trips.forEach(function (t) { by[t.key] = t; });
    // cập nhật lại danh sách (tuyến chụp có thể chỉ là 1 phần các tuyến đang xem)
    const keep = (g.trips || []).filter(t => !routes.some(r => r.code === t.tuyen));
    g.trips = keep.concat(res.trips).sort((a, b) => g.routes.findIndex(r => r.code === a.tuyen) - g.routes.findIndex(r => r.code === b.tuyen));
    const mat = [], err = []; let ok = 0;
    picked.forEach(function (t) {
      const x = by[t.key] || t;
      if (x.matGps) mat.push(x.tuyen + ' ' + x.xe); else if (x.daCo) ok++; else err.push(x.tuyen + ' ' + x.lich + ' ' + x.xe);
      if (x.daCo || x.matGps) g.pick.delete(t.key);
    });
    const text = '🛰 Chụp GPS xong ' + routes.length + ' tuyến (' + sent.codes + ') ' + res.ngay + ': ' + ok + '/' + picked.length + ' chuyến có ảnh' +
      (mat.length ? ' · 📡 Xe mất GPS (bỏ qua): ' + mat.join(', ') : '') + (err.length ? ' · ⚠️ Lỗi, tick chụp lại: ' + err.join(', ') : '');
    msg(text, err.length ? 'err' : 'ok');
    notifyDone(err.length ? '⚠️ Chụp GPS có chuyến lỗi' : '🛰 Chụp GPS xong', 'Tuyến ' + sent.codes + ': ' + ok + ' có ảnh' + (mat.length ? ', mất GPS: ' + mat.length : '') + (err.length ? ', lỗi ' + err.length : ''));
    if (MODE === 'gps' && GP === g) renderGps();
  }).catch(function () { // không đọc lại được Sheet thì báo theo kết quả GitHub như cũ
    msg(st.conclusion === 'success' ? '✅ Chụp GPS xong tuyến ' + sent.codes + '. Mở Google Sheet để xem link ảnh.' : '⚠️ Có chuyến chụp lỗi, mở Google Sheet xem chuyến nào ghi "LỖI" rồi tick chụp lại.', st.conclusion === 'success' ? 'ok' : 'err');
    notifyDone(st.conclusion === 'success' ? '🛰 Chụp GPS xong' : '⚠️ Chụp GPS có chuyến lỗi', 'Tuyến ' + sent.codes);
  });
}
