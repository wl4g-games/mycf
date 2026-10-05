function defineQuestion(id, subject, answerIndex) {
  const baseKey = `parental.question.${id}`;
  return Object.freeze({
    id,
    subjectKey: `parental.subject.${subject}`,
    promptKey: `${baseKey}.prompt`,
    optionKeys: Object.freeze(Array.from({ length: 4 }, (_, index) => `${baseKey}.option.${index}`)),
    answerIndex,
    explanationKey: `${baseKey}.explanation`,
  });
}

export const PARENTAL_QUESTION_BANK = Object.freeze([
  defineQuestion("addition", "math", 2),
  defineQuestion("subtraction", "math", 1),
  defineQuestion("multiplication", "math", 3),
  defineQuestion("division", "math", 0),
  defineQuestion("elapsed-time", "math", 2),
  defineQuestion("change", "math", 1),
  defineQuestion("online-privacy", "safety", 3),
  defineQuestion("road-safety", "safety", 0),
  defineQuestion("fire-safety", "safety", 2),
  defineQuestion("teamwork", "reasoning", 1),
  defineQuestion("water-cycle", "science", 3),
  defineQuestion("healthy-break", "health", 0),
]);

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
