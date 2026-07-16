/**
 * Pre-model URL preflight (design: docs/design/1.1-survey-root.md,
 * "Pre-model URL preflight (A11)"; test plan #1). Pure function — no
 * side effects, diagnostics returned as data (the Survey root forwards
 * them through the 0.5 seam). `choicesByUrl` fires its network request
 * at model construction, so this MUST run before `new Model(json)`.
 */
import { preflightSurveyJson } from '../json-preflight';
import type { PreflightDiagnostic } from '../json-preflight';

const ALLOWED = { allowedOrigins: ['https://api.example.com'] };

function blockedOf(diagnostics: PreflightDiagnostic[]): string[] {
  return diagnostics.map((d) => `${d.path}|${d.context}|${d.reason}`).sort();
}

describe('preflightSurveyJson', () => {
  describe('choicesByUrl', () => {
    it('strips a disallowed choicesByUrl (object form) on a clone, with a diagnostic, leaving the input unmutated', () => {
      const json = {
        pages: [
          {
            elements: [
              {
                type: 'dropdown',
                name: 'q1',
                choicesByUrl: {
                  url: 'https://evil.example/countries',
                  valueName: 'name',
                },
              },
            ],
          },
        ],
      };
      const snapshot = JSON.parse(JSON.stringify(json));

      const { json: clean, diagnostics } = preflightSurveyJson(json);

      expect(json).toEqual(snapshot); // consumer object never mutated
      expect(clean).not.toBe(json);
      const q = (clean as typeof json).pages[0]!.elements[0]!;
      expect(q).not.toHaveProperty('choicesByUrl');
      expect(q.name).toBe('q1'); // sibling fields survive
      expect(blockedOf(diagnostics)).toEqual([
        'pages[0].elements[0].choicesByUrl.url|choicesByUrl|origin-not-allowlisted',
      ]);
    });

    it('returns the ORIGINAL reference and no diagnostics when every URL passes policy', () => {
      const json = {
        elements: [
          {
            type: 'dropdown',
            name: 'q1',
            choicesByUrl: { url: 'https://api.example.com/countries' },
          },
        ],
      };
      const result = preflightSurveyJson(json, ALLOWED);
      expect(result.json).toBe(json);
      expect(result.diagnostics).toEqual([]);
    });

    it('strips the legacy string form of choicesByUrl', () => {
      const json = {
        elements: [
          {
            type: 'checkbox',
            name: 'q1',
            choicesByUrl: 'https://evil.example/items',
          },
        ],
      };
      const { json: clean, diagnostics } = preflightSurveyJson(json);
      expect((clean as typeof json).elements[0]).not.toHaveProperty(
        'choicesByUrl'
      );
      expect(blockedOf(diagnostics)).toEqual([
        'elements[0].choicesByUrl|choicesByUrl|origin-not-allowlisted',
      ]);
    });
  });

  describe('survey-level URLs', () => {
    it('strips a disallowed logo (image context) and backgroundImage (background context)', () => {
      const json = {
        logo: 'https://evil.example/logo.png',
        backgroundImage: 'http://api.example.com/bg.png', // http => scheme-not-allowed even if origin listed
        elements: [{ type: 'text', name: 'q1' }],
      };
      const { json: clean, diagnostics } = preflightSurveyJson(json, ALLOWED);
      expect(clean).not.toHaveProperty('logo');
      expect(clean).not.toHaveProperty('backgroundImage');
      expect(blockedOf(diagnostics)).toEqual([
        'backgroundImage|background|scheme-not-allowed',
        'logo|image|origin-not-allowlisted',
      ]);
    });

    it('lets a policy-conformant data: image logo through untouched', () => {
      // 1x1 transparent PNG
      const json = {
        logo: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
        elements: [{ type: 'text', name: 'q1' }],
      };
      const result = preflightSurveyJson(json);
      expect(result.json).toBe(json);
      expect(result.diagnostics).toEqual([]);
    });
  });

  describe('imageLink', () => {
    it('strips a disallowed image-question imageLink (image context)', () => {
      const json = {
        elements: [
          {
            type: 'image',
            name: 'img1',
            imageLink: 'https://evil.example/pic.png',
          },
        ],
      };
      const { json: clean, diagnostics } = preflightSurveyJson(json);
      expect((clean as typeof json).elements[0]).not.toHaveProperty(
        'imageLink'
      );
      expect(blockedOf(diagnostics)).toEqual([
        'elements[0].imageLink|image|origin-not-allowlisted',
      ]);
    });

    it('strips only the offending imagepicker choice imageLink, keeping the choice and its siblings', () => {
      const json = {
        elements: [
          {
            type: 'imagepicker',
            name: 'pick',
            choices: [
              {
                value: 'ok',
                imageLink: 'https://api.example.com/ok.png',
              },
              {
                value: 'bad',
                imageLink: 'https://evil.example/bad.png',
              },
            ],
          },
        ],
      };
      const { json: clean, diagnostics } = preflightSurveyJson(json, ALLOWED);
      const choices = (clean as typeof json).elements[0]!.choices;
      expect(choices[0]).toEqual({
        value: 'ok',
        imageLink: 'https://api.example.com/ok.png',
      });
      expect(choices[1]).toEqual({ value: 'bad' });
      expect(blockedOf(diagnostics)).toEqual([
        'elements[0].choices[1].imageLink|image|origin-not-allowlisted',
      ]);
    });

    it("uses the video context when the owning element's contentMode is 'video'", () => {
      const json = {
        elements: [
          {
            type: 'imagepicker',
            name: 'vids',
            contentMode: 'video',
            choices: [
              { value: 'v', imageLink: 'https://evil.example/clip.mp4' },
            ],
          },
        ],
      };
      const { diagnostics } = preflightSurveyJson(json);
      expect(blockedOf(diagnostics)).toEqual([
        'elements[0].choices[0].imageLink|video|origin-not-allowlisted',
      ]);
    });
  });

  describe('nesting', () => {
    it('walks panel elements and paneldynamic templateElements', () => {
      const json = {
        pages: [
          {
            elements: [
              {
                type: 'panel',
                name: 'p1',
                elements: [
                  {
                    type: 'dropdown',
                    name: 'inner',
                    choicesByUrl: { url: 'https://evil.example/a' },
                  },
                ],
              },
              {
                type: 'paneldynamic',
                name: 'pd1',
                templateElements: [
                  {
                    type: 'dropdown',
                    name: 'tmpl',
                    choicesByUrl: { url: 'https://evil.example/b' },
                  },
                ],
              },
            ],
          },
        ],
      };
      const { json: clean, diagnostics } = preflightSurveyJson(json);
      const page = (clean as typeof json).pages[0]!;
      expect(page.elements[0]!.elements![0]).not.toHaveProperty('choicesByUrl');
      expect(page.elements[1]!.templateElements![0]).not.toHaveProperty(
        'choicesByUrl'
      );
      expect(blockedOf(diagnostics)).toEqual([
        'pages[0].elements[0].elements[0].choicesByUrl.url|choicesByUrl|origin-not-allowlisted',
        'pages[0].elements[1].templateElements[0].choicesByUrl.url|choicesByUrl|origin-not-allowlisted',
      ]);
    });
  });

  it("walks the legacy 'questions' array alias for elements", () => {
    const json = {
      pages: [
        {
          questions: [
            {
              type: 'dropdown',
              name: 'legacy',
              choicesByUrl: { url: 'https://evil.example/legacy' },
            },
          ],
        },
      ],
    };
    const { json: clean, diagnostics } = preflightSurveyJson(json);
    expect((clean as typeof json).pages[0]!.questions[0]).not.toHaveProperty(
      'choicesByUrl'
    );
    expect(blockedOf(diagnostics)).toEqual([
      'pages[0].questions[0].choicesByUrl.url|choicesByUrl|origin-not-allowlisted',
    ]);
  });

  describe('choicesByUrl template lint (review round 1 CRITICAL)', () => {
    it('strips a template whose substitution sits in the scheme/authority position, even when a baseUrl would let it validate as relative', () => {
      // `{scheme}://evil.example/x` has no literal scheme, so validateUri
      // with a configured baseUrl can resolve it as base-relative and
      // pass — but at request time core substitutes the placeholder and
      // fetches a hostile ABSOLUTE URL. The JSON-time lint
      // (lintChoicesByUrlTemplate) must run FIRST and reject it.
      const json = {
        elements: [
          {
            type: 'dropdown',
            name: 'q1',
            choicesByUrl: { url: '{scheme}://evil.example/x' },
          },
        ],
      };
      const { json: clean, diagnostics } = preflightSurveyJson(json, {
        allowedOrigins: ['https://api.example.com'],
        baseUrl: 'https://api.example.com/data/',
      });
      const q = (clean as { elements: { choicesByUrl?: unknown }[] })
        .elements[0]!;
      expect(q.choicesByUrl).toBeUndefined();
      expect(blockedOf(diagnostics)).toEqual([
        'elements[0].choicesByUrl.url|choicesByUrl|substitution-in-authority-position',
      ]);
    });

    it('lints the legacy string form too', () => {
      const json = {
        elements: [
          {
            type: 'dropdown',
            name: 'q1',
            choicesByUrl: '//{host}/items',
          },
        ],
      };
      const { json: clean, diagnostics } = preflightSurveyJson(json, {
        allowedOrigins: ['https://api.example.com'],
        baseUrl: 'https://api.example.com/data/',
      });
      const q = (clean as { elements: { choicesByUrl?: unknown }[] })
        .elements[0]!;
      expect(q.choicesByUrl).toBeUndefined();
      expect(diagnostics).toHaveLength(1);
      expect(diagnostics[0]!.reason).toBe('substitution-in-authority-position');
    });

    it('a query-position substitution against an allowed origin still passes', () => {
      const json = {
        elements: [
          {
            type: 'dropdown',
            name: 'q1',
            choicesByUrl: { url: 'https://api.example.com/items?q={term}' },
          },
        ],
      };
      const result = preflightSurveyJson(json, ALLOWED);
      expect(result.json).toBe(json);
      expect(result.diagnostics).toEqual([]);
    });
  });

  describe('matrix columns (review round 1 CRITICAL: question-bearing containers)', () => {
    it('finds and strips a disallowed choicesByUrl inside matrixdropdown columns', () => {
      const json = {
        pages: [
          {
            elements: [
              {
                type: 'matrixdropdown',
                name: 'm1',
                columns: [
                  { name: 'plain' },
                  {
                    name: 'col2',
                    cellType: 'dropdown',
                    choicesByUrl: { url: 'https://evil.example/cells' },
                  },
                ],
                rows: ['r1'],
              },
            ],
          },
        ],
      };
      const snapshot = JSON.parse(JSON.stringify(json));
      const { json: clean, diagnostics } = preflightSurveyJson(json, ALLOWED);
      expect(json).toEqual(snapshot);
      type Col = { choicesByUrl?: unknown };
      const cols = (
        clean as {
          pages: { elements: { columns: Col[] }[] }[];
        }
      ).pages[0]!.elements[0]!.columns;
      expect(cols[1]!.choicesByUrl).toBeUndefined();
      expect(blockedOf(diagnostics)).toEqual([
        'pages[0].elements[0].columns[1].choicesByUrl.url|choicesByUrl|origin-not-allowlisted',
      ]);
    });

    it('matrixdynamic detailElements are traversed too', () => {
      const json = {
        elements: [
          {
            type: 'matrixdynamic',
            name: 'm2',
            columns: [{ name: 'c1' }],
            detailElements: [
              {
                type: 'dropdown',
                name: 'd1',
                choicesByUrl: { url: 'https://evil.example/detail' },
              },
            ],
          },
        ],
      };
      const { diagnostics } = preflightSurveyJson(json, ALLOWED);
      expect(blockedOf(diagnostics)).toEqual([
        'elements[0].detailElements[0].choicesByUrl.url|choicesByUrl|origin-not-allowlisted',
      ]);
    });
  });

  describe('robustness', () => {
    it.each([null, undefined, 'not-json', 42])(
      'returns non-object input %p untouched with no diagnostics',
      (input) => {
        const result = preflightSurveyJson(input);
        expect(result.json).toBe(input);
        expect(result.diagnostics).toEqual([]);
      }
    );

    it('ignores non-string URL-field values instead of throwing', () => {
      const json = {
        logo: 42,
        elements: [
          { type: 'dropdown', name: 'q1', choicesByUrl: { url: null } },
        ],
      };
      const result = preflightSurveyJson(json);
      expect(result.json).toBe(json);
      expect(result.diagnostics).toEqual([]);
    });
  });
});
