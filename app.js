const tg = window.Telegram?.WebApp; tg?.ready(); tg?.expand();
try { tg?.setHeaderColor('#000000'); tg?.setBackgroundColor('#000000'); } catch {}
const $ = id => document.getElementById(id);
const show = id => document.querySelectorAll('.card').forEach(c => c.classList.toggle('show', c.id === id));
$('join').href = window.CHAT_URL;

// ---- кометы на фоне ----
const cv = $('sky'), cx = cv.getContext('2d'); let W, H, stars = [], comets = [];
const rs = () => { W = cv.width = innerWidth * devicePixelRatio; H = cv.height = innerHeight * devicePixelRatio;
  stars = Array.from({ length: 120 }, () => ({ x: Math.random() * W, y: Math.random() * H, r: Math.random() * 1.4 * devicePixelRatio, t: Math.random() * 6 })); };
rs(); addEventListener('resize', rs);
(function loop() {
  cx.fillStyle = '#000'; cx.fillRect(0, 0, W, H);
  for (const s of stars) { s.t += .02; cx.globalAlpha = .3 + Math.abs(Math.sin(s.t)) * .7; cx.fillStyle = '#fff'; cx.beginPath(); cx.arc(s.x, s.y, s.r, 0, 7); cx.fill(); }
  if (Math.random() < .03) comets.push({ x: Math.random() * W * 1.2, y: -20, v: (6 + Math.random() * 8) * devicePixelRatio, l: (80 + Math.random() * 160) * devicePixelRatio, a: 1 });
  cx.globalAlpha = 1;
  comets = comets.filter(c => { c.x -= c.v * .7; c.y += c.v; c.a -= .006;
    const g = cx.createLinearGradient(c.x, c.y, c.x + c.l * .7, c.y - c.l); g.addColorStop(0, `rgba(255,255,255,${c.a})`); g.addColorStop(1, 'rgba(255,255,255,0)');
    cx.strokeStyle = g; cx.lineWidth = 2 * devicePixelRatio; cx.beginPath(); cx.moveTo(c.x, c.y); cx.lineTo(c.x + c.l * .7, c.y - c.l); cx.stroke();
    return c.a > 0 && c.y < H + 50; });
  requestAnimationFrame(loop);
})();

// ---- результат уходит боту через Telegram (без сервера) ----
let result = null;
function finish(passed, token) { result = { passed, token }; passed ? show('s3') : show('s4'); }
function sendResult() { try { tg.sendData(JSON.stringify(result)); } catch { tg?.close(); } }
$('join').onclick = e => { e.preventDefault(); tg?.openTelegramLink(window.CHAT_URL); setTimeout(sendResult, 300); };
document.querySelector('#s4 .btn').onclick = sendResult;

// ---- этап 1: найти отличающийся символ ----
const PAIRS = [['O','Q'],['E','F'],['b','d'],['p','q'],['M','N'],['6','9'],['★','☆'],['▲','▼'],['◐','◑'],['C','G'],['8','B']];
let tries = 3, round = 0;
function build() {
  const [a, b] = PAIRS[Math.floor(Math.random() * PAIRS.length)], odd = Math.floor(Math.random() * 16);
  $('grid').innerHTML = ''; $('tries').textContent = `Осталось попыток: ${tries}`;
  for (let i = 0; i < 16; i++) {
    const c = document.createElement('div'); c.className = 'cell'; c.textContent = i === odd ? b : a; c.style.animationDelay = i * 25 + 'ms';
    c.onclick = () => {
      if (i === odd) { c.classList.add('right'); tg?.HapticFeedback?.notificationOccurred('success'); round++;
        setTimeout(() => round < 2 ? build() : stage2(), 450); }
      else { c.classList.add('wrong'); tg?.HapticFeedback?.notificationOccurred('error'); tries--;
        if (tries <= 0) return finish(false); setTimeout(build, 450); }
    };
    $('grid').appendChild(c);
  }
}

// ---- этап 2: Cloudflare Turnstile ----
function stage2() {
  show('s2');
  if (!window.TURNSTILE_SITEKEY) { $('s2hint').textContent = 'Проверка…'; return setTimeout(() => finish(true, ''), 900); }
  const go = () => turnstile.render('#ts', { sitekey: window.TURNSTILE_SITEKEY, theme: 'dark',
    callback: t => { $('s2hint').textContent = 'Готово ✓'; finish(true, t); },
    'error-callback': () => { $('s2hint').textContent = 'Ошибка, попробуйте ещё'; } });
  window.turnstile ? go() : (function w() { window.turnstile ? go() : setTimeout(w, 200); })();
}

build();
