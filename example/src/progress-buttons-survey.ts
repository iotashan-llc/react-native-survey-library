/**
 * Progress-buttons + notifier demo (task 5.7c). A multi-page survey with
 * `progressBarType: "buttons"` (step-button nav) plus page titles and
 * numbers, so the `SurveyProgressButtons` step row shows a numbered circle
 * and a title per page and navigates via `clickListElement` when a step is
 * tapped. The example App pairs it with a "Notify" button that calls
 * `survey.notify(...)` to exercise the `SurveyNotifier` toast.
 */
export const progressButtonsSurveyJson = {
  title: 'Progress Buttons Demo',
  showProgressBar: true,
  progressBarType: 'buttons',
  progressBarShowPageTitles: true,
  progressBarShowPageNumbers: true,
  pages: [
    {
      name: 'account',
      navigationTitle: 'Account',
      title: 'Account',
      elements: [
        { type: 'text', name: 'email', title: 'Email', inputType: 'email' },
        { type: 'text', name: 'username', title: 'Username' },
      ],
    },
    {
      name: 'profile',
      navigationTitle: 'Profile',
      title: 'Profile',
      elements: [
        { type: 'text', name: 'fullName', title: 'Full name' },
        {
          type: 'dropdown',
          name: 'country',
          title: 'Country',
          choices: ['United States', 'Canada', 'United Kingdom', 'Australia'],
        },
      ],
    },
    {
      name: 'preferences',
      navigationTitle: 'Preferences',
      title: 'Preferences',
      elements: [
        {
          type: 'boolean',
          name: 'newsletter',
          title: 'Subscribe to the newsletter?',
        },
        {
          type: 'rating',
          name: 'satisfaction',
          title: 'How likely are you to recommend us?',
          rateMax: 5,
        },
      ],
    },
    {
      name: 'review',
      navigationTitle: 'Review',
      title: 'Review & submit',
      elements: [
        {
          type: 'comment',
          name: 'notes',
          title: 'Anything else you would like us to know?',
        },
      ],
    },
  ],
};
