// ===== 練習モードの説明（イラスト付きチュートリアル） =====
// game.html から使う窓口は Tutorial オブジェクトだけです。
//
//   Tutorial.show({ stage, boostSec, interval, onDone, onBack })
//       stage:    選んだステージ番号（2 のときは「めいの手」の説明ページも出る）
//       boostSec: ブーストが続く秒数（説明文に使う）
//       interval: こんぺいとうが出る間隔の秒数（説明文に使う）
//       onDone:   「はじめる」または「スキップ」が押されたときに呼ぶ
//       onBack:   「もどる」が押されたときに呼ぶ
//   Tutorial.hide()
//
// 使う絵: walk1.png / konpeito-pink.svg / konpeito-yellow.svg / hand.svg / bucket.png

const Tutorial = (() => {
  let root = null;
  let bodyEl = null;
  let dotsEl = null;
  let nextBtn = null;
  let pages = [];
  let index = 0;
  let opts = {};

  // ----- 絵の部品 -----
  const frame = (cap, inner, wide) =>
    `<div class="tut-frame${wide ? ' wide' : ''}"><span class="tut-cap">${cap}</span>${inner}</div>`;
  const arrow = '<span class="tut-next">▶</span>';
  const chara = (style, cls) =>
    `<img class="tut-chara ${cls || ''}" src="walk1.png" style="${style}" alt="">`;
  const kon = (color, style) =>
    `<img class="tut-kon" src="konpeito-${color}.svg" style="${style}" alt="">`;
  const hand = (side, style) =>
    `<img class="tut-hand ${side}" src="hand.svg" style="${style}" alt="">`;
  const band = (style) => `<div class="tut-band" style="${style}"></div>`;

  // ----- ページ1：こんぺいとう -----
  function pageKonpeito() {
    const pinch = [
      frame('①ちかづく', chara('left:12px;top:42px') + kon('pink', 'right:16px;top:52px')),
      frame('②ひろう！',
        chara('left:34px;top:42px') + kon('pink', 'left:76px;top:48px') +
        '<span class="tut-spark" style="left:108px;top:30px">✨</span>'),
      frame('③ブースト！',
        '<span class="tut-lines pink">≫≫</span>' + chara('left:52px;top:42px', 'glow') +
        '<span class="tut-badge pink" style="right:10px;top:28px">×2</span>')
    ].join(arrow);

    const yellow = [
      frame('①ちかづく', chara('left:12px;top:42px') + kon('yellow', 'right:16px;top:52px')),
      frame('②ひろう！',
        chara('left:34px;top:42px') + kon('yellow', 'left:76px;top:48px') +
        '<span class="tut-spark" style="left:108px;top:30px">✨</span>'),
      frame('③スコア！',
        chara('left:14px;top:44px') +
        '<span class="tut-badge yellow" style="left:56px;top:24px">+1</span>' +
        '<span class="tut-score" style="right:8px;top:46px">こんぺいとう<br><b>1</b> こ</span>')
    ].join(arrow);

    return `
      <h2>こんぺいとうを ひろおう！</h2>
      <p class="tut-lead">ステージのどこかに、${opts.interval}びょうに ひとつ、こんぺいとうが でてくるよ。<br>ちかづいて、ひろってみよう！</p>
      <div class="tut-item">
        <div class="tut-name pink">ピンクのこんぺいとう ＝ ブースト</div>
        <div class="tut-strip">${pinch}</div>
        <p class="tut-text">ひろうと <b>${opts.boostSec}びょうかん</b>、うごくスピードが <b>2ばい</b> になるよ！</p>
      </div>
      <div class="tut-item">
        <div class="tut-name yellow">きいろのこんぺいとう ＝ スコア</div>
        <div class="tut-strip">${yellow}</div>
        <p class="tut-text">ひろうたびに <b>+1こ</b>。おわったときに、ぜんぶで なんこか ひょうじされるよ！</p>
      </div>`;
  }

  // ----- ページ2：めいの手（ステージ2） -----
  function pageHands() {
    const f1 = frame('①かたほうが のびてくる',
      band('top:64px;left:0;width:144px') +
      hand('left', 'left:-70px;top:47px') +
      chara('right:4px;top:22px', 'small'), true);
    const f2 = frame('②りょうほうから はさむ！',
      band('top:64px;left:0;width:100%') +
      hand('left', 'left:-120px;top:47px') + hand('right', 'right:-120px;top:47px') +
      chara('left:68px;top:20px', 'small'), true);
    const f3 = frame('③すきまは わな！',
      band('top:64px;left:0;width:100%') +
      hand('left', 'left:-150px;top:47px') + hand('right', 'right:-150px;top:47px') +
      '<img class="tut-bucket" src="bucket.png" alt="">' +
      '<span class="tut-warn-mark">！</span>', true);

    return `
      <h2>めいの手に ちゅうい！</h2>
      <p class="tut-lead">ステージ2では、めいの りょうてが よこから のびてくるよ。<br>まず <b>赤い帯</b> が ひかって、そのあと てが やってくる！</p>
      <div class="tut-item">
        <div class="tut-strip">${f1}${arrow}${f2}${arrow}${f3}</div>
        <p class="tut-text">
          かたほうが きたあとは、<b>りょうほうから はさみうち</b>！ 赤い帯の そとへ、<b>たてに</b> にげよう。<br>
          てのあいだの <b>すきま</b> には、バケツが おちてくるから はいっちゃだめ！
        </p>
      </div>
      <div class="tut-item">
        <p class="tut-text" style="margin:0">バケツと こんぺいとうも でてくるよ。<b>1かい あたると ゲームオーバー</b> だから、ここで れんしゅうしよう！</p>
      </div>`;
  }

  // ----- 表示まわり -----
  function render() {
    bodyEl.innerHTML = pages[index]();
    nextBtn.textContent = (index < pages.length - 1) ? 'つぎへ ▶' : 'はじめる！';
    dotsEl.innerHTML = pages.map((_, i) => `<span class="${i === index ? 'on' : ''}"></span>`).join('');
    root.querySelector('.tut-panel').scrollTop = 0;
  }

  function build() {
    root = document.createElement('div');
    root.id = 'tutorial';
    root.innerHTML = `
      <div class="tut-panel">
        <div id="tut-body"></div>
        <div class="tut-nav">
          <button id="tut-back" class="sub-btn">もどる</button>
          <div id="tut-dots" class="tut-dots"></div>
          <button id="tut-skip" class="sub-btn">スキップ</button>
          <button id="tut-next" class="main-btn">つぎへ ▶</button>
        </div>
      </div>`;
    document.body.appendChild(root);

    bodyEl = root.querySelector('#tut-body');
    dotsEl = root.querySelector('#tut-dots');
    nextBtn = root.querySelector('#tut-next');

    nextBtn.addEventListener('click', () => {
      if (index < pages.length - 1) {
        index++;
        render();
      } else {
        finish();
      }
    });
    root.querySelector('#tut-skip').addEventListener('click', finish);
    root.querySelector('#tut-back').addEventListener('click', () => {
      hide();
      if (opts.onBack) opts.onBack();
    });
  }

  function finish() {
    hide();
    if (opts.onDone) opts.onDone();
  }

  function show(options) {
    opts = Object.assign({ stage: 1, boostSec: 3, interval: 10 }, options);
    if (!root) build();
    pages = [pageKonpeito];
    if (opts.stage === 2) pages.push(pageHands);
    index = 0;
    render();
    root.style.display = 'flex';
  }

  function hide() {
    if (root) root.style.display = 'none';
  }

  return { show, hide };
})();
