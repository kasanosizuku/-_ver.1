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
//   ① feint（フェイント）  かたほうの手が、画面のはしからのぞく→ふるえる→ぐっと引く→のびて戻る
//   ② pinch（はさみうち）  少し間をおいて、両手が同じようにのぞく→ふるえる→引く→左右から挟む
//   ※ 赤い警戒表示はなく、手の「予備動作（のぞく・ふるえる・引く）」が合図
//   ※ 手の絵は下の HAND_SVG に入っているので、hand.svg のファイルは不要。Hands.imageUrl で取り出せる
//   ※ 2回に1回は、はさんだ手の間に「すきま」があく。ただしそこへバケツが落ちてくるわな

const Hands = (() => {
  // ===== 調整用の設定 =====
  const HAND_W = 640;          // 手の絵の幅（px）
  const TIP_PAD = 18;          // 画像の右はしから、指先までの距離
  const CENTER_Y = 114;        // 画像の上から、手のひらの中心までの距離
  const BAND_HALF = 48;        // 手が通る道すじの「半分の高さ」（当たり判定の基準）
  const PEEK = 80;             // 予備動作で、手が画面のはしから見える長さ（px）
  const RECOIL = 12;           // 「ぐっと引く」ときの、指先の画面内の長さ（px）
  const SHAKE = 9;             // ふるえの大きさ（px）
  const FEINT_REACH = 0.55;    // フェイントで、手が画面の何割まで伸びるか
  const GAP_HALF = 115;        // すきまの「半分の幅」
  const FIRST_DELAY = 1.5;     // ゲーム開始から最初の攻撃までの秒数

  // 各段階の長さ（秒）。warn がプレイヤーに見える予告の時間
  // ※ feintWarn / pinchWarn は予備動作の長さ（のぞく20%・ふるえる60%・引く20%）
  const T = {
    feintWarn: 1.5, feintOut: 0.30, feintHold: 0.20, feintBack: 0.40,
    pause: 0.30,
    pinchWarn: 1.7, pinchIn: 0.25, pinchHold: 0.50, pinchOut: 0.45,
    rest: 0.8
  };
  const ORDER = ['feintWarn', 'feintOut', 'feintHold', 'feintBack', 'pause',
                 'pinchWarn', 'pinchIn', 'pinchHold', 'pinchOut', 'rest'];
  
  // ===== 手の絵（SVG をそのままコードに入れてある） =====
  const HAND_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="640" height="200" viewBox="0 0 640 200"><defs><linearGradient id="skin" gradientUnits="userSpaceOnUse" x1="0" y1="44" x2="0" y2="176"><stop offset="0" stop-color="#fbe0c3"/><stop offset="1" stop-color="#f0bf95"/></linearGradient><linearGradient id="thumb" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fbe0c3"/><stop offset="1" stop-color="#f3c8a0"/></linearGradient></defs><rect x="-6" y="50" width="178" height="120" fill="#8fb573" stroke="#5f8a4b" stroke-width="2"/><path d="M44 53 Q58 110 44 167 M98 53 Q112 110 98 167" fill="none" stroke="#76a05d" stroke-width="3" stroke-linecap="round"/><g fill="url(#skin)" stroke="#b07f52" stroke-width="3"><rect x="440" y="62" width="168" height="28" rx="14"/><rect x="440" y="88" width="182" height="28" rx="14"/><rect x="440" y="114" width="170" height="28" rx="14"/><rect x="440" y="140" width="144" height="26" rx="13"/></g><path d="M190 64 L340 71 C380 64 420 56 474 62 L474 166 C420 174 380 170 340 153 L190 158 Z" fill="url(#skin)"/><g fill="none" stroke="#b07f52" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M190 64 L340 71 C380 64 420 56 474 62"/><path d="M474 166 C420 174 380 170 340 153 L190 158"/></g><path d="M356 142 Q410 160 462 154" fill="none" stroke="#e0a97c" stroke-width="3" stroke-linecap="round" opacity="0.6"/><rect x="160" y="44" width="38" height="132" rx="13" fill="#fbf5e3" stroke="#8a6a43" stroke-width="3"/><rect x="400" y="65" width="96" height="30" rx="15" transform="rotate(-35 400 80)" fill="url(#thumb)" stroke="#b07f52" stroke-width="3"/><g fill="#fde8dc" stroke="#e5b79a" stroke-width="1.5"><ellipse cx="594" cy="76" rx="8" ry="6.5"/><ellipse cx="608" cy="102" rx="8" ry="6.5"/><ellipse cx="596" cy="128" rx="8" ry="6.5"/><ellipse cx="571" cy="153" rx="7" ry="6"/></g></svg>`;
  const IMAGE_URL = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(HAND_SVG);

  // ===== 画面に置く部品 =====
  function makeHand(side) {
    const el = document.createElement('div');
    el.className = `mei-hand ${side}`;
    const img = document.createElement('img');
    img.src = IMAGE_URL;
    img.alt = '';
    el.appendChild(img);
    document.body.appendChild(el);
    return el;
  }

  const leftEl = makeHand('left');
  const rightEl = makeHand('right');

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

  function hideHands() {
    leftEl.style.display = 'none';
    rightEl.style.display = 'none';
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
  // 予備動作：のぞく → ふるえる（だんだん強く）→ ぐっと引く。戻り値は「画面のはしから見えている長さ」と、ふるえ
  function windup(p) {
    if (p < 0.2) return { vis: lerp(-30, PEEK, easeOut(p / 0.2)), dx: 0, dy: 0 };
    if (p < 0.8) {
      const q = (p - 0.2) / 0.6;                  // 0 → 1
      const amp = SHAKE * (0.35 + 0.65 * q);
      const w = Math.sin(t * 38) ;
      return { vis: PEEK + w * amp, dx: 0, dy: Math.cos(t * 31) * amp * 0.5 };
    }
    return { vis: lerp(PEEK, RECOIL, easeOut((p - 0.8) / 0.2)), dx: 0, dy: 0 };
  }

  function step(px, py, pr) {
    const p = clamp(t / duration(phase), 0, 1);
    const retL = -30;
    const retR = W + 30;
    const reachL = W * FEINT_REACH;
    const reachR = W * (1 - FEINT_REACH);
    const tgtL = gap ? gapX - GAP_HALF : W / 2 + 6;
    const tgtR = gap ? gapX + GAP_HALF : W / 2 - 6;
    let bandY = y1;
    let dy = 0;
    tipL = retL;
    tipR = retR;

    switch (phase) {
      case 'feintWarn': {
        const m = windup(p);
        dy = m.dy;
        if (side === 'L') tipL = m.vis; else tipR = W - m.vis;
        break;
      }
      case 'feintOut':
        if (side === 'L') tipL = lerp(RECOIL, reachL, easeOut(p));
        else tipR = lerp(W - RECOIL, reachR, easeOut(p));
        break;
      case 'feintHold':
        if (side === 'L') tipL = reachL; else tipR = reachR;
        break;
      case 'feintBack':
        if (side === 'L') tipL = lerp(reachL, retL, easeIn(p));
        else tipR = lerp(reachR, retR, easeIn(p));
        break;
      case 'pinchWarn': {
        const m = windup(p);
        bandY = y2;
        dy = m.dy;
        tipL = m.vis;
        tipR = W - m.vis;
        break;
      }
      case 'pinchIn':
        bandY = y2;
        tipL = lerp(RECOIL, tgtL, easeOut(p));
        tipR = lerp(W - RECOIL, tgtR, easeOut(p));
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

    // 手の位置
    leftEl.style.display = (tipL > retL + 1) ? 'block' : 'none';
    rightEl.style.display = (tipR < retR - 1) ? 'block' : 'none';
    leftEl.style.left = (tipL - (HAND_W - TIP_PAD)) + 'px';
    leftEl.style.top = (bandY + dy - CENTER_Y) + 'px';
    rightEl.style.left = (tipR - TIP_PAD) + 'px';
    rightEl.style.top = (bandY + dy - CENTER_Y) + 'px';

    // 当たり判定（手が見えているあいだはいつでも）
    if (Math.abs(py - bandY) < BAND_HALF + pr * 0.8) {
      if (tipL > 0 && px - pr * 0.6 < tipL) return true;
      if (tipR < W && px + pr * 0.6 > tipR) return true;
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
    hideHands();
  }

  function stop() {
    active = false;
    phase = 'wait';
    hideHands();
  }

  return {
    start,
    stop,
    update,
    setGapBucketHandler(fn) { gapHandler = fn; },
    imageUrl: IMAGE_URL,
    debug() { return { active, phase, t, cycle, side, y1, y2, gap, gapX, tipL, tipR }; }
  };
})();
