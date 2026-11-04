// ===== 待機画面（メニュー）の制御 =====
// game.html から使う窓口は Menu オブジェクトだけです。
//
//   Menu.init({ gameTime, onStart })  最初に1回呼ぶ。onStart はスタートボタンが押されたときに呼ばれる
//   Menu.mode                         選択中のモード（'normal' または 'practice'）
//   Menu.stage                        選択中のステージ番号
//   Menu.show() / Menu.hide()         待機画面の表示 / 非表示
//   Menu.notifyInput()                コントローラーから入力が届いたときに呼ぶ
//   Menu.setConnected(bool)           Firebase の接続状態を伝える
//   Menu.recordSurvival(sec)          通常モードの生存時間を記録する。ベスト更新なら true を返す
//   Menu.recordScore(n)               通常モードのこんぺいとうの数を記録する。ベスト更新なら true を返す
//
// Firebase には触らないので、通信まわりは game.html 側だけで完結します。

const Menu = (() => {
  const INPUT_ACTIVE_MS = 3000; // この時間内に入力があれば「受信中」と表示

  const menuEl = document.getElementById('menu');
  const statusEl = document.getElementById('controller-status');
  const bestEl = document.getElementById('best-record');
  const startBtn = document.getElementById('btn-start');
  const modeBtns = document.querySelectorAll('[data-mode]');
  const stageBtns = document.querySelectorAll('[data-stage]');

  let mode = 'normal';
  let stage = 1;
  let gameTime = 30;
  let onStart = null;
  let lastInputTime = 0;
  let dbConnected = false;

  // ----- ベスト記録（通常モードの生存時間・ステージごとに保存） -----
  function bestKey() {
    return `makkuro_best_stage${stage}`;
  }

  function loadBest() {
    try {
      const v = localStorage.getItem(bestKey());
      return v === null ? null : parseFloat(v);
    } catch (e) {
      return null;
    }
  }

  function saveBest(sec) {
    try {
      localStorage.setItem(bestKey(), String(sec));
    } catch (e) {
      // 保存できない環境では何もしない
    }
  }

  // ----- ベストスコア（こんぺいとうの数・ステージごとに保存） -----
  function scoreKey() {
    return `makkuro_bestscore_stage${stage}`;
  }

  function loadBestScore() {
    try {
      const v = localStorage.getItem(scoreKey());
      return v === null ? null : parseInt(v, 10);
    } catch (e) {
      return null;
    }
  }

  function saveBestScore(n) {
    try {
      localStorage.setItem(scoreKey(), String(n));
    } catch (e) {
      // 保存できない環境では何もしない
    }
  }

  function showBest() {
    const best = loadBest();
    const bestScore = loadBestScore();
    if ((best === null || isNaN(best)) && (bestScore === null || isNaN(bestScore))) {
      bestEl.textContent = 'ベスト記録（通常モード）: まだ記録がありません';
      return;
    }
    let timeText = '—';
    if (best !== null && !isNaN(best)) {
      timeText = (best >= gameTime) ? `${gameTime.toFixed(1)}秒（クリア！）` : `${best.toFixed(1)}秒`;
    }
    const scoreText = (bestScore === null || isNaN(bestScore)) ? 0 : bestScore;
    bestEl.textContent = `ベスト記録（通常モード）: ${timeText} ／ こんぺいとう ${scoreText}こ`;
  }

  function recordSurvival(sec) {
    const best = loadBest();
    const isNewBest = (best === null || isNaN(best) || sec > best);
    if (isNewBest) saveBest(sec);
    return isNewBest;
  }

  // こんぺいとうの数を記録する。ベスト更新（1こ以上）なら true を返す
  function recordScore(n) {
    if (n <= 0) return false;
    const best = loadBestScore();
    const isNewBest = (best === null || isNaN(best) || n > best);
    if (isNewBest) saveBestScore(n);
    return isNewBest;
  }

  // ----- コントローラーの受信状況 -----
  function updateStatus() {
    if (!dbConnected) {
      statusEl.textContent = '🔴 サーバーに接続できていません';
      statusEl.className = 'ng';
    } else if (lastInputTime > 0 && performance.now() - lastInputTime < INPUT_ACTIVE_MS) {
      statusEl.textContent = '🟢 コントローラー: 受信中';
      statusEl.className = 'ok';
    } else {
      statusEl.textContent = '🟡 コントローラー: 入力待ち（スマホを傾けてみてください）';
      statusEl.className = 'wait';
    }
  }

  function notifyInput() {
    lastInputTime = performance.now();
  }

  function setConnected(connected) {
    dbConnected = connected;
    updateStatus();
  }

  setInterval(updateStatus, 500);

  // ----- 選択ボタン・スタートボタン -----
  modeBtns.forEach((btn) => {
    btn.addEventListener('click', () => {
      mode = btn.dataset.mode;
      modeBtns.forEach((b) => b.classList.toggle('selected', b === btn));
    });
  });

  stageBtns.forEach((btn) => {
    btn.addEventListener('click', () => {
      stage = parseInt(btn.dataset.stage, 10);
      stageBtns.forEach((b) => b.classList.toggle('selected', b === btn));
      showBest();
    });
  });

  startBtn.addEventListener('click', () => {
    if (onStart) onStart({ mode: mode, stage: stage });
  });

  // ----- 外から使う窓口 -----
  function init(options) {
    if (options.gameTime !== undefined) gameTime = options.gameTime;
    onStart = options.onStart || null;
  }

  function show() {
    showBest();
    updateStatus();
    menuEl.style.display = 'flex';
  }

  function hide() {
    menuEl.style.display = 'none';
  }

  return {
    init,
    show,
    hide,
    notifyInput,
    setConnected,
    recordSurvival,
    recordScore,
    get mode() { return mode; },
    get stage() { return stage; }
  };
})();
