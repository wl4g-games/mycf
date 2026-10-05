function required(root, selector) {
  const element = root.querySelector(selector);
  if (!element) throw new Error(`Missing parental-control element: ${selector}`);
  return element;
}

function focusableElements(container) {
  return [...container.querySelectorAll("button:not(:disabled), input:not(:disabled), select:not(:disabled)")]
    .filter(element => !element.closest(".is-hidden"));
}

function trapFocus(event, container) {
  if (event.key !== "Tab") return false;
  const controls = focusableElements(container);
  if (!controls.length) {
    container.focus({ preventScroll: true });
    event.preventDefault();
    return true;
  }
  const current = controls.indexOf(document.activeElement);
  const direction = event.shiftKey ? -1 : 1;
  const index = current < 0
    ? (direction > 0 ? 0 : controls.length - 1)
    : (current + direction + controls.length) % controls.length;
  controls[index].focus();
  event.preventDefault();
  return true;
}

export class ParentalControlView {
  constructor({
    control,
    root = document,
    translate = key => key,
    onQuizOpen = () => {},
    onQuizClose = () => {},
    transitionDelay = 1400,
  }) {
    if (!control) throw new TypeError("A parental control is required.");
    this.control = control;
    this.translate = translate;
    this.onQuizOpen = onQuizOpen;
    this.onQuizClose = onQuizClose;
    this.transitionDelay = transitionDelay;
    this.transitionTimer = null;
    this.answerState = null;
    this.lastStatus = "";
    this.elements = {
      open: required(root, "#parental-control-button"),
      status: required(root, "#parental-button-status"),
      settingsLayer: required(root, "#parental-settings-layer"),
      enabled: required(root, "#parental-enabled"),
      duration: required(root, "#parental-duration"),
      questionCount: required(root, "#parental-question-count"),
      settingsCancel: required(root, "#parental-settings-cancel"),
      settingsSave: required(root, "#parental-settings-save"),
      quizLayer: required(root, "#parental-quiz-layer"),
      quizSubject: required(root, "#parental-quiz-subject"),
      quizProgress: required(root, "#parental-quiz-progress"),
      quizPrompt: required(root, "#parental-quiz-prompt"),
      quizAnswers: required(root, "#parental-quiz-answers"),
      quizFeedback: required(root, "#parental-quiz-feedback"),
    };
    this.handleKeydown = event => this.onKeydown(event);
    this.elements.open.addEventListener("click", () => this.openSettings());
    this.elements.settingsCancel.addEventListener("click", () => this.closeSettings());
    this.elements.settingsSave.addEventListener("click", () => this.saveSettings());
    document.addEventListener("keydown", this.handleKeydown);
    this.unsubscribe = this.control.subscribe((snapshot, event) => this.onControlUpdate(snapshot, event));
    this.renderStatus(this.control.getSnapshot());
  }

  isSettingsOpen() {
    return !this.elements.settingsLayer.classList.contains("is-hidden");
  }

  isQuizOpen() {
    return !this.elements.quizLayer.classList.contains("is-hidden");
  }

  openSettings() {
    if (this.isQuizOpen()) return;
    const { settings } = this.control.getSnapshot();
    this.elements.enabled.checked = settings.enabled;
    this.elements.duration.value = String(settings.durationMinutes);
    this.elements.questionCount.value = String(settings.questionsToUnlock);
    this.elements.settingsLayer.classList.remove("is-hidden");
    window.setTimeout(() => this.elements.enabled.focus(), 0);
  }

  closeSettings() {
    if (!this.isSettingsOpen()) return;
    this.elements.settingsLayer.classList.add("is-hidden");
    this.elements.open.focus({ preventScroll: true });
  }

  saveSettings() {
    this.control.configure({
      enabled: this.elements.enabled.checked,
      durationMinutes: Number(this.elements.duration.value),
      questionsToUnlock: Number(this.elements.questionCount.value),
    });
    this.closeSettings();
  }

  renderStatus(snapshot = this.control.getSnapshot()) {
    const status = !snapshot.settings.enabled
      ? this.translate("parental.status.off")
      : snapshot.blocking
        ? this.translate("parental.status.locked")
        : snapshot.formattedRemaining;
    if (status !== this.lastStatus) {
      this.elements.status.textContent = status;
      this.lastStatus = status;
    }
    this.elements.open.classList.toggle("is-disabled", !snapshot.settings.enabled);
  }

  onControlUpdate(snapshot, event) {
    this.renderStatus(snapshot);
    if (event !== "repository-sync" || !this.isQuizOpen()) return;
    if (!snapshot.blocking) {
      this.closeQuiz();
      return;
    }
    if (snapshot.quiz) return;
    clearTimeout(this.transitionTimer);
    this.transitionTimer = null;
    this.answerState = null;
    this.renderQuestion(this.control.startQuiz());
  }

  openQuiz() {
    if (this.isQuizOpen()) return;
    const session = this.control.startQuiz();
    if (!session) return;
    this.answerState = null;
    this.elements.quizLayer.classList.remove("is-hidden");
    this.onQuizOpen();
    this.renderQuestion(session);
  }

  renderQuestion(session = null) {
    const current = session || this.control.startQuiz();
    if (!current) return;
    const { question, progress } = current;
    this.elements.quizSubject.textContent = question.subject;
    this.elements.quizProgress.textContent = this.translate("parental.quiz.progress", progress);
    this.elements.quizPrompt.textContent = question.prompt;
    this.elements.quizFeedback.textContent = "";
    this.elements.quizFeedback.className = "parental-quiz-feedback";
    this.elements.quizAnswers.replaceChildren(...question.options.map((option, index) => {
      const button = document.createElement("button");
      const marker = document.createElement("span");
      button.type = "button";
      button.className = "parental-quiz-option";
      marker.textContent = String.fromCharCode(65 + index);
      button.append(marker, document.createTextNode(option));
      button.addEventListener("click", () => this.answer(index));
      return button;
    }));
    if (this.answerState) this.renderAnswerState();
    window.setTimeout(() => this.elements.quizAnswers.querySelector("button")?.focus(), 0);
  }

  answer(index) {
    if (this.answerState) return;
    const result = this.control.answer(index);
    if (!result.accepted) return;
    this.answerState = { index, result };
    this.renderAnswerState();
    clearTimeout(this.transitionTimer);
    this.transitionTimer = window.setTimeout(() => {
      this.transitionTimer = null;
      if (result.unlocked) {
        this.closeQuiz();
        return;
      }
      this.answerState = null;
      this.renderQuestion(this.control.nextQuestion());
    }, this.transitionDelay);
  }

  renderAnswerState() {
    if (!this.answerState) return;
    const { index, result } = this.answerState;
    const buttons = [...this.elements.quizAnswers.querySelectorAll("button")];
    buttons.forEach(button => { button.disabled = true; });
    buttons[result.correctAnswerIndex]?.classList.add("correct");
    if (!result.isCorrect) buttons[index]?.classList.add("wrong");
    this.elements.quizFeedback.textContent = this.translate(
      result.isCorrect ? "parental.quiz.correct" : "parental.quiz.wrong",
      { explanation: this.translate(result.explanationKey) },
    );
    this.elements.quizFeedback.className = `parental-quiz-feedback ${result.isCorrect ? "is-correct" : "is-wrong"}`;
  }

  closeQuiz() {
    if (!this.isQuizOpen()) return;
    clearTimeout(this.transitionTimer);
    this.transitionTimer = null;
    this.answerState = null;
    this.elements.quizLayer.classList.add("is-hidden");
    this.onQuizClose();
  }

  ensureBlocking() {
    if (this.control.getSnapshot().blocking) {
      this.openQuiz();
      return;
    }
    if (this.isQuizOpen() && !this.answerState) this.closeQuiz();
  }

  refreshLanguage(translate) {
    this.translate = typeof translate === "function" ? translate : this.translate;
    this.control.setLocalizer(this.translate);
    this.lastStatus = "";
    this.renderStatus(this.control.getSnapshot());
    if (this.isQuizOpen()) this.renderQuestion();
  }

  onKeydown(event) {
    if (this.isQuizOpen()) {
      if (event.key === "Escape") event.preventDefault();
      trapFocus(event, this.elements.quizLayer);
      event.stopPropagation();
      return;
    }
    if (!this.isSettingsOpen()) return;
    if (event.key === "Escape") {
      event.preventDefault();
      this.closeSettings();
      event.stopPropagation();
      return;
    }
    if (trapFocus(event, this.elements.settingsLayer)) event.stopPropagation();
  }

  dispose() {
    clearTimeout(this.transitionTimer);
    document.removeEventListener("keydown", this.handleKeydown);
    this.unsubscribe?.();
  }
}
