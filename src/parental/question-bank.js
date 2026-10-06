import { rotatedAnswerIndex } from "./question-options.js";

const CURRICULUM = Object.freeze([
  Object.freeze({ subject: "language", prefix: "cn", count: 16, weight: 5 }),
  Object.freeze({ subject: "mathematics", prefix: "ma", count: 13, weight: 4 }),
  Object.freeze({ subject: "english", prefix: "en", count: 6, weight: 2 }),
  Object.freeze({ subject: "geography", prefix: "ge", count: 13, weight: 4 }),
  Object.freeze({ subject: "physics", prefix: "ph", count: 13, weight: 4 }),
  Object.freeze({ subject: "chineseHistory", prefix: "ch", count: 16, weight: 5 }),
  Object.freeze({ subject: "worldHistory", prefix: "wh", count: 13, weight: 4 }),
  Object.freeze({ subject: "finance", prefix: "fi", count: 10, weight: 3 }),
]);

function defineQuestion(id, subject) {
  const baseKey = `parental.question.${id}`;
  return Object.freeze({
    id,
    subject,
    subjectKey: `parental.subject.${subject}`,
    promptKey: `${baseKey}.prompt`,
    optionKeys: Object.freeze(Array.from({ length: 4 }, (_, index) => `${baseKey}.option.${index}`)),
    answerIndex: rotatedAnswerIndex(id, 0, 4),
    explanationKey: `${baseKey}.explanation`,
  });
}

export const PARENTAL_SUBJECT_WEIGHTS = Object.freeze(Object.fromEntries(
  CURRICULUM.map(({ subject, weight }) => [subject, weight]),
));

export const PARENTAL_QUESTION_BANK = Object.freeze(CURRICULUM.flatMap(({ subject, prefix, count }) => (
  Array.from({ length: count }, (_, index) => defineQuestion(
    `${prefix}-${String(index + 1).padStart(2, "0")}`,
    subject,
  ))
)));

export function localizeParentalQuestion(question, localize = key => key) {
  if (!question) return null;
  return Object.freeze({
    id: question.id,
    subjectKey: question.subjectKey,
    promptKey: question.promptKey,
    optionKeys: question.optionKeys,
    explanationKey: question.explanationKey,
    subject: localize(question.subjectKey),
    prompt: localize(question.promptKey),
    options: Object.freeze(question.optionKeys.map(key => localize(key))),
    explanation: localize(question.explanationKey),
  });
}
