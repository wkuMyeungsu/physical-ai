/*
 * 기기 관리 화면
 *
 * 데이터 계층(D, tick, setStatus, log)은 기기의 state.json · control.sock 응답을 흉내 낸 시뮬레이터입니다.
 * 실제 기기에 연결할 때는 이 계층을 fetch('/api/...')와 WebSocket('/ws/state') 수신으로 바꾸고,
 * 아래 render* 함수에는 같은 모양의 데이터를 넘기면 됩니다.
 */
(() => {
  'use strict';

  /* ===================== helpers ===================== */
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const pad = n => String(n).padStart(2, '0');
  const clock = d => `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
  const hm = d => `${pad(d.getHours())}:${pad(d.getMinutes())}`;
  const rnd = (a, b) => a + Math.random() * (b - a);
  const rint = (a, b) => Math.round(rnd(a, b));
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
  const walk = (v, step, a, b) => clamp(v + rnd(-step, step), a, b);
  const now = () => Date.now();
  const sleep = ms => new Promise(r => setTimeout(r, ms));

  function dur(s) {
    s = Math.max(0, Math.round(s));
    if (s < 60) return `${s}초`;
    const m = Math.floor(s / 60);
    if (m < 60) return `${m}분${s % 60 ? ` ${s % 60}초` : ''}`;
    const h = Math.floor(m / 60);
    return `${h}시간${m % 60 ? ` ${m % 60}분` : ''}`;
  }
  const mins = sec => `${Math.floor(sec / 60)}분`;
  function when(ts) {
    const d = new Date(ts), n = new Date();
    if (d.toDateString() === n.toDateString()) return `오늘 ${hm(d)}`;
    const days = Math.round((n.setHours(0, 0, 0, 0) - new Date(ts).setHours(0, 0, 0, 0)) / 864e5);
    return days === 1 ? `어제 ${hm(d)}` : `${days}일 전 ${hm(d)}`;
  }

  let ready = false;       // 첫 로딩이 끝나기 전에는 효과를 만들지 않는다
  let offline = false;

  /* 값이 바뀌면 배경이 잠깐 밝아진다 (Value flash) */
  function setText(el, v, quiet) {
    v = String(v);
    if (!el || el.textContent === v) return;
    el.textContent = v;
    if (quiet || reduced || !ready) return;
    el.classList.remove('flash'); void el.offsetWidth; el.classList.add('flash');
  }
  /* 숫자가 올라간다 (Count-up) */
  function countUp(el, to) {
    const from = Number(el.dataset.v || 0);
    el.dataset.v = to;
    if (reduced || !ready || from === to) { el.textContent = to; return; }
    const t0 = performance.now();
    const step = t => {
      const p = Math.min(1, (t - t0) / 650), e = 1 - Math.pow(1 - p, 3);
      el.textContent = Math.round(from + (to - from) * e);
      if (p < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }

  /* ===================== toast / sheet ===================== */
  function toast(msg, icon = 'check_circle') {
    const box = $('#toasts');
    while (box.children.length >= 3) box.firstChild.remove();
    const el = document.createElement('div');
    el.className = 'toast';
    el.innerHTML = `<span class="material-symbols-outlined" aria-hidden="true">${icon}</span><span>${esc(msg)}</span>`;
    box.append(el);
    setTimeout(() => { el.classList.add('out'); setTimeout(() => el.remove(), 250); }, 2800);
  }

  const sheet = $('#sheet');
  function openSheet({ title, body, actions }) {
    $('#sheetTitle').textContent = title;
    $('#sheetBody').innerHTML = body;
    $('#sheetActions').replaceChildren(...actions.map(a => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = `btn ${a.cls || 'btn-ghost'}`;
      b.textContent = a.label;
      b.addEventListener('click', () => { sheet.close(); if (a.run) a.run(); });
      return b;
    }));
    sheet.showModal();
  }
  sheet.addEventListener('click', e => {
    const r = sheet.getBoundingClientRect();
    if (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom) sheet.close();
  });
  const buzz = () => { try { navigator.vibrate && navigator.vibrate(30); } catch (_) { /* 지원하지 않는 기기 */ } };
  const cancelBtn = { label: '취소', cls: 'btn-ghost' };

  /* ===================== model ===================== */
  const STATUS = {
    normal: { label: '정상', msg: '바른 자세를 유지하고 있어요', img: './assets/posture_aligned.svg', tone: 'ok', chip: 'chip-ok' },
    turtle: { label: '거북목', msg: '고개가 앞으로 나와 있어요', img: './assets/turtle_neck.svg', tone: 'warn', chip: 'chip-warn' },
    mouth: { label: '입벌림', msg: '입이 벌어진 상태가 이어지고 있어요', img: './assets/mouth_breathing.svg', tone: 'warn', chip: 'chip-warn' },
    hold: { label: '판정 보류', msg: '조명이나 가림 때문에 판정을 잠시 멈췄어요', icon: 'hourglass_top', tone: 'idle', chip: 'chip-idle' },
    away: { label: '자리 비움', msg: '얼굴이 보이지 않아요', icon: 'person_off', tone: 'idle', chip: 'chip-idle' },
    paused: { label: '일시 정지', msg: '렌즈 커버가 닫혀 있어요', icon: 'videocam_off', tone: 'idle', chip: 'chip-idle' },
  };
  const KIND = { turtle: '거북목', mouth: '입벌림' };

  const SETTINGS = [
    { key: 'turtleSec', name: '거북목 판정 시간', min: 10, max: 120, step: 5, unit: '초', def: 30 },
    { key: 'mouthSec', name: '입벌림 판정 시간', min: 3, max: 30, step: 1, unit: '초', def: 8 },
    { key: 'snoozeMin', name: '스누즈 시간', min: 5, max: 120, step: 5, unit: '분', def: 30 },
    { key: 'dailyCap', name: '하루 알림 상한', min: 3, max: 50, step: 1, unit: '회', def: 20 },
  ];
  const saved = Object.fromEntries(SETTINGS.map(s => [s.key, s.def]));
  let draft = { ...saved };

  let aid = 0, lid = 0, seq = 1000;
  const t0 = now();
  const D = {
    status: 'normal', since: t0 - 95e3, note: '', nextIn: 25, lock: false, calibAt: t0 - 3 * 864e5,
    today: { alerts: 7, turtleSec: 1080, mouthSec: 240, base: 12240 },
    alerts: [['turtle', 48, 92], ['mouth', 77, 14], ['turtle', 121, 61], ['turtle', 160, 45], ['mouth', 210, 22], ['turtle', 255, 118], ['turtle', 310, 38]]
      .map(([kind, m, d]) => ({ id: ++aid, t: t0 - m * 60e3, kind, dur: d, ongoing: false, fp: false })),
    preview: { active: false, pending: false, endsAt: 0 },
    sys: {
      temp: 58, cpu: 41, ram: 57, emmc: 34, fps: 4.1, p50: 212, p95: 318, max: 402, volt: 5.02,
      hist: Array.from({ length: 40 }, () => ({ p50: 212 + rnd(-14, 14), p95: 318 + rnd(-24, 24) })),
      q: [['ok', '정상', 81, 'var(--primary)'], ['dark', '어두움', 6, 'var(--slate)'], ['blur', '흐림', 4, 'var(--amber)'], ['occl', '가림', 5, 'var(--clay)'], ['away', '자리 비움', 4, 'color-mix(in srgb, var(--ink) 30%, transparent)']],
      startedAt: t0 - (6 * 3600 + 14 * 60) * 1e3,
      containers: [
        { id: 'vision', desc: '캡처 + AI 추론', mem: 412, limit: 640, restarts: 1, net: '없음 (network_mode: none)', dev: '카메라 · NPU', policy: 'on-failure', since: t0 - 2 * 3600e3, state: 'running' },
        { id: 'coach', desc: '판정 · 기록 · LCD · 버튼', mem: 96, limit: 192, restarts: 0, net: '없음 (network_mode: none)', dev: 'SPI · GPIO', policy: 'always', since: t0 - (6 * 3600 + 13 * 60) * 1e3, state: 'running' },
        { id: 'web', desc: '웹 페이지 · API', mem: 58, limit: 128, restarts: 0, net: '있음 (포트 443)', dev: '없음', policy: 'always', since: t0 - (6 * 3600 + 13 * 60) * 1e3, state: 'running' },
      ],
    },
    logs: [],
    net: {
      mode: 'wifi', reason: '', since: t0 - (2 * 3600 + 41 * 60) * 1e3, rssi: -52, drops: 0,
      ip: '192.168.0.23', ap: { open: false, endsAt: 0 },
      saved: [{ id: 1, ssid: 'MyHome_5G' }, { id: 2, ssid: 'Parents_House' }], current: 1,
    },
    devices: [
      { id: 1, name: '휴대폰 (Android)', icon: 'smartphone', reg: '10/24', last: `오늘 ${hm(new Date(t0 - 20 * 60e3))}`, current: true },
      { id: 2, name: '노트북 (Windows)', icon: 'laptop_windows', reg: '10/20', last: '어제 18:41', current: false },
    ],
    audit: [
      { t: t0 - 20 * 60e3, icon: 'devices', tone: 'ok', title: '기기 등록', sub: '휴대폰 · 4자리 코드 확인' },
      { t: t0 - 95 * 60e3, icon: 'warning', tone: 'warn', title: '등록 코드 입력 실패 2회', sub: '192.168.0.24 · 3번째 시도에서 성공' },
      { t: t0 - 5 * 3600e3, icon: 'tune', tone: 'slate', title: '설정 변경', sub: '스누즈 시간 20분 → 30분' },
      { t: t0 - 3 * 864e5, icon: 'center_focus_strong', tone: 'ok', title: '캘리브레이션 완료', sub: '기기 버튼 3초' },
    ],
  };
  const restartLeft = { vision: 0 };

  /* ===================== logs ===================== */
  const LOG_T = [
    ['vision', 'INFO', () => `frame ok fps=${D.sys.fps.toFixed(1)} p50=${Math.round(D.sys.p50)}ms`, 30],
    ['vision', 'INFO', () => 'exposure locked (gain=2.1, shutter=1/60)', 5],
    ['vision', 'WARNING', () => `frame quality low: brightness=${rnd(.12, .2).toFixed(2)}`, 6],
    ['vision', 'WARNING', () => `inference p95=${Math.round(D.sys.p95)}ms, budget 350ms`, 3],
    ['coach', 'INFO', () => `features received seq=${seq++} age=${rint(30, 90)}ms`, 18],
    ['coach', 'INFO', () => 'baseline loaded: neck_angle=12.4deg mar=0.08', 4],
    ['coach', 'INFO', () => `sqlite write ok rows=${rint(1, 3)} (${rint(2, 9)}ms)`, 8],
    ['coach', 'WARNING', () => 'features timeout 2.0s, state=hold', 3],
    ['web', 'INFO', () => `GET /api/state 200 ${rint(4, 20)}ms`, 20],
    ['web', 'INFO', () => `GET /api/system 200 ${rint(6, 28)}ms`, 8],
    ['web', 'INFO', () => `ws client connected (${clientIp()})`, 2],
    ['web', 'WARNING', () => `register code mismatch from ${clientIp()} (attempt 2/5)`, 2, () => D.net.mode === 'wifi'],
    ['web', 'ERROR', () => 'ws send failed: client disconnected', 1],
    ['web', 'INFO', () => `wlan0 rssi=${Math.round(D.net.rssi)}dBm ssid=${netSsid()}`, 6, () => D.net.mode === 'wifi'],
    ['web', 'WARNING', () => `wlan0 signal weak (${Math.round(D.net.rssi)}dBm)`, 3, () => D.net.mode === 'wifi' && D.net.rssi < -66],
    ['web', 'INFO', () => 'usb0 link up, carrier ok', 4, () => D.net.mode === 'usb'],
  ];
  function pickLog() {
    const pool = LOG_T.filter(l => !l[4] || l[4]());
    let r = Math.random() * pool.reduce((a, l) => a + l[3], 0);
    for (const l of pool) { r -= l[3]; if (r <= 0) return l; }
    return pool[0];
  }
  const clientIp = () => (D.net.mode === 'usb' ? '192.168.7.1' : '192.168.0.24');
  const netSsid = () => (D.net.saved.find(s => s.id === D.net.current) || {}).ssid || '-';
  const logFilter = { lvl: 'all', src: 'all' };
  let logPaused = false;
  const logHTML = (l, isNew) => `<div class="log lv-${l.lvl}${isNew ? ' new' : ''}"><time>${clock(new Date(l.t))}</time><span class="src">${l.src}</span><span class="lvl">${l.lvl}</span><span class="msg">${esc(l.msg)}</span></div>`;
  const logMatch = l => (logFilter.lvl === 'all' || l.lvl === logFilter.lvl) && (logFilter.src === 'all' || l.src === logFilter.src);

  function log(src, lvl, msg, ts) {
    const l = { id: ++lid, t: ts || now(), src, lvl, msg };
    D.logs.push(l);
    if (D.logs.length > 400) D.logs.shift();
    if (ready && !logPaused && logMatch(l)) {
      const v = $('#logView');
      const near = v.scrollHeight - v.scrollTop - v.clientHeight < 40;
      v.insertAdjacentHTML('beforeend', logHTML(l, true));
      while (v.children.length > 120) v.firstChild.remove();
      if (near) v.scrollTop = v.scrollHeight;
    }
    updateMini(src);
  }
  function renderLogs() {
    const v = $('#logView');
    const rows = D.logs.filter(logMatch).slice(-80);
    v.innerHTML = rows.length ? rows.map(l => logHTML(l)).join('') : '<p class="empty">조건에 맞는 로그가 없습니다.</p>';
    v.scrollTop = v.scrollHeight;
  }
  (function seedLogs() {
    for (let i = 16; i > 0; i--) { const [src, lvl, m] = pickLog(); D.logs.push({ id: ++lid, t: now() - i * 2300, src, lvl, msg: m() }); }
    D.logs.push({ id: ++lid, t: now() - 9000, src: 'web', lvl: 'ERROR', msg: 'ws send failed: client disconnected' });
    D.logs.sort((a, b) => a.t - b.t);
  })();

  /* ===================== state machine (시뮬레이션) ===================== */
  const NEXT_IN = { normal: [18, 35], turtle: [10, 20], mouth: [8, 14], hold: [7, 12], away: [8, 14], paused: [999, 999] };

  function setStatus(next, note = '') {
    const prev = D.status;
    if (prev === next && !note && !D.note) return;
    const t = now();
    const ong = D.alerts.find(a => a.ongoing);
    if (ong) { ong.ongoing = false; ong.dur = Math.round((t - ong.t) / 1000); }
    D.status = next; D.since = t; D.note = note;
    D.nextIn = rint(...NEXT_IN[next]);
    if (next === 'turtle' || next === 'mouth') {
      D.today.alerts++;
      D.alerts.unshift({ id: ++aid, t, kind: next, dur: 0, ongoing: true, fp: false });
      const th = next === 'turtle' ? saved.turtleSec : saved.mouthSec;
      log('coach', 'WARNING', `${next} sustained >= ${th}s, alert ${D.today.alerts}/${saved.dailyCap}`);
    } else if (prev !== next) {
      log('coach', 'INFO', `state ${prev} -> ${next}`);
    }
    renderHero(); renderAlerts(); renderStats();
  }
  function pickNext() {
    if (D.status !== 'normal') return Math.random() < .8 ? 'normal' : (Math.random() < .5 ? 'hold' : 'away');
    const r = Math.random();
    return r < .45 ? 'turtle' : r < .65 ? 'mouth' : r < .85 ? 'hold' : 'away';
  }

  function tick() {
    if (isStale()) return;
    const s = D.sys, n = D.net;
    if (n.mode === 'wifi') n.rssi = walk(n.rssi, 1.6, -72, -45);
    if (n.ap.open && now() >= n.ap.endsAt) { n.ap.open = false; log('web', 'INFO', 'ap Coach-A1B2 closed (timeout 10min)'); renderNet(); renderSecurity(); toast('기기 자체 Wi-Fi가 닫혔어요', 'wifi_off'); }
    if (D.status === 'turtle') D.today.turtleSec++;
    if (D.status === 'mouth') D.today.mouthSec++;
    D.today.base++;

    if (!D.lock && D.status !== 'paused') { D.nextIn--; if (D.nextIn <= 0) setStatus(pickNext()); }

    s.temp = walk(s.temp, .7, 50, 74); s.cpu = walk(s.cpu, 4, 25, 72); s.ram = walk(s.ram, .4, 52, 62);
    s.fps = walk(s.fps, .15, 3.4, 4.8); s.volt = walk(s.volt, .01, 4.96, 5.08);
    s.p50 = walk(s.p50, 7, 190, 262); s.p95 = s.p50 + rnd(80, 150); s.max = s.p95 + rnd(20, 130);
    s.hist.push({ p50: s.p50, p95: s.p95 }); s.hist.shift();
    const [v, c, w] = s.containers;
    if (v.state === 'running') v.mem = walk(v.mem, 7, 380, 470);
    c.mem = walk(c.mem, 1.2, 90, 110); w.mem = walk(w.mem, 1.2, 52, 66);
    if (Math.random() < .5) { const [src, lvl, m] = pickLog(); log(src, lvl, m()); }

    if (v.state === 'running' && !D.lock && Math.random() < .003) restartVision();
    if (restartLeft.vision > 0 && --restartLeft.vision === 0) {
      v.state = 'running'; v.since = now(); v.mem = 120;
      log('vision', 'INFO', 'started, rknn runtime ready');
      D.lock = false; setStatus('normal');
    }

    const ong = D.alerts.find(a => a.ongoing);
    if (ong) ong.dur = Math.round((now() - ong.t) / 1000);

    if (D.preview.active && now() >= D.preview.endsAt) stopPreview('시간 만료 (5분)');

    renderLive();
  }
  function restartVision() {
    const v = D.sys.containers[0];
    v.state = 'restarting'; v.restarts++; v.mem = 0; restartLeft.vision = 5; D.lock = true;
    log('vision', 'ERROR', 'frame watchdog: no frame for 5s, exiting for restart');
    log('coach', 'WARNING', 'features timeout 2.0s, state=hold');
    setStatus('hold', '카메라 처리가 다시 시작되는 중이에요');
    if (D.preview.active) stopPreview('vision 재시작');
  }

  /* ===================== render: 기능 ===================== */
  let heroKey = '';
  function renderHero() {
    const m = STATUS[D.status], hero = $('#hero');
    hero.classList.remove('tone-ok', 'tone-warn', 'tone-idle'); hero.classList.add(`tone-${m.tone}`);
    const key = D.status;
    if (key !== heroKey) {
      heroKey = key;
      $('#heroMedia').innerHTML = m.img
        ? `<img src="${m.img}" alt="${m.label} 상태의 기기 화면"/>`
        : `<span class="material-symbols-outlined" aria-hidden="true">${m.icon}</span>`;
      $('#heroLabel').textContent = m.label;
    }
    $('#heroMsg').textContent = D.note || m.msg;
  }
  function renderStats() {
    const t = D.today;
    countUp($('#heroAlerts'), t.alerts);
    setText($('#statTurtle'), mins(t.turtleSec));
    setText($('#statMouth'), mins(t.mouthSec));
    setText($('#statGood'), Math.round(100 - (t.turtleSec + t.mouthSec) / t.base * 100));
    $('#statCalibSub').textContent = hm(new Date(D.calibAt));
    $('#chipTurtleRule').textContent = `거북목 ${saved.turtleSec}초`;
    $('#chipMouthRule').textContent = `입벌림 ${saved.mouthSec}초`;
  }

  /* chart */
  const WEEKDAY = ['일', '월', '화', '수', '목', '금', '토'];
  const CHART = {
    day: { unit: '시', label: i => `${9 + i}`, full: i => `${9 + i}시`, data: [0, 3, 2, 4, 1, 0, 3, 2, 2, 1] },
    week: { label: i => WEEKDAY[new Date(now() - (6 - i) * 864e5).getDay()], full: i => { const d = new Date(now() - (6 - i) * 864e5); return `${d.getMonth() + 1}/${d.getDate()}`; }, data: [24, 31, 19, 27, 22, 9, 18] },
    month: { label: i => ['3주 전', '2주 전', '지난주', '이번 주'][i], full: i => ['3주 전', '2주 전', '지난주', '이번 주'][i], data: [142, 128, 119, 98] },
  };
  let chartRange = 'day';
  function renderChart() {
    const c = CHART[chartRange], data = c.data, n = data.length;
    const W = 320, H = 160, pt = 12, pb = 24, gap = n > 6 ? 6 : 14, bw = (W - gap * (n + 1)) / n;
    const max = Math.max(...data, 1), ph = H - pt - pb;
    const bars = data.map((v, i) => {
      const x = gap + i * (bw + gap), h = Math.max(v ? 4 : 0, ph * v / max), y = H - pb - h;
      const cur = i === n - 1 ? ' cur' : '';
      return `<g class="bar${cur}" data-i="${i}" tabindex="0" role="button" aria-label="${c.full(i)} 거북목 ${v}분">
        <rect class="bar-bg" x="${x}" y="${pt}" width="${bw}" height="${ph}" rx="6"/>
        <rect class="bar-fill" x="${x}" y="${y}" width="${bw}" height="${h}" rx="6" style="--d:${i * 35}ms"/>
        <text x="${x + bw / 2}" y="${H - 8}" text-anchor="middle">${c.label(i)}</text></g>`;
    }).join('');
    $('#chart').innerHTML = `<line class="axis" x1="0" x2="${W}" y1="${H - pb}" y2="${H - pb}"/>${bars}`;
    $('#chartCap').textContent = `합계 ${data.reduce((a, b) => a + b, 0)}분 · 막대를 누르면 값을 볼 수 있어요.`;
  }
  function pickBar(g) {
    const i = Number(g.dataset.i), c = CHART[chartRange];
    $$('#chart .bar').forEach(b => b.classList.toggle('sel', b === g));
    $('#chartCap').textContent = `${c.full(i)} · 거북목 ${c.data[i]}분`;
  }

  /* alerts */
  function renderAlerts() {
    const list = D.alerts.slice(0, 8);
    $('#alertSummary').textContent = `오늘 ${D.today.alerts}회 · 오탐 신고 ${D.alerts.filter(a => a.fp).length}건`;
    $('#alertList').innerHTML = list.length ? list.map(a => `
      <li class="tl-item" data-id="${a.id}">
        <span class="tl-ico ${a.ongoing ? 'bad' : 'warn'}"><span class="material-symbols-outlined" aria-hidden="true">${a.kind === 'turtle' ? 'airline_seat_recline_extra' : 'sentiment_neutral'}</span></span>
        <div class="tl-main"><p class="tl-title">${KIND[a.kind]} 알림</p>
          <p class="tl-sub">${hm(new Date(a.t))} · ${a.ongoing ? `진행 중 <b data-ongoing>${dur(a.dur)}</b>` : `${dur(a.dur)} 지속`}</p></div>
        <button class="tl-act" type="button" aria-pressed="${a.fp}">${a.fp ? '오탐 신고함' : '이건 아니었어요'}</button>
      </li>`).join('') : '<li class="empty">오늘 알림이 없습니다.</li>';
  }

  /* settings */
  function renderSettings() {
    $('#settingRows').innerHTML = SETTINGS.map(s => `
      <div class="s-row" data-k="${s.key}">
        <div><p class="s-name">${s.name}</p><p class="small muted">허용 범위 ${s.min}~${s.max}${s.unit}</p></div>
        <div class="stepper">
          <button type="button" data-d="-1" aria-label="${s.name} 줄이기"><span class="material-symbols-outlined" aria-hidden="true">remove</span></button>
          <output aria-live="polite"></output>
          <button type="button" data-d="1" aria-label="${s.name} 늘리기"><span class="material-symbols-outlined" aria-hidden="true">add</span></button>
        </div>
      </div>`).join('');
    syncSettings();
  }
  function syncSettings() {
    let dirty = false;
    for (const s of SETTINGS) {
      const row = $(`.s-row[data-k="${s.key}"]`), v = draft[s.key], d = v !== saved[s.key];
      $('output', row).textContent = v + s.unit;
      row.classList.toggle('dirty', d); dirty = dirty || d;
      $('[data-d="-1"]', row).disabled = v <= s.min;
      $('[data-d="1"]', row).disabled = v >= s.max;
    }
    $('#settingSave').disabled = !dirty; $('#settingReset').disabled = !dirty;
  }
  function saveSettings() {
    const changes = SETTINGS.filter(s => draft[s.key] !== saved[s.key]);
    if (!changes.length) return;
    changes.forEach(s => {
      addAudit({ icon: 'tune', tone: 'slate', title: '설정 변경', sub: `${s.name} ${saved[s.key]}${s.unit} → ${draft[s.key]}${s.unit}` });
      log('web', 'INFO', `PUT /api/settings ${s.key}=${draft[s.key]} accepted`);
      saved[s.key] = draft[s.key];
    });
    syncSettings(); renderStats();
    toast('기기에 저장했어요');
  }

  /* calibration / preview */
  function startCalibration() {
    if (D.lock) { toast('기기가 다른 작업 중이에요', 'hourglass_top'); return; }
    D.lock = true;
    setStatus('hold', '캘리브레이션 중이에요. 평소 모니터를 보는 자세로 앉아 주세요');
    $('#calibBtn').disabled = true; $('#calibBtn').textContent = '진행 중';
    log('coach', 'INFO', 'calibration started (button request via web)');
    toast('기기 화면에서 안내가 시작됐어요', 'center_focus_strong');
    setTimeout(() => {
      D.lock = false;
      $('#statCalib').textContent = '방금'; D.calibAt = now();
      log('coach', 'INFO', 'calibration done: baseline saved, exposure locked');
      addAudit({ icon: 'center_focus_strong', tone: 'ok', title: '캘리브레이션 완료', sub: '웹에서 요청' });
      $('#calibBtn').disabled = false; $('#calibBtn').textContent = '시작';
      setStatus('normal'); toast('캘리브레이션을 마쳤어요');
    }, 8000);
  }

  function renderPreview() {
    const p = D.preview, on = p.active;
    $('#previewBox').hidden = !on;
    const b = $('#previewBtn');
    b.textContent = on ? '종료' : p.pending ? '요청 중…' : '보기';
    b.disabled = p.pending;
    b.classList.toggle('btn-danger', on); b.classList.toggle('btn-soft', !on);
    $('#adminPreviewState').textContent = on ? '보기 중' : p.pending ? '요청 대기 중' : '보기 중 아님';
    $('#adminPreviewSub').textContent = on ? `남은 시간 ${leftText()} · 기기 화면에 "영상 보기 중" 표시 중` : '영상은 요청이 있을 때만 켜지고 저장되지 않습니다.';
    $('#adminPreviewStop').disabled = !on;
  }
  const leftText = () => { const s = Math.max(0, Math.round((D.preview.endsAt - now()) / 1000)); return `${Math.floor(s / 60)}:${pad(s % 60)}`; };
  function requestPreview() {
    openSheet({
      title: '영상을 볼까요?',
      body: `<ul><li>기기 화면에 "PC에서 영상 보기 요청"이 3초 동안 표시된 뒤 시작됩니다.</li><li>보는 동안 기기 화면에 "영상 보기 중"이 계속 표시됩니다.</li><li>저해상도(320×240)로 최대 5분이며, 저장하지 않습니다.</li></ul>`,
      actions: [cancelBtn, { label: '영상 보기', cls: 'btn-primary', run: async () => {
        D.preview.pending = true; renderPreview();
        log('web', 'INFO', 'POST /api/preview/start requested');
        log('coach', 'INFO', 'preview request accepted, lcd overlay on (3s)');
        toast('기기 화면에 안내가 표시됩니다', 'videocam');
        await sleep(3000);
        D.preview = { active: true, pending: false, endsAt: now() + 300e3 };
        log('vision', 'INFO', 'preview stream on 320x240');
        addAudit({ icon: 'videocam', tone: 'warn', title: '영상 보기 시작', sub: '휴대폰 · 최대 5분' });
        renderPreview();
      } }],
    });
  }
  function stopPreview(reason) {
    if (!D.preview.active) return;
    D.preview = { active: false, pending: false, endsAt: 0 };
    log('vision', 'INFO', `preview stream off (${reason})`);
    addAudit({ icon: 'videocam_off', tone: 'slate', title: '영상 보기 종료', sub: reason });
    renderPreview();
    toast(`영상 보기를 끝냈어요 (${reason})`, 'videocam_off');
  }

  /* ===================== render: 시스템 ===================== */
  const GAUGES = [
    { id: 'temp', label: 'CPU 온도', unit: '°C', pct: s => s.temp / 90 * 100, val: s => Math.round(s.temp), sub: () => '한계 85°C', lvl: s => s.temp >= 72 ? 'bad' : s.temp >= 65 ? 'warn' : '' },
    { id: 'cpu', label: 'CPU', unit: '%', pct: s => s.cpu, val: s => Math.round(s.cpu), sub: () => '4코어', lvl: s => s.cpu >= 85 ? 'bad' : s.cpu >= 70 ? 'warn' : '' },
    { id: 'ram', label: '메모리', unit: '%', pct: s => s.ram, val: s => Math.round(s.ram), sub: s => `${(s.ram / 100 * 2).toFixed(2)} / 2GB`, lvl: s => s.ram >= 90 ? 'bad' : s.ram >= 80 ? 'warn' : '' },
    { id: 'emmc', label: '저장공간', unit: '%', pct: s => s.emmc, val: s => Math.round(s.emmc), sub: s => `${(s.emmc / 100 * 16).toFixed(1)} / 16GB`, lvl: s => s.emmc >= 90 ? 'bad' : s.emmc >= 75 ? 'warn' : '' },
  ];
  function initGauges() {
    $('#gauges').innerHTML = GAUGES.map(g => `
      <div class="gauge" data-g="${g.id}">
        <div class="ring"><svg viewBox="0 0 80 80" aria-hidden="true"><circle class="trk" cx="40" cy="40" r="34"/><circle class="bar-c" cx="40" cy="40" r="34"/></svg>
          <div class="ring-val"><span><span data-k="v">0</span><small>${g.unit}</small></span></div></div>
        <p class="g-label">${g.label}</p><p class="g-sub" data-k="sub"></p>
      </div>`).join('');
  }
  function renderGauges() {
    for (const g of GAUGES) {
      const el = $(`.gauge[data-g="${g.id}"]`);
      el.className = `gauge ${g.lvl(D.sys)}`.trim();
      $('.bar-c', el).style.strokeDashoffset = 213.6 * (1 - clamp(g.pct(D.sys), 0, 100) / 100);
      setText($('[data-k="v"]', el), g.val(D.sys));
      $('[data-k="sub"]', el).textContent = g.sub(D.sys);
    }
    setText($('#uptime'), dur((now() - D.sys.startedAt) / 1000), true);
  }

  const CHIP_STATE = { running: ['chip-ok', '실행 중'], restarting: ['chip-warn', '재시작 중'] };
  function initContainers() {
    $('#containers').innerHTML = D.sys.containers.map(c => `
      <section class="card acc" data-acc data-c="${c.id}">
        <button class="acc-head" type="button" aria-expanded="false">
          <span class="acc-title"><span><span class="c-name">${c.id}</span><br/><span class="c-sub">${c.desc}</span></span></span>
          <span class="c-head-r"><span class="chip chip-ok" data-k="badge">실행 중</span><span class="material-symbols-outlined chev" aria-hidden="true">expand_more</span></span>
        </button>
        <div class="acc-body"><div class="acc-inner">
          <div class="c-row"><span>메모리</span><b data-k="mem"></b></div>
          <div class="meter" data-k="meter" aria-hidden="true"><i></i></div>
          <div class="c-row"><span>가동 시간</span><b data-k="up"></b></div>
          <div class="c-row"><span>재시작</span><b data-k="rs"></b></div>
          <div class="c-row"><span>네트워크</span><b>${c.net}</b></div>
          <div class="c-row"><span>연결 장치</span><b>${c.dev}</b></div>
          <div class="c-row"><span>재시작 정책</span><b>${c.policy}</b></div>
          <div class="c-mini" data-k="mini"></div>
        </div></div>
      </section>`).join('');
    D.sys.containers.forEach(c => updateMini(c.id));
  }
  function renderContainers() {
    for (const c of D.sys.containers) {
      const el = $(`[data-c="${c.id}"]`), pct = c.mem / c.limit * 100;
      const [cls, txt] = CHIP_STATE[c.state];
      const badge = $('[data-k="badge"]', el);
      badge.className = `chip ${cls}`; badge.textContent = txt;
      setText($('[data-k="mem"]', el), c.state === 'running' ? `${Math.round(c.mem)} / ${c.limit} MB` : '-', true);
      const m = $('[data-k="meter"]', el);
      m.className = `meter ${pct >= 90 ? 'bad' : pct >= 75 ? 'warn' : ''}`.trim();
      $('i', m).style.width = `${pct}%`;
      setText($('[data-k="up"]', el), c.state === 'running' ? dur((now() - c.since) / 1000) : '-', true);
      setText($('[data-k="rs"]', el), `${c.restarts}회`, true);
    }
  }
  function updateMini(src) {
    const el = $(`[data-c="${src}"] [data-k="mini"]`);
    if (!el) return;
    el.textContent = D.logs.filter(l => l.src === src).slice(-2).map(l => `${clock(new Date(l.t))} ${l.lvl} ${l.msg}`).join('\n');
  }

  function renderPerf() {
    const s = D.sys;
    setText($('#perfFps'), s.fps.toFixed(1)); setText($('#perfP50'), Math.round(s.p50));
    setText($('#perfP95'), Math.round(s.p95)); setText($('#perfMax'), Math.round(s.max));
    const pts = key => s.hist.map((h, i) => [i / (s.hist.length - 1) * 300, clamp(84 - (h[key] - 100) / 350 * 74, 4, 86)]);
    const path = key => 'M' + pts(key).map(p => `${p[0].toFixed(1)} ${p[1].toFixed(1)}`).join(' L');
    $('#sparkP50').setAttribute('d', path('p50'));
    $('#sparkP95').setAttribute('d', path('p95'));
    $('#sparkArea').setAttribute('d', `${path('p50')} L300 90 L0 90 Z`);
  }
  function renderQuality() {
    const q = D.sys.q;
    $('#qualityBar').innerHTML = q.map(([, , v, col]) => `<i style="flex-grow:${v};background:${col}"></i>`).join('');
    $('#qualityLegend').innerHTML = q.map(([, name, v, col]) => `<li><span><i class="sw" style="background:${col}"></i>${name}</span><b>${v}%</b></li>`).join('');
  }
  function renderHardware() {
    const chip = (c, t) => `<span class="chip ${c}">${t}</span>`;
    $('#hwList').innerHTML = `
      <li><span>카메라 (IMX219)</span><b>${chip('chip-ok', '인식됨')}</b></li>
      <li><span>NPU (RK3566, 0.8 TOPS)</span><b>${chip('chip-ok', '사용 중')}</b></li>
      <li><span>전원 입력</span><b><span id="hwVolt">5.02 V</span></b></li>
      <li><span>Bluetooth</span><b>${chip('chip-idle', '꺼짐')}</b></li>`;
  }

  /* ===================== render: 관리 ===================== */
  function addAudit(a) { D.audit.unshift({ t: now(), ...a }); renderAudit(); }
  function renderAudit() {
    $('#auditList').innerHTML = D.audit.slice(0, 8).map(a => `
      <li class="tl-item" style="grid-template-columns:2.25rem 1fr">
        <span class="tl-ico ${a.tone}"><span class="material-symbols-outlined" aria-hidden="true">${a.icon}</span></span>
        <div class="tl-main"><p class="tl-title">${esc(a.title)}</p><p class="tl-sub">${when(a.t)} · ${esc(a.sub)}</p></div>
      </li>`).join('');
  }
  function renderDevices() {
    const usb = D.net.mode === 'usb', wifi = D.net.mode === 'wifi';
    $('#deviceCount').textContent = usb ? `등록 ${D.devices.length}대 · USB PC 1대 연결` : `${D.devices.length}대`;
    const usbRow = usb ? `
      <li>
        <span class="avatar"><span class="material-symbols-outlined" aria-hidden="true">usb</span></span>
        <div><p class="d-name">USB로 연결된 PC <span class="chip chip-ok">이 기기</span></p><p class="d-sub">케이블 1:1 연결 · 등록 불필요</p></div><span></span>
      </li>` : '';
    const rows = D.devices.map(d => `
      <li data-id="${d.id}">
        <span class="avatar"><span class="material-symbols-outlined" aria-hidden="true">${d.icon}</span></span>
        <div><p class="d-name">${esc(d.name)} ${d.current && wifi ? '<span class="chip chip-ok">이 기기</span>' : ''}</p><p class="d-sub">등록 ${d.reg} · ${d.current && wifi ? '지금 접속 중' : d.last}</p></div>
        <button class="icon-btn sm" type="button" data-unlink aria-label="${esc(d.name)} 등록 해제"><span class="material-symbols-outlined" aria-hidden="true">link_off</span></button>
      </li>`).join('');
    $('#deviceList').innerHTML = (usbRow + rows) || '<li class="empty" style="display:block">등록된 기기가 없습니다.</li>';
  }
  function unlinkDevice(id) {
    const d = D.devices.find(x => x.id === id);
    if (!d) return;
    openSheet({
      title: `${d.name} 등록을 해제할까요?`,
      body: d.current && D.net.mode === 'wifi' ? '지금 사용 중인 기기입니다. 해제하면 이 화면의 연결이 끊기고, 다시 쓰려면 기기 화면의 4자리 코드로 등록해야 합니다.' : '해제하면 이 기기는 접속할 수 없고, 다시 쓰려면 기기 화면의 4자리 코드로 등록해야 합니다.',
      actions: [cancelBtn, { label: '등록 해제', cls: 'btn-danger-solid', run: () => {
        buzz();
        D.devices = D.devices.filter(x => x.id !== id);
        log('web', 'INFO', `device unregistered: ${d.name}`);
        addAudit({ icon: 'link_off', tone: 'bad', title: '기기 등록 해제', sub: d.name });
        renderDevices(); renderSecurity();
        if (d.current && D.net.mode === 'wifi') setMode('lost', 'unregistered');
        else toast('등록을 해제했어요', 'link_off');
      } }],
    });
  }
  function renderSecurity() {
    const items = [
      ['ok', '얼굴 원본 영상 저장 안 함', 'RAM에서만 처리하고 디스크와 네트워크로 나가지 않습니다.'],
      ['ok', 'vision · coach 네트워크 차단', '두 컨테이너에는 network_mode: none이 적용되어 있습니다.'],
      ['ok', '기기에서 인터넷으로 나가는 연결 차단', '호스트 방화벽에서 외부로 나가는 연결을 막고 있습니다.'],
      ['ok', '열린 포트는 443 하나', '그 밖의 포트는 닫혀 있습니다.'],
      D.net.mode === 'usb'
        ? ['ok', 'USB로 연결된 PC만 접속 가능', '케이블 1:1 연결이라 별도 등록이 필요 없고, Wi-Fi는 꺼져 있습니다.']
        : D.devices.length ? ['ok', `등록된 기기 ${D.devices.length}대만 접속 가능`, '새 기기는 기기 화면의 4자리 코드가 필요합니다.'] : ['warn', '등록된 기기 없음', '새로 등록하기 전까지 Wi-Fi 모드에서는 접속할 수 없습니다.'],
      D.net.ap.open
        ? ['warn', '기기 자체 Wi-Fi 열림 (Coach-A1B2)', '설정이 끝나거나 10분이 지나면 자동으로 닫힙니다. 비밀번호는 기기 화면에만 표시됩니다.']
        : ['ok', '기기 자체 Wi-Fi 닫힘', '기기 버튼 10초로 설정 메뉴를 열 때만 10분 동안 열립니다.'],
      ['warn', 'TLS 인증서: 자체 서명', '브라우저 경고가 표시됩니다. 지문 A4:1F:7C:…:9E 이 기기 화면과 같은지 확인하세요. 만료 312일 남음.'],
    ];
    const warn = items.filter(i => i[0] === 'warn').length;
    const sum = $('#secSummary');
    sum.textContent = warn ? `주의 ${warn}건` : '모두 정상';
    sum.className = `chip ${warn ? 'chip-amber' : 'chip-ok'}`;
    $('#secList').innerHTML = items.map(([k, t, s]) => `<li class="${k}"><span class="material-symbols-outlined" aria-hidden="true">${k === 'ok' ? 'check_circle' : 'warning'}</span><div><p class="ck-title">${esc(t)}</p><p class="ck-sub">${esc(s)}</p></div></li>`).join('');
  }

  /* ===================== network (연결 모드) ===================== */
  const NET_META = {
    usb: { icon: 'usb', chip: 'USB · 192.168.7.2', cls: 'chip-slate', addr: 'https://192.168.7.2' },
    wifi: { icon: 'wifi', chip: 'Wi-Fi · coach.local', cls: 'chip-slate', addr: 'https://coach.local' },
    lost: { icon: 'wifi_off', chip: '연결 끊김', cls: 'chip-bad', addr: '-' },
  };
  const sigLevel = r => (r > -55 ? 4 : r > -62 ? 3 : r > -70 ? 2 : 1);
  const sigText = r => ['', '약함', '보통', '좋음', '매우 좋음'][sigLevel(r)];
  const apLeft = () => { const s = Math.max(0, Math.round((D.net.ap.endsAt - now()) / 1000)); return `${Math.floor(s / 60)}:${pad(s % 60)}`; };

  function renderModeChip() {
    const m = NET_META[D.net.mode], chip = $('#modeChip');
    const off = offline && D.net.mode !== 'lost';
    chip.className = `chip ${off ? 'chip-bad' : m.cls}`;
    chip.innerHTML = `<span class="material-symbols-outlined" aria-hidden="true">${off ? 'cloud_off' : m.icon}</span><span>${off ? '오프라인' : m.chip}</span>`;
  }
  function renderNet() {
    const n = D.net, m = NET_META[n.mode];
    const badge = $('#netBadge');
    badge.className = `chip ${n.mode === 'lost' ? 'chip-bad' : 'chip-ok'}`;
    badge.textContent = n.mode === 'lost' ? '연결 끊김' : '정상';
    const row = (k, v) => `<li><span>${k}</span><b>${v}</b></li>`;
    const chip = (c, t) => `<span class="chip ${c}">${t}</span>`;
    const ap = n.ap.open ? chip('chip-amber', `열림 · <span id="netAp">${apLeft()}</span>`) : chip('chip-idle', '닫힘');
    let rows = '';
    if (n.mode === 'usb') {
      rows = row('연결 모드', 'USB 모드') + row('접속 주소', `<span class="mono">${m.addr}</span>`)
        + row('연결 방식', 'USB 가상 네트워크 (usb0)') + row('Wi-Fi', chip('chip-idle', '꺼짐'));
    } else if (n.mode === 'wifi') {
      rows = row('연결 모드', 'Wi-Fi 모드')
        + `<li><span>접속 주소</span><b><span class="mono">${m.addr}</span><span class="sub">기기 IP ${n.ip}</span></b></li>`
        + row('네트워크', esc(netSsid()))
        + row('신호 세기', `<span class="sig" id="netSig" data-n="${sigLevel(n.rssi)}" aria-hidden="true"><i></i><i></i><i></i><i></i></span><span id="netSigTx">${Math.round(n.rssi)} dBm · ${sigText(n.rssi)}</span>`)
        + row('연결 시간', `<span id="netUp">${dur((now() - n.since) / 1000)}</span>`)
        + row('끊김 횟수 (오늘)', `${n.drops}회`)
        + row('기기 자체 Wi-Fi', ap);
    } else {
      rows = row('연결 모드', '연결 끊김') + row('마지막 연결', 'Wi-Fi 모드') + row('끊김 횟수 (오늘)', `${n.drops}회`);
    }
    rows += row('열린 포트', '443 (HTTPS)') + row('외부 인터넷 연결', chip('chip-ok', '차단'));
    $('#netList').innerHTML = rows;
  }
  function renderNetLive() {
    const n = D.net;
    if (n.mode !== 'wifi') return;
    const sig = $('#netSig'); if (!sig) return;
    sig.dataset.n = sigLevel(n.rssi);
    setText($('#netSigTx'), `${Math.round(n.rssi)} dBm · ${sigText(n.rssi)}`, true);
    setText($('#netUp'), dur((now() - n.since) / 1000), true);
    const ap = $('#netAp'); if (ap) ap.textContent = apLeft();
  }

  function renderWifi() {
    const n = D.net, badge = $('#wifiBadge');
    badge.className = `chip ${n.mode === 'wifi' ? 'chip-ok' : n.mode === 'lost' ? 'chip-bad' : 'chip-idle'}`;
    badge.textContent = n.mode === 'wifi' ? '연결 중' : n.mode === 'lost' ? '연결 끊김' : 'USB 모드 · Wi-Fi 꺼짐';
    $('#wifiList').innerHTML = n.saved.length ? n.saved.map(s => {
      const cur = s.id === n.current && n.mode === 'wifi';
      return `<li data-id="${s.id}">
        <span class="avatar"><span class="material-symbols-outlined" aria-hidden="true">wifi</span></span>
        <div><p class="d-name">${esc(s.ssid)} ${cur ? '<span class="chip chip-ok">연결 중</span>' : ''}</p><p class="d-sub">${cur ? `신호 ${sigText(n.rssi)} · ${n.ip}` : '저장됨'}</p></div>
        <button class="icon-btn sm" type="button" data-wifi-del aria-label="${esc(s.ssid)} 삭제"><span class="material-symbols-outlined" aria-hidden="true">delete</span></button>
      </li>`;
    }).join('') : '<li class="empty" style="display:block">저장된 Wi-Fi가 없습니다.</li>';
    $('#wifiNote').textContent = n.mode === 'usb'
      ? 'USB 모드에서는 Wi-Fi가 꺼져 있습니다. 충전기에 꽂으면 저장된 네트워크에 자동으로 연결됩니다. 새 Wi-Fi 추가와 기기 자체 Wi-Fi 열기는 기기 버튼을 10초 눌러 설정 메뉴에서 합니다.'
      : '새 Wi-Fi를 추가하거나 기기 자체 Wi-Fi를 열려면 기기 버튼을 10초 눌러 설정 메뉴에서 "Wi-Fi 설정"을 고르세요. 기기 앞에 있는 사람만 할 수 있도록 웹에서는 열 수 없습니다.';
  }
  function deleteWifi(id) {
    const s = D.net.saved.find(x => x.id === id); if (!s) return;
    const cur = id === D.net.current && D.net.mode === 'wifi';
    openSheet({
      title: `${s.ssid} 를 삭제할까요?`,
      body: cur ? '지금 이 화면은 이 Wi-Fi로 접속 중입니다. 삭제하면 연결이 끊기고, 기기 버튼을 10초 눌러 Wi-Fi를 다시 설정해야 합니다.' : '저장된 네트워크 목록에서 지웁니다. 다시 쓰려면 기기에서 비밀번호를 입력해 추가해야 합니다.',
      actions: [cancelBtn, { label: '삭제', cls: 'btn-danger-solid', run: () => {
        buzz();
        D.net.saved = D.net.saved.filter(x => x.id !== id);
        log('web', 'INFO', `wifi profile removed: ${s.ssid}`);
        addAudit({ icon: 'wifi_off', tone: 'bad', title: 'Wi-Fi 삭제', sub: s.ssid });
        if (cur) { D.net.current = 0; setMode('lost', 'wifi_removed'); }
        else { renderWifi(); toast('Wi-Fi를 삭제했어요', 'delete'); }
      } }],
    });
  }

  let lostTimer = 0;
  function setMode(mode, reason = '') {
    const n = D.net, prev = n.mode;
    if (mode === prev && !reason) return;
    clearTimeout(lostTimer);
    n.mode = mode; n.reason = reason; n.since = now();
    if (mode === 'usb') {
      n.ap.open = false;
      log('web', 'INFO', 'wlan0 down (usb mode), usb0 up 192.168.7.2');
    } else if (mode === 'wifi') {
      if (!n.saved.length) n.saved.push({ id: Date.now(), ssid: 'MyHome_5G' });
      if (!n.saved.some(s => s.id === n.current)) n.current = n.saved[0].id;
      if (!D.devices.some(d => d.current)) D.devices.unshift({ id: Date.now() + 1, name: '휴대폰 (Android)', icon: 'smartphone', reg: hm(new Date()), last: '방금', current: true });
      n.rssi = -52;
      log('web', 'INFO', `wlan0 associated ssid=${netSsid()} ip=${n.ip} rssi=${n.rssi}dBm`);
    } else {
      n.drops++;
      n.ap.open = false;
      D.preview = { active: false, pending: false, endsAt: 0 };
      log('web', 'WARNING', `wlan0 disassociated (${reason})`);
      if (reason === 'drop') {
        lostTimer = setTimeout(() => { setMode('wifi'); toast('다시 연결됐어요', 'wifi'); }, 8000);
      }
    }
    renderNet(); renderWifi(); renderDevices(); renderSecurity(); renderPreview(); updateStale();
  }
  function toggleAp() {
    const n = D.net;
    if (n.mode !== 'wifi') { toast('Wi-Fi 모드에서만 시험할 수 있어요', 'wifi'); return; }
    n.ap = n.ap.open ? { open: false, endsAt: 0 } : { open: true, endsAt: now() + 600e3 };
    log('web', 'INFO', n.ap.open ? 'ap Coach-A1B2 opened (button 10s, 10min window)' : 'ap Coach-A1B2 closed');
    renderNet(); renderSecurity();
    toast(n.ap.open ? '기기 자체 Wi-Fi가 10분 동안 열렸어요' : '기기 자체 Wi-Fi를 닫았어요', 'wifi');
  }

  /* ===================== 시연 도구 ===================== */
  function openDemo() {
    const st = Object.entries(STATUS).map(([k, v]) => `<button type="button" class="chip chip-btn${D.status === k ? ' on' : ''}" data-demo="status:${k}">${v.label}</button>`).join('');
    const nm = D.net.mode, ap = D.net.ap.open;
    const nb = (v, t, on) => `<button type="button" class="chip chip-btn${on ? ' on' : ''}" data-demo="net:${v}">${t}</button>`;
    openSheet({
      title: '시연 도구',
      body: `<p class="small">실제 기기에는 없는 시연용 도구입니다. 상태와 연결 방식을 바꿔 화면이 어떻게 달라지는지 볼 수 있습니다.</p>
        <p class="demo-h">기기 상태</p><div class="chips chips-wrap">${st}</div>
        <p class="demo-h">연결 방식</p><div class="chips chips-wrap">${nb('usb', 'USB 모드', nm === 'usb')}${nb('wifi', 'Wi-Fi 모드', nm === 'wifi')}${nb('drop', '공유기 끊김 시험', false)}${nb('ap', ap ? '자체 Wi-Fi 닫기' : '자체 Wi-Fi 열기', ap)}</div>`,
      actions: [{ label: '닫기', cls: 'btn-ghost' }],
    });
  }

  /* update */
  async function applyUpdate() {
    const btn = $('#updateApply'), bar = $('#updateProgress'), fill = $('i', bar);
    btn.disabled = true; bar.hidden = false; fill.style.width = '0';
    const steps = [['서명 확인 중…', 30], ['파일 검증 중…', 65], ['적용 준비 중…', 100]];
    for (const [label, w] of steps) { $('#fileName').textContent = label; await sleep(reduced ? 50 : 700); fill.style.width = `${w}%`; }
    await sleep(300);
    const name = $('#updateFile').files[0]?.name || '업데이트';
    $('#fileName').textContent = '업데이트 파일 선택'; bar.hidden = true; $('#updateFile').value = '';
    log('web', 'INFO', `update package verified: ${name}`);
    addAudit({ icon: 'system_update', tone: 'ok', title: '업데이트 파일 검증', sub: `${name} · 다음 재시작 때 적용` });
    toast('서명을 확인했어요. 다음 재시작 때 적용됩니다', 'system_update');
  }

  /* ===================== live render ===================== */
  function renderLive() {
    setText($('#lastUpdate'), clock(new Date()), true);
    setText($('#heroDur'), dur((now() - D.since) / 1000), true);
    renderStats();
    renderGauges(); renderContainers(); renderPerf();
    setText($('#hwVolt'), `${D.sys.volt.toFixed(2)} V`, true);
    renderNetLive();
    $$('[data-ongoing]').forEach(el => { const a = D.alerts.find(x => x.ongoing); if (a) el.textContent = dur(a.dur); });
    if (D.preview.active) { setText($('#previewLeft'), leftText(), true); $('#adminPreviewSub').textContent = `남은 시간 ${leftText()} · 기기 화면에 "영상 보기 중" 표시 중`; }
  }

  /* ===================== tabs / accordion / reveal ===================== */
  const TABS = ['function', 'system', 'admin'];
  function showTab(name, focus) {
    const idx = Math.max(0, TABS.indexOf(name));
    name = TABS[idx];
    $('#tablist').style.setProperty('--i', idx);
    $$('.tab').forEach(t => { const on = t.dataset.tab === name; t.setAttribute('aria-selected', on); t.tabIndex = on ? 0 : -1; if (on && focus) t.focus(); });
    $$('.panel').forEach(p => {
      const on = p.id === `panel-${name}`;
      if (on && p.hidden) { p.hidden = false; p.classList.remove('enter'); void p.offsetWidth; p.classList.add('enter'); }
      else if (!on) p.hidden = true;
    });
    window.scrollTo({ top: 0, behavior: reduced ? 'auto' : 'smooth' });
    try { history.replaceState(null, '', `#${name}`); } catch (_) { /* file:// 등 */ }
    if (name === 'system') renderLogs();
  }
  function initReveal() {
    if (reduced || !('IntersectionObserver' in window)) return;
    const io = new IntersectionObserver(es => es.forEach(e => {
      if (!e.isIntersecting) return;
      const el = e.target; io.unobserve(el);
      el.style.transitionDelay = `${Math.min([...el.parentElement.children].indexOf(el), 6) * 50}ms`;
      el.classList.add('in');
      setTimeout(() => { el.style.transitionDelay = ''; }, 900);
    }), { threshold: .06 });
    $$('.panel > .card').forEach(c => { c.classList.add('reveal'); io.observe(c); });
  }

  /* ===================== events ===================== */
  function bind() {
    $('#tablist').addEventListener('click', e => { const t = e.target.closest('.tab'); if (t) showTab(t.dataset.tab); });
    $('#tablist').addEventListener('keydown', e => {
      const i = TABS.indexOf($('.tab[aria-selected="true"]').dataset.tab);
      const to = { ArrowRight: (i + 1) % 3, ArrowLeft: (i + 2) % 3, Home: 0, End: 2 }[e.key];
      if (to !== undefined) { e.preventDefault(); showTab(TABS[to], true); }
    });

    document.addEventListener('click', e => {
      const h = e.target.closest('.acc-head');
      if (h) { const a = h.closest('.acc'); const o = a.classList.toggle('open'); h.setAttribute('aria-expanded', o); }
    });

    $('#demoBtn').addEventListener('click', openDemo);
    $('#sheetBody').addEventListener('click', e => {
      const b = e.target.closest('[data-demo]'); if (!b) return;
      sheet.close();
      const [kind, val] = b.dataset.demo.split(':');
      if (kind === 'status') {
        if (D.lock) { toast('기기가 다른 작업 중이에요', 'hourglass_top'); return; }
        if (D.net.mode === 'lost') { toast('연결이 끊긴 동안은 상태를 바꿀 수 없어요', 'wifi_off'); return; }
        setStatus(val);
      } else if (kind === 'net') {
        if (val === 'drop') { if (D.net.mode !== 'wifi') { toast('Wi-Fi 모드에서만 시험할 수 있어요', 'wifi'); return; } setMode('lost', 'drop'); }
        else if (val === 'ap') toggleAp();
        else setMode(val);
      }
    });
    $('#wifiList').addEventListener('click', e => {
      const b = e.target.closest('[data-wifi-del]'); if (b) deleteWifi(Number(b.closest('li').dataset.id));
    });
    $('#refreshBtn').addEventListener('click', e => {
      const b = e.currentTarget; b.classList.add('spin');
      const m = $('#main'); m.classList.add('is-loading');
      setTimeout(() => { m.classList.remove('is-loading'); b.classList.remove('spin'); renderLive(); toast('최신 상태로 갱신했어요', 'refresh'); }, reduced ? 50 : 650);
    });

    $$('[data-range]').forEach(b => b.addEventListener('click', () => {
      chartRange = b.dataset.range;
      $$('[data-range]').forEach(x => x.setAttribute('aria-checked', x === b));
      renderChart();
    }));
    $('#chart').addEventListener('click', e => { const g = e.target.closest('.bar'); if (g) pickBar(g); });
    $('#chart').addEventListener('keydown', e => { if ((e.key === 'Enter' || e.key === ' ') && e.target.closest('.bar')) { e.preventDefault(); pickBar(e.target.closest('.bar')); } });

    $('#alertList').addEventListener('click', e => {
      const b = e.target.closest('.tl-act'); if (!b) return;
      const a = D.alerts.find(x => x.id === Number(b.closest('.tl-item').dataset.id));
      a.fp = !a.fp; renderAlerts();
      log('web', 'INFO', `POST /api/alerts/${a.id}/feedback false_positive=${a.fp}`);
      toast(a.fp ? '오탐으로 기록했어요. 민감도는 자동으로 바뀌지 않아요' : '오탐 신고를 취소했어요', 'flag');
    });

    $('#settingRows').addEventListener('click', e => {
      const b = e.target.closest('[data-d]'); if (!b) return;
      const s = SETTINGS.find(x => x.key === b.closest('.s-row').dataset.k);
      draft[s.key] = clamp(draft[s.key] + Number(b.dataset.d) * s.step, s.min, s.max);
      syncSettings();
    });
    $('#settingSave').addEventListener('click', saveSettings);
    $('#settingReset').addEventListener('click', () => { draft = { ...saved }; syncSettings(); });

    $('#calibBtn').addEventListener('click', () => openSheet({
      title: '다시 맞출까요?',
      body: '기기 화면에서 안내가 시작됩니다. 평소 모니터를 보는 자세로 앉아 주세요. 약 10초 걸리고, 그동안 판정이 멈춥니다. 기존 기준값은 완료될 때 바뀝니다.',
      actions: [cancelBtn, { label: '시작', cls: 'btn-primary', run: startCalibration }],
    }));
    $('#previewBtn').addEventListener('click', () => D.preview.active ? stopPreview('사용자가 종료') : requestPreview());
    $('#adminPreviewStop').addEventListener('click', () => openSheet({
      title: '영상 보기를 강제로 끝낼까요?',
      body: '보고 있는 기기의 영상이 바로 끊깁니다.',
      actions: [cancelBtn, { label: '강제 종료', cls: 'btn-danger-solid', run: () => { buzz(); stopPreview('관리자가 강제 종료'); } }],
    }));

    $('#logLevel').addEventListener('click', e => {
      const b = e.target.closest('button'); if (!b) return;
      logFilter.lvl = b.dataset.v;
      $$('#logLevel button').forEach(x => x.setAttribute('aria-checked', x === b)); renderLogs();
    });
    $('#logSrc').addEventListener('click', e => {
      const b = e.target.closest('button'); if (!b) return;
      logFilter.src = b.dataset.v;
      $$('#logSrc button').forEach(x => { const on = x === b; x.classList.toggle('on', on); x.setAttribute('aria-pressed', on); }); renderLogs();
    });
    $('#logPause').addEventListener('click', e => {
      logPaused = !logPaused;
      const b = e.currentTarget; b.setAttribute('aria-pressed', logPaused);
      $('.material-symbols-outlined', b).textContent = logPaused ? 'play_arrow' : 'pause';
      $('span:last-child', b).textContent = logPaused ? '계속 보기' : '일시정지';
      if (!logPaused) renderLogs();
    });

    $('#deviceList').addEventListener('click', e => {
      const b = e.target.closest('[data-unlink]'); if (b) unlinkDevice(Number(b.closest('li').dataset.id));
    });
    $('#updateFile').addEventListener('change', e => {
      const f = e.target.files[0];
      $('#fileName').textContent = f ? f.name : '업데이트 파일 선택';
      $('#updateApply').disabled = !f;
    });
    $('#updateApply').addEventListener('click', applyUpdate);

    addEventListener('offline', () => setOffline(true));
    addEventListener('online', () => setOffline(false));
    addEventListener('hashchange', () => showTab(location.hash.slice(1)));
  }
  function setOffline(v) {
    offline = v;
    updateStale();
    if (!v) toast('다시 연결됐어요', 'wifi');
  }
  /* 화면이 기기와 이어져 있지 않은 상태: 브라우저 오프라인, 공유기 끊김, 등록·Wi-Fi 삭제 */
  const isStale = () => offline || D.net.mode === 'lost';
  const STALE_MSG = {
    browser: '이 기기의 인터넷 연결이 끊겼습니다.',
    drop: '기기와 연결이 끊겼습니다. 공유기에 다시 연결하는 중입니다…',
    wifi_removed: '저장된 Wi-Fi가 삭제되어 연결이 끊겼습니다. 기기 버튼을 10초 눌러 설정 메뉴에서 Wi-Fi를 다시 설정하세요.',
    unregistered: '이 기기의 등록이 해제되어 연결이 끊겼습니다. 기기 화면의 4자리 코드로 다시 등록하세요.',
  };
  function updateStale() {
    const st = isStale();
    document.body.classList.toggle('offline', st);
    $('#staleBar').hidden = !st;
    if (st) {
      const key = D.net.mode === 'lost' ? D.net.reason : 'browser';
      $('#staleMsg').innerHTML = `${esc(STALE_MSG[key])} 마지막 갱신 <b>${esc($('#lastUpdate').textContent)}</b>`;
    }
    renderModeChip();
  }

  /* ===================== boot ===================== */
  function boot() {
    renderHero(); renderStats(); renderChart(); renderAlerts(); renderSettings(); renderPreview();
    initGauges(); initContainers(); renderGauges(); renderContainers(); renderPerf(); renderQuality(); renderHardware();
    renderNet(); renderModeChip(); renderWifi();
    renderDevices(); renderSecurity(); renderAudit(); renderLogs();
    bind();
    showTab(location.hash.slice(1) || 'function');
    window.scrollTo(0, 0);
    setTimeout(() => {
      $('#main').classList.remove('is-loading');
      ready = true;
      initReveal();
      $('#heroAlerts').dataset.v = 0; $('#heroAlerts').textContent = 0;
      renderStats();           // 숫자가 0에서 올라간다
      renderLive();
      setInterval(tick, 1000);
    }, reduced ? 0 : 750);
  }
  boot();
})();
