/**
 * Radiant Queen — official website assistant widget (PUBLIC for all visitors)
 */
(function () {
  if (window.__RQ_CHAT_LOADED) return;
  window.__RQ_CHAT_LOADED = true;

  var API = (window.RQ_ASSISTANT_API || '/api/website-assistant');
  var history = [];
  try {
    history = JSON.parse(sessionStorage.getItem('rq_webchat') || '[]');
  } catch (_) { history = []; }

  function el(tag, attrs, kids) {
    var n = document.createElement(tag);
    if (attrs) Object.keys(attrs).forEach(function (k) {
      if (k === 'className') n.className = attrs[k];
      else if (k === 'text') n.textContent = attrs[k];
      else if (k.indexOf('on') === 0) n[k] = attrs[k];
      else n.setAttribute(k, attrs[k]);
    });
    (kids || []).forEach(function (c) { if (c) n.appendChild(c); });
    return n;
  }

  var root = el('div', { id: 'rq-chat-root' });
  var btn = el('button', { id: 'rq-chat-btn', type: 'button', title: 'Radiant Queen Assistant', text: '✦' });
  var panel = el('div', { id: 'rq-chat-panel' });
  var head = el('div', { id: 'rq-chat-head' }, [
    el('div', null, [el('span', { text: 'Radiant Queen' }), document.createTextNode(' · Official Assistant')]),
  ]);
  var close = el('button', { id: 'rq-chat-close', type: 'button', text: '×' });
  head.appendChild(close);
  var msgs = el('div', { id: 'rq-chat-msgs' });
  var typing = el('div', { id: 'rq-chat-typing', text: 'Assistant is typing…' });
  var sugg = el('div', { id: 'rq-chat-suggestions' });
  ['How do I create a bot?', 'What is free?', 'Radiant Gold?', 'Templates'].forEach(function (q) {
    var b = el('button', { type: 'button', text: q });
    b.onclick = function () { send(q); };
    sugg.appendChild(b);
  });
  var form = el('form', { id: 'rq-chat-form' });
  var input = el('input', { id: 'rq-chat-input', type: 'text', placeholder: 'Ask about Radiant Queen…', autocomplete: 'off' });
  var sendBtn = el('button', { id: 'rq-chat-send', type: 'submit', text: 'Send' });
  form.appendChild(input);
  form.appendChild(sendBtn);
  panel.appendChild(head);
  panel.appendChild(msgs);
  panel.appendChild(typing);
  panel.appendChild(sugg);
  panel.appendChild(form);
  root.appendChild(btn);
  root.appendChild(panel);
  document.body.appendChild(root);

  function addMsg(role, text) {
    var m = el('div', { className: 'rq-msg ' + role, text: text });
    msgs.appendChild(m);
    msgs.scrollTop = msgs.scrollHeight;
  }

  function persist() {
    try { sessionStorage.setItem('rq_webchat', JSON.stringify(history.slice(-20))); } catch (_) {}
  }

  if (!history.length) {
    addMsg('bot', '👋 Welcome to Radiant Queen. I\'m your official assistant. How can I help you create your bot today?');
  } else {
    history.forEach(function (h) { addMsg(h.role, h.text); });
  }

  btn.onclick = function () { panel.classList.toggle('open'); };
  close.onclick = function () { panel.classList.remove('open'); };

  async function send(text) {
    text = String(text || '').trim();
    if (!text) return;
    addMsg('user', text);
    history.push({ role: 'user', text: text });
    persist();
    input.value = '';
    typing.style.display = 'block';
    try {
      var res = await fetch(API, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: text }),
      });
      var j = await res.json();
      var reply = (j && j.reply) || 'Sorry — please try again.';
      addMsg('bot', reply);
      history.push({ role: 'bot', text: reply });
      persist();
    } catch (e) {
      addMsg('bot', 'Network error. Please retry.');
    }
    typing.style.display = 'none';
  }

  form.onsubmit = function (e) {
    e.preventDefault();
    send(input.value);
  };
})();
