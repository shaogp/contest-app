// ====== 简单设备指纹 ======
function getFingerprint() {
  try {
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    ctx.textBaseline = 'top';
    ctx.font = "14px 'Arial'";
    ctx.fillStyle = '#f60';
    ctx.fillRect(125, 1, 62, 20);
    ctx.fillStyle = '#069';
    ctx.fillText('fingerprint-2026-ai', 2, 15);
    ctx.fillStyle = 'rgba(102, 204, 0, 0.7)';
    ctx.fillText('fingerprint-2026-ai', 4, 17);
    const data = canvas.toDataURL();
    let hash = 0;
    for (let i = 0; i < data.length; i++) {
      hash = (hash << 5) - hash + data.charCodeAt(i);
      hash |= 0;
    }
    const extra = [
      navigator.userAgent,
      navigator.language,
      screen.width + 'x' + screen.height,
      navigator.hardwareConcurrency || 0,
      navigator.deviceMemory || 0,
    ].join('|');
    let h2 = 0;
    for (let i = 0; i < extra.length; i++) {
      h2 = (h2 << 5) - h2 + extra.charCodeAt(i);
      h2 |= 0;
    }
    return `${hash}_${h2}`;
  } catch (e) {
    return 'fp_' + Math.random().toString(36).slice(2);
  }
}

const FINGERPRINT = getFingerprint();

// 学号前缀 → 年级
const GRADE_MAP = { '2026': '大一', '2025': '大二', '2024': '大三' };
function gradeFromStudentId(sid) {
  const prefix = String(sid || '').slice(0, 4);
  return GRADE_MAP[prefix] || null;
}

// 学号脱敏：只显示前 4 位，其余用 * 隐藏
function maskStudentId(sid) {
  const s = String(sid || '');
  if (s.length <= 4) return s;
  return s.slice(0, 4) + '*'.repeat(s.length - 4);
}

// 选择「否」时随机展示的劝报名台词
const QUOTES_NOT_JOINED = [
  '有兴趣就去试嘛，老是犹豫不敢尝试，那就永远都不会成功。不会干可以学嘛！没有人会笑话你！做事情要靠手，而不是嘴。人生要一步一步走，事情要一点一滴做。机会掌握在自己手里，把握不住以后再叫苦可没人管了。',
  '自强的人，是想的如何把事情做好；而自负的人，想的是如何把自己的面子保住。',
  '幻境再美终是梦，珍惜眼前始为真。',
  '葵花点穴手谁会啊！没人天生会写代码，新生赛大胆来试！',
  '葵花点穴手谁会啊！算法武功慢慢练，26 新 AI 人集合！',
  '葵花点穴手谁会啊！没人天生就会写代码嘛，别怕基础弱，大胆报名新生赛，多上手练练就会了',
  '葵花点穴手谁会啊！哪有一来就精通算法的，别纠结会不会、怕出错，赛场就是咱们练手的地方，新 AI 人冲！',
  '葵花点穴手谁会啊！高手也是从头学起的，别被顾虑困住，来新生赛敲下你的第一行赛场代码。',
  '葵花点穴手谁会啊！武功要一招一招练，代码要一行一行写，机会摆在眼前，大胆试一试！',
  '葵花点穴手谁会啊！不用怕露怯、不用怕写不出来，同福客栈欢迎新手，程序赛场也欢迎每一位新人！',
];

// ====== 状态 ======
const state = {
  participate: null,   // true/false
  studentId: '',
  grade: null,
  lotteryCard: null,
  checked: false,
};

// ====== DOM ======
const $ = (id) => document.getElementById(id);
const stepJoin = $('step-join');
const stepForm = $('step-form');
const stepResult = $('step-result');
const btnYes = $('btn-yes');
const btnNo = $('btn-no');
const inputStudentId = $('studentId');
const gradeHint = $('grade-hint');
const btnSubmit = $('btn-submit');
const btnBack = $('btn-back');
const btnReopen = $('btn-reopen');
const btnLottery = $('btn-lottery');
const resultBanner = $('result-banner');
const lotteryArea = $('lottery-area');

// ====== API ======
async function api(url, body) {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...body, fingerprint: FINGERPRINT }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || '请求失败');
  return data;
}

// ====== UI 切换 ======
function showStep(name) {
  [stepJoin, stepForm, stepResult].forEach((s) => s.classList.add('hidden'));
  if (name === 'join') stepJoin.classList.remove('hidden');
  else if (name === 'form') stepForm.classList.remove('hidden');
  else if (name === 'result') stepResult.classList.remove('hidden');

  // 停在选择页时循环朗读首页问题，进入其他步骤即停止
  if (window.startLoopSpeech) {
    if (name === 'join') startLoopSpeech('你是否已经参赛报名？', 5000);
    else stopLoopSpeech();
  }
}

function toast(msg) {
  const t = $('toast');
  t.textContent = msg;
  t.classList.remove('hidden');
  clearTimeout(toast._t);
  toast._t = setTimeout(() => t.classList.add('hidden'), 2200);
}

// ====== 检查是否已提交 ======
async function checkExisting() {
  try {
    const res = await api('/api/check', {});
    if (res.exists) {
      const r = res.record;
      state.participate = r.participate;
      state.studentId = r.studentId || '';
      state.grade = r.grade || null;
      state.lotteryCard = r.lotteryCard || null;
    }
    // 无论是否提交过，打开页面都先显示首页问句
    showStep('join');
    state.checked = true;
  } catch (e) {
    console.error(e);
  }
}

// ====== 表单交互 ======
inputStudentId.addEventListener('input', () => {
  const val = inputStudentId.value.trim();
  // 实时检测年级并给出提示
  if (val) {
    const g = gradeFromStudentId(val);
    if (g) {
      gradeHint.innerHTML = `✅ 识别为 <b>${g}</b> 学生`;
      gradeHint.classList.add('ok');
      gradeHint.classList.remove('err');
    } else {
      gradeHint.innerHTML = '⚠️ 学号前缀需为 2026 / 2025 / 2024';
      gradeHint.classList.add('err');
      gradeHint.classList.remove('ok');
    }
  } else {
    gradeHint.innerHTML = '学号前缀对应年级：大一 <b>2026</b> · 大二 <b>2025</b> · 大三 <b>2024</b>';
    gradeHint.classList.remove('ok', 'err');
  }
  updateSubmitBtn();
});

function updateSubmitBtn() {
  const val = inputStudentId.value.trim();
  const ok = val.length > 0 && gradeFromStudentId(val);
  btnSubmit.disabled = !ok;
}

btnYes.addEventListener('click', () => {
  showStep('form');
  inputStudentId.focus();
});

btnNo.addEventListener('click', async () => {
  try {
    await api('/api/submit', { participate: false });
    state.participate = false;
    state.grade = null;
    loadStats();
    showResult();
    // 背景音乐（语音由 showResult 内的 queueSpeech 触发）
    if (window.Music) Music.start();
  } catch (e) {
    toast(e.message);
  }
});

btnBack.addEventListener('click', () => {
  showStep('join');
  // 重置表单
  inputStudentId.value = '';
  gradeHint.innerHTML = '学号前缀对应年级：大一 <b>2026</b> · 大二 <b>2025</b> · 大三 <b>2024</b>';
  gradeHint.classList.remove('ok', 'err');
  updateSubmitBtn();
});

btnSubmit.addEventListener('click', async () => {
  const studentId = inputStudentId.value.trim();
  if (!studentId) { toast('请输入学号'); return; }
  if (!gradeFromStudentId(studentId)) {
    toast('学号格式不正确：大一以 2026 开头，大二以 2025 开头，大三以 2024 开头');
    return;
  }
  btnSubmit.disabled = true;
  btnSubmit.textContent = '提交中...';
  try {
    const res = await api('/api/submit', {
      participate: true,
      studentId,
    });
    state.participate = true;
    state.studentId = res.record.studentId;
    state.grade = res.record.grade;
    state.lotteryCard = res.record.lotteryCard || null;
    loadStats();
    showResult();
    // 背景音乐（语音由 showResult 内的 queueSpeech 触发）
    if (window.Music) Music.start();
  } catch (e) {
    toast(e.message);
  } finally {
    btnSubmit.disabled = false;
    btnSubmit.textContent = '提交';
  }
});

btnReopen.addEventListener('click', () => {
  // 重新打开选择；如果已抽过奖不允许改
  if (state.lotteryCard) {
    toast('已抽过奖，不可更改');
    return;
  }
  showStep('join');
});

// ====== 结果展示 ======
let lastNoQuote = '';
let lastYesSpeech = '';

function showResult() {
  showStep('result');
  if (state.participate) {
    resultBanner.className = 'banner success';
    lastYesSpeech = '收到你的报名消息！戴上耳机，敲起代码，算法赴新，赛场碰面～';
    resultBanner.innerHTML = `✅ ${lastYesSpeech}<br/>学号：${maskStudentId(state.studentId)}`;
    if (window.queueSpeech) queueSpeech(lastYesSpeech);
    lotteryArea.style.display = '';
    if (state.lotteryCard) {
      btnLottery.disabled = true;
      btnLottery.textContent = '已抽奖';
    } else {
      btnLottery.disabled = false;
      btnLottery.textContent = '🎁 参与抽奖';
    }
  } else {
    resultBanner.className = 'banner info';
    const quote = QUOTES_NOT_JOINED[Math.floor(Math.random() * QUOTES_NOT_JOINED.length)];
    lastNoQuote = quote;
    resultBanner.innerHTML = `${quote}<br/><br/>犹豫不决不如上手冲，敢报名，你就赢了第一步。`;
    if (window.queueSpeech) queueSpeech(quote);
    lotteryArea.style.display = 'none';
  }
}

// ====== 抽奖 ======
btnLottery.addEventListener('click', async () => {
  if (!state.participate) {
    toast('请先选择"已报名"');
    return;
  }
  if (state.lotteryCard) {
    // 已抽过，直接显示
    openCard(state.lotteryCard, true);
    return;
  }
  btnLottery.disabled = true;
  btnLottery.textContent = '抽奖中...';
  try {
    const res = await api('/api/lottery', {});
    state.lotteryCard = res.card;
    openCard(res.card, res.repeated);
  } catch (e) {
    toast(e.message);
    btnLottery.disabled = false;
    btnLottery.textContent = '🎁 参与抽奖';
  }
});

// ====== 卡片弹窗 ======
const modal = $('modal');
const cardFlip = $('card-flip');

function openCard(card, repeated) {
  $('card-emoji').textContent = card.emoji;
  $('card-name').textContent = card.name;
  $('card-desc').textContent = card.desc;
  modal.classList.remove('hidden');
  cardFlip.classList.remove('flipped');
}

cardFlip.addEventListener('click', () => {
  cardFlip.classList.add('flipped');
});

$('btn-close-modal').addEventListener('click', (e) => {
  e.stopPropagation();
  modal.classList.add('hidden');
  if (state.participate && state.lotteryCard) {
    btnLottery.disabled = true;
    btnLottery.textContent = '已抽奖';
  }
});

modal.querySelector('.modal-mask').addEventListener('click', () => {
  modal.classList.add('hidden');
});

// ====== 统计加载 ======
async function loadStats() {
  try {
    const res = await fetch('/api/stats');
    const d = await res.json();
    $('stat-participate').textContent = d.participate || 0;
    $('stat-total').textContent = d.total || 0;
    $('stat-lottery').textContent = d.lottery || 0;
  } catch (e) {
    // 忽略统计加载失败
  }
}

// ====== 启动 ======
checkExisting();
loadStats();
setInterval(loadStats, 10000); // 每 10 秒刷新一次

// 提交/抽奖成功后立刻刷新统计
const origApi = api;
// submit 后刷新：直接在现有 btnSubmit/btnNo 逻辑里调 loadStats 即可
