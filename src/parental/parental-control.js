import { ParentalQuizSession } from "./quiz-session.js";
import { DEFAULT_PARENTAL_SETTINGS, normalizeParentalSettings } from "./settings.js";
import { normalizeParentalState } from "./state.js";

function clone(value) {
  return value == null ? value : JSON.parse(JSON.stringify(value));
}

function readRepository(repository) {
  if (!repository) return null;
  if (typeof repository.load !== "function" || typeof repository.save !== "function"
    || typeof repository.advanceCycle !== "function") {
    throw new TypeError("The parental state repository must provide synchronous load, save, and advanceCycle methods.");
  }
  const value = repository.load();
  if (value && typeof value.then === "function") {
    throw new TypeError("The parental state repository must be synchronous.");
  }
  return value;
}

export class ParentalControl {
  constructor({
    stateRepository = null,
    settings = DEFAULT_PARENTAL_SETTINGS,
    questions,
    random = Math.random,
    localize = key => key,
  } = {}) {
    this.repository = stateRepository;
    this.questions = questions;
    this.random = random;
    this.localize = typeof localize === "function" ? localize : key => key;
    this.listeners = new Set();
    this.quiz = null;
    this.secondsSincePersist = 0;
    this.saving = false;
    this.state = normalizeParentalState(readRepository(this.repository), settings);
    this.persist(true, { intent: "timer" });
    this.unsubscribeRepository = typeof this.repository?.subscribe === "function"
      ? this.repository.subscribe(state => {
        if (!this.saving) this.syncFromRepository(state);
      })
      : null;
  }

  getSnapshot() {
    const { settings, cycle } = this.state;
    return Object.freeze({
      settings: Object.freeze({ ...settings }),
      cycleId: cycle.id,
      cycleDurationMinutes: cycle.durationMinutes,
      remainingSeconds: cycle.remainingSeconds,
      formattedRemaining: this.formattedRemaining(),
      locked: cycle.locked,
      blocking: settings.enabled && cycle.locked,
      quiz: this.quiz ? this.quiz.progress() : null,
    });
  }

  formattedRemaining() {
    const total = Math.max(0, Math.ceil(this.state.cycle.remainingSeconds));
    return `${String(Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
  }

  subscribe(listener) {
    if (typeof listener !== "function") return () => {};
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  setLocalizer(localize) {
    if (typeof localize !== "function") return;
    this.localize = localize;
    this.quiz?.setLocalizer(localize);
    this.emit("locale");
  }

  configure(settings) {
    const previous = this.state.settings;
    const next = normalizeParentalSettings({ ...previous, ...settings });
    const cycle = this.state.cycle;

    const firstActivation = !previous.enabled && next.enabled && cycle.id === 0 && !cycle.locked
      && cycle.remainingSeconds === cycle.durationMinutes * 60;
    if (firstActivation) {
      cycle.durationMinutes = next.durationMinutes;
      cycle.remainingSeconds = next.durationMinutes * 60;
    } else if (!cycle.locked && next.durationMinutes < cycle.durationMinutes) {
      cycle.durationMinutes = next.durationMinutes;
      cycle.remainingSeconds = Math.min(cycle.remainingSeconds, next.durationMinutes * 60);
    }
    this.state.settings = next;
    if (previous.questionsToUnlock !== next.questionsToUnlock) {
      this.quiz = null;
    }
    this.persist(true, { intent: "settings" });
    return this.emit("configured");
  }

  tick(deltaSeconds, {
    activeGameplay = false,
    paused = false,
    quizOpen = false,
  } = {}) {
    const seconds = Number(deltaSeconds);
    const active = activeGameplay === true && paused !== true && quizOpen !== true;
    const cycle = this.state.cycle;
    if (!Number.isFinite(seconds) || seconds <= 0 || !active || !this.state.settings.enabled || cycle.locked) {
      return Object.freeze({ changed: false, justLocked: false, snapshot: this.getSnapshot() });
    }

    cycle.remainingSeconds = Math.max(0, cycle.remainingSeconds - seconds);
    const justLocked = cycle.remainingSeconds === 0;
    if (justLocked) cycle.locked = true;
    this.secondsSincePersist += seconds;
    this.persist(justLocked, { intent: "timer" });
    const snapshot = this.emit(justLocked ? "locked" : "tick");
    return Object.freeze({ changed: true, justLocked, snapshot });
  }

  startQuiz() {
    if (!this.getSnapshot().blocking) return null;
    if (!this.quiz) {
      this.quiz = new ParentalQuizSession({
        requiredCorrect: this.state.settings.questionsToUnlock,
        questions: this.questions,
        random: this.random,
        localize: this.localize,
      });
      this.emit("quiz-started");
    }
    return Object.freeze({ question: this.quiz.current(), progress: this.quiz.progress() });
  }

  answer(choiceIndex) {
    if (!this.quiz || !this.getSnapshot().blocking) {
      return Object.freeze({ accepted: false, unlocked: false });
    }
    const result = this.quiz.answer(choiceIndex);
    if (!result.accepted) return Object.freeze({ ...result, unlocked: false });

    if (result.completed) {
      const transition = this.startNextCycle();
      return Object.freeze({ ...result, unlocked: transition.advanced, snapshot: transition.snapshot });
    }
    this.emit("quiz-answer");
    return Object.freeze({ ...result, unlocked: false });
  }

  nextQuestion() {
    if (!this.quiz || !this.getSnapshot().blocking) return null;
    const question = this.quiz.next();
    this.emit("quiz-question");
    return Object.freeze({ question, progress: this.quiz.progress() });
  }

  startNextCycle() {
    const expectedCycleId = this.state.cycle.id;
    const questionsAnswered = this.quiz?.progress().correct || 0;
    const durationMinutes = this.state.settings.durationMinutes;
    this.state.cycle = {
      id: this.state.cycle.id + 1,
      durationMinutes,
      remainingSeconds: durationMinutes * 60,
      locked: false,
    };
    this.quiz = null;
    let advanced;
    if (this.repository) {
      this.saving = true;
      let transition;
      try {
        transition = this.repository.advanceCycle(clone(this.state), expectedCycleId, { questionsAnswered });
      } finally {
        this.saving = false;
      }
      if (transition && typeof transition.then === "function") {
        throw new TypeError("The parental state repository must be synchronous.");
      }
      if (transition?.state) this.state = normalizeParentalState(transition.state, this.state.settings);
      this.secondsSincePersist = 0;
      advanced = transition?.advanced === true;
    } else advanced = true;
    const snapshot = this.emit(advanced ? "unlocked" : "stale-quiz");
    return Object.freeze({ advanced, snapshot });
  }

  syncFromRepository(value = readRepository(this.repository)) {
    if (!value) return this.getSnapshot();
    const incoming = normalizeParentalState(value, this.state.settings);
    const currentCycle = this.state.cycle;
    const incomingCycle = incoming.cycle;

    if (incomingCycle.id > currentCycle.id) {
      this.state = incoming;
      this.quiz = null;
    } else if (incomingCycle.id === currentCycle.id) {
      const locked = currentCycle.locked || incomingCycle.locked;
      this.state.settings = incoming.settings;
      this.state.cycle = {
        id: currentCycle.id,
        durationMinutes: Math.min(currentCycle.durationMinutes, incomingCycle.durationMinutes),
        remainingSeconds: locked
          ? 0
          : Math.min(currentCycle.remainingSeconds, incomingCycle.remainingSeconds),
        locked,
      };
      if (this.quiz && this.quiz.requiredCorrect !== incoming.settings.questionsToUnlock) {
        this.quiz = null;
      }
    }
    this.secondsSincePersist = 0;
    return this.emit("repository-sync");
  }

  flush() {
    this.persist(true, { intent: "timer" });
    return this.getSnapshot();
  }

  dispose() {
    this.flush();
    this.unsubscribeRepository?.();
    this.unsubscribeRepository = null;
    this.listeners.clear();
  }

  persist(force = false, options = { intent: "timer" }) {
    if (!this.repository || !force && this.secondsSincePersist + Number.EPSILON < 1) return false;
    this.saving = true;
    let saved;
    try {
      saved = this.repository.save(clone(this.state), options);
    } finally {
      this.saving = false;
    }
    if (saved && typeof saved.then === "function") {
      throw new TypeError("The parental state repository must be synchronous.");
    }
    if (saved && typeof saved === "object") {
      this.state = normalizeParentalState(saved, this.state.settings);
    }
    this.secondsSincePersist = 0;
    return true;
  }

  emit(type) {
    const snapshot = this.getSnapshot();
    this.listeners.forEach(listener => listener(snapshot, type));
    return snapshot;
  }
}
