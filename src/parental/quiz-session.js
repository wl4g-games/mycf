import { PARENTAL_QUESTION_BANK, localizeParentalQuestion } from "./question-bank.js";
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

export function createParentalQuestionPicker({
  questions = PARENTAL_QUESTION_BANK,
  random = Math.random,
} = {}) {
  if (!Array.isArray(questions) || questions.length === 0) {
    throw new TypeError("A non-empty question bank is required.");
  }

  let deck = [];
  let previousId = null;

  function refill() {
    deck = shuffled(questions, random);
    if (deck.length > 1 && deck[0].id === previousId) {
      [deck[0], deck[1]] = [deck[1], deck[0]];
    }
  }

  return Object.freeze({
    next() {
      if (deck.length === 0) refill();
      const question = deck.shift();
      previousId = question.id;
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
