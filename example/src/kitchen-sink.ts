/**
 * Kitchen-sink survey JSON (task 1.17) — exercises every M1-supported
 * question type and shell feature: header (title/description/logo),
 * percentage progress ("questions" — the effective percentage route),
 * multi-page navigation, panels + multi-element rows, boolean (all three
 * renderAs), checkbox/radiogroup (columns, other, comment), comment,
 * text (a spread of inputTypes incl. a pattern mask), rating (numbers,
 * stars, smileys, custom string rateValues), expression, html (sanitized
 * rich content), the M3 3.2 simple matrix (single/multi-select + rubric
 * cells), ranking (drag-to-reorder + selectToRank, M4 4.1), slider
 * (single + range dual-thumb, M4 4.4), signaturepad (WebView signature
 * pad, M5 5.1), file (native document/camera pickers, M5 5.2),
 * completedHtml. Every question type on the survey now renders as a
 * SUPPORTED native question; the graceful-fallback path (invariant 9) is
 * exercised by the unit suites rather than a live unsupported demo.
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
          // Video content mode (task 5.5) — renders the expo-video player
          // (native controls, contentFit from imageFit). The source loads
          // through the URI policy 'video' context (fail-closed): allowlist
          // this origin via the survey's UriPolicyContext to play it,
          // otherwise it degrades to a non-throwing poster fallback. YouTube
          // (contentMode: 'youtube') embeds via react-native-webview and is a
          // documented-limited path.
          type: 'image',
          name: 'heroVideo',
          contentMode: 'video',
          imageLink:
            'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerBlazes.mp4',
          imageFit: 'contain',
          imageWidth: '240',
          imageHeight: '135',
          altText: 'Sample video (contentMode: video, task 5.5)',
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
        {
          // matrixdropdown (M3 3.3a/3.3b — static rows over renderedTable):
          // chrome-less per-cell question dispatch (dropdown cell opens the
          // overlay sheet, text cell drafts/commits, boolean toggles), a
          // showInMultipleColumns exploded checkbox column (one item per
          // cell), a per-column totals footer (read-only expression cells),
          // and a per-row DETAIL PANEL (detailPanelMode: underRow) whose
          // toggle expands the `detailElements` under the row (3.3b).
          type: 'matrixdropdown',
          name: 'teams',
          title: 'Team assessment (matrixdropdown)',
          totalText: 'Totals',
          detailPanelMode: 'underRow',
          detailElements: [
            { type: 'text', name: 'owner', title: 'Owner' },
            {
              type: 'comment',
              name: 'notes',
              title: 'Notes',
              startWithNewLine: false,
            },
          ],
          columns: [
            {
              name: 'lead',
              title: 'Lead',
              cellType: 'dropdown',
              choices: ['Ada', 'Grace', 'Linus'],
            },
            {
              name: 'headcount',
              title: 'Headcount',
              cellType: 'text',
              inputType: 'number',
              totalType: 'sum',
            },
            { name: 'onTrack', title: 'On track?', cellType: 'boolean' },
            {
              name: 'platforms',
              title: 'Platforms',
              cellType: 'checkbox',
              showInMultipleColumns: true,
              choices: ['iOS', 'Android'],
            },
          ],
          rows: [
            { value: 'design', text: 'Design' },
            { value: 'engineering', text: 'Engineering' },
          ],
        },
        {
          // matrixdynamic (M3 3.4 — dynamic rows): add-row button driven by
          // renderedTable.showAddRowOnBottom, per-row remove buttons via
          // removeRowUI with confirmDelete routed through the 2.2 RN dialog
          // adapter, min/maxRowCount gating both affordances (remove hidden
          // at min, add hidden at max). M4 4.3 — allowRowsDragAndDrop adds
          // the per-row drag handle (accessible move-up/down + device-gated
          // Pan) driving core's moveRowByIndex.
          type: 'matrixdynamic',
          name: 'milestonesPlan',
          title: 'Release milestones (matrixdynamic)',
          confirmDelete: true,
          allowRowsDragAndDrop: true,
          rowCount: 2,
          minRowCount: 1,
          maxRowCount: 4,
          columns: [
            { name: 'milestone', title: 'Milestone', cellType: 'text' },
            {
              name: 'status',
              title: 'Status',
              cellType: 'dropdown',
              choices: ['Planned', 'In progress', 'Done'],
            },
          ],
        },
        {
          // matrixdynamic empty state (M3 3.4 §3e): hideColumnsIfEmpty +
          // rowCount 0 renders the noRowsText placeholder whose add button
          // gates on the STANDALONE renderedTable.showAddRow — the first
          // row is added from the placeholder itself.
          type: 'matrixdynamic',
          name: 'openIssues',
          title: 'Open issues (matrixdynamic, empty state)',
          rowCount: 0,
          minRowCount: 0,
          hideColumnsIfEmpty: true,
          noRowsText: 'No issues filed yet — add the first one.',
          columns: [{ name: 'summary', title: 'Summary', cellType: 'text' }],
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
          // presses surface through the Survey-level onLinkPress handler
          // wired in App.tsx ({url, context}); the HOST decides whether
          // to navigate — this library never calls Linking.openURL.
          type: 'html',
          name: 'htmlContent',
          html: '<p>The <code>html</code> question type renders rich content natively via the sanitized HTML pipeline: <strong>bold</strong>, <em>italic</em>, and <a href="https://surveyjs.io">links</a> (the renderer never auto-navigates; a press surfaces a {url, context} event to the onLinkPress handler this example logs to the console).</p>',
        },
        {
          // Ranking is SUPPORTED as of task 4.1 — drag-to-reorder (gesture-
          // handler + reanimated) with accessible move-up/move-down controls;
          // reorder is driven through the core model so value/events stay
          // core-correct.
          type: 'ranking',
          name: 'priorities',
          title:
            'Drag to rank these priorities (ranking — supported in RN as of 4.1)',
          choices: ['Performance', 'Bundle size', 'Developer experience'],
        },
        {
          // selectToRank mode — two areas (unranked ↔ ranked); moving an item
          // between areas + reorder-within-ranked drive the same core model.
          type: 'ranking',
          name: 'featureShortlist',
          title: 'Select and rank the features you care about (selectToRank)',
          selectToRankEnabled: true,
          choices: [
            'Offline mode',
            'Dark theme',
            'Push notifications',
            'Biometric login',
          ],
        },
        {
          // slider — SUPPORTED in RN as of task 4.4. Single-thumb wraps the
          // batteries-included @react-native-community/slider (native); a11y
          // adjustable stepper fallback when the peer is absent.
          type: 'slider',
          name: 'volume',
          title: 'Volume (slider — single-thumb, supported in RN as of 4.4)',
          min: 0,
          max: 100,
          step: 5,
          defaultValue: 40,
        },
        {
          // Range dual-thumb: a custom track with two a11y adjustable thumbs;
          // the fine drag (gesture-handler Pan) is a device gate. allowSwap +
          // spacing enforced through the core model.
          type: 'slider',
          name: 'priceRange',
          title: 'Price range (slider — range dual-thumb)',
          sliderType: 'range',
          min: 0,
          max: 1000,
          step: 50,
          defaultValue: [200, 800],
        },
        {
          // signaturepad — SUPPORTED in RN as of task 5.1. Wraps the
          // batteries-included react-native-signature-canvas (a WebView
          // signature pad); onOK commits the data-URL value in the EXACT web
          // format (keyed to dataFormat), read-only shows the stored image,
          // and the clear control drives clearValue. Absent the peer it
          // degrades to a non-throwing static image + diagnostic.
          type: 'signaturepad',
          name: 'signature',
          title: 'Sign here (signaturepad — supported in RN as of 5.1)',
          penColor: '#1f6feb',
          signatureWidth: 320,
          signatureHeight: 180,
        },
        {
          // file — SUPPORTED in RN as of task 5.2. Drives the batteries-
          // included native pickers (expo-document-picker for files,
          // expo-image-picker launchCameraAsync for the camera); sourceType
          // 'file-camera' offers both. storeDataAsText (default) stores each
          // pick as a base64 {name,type,content}; image files preview as
          // thumbnails, others as a name decorator; multiple files paginate.
          // Absent the picker peers the choose action degrades to a disabled
          // button + diagnostic (invariant 9). Install expo-image-picker +
          // expo-document-picker in the example to enable choosing on-device.
          type: 'file',
          name: 'attachments',
          title: 'Attach files (file — supported in RN as of 5.2)',
          sourceType: 'file-camera',
          allowMultiple: true,
          allowImagesPreview: true,
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
