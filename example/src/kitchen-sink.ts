/**
 * Kitchen-sink survey JSON (task 1.17) — exercises every M1-supported
 * question type and shell feature: header (title/description/logo),
 * percentage progress ("questions" — the effective percentage route),
 * multi-page navigation, panels + multi-element rows, boolean (all three
 * renderAs), checkbox/radiogroup (columns, other, comment), comment,
 * text (a spread of inputTypes incl. a pattern mask), rating (numbers,
 * stars, smileys, custom string rateValues), expression, html (sanitized
 * rich content), the M3 3.2 simple matrix (single/multi-select + rubric
 * cells), completedHtml. A single genuinely-unsupported type (ranking,
 * planned for M4) sits on the last page to demonstrate the NON-THROWING
 * fallback panel (invariant 9); the rest of the survey stays representative.
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
          type: 'tagbox',
          name: 'langs',
          title: 'Languages you use (tagbox)',
          placeholder: 'Add languages…',
          allowClear: true,
          choices: [
            'TypeScript',
            'JavaScript',
            'Swift',
            'Kotlin',
            'Objective-C',
            'Java',
            'Rust',
            'Dart',
          ],
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
          type: 'rating',
          name: 'satisfaction',
          title: 'Overall satisfaction (rating, displayMode: dropdown)',
          displayMode: 'dropdown',
          rateMin: 1,
          rateMax: 10,
        },
        {
          type: 'buttongroup',
          name: 'plan',
          title: 'Plan (buttongroup)',
          choices: ['Free', 'Pro', 'Team'],
        },
        {
          type: 'buttongroup',
          name: 'tier',
          title: 'Support tier (buttongroup, overflows to dropdown on phones)',
          choices: [
            'Community (free forever)',
            'Professional (priority email)',
            'Enterprise (24/7 phone + dedicated TAM)',
            'Government (FedRAMP + compliance pack)',
          ],
        },
        {
          type: 'dropdown',
          name: 'fruit',
          title: 'Favorite fruit (dropdown)',
          placeholder: 'Pick a fruit…',
          allowClear: true,
          choices: [
            'Apple',
            'Banana',
            'Cherry',
            'Dragonfruit',
            'Elderberry',
            'Fig',
            'Grape',
            'Honeydew',
            'Kiwi',
            'Lemon',
            'Mango',
            'Nectarine',
          ],
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
          type: 'imagepicker',
          name: 'swatches',
          title: 'Pick swatches (imagepicker)',
          multiSelect: true,
          showLabel: true,
          imageWidth: 80,
          imageHeight: 60,
          choices: [
            { value: 'one', imageLink: LOGO_DATA_URI, text: 'One' },
            { value: 'two', imageLink: LOGO_DATA_URI, text: 'Two' },
            { value: 'three', imageLink: LOGO_DATA_URI, text: 'Three' },
          ],
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
        {
          // ComponentCollection custom (task 2.11) — a wrapped text question;
          // registered in App.tsx (RN) + parity/index.html (web) as a real
          // serializer type. Dispatches on getTemplate() === 'custom'.
          type: 'ks-custom-slug',
          name: 'projectSlug',
        },
        {
          // ComponentCollection composite (task 2.11) — a panel of two texts;
          // value is an object keyed by inner names. getTemplate() ===
          // 'composite'.
          type: 'ks-composite-fullname',
          name: 'reporter',
          title: 'Reporter (composite)',
        },
      ],
    },
    {
      name: 'matrix',
      title: 'Matrix (simple)',
      elements: [
        {
          // Single-select (radio) matrix (M3 3.2) — value is {row: col};
          // eachRowRequired flags empty rows on validation.
          type: 'matrix',
          name: 'agreement',
          title: 'How much do you agree? (single-select matrix)',
          isAllRowRequired: true,
          columns: [
            { value: 1, text: 'Disagree' },
            { value: 2, text: 'Neutral' },
            { value: 3, text: 'Agree' },
          ],
          rows: [
            { value: 'speed', text: 'Speed' },
            { value: 'docs', text: 'Documentation' },
            { value: 'support', text: 'Support' },
          ],
        },
        {
          // Multi-select matrix (cellType: checkbox) with an exclusive
          // column — value is {row: [col, ...]}.
          type: 'matrix',
          name: 'usage',
          title: 'Where do you use each platform? (multi-select matrix)',
          cellType: 'checkbox',
          columns: [
            { value: 'work', text: 'Work' },
            { value: 'home', text: 'Home' },
            { value: 'none', text: 'Not at all', isExclusive: true },
          ],
          rows: [
            { value: 'ios', text: 'iOS' },
            { value: 'android', text: 'Android' },
          ],
        },
        {
          // Rubric matrix (hasCellText via `cells`) — cells render tappable
          // text instead of a radio/checkbox decorator.
          type: 'matrix',
          name: 'rubric',
          title: 'Rate the release (rubric matrix)',
          columns: ['low', 'mid', 'high'],
          rows: [{ value: 'quality', text: 'Quality' }],
          cells: {
            quality: { low: 'Rough', mid: 'Solid', high: 'Excellent' },
          },
        },
      ],
    },
    {
      name: 'fallback',
      title: 'HTML & graceful fallback',
      elements: [
        {
          // html question (pulled forward from M5) — renders rich content
          // through the 0.9 SanitizedHtml sink: allowlisted tags only,
          // URI/scheme policy, no auto-navigation (invariant 8). Link
          // presses are currently inert (no host callback is wired yet);
          // event-surfacing lands with the onLinkPress task.
          type: 'html',
          name: 'htmlContent',
          html: '<p>The <code>html</code> question type renders rich content natively via the sanitized HTML pipeline: <strong>bold</strong>, <em>italic</em>, and <a href="https://surveyjs.io">links</a> (the renderer never auto-navigates; link presses are currently inert — a host callback for them is not wired yet).</p>',
        },
        {
          // A genuinely still-unsupported type (ranking, planned for M4):
          // the web reference renders it, RN shows the NON-THROWING
          // fallback panel (invariant 9). This is the graceful-fallback demo.
          // (matrix moved to the 'Matrix (simple)' page now that 3.2 lands.)
          type: 'ranking',
          name: 'notSupportedDemo',
          title: 'Unsupported in RN (ranking) — fallback demo',
          choices: ['First', 'Second', 'Third'],
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
