// ===== ステージ2：めいの両手の「はさみうち」 =====
// game.html から使う窓口は Hands オブジェクトだけです。
//
//   Hands.start()                         攻撃のくり返しを始める（ゲーム開始時に呼ぶ）
//   Hands.stop()                          止めて、手と警告をすべて隠す
//   Hands.update(dt, W, H, px, py, pr)    毎フレーム呼ぶ。プレイヤーに当たったら true を返す
//                                         dt: 前のフレームからの秒数 / W,H: 画面の大きさ
//                                         px,py: プレイヤーの中心 / pr: プレイヤーの当たり半径
//   Hands.setGapBucketHandler(fn)         「すきま」にバケツを落とす合図を受け取る関数を登録する
//                                         fn(x, y, 警告の秒数)
//   Hands.debug()                         いまの状態を返す（動作確認用）
//
// 攻撃の流れ（1サイクル）:
//   ① feint（フェイント）  かたほうの手だけが、赤い帯の予告のあとに途中まで伸びて戻る
//   ② pinch（はさみうち）  少し間をおいて、同じ高さ付近に両手が左右から伸びて挟む
//   ※ 2回に1回は、はさんだ手の間に「すきま」があく。ただしそこへバケツが落ちてくるわな

const Hands = (() => {
  // ===== 調整用の設定 =====
  const HAND_W = 640;          // hand.svg の幅（px）
  const TIP_PAD = 18;          // 画像の右はしから、指先までの距離
  const CENTER_Y = 114;        // 画像の上から、手のひらの中心までの距離
  const BAND_HALF = 48;        // 手が通る赤い帯の「半分の高さ」（当たり判定の基準）
  const FEINT_REACH = 0.55;    // フェイントで、手が画面の何割まで伸びるか
  const GAP_HALF = 115;        // すきまの「半分の幅」
  const FIRST_DELAY = 1.5;     // ゲーム開始から最初の攻撃までの秒数

  // 各段階の長さ（秒）。warn がプレイヤーに見える予告の時間
  const T = {
    feintWarn: 1.6, feintOut: 0.30, feintHold: 0.20, feintBack: 0.40,
    pause: 0.30,
    pinchWarn: 2.0, pinchIn: 0.25, pinchHold: 0.50, pinchOut: 0.45,
    rest: 0.8
  };
  const ORDER = ['feintWarn', 'feintOut', 'feintHold', 'feintBack', 'pause',
                 'pinchWarn', 'pinchIn', 'pinchHold', 'pinchOut', 'rest'];
  const MOVING = new Set(['feintOut', 'feintHold', 'feintBack', 'pinchIn', 'pinchHold', 'pinchOut']);

  // ===== 画面に置く部品 =====
  function makeHand(side) {
    const el = document.createElement('div');
    el.className = `mei-hand ${side}`;
    const img = document.createElement('img');
    img.src = 'hand.svg';
    img.alt = '';
    el.appendChild(img);
    document.body.appendChild(el);
    return el;
  }

  function makeWarn() {
    const el = document.createElement('div');
    el.className = 'hand-warn';
    document.body.appendChild(el);
    return el;
  }

  const leftEl = makeHand('left');
  const rightEl = makeHand('right');
  const warnL = makeWarn();
  const warnR = makeWarn();

  // ===== 状態 =====
  let active = false;
  let phase = 'wait';
  let t = 0;
  let cycle = 0;
  let side = 'L';
  let y1 = 0;
  let y2 = 0;
  let gap = false;
  let gapX = 0;
  let W = 1280;
  let H = 720;
  let tipL = -30;
  let tipR = 1310;
  let gapHandler = null;

  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
  const lerp = (a, b, p) => a + (b - a) * p;
  const easeOut = (p) => 1 - Math.pow(1 - p, 3);
  const easeIn = (p) => p * p * p;

  function duration(name) {
    return name === 'wait' ? FIRST_DELAY : T[name];
  }

  function hideWarns() {
    warnL.style.display = 'none';
    warnR.style.display = 'none';
  }

  function hideHands() {
    leftEl.style.display = 'none';
    rightEl.style.display = 'none';
  }

  function showWarn(el, x, w, y, progress, arrow) {
    if (w <= 4) {
      el.style.display = 'none';
      return;
    }
    el.style.display = 'flex';
    el.style.left = x + 'px';
    el.style.width = w + 'px';
    el.style.top = (y - BAND_HALF) + 'px';
    el.style.height = (BAND_HALF * 2) + 'px';
    el.style.backgroundColor = `rgba(255, 0, 0, ${0.12 + progress * 0.5})`;
    el.style.opacity = 0.35 + progress * 0.65;
    el.style.justifyContent = (arrow === '▶▶▶') ? 'flex-end' : 'flex-start';
    if (el.textContent !== arrow) el.textContent = arrow;
  }

  // ===== 段階の切り替え =====
  function enter(name, py) {
    phase = name;
    t = 0;
    const minY = BAND_HALF + 20;
    const maxY = H - BAND_HALF - 20;

    if (name === 'feintWarn') {
      side = (Math.random() < 0.5) ? 'L' : 'R';
      y1 = clamp(py, minY, maxY);                          // プレイヤーのいる高さをねらう
    } else if (name === 'pinchWarn') {
      y2 = clamp(y1 + (Math.random() * 100 - 50), minY, maxY); // フェイントとほぼ同じ高さ
      gap = (cycle % 2 === 1);                              // 2回に1回は「すきま」のわな
      if (gap) {
        gapX = W * (0.3 + Math.random() * 0.4);
        if (gapHandler) gapHandler(gapX, y2, T.pinchWarn);
      }
    }
  }

  function advance(py) {
    if (phase === 'wait') {
      enter('feintWarn', py);
    } else if (phase === 'rest') {
      cycle++;
      enter('feintWarn', py);
    } else {
      enter(ORDER[ORDER.indexOf(phase) + 1], py);
    }
  }

  // ===== 毎フレームの処理 =====
  function step(px, py, pr) {
    const p = clamp(t / duration(phase), 0, 1);
    const retL = -30;
    const retR = W + 30;
    const reachL = W * FEINT_REACH;
    const reachR = W * (1 - FEINT_REACH);
    const tgtL = gap ? gapX - GAP_HALF : W / 2 + 6;
    const tgtR = gap ? gapX + GAP_HALF : W / 2 - 6;
    let bandY = y1;
    let warn = null;
    tipL = retL;
    tipR = retR;

    switch (phase) {
      case 'feintWarn':
        warn = 'feint';
        break;
      case 'feintOut':
        if (side === 'L') tipL = lerp(retL, reachL, easeOut(p));
        else tipR = lerp(retR, reachR, easeOut(p));
        break;
      case 'feintHold':
        if (side === 'L') tipL = reachL; else tipR = reachR;
        break;
      case 'feintBack':
        if (side === 'L') tipL = lerp(reachL, retL, easeIn(p));
        else tipR = lerp(reachR, retR, easeIn(p));
        break;
      case 'pinchWarn':
        bandY = y2;
        warn = 'pinch';
        break;
      case 'pinchIn':
        bandY = y2;
        tipL = lerp(retL, tgtL, easeOut(p));
        tipR = lerp(retR, tgtR, easeOut(p));
        break;
      case 'pinchHold':
        bandY = y2;
        tipL = tgtL;
        tipR = tgtR;
        break;
      case 'pinchOut':
        bandY = y2;
        tipL = lerp(tgtL, retL, easeIn(p));
        tipR = lerp(tgtR, retR, easeIn(p));
        break;
      default:
        break;
    }

    // 予告の赤い帯
    if (warn === 'feint') {
      if (side === 'L') {
        showWarn(warnL, 0, reachL, y1, p, '▶▶▶');
        warnR.style.display = 'none';
      } else {
        showWarn(warnR, reachR, W - reachR, y1, p, '◀◀◀');
        warnL.style.display = 'none';
      }
    } else if (warn === 'pinch') {
      showWarn(warnL, 0, tgtL, y2, p, '▶▶▶');
      showWarn(warnR, tgtR, W - tgtR, y2, p, '◀◀◀');
    } else {
      hideWarns();
    }

    // 手の位置
    leftEl.style.display = (tipL > retL + 1) ? 'block' : 'none';
    rightEl.style.display = (tipR < retR - 1) ? 'block' : 'none';
    leftEl.style.left = (tipL - (HAND_W - TIP_PAD)) + 'px';
    leftEl.style.top = (bandY - CENTER_Y) + 'px';
    rightEl.style.left = (tipR - TIP_PAD) + 'px';
    rightEl.style.top = (bandY - CENTER_Y) + 'px';

    // 当たり判定（手が動いている間だけ）
    if (MOVING.has(phase)) {
      if (Math.abs(py - bandY) < BAND_HALF + pr * 0.8) {
        if (px - pr * 0.6 < tipL) return true;
        if (px + pr * 0.6 > tipR) return true;
      }
    }
    return false;
  }

  function update(dt, w, h, px, py, pr) {
    if (!active) return false;
    W = w;
    H = h;
    t += dt;
    let guard = 0;
    while (t >= duration(phase) && guard++ < 6) {
      t -= duration(phase);
      advance(py);
    }
    return step(px, py, pr);
  }

  function start() {
    active = true;
    phase = 'wait';
    t = 0;
    cycle = 0;
    gap = false;
    hideWarns();
    hideHands();
  }

  function stop() {
    active = false;
    phase = 'wait';
    hideWarns();
    hideHands();
  }

  return {
    start,
    stop,
    update,
    setGapBucketHandler(fn) { gapHandler = fn; },
    debug() { return { active, phase, t, cycle, side, y1, y2, gap, gapX, tipL, tipR }; }
  };
})();
