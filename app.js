const STORAGE_KEY = 'jobQuizUserV2';
const RANKING_KEY = 'jobQuizRankingV2';
const PROGRESS_KEY = 'jobQuizProgressV2';
const CUSTOM_QUESTION_KEY = 'jobQuizCustomQuestionsV2';
const COMMUNITY_KEY = 'jobQuizCommunityV2';
const HARD_TIME_LIMIT = 15;
const app = document.querySelector('#app');
let route = { page: 'main', domain: null, category: null };
let quizState = null;
let timerId = null;

function getUser() { return JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null'); }
function saveUser(user) { localStorage.setItem(STORAGE_KEY, JSON.stringify(user)); }
function getCustomQuestions() {
  // 현재는 백엔드 없이 브라우저별 저장소를 사용합니다.
  return JSON.parse(localStorage.getItem(CUSTOM_QUESTION_KEY) || '[]');
}
function saveCustomQuestions(questions) { localStorage.setItem(CUSTOM_QUESTION_KEY, JSON.stringify(questions)); }
function getPosts() { return JSON.parse(localStorage.getItem(COMMUNITY_KEY) || '[]'); }
function savePosts(posts) { localStorage.setItem(COMMUNITY_KEY, JSON.stringify(posts)); }
function guestUser() { return { name: 'Guest', score: 2450, solved: 20, correct: 15, bestCombo: 4, lastDomain: '전체', history: [], achievements: [] }; }
function levelFromScore(score) { return Math.max(1, Math.floor(score / 350) + 1); }
function stars(n) { return '★★★★★'.slice(0,n) + '☆☆☆☆☆'.slice(0, 5 - n); }
function percent(a,b) { return b ? Math.round((a / b) * 100) : 0; }
function escapeHtml(str) { return String(str).replace(/[&<>'"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c])); }
function shuffle(arr) { return [...arr].sort(() => Math.random() - .5); }
function countQuestions(domain, category) { return [...QUESTIONS, ...getCustomQuestions()].filter(q => q.domain === domain && q.category === category).length; }
function progressKey(domain, category, mode) { return `${domain}:${category}:${mode}`; }
function getProgressMap() { return JSON.parse(localStorage.getItem(PROGRESS_KEY) || '{}'); }
function saveProgress() { if (!quizState) return; const map = getProgressMap(); map[progressKey(quizState.domain, quizState.category, quizState.mode)] = {...quizState, startedAt: quizState.startedAt || Date.now(), timeLeft: quizState.timeLeft}; localStorage.setItem(PROGRESS_KEY, JSON.stringify(map)); }
function clearProgress(domain, category, mode) { const map = getProgressMap(); delete map[progressKey(domain, category, mode)]; localStorage.setItem(PROGRESS_KEY, JSON.stringify(map)); }
function findProgress(domain, category, mode) { return getProgressMap()[progressKey(domain, category, mode)] || null; }
function stopTimer() { if (timerId) clearInterval(timerId); timerId = null; }

function getRanking() {
  const base = [
    { name: 'OLED마스터', score: 4380, domain: '디스플레이' },
    { name: 'Etch장인', score: 3920, domain: '반도체' },
    { name: 'TFT취준생', score: 3180, domain: '디스플레이' },
    { name: 'YieldPro', score: 2710, domain: '반도체' }
  ];
  const stored = JSON.parse(localStorage.getItem(RANKING_KEY) || '[]');
  return [...stored, ...base].sort((a, b) => b.score - a.score).slice(0, 10);
}
function updateRanking(user) {
  const list = JSON.parse(localStorage.getItem(RANKING_KEY) || '[]').filter(x => x.name !== user.name);
  list.push({ name: user.name, score: user.score, domain: user.lastDomain || '전체' });
  localStorage.setItem(RANKING_KEY, JSON.stringify(list));
}

function nav(active = route.page) {
  const user = getUser();
  return `<div class="nav">
    <button class="logo" onclick="go('main')" style="border:0;background:none;color:inherit;padding:0"><span class="logo-mark">Q</span><span>Job Skill Quiz</span></button>
    <div class="nav-links">
      <button class="${active==='main'?'active':''}" onclick="go('main')">메인</button>
      <button class="${active==='display'?'active':''}" onclick="goDomain('display')">디스플레이</button>
      <button class="${active==='semiconductor'?'active':''}" onclick="goDomain('semiconductor')">반도체</button>
      <button class="${active==='mypage'?'active':''}" onclick="requireLogin(()=>go('mypage'))">마이페이지</button>
      <button class="${active==='wrongnote'?'active':''}" onclick="requireLogin(()=>go('wrongnote'))">오답노트</button>
      <button class="${active==='analysis'?'active':''}" onclick="requireLogin(()=>go('analysis'))">학습분석</button>
      <button class="${active==='create'?'active':''}" onclick="requireLogin(()=>go('create'))">문제 만들기</button>
      <button class="${active==='community'?'active':''}" onclick="go('community')">커뮤니티</button>
      <button class="${active==='ranking'?'active':''}" onclick="go('ranking')">랭킹</button>
      ${user ? `<button class="danger-btn" onclick="logout()">로그아웃</button>` : `<button onclick="go('login')">로그인</button>`}
    </div>
  </div>`;
}
function shell(content, active) { stopTimer(); app.innerHTML = `<main class="app-shell">${nav(active)}${content}</main>`; }

function renderMain() {
  const user = getUser() || guestUser();
  const savedCount = Object.keys(getProgressMap()).length;
  shell(`<section class="hero"><div class="hero-content">
    <h1>반도체·디스플레이<br/>취업 퀴즈</h1>
    <p>“게임하면서 직무 역량을 키워보세요!”</p>
    <div class="hero-actions"><button class="big-choice display" onclick="goDomain('display')">디스플레이</button><button class="big-choice semi" onclick="goDomain('semiconductor')">반도체</button></div>
    <div class="stat-strip"><div class="stat-card"><div class="label">나의 레벨</div><div class="value">Lv. ${levelFromScore(user.score)}</div></div><div class="stat-card"><div class="label">누적 점수</div><div class="value">${user.score.toLocaleString()}</div></div><div class="stat-card"><div class="label">정답률</div><div class="value">${percent(user.correct, user.solved)}%</div></div><div class="stat-card"><div class="label">저장된 퀴즈</div><div class="value">${savedCount}</div></div></div>
  </div></section>
  <div class="grid two-col" style="margin-top:18px"><section class="panel"><h2 class="section-title">새로 추가된 기능</h2><p class="small-title">직무별 문제 확장, 이어풀기, 고난도 모드에 더해 오답노트와 학습 분석 그래프를 추가했습니다.</p><div class="row"><span class="tag">일반 모드: 시간 제한 없음</span><span class="tag">고난도: 문제당 15초</span><span class="tag">중간 저장</span><span class="tag">오답노트</span><span class="tag">정답률 그래프</span></div></section><section class="panel"><h2 class="section-title">게임 규칙</h2><p>일반 정답 +10점, 고난도 정답 +20점입니다. 연속 정답 시 콤보 보너스가 붙고, 해설은 면접 답변 수준으로 제공합니다.</p></section></div>`, 'main');
}

function renderAuth(mode) {
  const isLogin = mode === 'login';
  app.innerHTML = `<main class="app-shell auth-wrap"><section class="auth-card"><h1>${isLogin ? '로그인' : '회원가입'}</h1><p>${isLogin ? '학습 기록, 점수, 레벨을 저장하세요.' : '취업 퀴즈 여정을 시작하세요.'}</p><form onsubmit="handleAuth(event, '${mode}')">${!isLogin ? `<div class="form-group"><label>닉네임</label><input name="name" required placeholder="예: OLED마스터" /></div>` : ''}<div class="form-group"><label>이메일</label><input name="email" type="email" required placeholder="job@example.com" /></div><div class="form-group"><label>비밀번호</label><input name="password" type="password" required placeholder="4자 이상" minlength="4" /></div><button class="full-btn primary-btn" type="submit">${isLogin ? '로그인' : '회원가입'}</button></form><p class="footer-note">${isLogin ? '계정이 없나요?' : '이미 계정이 있나요?'} <button class="link-btn" onclick="go('${isLogin ? 'signup' : 'login'}')">${isLogin ? '회원가입' : '로그인'}</button></p><button class="link-btn" onclick="go('main')">메인으로 돌아가기</button></section></main>`;
}

function renderMypage() {
  const user = getUser();
  const historyRows = user.history.length ? user.history.map(h => `<tr><td>${h.date}</td><td>${h.domain}</td><td>${h.category}</td><td>${h.mode || '일반'}</td><td>${h.correct ? '정답' : '오답'}</td><td>+${h.gain}</td></tr>`).join('') : `<tr><td colspan="6" class="empty">아직 학습 기록이 없습니다.</td></tr>`;
  const saved = Object.entries(getProgressMap()).map(([k,v]) => `<div class="achievement"><strong>${DATA[v.domain].label} / ${DATA[v.domain].categories[v.category].label} / ${v.mode==='hard'?'고난도':'일반'}</strong><span>${v.index+1}/${v.questions.length}</span><button class="link-btn" onclick="resumeQuiz('${v.domain}','${v.category}','${v.mode}')">이어풀기</button></div>`).join('') || '<p class="small-title">저장된 퀴즈가 없습니다.</p>';
  shell(`<div class="grid two-col"><section class="panel"><h1 class="section-title">${escapeHtml(user.name)}님의 마이페이지</h1><div class="stat-strip"><div class="stat-card"><div class="label">점수</div><div class="value">${user.score.toLocaleString()}</div></div><div class="stat-card"><div class="label">레벨</div><div class="value">Lv. ${levelFromScore(user.score)}</div></div><div class="stat-card"><div class="label">정답률</div><div class="value">${percent(user.correct, user.solved)}%</div></div><div class="stat-card"><div class="label">최고 콤보</div><div class="value">${user.bestCombo}</div></div></div><h2 class="section-title" style="font-size:22px;margin-top:24px">직무별 레벨</h2><p>공정 <span class="stars">★★★★☆</span></p><p>장비 <span class="stars">★★★☆☆</span></p><p>소자 <span class="stars">★★★★☆</span></p><p>품질 <span class="stars">★★☆☆☆</span></p></section><section class="panel"><h2 class="section-title">업적</h2><div class="achievement-list">${achievementView(user).join('')}</div><h2 class="section-title" style="font-size:22px;margin-top:24px">중간 저장</h2><div class="achievement-list">${saved}</div></section></div><section class="panel" style="margin-top:18px"><h2 class="section-title">학습 기록</h2><table class="table"><thead><tr><th>일시</th><th>분야</th><th>직무</th><th>모드</th><th>결과</th><th>점수</th></tr></thead><tbody>${historyRows}</tbody></table></section>`, 'mypage');
}
function renderRanking() { const rows = getRanking().map((r, i) => `<tr><td>${i+1}</td><td>${escapeHtml(r.name)}</td><td>${r.domain}</td><td>${r.score.toLocaleString()}</td></tr>`).join(''); shell(`<section class="panel"><h1 class="section-title">랭킹</h1><p class="small-title">전체 / 디스플레이 / 반도체 점수를 기준으로 경쟁할 수 있습니다.</p><table class="table"><thead><tr><th>순위</th><th>닉네임</th><th>대표 분야</th><th>점수</th></tr></thead><tbody>${rows}</tbody></table></section>`, 'ranking'); }
function calcAchievements(user) { const a = []; if (user.history.some(h => h.domain === '디스플레이')) a.push('OLED 마스터'); if (user.history.some(h => h.category === '공정')) a.push('공정 입문자'); if (user.history.filter(h => h.domain === '반도체' && h.category === '공정' && h.correct).length >= 5) a.push('반도체 공정 전문가'); if (user.bestCombo >= 10) a.push('10문제 연속 정답'); if (user.history.some(h => h.mode === '고난도' && h.correct)) a.push('타임어택 도전자'); return [...new Set(a)]; }
function achievementView(user) { const all = ['OLED 마스터', '공정 입문자', '반도체 공정 전문가', '10문제 연속 정답', '타임어택 도전자']; return all.map(name => `<div class="achievement ${user.achievements.includes(name) ? '' : 'locked'}"><strong>${name}</strong><span>${user.achievements.includes(name) ? '달성' : '잠김'}</span></div>`); }
function handleAuth(e, mode) { e.preventDefault(); const form = new FormData(e.target); const email = form.get('email'); const password = form.get('password'); let user = getUser(); if (mode === 'signup' || !user) { user = { name: form.get('name') || email.split('@')[0], email, password, score: 0, solved: 0, correct: 0, bestCombo: 0, lastDomain: '전체', history: [], achievements: [] }; } else if (user.email !== email || user.password !== password) { alert('저장된 계정과 일치하지 않습니다. 데모 버전에서는 같은 브라우저에서 가입한 계정으로 로그인하세요.'); return; } saveUser(user); go('main'); }
function logout() { localStorage.removeItem(STORAGE_KEY); go('main'); }
function requireLogin(next) { if (!getUser()) go('login'); else next(); }
function go(page) { stopTimer(); route = { page, domain: null, category: null }; if (page === 'main') renderMain(); if (page === 'login') renderAuth('login'); if (page === 'signup') renderAuth('signup'); if (page === 'mypage') requireLogin(renderMypage); if (page === 'wrongnote') requireLogin(renderWrongNote); if (page === 'analysis') requireLogin(renderAnalysis); if (page === 'create') requireLogin(renderCreateQuestion); if (page === 'community') renderCommunity(); if (page === 'ranking') renderRanking(); }
function goDomain(domain) { stopTimer(); route = { page: domain, domain, category: null }; renderDomain(domain); }
renderMain();
