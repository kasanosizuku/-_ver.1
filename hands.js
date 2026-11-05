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
// 攻撃の流れ（1サイクル）: いつも「両手」で、左右から挟む
//   ① pinchWarn  両手が画面のはしからのぞく → 指先がふるえる → ぐっと引く          ← これが合図
//   ② pinchIn    引いた両手が、一気にのびて、手を起こしながら真ん中へ
//   ③ pinchHold  ぱちっと合掌のように合わさる（スパーク + ぶるぶる）
//   ④ pinchOut   手が引いていく
//   ※ 赤い警戒表示はない。手の「予備動作」だけで知らせる
//   ※ 手の絵は mei-hand.png（手）と mei-arm.png（うでの続き）。右手は左手を反転して使う
//   ※ 2回に1回は、はさんだ手の間に「すきま」があく。ただしそこへバケツが落ちてくるわな

const Hands = (() => {
  // ===== 調整用の設定 =====
  // 手の絵（mei-hand.png）の寸法 560x960。単位は「元の絵のピクセル」で、画面には K 倍で出す
  const K = 0.32;                          // 画面に出す大きさの倍率
  const PIVOT = { x: 268, y: 830 };        // 手首（手を回す中心）
  const TIP = { x: 556, y: 12 };           // 指先（手の内がわのふち、いちばん上）
  const HEEL = { x: 548, y: 912 };         // 手のひらの付け根（内がわのふち、いちばん下）
  const PHI_REACH = -38;                   // 予備動作：手が中央がわにたおれて、つかもうとする角度（度）
  const PHI_CLAP = 0;                       // 合わさったとき：絵のとおり、手が立つ角度（度）
  const PEEK = 80;                         // 予備動作で、手が画面のはしから見える長さ（px）
  const RECOIL = 12;                       // 「ぐっと引く」ときの、指先の画面内の長さ（px）
  const SQUEEZE = 10;                      // はさむとき、ぎゅっと押しこむ長さ（px）
  const SHAKE = 9;                         // ふるえの大きさ（px）
  const GAP_HALF = 115;                    // すきまの「半分の幅」
  const FIRST_DELAY = 1.5;                 // ゲーム開始から最初の攻撃までの秒数

  // 各段階の長さ（秒）。pinchWarn は予備動作の長さ（のぞく20%・ふるえる60%・引く20%）
  const T = { pinchWarn: 1.7, pinchIn: 0.25, pinchHold: 0.60, pinchOut: 0.45, rest: 0.9 };
  const ORDER = ['pinchWarn', 'pinchIn', 'pinchHold', 'pinchOut', 'rest'];

  const rad = (d) => d * Math.PI / 180;
  // 手首を中心に phi 度だけ（反時計まわりに）起こしたときの、手首から見た点の位置
  function rot(pt, phi) {
    const c = Math.cos(rad(phi));
    const s = Math.sin(rad(phi));
    return { x: pt.x * c + pt.y * s, y: -pt.x * s + pt.y * c };
  }
  const relTip = { x: TIP.x - PIVOT.x, y: TIP.y - PIVOT.y };
  const relHeel = { x: HEEL.x - PIVOT.x, y: HEEL.y - PIVOT.y };

  // 指先を (tipX, 手の中心の高さ cy) に置くための、手首の位置と、指先・手のひらの付け根の位置
  function layout(tipX, cy, phi, k) {
    const t = rot(relTip, phi);
    const h = rot(relHeel, phi);
    const wx = tipX - k * t.x;
    const wy = cy - k * (t.y + h.y) / 2;
    return { wx, wy, tipY: wy + k * t.y, heelX: wx + k * h.x, heelY: wy + k * h.y };
  }

  // 手の部品（HTML）。side='left'|'right'。tipX は「画面の左はしから数えた指先の位置」
  // tipX は、その手の側の画面のはしから数えた指先の位置（右手なら右はしから）。W は画面（コマ）の幅
  function figureHTML(side, tipX, cy, phi, k, W) {
    const L = layout(tipX, cy, phi, k);
    const wx = (side === 'left') ? L.wx : W - L.wx;
    const tf = (side === 'left') ? `rotate(${-phi}deg)` : `scaleX(-1) rotate(${-phi}deg)`;
    return `<div class="mei-fig ${side}" style="--k:${k};left:${wx}px;top:${L.wy}px;transform:${tf}"><img src="mei-hand.png?v=2" alt=""></div>`;
  }

  // ===== 画面に置く部品 =====
  function makeHand(side) {
    const wrap = document.createElement('div');
    wrap.innerHTML = figureHTML(side, 0, 0, PHI_REACH, K, 1280);
    const el = wrap.firstChild;
    el.classList.add('mei-hand');
    el.style.display = 'none';
    document.body.appendChild(el);
    return el;
  }

  // ぱちっと合わさった瞬間の、光のスパーク
  const BURST_SVG = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="-50 -50 100 100"><g stroke="#f3a36d" stroke-width="5" stroke-linecap="round" fill="none">' +
    [0, 45, 90, 135, 180, 225, 270, 315].map((a) => `<path d="M${(22 * Math.cos(a * Math.PI / 180)).toFixed(1)} ${(22 * Math.sin(a * Math.PI / 180)).toFixed(1)} L${(42 * Math.cos(a * Math.PI / 180)).toFixed(1)} ${(42 * Math.sin(a * Math.PI / 180)).toFixed(1)}"/>`).join('') +
    '</g><circle r="14" fill="none" stroke="#fff3c9" stroke-width="5"/></svg>';
  function makeBurst() {
    const el = document.createElement('div');
    el.className = 'clap-burst';
    el.style.backgroundImage = `url("data:image/svg+xml;charset=utf-8,${encodeURIComponent(BURST_SVG)}")`;
    document.body.appendChild(el);
    return el;
  }
  const bursts = [makeBurst(), makeBurst()];
  function burstAt(i, x, y) {
    const el = bursts[i];
    el.style.left = x + 'px';
    el.style.top = y + 'px';
    el.style.animation = 'none';
    void el.offsetWidth;                       // アニメーションをやり直す
    el.style.animation = '';
    el.style.display = 'block';
  }

  const leftEl = makeHand('left');
  const rightEl = makeHand('right');

  // ===== 状態 =====
  let active = false;
  let phase = 'wait';
  let t = 0;
  let cycle = 0;
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
    bursts.forEach((b) => { b.style.display = 'none'; });
    leftEl.style.display = 'none';
    rightEl.style.display = 'none';
  }

  // ===== 段階の切り替え =====
  function enter(name, py) {
    phase = name;
    t = 0;
    if (name === 'pinchHold') {                       // ぱちっ！
      if (gap) {                                    // すきまがあるときは、両方の指先で
        burstAt(0, gapX - GAP_HALF, y2);
        burstAt(1, gapX + GAP_HALF, y2);
      } else {
        burstAt(0, W / 2, y2);
      }
    }
    const minY = 170;                      // 手の高さ（約260px）が画面からはみ出さないように
    const maxY = Math.max(minY, H - 170);

    if (name === 'pinchWarn') {
      y2 = clamp(py, minY, maxY);                           // プレイヤーのいる高さをねらう
      gap = false;                                          // 「すきま」のわなは廃止（いつも中央で手を合わせる）
    }
  }

  function advance(py) {
    if (phase === 'wait') {
      enter('pinchWarn', py);
    } else if (phase === 'rest') {
      cycle++;
      enter('pinchWarn', py);
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
    const retL = -30;                           // 手が完全にかくれている位置（指先）
    const retR = W + 30;
    const tgtL = gap ? gapX - GAP_HALF : W / 2 + 6;
    const tgtR = gap ? gapX + GAP_HALF : W / 2 - 6;
    let dy = 0;
    let phi = PHI_REACH;
    tipL = retL;
    tipR = retR;

    switch (phase) {
      case 'pinchWarn': {                       // のぞく → ふるえる → 引く
        const m = windup(p);
        dy = m.dy;
        phi = PHI_REACH + Math.sin(t * 29) * (p > 0.2 && p < 0.8 ? 7 : 0);   // 指先がわなわなふるえる
        tipL = m.vis;
        tipR = W - m.vis;
        break;
      }
      case 'pinchIn':                           // のびながら、手を起こす
        phi = lerp(PHI_REACH, PHI_CLAP, easeOut(p));
        tipL = lerp(RECOIL, tgtL, easeOut(p));
        tipR = lerp(W - RECOIL, tgtR, easeOut(p));
        break;
      case 'pinchHold': {                       // 合掌のように合わさって、ぎゅっと押す
        phi = PHI_CLAP;
        const push = SQUEEZE * easeOut(clamp(p * 3, 0, 1)) + Math.sin(t * 50) * 2;
        tipL = tgtL + push;
        tipR = tgtR - push;
        dy = Math.sin(t * 43) * 2;
        break;
      }
      case 'pinchOut':
        phi = lerp(PHI_CLAP, PHI_REACH, easeIn(p));
        tipL = lerp(tgtL, retL, easeIn(p));
        tipR = lerp(tgtR, retR, easeIn(p));
        break;
      default:
        break;
    }

    // 手を置く（左手は指先が tipL、右手は左手を反転して指先が tipR）
    const cy = y2 + dy;
    const LL = layout(tipL, cy, phi, K);
    const LR = layout(W - tipR, cy, phi, K);
    leftEl.style.display = (tipL > retL + 1) ? 'block' : 'none';
    rightEl.style.display = (tipR < retR - 1) ? 'block' : 'none';
    leftEl.style.left = LL.wx + 'px';
    leftEl.style.top = LL.wy + 'px';
    leftEl.style.transform = `rotate(${-phi}deg)`;
    rightEl.style.left = (W - LR.wx) + 'px';
    rightEl.style.top = LR.wy + 'px';
    rightEl.style.transform = `scaleX(-1) rotate(${-phi}deg)`;

    // 当たり判定：手の高さ（指先 〜 手のひらの付け根）の中で、指先より内がわに入ると当たり
    const inBand = (L) => py > Math.min(L.tipY, L.heelY) - 8 - pr * 0.6 &&
                          py < Math.max(L.tipY, L.heelY) + 24 + pr * 0.6;
    if (tipL > 0 && inBand(LL) && px - pr * 0.6 < tipL) return true;
    if (tipR < W && inBand(LR) && px + pr * 0.6 > tipR) return true;
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
    figureHTML,                         // 説明画面で手の絵を置くのに使う
    PHI_REACH,
    PHI_CLAP,
    debug() { return { active, phase, t, cycle, y2, gap, gapX, tipL, tipR }; }
  };
})();
