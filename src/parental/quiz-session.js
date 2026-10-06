import {
  PARENTAL_QUESTION_BANK,
  PARENTAL_SUBJECT_WEIGHTS,
  localizeParentalQuestion,
} from "./question-bank.js";
import { PARENTAL_QUESTION_OPTIONS } from "./settings.js";

function randomIndex(length, random) {
  const sample = Number(random());
  const unit = Number.isFinite(sample) ? Math.max(0, Math.min(0.999999999999, sample)) : 0;
  return Math.floor(unit * length);
}

function shuffled(items, random) {
  const result = [...items];
  for (let index = result.length - 1; index > 0; index--) {
    const swapIndex = randomIndex(index + 1, random);
    [result[index], result[swapIndex]] = [result[swapIndex], result[index]];
  }
  return result;
}

function chooseWeightedSubject(subjects, weights, random) {
  const total = subjects.reduce((sum, subject) => sum + (weights[subject] || 1), 0);
  const sample = Number(random());
  const unit = Number.isFinite(sample) ? Math.max(0, Math.min(0.999999999999, sample)) : 0;
  let cursor = unit * total;
  for (const subject of subjects) {
    cursor -= weights[subject] || 1;
    if (cursor < 0) return subject;
  }
  return subjects.at(-1);
}

export function createParentalQuestionPicker({
  questions = PARENTAL_QUESTION_BANK,
  subjectWeights = PARENTAL_SUBJECT_WEIGHTS,
  random = Math.random,
} = {}) {
  if (!Array.isArray(questions) || questions.length === 0) {
    throw new TypeError("A non-empty question bank is required.");
  }

  const subjects = [...new Set(questions.map(question => question.subject || question.subjectKey))];
  const sourceBySubject = new Map(subjects.map(subject => [
    subject,
    questions.filter(question => (question.subject || question.subjectKey) === subject),
  ]));
  let pools = new Map();
  const recentIds = [];

  function refill() {
    pools = new Map(subjects.map(subject => [subject, shuffled(sourceBySubject.get(subject), random)]));
  }

  function remember(id) {
    recentIds.push(id);
    if (recentIds.length > 8) recentIds.shift();
  }

  refill();

  return Object.freeze({
    next() {
      let available = subjects.filter(subject => pools.get(subject)?.length);
      if (available.length === 0) {
        refill();
        available = [...subjects];
      }
      const subject = chooseWeightedSubject(available, subjectWeights, random);
      const pool = pools.get(subject);
      let questionIndex = pool.findIndex(question => !recentIds.includes(question.id));
      if (questionIndex < 0) questionIndex = 0;
      const [question] = pool.splice(questionIndex, 1);
      remember(question.id);
      return question;
    },
  });
}

export class ParentalQuizSession {
  constructor({
    requiredCorrect = 1,
    questions = PARENTAL_QUESTION_BANK,
    random = Math.random,
    localize = key => key,
  } = {}) {
    const normalizedRequired = Number(requiredCorrect);
    this.requiredCorrect = PARENTAL_QUESTION_OPTIONS.includes(normalizedRequired)
      ? normalizedRequired
      : 1;
    if (questions.length < this.requiredCorrect) {
      throw new RangeError("The question bank must cover the required correct-answer count without repetition.");
    }
    this.picker = createParentalQuestionPicker({ questions, random });
    this.localize = typeof localize === "function" ? localize : key => key;
    this.question = this.picker.next();
    this.correct = 0;
    this.attempts = 0;
    this.answeredCurrent = false;
  }

  setLocalizer(localize) {
    if (typeof localize === "function") this.localize = localize;
  }

  current() {
    return localizeParentalQuestion(this.question, this.localize);
  }

  progress() {
    return Object.freeze({
      correct: this.correct,
      required: this.requiredCorrect,
      attempts: this.attempts,
      completed: this.correct >= this.requiredCorrect,
    });
  }

  answer(choiceIndex) {
    const selected = Number(choiceIndex);
    if (this.progress().completed || this.answeredCurrent || !Number.isInteger(selected)
      || selected < 0 || selected >= this.question.optionKeys.length) {
      return Object.freeze({ ...this.progress(), accepted: false });
    }

    this.answeredCurrent = true;
    this.attempts += 1;
    const isCorrect = selected === this.question.answerIndex;
    if (isCorrect) this.correct += 1;

    return Object.freeze({
      ...this.progress(),
      accepted: true,
      isCorrect,
      correctAnswerIndex: this.question.answerIndex,
      explanationKey: this.question.explanationKey,
      explanation: this.localize(this.question.explanationKey),
    });
  }

  next() {
    if (this.progress().completed || !this.answeredCurrent) return this.current();
    this.question = this.picker.next();
    this.answeredCurrent = false;
    return this.current();
  }
}
