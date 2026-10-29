/* 背景音乐 + 语音朗读
 * - 音乐：Web Audio 程序化生成，10 首不同风格，随机顺序自动播放
 * - 语音：系统 TTS，中文女声近似
 */
(function () {
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return;

  /* ------------------ 12 首曲目（赛博朋克优先开场） ------------------ */
  const TRACKS = [
    { name: 'Cyberpunk · 霓虹雨夜', bpm: 120, root: 220.0, wave: 'sawtooth', filter: 2600, cp: true,
      chords: [[0, 3, 7, 10], [0, 3, 7, 14], [-5, -1, 3, 7], [0, 4, 7, 11]], pad: 0.04, mel: 0.026, hat: 0.055 },
    { name: 'Cyberpunk · 赛博街区', bpm: 132, root: 246.94, wave: 'sawtooth', filter: 3000, cp: true,
      chords: [[0, 3, 7, 10], [0, 5, 7, 12], [-3, 0, 4, 8], [0, 2, 7, 9]], pad: 0.038, mel: 0.025, hat: 0.06 },
    { name: 'Lo-fi Hip Hop · 咖啡与编译', bpm: 74, root: 196.0, wave: 'triangle', filter: 900, lofi: true, drum: true,
      chords: [[0, 3, 7, 10], [0, 4, 7, 11], [-3, 0, 3, 7], [-5, -1, 2, 6]], pad: 0.05, mel: 0.032, hat: 0.05 },
    { name: 'Lo-fi Hip Hop · 雨夜 Debug', bpm: 66, root: 174.61, wave: 'triangle', filter: 800, lofi: true, drum: true,
      chords: [[0, 4, 7, 11], [0, 3, 7, 10], [2, 5, 9, 12], [-2, 2, 5, 9]], pad: 0.05, mel: 0.03, hat: 0.04 },
    { name: 'Synthwave · 霓虹赛道', bpm: 104, root: 220.0, wave: 'sawtooth', filter: 1800,
      chords: [[0, 4, 7], [0, 3, 7], [-5, -1, 2], [0, 5, 7]], pad: 0.045, mel: 0.028, hat: 0.055 },
    { name: 'Synthwave · 复古终端', bpm: 116, root: 246.94, wave: 'sawtooth', filter: 2200,
      chords: [[0, 4, 7, 11], [0, 3, 7, 10], [0, 5, 7, 12], [0, 3, 8, 10]], pad: 0.045, mel: 0.028, hat: 0.05 },
    { name: 'Game OST · 像素冒险', bpm: 126, root: 261.63, wave: 'square', filter: 1600,
      chords: [[0, 4, 7], [0, 3, 7], [-3, 0, 4], [-5, -1, 3]], pad: 0.035, mel: 0.026, hat: 0.06 },
    { name: 'Game OST · 关卡开启', bpm: 132, root: 293.66, wave: 'triangle', filter: 1500,
      chords: [[0, 5, 7], [0, 4, 7], [0, 3, 7], [0, 2, 7]], pad: 0.04, mel: 0.028, hat: 0.055 },
    { name: 'City Pop · 轻快和弦', bpm: 92, root: 233.08, wave: 'sine', filter: 1400,
      chords: [[0, 4, 7, 11], [0, 3, 7, 10], [0, 4, 7, 9], [-3, 0, 4, 7]], pad: 0.05, mel: 0.03, hat: 0.04 },
    { name: 'City Pop · 午后胶片', bpm: 98, root: 207.65, wave: 'triangle', filter: 1300,
      chords: [[0, 4, 7, 11], [0, 4, 9, 11], [-4, 0, 3, 7], [0, 3, 7, 10]], pad: 0.05, mel: 0.03, hat: 0.04 },
    { name: 'Ambient · 深夜自习', bpm: 58, root: 164.81, wave: 'sine', filter: 700,
      chords: [[0, 4, 7, 11], [0, 2, 7, 9], [-3, 0, 4, 7], [0, 3, 7, 10]], pad: 0.055, mel: 0.026, hat: 0 },
    { name: 'Chiptune · 通宵冲刺', bpm: 142, root: 329.63, wave: 'square', filter: 2400,
      chords: [[0, 4, 7], [0, 3, 7], [0, 5, 7], [-2, 2, 7]], pad: 0.032, mel: 0.024, hat: 0.06 },
  ];

  let ctx = null, master = null, toneFilter = null, noiseBuf = null;
  let playing = false, trackIdx = -1, bar = 0, barStart = 0, timer = null;
  let order = [], orderPos = 0;
  const BARS_PER_TRACK = 8;

  function shuffle(a) {
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  function init() {
    if (ctx) return;
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = 0.28;
    toneFilter = ctx.createBiquadFilter();
    toneFilter.type = 'lowpass';
    toneFilter.frequency.value = 1200;
    master.connect(toneFilter);
    toneFilter.connect(ctx.destination);

    const sr = ctx.sampleRate;
    const len = Math.floor(sr * 0.4);
    noiseBuf = ctx.createBuffer(1, len, sr);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;

    order = buildOrder();
    orderPos = 0;
  }

  // Lo-fi 曲目优先开场并高频循环：每 2 首 Lo-fi 穿插 1 首其他风格
  function buildOrder() {
    const idx = TRACKS.map((_, i) => i);
    const pri = shuffle(idx.filter((i) => TRACKS[i].lofi));
    const rest = shuffle(idx.filter((i) => !TRACKS[i].lofi));
    const out = [];
    let r = 0;
    for (let k = 0; r < rest.length; k++) {
      out.push(pri[k % pri.length]);
      if (k % 2 === 1) out.push(rest[r++]);
    }
    return out;
  }

  const toFreq = (root, semi) => root * Math.pow(2, semi / 12);

  function tone(start, dur, f, type, gain) {
    const o = ctx.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(f, start);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, start);
    g.gain.linearRampToValueAtTime(gain, start + Math.min(0.09, dur * 0.35));
    g.gain.exponentialRampToValueAtTime(0.0001, start + dur);
    o.connect(g);
    g.connect(master);
    o.start(start);
    o.stop(start + dur + 0.02);
  }

  function hat(start, gain) {
    if (!noiseBuf) return;
    const s = ctx.createBufferSource();
    s.buffer = noiseBuf;
    const hp = ctx.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = 2400;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, start);
    g.gain.linearRampToValueAtTime(gain, start + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, start + 0.11);
    s.connect(hp);
    hp.connect(g);
    g.connect(master);
    s.start(start);
    s.stop(start + 0.14);
  }

  // 轻柔底鼓
  function kick(start, gain) {
    const o = ctx.createOscillator();
    o.type = 'sine';
    o.frequency.setValueAtTime(110, start);
    o.frequency.exponentialRampToValueAtTime(45, start + 0.16);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, start);
    g.gain.linearRampToValueAtTime(gain, start + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, start + 0.22);
    o.connect(g);
    g.connect(master);
    o.start(start);
    o.stop(start + 0.25);
  }

  // 轻柔军鼓（滤波后的噪音）
  function snare(start, gain) {
    if (!noiseBuf) return;
    const s = ctx.createBufferSource();
    s.buffer = noiseBuf;
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = 1400;
    bp.Q.value = 0.8;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, start);
    g.gain.linearRampToValueAtTime(gain, start + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, start + 0.13);
    s.connect(bp);
    bp.connect(g);
    g.connect(master);
    s.start(start);
    s.stop(start + 0.16);
  }

  function nextTrack() {
    if (orderPos >= order.length) {
      order = buildOrder();
      orderPos = 0;
    }
    trackIdx = order[orderPos++];
    const t = TRACKS[trackIdx];
    if (toneFilter) toneFilter.frequency.setTargetAtTime(t.filter, ctx.currentTime, 0.2);
    const el = document.getElementById('music-name');
    if (el) el.textContent = t.name;
  }

  function scheduleBar() {
    if (trackIdx < 0) nextTrack();
    const t = TRACKS[trackIdx];
    const beat = 60 / t.bpm;
    const barLen = beat * 4;
    const chord = t.chords[bar % t.chords.length];

    // 和弦铺底
    chord.forEach((semi) => {
      tone(barStart, barLen * 0.92, toFreq(t.root, semi), t.wave, t.pad);
    });

    // 低音
    tone(barStart, beat * 0.5, toFreq(t.root, chord[0] - 12), 'sine', 0.16);
    tone(barStart + beat * 2, beat * 0.5, toFreq(t.root, chord[0] - 12), 'sine', 0.14);

    // 旋律
    for (let i = 0; i < 4; i++) {
      if (Math.random() < 0.72) {
        const semi = chord[(i + bar) % chord.length] + 12;
        tone(barStart + i * beat, beat * 0.72, toFreq(t.root, semi), t.wave, t.mel);
      }
    }

    // 打击
    if (t.hat > 0) {
      for (let i = 0; i < 4; i++) {
        hat(barStart + i * beat, t.hat);
        if (Math.random() < 0.5) hat(barStart + (i + 0.5) * beat, t.hat * 0.7);
      }
    }

    // Lo-fi 的淡淡鼓点：底鼓 + 军鼓，音量很轻
    if (t.drum) {
      kick(barStart, 0.05);
      kick(barStart + beat * 2, 0.045);
      snare(barStart + beat * 1, 0.030);
      snare(barStart + beat * 3, 0.030);
    }

    barStart += barLen;
    bar++;
    if (bar % BARS_PER_TRACK === 0) nextTrack();
  }

  function loop() {
    if (!playing || !ctx) return;
    while (barStart < ctx.currentTime + 0.7) scheduleBar();
  }

  function start() {
    init();
    if (ctx.state === 'suspended') ctx.resume();
    if (playing) return;
    playing = true;
    bar = 0;
    barStart = ctx.currentTime + 0.08;
    nextTrack();
    clearInterval(timer);
    timer = setInterval(loop, 120);
    updateUI();
  }

  function pause() {
    playing = false;
    clearInterval(timer);
    timer = null;
    if (ctx) {
      // 立即静音，避免已排程的音继续响
      master.gain.setTargetAtTime(0, ctx.currentTime, 0.05);
      setTimeout(() => {
        if (ctx && master && !playing) master.gain.setTargetAtTime(0.28, ctx.currentTime, 0.2);
      }, 400);
    }
    updateUI();
  }

  function toggle() {
    if (playing) pause(); else start();
  }

  function updateUI() {
    const bar = document.getElementById('music-bar');
    const btn = document.getElementById('music-toggle');
    if (bar) bar.classList.remove('hidden');
    if (btn) btn.textContent = playing ? '暂停' : '播放';
  }

  // 首次用户交互后自动开始播放
  let armed = false;
  function arm() {
    if (armed) return;
    armed = true;
    const go = () => {
      start();
      document.removeEventListener('pointerdown', go, true);
      document.removeEventListener('keydown', go, true);
    };
    document.addEventListener('pointerdown', go, true);
    document.addEventListener('keydown', go, true);
  }

  window.Music = { start, pause, toggle, arm, isPlaying: () => playing };

  document.addEventListener('DOMContentLoaded', () => {
    const btn = document.getElementById('music-toggle');
    if (btn) btn.addEventListener('click', (e) => { e.stopPropagation(); toggle(); });
    arm();
  });

  /* ------------------ 语音朗读 ------------------ */
  let voicesReady = false;
  let zhVoices = [];

  function pickVoice() {
    const all = window.speechSynthesis ? speechSynthesis.getVoices() : [];
    zhVoices = all.filter((v) => /zh|cmn|Chinese/i.test(v.lang + ' ' + v.name));
    voicesReady = zhVoices.length > 0;
    return zhVoices;
  }

  if (window.speechSynthesis) {
    pickVoice();
    speechSynthesis.addEventListener('voiceschanged', pickVoice);
  }

  // 优先中文女声，语调略高、语速稍慢，近似佟湘玉的口吻
  function speak(text) {
    if (!window.speechSynthesis || !text) return;
    try {
      // iOS 上 cancel 紧跟 speak 容易丢朗读，仅在确实有播放时才取消
      if (speechSynthesis.speaking || speechSynthesis.pending) speechSynthesis.cancel();
      if (!voicesReady) pickVoice();
      const u = new SpeechSynthesisUtterance(text);
      u.lang = 'zh-CN';
      u.rate = 0.94;
      u.pitch = 1.32;
      u.volume = 1;
      const female = zhVoices.find((v) =>
        /Xiaoxiao|Xiaoyi|Huihui|Yaoyao|Tingting|Meijia|Sinji|female|女/i.test(v.name)
      );
      if (female) u.voice = female;
      else if (zhVoices[0]) u.voice = zhVoices[0];
      // 真正开始朗读后才清除待播文案；被浏览器拦截时要保留以便补播
      u.onstart = () => { pendingSpeech = ''; };
      speechSynthesis.speak(u);
    } catch (e) { /* 忽略 */ }
  }

  window.speakQuote = speak;

  // 页面加载即要朗读的文案：浏览器通常禁止无手势发声，
  // 先尝试一次，失败则在用户首次点击/触摸时补播。
  let pendingSpeech = '';
  let retryArmed = false;

  function armRetry() {
    if (retryArmed) return;
    retryArmed = true;
    const retry = () => {
      document.removeEventListener('pointerdown', retry, true);
      document.removeEventListener('touchstart', retry, true);
      document.removeEventListener('keydown', retry, true);
      retryArmed = false;
      const busy = speechSynthesis.speaking || speechSynthesis.pending;
      if (!busy && pendingSpeech) speak(pendingSpeech);
    };
    document.addEventListener('pointerdown', retry, true);
    document.addEventListener('touchstart', retry, true);
    document.addEventListener('keydown', retry, true);
  }

  function queueSpeech(text) {
    pendingSpeech = text || '';
    const want = pendingSpeech;
    if (!want) return;
    speak(want);
    // 若浏览器拦截了无手势发声，则在用户首次点击/触摸时补播
    setTimeout(() => {
      if (pendingSpeech !== want) return; // 已被新的朗读替换
      const busy = window.speechSynthesis && (speechSynthesis.speaking || speechSynthesis.pending);
      if (!busy) armRetry();
    }, 600);
  }

  window.queueSpeech = queueSpeech;

  // 循环朗读（如首页问题）：每隔 ms 毫秒重复一次，离开该步骤时停止
  let loopTimer = null;
  let loopText = '';
  function startLoopSpeech(text, ms) {
    loopText = text || '';
    if (!loopText || loopTimer) return;
    const tick = () => {
      if (!loopText) return;
      try {
        if (speechSynthesis.speaking || speechSynthesis.pending) return;
        pendingSpeech = loopText;
        speak(loopText);
        // 手机端（iOS/安卓）常拦截无手势发声：没播出来就挂起补播，等用户点一下
        setTimeout(() => {
          if (!loopText) return;
          if (!(speechSynthesis.speaking || speechSynthesis.pending)) armRetry();
        }, 700);
      } catch (e) { /* 忽略 */ }
    };
    tick();
    loopTimer = setInterval(tick, ms || 6000);
  }
  function stopLoopSpeech() {
    loopText = '';
    if (loopTimer) { clearInterval(loopTimer); loopTimer = null; }
  }
  window.startLoopSpeech = startLoopSpeech;
  window.stopLoopSpeech = stopLoopSpeech;
})();
