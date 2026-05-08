const DATA_URL = "data/questions.json";
const HISTORY_KEY = "upp_exam_history_v1";
const SETTINGS_KEY = "upp_exam_settings_v1";

const LEVEL_LABELS = {
  effective: "Risposta efficace",
  medium: "Risposta mediamente efficace",
  ineffective: "Risposta non efficace",
};

const state = {
  questions: [],
  exam: null,
  timerId: null,
};

const els = {
  questionCount: document.querySelector("#question-count"),
  setupView: document.querySelector("#setup-view"),
  examView: document.querySelector("#exam-view"),
  resultsView: document.querySelector("#results-view"),
  questionTotal: document.querySelector("#question-total"),
  examMinutes: document.querySelector("#exam-minutes"),
  startExam: document.querySelector("#start-exam"),
  clearHistory: document.querySelector("#clear-history"),
  historyList: document.querySelector("#history-list"),
  currentNumber: document.querySelector("#current-number"),
  totalNumber: document.querySelector("#total-number"),
  sourceQuestionId: document.querySelector("#source-question-id"),
  progressBar: document.querySelector("#progress-bar"),
  timer: document.querySelector("#timer"),
  questionText: document.querySelector("#question-text"),
  answerList: document.querySelector("#answer-list"),
  prevQuestion: document.querySelector("#prev-question"),
  nextQuestion: document.querySelector("#next-question"),
  finishExam: document.querySelector("#finish-exam"),
  scoreTitle: document.querySelector("#score-title"),
  resultTime: document.querySelector("#result-time"),
  resultEffective: document.querySelector("#result-effective"),
  resultMedium: document.querySelector("#result-medium"),
  resultIneffective: document.querySelector("#result-ineffective"),
  resultEmpty: document.querySelector("#result-empty"),
  reviewList: document.querySelector("#review-list"),
  newExam: document.querySelector("#new-exam"),
};

function shuffle(items) {
  const copy = [...items];
  for (let index = copy.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1));
    [copy[index], copy[swapIndex]] = [copy[swapIndex], copy[index]];
  }
  return copy;
}

function showView(view) {
  [els.setupView, els.examView, els.resultsView].forEach((item) => {
    item.classList.toggle("active", item === view);
  });
}

function formatTime(totalSeconds) {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

function getHistory() {
  try {
    return JSON.parse(localStorage.getItem(HISTORY_KEY)) || [];
  } catch {
    return [];
  }
}

function saveHistory(item) {
  const history = [item, ...getHistory()].slice(0, 50);
  localStorage.setItem(HISTORY_KEY, JSON.stringify(history));
}

function getSettings() {
  try {
    return JSON.parse(localStorage.getItem(SETTINGS_KEY)) || {};
  } catch {
    return {};
  }
}

function saveSettings(settings) {
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
}

function renderHistory() {
  const history = getHistory();
  if (!history.length) {
    els.historyList.innerHTML = '<p class="history-empty">Nessuna prova salvata.</p>';
    return;
  }

  els.historyList.innerHTML = history
    .map((item) => {
      const date = new Date(item.date).toLocaleString("it-IT", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      });
      return `
        <div class="history-item">
          <strong>${item.score}/${item.maxScore} punti (${item.percent}%)</strong>
          <small>${date} · ${item.questionCount} domande · ${formatTime(item.usedSeconds)}</small>
        </div>
      `;
    })
    .join("");
}

function createExam(questionCount, minutes) {
  const selectedQuestions = shuffle(state.questions)
    .slice(0, questionCount)
    .map((question) => ({
      ...question,
      answers: shuffle(question.answers),
      selectedLevel: null,
    }));

  return {
    questions: selectedQuestions,
    currentIndex: 0,
    totalSeconds: minutes * 60,
    remainingSeconds: minutes * 60,
    startedAt: Date.now(),
    finished: false,
  };
}

function renderQuestion() {
  const exam = state.exam;
  const question = exam.questions[exam.currentIndex];
  const answered = exam.questions.filter((item) => item.selectedLevel !== null).length;

  els.currentNumber.textContent = String(exam.currentIndex + 1);
  els.totalNumber.textContent = String(exam.questions.length);
  els.sourceQuestionId.textContent = String(question.id);
  els.progressBar.style.width = `${(answered / exam.questions.length) * 100}%`;
  els.questionText.textContent = question.question;
  els.prevQuestion.disabled = exam.currentIndex === 0;
  els.nextQuestion.disabled = exam.currentIndex === exam.questions.length - 1;

  els.answerList.innerHTML = "";
  question.answers.forEach((answer) => {
    const button = document.createElement("button");
    button.className = "answer-option";
    button.type = "button";
    button.textContent = answer.text;
    button.classList.toggle("selected", question.selectedLevel === answer.level);
    button.addEventListener("click", () => {
      question.selectedLevel = answer.level;
      renderQuestion();
    });
    els.answerList.appendChild(button);
  });
}

function tickTimer() {
  const exam = state.exam;
  const elapsed = Math.floor((Date.now() - exam.startedAt) / 1000);
  exam.remainingSeconds = Math.max(0, exam.totalSeconds - elapsed);
  els.timer.textContent = formatTime(exam.remainingSeconds);

  if (exam.remainingSeconds === 0) {
    finishExam();
  }
}

function startTimer() {
  clearInterval(state.timerId);
  tickTimer();
  state.timerId = setInterval(tickTimer, 1000);
}

function scoreExam() {
  const questions = state.exam.questions;
  const totals = {
    score: 0,
    effective: 0,
    medium: 0,
    ineffective: 0,
    empty: 0,
  };

  questions.forEach((question) => {
    if (question.selectedLevel === null) {
      totals.empty += 1;
      return;
    }
    const selected = question.answers.find((answer) => answer.level === question.selectedLevel);
    totals.score += selected.score;
    totals[question.selectedLevel] += 1;
  });

  return totals;
}

function renderResults(totals, usedSeconds) {
  const maxScore = state.exam.questions.length;
  const percent = Math.round((totals.score / maxScore) * 100);

  els.scoreTitle.textContent = `${totals.score}/${maxScore} punti`;
  els.resultTime.textContent = formatTime(usedSeconds);
  els.resultEffective.textContent = String(totals.effective);
  els.resultMedium.textContent = String(totals.medium);
  els.resultIneffective.textContent = String(totals.ineffective);
  els.resultEmpty.textContent = String(totals.empty);

  els.reviewList.innerHTML = state.exam.questions
    .map((question, index) => {
      const selected = question.selectedLevel
        ? question.answers.find((answer) => answer.level === question.selectedLevel)
        : null;
      const effective = question.answers.find((answer) => answer.level === "effective");
      const selectedClass = selected ? selected.level : "empty";
      const selectedText = selected ? selected.text : "Risposta non data";
      const selectedLabel = selected ? LEVEL_LABELS[selected.level] : "Non data";
      const correction =
        selected?.level === "effective"
          ? ""
          : `<p class="answer-review effective"><small>Risposta efficace</small>${effective.text}</p>`;

      return `
        <article class="review-card">
          <h3>${index + 1}. Domanda ${question.id}</h3>
          <p>${question.question}</p>
          <p class="answer-review ${selectedClass}"><small>${selectedLabel}</small>${selectedText}</p>
          ${correction}
        </article>
      `;
    })
    .join("");

  saveHistory({
    date: new Date().toISOString(),
    score: totals.score,
    maxScore,
    percent,
    questionCount: maxScore,
    usedSeconds,
    effective: totals.effective,
    medium: totals.medium,
    ineffective: totals.ineffective,
    empty: totals.empty,
  });
  renderHistory();
}

function finishExam() {
  if (!state.exam || state.exam.finished) {
    return;
  }
  state.exam.finished = true;
  clearInterval(state.timerId);
  const usedSeconds = Math.min(
    state.exam.totalSeconds,
    Math.floor((Date.now() - state.exam.startedAt) / 1000)
  );
  const totals = scoreExam();
  renderResults(totals, usedSeconds);
  showView(els.resultsView);
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function startExam() {
  const requestedQuestions = Number.parseInt(els.questionTotal.value, 10);
  const requestedMinutes = Number.parseInt(els.examMinutes.value, 10);
  const questionCount = Math.min(Math.max(requestedQuestions || 1, 1), state.questions.length);
  const minutes = Math.min(Math.max(requestedMinutes || 1, 1), 300);

  els.questionTotal.value = String(questionCount);
  els.examMinutes.value = String(minutes);
  saveSettings({ questionCount, minutes });

  state.exam = createExam(questionCount, minutes);
  showView(els.examView);
  renderQuestion();
  startTimer();
  window.scrollTo({ top: 0, behavior: "smooth" });
}

async function loadQuestions() {
  const response = await fetch(DATA_URL);
  if (!response.ok) {
    throw new Error("Banca dati non caricata");
  }
  state.questions = await response.json();
  els.questionCount.textContent = `${state.questions.length} domande`;
  els.questionTotal.max = String(state.questions.length);

  const settings = getSettings();
  if (settings.questionCount) {
    els.questionTotal.value = String(Math.min(settings.questionCount, state.questions.length));
  }
  if (settings.minutes) {
    els.examMinutes.value = String(settings.minutes);
  }
}

function bindEvents() {
  els.startExam.addEventListener("click", startExam);
  els.prevQuestion.addEventListener("click", () => {
    state.exam.currentIndex -= 1;
    renderQuestion();
  });
  els.nextQuestion.addEventListener("click", () => {
    state.exam.currentIndex += 1;
    renderQuestion();
  });
  els.finishExam.addEventListener("click", finishExam);
  els.newExam.addEventListener("click", () => {
    showView(els.setupView);
    window.scrollTo({ top: 0, behavior: "smooth" });
  });
  els.clearHistory.addEventListener("click", () => {
    localStorage.removeItem(HISTORY_KEY);
    renderHistory();
  });
}

async function init() {
  bindEvents();
  renderHistory();
  try {
    await loadQuestions();
  } catch (error) {
    els.questionCount.textContent = "Errore dati";
    els.setupView.querySelector(".panel").insertAdjacentHTML(
      "beforeend",
      `<p class="history-empty">Impossibile caricare la banca dati. Pubblica l'app o avviala da un server locale.</p>`
    );
    els.startExam.disabled = true;
  }

  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.register("sw.js").catch(() => {});
  }
}

init();
