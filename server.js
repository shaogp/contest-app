const express = require('express');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json({ limit: '100kb' }));
app.use(express.static(path.join(__dirname, 'public'), {
  etag: false,
  lastModified: false,
  setHeaders: (res) => res.setHeader('Cache-Control', 'no-store'),
}));

// ---------- storage ----------
// cloud runtime 里 /tmp 可写，DATA_DIR 支持环境变量覆盖
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, 'data');
const DB_FILE = path.join(DATA_DIR, 'submissions.json');

if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
if (!fs.existsSync(DB_FILE)) fs.writeFileSync(DB_FILE, '[]', 'utf8');

function loadDB() {
  try {
    return JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
  } catch (e) {
    return [];
  }
}

function saveDB(list) {
  fs.writeFileSync(DB_FILE, JSON.stringify(list, null, 2), 'utf8');
}

// ---------- helpers ----------
function hashDevice(req) {
  // 组合：客户端上报的 canvas 指纹 + UA + 语言（不依赖 IP，避免代理/隧道出口 IP 变化导致同一设备识别失败）
  const fp = req.body && req.body.fingerprint ? String(req.body.fingerprint) : '';
  const ua = req.headers['user-agent'] || '';
  const lang = req.headers['accept-language'] || '';
  return crypto.createHash('sha256').update(`${fp}|${ua}|${lang}`).digest('hex');
}

// 抽奖卡片池
const CARD_POOL = [
  { type: 'health', name: '健康卡', emoji: '🍀',
    desc: '愿你天天身体倍儿棒，熬夜也不掉头发！' },
  { type: 'encourage', name: '鼓励卡', emoji: '🚀',
    desc: '代码写得飞起，比赛冲就完事了，加油！' },
  { type: 'blessing', name: '祝福卡', emoji: '✨',
    desc: '祝你在程序设计之路上一路开挂，未来可期！' },
];

// 学号前缀 → 年级 映射
const GRADE_MAP = { '2026': '大一', '2025': '大二', '2024': '大三' };
function gradeFromStudentId(sid) {
  const prefix = String(sid).slice(0, 4);
  return GRADE_MAP[prefix] || null;
}

// ---------- routes ----------

// 检查设备是否已提交
app.post('/api/check', (req, res) => {
  const deviceId = hashDevice(req);
  const db = loadDB();
  const found = db.find((r) => r.deviceId === deviceId);
  if (found) {
    return res.json({
      exists: true,
      record: {
        participate: found.participate,
        studentId: found.studentId || null,
        grade: found.grade || null,
        lotteryCard: found.lotteryCard || null,
      },
    });
  }
  res.json({ exists: false });
});

// 提交参与/不参与
app.post('/api/submit', (req, res) => {
  const { participate, studentId } = req.body || {};
  if (typeof participate !== 'boolean') {
    return res.status(400).json({ error: '参数错误' });
  }

  let grade = null;
  if (participate) {
    const sid = studentId ? String(studentId).trim() : '';
    if (!sid) {
      return res.status(400).json({ error: '请填写学号' });
    }
    if (!/^\d+$/.test(sid)) {
      return res.status(400).json({ error: '学号只能包含数字' });
    }
    grade = gradeFromStudentId(sid);
    if (!grade) {
      return res.status(400).json({ error: '学号格式不正确：大一以 2026 开头，大二以 2025 开头，大三以 2024 开头' });
    }
  }

  const deviceId = hashDevice(req);
  const db = loadDB();
  const idx = db.findIndex((r) => r.deviceId === deviceId);

  if (idx >= 0) {
    // 已存在：允许把「否」改成「是」并补全信息，反之亦然；但已抽奖记录保留
    const old = db[idx];
    if (old.lotteryCard && !participate) {
      // 已抽过奖的不允许再改成否（防刷）
      return res.status(409).json({ error: '已参与抽奖，不可更改' });
    }
    db[idx] = {
      ...old,
      participate,
      studentId: participate ? String(studentId).trim() : null,
      grade: participate ? grade : null,
      updatedAt: new Date().toISOString(),
    };
    saveDB(db);
    return res.json({
      ok: true,
      record: {
        participate: db[idx].participate,
        studentId: db[idx].studentId,
        grade: db[idx].grade,
        lotteryCard: db[idx].lotteryCard || null,
      },
    });
  }

  const record = {
    deviceId,
    participate,
    studentId: participate ? String(studentId).trim() : null,
    grade: participate ? grade : null,
    lotteryCard: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  db.push(record);
  saveDB(db);
  res.json({
    ok: true,
    record: {
      participate: record.participate,
      studentId: record.studentId,
      grade: record.grade,
      lotteryCard: record.lotteryCard,
    },
  });
});

// 抽奖（仅 participate=true 且尚未抽过奖可抽）
app.post('/api/lottery', (req, res) => {
  const deviceId = hashDevice(req);
  const db = loadDB();
  const idx = db.findIndex((r) => r.deviceId === deviceId);
  if (idx < 0) {
    return res.status(400).json({ error: '请先提交参与信息' });
  }
  const rec = db[idx];
  if (!rec.participate) {
    return res.status(403).json({ error: '未选择参与，无法抽奖' });
  }
  if (rec.lotteryCard) {
    // 已抽过：直接返回原卡片，防止重复抽奖
    return res.json({ ok: true, card: rec.lotteryCard, repeated: true });
  }
  const card = CARD_POOL[Math.floor(Math.random() * CARD_POOL.length)];
  db[idx].lotteryCard = card;
  db[idx].updatedAt = new Date().toISOString();
  saveDB(db);
  res.json({ ok: true, card, repeated: false });
});

// 统计（按年级统计参赛人数）
app.get('/api/stats', (req, res) => {
  const db = loadDB();
  const participated = db.filter((r) => r.participate);
  const byGrade = { 大一: 0, 大二: 0, 大三: 0 };
  participated.forEach((r) => { if (r.grade) byGrade[r.grade] = (byGrade[r.grade] || 0) + 1; });
  res.json({
    total: db.length,
    participate: participated.length,
    lottery: db.filter((r) => r.lotteryCard).length,
    byGrade,
  });
});

app.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
});
