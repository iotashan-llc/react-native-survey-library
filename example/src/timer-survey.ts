/**
 * Timer demo survey (task 5.7a): a small quiz with a survey time limit AND a
 * per-page time limit, with the timer panel shown at the top. survey-core
 * owns all timing — the renderer only draws `survey.timerModel`'s clock text
 * and starts/stops the core timer on mount/unmount. Passed to `<Survey>`
 * UNMODIFIED, exactly like any consumer's SurveyModel JSON.
 */
export const timerSurveyJson = {
  title: 'Timed quiz',
  description:
    'A survey-level time limit (2 min) and a per-page limit (45 sec). The timer panel renders at the top; all timing is survey-core.',
  showTimer: true,
  timerLocation: 'top',
  // 'combined' (default) shows both the page and survey clocks; try 'page'
  // or 'survey' to show only one.
  timerInfoMode: 'combined',
  timeLimit: 120,
  timeLimitPerPage: 45,
  pages: [
    {
      name: 'p1',
      elements: [
        {
          type: 'text',
          name: 'name',
          title: 'What is your name?',
          isRequired: true,
        },
      ],
    },
    {
      name: 'p2',
      elements: [
        {
          type: 'radiogroup',
          name: 'capital',
          title: 'What is the capital of France?',
          choices: ['Berlin', 'Madrid', 'Paris', 'Rome'],
        },
      ],
    },
  ],
};
