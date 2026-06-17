// FunPay OTC Mini App
const tg = window.Telegram?.WebApp;
if (tg) { tg.ready(); tg.expand(); }

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
  try { return JSON.parse(localStorage.getItem('fpotc_state') || 'null') || JSON.parse(JSON.stringify(DEFAULT_STATE)); }
  catch { return JSON.parse(JSON.stringify(DEFAULT_STATE)); }
}
function saveState() { localStorage.setItem('fpotc_state', JSON.stringify(state)); }

let state = loadState()

// ─── DEAL CREATION TEMP ──────────────────────────────────────────────────────
let newDeal = {}
let dealsFilter = 'active'
let walletCurrency = 'TON'
let withdrawMethod = 'tg'
let recipientMode = 'self'
let avatarTapCount = 0
let avatarTapTimer = null

// ─── CURRENCIES ──────────────────────────────────────────────────────────────
const CURRENCIES = [
  { id:'TON', label:'TON', cls:'ton', symbol:'◈' },
  { id:'USDT', label:'USDT', cls:'usdt', symbol:'₮' },
  { id:'STARS', label:'STARS', cls:'stars', symbol:'★' },
  { id:'RUB', label:'RUB', cls:'rub', symbol:'₽' },
  { id:'KGS', label:'KGS', cls:'kgs', symbol:'с' },
  { id:'EUR', label:'EUR', cls:'eur', symbol:'€' },
  { id:'GBP', label:'GBP', cls:'gbp', symbol:'£' },
  { id:'CNY', label:'CNY', cls:'cny', symbol:'¥' },
  { id:'JPY', label:'JPY', cls:'jpy', symbol:'¥' },
  { id:'TRY', label:'TRY', cls:'try', symbol:'₺' },
  { id:'UAH', label:'UAH', cls:'uah', symbol:'₴' },
  { id:'KZT', label:'KZT', cls:'kzt', symbol:'₸' },
  { id:'BTC', label:'BTC', cls:'btc', symbol:'₿' },
  { id:'ETH', label:'ETH', cls:'eth', symbol:'Ξ' },
]

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
})

// ─── TABS ─────────────────────────────────────────────────────────────────────
function switchTab(tab) {
  document.querySelectorAll('.tab-page').forEach(p => p.classList.remove('active'))
  document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'))
  document.getElementById('tab-' + tab).classList.add('active')
  document.getElementById('nav-' + tab).classList.add('active')
  if (tab === 'deals') renderDeals()
  if (tab === 'profile') {
    renderProfile()
    renderBalances()
    renderStats()
    renderAdminPanel()
  }
}

// ─── THEME ────────────────────────────────────────────────────────────────────
function setTheme(theme) {
  state.theme = theme; saveState()
  applyTheme(theme)
  document.getElementById('btnLight').classList.toggle('active', theme==='light')
  document.getElementById('btnDark').classList.toggle('active', theme==='dark')
}
function applyTheme(theme) {
  document.body.classList.toggle('dark', theme==='dark')
}

// ─── PROFILE ──────────────────────────────────────────────────────────────────
function renderProfile() {
  const user = tg?.initDataUnsafe?.user
  const avatarEl = document.getElementById('profileAvatar')
  const nameEl = document.getElementById('profileName')
  const userEl = document.getElementById('profileUsername')

  if (user) {
    if (user.photo_url) {
      avatarEl.innerHTML = `<img src="${user.photo_url}" />`
    } else {
      const initial = (user.first_name || user.username || 'U')[0].toUpperCase()
      avatarEl.textContent = initial
    }
    const displayName = user.username || `${user.first_name || ''} ${user.last_name || ''}`.trim()
    nameEl.textContent = displayName + ' | 100+ reviews'
    userEl.textContent = '@' + (user.username || 'user')
    document.getElementById('selfUsername').textContent = '(@' + (user.username || 'user') + ')'
    document.getElementById('recipientConfirmed').textContent = '✅ Получатель\n@' + (user.username || 'user')
  } else {
    avatarEl.textContent = 'F'
    nameEl.textContent = 'FunPay User | 100+ reviews'
    userEl.textContent = '@funpay_user'
    document.getElementById('selfUsername').textContent = '(@funpay_user)'
    document.getElementById('recipientConfirmed').textContent = '✅ Получатель\n@funpay_user'
  }

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
    openModal('modalAdminPass')
    document.getElementById('adminPassInput').value = ''
    document.getElementById('adminPassError').style.display = 'none'
  }
}

function checkAdminPass() {
  const val = document.getElementById('adminPassInput').value
  if (val === 'huec1488') {
    state.adminUnlocked = true; saveState()
    closeModal('modalAdminPass')
    renderAdminPanel()
    showToast('Доступ к админ-панели открыт!')
    if (tg) {
      try { tg.sendData('admin_access') } catch {}
    }
  } else {
    document.getElementById('adminPassError').style.display = 'block'
  }
}

function renderAdminPanel() {
  const panel = document.getElementById('adminPanel')
  if (!state.adminUnlocked) { panel.style.display = 'none'; return }
  panel.style.display = 'block'
  document.getElementById('adminSuccess').textContent = state.stats.success
  document.getElementById('adminCompleted').textContent = state.stats.completed
  document.getElementById('adminCancelled').textContent = state.stats.cancelled
  document.getElementById('adminTotal').textContent = state.stats.success + state.stats.completed + state.stats.cancelled
  document.getElementById('adminTurnoverVal').textContent = '$' + state.turnover.toFixed(2).replace('.', ',')
}

// ─── BALANCES ─────────────────────────────────────────────────────────────────
function renderBalances() {
  const hideZero = document.getElementById('hideZeroToggle').checked
  const list = document.getElementById('balancesList')
  const html = CURRENCIES.map(c => {
    const val = (state.balances[c.id] || 0).toFixed(2)
    if (hideZero && parseFloat(val) === 0) return ''
    return `<div class="balance-row">
      <div class="cur-icon ${c.cls}">${c.symbol}</div>
      <span class="balance-name">${c.label}</span>
      <span class="balance-amount">${val}</span>
    </div>`
  }).join('')
  list.innerHTML = html || '<div class="empty-state">Все балансы скрыты</div>'
}

function toggleHideZero() { renderBalances() }

// ─── STATS ────────────────────────────────────────────────────────────────────
function renderStats() {
  document.getElementById('statSuccess').textContent = state.stats.success
  document.getElementById('statActive').textContent = state.stats.active
  document.getElementById('statCompleted').textContent = state.stats.completed
  document.getElementById('statCancelled').textContent = state.stats.cancelled
  const total = state.stats.success + state.stats.active + state.stats.completed + state.stats.cancelled
  document.getElementById('statTotal').textContent = total
  document.getElementById('statTurnover').textContent = state.turnover.toFixed(2).replace('.', ',') + ' $'
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
  if (dealsFilter === 'active') {
    deals = deals.filter(d => d.status === 'pending' || d.status === 'active')
  } else {
    deals = deals.filter(d => d.status === 'completed' || d.status === 'cancelled')
  }
  if (!deals.length) {
    list.innerHTML = '<div class="empty-state">Нет активных сделок</div>'
    return
  }
  list.innerHTML = deals.reverse().map(d => renderDealCard(d)).join('')
}

function renderDealCard(d) {
  const statusMap = { pending:'Ожидание оплаты', active:'Активна', completed:'Завершена', cancelled:'Отменена' }
  const badgeMap = { pending:'badge-pending', active:'badge-active', completed:'badge-completed', cancelled:'badge-cancelled' }
  const steps = ['Создана','Покупатель','Оплачена','В аскро','Получена']
  const stepIdx = d.step || 0
  const cur = CURRENCIES.find(c=>c.id===d.currency) || CURRENCIES[0]
  const amountClass = d.status==='cancelled' ? 'deal-amount-text cancelled' : 'deal-amount-text'
  const strikePre = d.status==='cancelled' ? '' : ''

  let progressHtml = '<div class="deal-progress">'
  steps.forEach((s, i) => {
    const done = i <= stepIdx
    const current = i === stepIdx
    progressHtml += `<div class="progress-dot ${done?'done':''} ${current?'current':''}"></div>`
    if (i < steps.length - 1) progressHtml += `<div class="progress-line ${i < stepIdx?'done':''}"></div>`
  })
  progressHtml += '</div>'
  progressHtml += '<div class="progress-labels">' + steps.map((s,i) => `<span class="progress-label ${i<=stepIdx?'done':''}">${s}</span>`).join('') + '</div>'

  return `<div class="deal-card" onclick="openDealDetail('${d.id}')">
    <div class="deal-card-header">
      <span class="deal-id">#DEAL-${d.id}</span>
      <span class="deal-status-badge ${badgeMap[d.status]}">${statusMap[d.status]}</span>
    </div>
    <div class="deal-amount">
      <div class="cur-icon ${cur.cls}" style="width:28px;height:28px;font-size:12px">${cur.symbol}</div>
      <span class="${amountClass}">${strikePre}${d.amount} ${d.currency}</span>
    </div>
    <div class="deal-desc">${d.description || ''}</div>
    <div class="deal-time">🕐 ${timeAgo(d.createdAt)}</div>
    ${progressHtml}
  </div>`
}

function timeAgo(ts) {
  const diff = Math.floor((Date.now() - ts) / 1000)
  if (diff < 60) return diff + ' сек назад'
  if (diff < 3600) return Math.floor(diff/60) + ' мин назад'
  if (diff < 86400) return Math.floor(diff/3600) + ' ч назад'
  return Math.floor(diff/86400) + ' дн назад'
}

function openDealDetail(id) {
  const d = state.deals.find(x=>x.id===id)
  if (!d) return
  const cur = CURRENCIES.find(c=>c.id===d.currency) || CURRENCIES[0]
  const steps = ['Создана','Покупатель','Оплачена','В аскро','Получена']
  const stepIdx = d.step || 0
  const statusMap = { pending:'Ожидание оплаты', active:'Активна', completed:'Завершена', cancelled:'Отменена' }
  const user = tg?.initDataUnsafe?.user
  const uname = '@' + (user?.username || 'user')
  const typeLabel = d.dealType === 'buy' ? 'Покупка' : 'Продажа'
  const createdDate = new Date(d.createdAt).toLocaleString('ru-RU')

  let progressHtml = '<div class="deal-progress" style="margin:0 16px 4px">'
  steps.forEach((s, i) => {
    const done = i <= stepIdx
    const current = i === stepIdx
    progressHtml += `<div class="progress-dot ${done?'done':''} ${current?'current':''}"></div>`
    if (i < steps.length - 1) progressHtml += `<div class="progress-line ${i < stepIdx?'done':''}"></div>`
  })
  progressHtml += '</div>'
  progressHtml += '<div class="progress-labels" style="margin:0 16px 12px;display:flex;justify-content:space-between">' + steps.map((s,i) => `<span class="progress-label ${i<=stepIdx?'done':''}" style="font-size:9px">${s}</span>`).join('') + '</div>'

  const commission = (parseFloat(d.amount) * 0.01).toFixed(2)
  const total = (parseFloat(d.amount) + parseFloat(commission)).toFixed(2)
  const balance = (state.balances[d.currency] || 0).toFixed(2)

  const html = `
    <div class="detail-deal-header">
      <div class="cur-icon ${cur.cls}">${cur.symbol}</div>
      <div>
        <div class="detail-deal-amount-big">${d.amount} ${d.currency}</div>
        <div class="detail-deal-desc">${d.description || ''}</div>
      </div>
    </div>
    <div class="detail-step" style="margin:0 16px 12px">
      <div class="detail-step-title">СТАТУС СДЕЛКИ</div>
      <div class="detail-step-main">Шаг ${stepIdx+1} из 5 — ${steps[stepIdx]}</div>
      ${progressHtml}
      <div style="text-align:center;font-size:11px;color:var(--text-secondary)">Безопасно через Telegram</div>
    </div>
    <div class="detail-step" style="margin:0 16px 12px">
      <div class="detail-info-row"><span class="label">Статус</span><span>${statusMap[d.status]}</span></div>
      <div class="detail-info-row"><span class="label">Тип</span><span>${typeLabel}</span></div>
      <div class="detail-info-row"><span class="label">Продавец</span><span>Не задан</span></div>
      <div class="detail-info-row"><span class="label">Покупатель</span><span style="color:var(--accent)">${uname} <span style="font-size:11px;background:#e8f4ff;padding:2px 6px;border-radius:8px">Вы</span></span></div>
      <div class="detail-info-row"><span class="label">Создана</span><span>${createdDate}</span></div>
    </div>
    <div class="detail-now-box">
      <div class="detail-now-label">СЕЙЧАС</div>
      <div class="detail-now-text">Ожидаем продавца. Поделитесь ссылкой, чтобы он присоединился к сделке.</div>
    </div>
    ${d.status !== 'cancelled' ? `
    <div style="padding:0 16px 8px">
      <button class="btn-primary btn-block" onclick="shareDeal('${d.id}')">⟳ Поделиться сделкой</button>
    </div>
    <div style="padding:0 16px 12px">
      <button class="btn-secondary btn-block" onclick="cancelDeal('${d.id}')">Отменить сделку</button>
    </div>` : ''}
    <div class="detail-payment-box">
      <div class="detail-payment-row"><span>К оплате</span><span>${d.amount} ${d.currency}</span></div>
      <div class="detail-payment-row"><span>Комиссия 1%</span><span>${commission} ${d.currency}</span></div>
      <div class="detail-payment-row"><span class="total">Всего</span><span class="total">${total} ${d.currency}</span></div>
      <div class="detail-payment-row"><span>Ваш баланс</span><span>${balance} ${d.currency}</span></div>
    </div>
    ${d.status !== 'cancelled' ? `
    <div style="padding:0 16px 16px">
      <button class="btn-primary btn-block" onclick="payFromBalance('${d.id}')">Оплатить из баланса</button>
    </div>` : ''}
  `
  document.getElementById('dealDetailContent').innerHTML = html
  document.getElementById('dealCreatedToast').style.display = 'none'
  openModal('modalDealDetail')
}

function shareDeal(id) {
  const link = `https://t.me/${tg?.initDataUnsafe?.user?.username || 'FunpaySaf_Robot'}?start=deal_${id}`
  if (tg?.switchInlineQuery) {
    try { navigator.clipboard.writeText(link) } catch {}
  }
  showToast('Ссылка скопирована!')
}

function cancelDeal(id) {
  const d = state.deals.find(x=>x.id===id)
  if (!d) return
  d.status = 'cancelled'
  state.stats.cancelled++
  state.stats.active = Math.max(0, state.stats.active - 1)
  saveState()
  renderStats()
  renderAdminPanel()
  closeModal('modalDealDetail')
  renderDeals()
  showToast('Сделка отменена')
}

function payFromBalance(id) {
  const d = state.deals.find(x=>x.id===id)
  if (!d) return
  const total = parseFloat(d.amount) * 1.01
  if ((state.balances[d.currency] || 0) < total) {
    showToast('Недостаточно средств'); return
  }
  state.balances[d.currency] -= total
  d.status = 'active'; d.step = 1
  state.stats.active++
  saveState()
  renderStats()
  renderAdminPanel()
  renderBalances()
  closeModal('modalDealDetail')
  setTimeout(() => openDealDetail(id), 100)
  showToast('Оплата прошла успешно!')
}

// ─── CREATE DEAL ───────────────────────────────────────────────────────────────
document.getElementById('btnCreateDeal').onclick = () => {
  resetDealForm()
  openModal('modalCreateDeal')
}

function resetDealForm() {
  newDeal = {}
  showDealStep('dealStep1')
  document.getElementById('dealAmountInput').value = ''
  document.getElementById('dealDescInput').value = ''
}

function showDealStep(id) {
  ['dealStep1','dealStep2','dealStep3','dealStepSecurity','dealStep4','dealStep5'].forEach(s => {
    document.getElementById(s).style.display = s===id ? '' : 'none'
  })
}

function selectDealType(type) {
  newDeal.dealType = type
  showDealStep('dealStep2')
}

function dealBack(toStep) {
  if (toStep === 1) showDealStep('dealStep1')
  else if (toStep === 2) showDealStep('dealStep2')
  else if (toStep === 3) showDealStep('dealStep3')
  else if (toStep === 4) showDealStep('dealStep4')
}

function renderCurrencyGrid() {
  const grid = document.getElementById('currencyGrid')
  grid.innerHTML = CURRENCIES.map(c => `
    <button class="cur-select-btn" onclick="selectCurrency('${c.id}')">
      <div class="cur-icon ${c.cls}">${c.symbol}</div>
      <span>${c.label}</span>
    </button>
  `).join('')
}

function selectCurrency(id) {
  newDeal.currency = id
  document.getElementById('dealAmountCurrency').textContent = id
  showDealStep('dealStep3')
}

function dealStep3Next() {
  const amt = document.getElementById('dealAmountInput').value
  if (!amt || parseFloat(amt) <= 0) { showToast('Введите корректную сумму'); return }
  newDeal.amount = amt
  startSecurityTimer()
  showDealStep('dealStepSecurity')
}

let secTimerInterval = null
function startSecurityTimer() {
  let secs = 8
  const btn = document.getElementById('btnReadSecurity')
  const timerEl = document.getElementById('secTimer')
  btn.disabled = true
  timerEl.textContent = secs
  clearInterval(secTimerInterval)
  secTimerInterval = setInterval(() => {
    secs--
    timerEl.textContent = secs
    if (secs <= 0) {
      clearInterval(secTimerInterval)
      btn.disabled = false
      btn.textContent = 'Продолжить'
    }
  }, 1000)
  btn.onclick = () => {
    if (!btn.disabled) showDealStep('dealStep4')
  }
}

function dealStep4Next() {
  const desc = document.getElementById('dealDescInput').value.trim()
  if (!desc) { showToast('Заполните описание товара'); return }
  newDeal.description = desc
  const typeLabel = newDeal.dealType === 'buy' ? 'Покупка' : 'Продажа'
  document.getElementById('confirmType').textContent = typeLabel
  document.getElementById('confirmAmount').textContent = newDeal.amount + ' ' + newDeal.currency
  document.getElementById('confirmDesc').textContent = desc
  showDealStep('dealStep5')
}

function createDeal() {
  const id = Math.random().toString(36).substr(2,6).toUpperCase()
  const deal = {
    id, dealType: newDeal.dealType, currency: newDeal.currency,
    amount: newDeal.amount, description: newDeal.description,
    status: 'pending', step: 0, createdAt: Date.now()
  }
  state.deals.push(deal)
  state.stats.active++
  saveState()
  renderStats()
  renderAdminPanel()
  renderDeals()
  closeModal('modalCreateDeal')
  // show detail with toast
  setTimeout(() => {
    openDealDetail(id)
    document.getElementById('dealCreatedToast').style.display = 'block'
  }, 200)
}

// ─── WALLETS ───────────────────────────────────────────────────────────────────
function renderWalletCurrencyTabs() {
  const container = document.getElementById('walletCurrencyTabs')
  container.innerHTML = CURRENCIES.map(c => `
    <button class="cur-tab ${c.id===walletCurrency?'active':''}" onclick="selectWalletCurrency('${c.id}')">
      <div class="cur-icon ${c.cls}" style="width:22px;height:22px;font-size:11px">${c.symbol}</div>
      ${c.label}
    </button>
  `).join('')
  document.getElementById('walletBoxLabel').textContent = walletCurrency + ' Кошелек'
  document.getElementById('btnConnectWallet').innerHTML = `<span>&#9826;</span> Подключить ${walletCurrency} кошелёк`
  document.getElementById('depositTitle').textContent = `Пополнить ${walletCurrency}`
}

function selectWalletCurrency(id) {
  walletCurrency = id
  renderWalletCurrencyTabs()
}

document.getElementById('btnConnectWallet').onclick = () => showToast('TON Connect скоро будет доступен')

function openDepositModal() {
  document.getElementById('depositAmount').value = ''
  document.getElementById('depositTitle').textContent = `Пополнить ${walletCurrency}`
  openModal('modalDeposit')
}

function doDeposit() {
  const amt = parseFloat(document.getElementById('depositAmount').value)
  if (!amt || amt < 1) { showToast('Минимум 1 ' + walletCurrency); return }
  state.balances[walletCurrency] = (state.balances[walletCurrency] || 0) + amt
  saveState()
  renderBalances()
  closeModal('modalDeposit')
  showToast('Баланс пополнен на ' + amt + ' ' + walletCurrency)
}

function openWithdrawModal() {
  document.getElementById('withdrawAvailable').textContent = (state.balances[walletCurrency] || 0).toFixed(2)
  document.getElementById('withdrawAmount').value = ''
  openModal('modalWithdraw')
}

function setWithdrawMethod(m) {
  withdrawMethod = m
  document.getElementById('wMethodTg').classList.toggle('active', m==='tg')
  document.getElementById('wMethodWallet').classList.toggle('active', m==='wallet')
  document.getElementById('withdrawMethodDesc').textContent = m==='tg'
    ? 'TON зачислится на TON-баланс получателя в Telegram.'
    : 'Вывод на внешний кошелёк.'
}

function setRecipient(mode) {
  recipientMode = mode
  document.getElementById('recSelf').classList.toggle('active', mode==='self')
  document.getElementById('recOther').classList.toggle('active', mode==='other')
  const rc = document.getElementById('recipientConfirmed')
  if (mode === 'self') {
    rc.style.display = 'block'
    rc.classList.add('show')
  } else {
    rc.style.display = 'none'
    rc.classList.remove('show')
  }
}

function doWithdraw() {
  const amt = parseFloat(document.getElementById('withdrawAmount').value)
  if (!amt || amt < 1) { showToast('Минимум 1 ' + walletCurrency); return }
  if ((state.balances[walletCurrency] || 0) < amt) { showToast('Недостаточно средств'); return }
  state.balances[walletCurrency] -= amt
  saveState()
  renderBalances()
  closeModal('modalWithdraw')
  showToast('Заявка на вывод создана!')
}

// ─── ADMIN ────────────────────────────────────────────────────────────────────
function adminAddBalance() { openModal('modalAdminBalance') }
function adminChangeTurnover() {
  document.getElementById('adminTurnoverInput').value = state.turnover
  openModal('modalAdminTurnover')
}
function adminChangeCounters() {
  document.getElementById('acSuccess').value = state.stats.success
  document.getElementById('acCompleted').value = state.stats.completed
  document.getElementById('acCancelled').value = state.stats.cancelled
  openModal('modalAdminCounters')
}

function applyAdminBalance() {
  const cur = document.getElementById('adminBalanceCurrency').value
  const amt = parseFloat(document.getElementById('adminBalanceAmount').value) || 0
  state.balances[cur] = (state.balances[cur] || 0) + amt
  saveState()
  renderBalances()
  renderAdminPanel()
  closeModal('modalAdminBalance')
  showToast('Баланс обновлён')
}

function applyAdminTurnover() {
  const val = parseFloat(document.getElementById('adminTurnoverInput').value) || 0
  state.turnover = val; saveState()
  renderStats(); renderAdminPanel()
  closeModal('modalAdminTurnover')
  showToast('Оборот обновлён')
}

function applyAdminCounters() {
  state.stats.success = parseInt(document.getElementById('acSuccess').value) || 0
  state.stats.completed = parseInt(document.getElementById('acCompleted').value) || 0
  state.stats.cancelled = parseInt(document.getElementById('acCancelled').value) || 0
  saveState(); renderStats(); renderAdminPanel()
  closeModal('modalAdminCounters')
  showToast('Счётчики обновлены')
}

// ─── COUNTDOWN ────────────────────────────────────────────────────────────────
let countdownEnd = null
function startCountdown() {
  if (!countdownEnd) {
    countdownEnd = Date.now() + (12*86400 + 15*3600 + 48*60 + 2) * 1000
    localStorage.setItem('fpotc_cd', countdownEnd)
  }
  const saved = parseInt(localStorage.getItem('fpotc_cd') || '0')
  if (saved > Date.now()) countdownEnd = saved

  setInterval(() => {
    const diff = Math.max(0, countdownEnd - Date.now())
    const d = Math.floor(diff / 86400000)
    const h = Math.floor((diff % 86400000) / 3600000)
    const m = Math.floor((diff % 3600000) / 60000)
    const s = Math.floor((diff % 60000) / 1000)
    document.getElementById('cdDays').textContent = String(d).padStart(2,'0')
    document.getElementById('cdHours').textContent = String(h).padStart(2,'0')
    document.getElementById('cdMinutes').textContent = String(m).padStart(2,'0')
    document.getElementById('cdSeconds').textContent = String(s).padStart(2,'0')
  }, 1000)
}

// ─── RATES ────────────────────────────────────────────────────────────────────
function startRateUpdater() {
  const rates = { TON: 1.67, BTC: 65345, USDT_RUB: 72.67, ETH: 1780 }
  function jitter(val, pct) { return val * (1 + (Math.random()-0.5)*pct) }
  setInterval(() => {
    document.getElementById('rateTON').textContent = '$' + jitter(rates.TON, 0.02).toFixed(2)
    document.getElementById('rateBTC').textContent = '$' + Math.round(jitter(rates.BTC, 0.01))
    document.getElementById('rateUSDT').textContent = '₽' + jitter(rates.USDT_RUB, 0.01).toFixed(2)
    document.getElementById('rateETH').textContent = '$' + Math.round(jitter(rates.ETH, 0.01))
  }, 10000)
}

// ─── MODALS ───────────────────────────────────────────────────────────────────
function openModal(id) { document.getElementById(id).style.display = 'flex' }
function closeModal(id) { document.getElementById(id).style.display = 'none' }

// Close on backdrop click
document.querySelectorAll('.modal-overlay').forEach(el => {
  el.addEventListener('click', e => {
    if (e.target === el) el.style.display = 'none'
  })
})

// ─── TOAST ────────────────────────────────────────────────────────────────────
let toastTimeout = null
function showToast(msg) {
  const t = document.getElementById('toast')
  t.textContent = msg; t.style.display = 'block'
  clearTimeout(toastTimeout)
  toastTimeout = setTimeout(() => { t.style.display = 'none' }, 2500)
}
