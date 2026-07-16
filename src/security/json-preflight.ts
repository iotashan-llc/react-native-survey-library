/**
 * Pre-model URL preflight (design: docs/design/1.1-survey-root.md,
 * "Pre-model URL preflight (A11)").
 *
 * `choicesByUrl` fires its network request AT MODEL CONSTRUCTION
 * (`ChoicesRestful` opens the request before `onBeforeRequestChoices` —
 * A11 rationale), so render-time enforcement is too late: the Survey
 * root's json path calls this BEFORE `new Model(json)`.
 *
 * Pure function, no side effects. Fail-closed by STRIPPING the offending
 * property on a copy-on-write structural clone:
 * - the consumer's object is NEVER mutated ("JSON unmodified" contract);
 * - when nothing is stripped, the ORIGINAL reference is returned
 *   (zero-cost hot path — callers may compare identity);
 * - each strip yields one `survey-json-blocked-url` diagnostic, returned
 *   as pure data (the Survey root forwards through the 0.5 seam).
 *
 * Valid URLs pass through AS AUTHORED (not canonical-rewritten): for
 * `choicesByUrl` the fetch sink is survey-core itself, which cannot be
 * handed our canonical string; render-time sinks this library owns
 * re-validate and consume the canonical form per 0.9 (defense in depth).
 * Documented residual gap (DIFFERENCES.md): core-owned fetches cannot
 * enforce the manual-redirect rule from outside — the empirical abort
 * gate is task 2.3's deliverable. Preflight guarantees the scheme/origin
 * policy only.
 *
 * Non-string and empty-string values in URL positions are IGNORED (core
 * makes no request for them; stripping would be noise, not security).
 * HTML-bearing fields are not preflighted here — the render-time
 * sanitizer + press-time revalidation own those (0.9); `link` context is
 * human-mediated by definition.
 */
import { lintChoicesByUrlTemplate, validateUri } from './uri-policy';
import type { UriContext, UriPolicyConfig } from './uri-policy';

export interface PreflightDiagnostic {
  code: 'survey-json-blocked-url';
  path: string;
  context: UriContext;
  reason: string;
}

export interface PreflightResult {
  /** The original reference when nothing was stripped; otherwise a
   * structural clone along the touched paths (untouched subtrees keep
   * their original references). */
  json: unknown;
  diagnostics: PreflightDiagnostic[];
}

type JsonObject = Record<string, unknown>;

function isJsonObject(value: unknown): value is JsonObject {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Container keys recursed on every element node. `questions` is the
 * legacy alias survey-core's deserializer still honors — skipping it
 * would be a policy bypass, not a feature gap. `columns` carries
 * matrixdropdown/matrixdynamic column definitions (each can hold its own
 * `choicesByUrl`) and `detailElements` their detail-panel questions —
 * both are question-bearing containers (review round 1 CRITICAL). */
const CHILD_ARRAY_KEYS = [
  'elements',
  'templateElements',
  'questions',
  'columns',
  'detailElements',
] as const;

export function preflightSurveyJson(
  json: unknown,
  config?: UriPolicyConfig
): PreflightResult {
  const diagnostics: PreflightDiagnostic[] = [];
  if (!isJsonObject(json)) {
    return { json, diagnostics };
  }

  /** True when `value` occupies a URL position and fails policy. */
  function shouldStrip(
    value: unknown,
    context: UriContext,
    path: string
  ): boolean {
    if (typeof value !== 'string' || value.length === 0) return false;
    // JSON-time template lint FIRST (review round 1 CRITICAL): a
    // substitution in the scheme/authority position (`{scheme}://…`,
    // `//{host}/…`) can validate as base-relative under a configured
    // baseUrl yet expand into a hostile ABSOLUTE request when core
    // substitutes it — validateUri alone cannot see that.
    if (context === 'choicesByUrl') {
      const lint = lintChoicesByUrlTemplate(value);
      if (!lint.ok) {
        diagnostics.push({
          code: 'survey-json-blocked-url',
          path,
          context,
          reason: lint.reason ?? 'template-lint-failed',
        });
        return true;
      }
    }
    const result = validateUri(value, context, config);
    if (result.ok) return false;
    diagnostics.push({
      code: 'survey-json-blocked-url',
      path,
      context,
      reason: result.reason,
    });
    return true;
  }

  /** Copy-on-write node processor: returns the ORIGINAL node when the
   * whole subtree is untouched, a shallow-copied node otherwise. Handles
   * surveys, pages, panels, and questions uniformly — keys a node type
   * doesn't carry are simply absent. */
  function processNode(node: unknown, path: string): unknown {
    if (!isJsonObject(node)) return node;
    let out: JsonObject = node;
    const ensure = (): JsonObject => {
      if (out === node) out = { ...node };
      return out;
    };

    const prefix = path.length > 0 ? `${path}.` : '';

    // choicesByUrl — legacy string form or object form with `url`.
    const choicesByUrl = node.choicesByUrl;
    if (typeof choicesByUrl === 'string') {
      if (shouldStrip(choicesByUrl, 'choicesByUrl', `${prefix}choicesByUrl`)) {
        delete ensure().choicesByUrl;
      }
    } else if (isJsonObject(choicesByUrl)) {
      if (
        shouldStrip(
          choicesByUrl.url,
          'choicesByUrl',
          `${prefix}choicesByUrl.url`
        )
      ) {
        delete ensure().choicesByUrl;
      }
    }

    // imageLink — image question / imagepicker choice media. `contentMode:
    // 'video'` switches the sink context (expo-video vs image pipeline).
    const mediaContext: UriContext =
      node.contentMode === 'video' ? 'video' : 'image';
    if (shouldStrip(node.imageLink, mediaContext, `${prefix}imageLink`)) {
      delete ensure().imageLink;
    }

    // choices[] — object items may carry per-choice imageLink.
    const choices = node.choices;
    if (Array.isArray(choices)) {
      let newChoices: unknown[] | null = null;
      choices.forEach((choice, i) => {
        if (!isJsonObject(choice)) return;
        if (
          shouldStrip(
            choice.imageLink,
            mediaContext,
            `${prefix}choices[${i}].imageLink`
          )
        ) {
          if (!newChoices) newChoices = [...choices];
          const cleanChoice = { ...choice };
          delete cleanChoice.imageLink;
          newChoices[i] = cleanChoice;
        }
      });
      if (newChoices) ensure().choices = newChoices;
    }

    // Child containers (pages handled by the caller; panels/dynamic
    // templates handled here).
    for (const key of CHILD_ARRAY_KEYS) {
      const children = node[key];
      if (Array.isArray(children)) {
        const processed = processNodeArray(children, `${prefix}${key}`);
        if (processed !== children) ensure()[key] = processed;
      }
    }

    return out;
  }

  /** Copy-on-write array map: original reference iff every item is untouched. */
  function processNodeArray(items: unknown[], basePath: string): unknown[] {
    let out: unknown[] = items;
    items.forEach((item, i) => {
      const processed = processNode(item, `${basePath}[${i}]`);
      if (processed !== item) {
        if (out === items) out = [...items];
        out[i] = processed;
      }
    });
    return out;
  }

  let out: JsonObject = json;
  const ensureRoot = (): JsonObject => {
    if (out === json) out = { ...(json as JsonObject) };
    return out;
  };

  if (shouldStrip(json.logo, 'image', 'logo')) {
    delete ensureRoot().logo;
  }
  if (shouldStrip(json.backgroundImage, 'background', 'backgroundImage')) {
    delete ensureRoot().backgroundImage;
  }

  const pages = json.pages;
  if (Array.isArray(pages)) {
    const processed = processNodeArray(pages, 'pages');
    if (processed !== pages) ensureRoot().pages = processed;
  }
  for (const key of CHILD_ARRAY_KEYS) {
    const rootChildren = json[key];
    if (Array.isArray(rootChildren)) {
      const processed = processNodeArray(rootChildren, key);
      if (processed !== rootChildren) ensureRoot()[key] = processed;
    }
  }

  return { json: out, diagnostics };
}
