(function () {
  'use strict';

  var DEF = {
    receita: ['Salário', 'Reembolsos', 'Presentes', 'Rendimentos', 'Freelance'],
    despesa: ['Alimentação', 'Transporte', 'Casa', 'Contas', 'Saúde', 'Lazer', 'Educação', 'Compras', 'Presentes']
  };
  var BRL = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
  var CMP = new Intl.NumberFormat('pt-BR', { notation: 'compact', maximumFractionDigits: 1 });
  var MINUS = '−';

  function pad(n) { return String(n).padStart(2, '0'); }
  function hoje() { var d = new Date(); return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }
  function mesDe(iso) { return String(iso).slice(0, 7); }
  function fmt(c) { return BRL.format(c / 100); }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function $(id) { return document.getElementById(id); }
  function shiftMes(m, d) { var p = m.split('-').map(Number); var dt = new Date(p[0], p[1] - 1 + d, 1); return dt.getFullYear() + '-' + pad(dt.getMonth() + 1); }
  function cap1(s) { return s.charAt(0).toUpperCase() + s.slice(1); }
  function labelMes(m) { var p = m.split('-').map(Number); return cap1(new Date(p[0], p[1] - 1, 1).toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })); }
  function curtoMes(m) { var p = m.split('-').map(Number); return new Date(p[0], p[1] - 1, 1).toLocaleDateString('pt-BR', { month: 'short' }).replace(/\./g, ''); }
  function labelDia(iso) { var p = iso.split('-').map(Number); return new Date(p[0], p[1] - 1, p[2]).toLocaleDateString('pt-BR', { weekday: 'short', day: 'numeric', month: 'short' }).replace(/\./g, ''); }

  function parseValor(txt) {
    var s = String(txt).replace(/R\$/gi, '').replace(/\s/g, '');
    if (!s) return NaN;
    if (s.indexOf(',') >= 0) s = s.replace(/\./g, '').replace(',', '.');
    else if (/^\d{1,3}(\.\d{3})+$/.test(s)) s = s.replace(/\./g, '');
    if (!/^\d+(\.\d{1,2})?$/.test(s)) return NaN;
    return Math.round(parseFloat(s) * 100);
  }

  function niceMax(v) {
    if (v <= 0) return 100;
    var exp = Math.pow(10, Math.floor(Math.log10(v)));
    var f = v / exp;
    var nf = f <= 1 ? 1 : f <= 2 ? 2 : f <= 2.5 ? 2.5 : f <= 5 ? 5 : 10;
    return nf * exp;
  }

  var state = {
    lanc: [], custom: { receita: [], despesa: [] },
    mes: hoje().slice(0, 7), tipo: 'despesa', aba: 'despesa',
    pendente: null, pronto: false, erro: '', modo: 'local',
    imp: { stage: 'inicio' }, obsDraft: '', impInvert: false, impErr: '',
    view: 'mes', ptipo: 'despesa', pmodo: 'individual', compareKind: 'colunas', pper: 'ano:' + hoje().slice(0, 4), pde: null, pate: null, pall: false
  };
  var store = null;

  function catsFor(tipo) {
    var base = DEF[tipo].slice();
    (state.custom[tipo] || []).forEach(function (c) { if (base.indexOf(c) < 0) base.push(c); });
    base.push('Outros');
    return base;
  }

  function totais() {
    var t = {};
    state.lanc.forEach(function (l) {
      var m = mesDe(l.data);
      if (!t[m]) t[m] = { rec: 0, desp: 0 };
      if (l.tipo === 'receita') t[m].rec += l.centavos; else t[m].desp += l.centavos;
    });
    return t;
  }

  /* ---------- renderização ---------- */
  function renderHead() {
    $('mesLabel').textContent = labelMes(state.mes);
    $('btnHoje').hidden = state.mes === hoje().slice(0, 7);
    $('listTitle').textContent = 'Lançamentos de ' + labelMes(state.mes).toLowerCase();
  }

  function renderSum() {
    var t = totais()[state.mes] || { rec: 0, desp: 0 };
    var saldo = t.rec - t.desp;
    var saldoTxt = saldo > 0 ? '+' + fmt(saldo) : saldo < 0 ? MINUS + fmt(-saldo) : fmt(0);
    $('sum').innerHTML =
      '<div class="rec"><div class="k">Receitas</div><div class="v num">' + fmt(t.rec) + '</div></div>' +
      '<div class="desp"><div class="k">Despesas</div><div class="v num">' + fmt(t.desp) + '</div></div>' +
      '<div class="saldo"><div class="k">Saldo do mês</div><div class="v num' + (saldo < 0 ? ' neg' : '') + '">' + saldoTxt + '</div></div>';
  }

  function renderChart() {
    var el = $('chart');
    if (!state.pronto) { el.innerHTML = '<p class="empty">Carregando…</p>'; return; }
    if (!state.lanc.length) {
      el.style.width = '100%';
      el.innerHTML = '<p class="empty">O gráfico aparece assim que você registrar o primeiro lançamento. Ele compara receitas e despesas ao longo de todo o histórico.</p>';
      return;
    }
    var lim = limitesMeses();
    var meses = listaMeses(lim[0], lim[1]);
    var tot = totais();
    var W = Math.max(620, meses.length * 82), H = 240, L = 50, R = 10, T = 14, B = 30;
    el.style.width = W + 'px';
    var pw = W - L - R, ph = H - T - B;
    var mx = 0;
    meses.forEach(function (m) { var t = tot[m] || { rec: 0, desp: 0 }; mx = Math.max(mx, t.rec, t.desp); });
    var max = niceMax(mx / 100);
    var band = pw / meses.length;
    var bw = Math.min(28, band * 0.3), gap = 3;
    var s = '<svg class="chart" viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="Gráfico rolável de receitas e despesas por mês">';
    var k;
    for (k = 0; k <= 5; k++) {
      var gy = T + ph * (1 - k / 5);
      s += '<line class="grid" x1="' + L + '" x2="' + (W - R) + '" y1="' + gy.toFixed(1) + '" y2="' + gy.toFixed(1) + '"/>';
      s += '<text x="' + (L - 8) + '" y="' + gy.toFixed(1) + '" text-anchor="end" dy="0.32em">' + CMP.format(max * k / 5) + '</text>';
    }
    meses.forEach(function (m, i) {
      var t = tot[m] || { rec: 0, desp: 0 };
      var cx = L + band * i + band / 2;
      var sel = m === state.mes;
      var hr = Math.max(t.rec ? 2 : 0, ph * (t.rec / 100 / max));
      var hd = Math.max(t.desp ? 2 : 0, ph * (t.desp / 100 / max));
      var tip = labelMes(m) + ': receitas ' + fmt(t.rec) + ', despesas ' + fmt(t.desp);
      s += '<g class="col" data-gomes="' + m + '" role="button" tabindex="0" aria-label="' + esc(tip) + '"><title>' + esc(tip) + '</title>';
      if (sel) s += '<rect class="hl" x="' + (L + band * i + 4).toFixed(1) + '" y="' + T + '" width="' + (band - 8).toFixed(1) + '" height="' + ph + '" rx="6"/>';
      s += '<rect class="br" x="' + (cx - gap / 2 - bw).toFixed(1) + '" y="' + (T + ph - hr).toFixed(1) + '" width="' + bw.toFixed(1) + '" height="' + hr.toFixed(1) + '" rx="2"/>';
      s += '<rect class="bd" x="' + (cx + gap / 2).toFixed(1) + '" y="' + (T + ph - hd).toFixed(1) + '" width="' + bw.toFixed(1) + '" height="' + hd.toFixed(1) + '" rx="2"/>';
      s += '<text' + (sel ? ' class="sel"' : '') + ' x="' + cx.toFixed(1) + '" y="' + (H - 10) + '" text-anchor="middle">' + esc(curtoMes(m) + (meses.length > 18 ? '/' + m.slice(2,4) : '')) + '</text>';
      s += '<rect class="hit" x="' + (L + band * i).toFixed(1) + '" y="0" width="' + band.toFixed(1) + '" height="' + H + '"/>';
      s += '</g>';
    });
    el.innerHTML = s + '</svg>';
  }

  function renderList() {
    var el = $('lista');
    if (!state.pronto) { el.innerHTML = '<p class="empty">Carregando seus lançamentos…</p>'; return; }
    if (state.erro) { el.innerHTML = '<p class="empty">' + esc(state.erro) + '</p>'; return; }
    var items = state.lanc.filter(function (l) { return mesDe(l.data) === state.mes; })
      .sort(function (a, b) { return b.data.localeCompare(a.data) || (b.hora || '').localeCompare(a.hora || '') || (b.criadoEm || 0) - (a.criadoEm || 0); });
    if (!items.length) {
      el.innerHTML = '<p class="empty">Nenhum lançamento neste mês. Use o formulário para registrar a primeira receita ou despesa.</p>';
      return;
    }
    var groups = [], last = null;
    items.forEach(function (l) {
      if (!last || last.data !== l.data) { last = { data: l.data, items: [] }; groups.push(last); }
      last.items.push(l);
    });
    el.innerHTML = groups.map(function (g) {
      return '<div class="dia"><h3>' + esc(labelDia(g.data)) + '</h3><ul>' + g.items.map(function (l) {
        var r = l.tipo === 'receita';
        var h = '<li class="row"><span class="dot ' + (r ? 'r' : 'd') + '"></span>' +
          '<div class="txt"><b>' + esc(l.categoria) + '</b>' + ((l.hora || l.obs) ? '<span class="obs">' + esc((l.hora || '') + (l.hora && l.obs ? ' · ' : '') + (l.obs || '')) + '</span>' : '') + '</div>' +
          '<div class="amt num ' + (r ? 'r' : 'd') + '">' + (r ? '+' : MINUS) + fmt(l.centavos) + '</div>' +
          '<button type="button" class="ghost" data-del="' + esc(l.id) + '" aria-label="Excluir lançamento de ' + esc(l.categoria) + '">Excluir</button>';
        if (state.pendente === l.id) {
          h += '<div class="confirm">Excluir este lançamento? <button type="button" class="danger" data-ok="' + esc(l.id) + '">Excluir</button><button type="button" data-no="1">Cancelar</button></div>';
        }
        return h + '</li>';
      }).join('') + '</ul></div>';
    }).join('');
  }

  function renderBrk() {
    var el = $('brk');
    Array.prototype.forEach.call(document.querySelectorAll('[data-aba]'), function (b) {
      b.setAttribute('aria-pressed', b.getAttribute('data-aba') === state.aba ? 'true' : 'false');
    });
    if (!state.pronto) { el.innerHTML = ''; return; }
    var by = {};
    state.lanc.forEach(function (l) {
      if (mesDe(l.data) === state.mes && l.tipo === state.aba) by[l.categoria] = (by[l.categoria] || 0) + l.centavos;
    });
    var rows = Object.keys(by).map(function (k) { return [k, by[k]]; }).sort(function (a, b) { return b[1] - a[1]; });
    if (!rows.length) { el.innerHTML = '<p class="empty">Sem ' + (state.aba === 'despesa' ? 'despesas' : 'receitas') + ' em ' + esc(labelMes(state.mes).toLowerCase()) + '.</p>'; return; }
    var total = rows.reduce(function (a, r) { return a + r[1]; }, 0);
    var cls = state.aba === 'despesa' ? 'd' : 'r';
    el.innerHTML = '<ul class="brk">' + rows.map(function (r) {
      return '<li><div class="top"><span>' + esc(r[0]) + '</span><span class="num"><b>' + fmt(r[1]) + '</b><span class="pct">' + Math.round(r[1] / total * 100) + '%</span></span></div>' +
        '<div class="bar"><i class="' + cls + '" style="width:' + (r[1] / rows[0][1] * 100).toFixed(1) + '%"></i></div></li>';
    }).join('') + '</ul>';
  }


  /* ---------- períodos ---------- */
  function anoAtual() { return hoje().slice(0, 4); }
  function mesesDados() {
    var ms = {};
    state.lanc.forEach(function (l) { ms[mesDe(l.data)] = 1; });
    return Object.keys(ms).sort();
  }
  function limitesMeses() {
    var cur = hoje().slice(0, 7), ms = mesesDados();
    var first = ms.length && ms[0] < cur ? ms[0] : cur;
    var last = ms.length && ms[ms.length - 1] > cur ? ms[ms.length - 1] : cur;
    return [first, last];
  }
  function listaMeses(a, b) {
    var out = [], m = a, n = 0;
    while (m <= b && n < 600) { out.push(m); m = shiftMes(m, 1); n++; }
    return out;
  }
  function rangePer() {
    var lim = limitesMeses(), first = lim[0], last = lim[1], v = state.pper, a, b;
    if (v === 'sempre') { a = first; b = last; }
    else if (v === '12m') { b = last; a = shiftMes(b, -11); }
    else if (v.indexOf('ano:') === 0) {
      var y = v.slice(4);
      a = y + '-01'; b = y + '-12';
      if (y === anoAtual() && b > last) b = last;
    } else {
      a = state.pde || first; b = state.pate || last;
      if (a > b) { var t = a; a = b; b = t; }
    }
    if (v !== 'custom' && a < first) a = first;
    if (a > b) b = a;
    return [a, b];
  }
  function setOpts(sel, opts, value) {
    var sig = opts.map(function (o) { return o[0] + '|' + o[1]; }).join('~');
    if (sel.getAttribute('data-sig') !== sig) {
      sel.innerHTML = opts.map(function (o) { return '<option value="' + esc(o[0]) + '">' + esc(o[1]) + '</option>'; }).join('');
      sel.setAttribute('data-sig', sig);
    }
    sel.value = value;
    if (sel.value !== value && opts.length) sel.value = opts[0][0];
  }
  function diaCurto(iso, comAno) {
    var p = iso.split('-').map(Number);
    var o = { day: 'numeric', month: 'short' };
    if (comAno) o.year = 'numeric';
    return new Date(p[0], p[1] - 1, p[2]).toLocaleDateString('pt-BR', o).replace(/\./g, '');
  }

  function barChart(items, cls, W, minLabel) {
    var H = 240, L = 46, R = 6, T = 20, B = 28, pw = W - L - R, ph = H - T - B;
    var mx = 0;
    items.forEach(function (it) { if (it.value > mx) mx = it.value; });
    var max = niceMax(mx / 100);
    var band = pw / items.length, bw = Math.min(44, band * 0.62);
    var step = Math.max(1, Math.ceil(minLabel / band));
    var s = '<svg class="chart" viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="Gráfico de barras por período">';
    var k;
    for (k = 0; k <= 5; k++) {
      var gy = T + ph * (1 - k / 5);
      s += '<line class="grid" x1="' + L + '" x2="' + (W - R) + '" y1="' + gy.toFixed(1) + '" y2="' + gy.toFixed(1) + '"/>';
      s += '<text x="' + (L - 8) + '" y="' + gy.toFixed(1) + '" text-anchor="end" dy="0.32em">' + CMP.format(max * k / 5) + '</text>';
    }
    items.forEach(function (it, i) {
      var cx = L + band * i + band / 2;
      var h = it.value ? Math.max(2, ph * (it.value / 100 / max)) : 0;
      var tip = it.tip + ': ' + fmt(it.value);
      s += '<g class="col"' + (it.go ? ' data-pgo="' + it.go + '" role="button" tabindex="0" aria-label="' + esc('Abrir ' + tip) + '"' : '') + '><title>' + esc(tip) + '</title>';
      if (h) s += '<rect class="' + (cls === 'd' ? 'bd' : 'br') + '" x="' + (cx - bw / 2).toFixed(1) + '" y="' + (T + ph - h).toFixed(1) + '" width="' + bw.toFixed(1) + '" height="' + h.toFixed(1) + '" rx="3"/>';
      if (h && band >= 44) s += '<text class="sel" x="' + cx.toFixed(1) + '" y="' + (T + ph - h - 5).toFixed(1) + '" text-anchor="middle">' + CMP.format(it.value / 100) + '</text>';
      if (i % step === 0) s += '<text x="' + cx.toFixed(1) + '" y="' + (H - 9) + '" text-anchor="middle">' + esc(it.label) + '</text>';
      s += '<rect class="hit" x="' + (L + band * i).toFixed(1) + '" y="0" width="' + band.toFixed(1) + '" height="' + H + '"/></g>';
    });
    return s + '</svg>';
  }

  function comparativeChart(items, kind, W) {
    var H = 260, L = 52, R = 12, T = 22, B = 34, pw = W - L - R, ph = H - T - B;
    var band = pw / Math.max(items.length, 1), s = '';
    var maxAbs = 0;
    items.forEach(function (it) { maxAbs = Math.max(maxAbs, it.rec, it.desp, Math.abs(it.rec - it.desp)); });
    var max = niceMax(maxAbs / 100);
    if (kind === 'saldo') {
      var zero = T + ph / 2, half = ph / 2;
      max = niceMax(maxAbs / 100);
      s = '<svg class="chart" viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="Gráfico de saldo mensal">';
      for (var k = 0; k <= 4; k++) {
        var gy = T + ph * k / 4;
        s += '<line class="grid" x1="' + L + '" x2="' + (W-R) + '" y1="' + gy + '" y2="' + gy + '"/>';
        s += '<text x="' + (L-8) + '" y="' + gy + '" text-anchor="end" dy="0.32em">' + CMP.format(max * (2-k) / 2) + '</text>';
      }
      items.forEach(function (it,i) {
        var v = it.rec - it.desp, cx = L + band*i + band/2, h = Math.abs(v/100/max)*half;
        var y = v >= 0 ? zero-h : zero;
        var tip = it.tip + ': saldo ' + (v < 0 ? MINUS : '') + fmt(Math.abs(v));
        s += '<g class="col"' + (it.go ? ' data-pgo="' + it.go + '"' : '') + '><title>' + esc(tip) + '</title>';
        if (v) s += '<rect class="' + (v >= 0 ? 'br' : 'bd') + '" x="' + (cx-Math.min(34,band*.55)/2) + '" y="' + y + '" width="' + Math.min(34,band*.55) + '" height="' + Math.max(2,h) + '" rx="3"/>';
        if (i % Math.max(1,Math.ceil(46/band)) === 0) s += '<text x="' + cx + '" y="' + (H-9) + '" text-anchor="middle">' + esc(it.label) + '</text>';
        s += '<rect class="hit" x="' + (L+band*i) + '" y="0" width="' + band + '" height="' + H + '"/></g>';
      });
      return s + '</svg>';
    }
    s = '<svg class="chart" viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="Gráfico comparativo de receitas e despesas">';
    for (var j = 0; j <= 5; j++) {
      var yGrid = T + ph * (1-j/5);
      s += '<line class="grid" x1="' + L + '" x2="' + (W-R) + '" y1="' + yGrid + '" y2="' + yGrid + '"/>';
      s += '<text x="' + (L-8) + '" y="' + yGrid + '" text-anchor="end" dy="0.32em">' + CMP.format(max*j/5) + '</text>';
    }
    var ptsR = [], ptsD = [];
    items.forEach(function(it,i) {
      var cx = L + band*i + band/2;
      var yr = T + ph - (it.rec/100/max)*ph, yd = T + ph - (it.desp/100/max)*ph;
      ptsR.push(cx + ',' + yr); ptsD.push(cx + ',' + yd);
      var tip = it.tip + ': receitas ' + fmt(it.rec) + ', despesas ' + fmt(it.desp);
      s += '<g class="col"' + (it.go ? ' data-pgo="' + it.go + '"' : '') + '><title>' + esc(tip) + '</title>';
      if (kind === 'colunas') {
        var bw = Math.min(26,band*.28);
        if (it.rec) s += '<rect class="br" x="' + (cx-bw-2) + '" y="' + yr + '" width="' + bw + '" height="' + Math.max(2,T+ph-yr) + '" rx="2"/>';
        if (it.desp) s += '<rect class="bd" x="' + (cx+2) + '" y="' + yd + '" width="' + bw + '" height="' + Math.max(2,T+ph-yd) + '" rx="2"/>';
      }
      if (i % Math.max(1,Math.ceil(46/band)) === 0) s += '<text x="' + cx + '" y="' + (H-9) + '" text-anchor="middle">' + esc(it.label) + '</text>';
      s += '<rect class="hit" x="' + (L+band*i) + '" y="0" width="' + band + '" height="' + H + '"/></g>';
    });
    if (kind === 'linhas' && items.length) {
      s += '<polyline points="' + ptsR.join(' ') + '" fill="none" stroke="var(--rec)" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>';
      s += '<polyline points="' + ptsD.join(' ') + '" fill="none" stroke="var(--desp)" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>';
      items.forEach(function(it,i) {
        var cx = L+band*i+band/2, yr=T+ph-(it.rec/100/max)*ph, yd=T+ph-(it.desp/100/max)*ph;
        s += '<circle cx="' + cx + '" cy="' + yr + '" r="3.5" fill="var(--rec)"><title>' + esc(it.tip + ': ' + fmt(it.rec)) + '</title></circle>';
        s += '<circle cx="' + cx + '" cy="' + yd + '" r="3.5" fill="var(--desp)"><title>' + esc(it.tip + ': ' + fmt(it.desp)) + '</title></circle>';
      });
    }
    return s + '</svg>';
  }

  function renderView() {
    var per = state.view === 'per';
    $('app').setAttribute('data-screen', state.view);
    var mes = state.view === 'mes', imp = state.view === 'imp', stats = state.view === 'stats';
    ['monthnav', 'sum', 'formCard', 'chartCard', 'listCard', 'brkCard'].forEach(function (id) { $(id).hidden = !mes; });
    ['pctl', 'psum', 'pchart', 'pbrk', 'plist'].forEach(function (id) { $(id).hidden = !per; });
    $('statsCard').hidden = !stats;
    $('impCard').hidden = !imp;
    $('bkCard').hidden = imp;
    Array.prototype.forEach.call(document.querySelectorAll('[data-view]'), function (b) {
      if (b.tagName === 'BUTTON') b.setAttribute('aria-pressed', b.getAttribute('data-view') === state.view ? 'true' : 'false');
    });
  }

  function renderPer() {
    if (state.view !== 'per') return;
    var modoComparativo = state.ptipo === 'comparativo';
    var tipo = modoComparativo ? 'despesa' : state.ptipo, cls = tipo === 'despesa' ? 'd' : 'r';
    var plural = tipo === 'despesa' ? 'despesas' : 'receitas';
    Array.prototype.forEach.call(document.querySelectorAll('[data-ptipo]'), function (b) {
      b.setAttribute('aria-pressed', b.getAttribute('data-ptipo') === state.ptipo ? 'true' : 'false');
    });
    if (!state.pronto) return;

    var lim = limitesMeses(), anos = {};
    mesesDados().forEach(function (m) { anos[m.slice(0, 4)] = 1; });
    anos[anoAtual()] = 1;
    var yl = Object.keys(anos).sort().reverse();
    var opts = [['ano:' + anoAtual(), 'Este ano (' + anoAtual() + ')'], ['12m', 'Últimos 12 meses']];
    yl.forEach(function (y) { if (y !== anoAtual()) opts.push(['ano:' + y, 'Ano ' + y]); });
    opts.push(['sempre', 'Desde sempre'], ['custom', 'De um mês a outro']);
    setOpts($('pper'), opts, state.pper);
    var custom = state.pper === 'custom';
    $('pcustom').hidden = !custom;
    if (custom) {
      var mo = listaMeses(lim[0], lim[1]).map(function (m) { return [m, cap1(curtoMes(m)) + ' ' + m.slice(0, 4)]; });
      setOpts($('pde'), mo, state.pde || lim[0]);
      setOpts($('pate'), mo, state.pate || lim[1]);
    }

    var r = rangePer(), a = r[0], b = r[1];
    var meses = listaMeses(a, b);
    var itens = state.lanc.filter(function (l) { var m = mesDe(l.data); return l.tipo === tipo && m >= a && m <= b; });
    var total = 0, porMes = {}, by = {};
    itens.forEach(function (l) {
      total += l.centavos;
      var m = mesDe(l.data);
      porMes[m] = (porMes[m] || 0) + l.centavos;
      by[l.categoria] = (by[l.categoria] || 0) + l.centavos;
    });

    $('prange').textContent = (a === b ? labelMes(a) : labelMes(a) + ' a ' + labelMes(b)) + ' · ' + meses.length + (meses.length === 1 ? ' mês' : ' meses');
    if (modoComparativo) {
      var recPeriodo = 0, despPeriodo = 0, qtdPeriodo = 0;
      state.lanc.forEach(function(l) {
        var m = mesDe(l.data);
        if (m >= a && m <= b) { qtdPeriodo++; if (l.tipo === 'receita') recPeriodo += l.centavos; else despPeriodo += l.centavos; }
      });
      var saldoPeriodo = recPeriodo - despPeriodo;
      $('psum').innerHTML =
        '<div class="rec"><div class="k">Total de receitas</div><div class="v num">' + fmt(recPeriodo) + '</div></div>' +
        '<div class="desp"><div class="k">Total de despesas</div><div class="v num">' + fmt(despPeriodo) + '</div></div>' +
        '<div class="saldo"><div class="k">Saldo do período</div><div class="v num' + (saldoPeriodo < 0 ? ' neg' : '') + '">' + (saldoPeriodo < 0 ? MINUS : '') + fmt(Math.abs(saldoPeriodo)) + '</div></div>';
    } else {
      $('psum').innerHTML =
        '<div class="' + (tipo === 'despesa' ? 'desp' : 'rec') + '"><div class="k">Total de ' + plural + '</div><div class="v num">' + fmt(total) + '</div></div>' +
        '<div><div class="k">Média por mês</div><div class="v num">' + fmt(meses.length ? Math.round(total / meses.length) : 0) + '</div></div>' +
        '<div class="saldo"><div class="k">Lançamentos</div><div class="v num">' + itens.length + '</div></div>';
    }

    /* gráfico individual ou comparativo */
    var porAno = meses.length > 24, multiAno = a.slice(0, 4) !== b.slice(0, 4), gi;
    if (porAno) {
      var ya = {};
      meses.forEach(function (m) { ya[m.slice(0, 4)] = (ya[m.slice(0, 4)] || 0) + (porMes[m] || 0); });
      gi = Object.keys(ya).sort().map(function (y) { return { label: y, tip: y, value: ya[y] }; });
    } else {
      gi = meses.map(function (m) {
        return { label: cap1(curtoMes(m)) + (multiAno ? ' ' + m.slice(2, 4) : ''), tip: labelMes(m), value: porMes[m] || 0, go: m };
      });
    }
    $('compareKindWrap').hidden = state.ptipo !== 'comparativo';
    var box = $('pchartBox');
    var chartWidth = Math.max(620, gi.length * 76);
    box.style.width = chartWidth + 'px';
    if (state.ptipo === 'comparativo') {
      var allTotals = totais();
      var compareItems = porAno
        ? Object.keys(ya).sort().map(function(y) {
            var rr=0,dd=0;
            meses.filter(function(m){return m.slice(0,4)===y;}).forEach(function(m){var z=allTotals[m]||{rec:0,desp:0};rr+=z.rec;dd+=z.desp;});
            return {label:y,tip:'Ano '+y,rec:rr,desp:dd};
          })
        : meses.map(function(m) { var z=allTotals[m]||{rec:0,desp:0}; return {label:cap1(curtoMes(m))+(multiAno?' '+m.slice(2,4):''),tip:labelMes(m),rec:z.rec,desp:z.desp,go:m}; });
      $('pchartTitle').textContent = 'Receitas x despesas · ' + (porAno ? 'por ano' : 'por mês');
      box.innerHTML = compareItems.length
        ? comparativeChart(compareItems, state.compareKind, chartWidth)
        : '<p class="empty">Sem lançamentos neste período.</p>';
    } else {
      $('pchartTitle').textContent = cap1(plural) + (porAno ? ' por ano' : ' por mês');
      box.innerHTML = itens.length
        ? barChart(gi, cls, chartWidth, multiAno && !porAno ? 46 : 28)
        : '<p class="empty">Sem ' + plural + ' neste período.</p>';
    }

    /* categorias */
    var rows = Object.keys(by).map(function (k) { return [k, by[k]]; }).sort(function (x, y) { return y[1] - x[1]; });
    $('pbrkBox').innerHTML = !rows.length ? '<p class="empty">Sem ' + plural + ' neste período.</p>' :
      '<ul class="brk">' + rows.map(function (rw) {
        return '<li><div class="top"><span>' + esc(rw[0]) + '</span><span class="num"><b>' + fmt(rw[1]) + '</b><span class="pct">' + Math.round(rw[1] / total * 100) + '%</span></span></div>' +
          '<div class="bar"><i class="' + cls + '" style="width:' + (rw[1] / rows[0][1] * 100).toFixed(1) + '%"></i></div></li>';
      }).join('') + '</ul>';

    /* lançamentos */
    var ord = itens.slice().sort(function (x, y) { return y.data.localeCompare(x.data) || (y.criadoEm || 0) - (x.criadoEm || 0); });
    var vis = state.pall ? ord : ord.slice(0, 20);
    var h = !ord.length ? '<p class="empty">Nenhum lançamento neste período.</p>' :
      '<ul style="list-style:none;margin:0;padding:0">' + vis.map(function (l) {
        return '<li class="row prow"><span class="dot ' + cls + '"></span><div class="txt"><b>' + esc(l.categoria) + '</b>' +
          '<span class="obs">' + esc(diaCurto(l.data, multiAno) + (l.hora ? ' · ' + l.hora : '') + (l.obs ? ' · ' + l.obs : '')) + '</span></div>' +
          '<div class="amt num ' + cls + '">' + (tipo === 'receita' ? '+' : MINUS) + fmt(l.centavos) + '</div></li>';
      }).join('') + '</ul>';
    if (ord.length > 20) h += '<div class="moreRow"><button type="button" class="secondary" data-pmore="1">' + (state.pall ? 'Mostrar menos' : 'Mostrar todos (' + ord.length + ')') + '</button></div>';
    $('plistBox').innerHTML = h;
  }



  function renderStats() {
    if (state.view !== 'stats') return;
    var box = $('statsBox');
    if (!state.pronto) { box.innerHTML = '<p class="empty">Carregando estatísticas…</p>'; return; }
    if (!state.lanc.length) { box.innerHTML = '<p class="empty">Registre receitas e despesas para começar a visualizar suas estatísticas.</p>'; return; }
    var lim = limitesMeses(), meses = listaMeses(lim[0], lim[1]), tot = totais();
    var rows = meses.map(function(m) { var t=tot[m]||{rec:0,desp:0}; return {m:m,rec:t.rec,desp:t.desp,saldo:t.rec-t.desp}; });
    var totalRec=0,totalDesp=0, maxRec=null,minRec=null,maxDesp=null,minDesp=null,bestSaldo=null, countByMonth={};
    rows.forEach(function(r) {
      totalRec+=r.rec; totalDesp+=r.desp;
      if (r.rec>0 && (!maxRec || r.rec>maxRec.rec)) maxRec=r;
      if (r.rec>0 && (!minRec || r.rec<minRec.rec)) minRec=r;
      if (!maxDesp || r.desp>maxDesp.desp) maxDesp=r;
      if (!minDesp || r.desp<minDesp.desp) minDesp=r;
      if (!bestSaldo || r.saldo>bestSaldo.saldo) bestSaldo=r;
      countByMonth[r.m]=0;
    });
    state.lanc.forEach(function(l) { if (countByMonth[mesDe(l.data)] !== undefined) countByMonth[mesDe(l.data)]++; });
    var busiest = rows.slice().sort(function(a,b) { return (countByMonth[b.m]||0)-(countByMonth[a.m]||0); })[0];
    var years={};
    rows.forEach(function(r) { var y=r.m.slice(0,4); if(!years[y]) years[y]={rec:0,desp:0}; years[y].rec+=r.rec; years[y].desp+=r.desp; });
    var yearRows=Object.keys(years).sort().reverse().map(function(y){return {year:y,rec:years[y].rec,desp:years[y].desp,saldo:years[y].rec-years[y].desp};});
    function metric(label, value, sub, cls) {
      return '<div class="stat-card ' + (cls||'') + '"><div class="k">' + label + '</div><div class="v num">' + value + '</div><div class="sub">' + (sub||'') + '</div></div>';
    }
    function monthValue(r, key) { return r ? fmt(r[key]) : '—'; }
    function monthName(r) { return r ? labelMes(r.m) : 'Sem dados'; }
    var h='<div class="stats-grid">';
    h+=metric('Maior despesa',monthValue(maxDesp,'desp'),monthName(maxDesp),'desp');
    h+=metric('Menor despesa',monthValue(minDesp,'desp'),monthName(minDesp),'desp');
    h+=metric('Maior receita',monthValue(maxRec,'rec'),monthName(maxRec),'rec');
    h+=metric('Menor receita',monthValue(minRec,'rec'),monthName(minRec),'rec');
    h+=metric('Melhor saldo mensal',bestSaldo?fmt(bestSaldo.saldo):'—',monthName(bestSaldo),bestSaldo&&bestSaldo.saldo>=0?'rec':'desp');
    h+=metric('Mês com mais lançamentos',busiest?(countByMonth[busiest.m]+' lançamentos'):'—',monthName(busiest),'');
    h+=metric('Receitas acumuladas',fmt(totalRec),rows.length+' meses analisados','rec');
    h+=metric('Despesas acumuladas',fmt(totalDesp),rows.length+' meses analisados','desp');
    h+=metric('Saldo acumulado',(totalRec-totalDesp<0?MINUS:'')+fmt(Math.abs(totalRec-totalDesp)),'Receitas menos despesas',totalRec>=totalDesp?'rec':'desp');
    h+='</div>';
    h+='<div class="stats-section"><h3>Resumo por ano</h3><div class="timeline-scroll"><table class="stats-table"><thead><tr><th>Ano</th><th class="num">Receitas</th><th class="num">Despesas</th><th class="num">Saldo</th></tr></thead><tbody>';
    h+=yearRows.map(function(y){return '<tr><td>'+y.year+'</td><td class="num" style="color:var(--rec)">'+fmt(y.rec)+'</td><td class="num" style="color:var(--desp)">'+fmt(y.desp)+'</td><td class="num">'+(y.saldo<0?MINUS:'')+fmt(Math.abs(y.saldo))+'</td></tr>';}).join('');
    h+='</tbody></table></div></div>';
    h+='<p class="stats-note">A menor despesa considera também meses sem gastos dentro do intervalo registrado. A menor receita considera apenas meses em que houve pelo menos uma receita.</p>';
    box.innerHTML=h;
  }

  /* ---------- importar extrato ---------- */
  var IMPKEY = 'livro-caixa-imp-v1';
  function impSave() {
    try {
      var st = state.imp && state.imp.stage;
      if (st === 'resumo' || st === 'triagem' || st === 'revisao') localStorage.setItem(IMPKEY, JSON.stringify(state.imp));
      else localStorage.removeItem(IMPKEY);
    } catch (e) { /* sem armazenamento */ }
  }
  function impLoad() {
    try {
      var r = JSON.parse(localStorage.getItem(IMPKEY) || 'null');
      if (r && r.stage && Array.isArray(r.items) && Array.isArray(r.raw)) return r;
    } catch (e) { /* ignora */ }
    return null;
  }

  function semAcento(s) { return String(s).normalize('NFD').replace(/[̀-ͯ]/g, ''); }
  function normDesc(s) { return semAcento(s == null ? '' : s).toLowerCase().replace(/\s+/g, ' ').trim(); }

  function parseNum(str, dotDecimal) {
    var s = String(str == null ? '' : str).trim();
    if (!s) return NaN;
    var neg = /^\(.*\)$/.test(s) || /^[-−]/.test(s) || /[-−]\s*$/.test(s) || /^\s*R\$\s*[-−]/.test(s);
    s = s.replace(/[^\d.,]/g, '');
    if (!/\d/.test(s)) return NaN;
    var lc = s.lastIndexOf(','), ld = s.lastIndexOf('.');
    if (lc >= 0 && ld >= 0) {
      s = lc > ld ? s.replace(/\./g, '').replace(',', '.') : s.replace(/,/g, '');
    } else if (lc >= 0) {
      s = (s.match(/,/g).length > 1) ? s.replace(/,/g, '') : s.replace(',', '.');
    } else if (ld >= 0) {
      if (!dotDecimal && /^\d{1,3}(\.\d{3})+$/.test(s)) s = s.replace(/\./g, '');
      else if (s.match(/\./g).length > 1) s = s.replace(/\./g, '');
    }
    var v = parseFloat(s);
    if (isNaN(v)) return NaN;
    var c = Math.round(v * 100);
    return neg ? -c : c;
  }

  function parseData(str, compacta) {
    var s = String(str == null ? '' : str).trim(), m, d, mo, y;
    if ((m = s.match(/^(\d{4})-(\d{2})-(\d{2})/))) { y = +m[1]; mo = +m[2]; d = +m[3]; }
    else if ((m = s.match(/^(\d{1,2})[\/.\-](\d{1,2})[\/.\-](\d{4})/))) { d = +m[1]; mo = +m[2]; y = +m[3]; }
    else if ((m = s.match(/^(\d{1,2})[\/.\-](\d{1,2})[\/.\-](\d{2})(?!\d)/))) { d = +m[1]; mo = +m[2]; y = 2000 + (+m[3]); }
    else if (compacta && (m = s.match(/^(\d{4})(\d{2})(\d{2})/))) { y = +m[1]; mo = +m[2]; d = +m[3]; }
    else return null;
    if (mo < 1 || mo > 12 || d < 1 || d > 31 || y < 1990 || y > 2100) return null;
    return y + '-' + pad(mo) + '-' + pad(d);
  }

  function decodeBuf(buf) {
    var u8 = new Uint8Array(buf);
    try { return new TextDecoder('utf-8', { fatal: true }).decode(u8).replace(/^﻿/, ''); } catch (e) { /* tenta outra */ }
    try { return new TextDecoder('windows-1252').decode(u8); } catch (e2) { /* manual */ }
    var out = '', i;
    for (i = 0; i < u8.length; i++) out += String.fromCharCode(u8[i]);
    return out;
  }

  function tagVal(blk, tag) {
    var m = blk.match(new RegExp('<' + tag + '>\\s*([^<\\r\\n]*)', 'i'));
    return m ? m[1].trim() : '';
  }
  function unent(s) { return s.replace(/&amp;/gi, '&').replace(/&lt;/gi, '<').replace(/&gt;/gi, '>').replace(/&quot;/gi, '"').replace(/&apos;|&#39;/gi, "'"); }

  function parseOFX(text) {
    var rows = [], m;
    var re = /<STMTTRN>([\s\S]*?)(?=<\/STMTTRN>|<STMTTRN>|<\/BANKTRANLIST>|<\/CCSTMTTRNRS>|<\/STMTRS>|$)/gi;
    while ((m = re.exec(text))) {
      var b = m[1];
      var data = parseData(tagVal(b, 'DTPOSTED'), true) || parseData(tagVal(b, 'DTUSER'), true);
      var cents = parseNum(tagVal(b, 'TRNAMT'), true);
      if (!data || isNaN(cents) || cents === 0) continue;
      var memo = unent(tagVal(b, 'MEMO')), name = unent(tagVal(b, 'NAME'));
      var desc = memo && name && normDesc(memo) !== normDesc(name) ? name + ' · ' + memo : (memo || name);
      rows.push({ data: data, hora: '', cents: cents, banco: desc, tipoOp: '', origem: desc, extra: '', fitid: tagVal(b, 'FITID') || null });
    }
    return rows;
  }

  function splitCSV(text, d) {
    var rows = [], row = [], cur = '', q = false, i, c;
    for (i = 0; i < text.length; i++) {
      c = text.charAt(i);
      if (q) {
        if (c === '"') { if (text.charAt(i + 1) === '"') { cur += '"'; i++; } else q = false; }
        else cur += c;
      } else if (c === '"') q = true;
      else if (c === d) { row.push(cur); cur = ''; }
      else if (c === '\n') { row.push(cur); rows.push(row); row = []; cur = ''; }
      else if (c !== '\r') cur += c;
    }
    if (cur !== '' || row.length) { row.push(cur); rows.push(row); }
    return rows;
  }

  function parseCSV(text) {
    var head = text.split(/\r?\n/).slice(0, 25).join('\n');
    var cs = (head.match(/;/g) || []).length, cc = (head.match(/,/g) || []).length, ct = (head.match(/\t/g) || []).length;
    var d = ct > cs && ct > cc ? '\t' : (cs >= cc && cs > 0 ? ';' : ',');
    var tab = splitCSV(text, d).filter(function (r) { return r.some(function (c) { return String(c).trim() !== ''; }); });
    var hi = -1, i, k;
    for (i = 0; i < Math.min(tab.length, 40) && hi < 0; i++) {
      var cells = tab[i].map(normDesc);
      var hasD = cells.some(function (c) { return /^(data|date|dt)\b/.test(c); });
      var hasV = cells.some(function (c) { return /(valor|amount|quantia|debito|credito|entrada|saida)/.test(c) && !/saldo/.test(c); });
      if (hasD && hasV) hi = i;
    }
    var iDate = -1, iVal = -1, iDeb = -1, iCre = -1, iDesc = [], iTipo = -1, iHora = -1, iExtra = [], start = 0;
    if (hi >= 0) {
      start = hi + 1;
      tab[hi].map(normDesc).forEach(function (c, idx) {
        if (/^(data|date|dt)\b/.test(c)) { if (iDate < 0 && !/(saldo|venc|contab|balan)/.test(c)) iDate = idx; }
        else if (/saldo/.test(c)) { /* ignora */ }
        else if (iHora < 0 && /^(hora|horario|time)\b/.test(c)) iHora = idx;
        else if (iTipo < 0 && /^(tipo|operacao|transacao|natureza|movimentacao)\b/.test(c)) iTipo = idx;
        else if (iVal < 0 && /^(valor|amount|quantia|value)\b/.test(c)) iVal = idx;
        else if (iDeb < 0 && /(debito|saida|debit)/.test(c)) iDeb = idx;
        else if (iCre < 0 && /(credito|entrada|credit)/.test(c)) iCre = idx;
        else if (/(descri|historico|memo|title|titulo|estabelecimento|detalhe|lancamento|favorecido|nome|beneficiario)/.test(c) && !/^(identificador|id)\b/.test(c)) iDesc.push(idx);
      });
    } else {
      var sample = tab.slice(0, 30);
      var nc = 0;
      sample.forEach(function (r) { if (r.length > nc) nc = r.length; });
      var ratio = function (col, fn) {
        var ok = 0, tot = 0;
        sample.forEach(function (r) { var v = String(r[col] == null ? '' : r[col]).trim(); if (v) { tot++; if (fn(v)) ok++; } });
        return tot ? ok / tot : 0;
      };
      for (k = 0; k < nc && iDate < 0; k++) if (ratio(k, function (v) { return !!parseData(v, false); }) >= 0.6) iDate = k;
      for (k = 0; k < nc && iVal < 0; k++) {
        if (k !== iDate && ratio(k, function (v) { return !isNaN(parseNum(v, false)) && /[.,]\d{1,2}\s*$/.test(v); }) >= 0.6) iVal = k;
      }
      var isHora = function (v) { return /^\d{1,2}:\d{2}(:\d{2})?$/.test(v); };
      for (k = 0; k < nc && iHora < 0; k++) if (k !== iDate && k !== iVal && ratio(k, isHora) >= 0.6) iHora = k;
      var txt = [];
      for (k = 0; k < nc; k++) {
        if (k === iDate || k === iVal || k === iHora) continue;
        var any = false;
        sample.forEach(function (r) { if (String(r[k] == null ? '' : r[k]).trim()) any = true; });
        if (!any) continue;
        if (ratio(k, function (v) { return !isNaN(parseNum(v, false)); }) >= 0.5) continue;
        txt.push(k);
      }
      if (txt.length >= 2) { iTipo = txt[0]; iDesc = [txt[1]]; iExtra = txt.slice(2); }
      else if (txt.length === 1) iDesc = [txt[0]];
    }
    if (iDate < 0 || (iVal < 0 && iDeb < 0 && iCre < 0)) return [];
    var out = [];
    for (i = start; i < tab.length; i++) {
      var r = tab[i], data = parseData(r[iDate], false);
      if (!data) continue;
      var cents;
      if (iVal >= 0) cents = parseNum(r[iVal], false);
      else {
        var cr = iCre >= 0 ? parseNum(r[iCre], false) : NaN, db = iDeb >= 0 ? parseNum(r[iDeb], false) : NaN;
        cents = (isNaN(cr) && isNaN(db)) ? NaN : (isNaN(cr) ? 0 : Math.abs(cr)) - (isNaN(db) ? 0 : Math.abs(db));
      }
      if (isNaN(cents) || cents === 0) continue;
      var cel = function (col) { return String(r[col] == null ? '' : r[col]).trim(); };
      var parts = [];
      iDesc.forEach(function (col) { var v = cel(col); if (v && parts.indexOf(v) < 0) parts.push(v); });
      var origem = parts.join(' · ');
      var tipoOp = iTipo >= 0 ? cel(iTipo) : '';
      var extra = iExtra.map(cel).filter(function (v, q, a) { return v && a.indexOf(v) === q; }).join(' · ');
      var hm = iHora >= 0 ? cel(iHora).match(/^\d{1,2}:\d{2}/) : null;
      var desc = [tipoOp, origem, extra].filter(Boolean).join(' · ');
      if (/^saldo\b|saldo (anterior|do dia|final|inicial|disponivel)/.test(normDesc(desc))) continue;
      out.push({ data: data, hora: hm ? hm[0] : '', cents: cents, banco: desc, tipoOp: tipoOp, origem: origem, extra: extra, fitid: null });
    }
    return out;
  }


  /* ---------- PDF ---------- */
  var RE_VAL = /^[-−+]?\s*(R\$\s*)?\d{1,3}(\.\d{3})*,\d{2}\s*[-−]?\s*[CD]?$/i;
  var RE_DATA = /^(\d{2})\/(\d{2})(?:\/(\d{2,4}))?$/;
  var RE_LIXO = /^(saldo|total|p[aá]gina|folha|extrato|ag[eê]ncia|conta|ouvidoria|sac\b|deficiente|data\b|hist[oó]rico|cr[eé]dito|d[eé]bito|docto|nome|cpf|per[ií]odo|bradesco|lan[cç]amentos?|[uú]ltimos)/i;

  function pdfCelulas(itens) {
    itens = itens.filter(function (t) { return t.str && t.str.trim(); }).sort(function (a, b) { return a.x - b.x; });
    var cels = [];
    itens.forEach(function (t) {
      var u = cels[cels.length - 1];
      if (u && t.x - u.xe < 4) { u.str += (t.x - u.xe > 1 ? ' ' : '') + t.str; u.xe = t.xe; }
      else cels.push({ x: t.x, xe: t.xe, str: t.str });
    });
    cels.forEach(function (c) { c.str = c.str.replace(/\s+/g, ' ').trim(); });
    return cels;
  }

  function pdfLinhas(itens) {
    var ord = itens.slice().sort(function (a, b) { return b.y - a.y || a.x - b.x; });
    var linhas = [];
    ord.forEach(function (t) {
      var l = linhas[linhas.length - 1];
      if (l && Math.abs(l.y - t.y) <= 2) l.itens.push(t); else linhas.push({ y: t.y, itens: [t] });
    });
    return linhas.map(function (l) { var c = pdfCelulas(l.itens); c.y = l.y; return c; }).filter(function (c) { return c.length; });
  }

  /* paginas: lista de listas de itens {x, xe, y, str}. Devolve linhas no mesmo formato do CSV/OFX.
     O texto de cada lançamento pode estar na mesma linha do valor, acima (tipo) ou abaixo (nome). */
  function parsePdf(paginas) {
    var out = [], ano = null, data = null, col = null;
    var todo = paginas.map(pdfLinhas);
    todo.forEach(function (ls) { ls.forEach(function (c) {
      var t = c.map(function (x) { return x.str; }).join(' ');
      var m = t.match(/(?:per[ií]odo|de)\s*:?\s*\d{2}\/\d{2}\/(\d{4})/i) || t.match(/\d{2}\/\d{2}\/(\d{4})/);
      if (!ano && m) ano = +m[1];
    }); });
    if (!ano) ano = new Date().getFullYear();

    todo.forEach(function (linhas) {
      var txs = [], textos = [];
      linhas.forEach(function (c) {
        var txt = c.map(function (x) { return x.str; }).join(' ');
        var nt = normDesc(txt);
        if (/cr[eé]dito/i.test(txt) && /d[eé]bito/i.test(txt)) {
          col = {};
          c.forEach(function (x) {
            if (/cr[eé]dito/i.test(x.str)) col.cred = x.xe;
            else if (/d[eé]bito/i.test(x.str)) col.deb = x.xe;
            else if (/saldo/i.test(x.str)) col.saldo = x.xe;
            else if (/hist[oó]rico/i.test(x.str)) col.hist = x.x;
          });
          return;
        }
        var dm = RE_DATA.exec(c[0].str);
        var vals = c.filter(function (x) { return RE_VAL.test(x.str); });
        if (dm) { var d = parseData(dm[3] ? dm[0] : dm[0] + '/' + ano); if (d) data = d; }
        if (/^saldo\b|saldo (anterior|do dia|final|inicial|disponivel)|^total\b/.test(nt)) return;
        if (vals.length && data) {
          var alvo = null, sinal = 0;
          if (col && (col.cred || col.deb)) {
            vals.forEach(function (v) {
              if (alvo) return;
              var best = null, bd = 1e9;
              [['cred', 1], ['deb', -1], ['saldo', 0]].forEach(function (k) {
                if (col[k[0]] == null) return;
                var dd = Math.abs(v.xe - col[k[0]]);
                if (dd < bd) { bd = dd; best = k; }
              });
              if (best && best[1] !== 0 && bd < 60) { alvo = v; sinal = best[1]; }
            });
          } else {
            alvo = vals[0];
            var sv = alvo.str;
            sinal = /[-−]/.test(sv) || /D$/i.test(sv) ? -1 : (/^\+|C$/i.test(sv) ? 1 : 0);
            if (!sinal) alvo = null;
          }
          if (!alvo) return;
          var cents = parseNum(alvo.str.replace(/[-−+]/g, '').replace(/\s*[CD]$/i, ''), false);
          if (isNaN(cents) || !cents) return;
          var desc = c.filter(function (x) { return x !== alvo && vals.indexOf(x) < 0 && !RE_DATA.test(x.str) && !/^\d+$/.test(x.str.replace(/\s/g, '')); });
          txs.push({ y: c.y, data: data, cents: sinal * Math.abs(cents), own: desc.map(function (x) { return x.str; }).join(' '), x: desc.length ? desc[0].x : (col && col.hist != null ? col.hist : null), pre: [], post: [] });
          return;
        }
        if (!vals.length && !dm && !RE_LIXO.test(txt)) textos.push({ y: c.y, x: c[0].x, txt: txt });
      });
      textos.forEach(function (t) {
        var best = null, bd = 13;
        txs.forEach(function (x) {
          var dy = Math.abs(t.y - x.y);
          if (dy < bd && (x.x == null || Math.abs(t.x - x.x) < 25)) { bd = dy; best = x; }
        });
        if (!best) return;
        (t.y > best.y ? best.pre : best.post).push(t);
      });
      txs.forEach(function (x) {
        x.pre.sort(function (a, b) { return b.y - a.y; }); x.post.sort(function (a, b) { return b.y - a.y; });
        var tipoOp = x.pre.map(function (t) { return t.txt; }).concat(x.own ? [x.own] : []).join(' ');
        var origem = x.post.map(function (t) { return t.txt; }).join(' ')
          .replace(/\s+\d{1,2}\/\d{2}(\/\d{2,4})?\s*$/, '')
          .replace(/^(remetente|remet|rem|des|destinat[aá]rio|favorecido)\.?\s*:?\s*/i, '').trim();
        if (!origem) { origem = tipoOp; tipoOp = ''; }
        out.push({ data: x.data, hora: '', cents: x.cents, banco: [tipoOp, origem].filter(Boolean).join(' · '), tipoOp: tipoOp, origem: origem, extra: '', fitid: null });
      });
    });
    return out;
  }

  var pdfPronto = null;
  function pdfCarregar() {
    if (window.pdfjsLib) return Promise.resolve(window.pdfjsLib);
    if (pdfPronto) return pdfPronto;
    pdfPronto = new Promise(function (ok, no) {
      var sc = document.createElement('script');
      sc.src = 'lib/pdf.min.js';
      sc.onload = function () { window.pdfjsLib.GlobalWorkerOptions.workerSrc = 'lib/pdf.worker.min.js'; ok(window.pdfjsLib); };
      sc.onerror = function () { pdfPronto = null; no(new Error('sem leitor de PDF')); };
      document.head.appendChild(sc);
    });
    return pdfPronto;
  }

  function lerPdf(buf) {
    return pdfCarregar().then(function (lib) {
      var tarefa = lib.getDocument({ data: new Uint8Array(buf) });
      tarefa.onPassword = function (update, motivo) {
        var senha = window.prompt(motivo === 2 ? 'Senha incorreta. Digite a senha do PDF:' : 'Este PDF tem senha. Digite a senha (no Bradesco costuma ser o CPF, só números):');
        if (senha) update(senha); else tarefa.destroy();
      };
      return tarefa.promise.then(function (doc) {
        var pags = [], n;
        var seq = Promise.resolve();
        for (n = 1; n <= Math.min(doc.numPages, 60); n++) {
          (function (num) {
            seq = seq.then(function () { return doc.getPage(num); }).then(function (pg) { return pg.getTextContent(); }).then(function (tc) {
              pags.push(tc.items.map(function (t) { return { x: t.transform[4], xe: t.transform[4] + (t.width || 0), y: t.transform[5], str: t.str }; }));
            });
          })(n);
        }
        return seq.then(function () { return parsePdf(pags); });
      });
    });
  }

  function parseExtrato(text) { return /<STMTTRN>/i.test(text) ? parseOFX(text) : parseCSV(text); }

  function diasEntre(a, b) {
    var pa = a.split('-').map(Number), pb = b.split('-').map(Number);
    return Math.abs(Math.round((Date.UTC(pa[0], pa[1] - 1, pa[2]) - Date.UTC(pb[0], pb[1] - 1, pb[2])) / 86400000));
  }

  /* separa o que já foi lançado do que falta classificar */
  function computeImp(imp) {
    var seen = {};
    var rows = imp.raw.map(function (r) {
      var base = r.fitid ? 'f:' + r.fitid : 'h:' + r.data + '|' + r.cents + '|' + normDesc(r.banco);
      seen[base] = (seen[base] || 0) + 1;
      return { data: r.data, hora: r.hora || '', cents: r.cents, banco: r.banco || '', tipoOp: r.tipoOp || '', origem: r.origem || '', extra: r.extra || '', key: base + (seen[base] > 1 ? '#' + seen[base] : '') };
    });
    var pool = state.lanc.map(function (l) { return { l: l, used: false }; });
    var extSet = {};
    state.lanc.forEach(function (l) { if (l.ext) extSet[l.ext] = 1; });
    var items = [], skipped = [];
    var meta = rows.map(function (r) {
      var neg = r.cents < 0, desp = imp.invert ? !neg : neg;
      return { r: r, tipo: desp ? 'despesa' : 'receita', cents: Math.abs(r.cents), skip: null };
    });
    meta.forEach(function (x) {
      if (extSet[x.r.key]) {
        x.skip = 'já importado antes';
        for (var i = 0; i < pool.length; i++) if (!pool[i].used && pool[i].l.ext === x.r.key) { pool[i].used = true; break; }
      }
    });
    meta.forEach(function (x) {
      if (x.skip) return;
      for (var i = 0; i < pool.length; i++) {
        var p = pool[i];
        if (!p.used && p.l.tipo === x.tipo && p.l.centavos === x.cents && p.l.data === x.r.data) {
          p.used = true; x.skip = 'já lançado por você'; break;
        }
      }
    });
    meta.forEach(function (x) {
      if (x.skip) { skipped.push({ data: x.r.data, cents: x.cents, tipo: x.tipo, banco: x.r.banco, tipoOp: x.r.tipoOp, origem: x.r.origem, extra: x.r.extra, motivo: x.skip }); return; }
      var sim = null, i;
      for (i = 0; i < pool.length && !sim; i++) {
        var p = pool[i];
        if (!p.used && p.l.tipo === x.tipo && p.l.centavos === x.cents && diasEntre(p.l.data, x.r.data) <= 3) {
          sim = { data: p.l.data, categoria: p.l.categoria, obs: p.l.obs || '' };
        }
      }
      items.push({ key: x.r.key, data: x.r.data, hora: x.r.hora, cents: x.cents, banco: x.r.banco, tipoOp: x.r.tipoOp, origem: x.r.origem, extra: x.r.extra, tipo: x.tipo, categoria: null, obs: '', status: 'pend', similar: sim });
    });
    items.sort(function (a, b) { return a.data.localeCompare(b.data) || (a.hora || '').localeCompare(b.hora || ''); });
    imp.items = items; imp.skipped = skipped; imp.idx = 0; imp.edit = null; imp.novaCat = false;
  }

  function impGo(i) {
    var imp = state.imp;
    imp.idx = Math.max(0, Math.min(i, imp.items.length - 1));
    imp.novaCat = false;
    state.obsDraft = imp.items[imp.idx].obs || '';
  }
  function impNext() {
    var imp = state.imp, n = imp.items.length, k, i;
    for (k = 1; k <= n; k++) {
      i = (imp.idx + k) % n;
      if (imp.items[i].status === 'pend') { impGo(i); return; }
    }
    imp.stage = 'revisao'; imp.edit = null;
  }
  function sinal(tipo) { return tipo === 'receita' ? '+' : MINUS; }
  function bancoTxt(x) { return [x.tipoOp, x.origem, x.extra].filter(Boolean).join(' · ') || x.banco || ''; }
  function bancoHtml(x) {
    if (!x.tipoOp && !x.origem && !x.extra) return x.banco ? '<span class="who">' + esc(x.banco) + '</span>' : '';
    return (x.tipoOp ? '<span class="optag">' + esc(x.tipoOp) + '</span>' : '') +
      (x.origem ? '<span class="who">' + esc(x.origem) + '</span>' : '') +
      (x.extra ? '<span class="xtra">' + esc(x.extra) + '</span>' : '');
  }

  /* telas */
  function impInicio() {
    return '<h2>Importar extrato</h2>' +
      '<p class="hint" style="margin-top:8px">Escolha o arquivo do extrato do seu banco, em PDF, OFX ou CSV. O app lê a data e o valor, deixa de fora o que você já lançou e mostra um lançamento por vez para você só tocar na categoria.</p>' +
      '<p class="hint">Na maioria dos bancos: app do banco, Extrato, Exportar ou Baixar, e escolha PDF, OFX ou CSV.</p>' +
      '<label class="chk"><input type="checkbox" id="iinvert"' + (state.impInvert ? ' checked' : '') + '><span>Os valores positivos são gastos (comum em fatura de cartão)</span></label>' +
      '<div class="impbtns"><button type="button" class="primary" data-act="pick">Escolher arquivo do extrato</button></div>' +
      (state.impErr ? '<p class="warn" role="alert">' + esc(state.impErr) + '</p>' : '');
  }

  function impResumo(imp) {
    var datas = imp.raw.map(function (r) { return r.data; }).sort();
    var sk = imp.skipped.length, n = imp.raw.length;
    var h = '<h2>Extrato lido</h2><p class="hint" style="margin:6px 0 0">' + esc(imp.fileName || '') +
      (datas.length ? ' · ' + esc(diaCurto(datas[0], true)) + ' a ' + esc(diaCurto(datas[datas.length - 1], true)) : '') + '</p>';
    h += '<ul class="impstats"><li><b>' + n + '</b> movimentações no arquivo</li>' +
      '<li><b>' + sk + '</b> já estavam lançadas e ficam de fora</li>' +
      '<li><b>' + imp.items.length + '</b> para classificar</li></ul>';
    h += '<label class="chk"><input type="checkbox" id="iinvert"' + (imp.invert ? ' checked' : '') + '><span>Os valores positivos são gastos (comum em fatura de cartão)</span></label>';
    if (sk) {
      h += '<details class="impdet"><summary>Ver as ' + sk + ' que já estavam lançadas</summary><ul>' + imp.skipped.map(function (s) {
        return '<li>' + esc(diaCurto(s.data, true)) + ' · ' + sinal(s.tipo) + fmt(s.cents) + (bancoTxt(s) ? ' · ' + esc(bancoTxt(s)) : '') + ' <span>(' + esc(s.motivo) + ')</span></li>';
      }).join('') + '</ul></details>';
    }
    h += '<div class="impbtns">' + (imp.items.length
      ? '<button type="button" class="primary" data-act="start">Começar a classificar</button>'
      : '<p style="margin:0;align-self:center">Tudo neste arquivo já estava lançado. Não há nada a fazer.</p>') +
      '<button type="button" class="secondary" data-act="discard">Escolher outro arquivo</button></div>';
    return h;
  }

  function catBtns(tipo, sel) {
    return '<div class="cats ' + (tipo === 'despesa' ? 'd' : 'r') + '" role="group" aria-label="Categorias">' +
      catsFor(tipo).map(function (c) {
        return '<button type="button" data-act="cat" data-c="' + esc(c) + '"' + (c === sel ? ' class="sel"' : '') + '>' + esc(c) + '</button>';
      }).join('') + '<button type="button" class="add" data-act="newcat">+ Nova</button></div>';
  }

  function impTriagem(imp) {
    var it = imp.items[imp.idx], total = imp.items.length;
    var feitos = imp.items.filter(function (x) { return x.status !== 'pend'; }).length;
    var cls = it.tipo === 'despesa' ? 'd' : 'r';
    var h = '<div class="tri-prog" aria-hidden="true"><i style="width:' + Math.round(feitos / total * 100) + '%"></i></div>';
    h += '<div class="iseg" role="group" aria-label="Tipo de lançamento">' +
      '<button type="button" data-act="tipo" data-itipo="despesa" aria-pressed="' + (it.tipo === 'despesa') + '">Despesa</button>' +
      '<button type="button" data-act="tipo" data-itipo="receita" aria-pressed="' + (it.tipo === 'receita') + '">Receita</button></div>';
    h += '<div class="tri-info"><div class="tri-line"><span class="tri-n">' + (imp.idx + 1) + ' de ' + total + (feitos ? ' · ' + feitos + ' feitos' : '') + '</span>' +
      '<span class="tri-date">' + esc(labelDia(it.data) + (it.hora ? ' · ' + it.hora : '')) + '</span></div>' +
      '<div class="tri-amt num ' + cls + '">' + sinal(it.tipo) + fmt(it.cents) + '</div>' +
      (bancoTxt(it) ? '<div class="tri-bank"><div class="tri-what">' + bancoHtml(it) + '</div><button type="button" class="linkbtn" data-act="usebanco">' + (it.origem ? 'Usar o nome na observação' : 'Usar como observação') + '</button></div>' : '') +
      (it.similar ? '<div class="tri-sim">Parece com um lançamento seu de ' + esc(diaCurto(it.similar.data, true)) + ': ' + esc(it.similar.categoria) + (it.similar.obs ? ' (' + esc(it.similar.obs) + ')' : '') +
        '. <button type="button" class="linkbtn" data-act="same">É o mesmo, ignorar</button></div>' : '') +
      '</div>';
    h += '<div class="iobsw"><label class="vh" for="iobs">Observação (opcional)</label><input id="iobs" maxlength="140" autocomplete="off" placeholder="Observação (opcional)"></div>';
    if (imp.novaCat) {
      h += '<div class="newcat" style="margin-top:12px"><input id="inewcat" maxlength="24" placeholder="Nome da categoria" aria-label="Nome da nova categoria" style="height:46px;border-radius:10px;border:1px solid var(--line);background:var(--bg);padding:0 12px">' +
        '<button type="button" class="secondary" data-act="newcatok">Criar e usar</button></div>';
    }
    h += catBtns(it.tipo, it.status === 'ok' ? it.categoria : null);
    h += '<div class="tri-foot"><button type="button" class="ghost" data-act="back"' + (imp.idx === 0 ? ' disabled' : '') + '>← Voltar</button>' +
      '<button type="button" class="ghost" data-act="ign">Ignorar este</button>' +
      '<button type="button" class="ghost" data-act="toreview">Ir para o resumo</button></div>';
    return h;
  }

  function editorHtml(imp) {
    var d = imp.draft;
    var cats = catsFor(d.tipo);
    if (d.categoria && cats.indexOf(d.categoria) < 0) cats.push(d.categoria);
    return '<div class="ied">' +
      '<div class="iseg" role="group" aria-label="Tipo"><button type="button" data-act="ed-tipo" data-itipo="despesa" aria-pressed="' + (d.tipo === 'despesa') + '">Despesa</button>' +
      '<button type="button" data-act="ed-tipo" data-itipo="receita" aria-pressed="' + (d.tipo === 'receita') + '">Receita</button></div>' +
      '<div class="two"><div><label for="ed-valor">Valor</label><input id="ed-valor" class="num" inputmode="decimal" value="' + esc(d.valor) + '"></div>' +
      '<div><label for="ed-data">Data</label><input id="ed-data" type="date" value="' + esc(d.data) + '"></div></div>' +
      '<div><label for="ed-cat">Categoria</label><select id="ed-cat">' + cats.map(function (c) { return '<option value="' + esc(c) + '"' + (c === d.categoria ? ' selected' : '') + '>' + esc(c) + '</option>'; }).join('') + '</select></div>' +
      '<div><label for="ed-obs">Observação (opcional)</label><input id="ed-obs" maxlength="140" value="' + esc(d.obs) + '"></div>' +
      (d.err ? '<p class="warn" role="alert" style="margin:0">' + esc(d.err) + '</p>' : '') +
      '<div class="btns"><button type="button" class="primary" data-act="ed-save">Salvar</button><button type="button" class="secondary" data-act="ed-cancel">Cancelar</button></div></div>';
  }

  function impRevisao(imp) {
    var oks = [], pend = 0, ign = [];
    imp.items.forEach(function (it, i) { if (it.status === 'ok') oks.push(i); else if (it.status === 'pend') pend++; else ign.push(i); });
    var nd = 0, nr = 0, vd = 0, vr = 0;
    oks.forEach(function (i) { var it = imp.items[i]; if (it.tipo === 'despesa') { nd++; vd += it.cents; } else { nr++; vr += it.cents; } });
    var h = '<h2>Revise antes de lançar</h2><p class="hint" style="margin:6px 0 0">' + oks.length + ' lançamentos: ' +
      nd + (nd === 1 ? ' despesa' : ' despesas') + ' (' + MINUS + fmt(vd) + ') e ' + nr + (nr === 1 ? ' receita' : ' receitas') + ' (+' + fmt(vr) + ').</p>';
    if (pend) h += '<div class="warn">Faltam ' + pend + ' sem classificar e eles não serão lançados. <button type="button" class="linkbtn" data-act="continue">Classificar agora</button></div>';
    oks.sort(function (a, b) { return imp.items[b].data.localeCompare(imp.items[a].data); });
    h += oks.length ? '<ul style="list-style:none;margin:12px 0 0;padding:0">' + oks.map(function (i) {
      var it = imp.items[i], cls = it.tipo === 'despesa' ? 'd' : 'r';
      var sub = diaCurto(it.data, true) + (it.hora ? ' · ' + it.hora : '') + (it.obs ? ' · ' + it.obs : '');
      return '<li class="irow"><span class="dot ' + cls + '"></span><div class="txt"><b>' + esc(it.categoria) + '</b><span class="obs">' + esc(sub) + '</span>' + (bancoTxt(it) ? '<span class="obs">' + esc(bancoTxt(it)) + '</span>' : '') + '</div>' +
        '<div class="amt num ' + cls + '">' + sinal(it.tipo) + fmt(it.cents) + '</div>' +
        '<div class="iact"><button type="button" class="ghost" data-act="edit" data-i="' + i + '">Alterar</button><button type="button" class="ghost" data-act="del" data-i="' + i + '">Apagar</button></div>' +
        (imp.edit === i && imp.draft ? editorHtml(imp) : '') + '</li>';
    }).join('') + '</ul>' : '<p class="empty">Nenhum lançamento para confirmar.</p>';
    if (ign.length) {
      h += '<details class="impdet"><summary>Apagados ou ignorados (' + ign.length + ')</summary><ul style="list-style:none;padding:0">' + ign.map(function (i) {
        var it = imp.items[i];
        return '<li class="irow"><span class="dot ' + (it.tipo === 'despesa' ? 'd' : 'r') + '"></span><div class="txt"><b>' + esc(diaCurto(it.data, true)) + '</b><span class="obs">' + esc(bancoTxt(it)) + '</span></div>' +
          '<div class="amt num">' + sinal(it.tipo) + fmt(it.cents) + '</div>' +
          '<div class="iact"><button type="button" class="ghost" data-act="reinc" data-i="' + i + '">Reincluir</button></div></li>';
      }).join('') + '</ul></details>';
    }
    h += '<div class="impbtns"><button type="button" class="primary" data-act="confirm"' + (oks.length ? '' : ' disabled') + '>Confirmar e lançar ' + oks.length + '</button>' +
      '<button type="button" class="secondary" data-act="continue">Voltar a classificar</button>' +
      '<button type="button" class="ghost" data-act="discard">Descartar importação</button></div>';
    return h;
  }

  function impFim(imp) {
    return '<h2>Pronto!</h2><p style="margin:8px 0 0"><b>' + imp.n + '</b> ' + (imp.n === 1 ? 'lançamento adicionado' : 'lançamentos adicionados') +
      (imp.n ? ': ' + MINUS + fmt(imp.desp) + ' em despesas e +' + fmt(imp.rec) + ' em receitas.' : '.') + '</p>' +
      '<div class="impbtns">' + (imp.mes ? '<button type="button" class="primary" data-act="gomes" data-m="' + esc(imp.mes) + '">Ver em ' + esc(labelMes(imp.mes).toLowerCase()) + '</button>' : '') +
      '<button type="button" class="secondary" data-act="again">Importar outro arquivo</button></div>';
  }

  function renderImp() {
    if (state.view !== 'imp') return;
    var el = $('impBox'), imp = state.imp;
    if (!state.pronto) { el.innerHTML = '<p class="empty">Carregando…</p>'; return; }
    el.innerHTML = imp.stage === 'resumo' ? impResumo(imp) :
      imp.stage === 'triagem' ? impTriagem(imp) :
      imp.stage === 'revisao' ? impRevisao(imp) :
      imp.stage === 'fim' ? impFim(imp) : impInicio();
    if (imp.stage === 'triagem') { var ob = $('iobs'); if (ob) ob.value = state.obsDraft || ''; }
  }

  function impRefresh() { impSave(); renderImp(); }

  function readDraft() {
    var imp = state.imp;
    if (imp.edit == null || !imp.draft || !$('ed-valor')) return;
    imp.draft.valor = $('ed-valor').value; imp.draft.data = $('ed-data').value;
    imp.draft.categoria = $('ed-cat').value; imp.draft.obs = $('ed-obs').value;
  }

  function impAct(act, t) {
    var imp = state.imp, it = imp.items ? imp.items[imp.idx] : null, i;
    if (act === 'pick') { $('fileExt').click(); return; }
    if (act === 'start') { imp.stage = 'triagem'; impGo(0); impNext_firstPending(); }
    else if (act === 'discard' || act === 'again') { state.imp = { stage: 'inicio' }; state.impErr = ''; }
    else if (act === 'tipo') { var ob = $('iobs'); state.obsDraft = ob ? ob.value : state.obsDraft; it.tipo = t.getAttribute('data-itipo'); imp.novaCat = false; }
    else if (act === 'usebanco') { var o2 = $('iobs'); var txt = it.origem || it.banco; if (o2) { o2.value = txt; state.obsDraft = txt; o2.focus(); } return; }
    else if (act === 'cat') {
      var o3 = $('iobs');
      it.categoria = t.getAttribute('data-c'); it.obs = (o3 ? o3.value : state.obsDraft || '').trim(); it.status = 'ok';
      impNext();
    }
    else if (act === 'newcat') { var o4 = $('iobs'); state.obsDraft = o4 ? o4.value : ''; imp.novaCat = !imp.novaCat; }
    else if (act === 'newcatok') {
      var nome = ($('inewcat') ? $('inewcat').value : '').trim();
      if (!nome) return;
      var o5 = $('iobs'), existente = catsFor(it.tipo).filter(function (c) { return c.toLowerCase() === nome.toLowerCase(); })[0];
      if (!existente) { state.custom[it.tipo].push(nome); store.saveCats(); }
      it.categoria = existente || nome; it.obs = (o5 ? o5.value : state.obsDraft || '').trim(); it.status = 'ok';
      fillCats(); impNext();
    }
    else if (act === 'back') { if (imp.idx > 0) impGo(imp.idx - 1); }
    else if (act === 'ign' || act === 'same') { it.status = 'ign'; impNext(); }
    else if (act === 'toreview') { imp.stage = 'revisao'; imp.edit = null; }
    else if (act === 'continue') {
      imp.stage = 'triagem';
      var firstPend = -1;
      imp.items.forEach(function (x, k) { if (firstPend < 0 && x.status === 'pend') firstPend = k; });
      impGo(firstPend >= 0 ? firstPend : imp.idx);
    }
    else if (act === 'edit') {
      i = +t.getAttribute('data-i'); var x = imp.items[i];
      imp.edit = i; imp.draft = { tipo: x.tipo, valor: (x.cents / 100).toFixed(2).replace('.', ','), data: x.data, categoria: x.categoria, obs: x.obs };
    }
    else if (act === 'ed-tipo') {
      readDraft(); imp.draft.tipo = t.getAttribute('data-itipo');
      if (catsFor(imp.draft.tipo).indexOf(imp.draft.categoria) < 0) imp.draft.categoria = 'Outros';
    }
    else if (act === 'ed-cancel') { imp.edit = null; imp.draft = null; }
    else if (act === 'ed-save') {
      readDraft();
      var c = parseValor(imp.draft.valor), dt = parseData(imp.draft.data, false);
      if (!(c > 0) || !dt) { imp.draft.err = 'Informe um valor maior que zero e uma data válida.'; impRefresh(); return; }
      var y = imp.items[imp.edit];
      y.tipo = imp.draft.tipo; y.cents = c; y.data = dt; y.categoria = imp.draft.categoria; y.obs = (imp.draft.obs || '').trim();
      imp.edit = null; imp.draft = null;
    }
    else if (act === 'del') { imp.items[+t.getAttribute('data-i')].status = 'ign'; if (imp.edit === +t.getAttribute('data-i')) imp.edit = null; }
    else if (act === 'reinc') { i = +t.getAttribute('data-i'); imp.items[i].status = 'pend'; imp.stage = 'triagem'; impGo(i); }
    else if (act === 'confirm') { impConfirm(); return; }
    else if (act === 'gomes') { state.mes = t.getAttribute('data-m'); state.view = 'mes'; state.imp = { stage: 'inicio' }; impSave(); render(); return; }
    impRefresh();
  }

  function impNext_firstPending() {
    var imp = state.imp, k;
    for (k = 0; k < imp.items.length; k++) if (imp.items[k].status === 'pend') { impGo(k); return; }
  }

  function impConfirm() {
    var imp = state.imp, extSet = {}, recs = [], n = 0, vd = 0, vr = 0, ultimo = '';
    state.lanc.forEach(function (l) { if (l.ext) extSet[l.ext] = 1; });
    imp.items.forEach(function (it, i) {
      if (it.status !== 'ok' || extSet[it.key]) return;
      recs.push({ tipo: it.tipo, centavos: it.cents, categoria: it.categoria, data: it.data, obs: it.obs || '', criadoEm: Date.now() + i, ext: it.key, banco: it.banco || '', hora: it.hora || '' });
      n++; if (it.tipo === 'despesa') vd += it.cents; else vr += it.cents;
      if (it.data > ultimo) ultimo = it.data;
    });
    store.addMany(recs).then(function () {
      state.imp = { stage: 'fim', n: n, desp: vd, rec: vr, mes: ultimo ? mesDe(ultimo) : '' };
      impSave(); render();
    });
  }

  function impArquivo(file) {
    state.impErr = '';
    if (file.size > 8 * 1024 * 1024) { state.impErr = 'O arquivo é grande demais. Use o extrato de um período menor.'; render(); return; }
    var rd = new FileReader();
    function pronto(raw, msgVazio) {
      if (!raw.length) {
        state.impErr = msgVazio || 'Não consegui ler movimentações neste arquivo. Use o extrato em PDF, OFX ou CSV, com data e valor em cada linha.';
      } else {
        var imp = { stage: 'resumo', fileName: file.name, raw: raw.slice(0, 3000), invert: !!state.impInvert };
        computeImp(imp);
        state.imp = imp;
      }
      $('fileExt').value = '';
      impSave(); render();
    }
    rd.onload = function () {
      var u8 = new Uint8Array(rd.result.slice(0, 5));
      var ehPdf = String.fromCharCode.apply(null, u8).indexOf('%PDF') === 0;
      if (ehPdf) {
        state.impErr = 'Lendo o PDF…'; render();
        lerPdf(rd.result).then(function (raw) { state.impErr = ''; pronto(raw, 'Não encontrei movimentações neste PDF. Se o banco oferece o extrato em OFX, use esse arquivo.'); })
          .catch(function () { pronto([], 'Não consegui abrir este PDF (senha incorreta, ou o leitor não carregou sem internet na primeira vez).'); });
        return;
      }
      var raw = [];
      try { raw = parseExtrato(decodeBuf(rd.result)); } catch (e) { raw = []; }
      pronto(raw);
    };
    rd.onerror = function () { state.impErr = 'Não foi possível abrir o arquivo.'; render(); };
    rd.readAsArrayBuffer(file);
  }

  function renderFoot() {
    $('foot').textContent = !state.pronto ? '' :
      'Seus lançamentos ficam salvos só neste aparelho. Use o backup abaixo para guardar uma cópia ou levar para outro aparelho.';
  }

  function fillCats(keep) {
    var sel = $('cat');
    var cur = keep || sel.value;
    var cats = catsFor(state.tipo);
    sel.innerHTML = cats.map(function (c) { return '<option value="' + esc(c) + '">' + esc(c) + '</option>'; }).join('') +
      '<option value="__nova__">+ Nova categoria…</option>';
    sel.value = cats.indexOf(cur) >= 0 ? cur : cats[0];
  }

  function renderForm() {
    $('tDespesa').setAttribute('aria-pressed', state.tipo === 'despesa' ? 'true' : 'false');
    $('tReceita').setAttribute('aria-pressed', state.tipo === 'receita' ? 'true' : 'false');
    $('btnAdd').textContent = 'Adicionar ' + state.tipo;
    $('btnAdd').disabled = !state.pronto;
    $('obs').placeholder = state.tipo === 'despesa' ? 'Ex.: mercado, gasolina, conta de luz' : 'Ex.: salário de outubro, reembolso do plano';
  }

  function render() { renderView(); renderHead(); renderSum(); renderChart(); renderList(); renderBrk(); renderFoot(); renderPer(); renderStats(); renderImp(); }

  var rsz; window.addEventListener('resize', function () { clearTimeout(rsz); rsz = setTimeout(function () { renderChart(); renderPer(); renderStats(); }, 150); });

  /* ---------- armazenamento ---------- */
  var LS = 'livro-caixa-v1';
  function localStore() {
    function load() {
      try {
        var r = JSON.parse(localStorage.getItem(LS) || 'null');
        if (r && Array.isArray(r.lanc)) { state.lanc = r.lanc; state.custom = r.custom || state.custom; }
      } catch (e) { /* sem armazenamento */ }
    }
    function save() { try { localStorage.setItem(LS, JSON.stringify({ lanc: state.lanc, custom: state.custom })); } catch (e) { /* ignora */ } }
    load();
    return {
      add: function (rec) { rec.id = Date.now().toString(36) + Math.random().toString(36).slice(2, 6); state.lanc.push(rec); save(); render(); return Promise.resolve(); },
      remove: function (id) { state.lanc = state.lanc.filter(function (l) { return l.id !== id; }); save(); render(); return Promise.resolve(); },
      addMany: function (recs) {
        recs.forEach(function (rec) { rec.id = Date.now().toString(36) + Math.random().toString(36).slice(2, 7); state.lanc.push(rec); });
        save(); render(); return Promise.resolve();
      },
      saveCats: function () { save(); return Promise.resolve(); }
    };
  }

  function start() {
    state.modo = 'local';
    store = localStore();
    state.pronto = true;
    state.imp = impLoad() || state.imp;
    fillCats(); renderForm(); render();
  }

  /* ---------- eventos ---------- */
  function say(text, cls) {
    var m = $('msg');
    m.textContent = text; m.className = cls || '';
    if (cls === 'ok') setTimeout(function () { if (m.textContent === text) { m.textContent = ''; m.className = ''; } }, 3000);
  }

  function setTipo(t) {
    state.tipo = t; state.aba = t;
    $('newcatRow').hidden = true;
    fillCats(); renderForm(); renderBrk();
  }

  function addCat() {
    var nome = $('newcat').value.trim();
    if (!nome) { say('Digite o nome da categoria.', 'err'); return; }
    var lista = catsFor(state.tipo);
    var igual = lista.filter(function (c) { return c.toLowerCase() === nome.toLowerCase(); })[0];
    if (!igual) {
      state.custom[state.tipo].push(nome);
      if (store) store.saveCats().catch(function () { say('Não foi possível salvar a categoria.', 'err'); });
    }
    $('newcat').value = ''; $('newcatRow').hidden = true;
    fillCats(igual || nome);
    say('', '');
  }

  document.addEventListener('click', function (e) {
    var t = e.target.closest ? e.target.closest('[data-nav],[data-tipo],[data-aba],[data-gomes],[data-del],[data-ok],[data-no]') : null;
    if (!t) return;
    if (t.hasAttribute('data-nav')) {
      var n = t.getAttribute('data-nav');
      state.mes = n === 'hoje' ? hoje().slice(0, 7) : shiftMes(state.mes, Number(n));
      state.pendente = null; render();
    } else if (t.hasAttribute('data-tipo')) {
      setTipo(t.getAttribute('data-tipo'));
    } else if (t.hasAttribute('data-aba')) {
      state.aba = t.getAttribute('data-aba'); renderBrk();
    } else if (t.hasAttribute('data-gomes')) {
      state.mes = t.getAttribute('data-gomes'); state.pendente = null; render();
    } else if (t.hasAttribute('data-del')) {
      state.pendente = t.getAttribute('data-del'); renderList();
    } else if (t.hasAttribute('data-no')) {
      state.pendente = null; renderList();
    } else if (t.hasAttribute('data-ok')) {
      var id = t.getAttribute('data-ok');
      state.pendente = null;
      if (store) store.remove(id).catch(function () { say('Não foi possível excluir. Tente de novo.', 'err'); });
      renderList();
    }
  });

  document.addEventListener('keydown', function (e) {
    if ((e.key === 'Enter' || e.key === ' ') && e.target.getAttribute && (e.target.getAttribute('data-gomes') || e.target.getAttribute('data-pgo'))) {
      e.preventDefault(); e.target.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    }
  });

  $('cat').addEventListener('change', function () {
    var nova = $('cat').value === '__nova__';
    $('newcatRow').hidden = !nova;
    if (nova) $('newcat').focus();
  });
  $('btnNewcat').addEventListener('click', addCat);
  $('newcat').addEventListener('keydown', function (e) { if (e.key === 'Enter') { e.preventDefault(); addCat(); } });

  $('formCard').addEventListener('submit', function (e) {
    e.preventDefault();
    if (!store) return;
    var centavos = parseValor($('valor').value);
    if (!(centavos > 0)) { say('Informe um valor maior que zero, por exemplo 25,90.', 'err'); $('valor').focus(); return; }
    var categoria = $('cat').value;
    if (!categoria || categoria === '__nova__') { say('Escolha uma categoria.', 'err'); return; }
    var data = $('data').value || hoje();
    var rec = { tipo: state.tipo, centavos: centavos, categoria: categoria, data: data, obs: $('obs').value.trim(), criadoEm: Date.now() };
    $('btnAdd').disabled = true;
    store.add(rec).then(function () {
      say((rec.tipo === 'despesa' ? 'Despesa' : 'Receita') + ' de ' + fmt(centavos) + ' adicionada.', 'ok');
      $('valor').value = ''; $('obs').value = ''; $('data').value = hoje();
      if (mesDe(data) !== state.mes) { state.mes = mesDe(data); render(); }
      $('valor').focus();
    }).catch(function (err) {
      say(err && err.code === 'quota_exceeded' ? 'O limite de lançamentos foi atingido. Exclua algum para continuar.' : 'Não foi possível salvar. Tente de novo.', 'err');
    }).then(function () { $('btnAdd').disabled = !state.pronto; });
  });

  /* ---------- eventos da importação ---------- */
  $('impCard').addEventListener('click', function (e) {
    var t = e.target.closest ? e.target.closest('[data-act]') : null;
    if (t && !t.disabled) impAct(t.getAttribute('data-act'), t);
  });
  $('impCard').addEventListener('input', function (e) {
    if (e.target && e.target.id === 'iobs') state.obsDraft = e.target.value;
  });
  $('impCard').addEventListener('change', function (e) {
    if (e.target && e.target.id === 'iinvert') {
      state.impInvert = e.target.checked;
      if (state.imp.stage === 'resumo') { state.imp.invert = state.impInvert; computeImp(state.imp); impRefresh(); }
    }
  });
  $('impCard').addEventListener('keydown', function (e) {
    if (e.key === 'Enter' && e.target && e.target.id === 'inewcat') { e.preventDefault(); impAct('newcatok', e.target); }
  });
  $('fileExt').addEventListener('change', function () {
    var f = $('fileExt').files && $('fileExt').files[0];
    if (f) impArquivo(f);
  });

  /* ---------- abas e períodos ---------- */
  document.addEventListener('click', function (e) {
    var t = e.target.closest ? e.target.closest('[data-view],[data-ptipo],[data-pgo],[data-pmore]') : null;
    if (!t) return;
    if (t.hasAttribute('data-view')) {
      state.view = t.getAttribute('data-view'); state.pendente = null; render();
    } else if (t.hasAttribute('data-ptipo')) {
      state.ptipo = t.getAttribute('data-ptipo'); state.pall = false; renderPer();
    } else if (t.hasAttribute('data-pgo')) {
      state.mes = t.getAttribute('data-pgo'); state.view = 'mes'; state.pendente = null; render();
    } else if (t.hasAttribute('data-pmore')) {
      state.pall = !state.pall; renderPer();
    }
  });
  $('compareKind').addEventListener('change', function () { state.compareKind = $('compareKind').value; renderPer(); });
  $('pper').addEventListener('change', function () { state.pper = $('pper').value; state.pall = false; renderPer(); });
  $('pde').addEventListener('change', function () { state.pde = $('pde').value; state.pall = false; renderPer(); });
  $('pate').addEventListener('change', function () { state.pate = $('pate').value; state.pall = false; renderPer(); });

  /* ---------- backup ---------- */
  function bkSay(t, c) { var m = $('bkmsg'); m.textContent = t; m.className = c || ''; }
  $('btnExp').addEventListener('click', function () {
    try {
      var data = JSON.stringify({ app: 'livro-caixa', versao: 1, exportadoEm: new Date().toISOString(), lanc: state.lanc, custom: state.custom }, null, 2);
      var blob = new Blob([data], { type: 'application/json' });
      var a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = 'caixa-' + hoje() + '.json';
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(function () { URL.revokeObjectURL(a.href); }, 2000);
      bkSay('Backup gerado com ' + state.lanc.length + ' lançamentos.', 'ok');
    } catch (e) { bkSay('Não foi possível gerar o backup.', 'err'); }
  });
  $('btnImp').addEventListener('click', function () { $('fileImp').click(); });
  $('fileImp').addEventListener('change', function () {
    var f = $('fileImp').files && $('fileImp').files[0];
    if (!f) return;
    var rd = new FileReader();
    rd.onload = function () {
      try {
        var d = JSON.parse(rd.result);
        if (!d || d.app !== 'livro-caixa' || !Array.isArray(d.lanc)) throw new Error('formato');
        var ids = {};
        state.lanc.forEach(function (l) { ids[l.id] = 1; });
        var novos = 0;
        d.lanc.forEach(function (l) {
          if (l && typeof l.centavos === 'number' && l.data && (l.tipo === 'receita' || l.tipo === 'despesa') && l.categoria && l.id && !ids[l.id]) {
            state.lanc.push(l); ids[l.id] = 1; novos++;
          }
        });
        ['receita', 'despesa'].forEach(function (t) {
          ((d.custom && d.custom[t]) || []).forEach(function (c) { if (typeof c === 'string' && state.custom[t].indexOf(c) < 0) state.custom[t].push(c); });
        });
        store.saveCats().then(function () { fillCats(); render(); bkSay(novos + ' lançamentos importados.', 'ok'); });
      } catch (e) { bkSay('Arquivo inválido. Escolha um backup gerado por este app.', 'err'); }
      $('fileImp').value = '';
    };
    rd.readAsText(f);
  });

  /* ---------- início ---------- */
  $('data').value = hoje();
  fillCats(); renderForm(); render();
  start();

  if ('serviceWorker' in navigator) {
    window.addEventListener('load', function () { navigator.serviceWorker.register('sw.js').catch(function () {}); });
  }
})();
