class SoundManager {
    constructor() {
        this.muted = false;
        this.sounds = {};
        this.bgm = null;
        this.bgmActive = false;
        this.loadSounds();
        this.loadSettings();

        this.el = document.getElementById('sound-toggle');
        if (this.el) {
            this.el.addEventListener('click', () => this.toggleMute());
            this.updateIcon();
        }
    }

    loadSettings() {
        const stored = localStorage.getItem('agri_sound_muted');
        if (stored !== null) {
            this.muted = JSON.parse(stored);
        }
    }

    loadSounds() {
        const sfxNames = ['tap', 'harvest', 'clear', 'fail', 'finish', 'tractor', 'home'];
        sfxNames.forEach(name => {
            const audio = new Audio(`assets/sfx/${name}.wav`);
            audio.load();
            this.sounds[name] = audio;
        });

        this.bgm = new Audio('assets/bgm/home.wav');
        this.bgm.loop = true;
        this.bgm.volume = 0.25;
        this.bgm.load();
    }

    play(name) {
        if (this.muted) return;
        const sound = this.sounds[name];
        if (sound) {
            const clone = sound.cloneNode();
            clone.volume = 0.5;
            clone.play().catch(e => { });
        }
    }

    toggleMute() {
        this.muted = !this.muted;
        localStorage.setItem('agri_sound_muted', JSON.stringify(this.muted));
        this.updateBgmState();
        this.updateIcon();
    }

    updateIcon() {
        if (this.el) {
            this.el.textContent = this.muted ? '🔇' : '🔊';
        }
    }
    playBgm() {
        this.bgmActive = true;
        this.updateBgmState();
    }

    stopBgm() {
        this.bgmActive = false;
        if (this.bgm) {
            this.bgm.pause();
            this.bgm.currentTime = 0;
        }
    }

    updateBgmState() {
        if (!this.bgm) return;
        if (this.muted || !this.bgmActive) {
            this.bgm.pause();
            return;
        }
        this.bgm.play().catch(() => { });
    }
}

class UserManager {
    constructor() {
        this.data = {
            name: '',
            totalScore: 0,
            hoeLevel: 1, // Global Hoe Level
            endlessBest: 0
        };
        this.STORAGE_KEY = 'agri_user_data';
        this.load();
    }

    load() {
        try {
            const stored = localStorage.getItem(this.STORAGE_KEY);
            if (stored) {
                const parsed = JSON.parse(stored);
                // Migration logic for old "hoeLevels" object
                if (parsed.hoeLevels) {
                    const levs = Object.values(parsed.hoeLevels);
                    const maxLv = Math.max(1, ...levs);
                    this.data.hoeLevel = maxLv;
                    delete parsed.hoeLevels;
                }

                this.data = { ...this.data, ...parsed };
            }
        } catch (e) {
            console.error("Save load error", e);
        }
    }

    save() {
        localStorage.setItem(this.STORAGE_KEY, JSON.stringify(this.data));
    }

    setName(name) {
        this.data.name = name.trim();
        this.save();
    }

    resetForNewName(name) {
        this.data = {
            name: name.trim(),
            totalScore: 0,
            hoeLevel: 1,
            endlessBest: 0
        };
        this.save();
    }

    getName() { return this.data.name; }

    getLevel() {
        return Math.floor(this.data.totalScore / 5000) + 1;
    }

    addScore(points) {
        const oldLevel = this.getLevel();
        this.data.totalScore += points;
        this.save();
        return this.getLevel() > oldLevel;
    }

    getHoeLevel() {
        return this.data.hoeLevel;
    }

    upgradeHoe(amount = 1) {
        if (this.data.hoeLevel < 999) {
            this.data.hoeLevel = Math.min(999, this.data.hoeLevel + amount);
            this.save();
            return true;
        }
        return false;
    }

    updateEndlessBest(score) {
        if (score > this.data.endlessBest) {
            this.data.endlessBest = score;
            this.save();
            return true;
        }
        return false;
    }
}

class Game {
    constructor() {
        this.user = new UserManager();
        this.sound = new SoundManager();
        this.isSwitchingUser = false;

        this.config = {
            easy: { time: 20, target: 5, baseTaps: 10, scoreMult: 1, endless: false, recHoe: 1 },
            normal: { time: 25, target: 10, baseTaps: 15, scoreMult: 2, endless: false, recHoe: 2 },
            hard: { time: 30, target: 20, baseTaps: 20, scoreMult: 3, endless: false, recHoe: 3 },
            endless: { time: 0, target: Infinity, baseTaps: 15, scoreMult: 1.5, endless: true }
        };

        this.currentMode = 'easy';
        this.state = 'login';
        this.timerInterval = null;

        this.timeLeft = 0;
        this.elapsedTime = 0;
        this.score = 0;
        this.combo = 0;
        this.harvestedCount = 0;
        this.currentTaps = 0;
        this.tapsNeeded = 10;

        this.els = {
            container: document.getElementById('game-container'),
            startScreen: document.getElementById('start-screen'),
            loginArea: document.getElementById('login-area'),
            modeSelectArea: document.getElementById('mode-select-area'),
            userInput: document.getElementById('username-input'),
            loginError: document.getElementById('login-error'),

            userStats: document.getElementById('user-stats'),
            userNameDisp: document.querySelector('.user-name-disp'),
            userLvDisp: document.querySelector('.user-lv-disp'),
            totalScoreDisp: document.getElementById('total-score-disp'),
            commonHoeDisp: document.getElementById('common-hoe-disp'),
            changeUserArea: document.getElementById('change-user-area'),
            changeUserButton: document.getElementById('change-user-button'),
            changeConfirm: document.getElementById('change-confirm'),
            confirmChangeYes: document.getElementById('confirm-change-yes'),
            confirmChangeNo: document.getElementById('confirm-change-no'),

            diffButtons: document.querySelectorAll('.btn-diff'),

            gameHeader: document.getElementById('game-header'),
            fieldArea: document.getElementById('field-area'),
            interactionArea: document.getElementById('interaction-area'),
            resultOverlay: document.getElementById('result-overlay'),

            score: document.getElementById('score-display'),
            timer: document.getElementById('timer-display'),
            timerLabel: document.getElementById('timer-label'),
            harvestCounter: document.getElementById('harvest-counter'),

            cropDisplay: document.getElementById('crop-display'),
            gaugeBar: document.getElementById('gauge-bar'),
            comboCount: document.getElementById('combo-count'),
            comboContainer: document.getElementById('combo-container'),
            actionButton: document.getElementById('action-button'),
            stopButton: document.getElementById('stop-button'),
            feedbackLayer: document.getElementById('feedback-layer'),

            resultTitle: document.getElementById('result-title'),
            finalScore: document.getElementById('final-score'),
            finalHarvest: document.getElementById('final-harvest'),
            levelupMsg: document.getElementById('levelup-message'),
            playerLevelupMsg: document.getElementById('player-levelup-message'),
            newPlayerLevel: document.getElementById('new-player-level'),
            newHoeLevel: document.getElementById('new-hoe-level'),

            failMsg: document.getElementById('fail-message'),
            rankingArea: document.getElementById('ranking-area'),
            rankingList: document.getElementById('ranking-list'),
            retryButton: document.getElementById('retry-button'),
        };

        this.init();
    }

    init() {
        const savedName = this.user.getName();
        if (savedName) {
            this.els.userInput.value = savedName;
            this.showMenu(false);
        }

        this.els.userInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') this.tryLogin();
        });

        this.els.changeUserButton.addEventListener('click', () => {
            this.openChangeConfirm();
        });
        this.els.confirmChangeYes.addEventListener('click', () => {
            this.closeChangeConfirm();
            this.startUserSwitch();
        });
        this.els.confirmChangeNo.addEventListener('click', () => {
            this.closeChangeConfirm();
        });

        this.els.diffButtons.forEach(btn => {
            btn.addEventListener('click', () => {
                this.startGame(btn.dataset.mode);
            });
        });

        this.els.actionButton.addEventListener('mousedown', (e) => {
            if (this.isPC()) {
                e.preventDefault();
                return;
            }
            this.handleTap(e);
        });
        this.els.actionButton.addEventListener('touchstart', (e) => {
            if (this.isPC()) return;
            e.preventDefault();
            this.handleTap(e);
        }, { passive: false });

        window.addEventListener('keydown', (e) => {
            if (this.state !== 'playing') return;
            if (e.code === 'Space') {
                e.preventDefault();
                if (!e.repeat) {
                    this.handleTap(e);
                    this.els.actionButton.classList.add('pressed');
                }
            }
        });
        window.addEventListener('keyup', (e) => {
            if (e.code === 'Space') {
                this.els.actionButton.classList.remove('pressed');
            }
        });

        this.els.stopButton.addEventListener('click', () => {
            if (this.state === 'playing') this.endGame(true);
        });
        this.els.retryButton.addEventListener('click', () => this.returnToMenu());

        this.sound.playBgm();
    }

    isPC() {
        return window.matchMedia('(min-width: 768px)').matches;
    }

    tryLogin() {
        const name = this.els.userInput.value;
        if (!name.trim()) {
            this.els.loginError.classList.remove('hidden');
            return;
        }
        if (this.isSwitchingUser) {
            this.user.resetForNewName(name);
            this.isSwitchingUser = false;
            this.showMenu(false);
            return;
        }
        this.user.setName(name);
        this.showMenu(true);
    }

    showMenu(isFirstLogin) {
        this.state = 'menu';
        this.isSwitchingUser = false;
        this.els.loginArea.classList.add('hidden');
        this.els.modeSelectArea.classList.remove('hidden');
        this.els.userStats.classList.remove('hidden');
        this.els.changeUserArea.classList.remove('hidden');
        this.els.changeConfirm.classList.add('hidden');

        this.updateUserStatsUI();
        this.els.loginError.classList.add('hidden');
        this.sound.play('home');
        this.sound.playBgm();
    }

    openChangeConfirm() {
        this.els.changeConfirm.classList.remove('hidden');
    }

    closeChangeConfirm() {
        this.els.changeConfirm.classList.add('hidden');
    }

    startUserSwitch() {
        this.state = 'login';
        this.isSwitchingUser = true;
        this.els.changeConfirm.classList.add('hidden');
        this.els.loginArea.classList.remove('hidden');
        this.els.modeSelectArea.classList.add('hidden');
        this.els.userStats.classList.add('hidden');
        this.els.changeUserArea.classList.add('hidden');
        this.els.userInput.value = '';
        this.els.loginError.classList.add('hidden');
        this.els.userInput.focus();
    }

    updateUserStatsUI() {
        this.els.userNameDisp.textContent = this.user.getName();
        this.els.userLvDisp.textContent = `Lv.${this.user.getLevel()}`;
        this.els.totalScoreDisp.textContent = this.user.data.totalScore.toLocaleString();
        this.els.commonHoeDisp.textContent = `Lv.${this.user.getHoeLevel()}`;
    }

    startGame(mode) {
        if (!this.user.getName()) {
            this.tryLogin();
            if (!this.user.getName()) return;
        }

        this.sound.stopBgm();
        this.currentMode = mode;
        const cfg = this.config[mode];

        // Unified Hoe Calculation
        const hoeLv = this.user.getHoeLevel();
        const reduction = (hoeLv - 1) * 2;
        this.tapsNeeded = Math.max(2, cfg.baseTaps - reduction);

        this.state = 'playing';
        this.score = 0;
        this.combo = 0;
        this.harvestedCount = 0;
        this.currentTaps = 0;
        this.elapsedTime = 0;
        this.timeLeft = (cfg.endless) ? 0 : cfg.time * 1000;

        this.els.startScreen.classList.add('hidden');
        this.els.gameHeader.classList.remove('hidden');
        this.els.fieldArea.classList.remove('hidden');
        this.els.interactionArea.classList.remove('hidden');
        this.els.resultOverlay.classList.add('hidden');

        if (cfg.endless) {
            this.els.timerLabel.textContent = "TIME";
            this.els.stopButton.classList.remove('hidden');
        } else {
            this.els.timerLabel.textContent = "OFFSET";
            this.els.stopButton.classList.add('hidden');
        }

        this.updateScoreUI();
        this.updateHarvestUI();
        this.updateTimerUI();
        this.updateGaugeUI();
        this.spawnCrop();

        if (this.timerInterval) clearInterval(this.timerInterval);
        this.timerInterval = setInterval(() => this.loop(), 10);
    }

    loop() {
        if (this.state !== 'playing') return;

        if (this.config[this.currentMode].endless) {
            this.elapsedTime += 10;
            this.updateTimerUI();
        } else {
            this.timeLeft -= 10;
            this.updateTimerUI();
            if (this.timeLeft <= 0) {
                this.endGame(false);
            }
        }
    }

    handleTap(e) {
        if (this.state !== 'playing') return;

        this.combo++;
        this.updateComboUI();
        this.score += 10;
        this.updateScoreUI();

        this.sound.play('tap');

        this.currentTaps++;
        if (this.currentTaps >= this.tapsNeeded) {
            this.harvestCrop();
        }
        this.updateGaugeUI();

        this.triggerTapEffect(e);
        if (!this.isPC()) this.animateButton();

        if (this.combo % 10 === 0) {
            this.triggerScreenShake();
        }
    }

    harvestCrop() {
        let gain = 1;
        let isTractor = false;

        // Endless Tractor Event
        if (this.config[this.currentMode].endless) {
            if (Math.random() < 0.1) { // 10% chance
                isTractor = true;
                gain = 11; // +1 Base + 10 Bonus
            }
        }

        this.harvestedCount += gain;
        this.currentTaps = 0;

        const cfg = this.config[this.currentMode];
        let bonus = Math.floor(100 * cfg.scoreMult * (1 + this.combo * 0.1));

        // Bonus for Tractor
        if (isTractor) {
            bonus *= 5; // Big score boost
            this.triggerTractorEffect();
            this.sound.play('tractor');
        } else {
            this.sound.play('harvest');
            this.triggerHarvestEffect();
        }

        this.score += bonus;

        this.updateHarvestUI();
        this.updateScoreUI();

        this.spawnCrop();
    }

    spawnCrop() {
        const crops = ['🥬', '🥕', '🥔', '🍅', '🍆', '🌽', '🥦'];
        this.els.cropDisplay.textContent = crops[Math.floor(Math.random() * crops.length)];
        this.els.cropDisplay.classList.remove('crop-bounce');
        void this.els.cropDisplay.offsetWidth;
        this.els.cropDisplay.classList.add('crop-bounce');
    }

    endGame(forceEnd) {
        clearInterval(this.timerInterval);
        this.state = 'result';

        const cfg = this.config[this.currentMode];
        const isClear = (cfg.endless) ? true : (this.harvestedCount >= cfg.target);
        const didLevelUpPlayer = this.user.addScore(this.score);

        let didLevelUpHoe = false;
        // Upgrade Hoe on Clear (if not endless)
        if (isClear && !cfg.endless) {
            let upAmount = 1;
            if (this.currentMode === 'normal') upAmount = 2;
            if (this.currentMode === 'hard') upAmount = 3;
            didLevelUpHoe = this.user.upgradeHoe(upAmount);
        }

        setTimeout(() => {
            this.showResults(isClear, didLevelUpHoe, didLevelUpPlayer);
        }, 500);
    }

    showResults(isClear, didLevelUpHoe, didLevelUpPlayer) {
        const cfg = this.config[this.currentMode];
        if (isClear || cfg.endless) {
            this.sound.play(cfg.endless ? 'finish' : 'clear');
        } else {
            this.sound.play('fail');
        }

        this.els.resultOverlay.classList.remove('hidden');
        this.els.finalScore.textContent = this.score.toLocaleString();
        this.els.finalHarvest.textContent = this.harvestedCount;

        this.els.levelupMsg.classList.add('hidden');
        this.els.playerLevelupMsg.classList.add('hidden');
        this.els.failMsg.classList.add('hidden');
        this.els.rankingArea.classList.add('hidden');

        if (isClear) {
            this.els.resultTitle.textContent = cfg.endless ? "FINISHED" : "CLEAR!!";
            this.els.resultTitle.style.color = cfg.endless ? "#9b59b6" : "#2ecc71";

            if (didLevelUpHoe) {
                this.els.newHoeLevel.textContent = this.user.getHoeLevel();
                this.els.levelupMsg.classList.remove('hidden');
            }
        } else {
            this.els.resultTitle.textContent = "TIME UP";
            this.els.resultTitle.style.color = "#e74c3c";
            this.els.failMsg.classList.remove('hidden');
        }

        if (didLevelUpPlayer) {
            this.els.newPlayerLevel.textContent = this.user.getLevel();
            this.els.playerLevelupMsg.classList.remove('hidden');
        }

        if (cfg.endless) {
            this.handleEndlessRanking();
            this.els.rankingArea.classList.remove('hidden');
        }
    }

    handleEndlessRanking() {
        const LEADERBOARD_KEY = 'agri_leaderboard_v2';

        const improved = this.user.updateEndlessBest(this.score);

        let leaderboard = [];
        try {
            const stored = localStorage.getItem(LEADERBOARD_KEY);
            if (stored) leaderboard = JSON.parse(stored);
        } catch (e) { }

        const userName = this.user.getName();
        const userBest = this.user.data.endlessBest;
        const nowStr = new Date().toLocaleDateString();

        const idx = leaderboard.findIndex(entry => entry.name === userName);
        if (idx >= 0) {
            if (leaderboard[idx].score < userBest) {
                leaderboard[idx].score = userBest;
                leaderboard[idx].date = nowStr;
            }
        } else {
            leaderboard.push({ name: userName, score: userBest, date: nowStr });
        }

        leaderboard.sort((a, b) => b.score - a.score);
        leaderboard = leaderboard.slice(0, 10);

        localStorage.setItem(LEADERBOARD_KEY, JSON.stringify(leaderboard));

        let html = '';
        leaderboard.forEach((p, index) => {
            const isMe = (p.name === userName);
            html += `
                <div class="rank-item ${isMe ? 'highlight' : ''}">
                    <span>${index + 1}. ${p.name} <small>(${p.date})</small></span>
                    <span>${p.score.toLocaleString()}</span>
                </div>
            `;
        });
        this.els.rankingList.innerHTML = html;
    }

    updateScoreUI() { this.els.score.textContent = this.score.toLocaleString(); }

    updateHarvestUI() {
        const cfg = this.config[this.currentMode];
        if (cfg.endless) {
            this.els.harvestCounter.textContent = this.harvestedCount;
        } else {
            this.els.harvestCounter.textContent = `${this.harvestedCount} / ${cfg.target}`;
        }
    }

    updateTimerUI() {
        const t = this.config[this.currentMode].endless ? this.elapsedTime : Math.max(0, this.timeLeft);
        this.els.timer.textContent = (t / 1000).toFixed(2);
    }

    updateGaugeUI() {
        const percent = Math.min(100, (this.currentTaps / this.tapsNeeded) * 100);
        this.els.gaugeBar.style.width = `${percent}%`;
    }

    updateComboUI() {
        this.els.comboCount.textContent = this.combo;
        if (this.combo > 0) {
            this.els.comboContainer.classList.remove('hidden');
            this.els.comboCount.style.transform = 'scale(1.2)';
            setTimeout(() => this.els.comboCount.style.transform = 'scale(1)', 100);
        } else {
            this.els.comboContainer.classList.add('hidden');
        }
    }

    triggerTapEffect(e) {
        const text = document.createElement('div');
        text.className = 'pop-text';
        text.textContent = 'HIT!';

        let x, y;
        if (e.type === 'keydown' || !e.clientX) {
            const rect = this.els.actionButton.getBoundingClientRect();
            x = rect.left + rect.width / 2;
            y = rect.top + rect.height / 2;
        } else if (e.touches && e.touches[0]) {
            x = e.touches[0].clientX;
            y = e.touches[0].clientY;
        } else {
            x = e.clientX;
            y = e.clientY;
        }

        x += (Math.random() - 0.5) * 60;
        y += (Math.random() - 0.5) * 60;

        text.style.left = `${x}px`;
        text.style.top = `${y}px`;
        this.els.feedbackLayer.appendChild(text);
        setTimeout(() => text.remove(), 600);
    }

    triggerTractorEffect() {
        const effect = document.createElement('div');
        effect.className = 'tractor-pop';
        effect.textContent = "🚜 +10 HARVEST!!";
        effect.style.left = '50%';
        effect.style.top = '40%';
        this.els.feedbackLayer.appendChild(effect);
        setTimeout(() => effect.remove(), 1200);
        this.triggerScreenShake();
    }

    triggerHarvestEffect() {
        const effect = document.createElement('div');
        effect.textContent = "+1 GET!";
        Object.assign(effect.style, {
            position: 'absolute', top: '40%', left: '50%', transform: 'translate(-50%, -50%)',
            fontSize: '3rem', color: '#fff', textShadow: '0 0 10px #f1c40f', fontWeight: 'bold',
            animation: 'floatUp 1s forwards', zIndex: '20'
        });
        this.els.feedbackLayer.appendChild(effect);
        setTimeout(() => effect.remove(), 1000);
        this.triggerScreenShake();
    }

    triggerScreenShake() {
        this.els.container.classList.remove('shake-screen');
        void this.els.container.offsetWidth;
        this.els.container.classList.add('shake-screen');
    }

    animateButton() {
        this.els.actionButton.style.transform = 'scale(0.95)';
        setTimeout(() => this.els.actionButton.style.transform = 'scale(1)', 50);
    }

    returnToMenu() {
        this.els.resultOverlay.classList.add('hidden');
        this.els.gameHeader.classList.add('hidden');
        this.els.fieldArea.classList.add('hidden');
        this.els.interactionArea.classList.add('hidden');
        this.els.startScreen.classList.remove('hidden');

        this.updateUserStatsUI();
        this.state = 'menu';
        this.els.changeUserArea.classList.remove('hidden');
        this.els.changeConfirm.classList.add('hidden');
        this.sound.play('home');
        this.sound.playBgm();
    }
}

window.onload = () => {
    new Game();
};
