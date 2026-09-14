function renderDomain(domain) {
  const d = DATA[domain];
  const cards = Object.entries(d.categories).map(([key, c]) => {
    const n = countQuestions(domain, key);
    const normal = findProgress(domain, key, 'normal');
    const hard = findProgress(domain, key, 'hard');
    return `<article class="category-card"><h3>${d.icon} ${c.label}</h3><div class="stars">${stars(c.level)}</div><div class="tags" style="margin-top:14px">${c.topics.map(t => `<span class="tag">${t}</span>`).join('')}</div><div class="quiz-meta"><span>문제 ${n}개</span><span>직무 레벨 ${c.level}/5</span></div><div class="mode-buttons"><button class="primary-btn" onclick="startQuiz('${domain}','${key}','normal', false)">일반 퀴즈</button><button class="hard-btn" onclick="startQuiz('${domain}','${key}','hard', false)">고난도</button></div>${normal || hard ? `<div class="resume-box">${normal ? `<button onclick="resumeQuiz('${domain}','${key}','normal')">일반 이어풀기</button>` : ''}${hard ? `<button onclick="resumeQuiz('${domain}','${key}','hard')">고난도 이어풀기</button>` : ''}</div>` : ''}</article>`;
  }).join('');
  shell(`<section class="panel"><h1 class="section-title">${d.icon} ${d.label} 퀴즈</h1><p class="small-title">직무별 카테고리를 선택하세요. 각 카테고리는 최소 20문제 이상이며 일반/고난도 모드를 지원합니다.</p></section><section class="grid category-grid" style="margin-top:18px">${cards}</section>`, domain);
}

function prepareQuestions(domain, category, mode) {
  const pool = [...QUESTIONS, ...getCustomQuestions()].filter(q => q.domain === domain && q.category === category);
  const picked = shuffle(pool).map((q, qi) => {
    const opts = q.options.map((label, i) => ({ label, correct: i === q.answer }));
    const shuffled = shuffle(opts);
    return { ...q, id: `${domain}-${category}-${mode}-${qi}`, options: shuffled.map(o => o.label), answer: shuffled.findIndex(o => o.correct) };
  });
  return picked;
}
function startQuiz(domain, category, mode='normal', resume=false) {
  requireLogin(() => {
    const saved = findProgress(domain, category, mode);
    if (saved && !resume && confirm('저장된 진행 상황이 있습니다. 이어서 풀까요?')) { quizState = saved; renderQuiz(); return; }
    quizState = { domain, category, mode, questions: prepareQuestions(domain, category, mode), index: 0, selected: null, correctCount: 0, combo: 0, maxCombo: 0, scoreGain: 0, answeredCount: 0, startedAt: Date.now(), timeLeft: mode === 'hard' ? HARD_TIME_LIMIT : null, timedOut: false };
    route = { page: 'quiz', domain, category };
    saveProgress(); renderQuiz();
  });
}
function resumeQuiz(domain, category, mode) { requireLogin(() => { quizState = findProgress(domain, category, mode); if (!quizState) return startQuiz(domain, category, mode); renderQuiz(); }); }

function renderQuiz() {
  stopTimer();
  const s = quizState; if (!s) return go('main');
  const q = s.questions[s.index]; const d = DATA[s.domain]; const c = d.categories[s.category]; const answered = s.selected !== null;
  const modeLabel = s.mode === 'hard' ? '고난도 · 시간 제한' : '일반 · 시간 제한 없음';
  shell(`<section class="quiz-card ${s.mode==='hard'?'hard-mode':''}"><div class="quiz-header"><span class="badge">${d.icon} ${d.label} / ${c.label} / ${q.difficulty}</span><span class="badge">${modeLabel}</span><span class="badge">${s.index + 1} / ${s.questions.length} · Combo ${s.combo}</span></div>${s.mode==='hard' ? `<div class="timer-wrap"><div class="timer-label">남은 시간 <strong id="timerText">${s.timeLeft}</strong>초</div><div class="timer-bar"><div id="timerFill" style="width:${(s.timeLeft / HARD_TIME_LIMIT) * 100}%"></div></div></div>` : ''}<div class="progress-bar"><div class="progress-fill" style="width:${((s.index + 1) / s.questions.length) * 100}%"></div></div><div class="question">Q. ${escapeHtml(q.q)}</div><div class="options">${q.options.map((op, i) => { let cls = ''; if (answered && i === q.answer) cls = 'correct'; if (answered && i === s.selected && i !== q.answer) cls = 'wrong'; return `<button class="option ${cls}" ${answered ? 'disabled' : ''} onclick="selectAnswer(${i})">${String.fromCharCode(65+i)}. ${escapeHtml(op)}</button>`; }).join('')}</div>${answered ? `<div class="explanation"><strong>${s.timedOut ? '⏰ 시간 초과' : '🎯 정답'}: ${String.fromCharCode(65+q.answer)}</strong><br/>${escapeHtml(q.explanation)}</div>` : ''}<div class="row" style="margin-top:20px">${answered ? `<button class="primary-btn" onclick="nextQuestion()">${s.index === s.questions.length - 1 ? '결과 보기' : '다음 문제'}</button>` : `<button class="ghost-btn" onclick="saveAndExit()">중간 저장 후 나가기</button>`}<button class="ghost-btn" onclick="saveAndExit()">카테고리로</button></div></section>`, 'quiz');
  if (s.mode === 'hard' && !answered) startTimer();
}
function startTimer() {
  timerId = setInterval(() => {
    if (!quizState || quizState.selected !== null) return stopTimer();
    quizState.timeLeft -= 1;
    const text = document.querySelector('#timerText'); const fill = document.querySelector('#timerFill');
    if (text) text.textContent = quizState.timeLeft;
    if (fill) fill.style.width = Math.max(0, (quizState.timeLeft / HARD_TIME_LIMIT) * 100) + '%';
    saveProgress();
    if (quizState.timeLeft <= 0) { stopTimer(); timeoutAnswer(); }
  }, 1000);
}
function timeoutAnswer() { if (!quizState || quizState.selected !== null) return; quizState.timedOut = true; applyAnswer(-1); }
function selectAnswer(i) { if (!quizState || quizState.selected !== null) return; quizState.timedOut = false; applyAnswer(i); }
function applyAnswer(i) {
  const s = quizState; const q = s.questions[s.index]; s.selected = i; stopTimer();
  const user = getUser(); const isCorrect = i === q.answer;
  const base = s.mode === 'hard' ? 20 : 10; const comboBonus = isCorrect ? Math.min(s.combo * (s.mode === 'hard' ? 3 : 2), s.mode === 'hard' ? 18 : 10) : 0; const timeBonus = isCorrect && s.mode === 'hard' ? Math.max(0, s.timeLeft) : 0; const gain = isCorrect ? base + comboBonus + timeBonus : 0;
  if (isCorrect) { s.correctCount++; s.combo++; } else { s.combo = 0; } s.maxCombo = Math.max(s.maxCombo, s.combo); s.scoreGain += gain; s.answeredCount = (s.answeredCount || 0) + 1;
  user.score += gain; user.solved += 1; user.correct += isCorrect ? 1 : 0; user.bestCombo = Math.max(user.bestCombo, s.combo); user.lastDomain = DATA[s.domain].label;
  user.history.unshift({ date: new Date().toLocaleString('ko-KR'), domain: DATA[s.domain].label, domainKey: s.domain, category: DATA[s.domain].categories[s.category].label, categoryKey: s.category, mode: s.mode === 'hard' ? '고난도' : '일반', difficulty: q.difficulty, question: q.q, selectedLabel: i >= 0 ? q.options[i] : '시간 초과', answerLabel: q.options[q.answer], explanation: q.explanation, correct: isCorrect, gain });
  user.history = user.history.slice(0, 60); user.achievements = calcAchievements(user); saveUser(user); updateRanking(user); saveProgress(); renderQuiz();
}
function nextQuestion() {
  if (quizState.index < quizState.questions.length - 1) { quizState.index++; quizState.selected = null; quizState.timedOut = false; quizState.timeLeft = quizState.mode === 'hard' ? HARD_TIME_LIMIT : null; saveProgress(); renderQuiz(); } else { const d=quizState.domain,c=quizState.category,m=quizState.mode; clearProgress(d,c,m); renderResult(); }
}
function saveAndExit() { saveProgress(); goDomain(quizState.domain); }
function renderResult() {
  const s = quizState; const user = getUser();
  shell(`<section class="panel"><h1 class="section-title">퀴즈 완료 🎉</h1><div class="stat-strip"><div class="stat-card"><div class="label">이번 정답</div><div class="value">${s.correctCount}/${s.questions.length}</div></div><div class="stat-card"><div class="label">획득 점수</div><div class="value">+${s.scoreGain}</div></div><div class="stat-card"><div class="label">최고 콤보</div><div class="value">${s.maxCombo}</div></div><div class="stat-card"><div class="label">현재 레벨</div><div class="value">Lv. ${levelFromScore(user.score)}</div></div></div><div class="row" style="margin-top:22px"><button class="primary-btn" onclick="startQuiz('${s.domain}','${s.category}','${s.mode}', false)">다시 풀기</button><button class="ghost-btn" onclick="goDomain('${s.domain}')">다른 직무 선택</button><button class="ghost-btn" onclick="go('mypage')">마이페이지</button></div></section>`, 'quiz');
}

function domainKeyFromLabel(label) {
  return Object.keys(DATA).find(k => DATA[k].label === label) || null;
}
function categoryKeyFromLabel(domainKey, label) {
  if (!domainKey) return null;
  return Object.keys(DATA[domainKey].categories).find(k => DATA[domainKey].categories[k].label === label) || null;
}
function getHistory(user) { return Array.isArray(user.history) ? user.history : []; }
function getSubjectStats(user) {
  const stats = [];
  Object.entries(DATA).forEach(([domainKey, domain]) => {
    Object.entries(domain.categories).forEach(([categoryKey, category]) => {
      stats.push({ domainKey, categoryKey, domain: domain.label, category: category.label, label: `${domain.label} ${category.label}`, solved: 0, correct: 0, wrong: 0 });
    });
  });
  const byKey = Object.fromEntries(stats.map(s => [`${s.domainKey}:${s.categoryKey}`, s]));
  getHistory(user).forEach(h => {
    const domainKey = h.domainKey || domainKeyFromLabel(h.domain);
    const categoryKey = h.categoryKey || categoryKeyFromLabel(domainKey, h.category);
    const key = `${domainKey}:${categoryKey}`;
    if (!byKey[key]) return;
    byKey[key].solved += 1;
    byKey[key].correct += h.correct ? 1 : 0;
    byKey[key].wrong += h.correct ? 0 : 1;
  });
  return stats.map(s => ({...s, correctRate: percent(s.correct, s.solved), wrongRate: percent(s.wrong, s.solved)}));
}
function getDomainStats(user) {
  return Object.entries(DATA).map(([domainKey, domain]) => {
    const rows = getSubjectStats(user).filter(s => s.domainKey === domainKey);
    const solved = rows.reduce((a,b)=>a+b.solved,0);
    const correct = rows.reduce((a,b)=>a+b.correct,0);
    const wrong = rows.reduce((a,b)=>a+b.wrong,0);
    return { domainKey, label: domain.label, solved, correct, wrong, correctRate: percent(correct, solved), wrongRate: percent(wrong, solved) };
  });
}
function chartRows(stats, metric='correctRate') {
  const active = stats.filter(s => s.solved > 0).sort((a,b) => b[metric] - a[metric]);
  if (!active.length) return `<p class="empty">아직 그래프로 표시할 풀이 기록이 없습니다. 퀴즈를 풀면 자동으로 분석됩니다.</p>`;
  return active.map(s => `<div class="bar-row"><div class="bar-label"><strong>${escapeHtml(s.label)}</strong><span>${s.correct}/${s.solved} 정답 · ${s.wrong} 오답</span></div><div class="bar-track"><div class="bar-fill ${metric === 'wrongRate' ? 'wrong-fill' : ''}" style="width:${s[metric]}%"></div></div><div class="bar-value">${s[metric]}%</div></div>`).join('');
}
function renderAnalysis() {
  const user = getUser();
  const subjectStats = getSubjectStats(user);
  const domainStats = getDomainStats(user);
  const strongest = subjectStats.filter(s => s.solved > 0).sort((a,b) => b.correctRate - a.correctRate || b.solved - a.solved)[0];
  const weakest = subjectStats.filter(s => s.solved > 0).sort((a,b) => b.wrongRate - a.wrongRate || b.solved - a.solved)[0];
  const domainCards = domainStats.map(d => `<div class="stat-card"><div class="label">${escapeHtml(d.label)} 정답률</div><div class="value">${d.correctRate}%</div><div class="mini-muted">${d.correct}/${d.solved} 정답 · ${d.wrong} 오답</div></div>`).join('');
  const domainStack = domainStats.map(d => `<div class="stack-line"><div class="bar-label"><strong>${escapeHtml(d.label)}</strong><span>${d.solved ? `${d.correctRate}% / ${d.wrongRate}%` : '기록 없음'}</span></div><div class="stacked-bar"><span class="correct-part" style="width:${d.correctRate}%"></span><span class="wrong-part" style="width:${d.wrongRate}%"></span></div></div>`).join('');
  shell(`<section class="panel"><h1 class="section-title">학습 분석 대시보드</h1><p class="small-title">풀이 기록을 기준으로 분야·직무별 정답률과 오답률을 자동 집계합니다.</p><div class="stat-strip">${domainCards}<div class="stat-card"><div class="label">강점 과목</div><div class="value small-value">${strongest ? escapeHtml(strongest.label) : '-'}</div></div><div class="stat-card"><div class="label">복습 우선</div><div class="value small-value">${weakest ? escapeHtml(weakest.label) : '-'}</div></div></div></section><div class="grid two-col" style="margin-top:18px"><section class="panel chart-card"><h2 class="section-title">직무별 정답률 TOP</h2>${chartRows(subjectStats, 'correctRate')}</section><section class="panel chart-card"><h2 class="section-title">직무별 오답률 TOP</h2>${chartRows(subjectStats, 'wrongRate')}</section></div><section class="panel chart-card" style="margin-top:18px"><h2 class="section-title">분야별 정답/오답 비율</h2><div class="legend"><span><i class="legend-dot correct-dot"></i>정답률</span><span><i class="legend-dot wrong-dot"></i>오답률</span></div>${domainStack}</section>`, 'analysis');
}
function renderWrongNote() {
  const user = getUser();
  const wrongs = getHistory(user).filter(h => !h.correct);
  const cards = wrongs.length ? wrongs.map((h, idx) => {
    const domainKey = h.domainKey || domainKeyFromLabel(h.domain);
    const categoryKey = h.categoryKey || categoryKeyFromLabel(domainKey, h.category);
    const retry = domainKey && categoryKey ? `<button class="ghost-btn" onclick="startQuiz('${domainKey}','${categoryKey}','normal', false)">관련 퀴즈 다시 풀기</button>` : '';
    return `<article class="wrong-card"><div class="wrong-top"><span class="badge">${escapeHtml(h.domain || '-')} / ${escapeHtml(h.category || '-')} / ${escapeHtml(h.mode || '일반')}</span><span class="small-title">${escapeHtml(h.date || '')}</span></div><h3>Q. ${escapeHtml(h.question || '이전 기록의 문항 정보가 없습니다.')}</h3><div class="answer-grid"><div><span class="small-title">내 답</span><strong class="wrong-text">${escapeHtml(h.selectedLabel || '이전 기록')}</strong></div><div><span class="small-title">정답</span><strong class="correct-text">${escapeHtml(h.answerLabel || '이전 기록')}</strong></div></div><p class="note-explain">${escapeHtml(h.explanation || '이전 버전에서 저장된 기록이라 해설 정보가 없습니다. 관련 직무 퀴즈를 다시 풀며 복습해보세요.')}</p><div class="row">${retry}<button class="link-btn" onclick="removeWrong(${idx})">이 오답 지우기</button></div></article>`;
  }).join('') : `<section class="panel"><p class="empty">아직 오답이 없습니다. 틀린 문제가 생기면 이곳에 자동으로 모입니다.</p></section>`;
  shell(`<section class="panel"><h1 class="section-title">오답노트</h1><p class="small-title">틀린 문제만 모아 내 답, 정답, 해설을 한 번에 복습할 수 있습니다.</p><div class="row"><span class="tag">총 오답 ${wrongs.length}개</span><button class="ghost-btn" onclick="go('analysis')">학습 분석 보기</button>${wrongs.length ? `<button class="danger-btn primary-btn" onclick="clearWrongNote()">오답노트 비우기</button>` : ''}</div></section><div class="wrong-list">${cards}</div>`, 'wrongnote');
}
function removeWrong(idx) {
  const user = getUser();
  const wrongs = getHistory(user).filter(h => !h.correct);
  const target = wrongs[idx];
  if (!target) return;
  let removed = false;
  user.history = getHistory(user).filter(h => {
    if (!removed && h === target) { removed = true; return false; }
    return true;
  });
  saveUser(user); renderWrongNote();
}
function clearWrongNote() {
  if (!confirm('오답 기록만 삭제할까요? 전체 학습 기록 중 정답 기록은 유지됩니다.')) return;
  const user = getUser();
  user.history = getHistory(user).filter(h => h.correct);
  saveUser(user); renderWrongNote();
}

