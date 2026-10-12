/* Runtime tối thiểu thay cho nền tảng Dashboard của Claude.
   Cung cấp đúng các hàm trang dashboard đang dùng: dash.data, dash.calc, dash.onData,
   dash.params, dash.setParams, dash.resetParams, dash.setLink, dash.refresh, dash.colors.
   Dữ liệu đọc từ /data/<id>.json do scripts/sync-backlog.mjs ghi. */
(function () {
  'use strict';
  var DATASETS = ['issues', 'flow', 'snapshot', 'members'];
  var DEFAULTS = {grain: 'week', rel: '', tab: 'overview', who: '', ms: '', cat: '', defect: '', proc: '', type: '', prio: '', dim: 'tg', hpi: 2};
  var store = {};
  var calcs = {};
  var memo = {};
  var listeners = [];

  function fromHash() {
    var out = {};
    try {
      new URLSearchParams(location.hash.replace(/^#/, '')).forEach(function (v, k) {
        if (k in DEFAULTS) out[k] = k === 'hpi' ? Number(v) || DEFAULTS.hpi : v;
      });
    } catch (e) { /* bỏ qua hash lỗi */ }
    return out;
  }
  var params = Object.assign({}, DEFAULTS, fromHash());

  function writeHash() {
    var sp = new URLSearchParams();
    Object.keys(params).forEach(function (k) {
      if (String(params[k]) !== String(DEFAULTS[k])) sp.set(k, params[k]);
    });
    var h = sp.toString();
    try { history.replaceState(null, '', location.pathname + location.search + (h ? '#' + h : '')); } catch (e) { /* bỏ qua */ }
  }

  function calcResult(id) {
    if (memo[id]) return memo[id];
    var c = calcs[id];
    var ins = c.inputs.map(function (i) { return dash.data(i); });
    var bad = ins.find(function (d) { return d.status !== 'ok'; });
    var res;
    if (bad) res = {status: bad.status, data: [], columns: [], message: bad.message};
    else {
      try { res = {status: 'ok', data: c.fn.apply(null, ins.map(function (d) { return d.data; })), columns: []}; }
      catch (e) { console.error('calc ' + id, e); res = {status: 'error', data: [], columns: [], message: String(e)}; }
    }
    if (res.status === 'ok') memo[id] = res;
    return res;
  }

  var raf = 0;
  function notify() {
    cancelAnimationFrame(raf);
    raf = requestAnimationFrame(function () { listeners.slice().forEach(function (fn) { try { fn(); } catch (e) { console.error(e); } }); });
  }

  var dash = {
    colors: ['#4b7bec', '#f2994a', '#27ae60', '#9b51e0', '#eb5757', '#2d9cdb', '#bb6bd9', '#6fcf97'],
    data: function (id) {
      if (store[id]) return store[id];
      if (calcs[id]) return calcResult(id);
      return {status: 'missing', data: [], columns: [], message: 'Không có nguồn ' + id};
    },
    calc: function (id, def) { calcs[id] = def; delete memo[id]; },
    onData: function (fn) { listeners.push(fn); try { fn(); } catch (e) { console.error(e); } },
    params: function () { return Object.assign({}, params); },
    setParams: function (p) { Object.assign(params, p); writeHash(); notify(); },
    resetParams: function () { params = Object.assign({}, DEFAULTS); writeHash(); notify(); },
    setLink: function () {},
    refresh: function () { load(); }
  };
  window.dash = dash;

  function load() {
    DATASETS.forEach(function (id) {
      if (!store[id]) store[id] = {status: 'loading', data: [], columns: []};
      fetch('data/' + id + '.json', {cache: 'no-cache'})
        .then(function (r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
        .then(function (rows) { store[id] = {status: 'ok', data: rows, columns: rows[0] ? Object.keys(rows[0]) : []}; })
        .catch(function (e) { store[id] = {status: 'error', data: [], columns: [], message: String(e)}; })
        .then(function () { memo = {}; notify(); });
    });
  }
  window.addEventListener('DOMContentLoaded', load);
  window.addEventListener('hashchange', function () { params = Object.assign({}, DEFAULTS, fromHash()); notify(); });
  var rt = 0;
  window.addEventListener('resize', function () { clearTimeout(rt); rt = setTimeout(notify, 120); });
})();
