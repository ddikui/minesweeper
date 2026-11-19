/**
 * Minesweeper Game Engine
 * Features:
 * - Safe first click (guarantees empty area whenever possible)
 * - Flood fill for zero-tiles
 * - Chording (double click or click on revealed number)
 * - Web Audio API synthesized sound effects
 * - Pure Canvas Confetti on win
 * - Touch & Mobile mode toggle / Long-press flag
 * - LocalStorage best score & theme persistence
 */

// --- 난이도 설정 ---
const DIFFICULTIES = {
  beginner: { cols: 9, rows: 9, mines: 10, name: '초급' },
  intermediate: { cols: 16, rows: 16, mines: 40, name: '중급' },
  expert: { cols: 30, rows: 16, mines: 99, name: '고급' }
};

class Minesweeper {
  constructor() {
    this.currentDiff = 'beginner';
    this.config = { ...DIFFICULTIES.beginner };
    this.board = [];
    this.status = 'idle'; // 'idle' | 'playing' | 'won' | 'lost'
    this.timer = 0;
    this.timerInterval = null;
    this.minesLeft = this.config.mines;
    this.revealedCount = 0;
    this.mobileMode = 'dig'; // 'dig' | 'flag'
    this.soundEnabled = true;

    // DOM Elements
    this.boardEl = document.getElementById('board');
    this.mineCountEl = document.getElementById('mine-count');
    this.timerEl = document.getElementById('timer');
    this.faceBtn = document.getElementById('btn-face');
    this.diffBtns = document.querySelectorAll('.diff-btn');
    this.btnSound = document.getElementById('btn-sound');
    this.btnTheme = document.getElementById('btn-theme');
    this.btnStats = document.getElementById('btn-stats');
    this.btnHelp = document.getElementById('btn-help');
    this.modeDigBtn = document.getElementById('mode-dig');
    this.modeFlagBtn = document.getElementById('mode-flag');

    // Modals
    this.modalCustom = document.getElementById('modal-custom');
    this.modalStats = document.getElementById('modal-stats');
    this.modalHelp = document.getElementById('modal-help');
    this.customForm = document.getElementById('custom-form');

    // Audio Context
    this.audioCtx = null;

    // Confetti
    this.confetti = new Confetti('confetti-canvas');

    this.init();
  }

  init() {
    this.loadPreferences();
    this.bindEvents();
    this.startNewGame();
  }

  // --- 오디오 효과 (Web Audio API) ---
  getAudioContext() {
    if (!this.audioCtx) {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (AudioCtx) this.audioCtx = new AudioCtx();
    }
    if (this.audioCtx && this.audioCtx.state === 'suspended') {
      this.audioCtx.resume();
    }
    return this.audioCtx;
  }

  playSound(type) {
    if (!this.soundEnabled) return;
    try {
      const ctx = this.getAudioContext();
      if (!ctx) return;

      const now = ctx.currentTime;

      if (type === 'click') {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(450, now);
        osc.frequency.exponentialRampToValueAtTime(150, now + 0.05);
        gain.gain.setValueAtTime(0.15, now);
        gain.gain.exponentialRampToValueAtTime(0.01, now + 0.05);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(now);
        osc.stop(now + 0.05);
      } else if (type === 'flag') {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(600, now);
        osc.frequency.setValueAtTime(800, now + 0.04);
        gain.gain.setValueAtTime(0.12, now);
        gain.gain.exponentialRampToValueAtTime(0.01, now + 0.08);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(now);
        osc.stop(now + 0.08);
      } else if (type === 'chord') {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(520, now);
        osc.frequency.exponentialRampToValueAtTime(680, now + 0.08);
        gain.gain.setValueAtTime(0.2, now);
        gain.gain.exponentialRampToValueAtTime(0.01, now + 0.08);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(now);
        osc.stop(now + 0.08);
      } else if (type === 'explode') {
        // 노이즈 버퍼를 이용한 폭발음
        const bufferSize = ctx.sampleRate * 0.5;
        const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
        const data = buffer.getChannelData(0);
        for (let i = 0; i < bufferSize; i++) {
          data[i] = Math.random() * 2 - 1;
        }

        const noise = ctx.createBufferSource();
        noise.buffer = buffer;

        const filter = ctx.createBiquadFilter();
        filter.type = 'lowpass';
        filter.frequency.setValueAtTime(800, now);
        filter.frequency.exponentialRampToValueAtTime(60, now + 0.5);

        const gain = ctx.createGain();
        gain.gain.setValueAtTime(0.4, now);
        gain.gain.exponentialRampToValueAtTime(0.01, now + 0.5);

        noise.connect(filter);
        filter.connect(gain);
        gain.connect(ctx.destination);

        noise.start(now);
        noise.stop(now + 0.5);
      } else if (type === 'win') {
        // 승리 팡파르 아르페지오 (도-미-솔-도)
        const notes = [523.25, 659.25, 783.99, 1046.5];
        notes.forEach((freq, idx) => {
          const osc = ctx.createOscillator();
          const gain = ctx.createGain();
          const start = now + idx * 0.12;
          osc.type = 'triangle';
          osc.frequency.setValueAtTime(freq, start);
          gain.gain.setValueAtTime(0.25, start);
          gain.gain.exponentialRampToValueAtTime(0.001, start + 0.25);
          osc.connect(gain);
          gain.connect(ctx.destination);
          osc.start(start);
          osc.stop(start + 0.25);
        });
      }
    } catch (e) {
      console.warn('Audio playback error:', e);
    }
  }

  // --- 이벤트 바인딩 ---
  bindEvents() {
    // 스마일리 리셋
    this.faceBtn.addEventListener('click', () => {
      this.playSound('click');
      this.startNewGame();
    });

    // 난이도 변경 버튼
    this.diffBtns.forEach(btn => {
      btn.addEventListener('click', () => {
        const diff = btn.dataset.diff;
        if (diff === 'custom') {
          this.openModal(this.modalCustom);
        } else {
          this.setDifficulty(diff);
        }
      });
    });

    // 사용자 지정 폼
    this.customForm.addEventListener('submit', (e) => {
      e.preventDefault();
      const cols = parseInt(document.getElementById('custom-cols').value, 10);
      const rows = parseInt(document.getElementById('custom-rows').value, 10);
      let mines = parseInt(document.getElementById('custom-mines').value, 10);

      // 최대 지뢰 수 검증 (최소 1칸 안전)
      const maxMines = Math.floor(cols * rows * 0.85);
      if (mines > maxMines) {
        mines = maxMines;
        alert(`지뢰가 너무 많아 최대치인 ${maxMines}개로 조정되었습니다.`);
      }

      this.currentDiff = 'custom';
      this.config = { cols, rows, mines, name: '사용자 지정' };
      this.updateDifficultyUI();
      this.closeModal(this.modalCustom);
      this.startNewGame();
    });

    document.getElementById('btn-custom-cancel').addEventListener('click', () => {
      this.closeModal(this.modalCustom);
    });

    // 모바일 조작 모드 변경 (파기 / 깃발)
    this.modeDigBtn.addEventListener('click', () => this.setMobileMode('dig'));
    this.modeFlagBtn.addEventListener('click', () => this.setMobileMode('flag'));

    // 사운드 토글
    this.btnSound.addEventListener('click', () => {
      this.soundEnabled = !this.soundEnabled;
      this.btnSound.textContent = this.soundEnabled ? '🔊' : '🔇';
      localStorage.setItem('minesweeper_sound', this.soundEnabled);
    });

    // 테마 토글
    this.btnTheme.addEventListener('click', () => {
      const isRetro = document.body.classList.contains('theme-retro');
      document.body.classList.toggle('theme-retro', !isRetro);
      document.body.classList.toggle('theme-modern', isRetro);
      localStorage.setItem('minesweeper_theme', isRetro ? 'modern' : 'retro');
    });

    // 최고 기록 모달
    this.btnStats.addEventListener('click', () => {
      this.displayStats();
      this.openModal(this.modalStats);
    });
    document.getElementById('btn-stats-close').addEventListener('click', () => {
      this.closeModal(this.modalStats);
    });
    document.getElementById('btn-reset-stats').addEventListener('click', () => {
      if (confirm('최고 기록을 모두 초기화하시겠습니까?')) {
        localStorage.removeItem('minesweeper_stats');
        this.displayStats();
      }
    });

    // 도움말 모달
    this.btnHelp.addEventListener('click', () => this.openModal(this.modalHelp));
    document.getElementById('btn-help-close').addEventListener('click', () => this.closeModal(this.modalHelp));

    // 보드 우클릭 기본 동작 차단
    this.boardEl.addEventListener('contextmenu', (e) => e.preventDefault());

    // 마우스 다운 시 깜짝 놀라는 표정 (😮)
    this.boardEl.addEventListener('mousedown', (e) => {
      if (e.target.classList.contains('tile') && !e.target.classList.contains('revealed') && this.status === 'playing') {
        if (e.button === 0) {
          this.faceBtn.textContent = '😮';
        }
      }
    });

    window.addEventListener('mouseup', () => {
      if (this.status === 'playing' || this.status === 'idle') {
        this.faceBtn.textContent = '🙂';
      }
    });
  }

  loadPreferences() {
    // 테마 로드
    const savedTheme = localStorage.getItem('minesweeper_theme');
    if (savedTheme === 'modern') {
      document.body.classList.remove('theme-retro');
      document.body.classList.add('theme-modern');
    }

    // 소리 설정 로드
    const savedSound = localStorage.getItem('minesweeper_sound');
    if (savedSound !== null) {
      this.soundEnabled = savedSound === 'true';
      this.btnSound.textContent = this.soundEnabled ? '🔊' : '🔇';
    }
  }

  setDifficulty(diffKey) {
    if (!DIFFICULTIES[diffKey]) return;
    this.currentDiff = diffKey;
    this.config = { ...DIFFICULTIES[diffKey] };
    this.updateDifficultyUI();
    this.startNewGame();
  }

  updateDifficultyUI() {
    this.diffBtns.forEach(btn => {
      btn.classList.toggle('active', btn.dataset.diff === this.currentDiff);
    });
  }

  setMobileMode(mode) {
    this.mobileMode = mode;
    this.modeDigBtn.classList.toggle('active', mode === 'dig');
    this.modeFlagBtn.classList.toggle('active', mode === 'flag');
  }

  // --- 게임 시작 및 상태 초기화 ---
  startNewGame() {
    this.stopTimer();
    this.timer = 0;
    this.status = 'idle';
    this.revealedCount = 0;
    this.minesLeft = this.config.mines;
    this.faceBtn.textContent = '🙂';
    this.updateDisplays();

    const { rows, cols } = this.config;
    this.board = Array.from({ length: rows }, () =>
      Array.from({ length: cols }, () => ({
        isMine: false,
        revealed: false,
        flagged: false,
        neighborMines: 0
      }))
    );

    this.renderBoard();
  }

  // --- 보드 DOM 렌더링 ---
  renderBoard() {
    const { rows, cols } = this.config;
    this.boardEl.innerHTML = '';
    this.boardEl.style.gridTemplateColumns = `repeat(${cols}, 30px)`;
    this.boardEl.style.gridTemplateRows = `repeat(${rows}, 30px)`;

    let longPressTimeout = null;
    let isLongPress = false;

    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const tile = document.createElement('div');
        tile.className = 'tile';
        tile.dataset.row = r;
        tile.dataset.col = c;
        tile.setAttribute('role', 'gridcell');

        // 좌클릭
        tile.addEventListener('click', (e) => {
          if (isLongPress) {
            isLongPress = false;
            return;
          }
          if (this.mobileMode === 'flag') {
            this.handleRightClick(r, c);
          } else {
            this.handleLeftClick(r, c);
          }
        });

        // 우클릭 (깃발)
        tile.addEventListener('contextmenu', (e) => {
          e.preventDefault();
          this.handleRightClick(r, c);
        });

        // 터치 기기용 롱프레스 (길게 누르면 깃발)
        tile.addEventListener('touchstart', (e) => {
          isLongPress = false;
          longPressTimeout = setTimeout(() => {
            isLongPress = true;
            this.handleRightClick(r, c);
          }, 400);
        }, { passive: true });

        tile.addEventListener('touchend', () => {
          clearTimeout(longPressTimeout);
        });

        tile.addEventListener('touchmove', () => {
          clearTimeout(longPressTimeout);
        });

        this.boardEl.appendChild(tile);
      }
    }
  }

  // --- 지뢰 배치 (첫 클릭 안전 보장) ---
  placeMines(firstRow, firstCol) {
    const { rows, cols, mines } = this.config;
    const totalCells = rows * cols;

    // 첫 클릭 위치 및 주변 8방향 셀 (가능하면 첫 클릭 시 빈 공간 보장)
    const safeZone = new Set();
    const canMakeSafeIsland = totalCells - 9 >= mines;

    if (canMakeSafeIsland) {
      for (let dr = -1; dr <= 1; dr++) {
        for (let dc = -1; dc <= 1; dc++) {
          const nr = firstRow + dr;
          const nc = firstCol + dc;
          if (nr >= 0 && nr < rows && nc >= 0 && nc < cols) {
            safeZone.add(`${nr},${nc}`);
          }
        }
      }
    } else {
      safeZone.add(`${firstRow},${firstCol}`);
    }

    // 후보지 배열 생성
    const candidates = [];
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        if (!safeZone.has(`${r},${c}`)) {
          candidates.push({ r, c });
        }
      }
    }

    // 지뢰 랜덤 배치 (Fisher-Yates 셔플)
    let minesToPlace = mines;
    while (minesToPlace > 0 && candidates.length > 0) {
      const idx = Math.floor(Math.random() * candidates.length);
      const { r, c } = candidates.splice(idx, 1)[0];
      this.board[r][c].isMine = true;
      minesToPlace--;
    }

    // 인접 지뢰 수 계산
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        if (this.board[r][c].isMine) continue;
        let count = 0;
        for (let dr = -1; dr <= 1; dr++) {
          for (let dc = -1; dc <= 1; dc++) {
            const nr = r + dr;
            const nc = c + dc;
            if (nr >= 0 && nr < rows && nc >= 0 && nc < cols) {
              if (this.board[nr][nc].isMine) count++;
            }
          }
        }
        this.board[r][c].neighborMines = count;
      }
    }
  }

  // --- 좌클릭 동작 ---
  handleLeftClick(r, c) {
    if (this.status === 'won' || this.status === 'lost') return;

    const cell = this.board[r][c];

    // 이미 열린 셀을 클릭한 경우 -> Chording (주변 일괄 열기) 시도
    if (cell.revealed) {
      if (cell.neighborMines > 0) {
        this.tryChord(r, c);
      }
      return;
    }

    // 깃발 꽂힌 셀은 클릭 방지
    if (cell.flagged) return;

    // 첫 클릭 처리
    if (this.status === 'idle') {
      this.placeMines(r, c);
      this.status = 'playing';
      this.startTimer();
    }

    // 지뢰를 밟은 경우 -> 패배
    if (cell.isMine) {
      this.gameOver(r, c);
      return;
    }

    // 안전한 칸 열기
    this.playSound('click');
    this.revealCell(r, c);

    // 승리 조건 체크
    this.checkWinCondition();
  }

  // --- 우클릭 (깃발) 동작 ---
  handleRightClick(r, c) {
    if (this.status === 'won' || this.status === 'lost') return;

    const cell = this.board[r][c];
    if (cell.revealed) return;

    cell.flagged = !cell.flagged;
    this.playSound('flag');

    if (cell.flagged) {
      this.minesLeft--;
    } else {
      this.minesLeft++;
    }

    this.updateCellUI(r, c);
    this.updateDisplays();
  }

  // --- Chording (코드/더블클릭): 주변 깃발 수가 맞으면 미확인 인접 타일 일괄 오픈 ---
  tryChord(r, c) {
    const cell = this.board[r][c];
    const { rows, cols } = this.config;

    let flagCount = 0;
    const neighbors = [];

    for (let dr = -1; dr <= 1; dr++) {
      for (let dc = -1; dc <= 1; dc++) {
        if (dr === 0 && dc === 0) continue;
        const nr = r + dr;
        const nc = c + dc;
        if (nr >= 0 && nr < rows && nc >= 0 && nc < cols) {
          neighbors.push({ r: nr, c: nc, cell: this.board[nr][nc] });
          if (this.board[nr][nc].flagged) flagCount++;
        }
      }
    }

    // 주변 깃발 수가 번호와 일치할 때
    if (flagCount === cell.neighborMines) {
      this.playSound('chord');
      let hitMine = false;
      let mineCoord = null;

      for (const n of neighbors) {
        if (!n.cell.revealed && !n.cell.flagged) {
          if (n.cell.isMine) {
            hitMine = true;
            mineCoord = { r: n.r, c: n.c };
          } else {
            this.revealCell(n.r, n.c);
          }
        }
      }

      if (hitMine) {
        this.gameOver(mineCoord.r, mineCoord.c);
      } else {
        this.checkWinCondition();
      }
    }
  }

  // --- 셀 열기 및 Flood Fill (BFS) ---
  revealCell(startR, startC) {
    const { rows, cols } = this.config;
    const queue = [{ r: startR, c: startC }];

    while (queue.length > 0) {
      const { r, c } = queue.shift();
      const cell = this.board[r][c];

      if (cell.revealed || cell.flagged || cell.isMine) continue;

      cell.revealed = true;
      this.revealedCount++;
      this.updateCellUI(r, c);

      // 0인 경우 주변 8칸도 연쇄 확장
      if (cell.neighborMines === 0) {
        for (let dr = -1; dr <= 1; dr++) {
          for (let dc = -1; dc <= 1; dc++) {
            const nr = r + dr;
            const nc = c + dc;
            if (nr >= 0 && nr < rows && nc >= 0 && nc < cols) {
              if (!this.board[nr][nc].revealed && !this.board[nr][nc].flagged) {
                queue.push({ r: nr, c: nc });
              }
            }
          }
        }
      }
    }
  }

  // --- 개별 타일 DOM 업데이트 ---
  updateCellUI(r, c) {
    const idx = r * this.config.cols + c;
    const tile = this.boardEl.children[idx];
    const cell = this.board[r][c];

    if (!tile) return;

    if (cell.revealed) {
      tile.classList.add('revealed');
      tile.classList.remove('flagged');

      if (cell.isMine) {
        tile.textContent = '💣';
      } else if (cell.neighborMines > 0) {
        tile.textContent = cell.neighborMines;
        tile.dataset.count = cell.neighborMines;
      } else {
        tile.textContent = '';
      }
    } else if (cell.flagged) {
      tile.classList.add('flagged');
      tile.textContent = '🚩';
    } else {
      tile.classList.remove('flagged', 'revealed');
      tile.textContent = '';
      delete tile.dataset.count;
    }
  }

  // --- 타이머 ---
  startTimer() {
    this.stopTimer();
    this.timerInterval = setInterval(() => {
      if (this.timer < 999) {
        this.timer++;
        this.updateDisplays();
      }
    }, 1000);
  }

  stopTimer() {
    if (this.timerInterval) {
      clearInterval(this.timerInterval);
      this.timerInterval = null;
    }
  }

  // --- 디스플레이 (LCD) 갱신 ---
  updateDisplays() {
    // 지뢰 수 포맷 (-99 ~ 999)
    let mStr = '';
    if (this.minesLeft < 0) {
      mStr = '-' + String(Math.abs(this.minesLeft)).padStart(2, '0');
    } else {
      mStr = String(Math.min(999, this.minesLeft)).padStart(3, '0');
    }
    this.mineCountEl.textContent = mStr;

    // 타이머 포맷 (000 ~ 999)
    this.timerEl.textContent = String(Math.min(999, this.timer)).padStart(3, '0');
  }

  // --- 승리 조건 검사 ---
  checkWinCondition() {
    const { rows, cols, mines } = this.config;
    const totalSafeCells = rows * cols - mines;

    if (this.revealedCount >= totalSafeCells) {
      this.status = 'won';
      this.stopTimer();
      this.faceBtn.textContent = '😎';
      this.minesLeft = 0;
      this.updateDisplays();

      // 모든 지뢰에 깃발 표시
      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          if (this.board[r][c].isMine && !this.board[r][c].flagged) {
            this.board[r][c].flagged = true;
            this.updateCellUI(r, c);
          }
        }
      }

      this.playSound('win');
      this.confetti.fire();

      // 최고 기록 저장 및 알림
      this.saveBestScore();
    }
  }

  // --- 게임 오버 (패배) ---
  gameOver(explodedR, explodedC) {
    this.status = 'lost';
    this.stopTimer();
    this.faceBtn.textContent = '😵';
    this.playSound('explode');

    const { rows, cols } = this.config;

    // 모든 타일 확인 및 지뢰 공개
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const cell = this.board[r][c];
        const idx = r * cols + c;
        const tile = this.boardEl.children[idx];

        if (r === explodedR && c === explodedC) {
          tile.classList.add('revealed', 'mine-exploded');
          tile.textContent = '💥';
        } else if (cell.isMine && !cell.flagged) {
          tile.classList.add('revealed');
          tile.textContent = '💣';
        } else if (!cell.isMine && cell.flagged) {
          // 잘못 꽂힌 깃발 표시
          tile.classList.add('revealed', 'false-flag');
          tile.textContent = '❌';
        }
      }
    }
  }

  // --- 최고 기록 관리 ---
  saveBestScore() {
    if (this.currentDiff === 'custom') return;

    const stats = JSON.parse(localStorage.getItem('minesweeper_stats') || '{}');
    const prevBest = stats[this.currentDiff];

    if (!prevBest || this.timer < prevBest) {
      stats[this.currentDiff] = this.timer;
      localStorage.setItem('minesweeper_stats', JSON.stringify(stats));
      setTimeout(() => {
        alert(`🎉 축하합니다! 새로운 최고 기록 달성: ${this.timer}초!`);
      }, 500);
    }
  }

  displayStats() {
    const stats = JSON.parse(localStorage.getItem('minesweeper_stats') || '{}');
    document.getElementById('stat-beginner').textContent = stats.beginner ? `${stats.beginner}초` : '기록 없음';
    document.getElementById('stat-intermediate').textContent = stats.intermediate ? `${stats.intermediate}초` : '기록 없음';
    document.getElementById('stat-expert').textContent = stats.expert ? `${stats.expert}초` : '기록 없음';
  }

  // --- 모달 제어 ---
  openModal(modal) {
    modal.classList.remove('hidden');
  }

  closeModal(modal) {
    modal.classList.add('hidden');
  }
}

// --- 승리 축하 콘페티 파티클 시스템 ---
class Confetti {
  constructor(canvasId) {
    this.canvas = document.getElementById(canvasId);
    this.ctx = this.canvas.getContext('2d');
    this.particles = [];
    this.animationId = null;
    this.resize();

    window.addEventListener('resize', () => this.resize());
  }

  resize() {
    this.canvas.width = window.innerWidth;
    this.canvas.height = window.innerHeight;
  }

  fire() {
    this.particles = [];
    const colors = ['#f43f5e', '#3b82f6', '#10b981', '#f59e0b', '#8b5cf6', '#ec4899', '#ffffff'];
    const count = 150;

    for (let i = 0; i < count; i++) {
      this.particles.push({
        x: window.innerWidth / 2,
        y: window.innerHeight / 2,
        vx: (Math.random() - 0.5) * 18,
        vy: (Math.random() - 0.7) * 22,
        size: Math.random() * 8 + 5,
        color: colors[Math.floor(Math.random() * colors.length)],
        rotation: Math.random() * 360,
        rotationSpeed: (Math.random() - 0.5) * 12,
        opacity: 1
      });
    }

    if (this.animationId) cancelAnimationFrame(this.animationId);
    this.animate();
  }

  animate() {
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.x += p.vx;
      p.y += p.vy;
      p.vy += 0.45; // 중력
      p.rotation += p.rotationSpeed;
      p.opacity -= 0.007;

      if (p.opacity <= 0) {
        this.particles.splice(i, 1);
        continue;
      }

      this.ctx.save();
      this.ctx.translate(p.x, p.y);
      this.ctx.rotate((p.rotation * Math.PI) / 180);
      this.ctx.globalAlpha = Math.max(0, p.opacity);
      this.ctx.fillStyle = p.color;
      this.ctx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size);
      this.ctx.restore();
    }

    if (this.particles.length > 0) {
      this.animationId = requestAnimationFrame(() => this.animate());
    } else {
      this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    }
  }
}

// 애플리케이션 초기화
document.addEventListener('DOMContentLoaded', () => {
  window.game = new Minesweeper();
});
