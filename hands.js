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
//   ① feint（フェイント）  両手が、画面のはしからのぞく→ふるえる→ぐっと引く→かたほうだけがのびて戻る（もう片方は引っこむ）
//   ② pinch（はさみうち）  少し間をおいて、両手が同じようにのぞく→ふるえる→引く→左右から挟む
//   ※ 赤い警戒表示はなく、手の「予備動作（のぞく・ふるえる・引く）」が合図
//   ※ 手の絵は下の HAND_GRAB・HAND_FLAT に入っているので、hand.svg のファイルは不要。Hands.imageUrl で取り出せる
//   ※ 2回に1回は、はさんだ手の間に「すきま」があく。ただしそこへバケツが落ちてくるわな

const Hands = (() => {
  // ===== 調整用の設定 =====
  const HAND_W = 1200;          // 手の絵の幅（px）
  const TIP_PAD = 18;          // 画像の右はしから、指先までの距離
  const CENTER_Y = 114;        // 画像の上から、手のひらの中心までの距離
  const BAND_HALF = 48;        // 手が通る道すじの「半分の高さ」（当たり判定の基準）
  const PEEK = 80;             // 予備動作で、手が画面のはしから見える長さ（px）
  const RECOIL = 12;           // 「ぐっと引く」ときの、指先の画面内の長さ（px）
  const SQUEEZE = 10;          // はさむとき、ぎゅっと押しこむ長さ（px）
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
  // grab = ものをつかもうとする、指を広げて少し曲げた手（予備動作・フェイント用）
  // flat = 指をそろえてのばした手（ぱちっと合わせるとき用）。どちらも「手の甲」側を見せている
  const HAND_GRAB = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="200" viewBox="0 0 1200 200"><defs><filter id="blur" x="-30%" y="-30%" width="160%" height="160%"><feGaussianBlur stdDeviation="6"/></filter><filter id="wob" filterUnits="userSpaceOnUse" x="-700" y="-30" width="1500" height="260"><feTurbulence type="fractalNoise" baseFrequency="0.05" numOctaves="2" seed="4" result="n"/><feDisplacementMap in="SourceGraphic" in2="n" scale="2.4"/></filter><filter id="grain" x="0" y="0" width="100%" height="100%"><feTurbulence type="fractalNoise" baseFrequency="0.85" numOctaves="2" seed="7"/><feColorMatrix values="0 0 0 0 0.55  0 0 0 0 0.35  0 0 0 0 0.3  0 0 0 -2.2 1.25"/></filter><g id="sil" fill="#fff" stroke="#fff"><g stroke-linecap="round" stroke-linejoin="round" fill="none"><path d="M460.6 68.0 L533.0 48.6 L593.6 66.0" stroke-width="25"/><path d="M464.6 96.0 L545.3 88.9 L610.0 110.0" stroke-width="26"/><path d="M462.6 124.0 L537.3 130.5 L598.4 115.3" stroke-width="25"/><path d="M454.6 150.0 L512.6 165.5 L554.8 148.4" stroke-width="22"/><path d="M376.6 70.0 L414.9 37.9 L454.5 32.3" stroke-width="28"/></g><path d="M-600 52 L150 50 C240 48 300 54 340 60 C400 52 450 54 482 70 L486 168 C450 178 400 176 340 170 C300 174 240 172 150 172 L-6 170 Z" transform="translate(-1.4 0)" stroke="none"/></g><mask id="m"><use href="#sil"/></mask></defs><g transform="translate(560 0)"><g filter="url(#wob)" fill="none" stroke="#7a625a" stroke-linecap="round" stroke-linejoin="round"><path d="M460.6 68.0 L533.0 48.6 L593.6 66.0" stroke-width="28.4"/><path d="M464.6 96.0 L545.3 88.9 L610.0 110.0" stroke-width="29.4"/><path d="M462.6 124.0 L537.3 130.5 L598.4 115.3" stroke-width="28.4"/><path d="M454.6 150.0 L512.6 165.5 L554.8 148.4" stroke-width="25.4"/><path d="M376.6 70.0 L414.9 37.9 L454.5 32.3" stroke-width="31.4"/><path d="M-600 52 L150 50 C240 48 300 54 340 60 C400 52 450 54 482 70 L486 168 C450 178 400 176 340 170 C300 174 240 172 150 172 L-6 170 Z" transform="translate(-1.4 0)" fill="#7a625a" stroke="#7a625a" stroke-width="3.4"/></g><g fill="none" stroke="#fce1c6" stroke-linecap="round" stroke-linejoin="round"><path d="M460.6 68.0 L533.0 48.6 L593.6 66.0" stroke-width="25"/><path d="M464.6 96.0 L545.3 88.9 L610.0 110.0" stroke-width="26"/><path d="M462.6 124.0 L537.3 130.5 L598.4 115.3" stroke-width="25"/><path d="M454.6 150.0 L512.6 165.5 L554.8 148.4" stroke-width="22"/><path d="M376.6 70.0 L414.9 37.9 L454.5 32.3" stroke-width="28"/></g><path d="M-600 52 L150 50 C240 48 300 54 340 60 C400 52 450 54 482 70 L486 168 C450 178 400 176 340 170 C300 174 240 172 150 172 L-6 170 Z" transform="translate(-1.4 0)" fill="#fce1c6"/><g mask="url(#m)"><g filter="url(#blur)"><ellipse cx="130" cy="80" rx="150" ry="15" fill="#f8b19d" opacity=".55"/><ellipse cx="260" cy="156" rx="100" ry="16" fill="#ebbba5" opacity=".7"/><ellipse cx="409" cy="150" rx="70" ry="18" fill="#f8b19d" opacity=".6"/><ellipse cx="409" cy="80" rx="60" ry="14" fill="#ebbba5" opacity=".45"/><ellipse cx="559" cy="114" rx="70" ry="50" fill="#f8b19d" opacity=".22"/></g><rect x="-560" width="1200" height="200" filter="url(#grain)" opacity=".45"/></g><g fill="none" stroke="#b78d7b" stroke-width="1.6" stroke-linecap="round" opacity=".85"><path d="M530.0 41.6 q3 7.0 0 14.0" /><path d="M542.3 81.7 q3 7.3 0 14.6" /><path d="M534.3 123.5 q3 7.0 0 14.0" /><path d="M509.6 159.4 q3 6.2 0 12.3" /><path d="M371 92 q30 -10 62 -2 M371 124 q30 -8 62 0 M371 152 q28 6 58 0" opacity=".6"/></g><rect x="576.6" y="58.0" width="17" height="16" rx="7" transform="rotate(16.0 593.6 66.0)" fill="#fff1e6" stroke="#d9b7a6" stroke-width="1.2"/><rect x="593.0" y="102.0" width="17" height="16" rx="7" transform="rotate(18.0 610.0 110.0)" fill="#fff1e6" stroke="#d9b7a6" stroke-width="1.2"/><rect x="581.4" y="107.3" width="17" height="16" rx="7" transform="rotate(-14.0 598.4 115.3)" fill="#fff1e6" stroke="#d9b7a6" stroke-width="1.2"/><rect x="537.8" y="140.4" width="17" height="16" rx="7" transform="rotate(-22.0 554.8 148.4)" fill="#fff1e6" stroke="#d9b7a6" stroke-width="1.2"/><rect x="439.5" y="24.3" width="15" height="16" rx="7" transform="rotate(-8.0 454.5 32.3)" fill="#fff1e6" stroke="#d9b7a6" stroke-width="1.2"/></g></svg>`;
  const HAND_FLAT = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="200" viewBox="0 0 1200 200"><defs><filter id="blur" x="-30%" y="-30%" width="160%" height="160%"><feGaussianBlur stdDeviation="6"/></filter><filter id="wob" filterUnits="userSpaceOnUse" x="-700" y="-30" width="1500" height="260"><feTurbulence type="fractalNoise" baseFrequency="0.05" numOctaves="2" seed="4" result="n"/><feDisplacementMap in="SourceGraphic" in2="n" scale="2.4"/></filter><filter id="grain" x="0" y="0" width="100%" height="100%"><feTurbulence type="fractalNoise" baseFrequency="0.85" numOctaves="2" seed="7"/><feColorMatrix values="0 0 0 0 0.55  0 0 0 0 0.35  0 0 0 0 0.3  0 0 0 -2.2 1.25"/></filter><g id="sil" fill="#fff" stroke="#fff"><g stroke-linecap="round" stroke-linejoin="round" fill="none"><path d="M444.0 68.0 L519.0 66.0 L594.0 64.7" stroke-width="25"/><path d="M448.0 96.0 L529.0 96.0 L610.0 96.0" stroke-width="26"/><path d="M446.0 124.0 L521.0 125.3 L596.0 127.3" stroke-width="25"/><path d="M438.0 150.0 L497.9 153.1 L557.8 157.3" stroke-width="22"/><path d="M364.0 68.0 L410.7 45.2 L452.1 37.9" stroke-width="28"/></g><path d="M-600 52 L150 50 C240 48 300 54 340 60 C400 52 450 54 482 70 L486 168 C450 178 400 176 340 170 C300 174 240 172 150 172 L-6 170 Z" transform="translate(-18.0 0)" stroke="none"/></g><mask id="m"><use href="#sil"/></mask></defs><g transform="translate(560 0)"><g filter="url(#wob)" fill="none" stroke="#7a625a" stroke-linecap="round" stroke-linejoin="round"><path d="M444.0 68.0 L519.0 66.0 L594.0 64.7" stroke-width="28.4"/><path d="M448.0 96.0 L529.0 96.0 L610.0 96.0" stroke-width="29.4"/><path d="M446.0 124.0 L521.0 125.3 L596.0 127.3" stroke-width="28.4"/><path d="M438.0 150.0 L497.9 153.1 L557.8 157.3" stroke-width="25.4"/><path d="M364.0 68.0 L410.7 45.2 L452.1 37.9" stroke-width="31.4"/><path d="M-600 52 L150 50 C240 48 300 54 340 60 C400 52 450 54 482 70 L486 168 C450 178 400 176 340 170 C300 174 240 172 150 172 L-6 170 Z" transform="translate(-18.0 0)" fill="#7a625a" stroke="#7a625a" stroke-width="3.4"/></g><g fill="none" stroke="#fce1c6" stroke-linecap="round" stroke-linejoin="round"><path d="M444.0 68.0 L519.0 66.0 L594.0 64.7" stroke-width="25"/><path d="M448.0 96.0 L529.0 96.0 L610.0 96.0" stroke-width="26"/><path d="M446.0 124.0 L521.0 125.3 L596.0 127.3" stroke-width="25"/><path d="M438.0 150.0 L497.9 153.1 L557.8 157.3" stroke-width="22"/><path d="M364.0 68.0 L410.7 45.2 L452.1 37.9" stroke-width="28"/></g><path d="M-600 52 L150 50 C240 48 300 54 340 60 C400 52 450 54 482 70 L486 168 C450 178 400 176 340 170 C300 174 240 172 150 172 L-6 170 Z" transform="translate(-18.0 0)" fill="#fce1c6"/><g mask="url(#m)"><g filter="url(#blur)"><ellipse cx="130" cy="80" rx="150" ry="15" fill="#f8b19d" opacity=".55"/><ellipse cx="260" cy="156" rx="100" ry="16" fill="#ebbba5" opacity=".7"/><ellipse cx="392" cy="150" rx="70" ry="18" fill="#f8b19d" opacity=".6"/><ellipse cx="392" cy="80" rx="60" ry="14" fill="#ebbba5" opacity=".45"/><ellipse cx="542" cy="114" rx="70" ry="50" fill="#f8b19d" opacity=".22"/></g><rect x="-560" width="1200" height="200" filter="url(#grain)" opacity=".45"/></g><g fill="none" stroke="#b78d7b" stroke-width="1.6" stroke-linecap="round" opacity=".85"><path d="M516.0 59.0 q3 7.0 0 14.0" /><path d="M526.0 88.7 q3 7.3 0 14.6" /><path d="M518.0 118.3 q3 7.0 0 14.0" /><path d="M494.9 147.0 q3 6.2 0 12.3" /><path d="M354 92 q30 -10 62 -2 M354 124 q30 -8 62 0 M354 152 q28 6 58 0" opacity=".6"/></g><rect x="577.0" y="56.7" width="17" height="16" rx="7" transform="rotate(-1.0 594.0 64.7)" fill="#fff1e6" stroke="#d9b7a6" stroke-width="1.2"/><rect x="593.0" y="88.0" width="17" height="16" rx="7" transform="rotate(0.0 610.0 96.0)" fill="#fff1e6" stroke="#d9b7a6" stroke-width="1.2"/><rect x="579.0" y="119.3" width="17" height="16" rx="7" transform="rotate(1.5 596.0 127.3)" fill="#fff1e6" stroke="#d9b7a6" stroke-width="1.2"/><rect x="540.8" y="149.3" width="17" height="16" rx="7" transform="rotate(4.0 557.8 157.3)" fill="#fff1e6" stroke="#d9b7a6" stroke-width="1.2"/><rect x="437.1" y="29.9" width="15" height="16" rx="7" transform="rotate(-10.0 452.1 37.9)" fill="#fff1e6" stroke="#d9b7a6" stroke-width="1.2"/></g></svg>`;
  const toUrl = (svg) => 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
  const IMAGE_URL = toUrl(HAND_GRAB);
  const IMAGE_URL_FLAT = toUrl(HAND_FLAT);
  // 練習の説明画面用：小さく縮めて使うので、ざらざらの紙の質感とゆらぎは外した版
  const small = (svg) => svg.replace(/<rect[^>]*filter="url\(#grain\)"[^>]*\/>/, '').replace(' filter="url(#wob)"', '');
  const IMAGE_URL_SMALL = toUrl(small(HAND_GRAB));

  // ===== 画面に置く部品 =====
  function makeHand(side) {
    const el = document.createElement('div');
    el.className = `mei-hand ${side}`;
    ['grab', 'flat'].forEach((pose) => {
      const img = document.createElement('img');
      img.src = (pose === 'grab') ? IMAGE_URL : IMAGE_URL_FLAT;
      img.alt = '';
      img.className = pose;
      el.appendChild(img);
    });
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
        tipL = m.vis;                    // 両手がのぞいてふるえる（どちらが来るかは、まだ分からない）
        tipR = W - m.vis;
        break;
      }
      case 'feintOut':
        if (side === 'L') {
          tipL = lerp(RECOIL, reachL, easeOut(p));
          tipR = lerp(W - RECOIL, retR, p);        // もう片方は、すっと引っこむ
        } else {
          tipR = lerp(W - RECOIL, reachR, easeOut(p));
          tipL = lerp(RECOIL, retL, p);
        }
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
      case 'pinchHold': {                // ぎゅっとつぶす：すこし押しこんで、ぶるぶるふるえる
        bandY = y2;
        const push = SQUEEZE * easeOut(clamp(p * 3, 0, 1)) + Math.sin(t * 50) * 2;
        tipL = tgtL + push;
        tipR = tgtR - push;
        dy = Math.sin(t * 43) * 2;
        break;
      }
      case 'pinchOut':
        bandY = y2;
        tipL = lerp(tgtL, retL, easeIn(p));
        tipR = lerp(tgtR, retR, easeIn(p));
        break;
      default:
        break;
    }

    // 手のポーズ：予備動作・フェイントは「つかむ手」、はさみうちの本番は「そろえた手」
    const flat = (phase === 'pinchIn' || phase === 'pinchHold' || phase === 'pinchOut');
    [leftEl, rightEl].forEach((el) => el.classList.toggle('flat', flat));

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
    imageUrl: IMAGE_URL_SMALL,          // 説明画面用（小さい絵）
    imageUrlFlat: IMAGE_URL_FLAT,
    debug() { return { active, phase, t, cycle, side, y1, y2, gap, gapX, tipL, tipR }; }
  };
})();
