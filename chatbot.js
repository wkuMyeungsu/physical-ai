// 제품 질문 챗봇 위젯 (index.html · report.html 공용). Supabase Edge Function "rag" 호출.
// 대화·열림 상태·입력 중인 글·스크롤은 sessionStorage에 저장해서 페이지를 옮겨도(같은 탭) 이어진다.
(function () {
  var API = 'https://btwqbhckvhqllrntluli.supabase.co/functions/v1/rag';
  var ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJ0d3FiaGNrdmhxbGxybnRsdWxpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTE4Mjk1ODgsImV4cCI6MjEwNzQwNTU4OH0.3DbdaYXsIklojaGJiM0j9zFDs_pAANz--qtJeCdsB_o'; // public anon key (RLS protects data)
  var STORE = 'chatSession.v1', SET_KEY = 'chatSuggestSet', MAX_MSGS = 40;
  var ON_REPORT = /report\.html$/.test(location.pathname);
  var MOBILE = '(max-width: 639px)';

  // 추천 질문: 4개씩 6세트. 페이지를 불러올 때마다 다음 세트로 넘어간다 (제품·사용·기술·한계가 섞이게 묶음)
  var SUGGEST = [
    '이 제품은 뭐 하는 거예요?', '영상이 저장되거나 밖으로 나가나요?', '거북목은 어떻게 알아내요?', '정확도는 얼마나 되나요?',
    '기존 자세 교정 앱과 뭐가 달라요?', '어떻게 설치하나요?', '어떤 AI 모델을 쓰나요?', '의료기기인가요?',
    '입을 벌리고 있는 건 어떻게 알아요?', '안경을 쓰면 인식이 되나요?', '어떤 보드와 카메라를 쓰나요?', '도입하면 얼마나 이득인가요?',
    '말하거나 하품할 때도 알림이 울려요?', '책상 위에 두고 써도 되나요?', '왜 YOLO-seg를 골랐나요?', '지금 어디까지 만들어졌나요?',
    '알림은 어떻게 오나요? 소리도 나요?', '어두운 곳에서도 쓸 수 있나요?', '와이파이나 배터리가 있나요?', '판매 가격은 얼마인가요?',
    '쓰다 보면 나한테 맞춰지나요?', '마스크를 쓰고도 쓸 수 있나요?', '알림은 하루에 몇 번까지 오나요?', '목과 입 말고 다른 자세도 봐주나요?'
  ];
  var PER_SET = 4, SETS = SUGGEST.length / PER_SET;
  var setNo;
  try { setNo = (parseInt(localStorage.getItem(SET_KEY), 10) + 1) % SETS; } catch (e) {}
  if (!(setNo >= 0)) setNo = Math.floor(Math.random() * SETS); // 저장소를 못 쓰거나 첫 방문이면 무작위 세트
  try { localStorage.setItem(SET_KEY, String(setNo)); } catch (e) {}
  function nextSet() {
    var items = SUGGEST.slice(setNo * PER_SET, setNo * PER_SET + PER_SET);
    setNo = (setNo + 1) % SETS;
    return items;
  }

  // 저장된 세션: { open, msgs:[{t:'user'|'bot'|'err'|'chips', text, sources, items}], draft, scroll }
  var st;
  try { st = JSON.parse(sessionStorage.getItem(STORE)); } catch (e) {}
  if (!st || !Array.isArray(st.msgs)) st = { open: false, msgs: [], draft: '', scroll: null };
  function save() { try { sessionStorage.setItem(STORE, JSON.stringify(st)); } catch (e) {} }

  var tpl = document.createElement('div');
  tpl.innerHTML =
    '<button id="chatFab" type="button" aria-label="제품 질문 챗봇 열기" aria-expanded="false" aria-controls="chatPanel" class="[&[hidden]]:hidden fixed bottom-5 right-5 z-[60] h-14 pl-4 pr-5 rounded-full bg-primary text-on-primary shadow-lg hover:bg-primary-container transition-colors inline-flex items-center gap-2 font-label-lg text-label-lg">' +
      '<span class="material-symbols-outlined text-[22px]" aria-hidden="true">forum</span><span>제품 질문하기</span></button>' +
    '<section id="chatPanel" role="dialog" aria-label="제품 질문 챗봇" hidden class="[&[hidden]]:hidden fixed z-[60] inset-0 sm:inset-auto sm:bottom-5 sm:right-5 sm:w-[400px] sm:h-[620px] sm:max-h-[calc(100vh-2.5rem)] flex flex-col bg-surface-container-lowest sm:rounded-3xl sm:border sm:border-surface-container shadow-2xl overflow-hidden">' +
      '<div class="flex items-center justify-between gap-space-sm px-space-md h-14 shrink-0 bg-primary text-on-primary">' +
        '<div class="flex items-center gap-space-sm min-w-0"><span class="material-symbols-outlined text-[22px]" aria-hidden="true">forum</span><span class="font-label-lg text-label-lg truncate">제품 질문하기</span></div>' +
        '<button id="chatClose" type="button" aria-label="챗봇 닫기" class="w-10 h-10 rounded-full hover:bg-primary-container transition-colors flex items-center justify-center"><span class="material-symbols-outlined" aria-hidden="true">close</span></button>' +
      '</div>' +
      '<div id="chatLog" role="log" aria-live="polite" class="flex-1 overflow-y-auto px-space-md py-space-md flex flex-col gap-space-sm bg-surface"></div>' +
      '<form id="chatForm" class="shrink-0 border-t border-surface-container p-space-sm bg-surface-container-lowest">' +
        '<div class="flex items-end gap-space-sm">' +
          '<textarea id="chatInput" rows="1" maxlength="200" aria-label="질문 입력" placeholder="궁금한 점을 입력하세요 (200자 이내)" class="flex-1 resize-none rounded-2xl bg-surface-container-low border border-surface-container px-3 py-2.5 font-body-sm text-body-sm text-on-surface placeholder:text-outline focus:outline-none focus:ring-2 focus:ring-primary max-h-28"></textarea>' +
          '<button id="chatSend" type="submit" aria-label="보내기" class="w-11 h-11 shrink-0 rounded-full bg-primary text-on-primary hover:bg-primary-container transition-colors disabled:opacity-40 flex items-center justify-center"><span class="material-symbols-outlined text-[20px]" aria-hidden="true">arrow_upward</span></button>' +
        '</div>' +
        '<p class="mt-1.5 px-1 text-[11px] text-on-surface-variant">제공된 자료만으로 답하며, 수치는 PRD의 목표값입니다. AI 답변은 틀릴 수 있어요.</p>' +
      '</form>' +
    '</section>';
  while (tpl.firstChild) document.body.appendChild(tpl.firstChild);

  var fab = document.getElementById('chatFab'), panel = document.getElementById('chatPanel'),
      log = document.getElementById('chatLog'), form = document.getElementById('chatForm'),
      input = document.getElementById('chatInput'), send = document.getElementById('chatSend');
  var busy = false;

  function el(tag, cls, text) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text) n.textContent = text; // 서버 응답은 항상 textContent로 (XSS 방지)
    return n;
  }
  function scrollDown() { log.scrollTop = log.scrollHeight; }
  function bubble(text, mine) {
    var b = el('div', 'max-w-[88%] px-3.5 py-2.5 rounded-2xl font-body-sm text-body-sm whitespace-pre-wrap break-words ' +
      (mine ? 'self-end bg-primary text-on-primary rounded-br-md' : 'self-start bg-surface-container-low text-on-surface rounded-bl-md'), text);
    log.appendChild(b); return b;
  }
  function chips(items) {
    var wrap = el('div', 'self-start flex flex-col items-start gap-1.5');
    items.forEach(function (q) {
      var c = el('button', 'text-left px-3 py-1.5 rounded-xl bg-surface-container-lowest border border-surface-container text-on-surface font-label-md text-label-md hover:bg-primary-fixed/50 transition-colors', q);
      c.type = 'button';
      c.addEventListener('click', function () { ask(q); });
      wrap.appendChild(c);
    });
    log.appendChild(wrap);
  }

  // 서버가 준 링크는 이 사이트의 앵커 형태만 허용하고, 지금 보고 있는 페이지에 맞게 푼다
  // ('#key-features'는 index.html의 앵커, 'report.html#yolo'는 보고서의 앵커)
  var SAFE_LINK = /^(report\.html)?#[\w-]+$/;
  function hrefFor(link) {
    var toReport = link.indexOf('report.html') === 0, hash = link.slice(link.indexOf('#'));
    if (toReport === ON_REPORT) return hash;
    return './' + (toReport ? 'report.html' : 'index.html') + hash;
  }
  function sources(answer, list) {
    var cited = {};
    (answer.match(/\[[\d,\s]+\]/g) || []).forEach(function (m) { m.slice(1, -1).split(',').forEach(function (n) { cited[parseInt(n, 10)] = true; }); });
    var used = (list || []).filter(function (s) { return cited[s.n]; });
    if (!used.length) return;
    var d = el('details', 'self-start max-w-[88%] font-label-md text-label-md text-on-surface-variant');
    d.appendChild(el('summary', 'cursor-pointer select-none', '근거 ' + used.length + '건 보기'));
    var ul = el('ul', 'mt-1.5 flex flex-col gap-1 list-none p-0 m-0');
    used.forEach(function (s) {
      var li = el('li', 'font-normal');
      li.appendChild(document.createTextNode('[' + s.n + '] '));
      if (s.link && SAFE_LINK.test(s.link)) {
        var a = el('a', 'text-primary underline', s.title + ' · 홈페이지에서 보기');
        a.href = hrefFor(s.link);
        // 모바일은 패널이 화면을 덮으므로, 이동 전에 닫아 둔다 (다음 페이지에서도 닫힌 채로 열림)
        a.addEventListener('click', function () { if (window.matchMedia(MOBILE).matches) setOpen(false); });
        li.appendChild(a);
      } else li.appendChild(document.createTextNode(s.title));
      ul.appendChild(li);
    });
    d.appendChild(ul); log.appendChild(d);
  }

  function render(m) {
    if (m.t === 'user') bubble(m.text, true);
    else if (m.t === 'err') bubble(m.text, false).classList.add('text-error');
    else if (m.t === 'chips') chips(m.items);
    else { bubble(m.text, false); sources(m.text, m.sources); }
  }
  function add(m) {
    st.msgs.push(m);
    if (st.msgs.length > MAX_MSGS) st.msgs.shift();
    save(); render(m); scrollDown();
  }

  async function ask(q) {
    q = q.trim();
    if (!q || busy) return;
    busy = true; send.disabled = true; input.value = ''; st.draft = ''; autosize();
    add({ t: 'user', text: q });
    var wait = bubble('답변을 찾는 중…', false); wait.classList.add('animate-pulse'); scrollDown();
    try {
      var res = await fetch(API, { method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + ANON, 'apikey': ANON }, body: JSON.stringify({ question: q }) });
      var data = await res.json();
      if (!res.ok || data.error) throw new Error(data.error || ('HTTP ' + res.status));
      wait.remove();
      add({ t: 'bot', text: data.answer || '답변을 받지 못했어요.', sources: data.sources || [] });
      if (data.refused) add({ t: 'chips', items: nextSet() });
    } catch (e) {
      wait.remove();
      add({ t: 'err', text: '답변을 가져오지 못했어요. 잠시 뒤 다시 시도해 주세요.' });
    }
    busy = false; send.disabled = false; input.focus();
  }

  function autosize() { input.style.height = 'auto'; input.style.height = Math.min(input.scrollHeight, 112) + 'px'; }
  function setOpen(open, focus) {
    st.open = open; save();
    panel.hidden = !open; fab.hidden = open && window.matchMedia(MOBILE).matches;
    fab.setAttribute('aria-expanded', String(open));
    if (open) { if (focus !== false) input.focus(); } else { fab.hidden = false; if (focus !== false) fab.focus(); }
  }

  // 복원: 환영 문구 + (이번에 불러온) 추천 질문, 그다음 저장된 대화
  bubble('안녕하세요! 거북목 & 입벌림 AI 코치에 대해 궁금한 점을 물어보세요. 아래 질문을 눌러도 돼요.', false);
  chips(nextSet());
  // 답변을 기다리다 페이지를 옮기면 요청이 끊긴다. 마지막이 질문이면 알려 준다
  var last = st.msgs[st.msgs.length - 1];
  if (last && last.t === 'user') { st.msgs.push({ t: 'err', text: '페이지를 옮기는 바람에 답변이 끊겼어요. 질문을 다시 해 주세요.' }); save(); }
  st.msgs.forEach(render);
  input.value = st.draft || ''; autosize();
  if (st.open) setOpen(true, false);
  if (typeof st.scroll === 'number') log.scrollTop = st.scroll; else scrollDown();

  var ticking = false;
  log.addEventListener('scroll', function () {
    if (ticking) return; ticking = true;
    requestAnimationFrame(function () { st.scroll = log.scrollTop; ticking = false; });
  });
  // 저장은 이동 직전(pagehide)에 한 번 더: 스크롤 위치와 입력 중인 글
  addEventListener('pagehide', function () { st.scroll = log.scrollTop; st.draft = input.value; save(); });
  input.addEventListener('input', function () { autosize(); st.draft = input.value; save(); });

  fab.addEventListener('click', function () { setOpen(true); });
  document.getElementById('chatClose').addEventListener('click', function () { setOpen(false); });
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && !panel.hidden) setOpen(false); });
  form.addEventListener('submit', function (e) { e.preventDefault(); ask(input.value); });
  // Enter 전송, Shift+Enter 줄바꿈. 한글 조합 중(isComposing)의 Enter는 무시해야 마지막 글자가 중복 전송되지 않는다
  input.addEventListener('keydown', function (e) {
    if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) { e.preventDefault(); ask(input.value); }
  });
})();
