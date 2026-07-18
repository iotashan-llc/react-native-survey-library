/**
 * Kitchen-sink survey JSON (task 1.17) — exercises every M1-supported
 * question type and shell feature: header (title/description/logo),
 * percentage progress ("questions" — the effective percentage route),
 * multi-page navigation, panels + multi-element rows, boolean (all three
 * renderAs), checkbox/radiogroup (columns, other, comment), comment,
 * text (a spread of inputTypes incl. a pattern mask), rating (numbers,
 * stars, smileys, custom string rateValues), expression, completedHtml.
 * Unsupported types are deliberately NOT included here — the fallback
 * panel demo lives on its own page so the rest of the survey stays
 * representative.
 */

// 1x1 blue PNG — data: logos involve no network fetch (URI policy).
const LOGO_DATA_URI =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPj/HwADBwIAMCbHYQAAAABJRU5ErkJggg==';

export const kitchenSinkJson = {
  title: 'React Native Survey Library — Kitchen Sink',
  description: 'Every M1-supported question type, rendered natively.',
  logo: LOGO_DATA_URI,
  logoWidth: 40,
  logoHeight: 40,
  showProgressBar: true,
  progressBarType: 'questions',
  showQuestionNumbers: 'on',
  completedHtml:
    '<h3>Thanks!</h3><p>You exercised <strong>every</strong> supported question type.</p>',
  pages: [
    {
      name: 'basics',
      title: 'Basics',
      elements: [
        {
          type: 'text',
          name: 'fullName',
          title: 'Your name',
          placeholder: 'Ada Lovelace',
          isRequired: true,
        },
        {
          type: 'text',
          name: 'email',
          title: 'Email',
          inputType: 'email',
          startWithNewLine: false,
        },
        {
          type: 'text',
          name: 'age',
          title: 'Age',
          inputType: 'number',
          minValueExpression: '0',
        },
        {
          type: 'text',
          name: 'phone',
          title: 'Phone (masked)',
          maskType: 'pattern',
          maskSettings: { pattern: '(999) 999-9999' },
          startWithNewLine: false,
        },
        {
          type: 'text',
          name: 'birthday',
          title: 'Birthday',
          inputType: 'date',
        },
        {
          type: 'comment',
          name: 'bio',
          title: 'Short bio',
          maxLength: 280,
          rows: 3,
        },
      ],
    },
    {
      name: 'choices',
      title: 'Choices',
      elements: [
        {
          type: 'radiogroup',
          name: 'platform',
          title: 'Primary platform',
          choices: ['iOS', 'Android', 'Both'],
          isRequired: true,
        },
        {
          type: 'checkbox',
          name: 'frameworks',
          title: 'Frameworks you use',
          colCount: 2,
          choices: [
            'React Native',
            'Expo',
            'SwiftUI',
            'Jetpack Compose',
            'Flutter',
          ],
          showOtherItem: true,
          showSelectAllItem: true,
        },
        {
          type: 'boolean',
          name: 'newArch',
          title: 'Using the New Architecture?',
        },
        {
          type: 'boolean',
          name: 'hermes',
          title: 'Hermes enabled?',
          renderAs: 'checkbox',
          startWithNewLine: false,
        },
        {
          type: 'boolean',
          name: 'bridgeless',
          title: 'Bridgeless mode?',
          renderAs: 'radio',
          startWithNewLine: false,
        },
      ],
    },
    {
      name: 'ratings',
      title: 'Ratings & panels',
      elements: [
        {
          type: 'rating',
          name: 'dx',
          title: 'Developer experience so far',
          rateMin: 1,
          rateMax: 5,
        },
        {
          type: 'rating',
          name: 'stars',
          title: 'Star it',
          rateType: 'stars',
          rateMax: 5,
        },
        {
          type: 'rating',
          name: 'mood',
          title: 'How do you feel?',
          rateType: 'smileys',
          rateMax: 5,
          startWithNewLine: false,
        },
        {
          type: 'rating',
          name: 'tshirt',
          title: 'Team size',
          rateValues: ['solo', 'small', 'medium', 'large'],
        },
        {
          type: 'buttongroup',
          name: 'plan',
          title: 'Plan (buttongroup)',
          choices: ['Free', 'Pro', 'Team'],
        },
        {
          type: 'multipletext',
          name: 'contact',
          title: 'Contact (multipletext)',
          colCount: 2,
          items: [
            { name: 'firstName', title: 'First name', isRequired: true },
            { name: 'lastName', title: 'Last name' },
            { name: 'email', title: 'E-mail', inputType: 'email' },
            { name: 'phone', title: 'Phone', inputType: 'tel' },
          ],
        },
        {
          type: 'image',
          name: 'heroImage',
          imageLink: LOGO_DATA_URI,
          imageFit: 'contain',
          imageWidth: '96',
          imageHeight: '96',
          altText: 'Sample image (task 2.10)',
        },
        {
          type: 'panel',
          name: 'scores',
          title: 'Computed (expression)',
          elements: [
            {
              type: 'expression',
              name: 'answeredSummary',
              title: 'Name echo',
              expression: "iif({fullName} notempty, {fullName}, 'anonymous')",
            },
            {
              type: 'expression',
              name: 'ageNextYear',
              title: 'Age next year',
              expression: 'iif({age} notempty, {age} + 1, 0)',
              startWithNewLine: false,
            },
          ],
        },
        {
          type: 'paneldynamic',
          name: 'devices',
          title: 'Test devices (paneldynamic, task 2.8a)',
          panelCount: 1,
          minPanelCount: 0,
          maxPanelCount: 3,
          confirmDelete: true,
          panelAddText: 'Add device',
          panelRemoveText: 'Remove device',
          templateElements: [
            { type: 'text', name: 'model', title: 'Model' },
            {
              type: 'text',
              name: 'os',
              title: 'OS version',
              startWithNewLine: false,
            },
          ],
        },
      ],
    },
    {
      name: 'fallback',
      title: 'Graceful fallback',
      elements: [
        {
          type: 'html',
          name: 'notSupportedDemo',
          html: '<p>The <code>html</code> question type is not supported until M2 — this row demonstrates the NON-THROWING fallback panel.</p>',
        },
        {
          type: 'comment',
          name: 'feedback',
          title: 'Anything else?',
        },
      ],
    },
  ],
} as const;
