// ===== CẤU HÌNH: URL Web App của Apps Script (kết thúc /exec) =====
const API_URL = 'https://script.google.com/macros/s/AKfycbxWzYaiYmEQiVrl4oNgFCBBxOHUnX8_nIZK396IrXbFDx-H0sz-BAhhozyo14wrWLAs/exec';
function getUrl() { return API_URL; }

// BẢO MẬT: không cho trang khác nhúng web này vào khung ẩn để lừa bấm nút (clickjacking). GitHub Pages không đặt được header nên chặn bằng JS.
if (window.top !== window.self) { document.documentElement.innerHTML = ''; try { window.top.location = window.self.location.href; } catch (e) { /* bỏ qua */ } throw new Error('Không chạy trong khung'); }
let DATA = null, CUR = null;
const $ = id => document.getElementById(id);
const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
function msg(t, cls) { // cls: ok / warn (xong nhưng có lỗi) / err / info; trống = đang chạy (có vòng xoay)
  const el = $('msg');
  el.className = cls || ''; el.textContent = t || '';
  // điện thoại: có kết quả mà dòng thông báo đang khuất dưới màn hình thì cuộn xuống cho thấy
  if ((cls === 'ok' || cls === 'warn' || cls === 'err') && t && window.innerWidth < 760) {
    const r = el.getBoundingClientRect();
    if (r.top > window.innerHeight - 60 || r.bottom < 0) el.scrollIntoView({ block: 'start', behavior: 'smooth' });
  }
}
const hm5 = v => String(v || '').slice(-5);
// Link lấy từ Sheet / máy chủ: chỉ cho http(s), chặn "javascript:..." (ai sửa ô Sheet thành mã độc thì bấm link cũng không chạy)
const safeUrl = u => /^https?:\/\//i.test(String(u || '').trim()) ? esc(String(u).trim()) : '#';
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

// ===== MÃ TRUY CẬP + TÊN (khi tắt tài khoản, mã khớp Script Property WEB_KEY): nhập 1 lần ở khung "Vào web", lưu trên máy này =====
function getKey() { try { return localStorage.getItem('web_key') || ''; } catch (e) { return ''; } }
function getWho() { try { return localStorage.getItem('web_who') || ''; } catch (e) { return ''; } }
function authParam() { return USER_MODE ? { sid: getSid(), src: 'web' } : { key: getKey(), who: getWho(), src: 'web' }; }

// ===== ĐĂNG NHẬP (tài khoản web, gắn tài khoản FUTA riêng) =====
function getSid() { try { return localStorage.getItem('web_sid') || ''; } catch (e) { return ''; } }
let ME = null;

// ===== GỌI MÁY CHỦ (tự thử lại khi lỗi kết nối) =====
// Gọi bằng fetch KHÔNG gửi cookie Google (credentials 'omit'): trình duyệt đăng nhập nhiều tài khoản Google /
// cookie Google cũ làm script.google.com chuyển hướng vòng vèo -> trang chậm, đổi trình duyệt mới hết.
// fetch lỗi mạng thì mới dùng JSONP (cách cũ) làm dự phòng.
let _n = 0, NO_FETCH = false;
function apiOnce(params, timeoutMs) {
  if (NO_FETCH || !window.fetch) return apiJsonp(params, timeoutMs);
  let url;
  try { url = getUrl(); } catch (e) { return Promise.reject(e); }
  const ctl = new AbortController(), timer = setTimeout(function () { ctl.abort(); }, timeoutMs || 120000);
  // BẢO MẬT (05/11/2026): gửi bằng POST, mã truy cập / mã mở khoá / phiên FUTA nằm trong thân yêu cầu, KHÔNG nằm trên URL
  // (URL hay bị lưu lại ở lịch sử, nhật ký proxy / máy chủ). doPost (Gps.gs) chuyển sang web_handle_ y như doGet.
  return fetch(url, { method: 'POST', body: JSON.stringify(Object.assign(authParam(), params)), credentials: 'omit', cache: 'no-store', signal: ctl.signal })
    .then(function (r) { return r.json(); })
    .then(function (data) { if (!data || !data.ok) throw apiErr(data); return data; }, function (e) {
      if (e.name === 'AbortError') throw new Error('Hết thời gian chờ');
      if (e instanceof SyntaxError) { NO_FETCH = true; return apiJsonp(params, timeoutMs); } // máy chủ không trả JSON
      return apiJsonp(params, timeoutMs); // lỗi mạng / CORS: thử lại bằng JSONP
    })
    .finally(function () { clearTimeout(timer); });
}
function apiJsonp(params, timeoutMs) {
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
  if (data && data.futaLogin) e.futaLogin = true;   // ⚡ Tự chỉnh: chưa đăng nhập FUTA riêng / hết phiên
  if (data && data.field) e.field = data.field;
  return e;
}

// POST (mật khẩu, token Google không nằm trên URL). Apps Script trả CORS cho body text/plain.
function apiPost(params, timeoutMs) {
  const ctl = new AbortController(), timer = setTimeout(function () { ctl.abort(); }, timeoutMs || 120000);
  return fetch(getUrl(), { method: 'POST', body: JSON.stringify(Object.assign(authParam(), params)), credentials: 'omit', signal: ctl.signal })
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
function isoDate() { // dd/mm/yyyy (gõ tắt dd/mm hoặc dd/mm/yy cũng được) -> yyyy-mm-dd cho server, rỗng nếu gõ sai
  const m = $('date').value.trim().match(/^(\d{1,2})[\/.\-](\d{1,2})(?:[\/.\-](\d{2}|\d{4}))?$/);
  if (!m) return '';
  const y = !m[3] ? vnToday().slice(-4) : m[3].length === 2 ? '20' + m[3] : m[3];
  return y + '-' + m[2].padStart(2, '0') + '-' + m[1].padStart(2, '0');
}
// Chưa chọn đúng tuyến / ngày: báo đúng lỗi, đưa con trỏ tới ô cần sửa. Trả true nếu còn thiếu.
function thieuSel(s) {
  if (!ROUTES.length) { msg('Danh sách tuyến đang tải, chờ vài giây rồi bấm lại.', 'info'); return true; }
  if (!s.id) { msg('❌ Chọn tuyến trước.', 'err'); $('route').focus(); return true; }
  if (!isoDate()) { msg('❌ Ngày chưa đúng, gõ dạng dd/mm/yyyy.', 'err'); $('date').focus(); return true; }
  return false;
}

// ===== KHỞI TẠO =====
$('date').value = vnToday();

let ROUTES = [];
let FAV_CODES = []; // tuyến cụm (Script Property FB_ROUTES)
const RP = {};      // ô chọn nhiều tuyến dùng chung (GPS, về bến): tên -> { set, change }, xem rpHtml
const routeText = r => r.code + (r.name ? ' — ' + r.name : '');

function loadRoutes() {
  if (USER_MODE && !getSid()) { showAuth('login'); return; }
  if (!USER_MODE && (!getKey() || !getWho())) { openHello(); return; }
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
    moDau();
  }).catch(function (e) {
    if (e.login) return;
    if (!USER_MODE && /mã truy cập/i.test(e.message)) { openHello(e.message.replace(' (key)', '')); return; }
    msg('❌ ' + e.message, 'err');
  });
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

// Enter ở ô Tuyến / Ngày: làm việc chính của thẻ đang mở. Thẻ Kiểm tra: chạy lại đúng việc đang xem (đang xem EBMS thì so EBMS...), chưa xem gì thì Bảng xe
function rerunCheck() {
  ovNen();
  if (MODE === 'gps') { if (GPSR.size) gpsFind(); return; }
  $(CUR_BTN[MODE] || 'btnOv').click();
}
function enterRun(e) {
  if (e.key !== 'Enter') return;
  e.preventDefault();
  DAY_DA = isoDate();
  if (TAB === 'xem') rerunCheck(); else if (TAB === 'bt') btRun(); else if (TAB === 'lap') $('btnLap').click();
}
$('route').onkeydown = enterRun;
$('date').onkeydown = enterRun;
// Đổi tuyến / ngày: tự xem lại màn đang mở, khỏi bấm nút lần nữa
function rerunCurrent(doiTuyen) {
  DAY_DA = isoDate();
  if (TAB === 'bt') { if (!doiTuyen && BTR.size) btRun(); return; }   // Bảng tài có ô chọn tuyến riêng
  if (TAB !== 'xem' || !sel().id || !isoDate()) return;
  if (MODE === 'gps') { ovNen(); if (!doiTuyen && GPSR.size) gpsFind(); return; }   // GPS có ô chọn tuyến riêng
  if (MODE === 'auto' && AU) { ovNen(); autoPlan(''); return; }
  if (MODE === 'ky' && KY) { ovNen(); kyPlan(''); return; }
  rerunCheck();
}
// Vừa mở web / vừa tải xong danh sách tuyến: hiện luôn màn của mục đang mở
function moDau() {
  if (TAB === 'xem' && !$('out').children.length && sel().id && isoDate()) $('btnOv').click();
  else if (TAB === 'bt') openBt();
}

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
const SELECT_ON_FOCUS = '#date, #plate, #q';
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
  if (el.id === 'route') {
    localStorage.setItem('last_route', routeText(r));
    $('plate').value = ''; $('q').value = '';   // biển số / ô lọc là của tuyến cũ
    if (!viaEnter && !document.body.classList.contains('is-busy')) rerunCurrent(true);   // chọn bằng chuột / chạm: xem luôn (Enter thì enterRun làm)
    return viaEnter;
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
// Giữ luôn các mục thu gọn đang mở (details có data-k), màn tự cập nhật không làm gập lại.
function setOut(html) {
  const a = document.activeElement, name = a && a.dataset && a.dataset.rpInput;
  const st = name ? { v: a.value, s: a.selectionStart, e: a.selectionEnd, typed: !!(RB && RB.el === a && RB.typed) } : null;
  const mo = Array.from($('out').querySelectorAll('details[open][data-k]')).map(function (d) { return d.dataset.k; });
  $('out').innerHTML = html;
  mo.forEach(function (k) { const d = $('out').querySelector('details[data-k="' + k + '"]'); if (d) d.open = true; });
  if (!st) return;
  const n = document.querySelector('[data-rp-input="' + name + '"]');
  if (!n) return;
  n.value = st.v; n._keep = { typed: st.typed }; n.focus();
  try { n.setSelectionRange(st.s, st.e); } catch (e) { /* bỏ qua */ }
}

$('btnUser').onclick = function () { if (!USER_MODE) { openMe(); return; } showAuth(ME ? 'acc' : 'login'); };

// ===== DỮ LIỆU DÙNG CHUNG CHO CÁC Ô: mỗi loại chỉ tải 1 lần cho 1 tuyến + ngày, giữ 2 phút; đang tải thì dùng chung lượt đó =====
// Đọc chạy nền, không khoá nút nên bấm sang ô khác thoải mái. VIEW_ID: kết quả về muộn của màn đã rời thì bỏ.
const NAP = {}, NAP_TTL = 120000;
const NAP_LUU = { load: v => { DATA = v; }, lvc: v => { LV = v; }, ebms: v => { EB = v; }, nv: v => { NV = v; } };
let VIEW_ID = 0, LV_LOI = '';
function curKey() { const s = sel(); return s.id && isoDate() ? s.id + '|' + isoDate() : ''; }
function nap(action, s, extra, ms) {
  const key = s.id + '|' + isoDate(), c = NAP[action];
  if (c && c.key === key && (c.cho || Date.now() - c.at < NAP_TTL) && Date.now() >= FRESH_UNTIL) return c.p;
  const me = { key: key, cho: true, at: Date.now() };
  me.p = api(Object.assign({ _nen: 1, action: action, routeId: s.id, label: s.code, date: isoDate() }, extra || {}), ms).then(function (res) {
    res._key = key; me.cho = false;
    if (NAP[action] === me) NAP_LUU[action](res);
    return res;
  }, function (e) { if (NAP[action] === me) delete NAP[action]; throw e; });
  NAP[action] = me; ovCards();
  return me.p;
}
function napBo(list) { list.forEach(function (a) { delete NAP[a]; }); }
function moXem(mode, action, cho, ve, extra, ms) {
  const s = sel(); if (thieuSel(s)) return;
  const id = ++VIEW_ID;
  MODE = mode; $('out').innerHTML = ''; $('stats').innerHTML = ''; msg(cho); syncView();
  nap(action, s, extra, ms).then(function (res) { ovCards(); if (id === VIEW_ID) ve(res, s); },
    function (e) { ovCards(); if (id === VIEW_ID) msg('❌ ' + e.message, 'err'); });
}
// Tải ngầm giờ chạy + lệnh để các ô có số và màn Tổng quan ghép được theo xe
function ovNen() {
  const s = sel(); if (!s.id || !isoDate()) return;
  const xong = function () { ovCards(); if (MODE === 'ov') renderOv(); };
  LV_LOI = '';
  nap('load', s).then(xong, function (e) { ovCards(); if (MODE === 'ov') msg('❌ ' + e.message, 'err'); });
  nap('lvc', s, null, 180000).then(xong, function () { LV_LOI = s.id + '|' + isoDate(); xong(); });
}
function ovThe(id, n, sub, muc) { $('n' + id).textContent = n; $('s' + id).textContent = sub; $('btn' + id).dataset.m = muc || ''; }
function ovCards() {
  const key = curKey(), co = x => x && x._key === key && key, cho = a => NAP[a] && NAP[a].key === key && NAP[a].cho;
  if (co(DATA)) {
    const st = DATA.stats, nDx = DATA.missed.filter(isDx).length, nMat = DATA.missed.length - nDx, x = ovXe().filter(b => b.diem).length;
    ovThe('Ov', x, x ? 'xe cần xử lý' : 'không có việc', x ? 'bad' : 'ok');
    ovThe('Load', st.warn, st.warn ? 'lỗi / ' + st.total + ' chuyến' : st.total + ' chuyến đúng', st.warn ? 'bad' : 'ok');
    ovThe('Gps', nMat, nDx ? '+ ' + nDx + ' đề xuất' : nMat ? 'chụp GPS' : 'không có', nMat ? 'bad' : nDx ? 'warn' : 'ok');
  } else {
    const c = cho('load');
    ovThe('Ov', c ? '…' : '–', c ? 'đang tải' : 'xe cần xử lý'); ovThe('Load', c ? '…' : '–', c ? 'đang tải' : 'chuyến lỗi'); ovThe('Gps', c ? '…' : '–', c ? 'đang tải' : 'chụp GPS');
  }
  if (co(LV)) {
    const bad = LV.rows.filter(r => r.level === 'bad').length, cb = LV.rows.filter(r => r.level === 'warn').length;
    ovThe('Lvc', bad + cb, bad || cb ? bad + ' lỗi · ' + cb + ' cảnh báo' : LV.rows.length + ' lệnh đạt', bad ? 'bad' : cb ? 'warn' : 'ok');
  } else ovThe('Lvc', cho('lvc') ? '…' : '–', cho('lvc') ? 'đang kiểm tra' : LV_LOI === key && key ? 'lỗi, bấm thử lại' : 'bấm để kiểm tra');
  if (co(EB)) { const n = EB.results.filter(r => catOf(r.loai) !== 'ok').length; ovThe('Ebms', n, n ? 'dòng cần xem' : 'khớp hết', n ? 'bad' : 'ok'); }
  else ovThe('Ebms', cho('ebms') ? '…' : '–', cho('ebms') ? 'đang so sánh' : 'bấm để so sánh');
  if (co(NV)) ovThe('Nv', NV.stats.total, 'nhân viên'); else ovThe('Nv', cho('nv') ? '…' : '–', cho('nv') ? 'đang trích xuất' : 'bấm để trích xuất');
}

// ===== TỔNG QUAN: ghép giờ chạy + mất chuyến + lệnh theo TỪNG XE, xe nặng nhất lên đầu. Bấm 1 xe = xem chuyến của xe đó, ô biển số điền sẵn để ⚡ / ✍️ =====
const plateK = x => String(x || '').toUpperCase().replace(/[^0-9A-Z]/g, '');
function ovXe() {
  const key = curKey(), m = new Map(), lv = LV && LV._key === key ? LV : null;
  const lay = function (x) {
    const k = plateK(x); if (!k) return null;
    if (!m.has(k)) m.set(k, { xe: x, n: 0, red: 0, yellow: 0, green: 0, purple: 0, mat: 0, dx: 0, lenh: [] });
    return m.get(k);
  };
  DATA.rows.forEach(function (r) { const b = lay(r.xe); if (!b) return; b.n++; WHY_KEYS.forEach(function (k) { if (r.k.indexOf(k) !== -1) b[k]++; }); });
  DATA.missed.forEach(function (t) { const b = lay(t.xe); if (b) { if (isDx(t)) b.dx++; else b.mat++; } });
  if (lv) lv.rows.forEach(function (r) { const b = lay(r.xe); if (b) b.lenh.push(r); });
  const list = Array.from(m.values());
  list.forEach(function (b) {
    b.bad = b.lenh.filter(r => r.level === 'bad').length; b.cb = b.lenh.filter(r => r.level === 'warn').length;
    b.diem = b.bad * 100 + b.mat * 50 + b.red * 10 + b.cb * 5 + b.yellow + b.green + b.purple + b.dx;
  });
  return list.sort((a, b) => b.diem - a.diem || String(a.xe).localeCompare(String(b.xe)));
}
function renderOv() {
  const key = curKey();
  $('stats').innerHTML = '';
  if (!DATA || DATA._key !== key) { $('out').innerHTML = ''; return; }
  if (!$('msg').className) msg('');
  const lv = LV && LV._key === key ? LV : null, q = plateK($('q').value);
  const all = ovXe().filter(b => !q || plateK(b.xe).indexOf(q) !== -1), viec = all.filter(b => b.diem), sach = all.filter(b => !b.diem);
  const gio = b => ['red', 'yellow', 'green', 'purple'].filter(k => b[k]).map(k => '<span class="ov-c ov-' + k + '">' + b[k] + '</span>').join('') || '<span class="ov-ok">✓</span>';
  const mat = b => (b.mat ? '<span class="pill p-mat">' + b.mat + ' mất</span> ' : '') + (b.dx ? '<span class="pill p-dx">' + b.dx + ' đề xuất</span>' : '') || '<span class="ov-ok">✓</span>';
  const lenh = function (b) {
    if (!lv) return '<span class="muted">' + (LV_LOI === key ? 'chưa đọc được' : '…') + '</span>';
    if (!b.lenh.length) return '<span class="muted">không có lệnh</span>';
    const x = b.lenh.filter(r => r.level === 'bad')[0] || b.lenh.filter(r => r.level === 'warn')[0];
    if (!x) return '<span class="ov-ok">✓</span>';
    return (x.level === 'bad' ? '🔴 ' : '🟠 ') + esc(x.loi[0] || x.cb[0] || '') + (x.loi.length + x.cb.length > 1 ? ' <span class="muted">+' + (x.loi.length + x.cb.length - 1) + '</span>' : '');
  };
  let out = '';
  if (viec.length) out += '<table class="ov"><thead><tr><th>Xe</th><th>Chuyến</th><th>Giờ chạy</th><th>Mất chuyến</th><th>Lệnh</th></tr></thead><tbody>' +
    viec.map(b => '<tr class="ov-r" data-xe="' + esc(b.xe) + '"><td><button type="button" class="ov-xe">' + esc(b.xe) + '</button></td><td>' + b.n + '</td><td>' + gio(b) + '</td><td>' + mat(b) + '</td><td class="notes">' + lenh(b) + '</td></tr>').join('') + '</tbody></table>';
  else if (all.length) out += '<div class="panel-note ok">✅ Không có xe nào cần xử lý.</div>';
  else out += '<div class="panel-note">Không có xe nào.</div>';
  if (sach.length && viec.length) out += '<details class="more" data-k="ov-sach"><summary>✅ ' + sach.length + ' xe không có gì cần xử lý</summary><div class="ov-list">' + sach.map(b => esc(b.xe)).join(' · ') + '</div></details>';
  setOut(out);
}
$('out').addEventListener('click', function (ev) {
  const r = ev.target.closest && ev.target.closest('tr[data-xe]');
  if (!r || MODE !== 'ov') return;
  $('plate').value = r.dataset.xe;
  $('btnLoad').click();
  $('q').value = r.dataset.xe;   // đặt sau click: nút đổi màn tự xoá ô lọc
});

$('btnOv').onclick = function () {
  const s = sel(); if (thieuSel(s)) return;
  ++VIEW_ID; MODE = 'ov'; syncView();
  if (!DATA || DATA._key !== curKey()) { $('out').innerHTML = ''; $('stats').innerHTML = ''; msg('Đang tải...'); }
  else msg('');
  ovNen(); renderOv();
};
$('btnLoad').onclick = function () {
  moXem('trips', 'load', 'Đang tải...', function (res, s) {
    CUR = s;
    const nMat = res.missed.filter(m => !isDx(m)).length;
    msg((res.stats.warn || nMat ? '⚠️ ' : '✅ ') + (res.stats.warn ? res.stats.warn + '/' + res.stats.total + ' chuyến có lỗi' : 'Không có chuyến nào lỗi giờ (' + res.stats.total + ' chuyến)') +
      (nMat ? ' · ' + nMat + ' mất chuyến' : ''), res.stats.warn || nMat ? 'warn' : 'ok'); render();
  });
};

$('q').oninput = $('onlyWarn').onchange = function () { rerender(); };

// ===== SO SÁNH EBMS =====
let EB = null, MODE = 'none';
let NV = null;
let LV = null;
let BT = null;
let GP = null;
let UD = null; // màn Hoàn tác
let KY = null; // màn Điều hành ký
let C2 = null; // màn Ca 2 tự động
function rerender() {
  if (MODE === 'ebms' && EB) renderEbms();
  else if (MODE === 'nv' && NV) renderNv();
  else if (MODE === 'lvc' && LV) renderLvc();
  else if (MODE === 'auto') { if (AU) renderAuto(); }
  else if (MODE === 'bt' && BT) renderBt();
  else if (MODE === 'gps' && GP) renderGps();
  else if (MODE === 'undo') { if (UD) renderUndo(); }
  else if (MODE === 'ky') { if (KY) renderKy(); }
  else if (MODE === 'ca2') { if (C2) renderCa2(); }
  else if (MODE === 'lap') { if (window.renderLap) window.renderLap(); }
  else if (MODE === 'trips' && DATA) render();
  else if (MODE === 'ov') renderOv();
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
  moXem('ebms', 'ebms', 'Đang so sánh EBMS (có thể mất 20-40 giây)...', function (res) {
    if (!res.results) throw new Error('Server chưa có action "ebms". Thêm dòng router vào Web.gs, dán Ebms.gs, rồi Deploy lại BẢN MỚI.');
    const nLech = res.results.filter(r => catOf(r.loai) !== 'ok').length;
    msg((nLech ? '⚠️ ' + nLech + ' dòng cần xem' : '✅ Tất cả khớp') + ' (PC ' + res.pcCount + ' · EBMS ' + res.ebmsCount + (res.gps ? ' · 🛰 ' + res.gps : '') + ')', nLech ? 'warn' : 'ok');
    renderEbms();
  }, null, 180000);
};

function renderEbms() {
  const cnt = { ok: 0, warn: 0, plan: 0, nopc: 0, noebms: 0 };
  EB.results.forEach(function (r) { const c = catOf(r.loai); if (cnt[c] != null) cnt[c]++; });
  $('stats').innerHTML = statHtml([['Tất cả', EB.results.length, '', 'all'], ['Cần xem', EB.results.length - cnt.ok, 'e-warn', 'canxem'], ['Lệch giờ', cnt.warn + cnt.plan, 'e-warn', 'lech'],
    ['Thiếu phân công', cnt.nopc, 'e-nopc', 'nopc'], ['Thiếu EBMS', cnt.noebms, 'e-noebms', 'noebms'], ['Khớp', cnt.ok, 'e-ok', 'ok']].filter(x => x[1] || x[3] === 'all'));

  const q = $('q').value.trim().toLowerCase();
  const hit = c => !FIL || FIL === 'all' || FIL === c || (FIL === 'canxem' && c !== 'ok') || (FIL === 'lech' && (c === 'warn' || c === 'plan'));
  let html = '';
  EB.results.forEach(function (r) {
    const c = catOf(r.loai);
    if (!hit(c)) return;
    const f = [r.loai, r.khDi, r.khDen, r.khXe, r.thXe, r.thDi, r.thDen, r.benDau, r.trangThaiEBMS, r.lichChayPC, r.xePC, r.benXuatPhatPC,
      r.gioDiPC, r.gioDenPC, r.chenhLechDi, r.chenhLechDen, r.gpsDi || '', r.gpsVe || '', r.pcGps || '', r.ebGps || '', r.soBen];
    if (q && (f.join(' ') + ' ' + r.ghi).toLowerCase().indexOf(q) === -1) return;
    // "Ghi chú" (lý do lệch) để ngay sau cột Loại cho khỏi kéo ngang tới cuối bảng
    html += '<tr class="e-' + c + '"><td>' + esc(f[0]) + '</td><td class="notes">' + esc(r.ghi) + '</td>' + f.slice(1).map(v => '<td>' + esc(v) + '</td>').join('') + '</tr>';
  });
  const heads = ['Loại', 'Ghi chú', 'KH Đi', 'KH Đến', 'KH Xe', 'TH Xe', 'TH Đi', 'TH Đến', 'Bến đầu', 'TT EBMS', 'Lịch chạy PC', 'Xe PC', 'Bến PC', 'Giờ đi PC', 'Giờ đến PC', 'Lệch Đi', 'Lệch Về',
    'GPS Đi', 'GPS Về', 'PC−GPS (đi/về)', 'EBMS−GPS (đi/về)', 'So bến'];
  $('out').innerHTML = '<table class="t-ebms"><thead><tr>' + heads.map(x => '<th>' + x + '</th>').join('') + '</tr></thead><tbody>' +
    (html || '<tr><td colspan="' + heads.length + '">' + emptyText() + '</td></tr>') + '</tbody></table>';
}

// ===== RENDER =====
const WHY_KEYS = ['red', 'yellow', 'green', 'purple'];

function render() {
  const st = DATA.stats, nDx = DATA.missed.filter(isDx).length;
  // 1 hàng duy nhất: số liệu + màu + lọc (bấm là chỉ xem loại đó). Loại nào bằng 0 thì không hiện.
  const nk = { red: 0, yellow: 0, green: 0, purple: 0 };
  DATA.rows.forEach(function (r) { WHY_KEYS.forEach(function (k) { if (r.k.indexOf(k) !== -1) nk[k]++; }); });
  $('stats').innerHTML = statHtml([['Tất cả', st.total, '', 'all'], ['Có cảnh báo', st.warn, 'e-warn', 'warn'],
    ['Đỏ · trễ, lệch ≥ 6 phút', nk.red, 'c-r', 'red'], ['Vàng · lệch 5 phút', nk.yellow, 'c-y', 'yellow'], ['Xanh · đi khác lịch', nk.green, 'c-g', 'green'], ['Tím · trùng giờ', nk.purple, 'c-p', 'purple'],
    ['Mất chuyến', st.missed - nDx, 'e-nopc', 'mat'], ['Đề xuất mất chuyến', nDx, 'e-warn', 'mat']].filter(x => x[1] || x[3] === 'all'));

  const q = norm($('q').value);
  const hit = r => !FIL || FIL === 'all' || FIL === 'mat' || (FIL === 'warn' ? !!r.k.join('') : r.k.indexOf(FIL) !== -1);
  let band = false, prev = null, html = '';
  DATA.rows.forEach(function (r) {
    if (r.xe !== prev) { band = !band; prev = r.xe; }
    if (q && norm(r.xe + ' ' + r.lich).indexOf(q) === -1) return;
    if (!hit(r)) return;
    const cells = r.t.map((v, i) => '<td class="' + r.k[i] + '"' + (r.n[i] ? ' title="' + esc(r.n[i]) + '"' : '') + '>' + esc(v) + '</td>').join('');
    const ch = r.chenh == null ? '' : (r.chenh > 0 ? '+' : '') + r.chenh + ' phút';
    html += '<tr class="' + (band ? 'bandB' : '') + '"><td>' + esc(r.xe) + '</td><td>' + esc(r.lich) + '</td>' + cells +
      '<td class="' + (r.k[1] === 'green' ? 'green' : '') + '">' + ch + '</td></tr>';
  });
  let out = '<table><thead><tr><th>Xe</th><th>Lịch chạy</th><th>Giờ điều xe</th><th>Giờ đi</th><th>Giờ đến</th><th>Giờ về bến</th><th>Chênh lệch giờ đi</th></tr></thead><tbody>' +
    (html || '<tr><td colspan="7">' + emptyText() + '</td></tr>') + '</tbody></table>';

  $('out').innerHTML = out;
}


// ===== TRÍCH XUẤT NHÂN VIÊN =====
(function () { const v = localStorage.getItem('nguoi_do'); if (v) $('nguoiDo').value = v; })();
// Ô "Người đo cồn" chỉ hiện ở màn Nhân viên: đổi tên là đổi luôn trong bảng + khi copy, khỏi trích xuất lại
$('nguoiDo').oninput = function () {
  const nd = $('nguoiDo').value.trim(); localStorage.setItem('nguoi_do', nd);
  if (MODE === 'nv' && NV) { NV.rows.forEach(function (r) { r.nguoiDo = nd; }); renderNv(); }
};

$('btnNv').onclick = function () {
  const nd = $('nguoiDo').value.trim(); localStorage.setItem('nguoi_do', nd);
  moXem('nv', 'nv', 'Đang trích xuất nhân viên...', function (res, s) {
    if (!res.rows) throw new Error('Server chưa có action "nv". Thêm dòng router vào Web.gs, dán Nv.gs, rồi Deploy lại BẢN MỚI.');
    res.tuyen = s.code;
    if (res.conCho && !res._conDa) { res._conDa = true; nvCon(s, res); }   // link đo cồn chưa có sẵn: tải ngầm, không bắt chờ danh sách nhân viên
    msg('✅ ' + res.stats.total + ' nhân viên (từ ' + res.tripCount + ' chuyến)', 'ok');
    renderNv();
  }, { nguoiDo: nd });
};

// Link file đo cồn (máy chủ mở file tổng rất chậm, 20 giây – 5 phút): tải NGẦM sau khi đã hiện nhân viên, không khoá nút.
// Xong thì vẽ lại nút "📝 Nhập đo cồn" nếu vẫn đang xem đúng bảng nhân viên đó.
function nvCon(s, nv) {
  nv.conLoading = true;
  api({ action: 'con', routeId: s.id, label: s.code, date: isoDate() }, 330000, 0).then(function (r) {
    nv.con = r.con || []; nv.conAll = r.conAll || nv.conAll;
  }).catch(function () { nv.conFail = true; })
    .then(function () { nv.conLoading = false; if (MODE === 'nv' && NV === nv) renderNv(); });
}

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
  const con = (NV.con || []).map(x => '<a class="link-btn" href="' + safeUrl(x.url) + '" target="_blank" rel="noopener">📝 Nhập đo cồn tuyến ' + esc(x.tuyen) + '</a>').join('') ||
    (NV.conLoading ? '<span class="edit-hint">⏳ Đang tìm file đo cồn của tuyến ' + esc(NV.tuyen || '') + '... (file tổng mở chậm, vẫn copy / làm việc khác được)</span>'
      : NV.conFail ? '<span class="edit-hint">Chưa lấy được link file đo cồn, bấm 👥 Trích xuất nhân viên lại sau ít phút.</span>'
      : NV.conAll ? '<span class="edit-hint">Chưa thấy file đo cồn của tuyến ' + esc(NV.tuyen || '') + ' trong tab DS.</span>' : '');
  const bar = con || NV.conAll ? '<div class="panel-bar"><div class="pb-left">' + con + '</div>' +
    (NV.conAll ? '<a class="link-btn soft" href="' + safeUrl(NV.conAll) + '" target="_blank" rel="noopener">📊 File tổng đo cồn</a>' : '') + '</div>' : '';
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
  moXem('lvc', 'lvc', 'Đang kiểm tra lệnh (có thể mất 20-40 giây)...', function (res) {
    if (!res.rows) throw new Error('Server chưa có action "lvc". Thêm dòng router vào Web.gs, dán Lvc.gs, rồi Deploy lại BẢN MỚI.');
    const nBad = res.rows.filter(r => r.level === 'bad').length, nCb = res.rows.filter(r => r.level === 'warn').length;
    if (res.rows.length) msg((nBad ? '🔴 ' : nCb ? '🟠 ' : '✅ ') + res.rows.length + ' lệnh' +
      (nBad || nCb ? ' · ' + nBad + ' lỗi, ' + nCb + ' cảnh báo' : ', tất cả đạt'), nBad || nCb ? 'warn' : 'ok');
    else msg('⚠️ Không có lệnh vận chuyển nào', 'err');
    renderLvc();
  }, null, 180000);
};

function renderLvc() {
  const c = { ok: 0, warn: 0, bad: 0 };
  LV.rows.forEach(function (r) { c[r.level]++; });
  $('stats').innerHTML = statHtml([['Tất cả', LV.rows.length, '', 'all'], ['Lỗi', c.bad, 'e-nopc', 'bad'], ['Cảnh báo', c.warn, 'e-warn', 'warn'], ['Đạt', c.ok, 'e-ok', 'ok']].filter(x => x[1] || x[3] === 'all'));

  const q = norm($('q').value);
  const tag = { ok: '✅ ĐẠT', warn: '🟠 CẢNH BÁO', bad: '🔴 LỖI' }, cls = { ok: 'e-ok', warn: 'e-warn', bad: 'e-nopc' };
  let html = '';
  // lỗi lên đầu, rồi cảnh báo, rồi đạt (giữ thứ tự cũ trong cùng mức)
  const ord = { bad: 0, warn: 1, ok: 2 };
  LV.rows.map((r, i) => [r, i]).sort((a, b) => (ord[a[0].level] - ord[b[0].level]) || (a[1] - b[1])).forEach(function (x) {
    const r = x[0];
    if (FIL && FIL !== 'all' && FIL !== r.level) return;
    if (q && norm([r.xe, r.code, r.lai, r.loi.join(' '), r.cb.join(' ')].join(' ')).indexOf(q) === -1) return;
    const notes = r.loi.map(x => '<div>❌ ' + esc(x) + '</div>').concat(r.cb.map(x => '<div>⚠️ ' + esc(x) + '</div>')).join('');
    html += '<tr class="' + cls[r.level] + '"><td>' + esc(r.xe) + '</td><td>' + esc(r.code) + '</td><td class="left">' + esc(r.lai) +
      '</td><td>' + (r.soChuyen == null ? '' : r.soChuyen) + '</td><td>' + tag[r.level] + '</td><td class="notes">' + notes + '</td></tr>';
  });
  $('out').innerHTML = '<table><thead><tr>' + ['Biển số', 'Mã lệnh', 'Lái xe', 'Số chuyến', 'Kết quả', 'Chi tiết'].map(x => '<th>' + x + '</th>').join('') +
    '</tr></thead><tbody>' + (html || '<tr><td colspan="6">' + emptyText() + '</td></tr>') + '</tbody></table>';
}

// ===== LỌC NHANH (bảng xe / EBMS / lệnh): bấm ô thống kê hoặc chú thích màu = chỉ xem loại đó, bấm lại = bỏ lọc =====
let FIL = '';
const FIL_TEN = { warn: 'có cảnh báo', red: 'màu đỏ', yellow: 'màu vàng', green: 'màu xanh lá', purple: 'trùng giờ (tím)', ok: 'đạt / khớp', lech: 'lệch giờ', nopc: 'thiếu phân công', noebms: 'thiếu EBMS', bad: 'lỗi', canxem: 'cần xem' };
function statHtml(list) { // [tên, số, class màu, khoá lọc]
  return list.map(x => '<div class="stat st-f ' + (x[2] || '') + (FIL === x[3] || (!FIL && x[3] === 'all') ? ' on' : '') + '" data-f="' + x[3] + '" role="button" tabindex="0" title="' +
    (x[3] === 'mat' ? 'Bấm để nhảy tới bảng mất chuyến' : 'Bấm để chỉ xem loại này, bấm lại để bỏ lọc') + '"><b>' + x[1] + '</b>' + x[0] + '</div>').join('');
}
function emptyText() {
  return FIL && FIL !== 'all' && FIL !== 'mat' ? 'Không có dòng nào ' + esc(FIL_TEN[FIL] || '') : ($('q').value.trim() ? 'Không có dòng nào khớp bộ lọc' : 'Không có dòng nào');
}
function setFil(f) {
  if (f === 'mat') { $('btnGps').click(); return; }   // mất chuyến xem chung với chụp GPS
  FIL = (f === 'all' || f === FIL) ? '' : f;
  rerender();
}
document.addEventListener('click', function (ev) {
  const b = ev.target.closest && ev.target.closest('#stats .st-f[data-f]');
  if (b && (MODE === 'trips' || MODE === 'ebms' || MODE === 'lvc')) setFil(b.dataset.f);
});
$('stats').addEventListener('keydown', function (ev) {
  const b = (ev.key === 'Enter' || ev.key === ' ') && ev.target.closest && ev.target.closest('.st-f[data-f]');
  if (b && (MODE === 'trips' || MODE === 'ebms' || MODE === 'lvc')) { ev.preventDefault(); setFil(b.dataset.f); }
});

// ===== 3 MỤC: 🚌 Tuyến (kiểm tra + chỉnh + ký) · 🌙 Tự động (ca 1, ca 2, về bến) · 🗂 Bảng tài (ghép + lập) =====
// Mỗi thẻ có màn kết quả riêng: đổi thẻ là cất màn cũ, hiện lại đúng màn của thẻ đó (không gọi lại máy chủ). Nhớ thẻ đang mở trên máy này.
let TAB = 'xem';
const TAB_OF = { ov: 'xem', trips: 'xem', ebms: 'xem', lvc: 'xem', nv: 'xem', gps: 'xem', auto: 'xem', undo: 'xem', ky: 'xem', ca2: 'ca', bt: 'bt', lap: 'lap' };
const TAB_VIEW = {};   // thẻ -> { mode, m, c, at, ro }: màn + dòng thông báo + giờ dữ liệu đang có
function viewCat() {
  TAB_VIEW[TAB] = { mode: TAB_OF[MODE] === TAB && $('out').children.length ? MODE : '', m: $('msg').className ? $('msg').textContent : '', c: $('msg').className, at: $('dataAt').textContent, ro: LAST_RO };
}
function viewHien(t) {
  const v = TAB_VIEW[t] || {};
  $('q').value = ''; $('onlyWarn').checked = false;
  $('dataAt').textContent = v.at || ''; LAST_RO = v.ro || null; $('btnFresh').hidden = !v.ro;
  $('msg').className = v.m ? v.c : ''; $('msg').textContent = v.m || '';
  if (v.mode) { MODE = v.mode; rerender(); }
  else { MODE = 'none'; $('out').innerHTML = ''; $('stats').innerHTML = ''; }
  syncView();
}
function setTab(t) {
  const btn = document.querySelector('.tab[data-tab="' + t + '"]');
  const want = t;
  if (!btn || btn.hidden) t = 'xem';   // thẻ Điều hành chưa mở khoá: tạm hiện thẻ Kiểm tra, vẫn nhớ thẻ muốn mở (mở khoá xong tự về lại)
  const doi = t !== TAB;
  if (doi) { viewCat(); VIEW_ID++; }
  TAB = t; document.body.dataset.tab = t;
  const chinh = t === 'lap' ? 'bt' : t;
  document.querySelectorAll('.tab').forEach(function (b) { const on = b.dataset.tab === (b.classList.contains('sub') ? t : chinh); b.classList.toggle('on', on); b.setAttribute('aria-selected', on); });
  document.querySelectorAll('.pane').forEach(function (p) { p.hidden = p.dataset.pane !== t; });
  $('btSub').hidden = $('tabLap').hidden || chinh !== 'bt';
  if (doi) viewHien(t);
  if (want === t) try { localStorage.setItem('web_tab', t); } catch (e) { /* bỏ qua */ }
  if (t === 'ca') setTimeout(openCa, 0);   // bấm là hiện màn luôn
  if (t === 'bt') setTimeout(openBt, 0);
  if (t === 'xem' && doi && !$('out').children.length && ROUTES.length) moDau();
}
document.querySelectorAll('.tab').forEach(function (b) { b.onclick = function () { setTab(b.dataset.tab); }; });
function tabDau() { try { const t = localStorage.getItem('web_tab') || 'xem'; return t === 'sua' || t === 'dh' ? 'xem' : t; } catch (e) { return 'xem'; } }
setTimeout(function () { syncView(); setTab(tabDau()); }, 0);   // đợi chạy hết file (các biến dùng khi đổi thẻ khai báo ở dưới)
document.body.dataset.tab = 'xem';
document.querySelectorAll('.pane').forEach(function (p) { p.hidden = p.dataset.pane !== 'xem'; });
document.querySelectorAll('.tab').forEach(function (b) { b.classList.toggle('on', b.dataset.tab === 'xem'); });

// ===== TÍNH NĂNG ẨN: ĐIỀU HÀNH =====
// Mở khoá: bấm 5 lần liên tiếp vào biểu tượng 🚌 ở đầu trang, nhập EDIT_KEY. Mã được server kiểm tra (không chỉ ẩn nút).
function getEkey() { try { return localStorage.getItem('edit_key') || ''; } catch (e) { return ''; } }
function setUnlocked(on) {
  $('btnKy').hidden = !on; $('tabLap').hidden = !on; $('meDh').hidden = !on;   // mở khoá = hiện thêm ✍️ Ký, 🅿️ Về bến, 📅 Lập bảng tài; khoá lại ở khung tài khoản
  $('btSub').hidden = !on || (TAB !== 'bt' && TAB !== 'lap');
  if (on) { if (TAB === 'ca' && C2) vebenCall({}, true); return; }
  if (TAB === 'lap') setTab('bt');
  delete TAB_VIEW.lap; VB = null; KY = null;
  if (MODE === 'ky') { MODE = 'none'; $('out').innerHTML = ''; $('stats').innerHTML = ''; }
  if (MODE === 'ca2' && C2) renderCa2();
}
function tryUnlock(ekey, silent) {
  return api({ action: 'editauth', ekey: ekey }, 30000, 1).then(function () {
    localStorage.setItem('edit_key', ekey); setUnlocked(true);
    if (!silent) msg('🔓 Đã mở: ✍️ Ký, 🅿️ Về bến, 📅 Lập bảng tài', 'ok');
    else if (localStorage.getItem('web_tab') === 'lap') setTab('lap');
  }).catch(function (e) {
    if (silent) { if (!e.net && !e.login && !/tạm khoá/.test(e.message)) { localStorage.removeItem('edit_key'); setUnlocked(false); } return; } // chưa đăng nhập thì giữ mã
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
  $('btnLock').onclick = function () { localStorage.removeItem('edit_key'); setUnlocked(false); closeBox(); msg('🔒 Đã khoá lại', 'ok'); };
  if (getEkey() && (getSid() || !USER_MODE)) setTimeout(function () { tryUnlock(getEkey(), true); }, 800); // mã cũ còn đúng thì tự mở lại
})();

// (Đã bỏ phần sửa tay từng xe — ✏️ Sửa lệnh. Chỉ còn ⚡ Chỉnh theo luật.)

// ===== CHUYỂN NGÀY TRƯỚC / SAU =====
function shiftDay(n) {
  const v = isoDate(); if (!v) return;
  const p = v.split('-').map(Number), d = new Date(Date.UTC(p[0], p[1] - 1, p[2] + n));
  $('date').value = String(d.getUTCDate()).padStart(2, '0') + '/' + String(d.getUTCMonth() + 1).padStart(2, '0') + '/' + d.getUTCFullYear();
}
// Đổi ngày (‹ › hoặc gõ): tự xem lại việc đang mở (bấm liền nhiều lần chỉ chạy 1 lần)
let DAY_T = null, DAY_DA = isoDate();   // DAY_DA: ngày vừa xem, gõ lại đúng ngày đó thì thôi
function dayRerun() {
  clearTimeout(DAY_T);
  if (MODE === 'lap' && TAB === 'lap') { $('date').dispatchEvent(new Event('change')); return; } // 📅 Lập bảng tài: đổi ngày là xoay lại ngay (lapbt.js)
  DAY_T = setTimeout(function () { if (!document.body.classList.contains('is-busy')) rerunCurrent(); }, 700);
}
$('btnPrev').onclick = function () { shiftDay(-1); dayRerun(); };
$('btnNext').onclick = function () { shiftDay(1); dayRerun(); };
$('date').addEventListener('change', function () {   // gõ tay: đổi về đủ dd/mm/yyyy (gõ tắt 10/11 cũng được), rồi xem lại
  if (TAB === 'lap') return;   // lapbt.js tự xử
  const v = isoDate(); if (!v) return;
  $('date').value = v.split('-').reverse().join('/');
  if (v !== DAY_DA) dayRerun();
});

// ===== Ẩn / hiện đồ phụ theo màn đang xem: chỉ hiện thứ màn đó dùng tới =====
const CUR_BTN = { ov: 'btnOv', trips: 'btnLoad', ebms: 'btnEbms', lvc: 'btnLvc', gps: 'btnGps', nv: 'btnNv' };
function syncView() {
  const co = $('out').children.length > 0;
  document.body.dataset.mode = MODE;   // CSS ẩn/hiện ô "Chỉ dòng cần xem" theo màn đang xem
  $('toolbar').hidden = !co || MODE === 'ca2' || (MODE === 'bt' && !BT);
  $('btnCopy').style.display = co && ((MODE === 'bt' && BT) || MODE === 'nv') ? '' : 'none';
  $('btnXlsx').style.display = co && MODE === 'bt' && BT ? '' : 'none';
  $('ndBox').hidden = MODE !== 'nv';
  $('lvcRules').hidden = !co || MODE !== 'lvc';
  document.querySelectorAll('#actions .act').forEach(function (b) { b.classList.toggle('cur', b.id === CUR_BTN[MODE]); });
  $('q').placeholder = { gps: 'Lọc theo tuyến, xe, lịch, bến, tài xế...', undo: 'Lọc theo người lưu, tuyến, xe...', nv: 'Lọc theo tên, chức vụ...',
    auto: 'Lọc theo xe, mã chuyến, lịch...', bt: 'Tìm biển số xe...', ov: 'Tìm xe...' }[MODE] || 'Lọc theo xe, tên, bến...';
}
new MutationObserver(syncView).observe($('out'), { childList: true });

// ===== TỰ CHỈNH THEO LUẬT (gọi autoplan / autosave trong edit.gs) =====
// Hiện cùng nút "✏️ Sửa lệnh" sau khi mở khoá. Ô "Biển số xe" trống = cả tuyến; có biển = chỉ xe đó.
// Luật: cặp chuyến (trước, sau), đến >= lịch - 1p = quay đầu: về bến = đến, điều xe = đi = đến + 1p;
// ngược lại: về bến = đến + 1p, điều xe = lịch - 1p, đi = lịch. Đầu ngày: điều xe = lịch - 1p, đi = lịch.
// Cuối ngày: về bến = đến + 1p. Về bến trống (chưa xác nhận) để nguyên. Giờ đến không bao giờ đổi.
let AU = null;

// ⚡ Tự chỉnh dùng TÀI KHOẢN FUTA CỦA NGƯỜI BẤM: đăng nhập 1 lần -> máy chủ giữ phiên 6 giờ (không lưu mật khẩu), web nhớ mã phiên.
function getFs() { try { const v = localStorage.getItem('futa_fs') || ''; return /^[0-9a-f]{64}$/.test(v) ? v : ''; } catch (e) { return ''; } }
function setFs(r) {
  // đổi / thoát tài khoản: không để lại màn ca của người trước (ca đang bật trên máy chủ vẫn chạy)
  if (!r || r.futa !== localStorage.getItem('futa_user')) {
    C2 = null; ca2Mini(); delete TAB_VIEW.ca;
    if (MODE === 'ca2') { MODE = 'none'; $('out').innerHTML = ''; $('stats').innerHTML = ''; }
  }
  if (r) { localStorage.setItem('futa_fs', r.fs); localStorage.setItem('futa_user', r.futa); localStorage.setItem('futa_het', r.het || ''); }
  else ['futa_fs', 'futa_user', 'futa_het'].forEach(function (k) { localStorage.removeItem(k); });
  futaMe();
  if (!r && TAB === 'ca') caCanFuta();
}
function futaMe() {
  const u = localStorage.getItem('futa_user') || '';
  const on = !!(getFs() && u);
  $('meFuta').innerHTML = on ? 'FUTA <b>' + esc(u) + '</b> · giữ tới ' + esc(localStorage.getItem('futa_het') || '?') : 'Chưa đăng nhập FUTA';
  $('btnFutaOut').hidden = !getFs(); $('btnFutaIn').hidden = on;
}
// máy chủ Apps Script chưa dán bản 36 (không biết action futalogin -> trả "Web App đang chạy", không có mã phiên)
const MAY_CHU_CU = 'Máy chủ Apps Script CHƯA lên bản mới: dán đè user.gs, web.gs, edit.gs rồi Triển khai → Quản lý triển khai → ✏️ Sửa → Phiên bản mới → Triển khai.';

// ===== KHUNG NỔI: vào web lần đầu / đăng nhập FUTA / tài khoản =====
let FU_NEXT = null;   // việc chờ sau khi đăng nhập FUTA xong
function openBox(ten, khongDong) {
  document.querySelectorAll('#box [data-box]').forEach(function (el) { el.hidden = el.dataset.box !== ten; });
  $('boxX').hidden = !!khongDong;
  $('box').hidden = false;
}
function closeBox() { $('box').hidden = true; FU_NEXT = null; }
$('boxX').onclick = closeBox;
$('box').addEventListener('mousedown', function (ev) { if (ev.target === $('box') && !$('boxX').hidden) closeBox(); });
document.addEventListener('keydown', function (ev) { if (ev.key === 'Escape' && !$('box').hidden && !$('boxX').hidden) closeBox(); });

function openHello(loi) {
  $('hKey').value = getKey(); $('hWho').value = getWho(); $('hErr').textContent = loi ? '❌ ' + loi : '';
  openBox('hello', !!loi || !getKey() || !getWho());
  setTimeout(function () { (loi || !getKey() ? $('hKey') : $('hWho')).focus(); }, 50);
}
$('fHello').onsubmit = function (ev) {
  ev.preventDefault();
  const k = $('hKey').value.trim(), w = $('hWho').value.trim().slice(0, 60);
  if (!k) { $('hErr').textContent = '❌ Nhập mã truy cập'; return; }
  if (!w) { $('hErr').textContent = '❌ Nhập tên của bạn'; return; }
  localStorage.setItem('web_key', k); localStorage.setItem('web_who', w);
  closeBox(); setMe(ME); loadRoutes();
};
function openMe() { $('meName').textContent = getWho(); futaMe(); openBox('me'); }
$('btnChange').onclick = function () { openHello(); };

function futaForm(why, next) {
  FU_NEXT = next || null;
  $('fuWhy').textContent = why || ''; $('fuWhy').hidden = !why; $('fuErr').textContent = '';
  $('fuUser').value = localStorage.getItem('futa_user') || ''; $('fuPass').value = '';
  openBox('futa');
  setTimeout(function () { ($('fuUser').value ? $('fuPass') : $('fuUser')).focus(); }, 50);
}
$('fFutaIn').onsubmit = function (ev) {
  ev.preventDefault();
  const u = $('fuUser').value.trim(), pw = $('fuPass').value;
  if (!u || !pw) { $('fuErr').textContent = '❌ Nhập đủ tài khoản và mật khẩu FUTA'; return; }
  $('fuErr').textContent = ''; $('fuBtn').disabled = true; $('fuBtn').textContent = 'Đang đăng nhập...';
  apiPost({ action: 'futalogin', futaUser: u, futaPass: pw }, 60000).then(function (r) {
    $('fuPass').value = '';
    if (!r.fs) throw new Error(MAY_CHU_CU);
    setFs(r);
    const next = FU_NEXT; closeBox();
    if (next) next(); else msg('✅ Đã đăng nhập FUTA ' + r.futa, 'ok');
  }).catch(function (e) { $('fuErr').textContent = '❌ ' + e.message; })
    .then(function () { $('fuBtn').disabled = false; $('fuBtn').textContent = 'Đăng nhập'; });
};
$('btnFutaIn').onclick = function () { futaForm(''); };
$('btnFutaOut').onclick = function () {
  const fs = getFs(); setFs(null); closeBox();
  if (fs) api({ action: 'futalogout', fs: fs }, 30000, 0).catch(function () {});
  msg('Đã đăng xuất FUTA trên máy này.', 'ok');
};
futaMe();
if (getFs()) setTimeout(function () { ca2Call({}, true); }, 1500);   // đọc trạng thái ca của tài khoản này để hiện dòng nhỏ dưới nút
if (getFs()) setTimeout(function () {   // phiên còn sống không (máy chủ giữ 6 giờ)
  api({ action: 'futame', fs: getFs() }, 30000, 0).then(function (r) { if (!r.futa) setFs(null); }).catch(function () {});
}, 1200);

$('btnAuto').onclick = function () {
  if (!getFs()) { futaForm('', function () { autoPlan(''); }); return; }
  autoPlan('');
};

function autoPlan(prefix) {
  const s = sel();
  if (thieuSel(s)) return Promise.resolve();
  const plate = $('plate').value.trim().toUpperCase();
  $('btnAuto').disabled = true;
  msg((prefix ? prefix + '\n' : '') + 'Đang tính ' + (plate ? 'xe ' + plate : 'tuyến ' + s.code) + ' theo luật (chưa ghi gì)...');
  $('out').innerHTML = ''; $('stats').innerHTML = '';
  return api({ action: 'autoplan', fs: getFs(), routeId: s.id, label: s.code, date: isoDate(), plate: plate }, 180000).then(function (res) {
    if (!res.stats) throw new Error('Server chưa có action "autoplan". Dán edit.gs mới, thêm router vào web.gs, rồi Deploy lại BẢN MỚI.');
    AU = res; AU.sel = s; MODE = 'auto';
    renderAuto();
    const st = res.stats;
    msg((prefix ? prefix + '\n' : '') + (st.sua ? 'Sẽ sửa ' + st.sua + ' chuyến, chưa ghi gì.' : '✅ Không còn gì cần sửa.') +
      (st.canXem ? ' ' + st.canXem + ' chuyến cần xem.' : '') + (st.loi ? ' ' + st.loi + ' lỗi.' : ''), st.canXem || st.loi ? 'warn' : 'ok');
  }).catch(function (e) {
    if (e.futaLogin) { setFs(null); futaForm(e.message, function () { autoPlan(prefix); }); return; }
    if (/Sai mã mở khoá/.test(e.message)) { msg('❌ ' + MAY_CHU_CU, 'err'); return; }
    msg((prefix ? prefix + '\n' : '') + '❌ ' + e.message, 'err');
  }).then(function () { $('btnAuto').disabled = false; });
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
    out += '<div class="panel-note ok">✅ Đã lưu lên FUTA và kiểm khớp.</div>';
  } else if (AU.planId) {
    out += '<div class="edit-bar"><button class="edit-btn big" data-auto="save">💾 Lưu ' + st.sua + ' chuyến</button>' +
      '<span class="edit-hint">Lưu xong vẫn ↩️ Hoàn tác được tới 23:55.</span></div>';
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
  // Không hỏi lại: bảng xem trước đã là bước xác nhận, lưu xong có thanh ↩️ Hoàn tác ngay bên trên
  $('out').querySelectorAll('button').forEach(function (x) { x.disabled = true; });
  $('btnAuto').disabled = true;
  msg('Đang lưu ' + AU.stats.sua + ' chuyến (có thể mất 1-3 phút, đừng đóng trang)...');
  const au = AU;
  api({ action: 'autosave', fs: getFs(), planId: au.planId, label: au.sel.code, date: String(au.ngay || '').split('/').reverse().join('-') }, 360000, 0).then(function (r) {
    napBo(['load', 'lvc']); ovNen();   // giờ đã đổi: cập nhật số trên các ô
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
  }).catch(function (e) {
    $('btnAuto').disabled = false;
    if (e.futaLogin) { setFs(null); futaForm(e.message, function () { autoPlan(''); }); return; }
    msg('❌ ' + e.message, 'err');
  });
});

// ===== ĐIỀU HÀNH KÝ XÁC NHẬN (gọi kyplan / kysave trong ky.gs) =====
// = mở chi tiết lệnh trên FUTA, bấm "Điều hành ký xác nhận" rồi "Đồng ý". KHÔNG đẩy lệnh. Ký rồi KHÔNG gỡ được.
// Chỉ ký lệnh đã edit xong (không còn chuyến cần Tự chỉnh / chuyến FUTA báo sai giờ), đủ giờ về bến, sau giờ về bến chuyến cuối.
// Ô "Biển số xe" trống = cả tuyến; có biển = chỉ xe đó.
$('btnKy').onclick = function () { kyPlan(''); };
$('plate').onkeydown = function (e) { if (e.key === 'Enter') { e.preventDefault(); $('btnAuto').click(); } };

function kyPlan(prefix) {
  const s = sel();
  if (thieuSel(s)) return Promise.resolve();
  const plate = $('plate').value.trim().toUpperCase();
  $('btnKy').disabled = true;
  msg((prefix ? prefix + '\n' : '') + 'Đang đọc lệnh ' + (plate ? 'xe ' + plate : 'tuyến ' + s.code) + ' (chưa ký gì)...');
  $('out').innerHTML = ''; $('stats').innerHTML = '';
  return api({ action: 'kyplan', ekey: getEkey(), routeId: s.id, label: s.code, date: isoDate(), plate: plate }, 180000).then(function (res) {
    if (!res.stats) throw new Error('Server chưa có action "kyplan". Dán ky.gs + web.gs + user.gs mới, rồi Deploy lại BẢN MỚI.');
    KY = res; KY.sel = s; MODE = 'ky';
    renderKy();
    const st = res.stats;
    msg((prefix ? prefix + '\n' : '') + (st.kyDuoc ? st.kyDuoc + ' lệnh ký được' + (prefix ? '.' : ', chưa ký gì.') : 'Không còn lệnh nào ký được lúc này.'), st.chuaDuoc ? 'info' : 'ok');
  }).catch(function (e) { msg((prefix ? prefix + '\n' : '') + '❌ ' + e.message, 'err'); })
    .then(function () { $('btnKy').disabled = false; });
}

function renderKy() {
  const st = KY.stats;
  $('stats').innerHTML = [['Lệnh', st.lenh, ''], ['Ký được', st.kyDuoc, 'e-ok'], ['Đã ký', st.daKy, ''], ['Chưa ký được', st.chuaDuoc, 'e-nopc']]
    .map(function (x) { return '<div class="stat ' + x[2] + '"><b>' + x[1] + '</b>' + x[0] + '</div>'; }).join('');
  const q = $('q').value.trim().toLowerCase(), only = $('onlyWarn').checked;
  let out = '';
  if (KY.result) {
    const r = KY.result, bad = r.failed.concat(r.verifyBad, r.skipped);
    out += '<div class="panel-note ' + (bad.length || r.stopped ? 'err' : 'ok') + '">' + (bad.length || r.stopped ? '⚠️ ' : '✅ ') +
      'Đã ký ' + r.signed.length + ' lệnh và đọc lại thấy chữ ký điều hành' + (r.stopped ? ' · DỪNG, còn ' + r.stopped + ' lệnh chưa ký' : '') +
      bad.map(function (x) { return '<div>' + esc(x) + '</div>'; }).join('') + '</div>';
  } else if (KY.kyId) {
    out += '<div class="edit-bar"><button class="edit-btn big" data-ky="save">✍️ Ký ' + st.kyDuoc + ' lệnh</button>' +
      '<span class="edit-hint">Ký rồi không gỡ được.</span></div>';
  }
  if (st.chuaDuoc && KY.rows.some(function (v) { return v.lyDo.some(function (x) { return /Tự chỉnh/.test(x); }); }))
    out += '<div class="ord-warn"><div>⚠️ Có lệnh chưa chỉnh xong: bấm ⚡ Chỉnh lệnh, lưu xong ký lại.</div></div>';
  let body = '';
  KY.rows.forEach(function (v) {
    const state = v.daKy ? 'da' : v.ok ? 'ok' : 'chua';
    if (only && state !== 'chua') return;
    if (q && [v.xe, v.code, v.lai, v.lyDo.join(' ')].join(' ').toLowerCase().indexOf(q) === -1) return;
    const tag = { da: '✔ Đã ký', ok: '✅ Ký được', chua: '🔴 Chưa ký được' }[state];
    const notes = (state === 'da' ? [] : v.lyDo.map(function (x) { return '<div>❌ ' + esc(x) + '</div>'; }))
      .concat(v.canhBao.map(function (x) { return '<div>⚠️ ' + esc(x) + '</div>'; })).join('');
    body += '<tr class="' + (state === 'ok' ? 'e-ok' : state === 'chua' ? 'e-nopc' : '') + '"><td>' + esc(v.xe) + '</td><td>' + esc(v.code) + '</td><td class="left">' + esc(v.lai) +
      '</td><td>' + (v.soChuyen == null ? '' : v.soChuyen) + '</td><td>' + esc(v.cuoi) + '</td><td>' + tag + (v.daKy ? '<br><small>' + esc(v.daKy) + '</small>' : '') +
      '</td><td class="notes">' + notes + '</td></tr>';
  });
  out += '<table><thead><tr>' + ['Biển số', 'Mã lệnh', 'Lái xe', 'Số chuyến', 'Về bến cuối', 'Trạng thái', 'Lý do / ghi chú']
    .map(function (x) { return '<th>' + x + '</th>'; }).join('') + '</tr></thead><tbody>' +
    (body || '<tr><td colspan="7">Không có dòng nào</td></tr>') + '</tbody></table>';
  $('out').innerHTML = out;
}

$('out').addEventListener('click', function (ev) {
  const b = ev.target.closest && ev.target.closest('button[data-ky="save"]');
  if (!b || MODE !== 'ky' || !KY || !KY.kyId) return;
  const ok = KY.rows.filter(function (v) { return v.ok; });
  const late = ok.some(function (v) { return v.canhBao.length; });
  if (!confirm('Ký ' + ok.length + ' lệnh · tuyến ' + KY.sel.code + ' · ' + KY.ngay + '?\n' +
               (late ? 'Ký khác ngày vận chuyển: FUTA sẽ gắn cờ "ký lệnh trễ qua ngày".\n' : '') +
               'Ký rồi không gỡ được.\n\n' +
               ok.map(function (v) { return v.code; }).join('\n'))) return;
  $('out').querySelectorAll('button').forEach(function (x) { x.disabled = true; });
  $('btnKy').disabled = true;
  msg('Đang ký ' + ok.length + ' lệnh (mỗi lệnh kiểm lại trước khi ký, đừng đóng trang)...');
  const ky = KY;
  api({ action: 'kysave', ekey: getEkey(), kyId: ky.kyId, label: ky.sel.code, date: String(ky.ngay || '').split('/').reverse().join('-') }, 360000, 0).then(function (r) {
    napBo(['lvc']); ovNen();
    const bad = r.failed.length + r.verifyBad.length + r.skipped.length;
    const line = (bad || r.stopped ? '⚠️ ' : '✔ ') + 'Đã ký ' + r.signed.length + ' lệnh (' + r.elapsed + 's)' +
      (r.skipped.length ? ', bỏ qua ' + r.skipped.length : '') + (r.failed.length ? ', FUTA từ chối ' + r.failed.length : '') +
      (r.verifyBad.length ? ', ĐỌC LẠI LỆCH ' + r.verifyBad.length : '') + (r.stopped ? ', DỪNG còn ' + r.stopped + ' lệnh chưa ký' : '');
    ky.result = r;
    return kyPlan(line).then(function () { if (KY && KY !== ky) { KY.result = r; if (MODE === 'ky') renderKy(); } });
  }).catch(function (e) { msg('❌ ' + e.message, 'err'); $('btnKy').disabled = false; });
});

// ===== TỰ XÁC NHẬN XE VỀ BẾN (gọi veben trong veben.gs): thẻ thứ 3 ở màn 🌙 Tự động, chỉ hiện khi đã mở khoá =====
// Bật = quét + xác nhận ngay 1 lần, rồi máy chủ tự quét mỗi 1 giờ. Chỉ bấm chuyến đã Kết thúc + đã có giờ đến. Dùng chung ô chọn tuyến với ca.
let VB = null, VB_XEM = null;
const vebenCo = () => !$('tabLap').hidden && !!getEkey();
function vebenHen() { clearTimeout(VB_XEM); if (vebenCo()) VB_XEM = setTimeout(function () { if (MODE === 'ca2' && C2) vebenCall({}, true); }, 1000); }
function vebenCall(extra, bg) {
  if (!vebenCo()) return Promise.resolve();
  const xem = C2 && C2.pick ? Array.from(C2.pick).join(',') : '';
  const q = Object.assign({ action: 'veben', ekey: getEkey(), label: sel().code || '' }, xem ? { xem: xem } : {}, extra, bg ? { bg: '1' } : {});
  const ve = function (res) { if (!res.log) throw new Error('Server chưa có action "veben". Dán veben.gs + web.gs mới, rồi Deploy lại BẢN MỚI.'); VB = res; if (MODE === 'ca2' && C2) renderCa2(); };
  if (bg) return api(q, 120000, 1).then(ve).catch(function () { /* lỗi mạng: lần sau đọc lại */ });
  msg(extra.set === 'on' ? 'Đang bật và quét về bến lần đầu (có thể mất ~30 giây)...' : 'Đang tắt...');
  return api(q, 180000, 0).then(function (res) {
    ve(res);
    if (res.on && !res.lich) msg('⚠️ Chưa cài lịch nên chưa tự chạy: chạy veben_cai_dat() trong Apps Script', 'err');
    else msg(extra.set === 'on' ? '🟢 Đã bật về bến' : '⚪ Đã tắt về bến', 'ok');
  }).catch(function (e) { msg('❌ ' + e.message, 'err'); });
}
const VB_TEN = { xong: 'ĐÃ VỀ BẾN', veben: 'CHỜ XÁC NHẬN', chay: 'ĐANG CHẠY' };
// Công tắc bật / tắt: ns = 'vb' | 'c2', act = việc khi bấm
function swHtml(on, ns, act, ten) {
  return '<button type="button" class="sw' + (on ? ' on' : '') + '" role="switch" aria-checked="' + on + '" data-' + ns + '="' + act + '"><i></i><span>' + (ten ? ten + (on ? ' đang bật' : ' đang tắt') : (on ? 'Đang bật' : 'Đang tắt')) + '</span></button>';
}
const cungTuyen = (a, set) => a.length === set.size && a.every(c => set.has(c));
// Phần về bến thu gọn dưới màn Tự động: xe chưa về + nhật ký
function vebenChiTiet() {
  if (!VB || !vebenCo()) return '';
  let out = '';
  if (VB.xe) {
    const dem = k => (VB.xe.routes || []).reduce(function (n, b) { return n + (((b.nhom || {})[k]) || []).length; }, 0);
    out += '<details class="more" data-k="vb-xe"><summary>🅿️ Xe chưa về bến · ' + dem('chay') + ' đang chạy · ' + dem('veben') + ' chờ xác nhận</summary>' +
      ca2Board(VB.xe, 'Xe theo tuyến', { ten: VB_TEN, gon: { xong: 1 }, head: b => ' · ' + (b.n || 0) + ' xe' }) + '</details>';
  }
  const body = VB.log.map(function (x) {
    return '<tr class="' + (x.kq === 'OK' ? '' : 'e-nopc') + '"><td>' + esc(x.at) + '</td><td>' + esc(x.tuyen) + '</td><td>' + esc(x.lich) + '</td><td>' + esc(x.xe) +
      '</td><td>' + esc(x.code) + '</td><td class="left">' + esc(x.chieu) + '</td><td>' + esc(x.di) + '</td><td>' + esc(x.den) + '</td><td>' + esc(x.ve || '') + '</td><td class="notes">' + esc(x.kq) + '</td></tr>';
  }).join('');
  return out + '<details class="more" data-k="vb-log"><summary>📜 Nhật ký về bến' + (VB.last ? ' · quét gần nhất ' + esc(VB.last.at) : '') + '</summary>' +
    (VB.last ? '<div class="panel-note">' + esc((VB.last.sum || []).join(' | ') || 'không có tuyến') + '</div>' : '') +
    '<div class="tb-x"><table><thead><tr>' + ['Lúc bấm', 'Tuyến', 'Lịch', 'Xe', 'Mã chuyến', 'Chiều', 'Đi', 'Đến', 'Về bến', 'Kết quả'].map(x => '<th>' + x + '</th>').join('') +
    '</tr></thead><tbody>' + (body || '<tr><td colspan="10">Chưa bấm chuyến nào</td></tr>') + '</tbody></table></div></details>';
}
$('out').addEventListener('click', function (ev) {
  const b = ev.target.closest && ev.target.closest('button[data-vb]');
  if (!b || MODE !== 'ca2' || !C2) return;
  if (b.getAttribute('data-vb') === 'off') { if (confirm('Tắt tự xác nhận về bến?')) vebenCall({ set: 'off' }); return; }
  const tuyen = Array.from(C2.pick || []).join(', ');
  if (!tuyen) { msg('❌ Chọn ít nhất 1 tuyến', 'err'); return; }
  if (!confirm('Bật tự xác nhận về bến cho tuyến ' + tuyen + '?\nĐã xác nhận thì không huỷ kết thúc chuyến được nữa.')) return;
  vebenCall({ set: 'on', tuyen: tuyen });
});

// ===== CA 2 TỰ ĐỘNG (gọi ca2 trong ca2.gs) — MỤC RIÊNG, không chung nhóm nút Sửa lệnh =====
// ☀️ Ca 1 (14:00): về bến + edit LỆNH CA 1 (mọi chuyến lịch trước 14:00) 1 lần, không ký. 🌙 Ca 2 ký từ 22:00: lệnh ca 1 không đỏ thì ký luôn, đỏ mới edit.
// Bật ca 1 / ca 2 = bật luôn 🅿️ tự xác nhận về bến (1 giờ/lần). Máy chủ quét: từ 22:00 mỗi 20 phút, từ 23:00 mỗi 10 phút, từ 23:30 mỗi 5 phút, từ 23:50 canh mỗi phút.
// Mỗi lượt: xác nhận về bến -> XE NÀO VỀ HẾT thì edit lệnh ca 2 (+ lệnh ca 1 bị đỏ) rồi ký; xe đang chạy để yên. Ký hết thì tự tắt.
const C2_NHOM = [['tre', 'c2-tre'], ['chay', 'c2-chay'], ['chua_chay', 'c2-chua'], ['veben', 'c2-veben'], ['xong', 'c2-xong'], ['seky', 'c2-xong'], ['loi', 'c2-loi'], ['ky', 'c2-ky']];
const C2_TEN = { seky: 'SẼ KÝ (xem thử)', loi: 'ĐÃ VỀ BẾN, chưa ký được' };
let C2_TIMER = null, C2_MOC = null, C2_DOI = false;   // C2_MOC: giờ quét đang sửa dở (màn tự cập nhật không làm mất); C2_DOI: người dùng vừa đổi tuyến, chưa lưu
RP.ca2 = { set: () => C2.pick, change: function () { C2_DOI = true; if (MODE === 'ca2' && C2) { renderCa2(); vebenHen(); } } };
document.addEventListener('input', function (ev) { if (ev.target.id === 'ca2Moc') C2_MOC = ev.target.value; });
// Bấm thẻ 🌙 Tự động: đã có màn thì hiện ngay rồi cập nhật ngầm, chưa có thì tải
function openCa() {
  if (TAB !== 'ca') return;
  if (C2 && getFs()) { MODE = 'ca2'; renderCa2(); ca2Call({}, true); vebenCall({}, true); return; }
  ca2Call({});
}
// Chưa đăng nhập FUTA mà đóng khung đăng nhập: để lại 1 nút cho khỏi bơ vơ
function caCanFuta() {
  MODE = 'none'; $('stats').innerHTML = ''; msg('');
  $('out').innerHTML = '<div class="cta"><button type="button" class="edit-btn big" data-fu="ca">🔑 Đăng nhập FUTA để dùng Tự động</button></div>';
}
$('out').addEventListener('click', function (ev) { if (ev.target.closest && ev.target.closest('button[data-fu="ca"]')) ca2Call({}); });

function ca2Call(extra, bg) {
  const op = extra.op || 'status';
  if (!bg) msg({ on1: 'Đang bật ca 1...', off1: 'Đang tắt ca 1...', xem1: 'Đang xem thử ca 1 (không ghi gì)...', on: 'Đang bật ca 2...', off: 'Đang tắt ca 2...', xem: 'Đang xem thử ca 2 (không ghi gì, có thể mất 1 phút)...',
                 run: 'Đang chạy 1 lượt (có thể mất 1–3 phút, đừng đóng trang)...' }[op] || 'Đang tải...');
  const fs = getFs();
  if (!fs) {   // ca chạy bằng FUTA của chính người bật: chưa đăng nhập thì đăng nhập trước
    if (!bg) { caCanFuta(); futaForm('', function () { ca2Call(extra); }); }
    return Promise.resolve();
  }
  return api(Object.assign({ action: 'ca2', fs: fs }, extra, bg ? { bg: '1' } : {}), op === 'run' || op === 'xem' || op === 'xem1' ? 360000 : 120000, op === 'status' ? 1 : 0)
    .then(function (res) {
      if (!res.moc || !res.chu) throw new Error('Máy chủ chưa lên bản 50: dán ca2.gs + web.gs + user.gs mới rồi Deploy lại BẢN MỚI.');
      const keep = C2 && C2.pick && op !== 'on' && op !== 'on1' ? C2.pick : null, keepXem = op === 'status' && C2 ? C2.xem : null, keepXem1 = op === 'status' && C2 ? C2.xem1 : null;
      C2 = Object.assign(res, { pick: keep }); if (keepXem && !C2.xem) C2.xem = keepXem; if (keepXem1 && !C2.xem1) C2.xem1 = keepXem1;
      if (op === 'on') C2_MOC = null;
      if (op === 'on' || op === 'on1') C2_DOI = false;
      if (bg && (MODE !== 'ca2' || (document.activeElement && document.activeElement.dataset && document.activeElement.dataset.rpInput))) { ca2Mini(); ca2Bao(); ca2Poll(); return; }   // đang ở màn khác / đang gõ thêm tuyến: chỉ cập nhật chấm báo + báo trễ
      MODE = 'ca2';
      renderCa2(); ca2Mini(); ca2Bao(); ca2Poll();
      if (!VB && vebenCo()) vebenCall({}, true);
      if (!bg) msg({ on1: '☀️ Đã bật ca 1', off1: '⚪ Đã tắt ca 1', xem1: '👀 Xem thử ca 1 xong, chưa ghi gì.',
                     on: '🌙 Đã bật ca 2, quét lần tới lúc ' + (res.sau || '—'), off: '⚪ Đã tắt ca 2', xem: '👀 Xem thử xong, chưa ghi gì.', run: '▶️ Đã chạy xong 1 lượt.' }[op] || '', 'ok');
    }).catch(function (e) {
      if (e.futaLogin) {   // hết phiên web 6 giờ: ca đã bật trên máy chủ vẫn chạy bằng phiên đã giữ
        setFs(null);
        if (!bg) futaForm('Hết phiên đăng nhập. Ca đang bật vẫn chạy trên máy chủ.', function () { ca2Call(extra); });
        return;
      }
      if (!bg) msg('❌ ' + e.message, 'err');
    });
}

// Màn Ca 2 đang mở + đang bật: tự hỏi trạng thái mỗi 60 giây (không khoá nút), có xe trễ mới thì kêu ting + thông báo
function ca2Poll() {
  clearTimeout(C2_TIMER);
  if (C2 && C2.on) C2_TIMER = setTimeout(function () { if (C2 && C2.on && !document.hidden) ca2Call({}, true); else ca2Poll(); }, MODE === 'ca2' ? 60000 : 120000);
}
function ca2Mini() {   // chấm xanh trên thẻ 🌙 Tự động khi có ca đang bật
  const on1 = !!(C2 && C2.ca1 && C2.ca1.on), on2 = !!(C2 && C2.on);
  $('caDot').hidden = !(on1 || on2);
  $('caDot').title = (on1 ? 'Ca 1 đang bật ' : '') + (on2 ? 'Ca 2 đang bật' : '');
}
function ca2Bao() {   // xe CHƯA XUẤT BẾN mới (so với lần trước trên máy này) -> ting + thông báo
  if (!C2 || !C2.board) return;
  let seen = []; try { seen = JSON.parse(localStorage.getItem('ca2_bao') || '[]'); } catch (e) { seen = []; }
  const moi = [];
  (C2.board.routes || []).forEach(function (b) {
    ((b.nhom || {}).tre || []).forEach(function (x) { const k = C2.ngay + ' ' + b.code + ' ' + x.replace(/\(trễ \d+ phút\)/, ''); if (seen.indexOf(k) < 0) { seen.push(k); moi.push(b.code + ' ' + x); } });
  });
  if (moi.length) { localStorage.setItem('ca2_bao', JSON.stringify(seen.slice(-100))); notifyDone('⚠️ Ca 2: xe CHƯA XUẤT BẾN', moi.join('\n')); }
}

// Bảng tình trạng xe theo nhóm, dùng chung cho 🌙 Ca 2 và 🅿️ Tự xác nhận về bến.
// o (tuỳ chọn): { ten: nhãn nhóm, head: b -> html sau "Tuyến X", gon: nhóm hiện gọn 1 dòng chữ }
function ca2Board(board, title, o) {
  if (!board || !board.routes) return '';
  o = o || {};
  const gon = o.gon || { ky: 1 };
  let out = '<div class="c2-board"><div class="c2-bhead">' + esc(title) + ' — lúc ' + esc(board.at || '') + (board.head ? ' · ' + esc(board.head) : '') + '</div>';
  board.routes.forEach(function (b) {
    const nh = b.nhom || {}, nKy = (nh.ky || []).length;
    out += '<div class="c2-route"><div class="c2-rhead"><b>Tuyến ' + esc(b.code) + '</b>' + (b.loi ? ' <span class="c2-loi-t">' + esc(b.loi) + '</span>'
      : o.head ? o.head(b) : ' · ' + (b.n || 0) + ' xe · <span class="c2-ok-t">đã ký ' + nKy + '</span>') + '</div>';
    C2_NHOM.forEach(function (g) {
      const list = nh[g[0]] || [];
      if (!list.length) return;
      const ten = (o.ten && o.ten[g[0]]) || C2_TEN[g[0]] || (C2 && C2.nhom && C2.nhom[g[0]]) || g[0];
      out += '<div class="c2-grp ' + g[1] + '"><span class="c2-tag">' + esc(ten) + ' ' + list.length + '</span>' +
        (gon[g[0]] ? '<span class="c2-list">' + esc(list.join(', ')) + '</span>' : list.map(function (x) { return '<span class="c2-chip">' + esc(x) + '</span>'; }).join('')) + '</div>';
    });
    out += '</div>';
  });
  return out + '</div>';
}

function renderCa2() {
  const nChua = (C2.board && C2.board.routes || []).reduce(function (n, b) {
    return n + ['tre', 'chay', 'chua_chay', 'veben', 'xong', 'loi'].reduce(function (m, k) { return m + ((b.nhom || {})[k] || []).length; }, 0);
  }, 0);
  const nTre = (C2.board && C2.board.routes || []).reduce(function (n, b) { return n + ((b.nhom || {}).tre || []).length; }, 0);
  const c1 = C2.ca1 || { on: false, tuyen: [], gio: '14:00' };
  $('stats').innerHTML = '';   // trạng thái đã nằm trên 2 thẻ ca, số xe nằm ở tiêu đề bảng tình trạng
  if (!C2.pick) C2.pick = new Set(C2.tuyen.length ? C2.tuyen : c1.tuyen.length ? c1.tuyen : (sel().code ? [sel().code] : []));
  let out = '';
  // Cảnh báo: chỉ hiện khi có chuyện
  if (!C2.lich) out += '<div class="panel-note err">⚠️ Máy chủ chưa cài lịch nên bật lên cũng không tự chạy. Báo người quản lý chạy hàm <b>ca2_cai_dat</b> 1 lần trong Apps Script.</div>';
  if (C2.stopKy === true) out += '<div class="panel-note err">⛔ FUTA từ chối ký nên ca 2 đã dừng ký cả buổi (vẫn về bến + chỉnh lệnh). Xem nhật ký, ký tay trên FUTA.</div>';
  else if (C2.stopKy && C2.stopKy.length) out += '<div class="panel-note err">⛔ FUTA từ chối ký 3 lần, ca 2 thôi ký: <b>' + esc(C2.stopKy.join(', ')) + '</b>. Ký tay trên FUTA, xe khác vẫn ký bình thường.</div>';
  if (nTre) out += '<div class="panel-note err">⏰ ' + nTre + ' xe quá lịch chưa xuất bến.</div>';
  const khac = [['Ca 1', (C2.chu || {}).ca1 || []], ['Ca 2', (C2.chu || {}).ca2 || []]].map(function (x) {
    const r = x[1].filter(function (e) { return !e.minh; });
    return r.length ? x[0] + ': ' + r.map(function (e) { return esc(e.tuyen) + ' (' + esc(e.ten) + ')'; }).join(', ') : '';
  }).filter(Boolean);
  if (khac.length) out += '<div class="panel-note">🔒 Người khác đang chạy, bạn không bật tắt được: ' + khac.join(' · ') + '</div>';

  // Chọn tuyến dùng chung cho 2 ca, bên dưới là 2 công tắc
  out += '<div class="gp-top">' + rpHtml('ca2', C2.pick, C2.tuyen.concat(c1.tuyen, sel().code ? [sel().code] : []), 'Tuyến') + '</div>';
  const caThe = function (o) {
    return '<div class="ca-card' + (o.on ? ' on' : '') + '"><div class="ca-h"><b>' + o.ten + '</b>' + swHtml(o.on, o.ns || 'c2', o.on ? o.tat : o.bat, '') + '</div>' +
      '<p>' + o.mo + '</p>' + (o.on ? '<p class="ca-tt">' + o.tt + '</p>' : '') +
      '<div class="ca-btns">' + (o.on && C2_DOI && !cungTuyen(o.tuyen, C2.pick) ? '<button type="button" class="edit-btn" data-' + (o.ns || 'c2') + '="' + o.bat + '">Lưu tuyến</button>' : '') +
      (o.xem ? '<button type="button" class="edit-btn soft" data-c2="' + o.xem + '">👀 Xem thử</button>' : '') + (o.them || '') + '</div></div>';
  };
  out += '<div class="ca-cards">' +
    caThe({ ten: '☀️ Ca 1', on: c1.on, bat: 'on1', tat: 'off1', xem: 'xem1', tuyen: c1.tuyen,
      mo: esc(c1.gio) + ' tự về bến và chỉnh lệnh ca 1. Không ký.', tt: 'Tuyến ' + esc(c1.tuyen.join(', ')) }) +
    caThe({ ten: '🌙 Ca 2', on: C2.on, bat: 'on', tat: 'off', xem: 'xem', tuyen: C2.tuyen,
      mo: 'Từ 22:00, xe về hết thì tự chỉnh lệnh rồi ký.', tt: 'Tuyến ' + esc(C2.tuyen.join(', ')) + ' · ' + (C2.sau ? 'quét tới ' + esc(C2.sau) : 'đang canh xe về'),
      them: C2.on ? '<button type="button" class="edit-btn soft" data-c2="run">▶️ Chạy ngay</button>' : '' }) +
    (VB && vebenCo() ? caThe({ ten: '🅿️ Về bến', ns: 'vb', on: VB.on, bat: 'on', tat: 'off', tuyen: VB.tuyen,
      mo: 'Mỗi 1 giờ tự xác nhận chuyến đã kết thúc, có giờ đến.', tt: 'Tuyến ' + esc(VB.tuyen.join(', ')) + (VB.sau ? ' · lượt sau ' + esc(VB.sau) : '') }) : '') + '</div>';

  if (C2.xem1) out += '<div class="ord-warn"><div><b>👀 Xem thử ca 1 (chưa ghi gì) · ' + esc(C2.xem1.at || '') + '</b></div>' +
    C2.xem1.sum.concat(C2.xem1.log).map(function (l) { return '<div>' + esc(l) + '</div>'; }).join('') + '</div>';
  if (C2.xem) {
    out += ca2Board({ at: C2.xem.at, routes: C2.xem.routes }, '👀 Xem thử ca 2 (chưa ghi gì)');
    if (C2.xem.log && C2.xem.log.length) out += '<div class="ord-warn">' + C2.xem.log.map(function (l) { return '<div>' + esc(l) + '</div>'; }).join('') + '</div>';
  }
  out += ca2Board(C2.board, '🚌 Tình trạng xe' + (nChua ? ' · ' + nChua + ' xe chưa ký' : ''));

  // Phần ít dùng: thu gọn
  const mocCuoi = C2.moc.length - 1;
  out += vebenChiTiet();
  out += '<details class="more" data-k="ca-log"><summary>📜 Nhật ký</summary><div class="c2-log">' +
    (C2.log.length ? C2.log.map(function (l) { return '<div class="' + (/✘|⚠️|⛔/.test(l) ? 'bad' : /✍️|✅/.test(l) ? 'good' : /⏰|LƯỢT/.test(l) ? 'head' : '') + '">' + esc(l) + '</div>'; }).join('') : '<div>Chưa có gì</div>') + '</div></details>';
  out += '<details class="more" data-k="ca-moc"><summary>⏱ Giờ quét ca 2</summary><div class="c2-cfg"><label for="ca2Moc">Các mốc cách nhau dấu phẩy. Từ 23:50 tự canh mỗi phút.</label>' +
    '<input type="text" id="ca2Moc" value="' + esc(C2_MOC != null ? C2_MOC : C2.moc.join(', ')) + '" autocomplete="off" spellcheck="false">' +
    '<div class="c2-mocs">' + C2.moc.map(function (m, i) {
      const done = C2.done.indexOf(m) >= 0, next = C2.on && m === C2.sau;
      return '<span class="c2-moc' + (done ? ' done' : '') + (next ? ' next' : '') + (i === mocCuoi ? ' last' : '') + '">' + (done ? '✓ ' : next ? '⏰ ' : '') + esc(m) + '</span>';
    }).join('') + '<span class="c2-now">bây giờ ' + esc(C2.bayGio || '') + '</span></div>' + (C2.on ? '<div><button type="button" class="edit-btn" data-c2="on">Lưu giờ quét</button></div>' : '') + '</div></details>';
  out += '<details class="more" data-k="ca-help"><summary>ℹ️ Ca chạy thế nào?</summary><ul class="more-ul">' +
    '<li>Chạy trên máy chủ bằng FUTA <b>' + esc(C2.futa || '') + '</b>, đóng web vẫn chạy. Máy chủ không lưu mật khẩu.</li>' +
    '<li>Tuyến bạn bật thì chỉ tài khoản này tắt được.</li>' +
    '<li>Trong lúc bật: mỗi 1 giờ tự xác nhận về bến.</li>' +
    '<li><b>Ca 1:</b> ' + esc(c1.gio) + ' về bến rồi chỉnh các lệnh có mọi chuyến trước ' + esc(c1.gio) + '. Không ký, chạy 1 lần rồi tự tắt.</li>' +
    '<li><b>Ca 2:</b> từ 22:00, xe nào về hết thì chỉnh lệnh ca 2 rồi ký (sau về bến chuyến cuối ≥ 10 phút). Lệnh ca 1 không đỏ thì ký luôn, đỏ mới chỉnh.</li>' +
    '<li><b>Từ 23:50:</b> xe chưa về thì chỉnh trước, canh mỗi phút, về là ký ngay (muộn nhất 06:00).</li>' +
    '<li>Xe đang chạy, chưa chạy, lệnh không có xe đi, chuyến Mất Chuyến: bỏ qua. Không đẩy lệnh.</li>' +
    '<li>Ký hết thì tự tắt. Chỉnh lệnh có Hoàn tác, ký thì không gỡ được.</li></ul></details>';
  setOut(out);
}

$('out').addEventListener('click', function (ev) {
  const b = ev.target.closest && ev.target.closest('button[data-c2]');
  if (!b || MODE !== 'ca2' || !C2) return;
  const act = b.getAttribute('data-c2'), tuyen = Array.from(C2.pick || []).join(', '), moc = ($('ca2Moc') || {}).value || '';
  if (act === 'reload') { C2.pick = null; ca2Call({}); return; }
  if (act === 'off') { if (confirm('Tắt ca 2?')) ca2Call({ op: 'off' }); return; }
  if (act === 'off1') { if (confirm('Tắt ca 1?')) ca2Call({ op: 'off1' }); return; }
  if (act === 'run') {
    if (!confirm('Chạy ngay 1 lượt ca 2 cho tuyến ' + C2.tuyen.join(', ') + '?\nXe về hết sẽ được chỉnh và KÝ. Ký rồi không gỡ được.')) return;
    ca2Call({ op: 'run' }); return;
  }
  if (!tuyen) { msg('❌ Chọn ít nhất 1 tuyến', 'err'); return; }
  if (act === 'xem1') { ca2Call({ op: 'xem1', tuyen: tuyen }); return; }
  if (act === 'xem') { ca2Call({ op: 'xem', tuyen: tuyen, moc: moc }); return; }
  askNotify();
  if (act === 'on1') {
    if (!confirm(((C2.ca1 || {}).on ? 'Đổi ca 1 sang tuyến ' : 'Bật ca 1 cho tuyến ') + tuyen + '?\n' + ((C2.ca1 || {}).gio || '14:00') + ' tự về bến và chỉnh lệnh ca 1. Không ký.')) return;
    ca2Call({ op: 'on1', tuyen: tuyen }); return;
  }
  if (!confirm((C2.on ? 'Lưu ca 2 cho tuyến ' : 'Bật ca 2 cho tuyến ') + tuyen + '?\nTừ 22:00, xe về hết sẽ tự chỉnh lệnh và KÝ. Ký rồi không gỡ được.')) return;
  ca2Call({ op: 'on', tuyen: tuyen, moc: moc });
});

// ===== BẢNG TÀI GHÉP TUYẾN (gọi bangtai trong bangtai.gs) =====
// Chọn 2-3 tuyến + ngày ở trên -> ghép ngang thành 1 bảng: mỗi bến 2 cột GIỜ XB | BKS, 1 cột trống giữa các bến.
const BTR = new Set((function () {
  try { const v = JSON.parse(localStorage.getItem('bt_routes') || 'null'); if (v) return v; } catch (e) { /* bỏ qua */ }
  return ['bt1', 'bt2', 'bt3'].map(id => String(localStorage.getItem('bt_' + id) || '').split(' ')[0]).filter(Boolean);   // chọn cũ ở 3 ô tuyến
})());
let BT_T = null;
RP.bt = { set: () => BTR, change: function () {
  localStorage.setItem('bt_routes', JSON.stringify(Array.from(BTR)));
  if (MODE !== 'bt') return;
  renderBt(); btHen();
} };
function btHen() { clearTimeout(BT_T); BT_T = setTimeout(function () { if (MODE !== 'bt') return; if (document.body.classList.contains('is-busy')) btHen(); else btRun(); }, 900); }
function openBt() {
  if (TAB !== 'bt' || (MODE === 'bt' && BT)) return;
  MODE = 'bt'; renderBt(); syncView();
  if (BTR.size && ROUTES.length) btRun(); else if (!BTR.size) msg('Chọn tuyến cần ghép.', 'info');
}
function btRun() {
  if (!isoDate()) { msg('❌ Ngày gõ dạng dd/mm/yyyy.', 'err'); return; }
  if (!ROUTES.length) return;
  const list = Array.from(BTR).map(c => ROUTES.find(r => r.code === c)).filter(Boolean).map(r => ({ id: String(r.id), code: r.code }));
  if (!list.length) { BT = null; $('stats').innerHTML = ''; renderBt(); msg('Chọn tuyến cần ghép.', 'info'); return; }
  const iso = isoDate();
  LAST_RO = 'bt';
  msg('Đang lấy lịch chạy ' + list.map(x => x.code).join(', ') + '...');
  Promise.all(list.map(s => api({ action: 'bangtai', routeId: s.id, label: s.code, date: iso }, 180000))).then(function (res) {
    if (!res[0].ben) throw new Error('Server chưa có action "bangtai". Dán bangtai.gs, thêm dòng vào RO trong Web.gs, rồi Deploy lại BẢN MỚI.');
    BT = { ngay: res[0].ngay, iso: iso, routes: res };
    const empty = res.filter(r => !r.ben.length).map(r => r.tuyen);
    msg(empty.length ? '⚠️ Tuyến ' + empty.join(', ') + ' không có chuyến nào.' : '✅ Đã ghép ' + res.map(r => r.tuyen).join(' + '), empty.length ? 'err' : 'ok');
    if (MODE === 'bt') renderBt();
  }).catch(function (e) { msg('❌ ' + e.message, 'err'); });
}

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
  const top = '<div class="gp-top">' + rpHtml('bt', BTR, [], 'Tuyến') + '</div>';
  if (!BT) { $('stats').innerHTML = ''; setOut(top); return; }
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
  setOut(top + (bl.length
    ? '<table class="bt"><thead><tr>' + head1 + '</tr><tr>' + head2 + '</tr></thead><tbody>' + body + '</tbody></table>'
    : '<table><tbody><tr><td>Không có chuyến nào</td></tr></tbody></table>'));
}

// --- Tải Excel (ExcelJS chỉ nạp khi bấm lần đầu) ---
let _xl = null;
function loadExcelJS() {
  if (window.ExcelJS) return Promise.resolve(window.ExcelJS);
  if (_xl) return _xl;
  _xl = new Promise(function (resolve, reject) {
    const sc = document.createElement('script');
    sc.src = 'https://cdnjs.cloudflare.com/ajax/libs/exceljs/4.4.0/exceljs.min.js';
    // BẢO MẬT: kiểm tra đúng file gốc (mã băm cdnjs công bố) — CDN bị sửa file thì trình duyệt không chạy
    sc.integrity = 'sha512-dlPw+ytv/6JyepmelABrgeYgHI0O+frEwgfnPdXDTOIZz+eDgfW07QXG02/O8COfivBdGNINy+Vex+lYmJ5rxw==';
    sc.crossOrigin = 'anonymous'; sc.referrerPolicy = 'no-referrer';
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
      (on ? ' checked' : '') + '>' + esc(c) + '</label>';
  }).join('');
  // 1 hàng: bấm số tuyến để chọn / bỏ, ô "+ Thêm tuyến" cho tuyến ngoài cụm. Nút data-rp-act="add" ẩn, chỉ để ô gõ gọi (Enter / chọn trong danh sách).
  return '<div class="rp"><b class="rp-t">' + title + '</b>' + chips +
    '<input type="text" class="rp-in" data-route="multi" data-rp-input="' + name + '" placeholder="+ Thêm tuyến" aria-label="Thêm tuyến" autocomplete="off" spellcheck="false">' +
    '<button type="button" data-rp-act="add" data-rp="' + name + '" hidden></button>' +
    (FAV_CODES.length ? '<button type="button" class="rp-mini" data-rp-act="fav" data-rp="' + name + '">Cả cụm</button>' : '') +
    '<button type="button" class="rp-mini" data-rp-act="none" data-rp="' + name + '">Bỏ hết</button></div>';
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
let GPS_T = null;
function gpsAuto() {   // đổi tuyến là tự tìm lại (đợi chút cho chọn xong nhiều tuyến)
  clearTimeout(GPS_T);
  GPS_T = setTimeout(function () {
    if (MODE !== 'gps') return;
    if (document.body.classList.contains('is-busy')) { gpsAuto(); return; }
    if (GPSR.size) gpsFind(); else { GP = null; renderGps(); }
  }, 900);
}
RP.gps = { set: () => GPSR, change: function () { localStorage.setItem('gps_routes', JSON.stringify(Array.from(GPSR))); if (MODE === 'gps') { renderGps(); gpsAuto(); } } };
function gpsRoutes() { // tuyến đã chọn -> [{id, code}] (bỏ mã không còn trong danh sách tuyến)
  return Array.from(GPSR).map(c => ROUTES.find(r => r.code === c)).filter(Boolean).map(r => ({ id: String(r.id), code: r.code }));
}
const gpsCodes = list => list.map(r => r.code).join(', ');

$('btnGps').onclick = function () {
  if (GPS_RUN) { GP = GPS_RUN; MODE = 'gps'; renderGps(); msg('🛰 Đang chụp GPS tuyến ' + GP.sent.codes + ', xong sẽ báo ở đây.', 'info'); return; }
  if (!isoDate()) { msg('❌ Ngày gõ dạng dd/mm/yyyy.', 'err'); return; }
  if (!ROUTES.length) { msg('Danh sách tuyến đang tải, chờ vài giây rồi bấm lại.', 'info'); return; }
  const s = sel();
  if (s.code && !GPSR.has(s.code)) GPSR.add(s.code); // tuyến đang mở luôn được chọn thêm
  localStorage.setItem('gps_routes', JSON.stringify(Array.from(GPSR)));
  MODE = 'gps';
  if (GP && GP.iso !== isoDate()) GP = null;
  if (!GPSR.size) { GP = null; renderGps(); msg('Chọn tuyến cần chụp GPS.', 'info'); return; }
  gpsFind();
};

function gpsFind() {
  const list = gpsRoutes(), iso = isoDate();
  if (!iso) { msg('❌ Ngày gõ dạng dd/mm/yyyy.', 'err'); return; }
  if (!list.length) { msg('❌ Chưa chọn tuyến nào để chụp GPS.', 'err'); return; }
  MODE = 'gps';
  if (!GP || GP.iso !== iso) { GP = null; $('stats').innerHTML = ''; }
  GPS_FINDING = true; renderGps();
  msg('Đang tìm chuyến mất của ' + gpsCodes(list) + '...');
  gToken(50).then(function (gtok) { // xin token Google ngay lúc bấm (đủ dài cho cả lần chụp sau)
    return apiPost({ action: 'gps', dry: '1', gtok: gtok, routes: JSON.stringify(list), routeId: list[0].id, label: list.map(r => r.code).join('+'), date: iso }, 180000);
  }).then(function (res) {
    if (!res.trips) throw new Error('Server chưa có action "gps". Dán gps.gs, thêm router vào Web.gs, rồi Deploy lại BẢN MỚI.');
    if (!res.routes) throw new Error('Máy chủ chưa có bản chụp GPS nhiều tuyến. Dán gps.gs + web.gs mới, rồi Deploy lại BẢN MỚI.');
    const old = GP && GP.iso === iso ? GP : null;
    GP = res; GP.iso = iso; GP.list = list; GP.run = null; GP.filter = old ? old.filter : 'all';
    GP.pick = new Set(res.trips.filter(t => t.chup && !t.daCo && !t.matGps && !t.dangChup && !isDx(t)).map(t => t.key)); // tick sẵn: mất chuyến chưa có ảnh
    const nDx = res.trips.filter(isDx).length;
    if (!res.trips.length) msg('✅ Không có chuyến mất nào.', 'ok');
    else msg('Đã tick sẵn ' + GP.pick.size + ' chuyến chưa có ảnh, bấm 🛰 Chụp.', 'ok');
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
  // 1) ô chọn tuyến (đổi tuyến là tự tìm lại)
  let out = '<div class="gp-top">' + rpHtml('gps', GPSR, sel().code ? [sel().code] : [], 'Tuyến') + '</div>';
  if (!GP) { $('stats').innerHTML = ''; setOut(out); return; }

  // 2) số liệu: mất chuyến / đề xuất đã có ở nút lọc, ở đây chỉ thêm khi có
  const T = GP.trips, nDx = T.filter(isDx).length, daCo = T.filter(t => t.daCo).length, nMatGps = T.filter(t => t.matGps).length;
  $('stats').innerHTML = [['Đã có ảnh', daCo, 'e-ok'], ['Mất GPS', nMatGps, 'e-noebms']].filter(x => x[1])
    .map(x => '<div class="stat ' + x[2] + '"><b>' + x[1] + '</b>' + x[0] + '</div>').join('');

  // 3) thanh nút: link Sheet + lọc loại + nút Chụp
  const r = GP.run, sheet = GP.sheet || (r && r.sheet), other = GPS_RUN && GPS_RUN !== GP;
  const picked = T.filter(t => t.chup && GP.pick.has(t.key));
  const canGo = (!r || r.status === 'completed') && !other && T.some(t => t.chup);
  const fb = (k, label, n) => '<button type="button" class="gp-f' + (GP.filter === k ? ' on' : '') + '" data-gpf="' + k + '">' + label + ' <b>' + n + '</b></button>';
  out += '<div class="panel-bar"><div class="pb-left">' +
    (sheet ? '<a class="link-btn soft" href="' + safeUrl(sheet) + '" target="_blank" rel="noopener">📄 Sheet GPS' + (GP.rieng ? ' của bạn' : '') + '</a>' : '') +
    '<a class="link-btn soft" href="' + MAT_CHUYEN_URL + '" target="_blank" rel="noopener">📋 Báo cáo mất chuyến</a>' +
    '<span class="gp-fs">' + fb('all', 'Tất cả', T.length) + fb('mat', '🔴 Mất chuyến', T.length - nDx) + fb('dexuat', '🟠 Đề xuất', nDx) + '</span></div>' +
    (canGo ? '<button class="edit-btn big" data-gps="go"' + (picked.length ? '' : ' disabled') + '>🛰 Chụp ' + picked.length + ' chuyến</button>' : '') + '</div>';
  if (r && r.status === 'completed') {
    out += '<div class="panel-note ' + (r.conclusion === 'success' ? 'ok' : 'err') + '">' + (r.conclusion === 'success' ? '✅ Chụp xong, link ảnh đã ghi vào Google Sheet.' : '⚠️ Có chuyến chụp lỗi, xem Google Sheet (hoặc tick chụp lại).') + '</div>';
  } else if (r) {
    out += '<div class="panel-note busy">⏳ Đang chụp ' + esc(GP.sent ? GP.sent.n + ' chuyến' : '') + (r.n > 1 ? ', xong ' + (r.xong || 0) + '/' + r.n + ' phần' : '') +
      '. Vẫn bấm được nút khác, xong sẽ báo.' + (r.url ? ' <a href="' + safeUrl(r.url) + '" target="_blank" rel="noopener">Xem trên GitHub</a>' : '') + '</div>';
  } else if (other) {
    out += '<div class="panel-note busy">⏳ Đang có lần chụp khác (tuyến ' + esc(GPS_RUN.sent ? GPS_RUN.sent.codes : '') + '), chờ xong rồi chụp tiếp.</div>';
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
  if (b.dataset.gps !== 'go' || !GP) return;
  const picked = GP.trips.filter(t => t.chup && GP.pick.has(t.key));
  if (!picked.length) { msg('Chưa tick chuyến nào.', 'err'); return; }
  const routes = GP.list.filter(r => picked.some(t => t.tuyen === r.code));
  // Không hỏi lại: chỉ chụp ảnh + ghi link, danh sách tick đã hiện ngay trên màn
  b.disabled = true; msg('Đang gửi lệnh chụp ' + picked.length + ' chuyến...'); askNotify();
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
    msg('🛰 Đang chụp ' + res.nChup + ' chuyến, vẫn bấm được nút khác. Xong sẽ báo.', 'ok');
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
  return api({ action: 'undo', op: 'list', ekey: getEkey(), fs: getFs() }, 60000).then(function (res) {
    if (!res.list) throw new Error('Server chưa có action "undo". Dán edit.gs + web.gs mới, rồi Deploy lại BẢN MỚI.');
    UD = res; MODE = 'undo';
    renderUndo();
    msg(note || '', cls || 'info');
  }).catch(function (e) {
    if (e.futaLogin) { setFs(null); futaForm(e.message, function () { undoList(note, cls); }); return; }
    msg((note ? note + '\n' : '') + '❌ ' + e.message, 'err');
  });
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
  $('out').innerHTML = '<div class="panel-note">Trả lại giá trị trước lần lưu, được tới <b>23:55</b>. Ô đã bị đổi tiếp thì không đụng. Xác nhận về bến không hoàn tác được.</div>' +
    '<table><thead><tr>' + ['Lúc lưu', 'Người lưu', 'Loại', 'Tuyến', 'Ngày', 'Xe', 'Số lượng', 'Trạng thái', ''].map(x => '<th>' + x + '</th>').join('') +
    '</tr></thead><tbody>' + (body || '<tr><td colspan="9">Hôm nay chưa có lần lưu nào</td></tr>') + '</tbody></table>';
}

// 👁 Xem chi tiết 1 lần lưu (bấm lại thì ẩn)
$('out').addEventListener('click', function (ev) {
  const b = ev.target.closest && ev.target.closest('[data-undo-view]');
  if (!b || MODE !== 'undo' || !UD) return;
  const id = b.dataset.undoView;
  if (UD.view && UD.view.entry.id === id) { UD.view = null; renderUndo(); return; }
  api({ action: 'undo', op: 'view', id: id, ekey: getEkey(), fs: getFs() }, 60000).then(function (v) { UD.view = v; renderUndo(); msg('', ''); })
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
  api({ action: 'undo', op: 'view', id: id, ekey: getEkey(), fs: getFs() }, 60000).then(function (v) {
    const e = v.entry;
    if (e.done) { msg('Lần lưu này đã được hoàn tác lúc ' + e.done + (e.doneWho ? ' (' + e.doneWho + ')' : '') + '.', 'err'); return; }
    const lines = v.items.map(it => '• ' + [it.xe, it.lenh && 'lệnh ' + it.lenh, it.stt && 'chuyến ' + it.stt].filter(Boolean).join(' · ') + ' (' + it.code + '): ' +
      it.f.map(f => f.label + ' ' + f.now + ' → ' + f.back).join(', '));
    if (!confirm((e.of ? 'LÀM LẠI (huỷ lần hoàn tác)' : 'HOÀN TÁC') + ': ' + e.kind + ' lúc ' + e.at + ' (' + e.who + ')\nTuyến ' + e.tuyen + ' · ' + e.ngay + (e.xe ? ' · ' + e.xe : '') +
      '\n\nGhi lại giá trị cũ cho ' + v.items.length + ' chuyến:\n\n' + clip(lines, 40).join('\n'))) { msg('Đã huỷ, chưa ghi gì.', 'info'); return; }
    msg('Đang hoàn tác ' + v.items.length + ' chuyến (đọc lại → ghi giá trị cũ → đọc lại kiểm, đừng đóng trang)...');
    return api({ action: 'undo', op: 'run', id: id, ekey: getEkey(), fs: getFs() }, 360000, 0).then(function (r) {
      napBo(['load', 'lvc']); ovNen();
      const bad = r.verifyBad.concat(r.failed, r.skipped);
      const line = (bad.length || r.stopped ? '⚠️ ' : '✅ ') + (e.of ? 'Đã làm lại ' : 'Đã hoàn tác ') + r.restored + '/' + r.total + ' chuyến (' + r.elapsed + 's)' +
        (r.verifyBad.length ? ', KIỂM LỆCH ' + r.verifyBad.length : '') + (r.failed.length ? ', lỗi ghi ' + r.failed.length : '') +
        (r.skipped.length ? ', không khôi phục ' + r.skipped.length : '') + (r.stopped ? ', chưa kịp ' + r.stopped + ' (hết giờ, bấm lại)' : '') +
        (bad.length ? '\n' + bad.join('\n') : '');
      const cls = bad.length || r.stopped ? 'err' : 'ok';
      if (r.redoId) showUndo(r.redoId, e.of ? 'Đã làm lại. Đổi ý?' : 'Đã hoàn tác. Hoàn tác nhầm?', e.of ? '↩️ Hoàn tác lại' : '↪️ Làm lại (ghi lại giá trị vừa bỏ)');
      else hideUndo();
      if (MODE === 'auto' && AU) return autoPlan(line);
      return undoList(line, cls);
    });
  }).catch(function (e) {
    if (e.futaLogin) { setFs(null); futaForm(e.message, function () { undoRun(id); }); return; }
    msg('❌ ' + e.message, 'err');
  });
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
let LAST_BTN = null, LAST_RO = null, FRESH_UNTIL = 0, LAST_CHECK = null;
const RO_BTN = { btnOv: 1, btnLoad: 1, btnEbms: 1, btnNv: 1, btnLvc: 1, btnGps: 1 };   // tác vụ chỉ đọc (máy chủ dùng chung kết quả 30–60 giây)
const RO_ACT = { load: 1, ebms: 1, nv: 1, lvc: 1, bangtai: 1, gps: 1 };
document.addEventListener('click', function (e) {
  if (!e.target.closest || document.body.classList.contains('is-busy') || e.target.closest('#box')) return;
  const nb = e.target.closest('.act, .edit-btn.big, [data-undo]');
  if (nb) LAST_BTN = nb;
  const b = e.target.closest('.act');
  if (!b) return;
  if (b.id !== LAST_CHECK) { FIL = ''; $('q').value = ''; }   // đổi sang việc kiểm tra khác thì bỏ lọc; chạy lại cùng việc (ngày khác) thì giữ lọc
  LAST_CHECK = b.id;
  if (b.id !== 'btnUndo') hideUndo();
  if (!RO_BTN[b.id]) { $('dataAt').textContent = ''; $('btnFresh').hidden = true; }
  else LAST_RO = b.id;
}, true);
$('btnFresh').onclick = function () {
  if (document.body.classList.contains('is-busy')) return;
  FRESH_UNTIL = Date.now() + 3000; // các lượt gọi trong 3 giây tới bỏ cache (nocache=1)
  if (MODE === 'gps' && LAST_RO === 'btnGps') gpsFind();
  else if (MODE === 'bt') btRun();
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
  $('btnUser').textContent = !USER_MODE ? '👤 ' + (getWho() || 'Vào web') : ME ? '👤 ' + ME.name : '👤 Đăng nhập';
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
  const FREE = { gpsstatus: 1, editauth: 1, con: 1, futame: 1, futalogout: 1 }; // chạy nền (hỏi tiến độ GPS, kiểm tra mã, tải link đo cồn, kiểm phiên FUTA): không khoá
  const BTN = '.act, .edit-btn, .sw, .tab, [data-gps="go"]';   // đang chạy thì không đổi thẻ: kết quả về phải đúng màn của thẻ đó
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
      const track = !(params && (FREE[params.action] || params.bg || params._nen)); // bg: hỏi trạng thái chạy nền (Ca 2); _nen: đọc dữ liệu cho các ô
      if (track) { n++; mark(); }
      const args = Array.prototype.slice.call(arguments);
      if (params && params._nen) { args[0] = Object.assign({}, params); delete args[0]._nen; }
      if (params && RO_ACT[params.action] && Date.now() < FRESH_UNTIL) args[0] = Object.assign({}, args[0], { nocache: '1' }); // 🔄 Lấy mới
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
