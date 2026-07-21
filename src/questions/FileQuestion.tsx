/**
 * `file` question (task 5.2) — RN port of survey-core's `QuestionFileModel`
 * + web `SurveyQuestionFile` (reactquestion_file.tsx + components/file/*).
 *
 * OWNERSHIP (invariant 3/6 — no re-derivation): survey-core owns the entire
 * file state machine. The renderer NEVER binds a picker result straight to
 * `question.value`; it converts each picked asset to a real `File` and calls
 * `question.loadFiles(files, sourceType)`. Core then validates
 * `maxSize`/`maxFiles`, reads each File to a base64 data URL on the default
 * `storeDataAsText` path (via the runtime `FileReader`) or hands the File[]
 * to the host's `onUploadFiles` handler otherwise, stores the value as
 * `[{ name, type, content }]`, mirrors it into `previewValue`, builds the
 * paged `renderedPages`, and drives `currentState`/`isUploading`. Every
 * property the renderer reads (previewValue, renderedPages, indexToShow,
 * showLoadingIndicator, fileNavigatorVisible, …) is a core getter observed
 * by the class-reactive base — a pick/remove/navigate re-renders for free.
 *
 * PICKERS (invariant 7 — batteries-included peerDependencies, LAZY-required):
 * `sourceType: "file"` → **expo-document-picker** `getDocumentAsync`;
 * `"camera"` → **expo-image-picker** `launchCameraAsync` (with a permission
 * prompt); `"file-camera"` → both actions. web's `<input type=file capture>`
 * + getUserMedia `<video>` pipeline has no RN analog, so the model's
 * camera/video methods (`startVideo`/`snapPicture`) are bypassed entirely —
 * a capture flows through `loadFiles(files, "camera")` exactly like web's
 * `snapPicture`. Each picked asset becomes a `File` via
 * `fetch(uri).blob()` → `new File(...)`, so `file.size` feeds core's
 * `maxSize` check and (storeDataAsText) core's `FileReader` reads the real
 * bytes to the base64 the value stores. The native pickers + the
 * `fetch(file://)` blob read are a DEVICE gate (the peers are not installed
 * here; jest drives OUR contract through the pickers' root manual mocks).
 *
 * PREVIEW (invariant 8): image files (`canPreviewImage` = `allowImagesPreview`
 * + a `data:image`/`image-*` file) render a thumbnail through the central URI
 * policy in the `image` context (fail-closed; a blocked or oversized `data:`
 * image drops the thumbnail to the file decorator + an `image-uri-blocked`
 * diagnostic). Non-image files render a name decorator. Multiple files
 * paginate through core's `fileNavigator` (pageSize defaults to 1 headlessly —
 * web's responsive page-fit needs DOM measurement the RN port does not do).
 *
 * FALLBACK (invariant 9): when the picker peer needed for the current
 * `sourceType` is absent — jest without it, or a consumer who has not
 * installed it — the loader resolves null and the choose action degrades to a
 * non-throwing DISABLED button + a `file-picker-lib-unavailable` diagnostic,
 * never a crash (mirroring SignaturePad/ImageMap).
 */
import * as React from 'react';
import { ActivityIndicator, Image, Pressable, Text, View } from 'react-native';
import type { Base, Question } from '../core/facade';
import { QuestionElementBase } from '../reactivity/QuestionElementBase';
import type { QuestionElementBaseProps } from '../reactivity/QuestionElementBase';
import { validateUri } from '../security/uri-policy';
import type { UriPolicyConfig } from '../security/uri-policy';
import { UriPolicyContext } from '../security/UriPolicyContext';
import { reportDiagnostic } from '../diagnostics';
import { composeStyles } from '../theme-rn/recipes/types';
import type { FileRecipe } from '../theme-rn/recipes/file';
import type { FileStyleOverrides } from '../theme-rn/overrides';

// ————————————————————————————————————————————————————————————————
// Model slice (never re-derived — invariant 6)
// ————————————————————————————————————————————————————————————————

interface FileValueItem {
  name: string;
  type?: string;
  content?: string;
}

interface FilePageLike {
  id: string;
  items: FileValueItem[];
}

interface FileModel extends Question {
  name: string;
  sourceType: string;
  allowMultiple: boolean;
  storeDataAsText: boolean;
  allowImagesPreview: boolean;
  acceptedTypes: string;
  renderedAcceptedTypes: string | undefined;
  imageWidth: string;
  imageHeight: string;
  previewValue: FileValueItem[];
  renderedPages: FilePageLike[];
  indexToShow: number;
  containsMultiplyFiles: boolean;
  isInputReadOnly: boolean;
  value: FileValueItem[] | undefined;
  chooseButtonText: string;
  removeFileCaption: string;
  noFileChosenCaption: string;
  showLoadingIndicator: boolean;
  showFileDecorator: boolean;
  allowShowPreview: boolean;
  showPreviewContainer: boolean;
  fileNavigatorVisible: boolean;
  fileNavigator: { actions: FileNavigatorAction[] };
  canPreviewImage(item: FileValueItem): boolean;
  loadFiles(files: unknown[], sourceType?: string): void;
  removeFile(name: string): void;
}

interface FileNavigatorAction {
  id: string;
  title?: string;
  action?: () => void;
}

// ————————————————————————————————————————————————————————————————
// Picked-asset shapes (expo-document-picker / expo-image-picker)
// ————————————————————————————————————————————————————————————————

interface PickedAsset {
  uri: string;
  name?: string;
  fileName?: string;
  mimeType?: string;
}

interface PickerResult {
  canceled: boolean;
  assets: PickedAsset[] | null;
}

interface DocumentPickerModule {
  getDocumentAsync(options?: unknown): Promise<PickerResult>;
}

interface ImagePickerModule {
  launchCameraAsync(options?: unknown): Promise<PickerResult>;
  requestCameraPermissionsAsync?: () => Promise<{ granted?: boolean }>;
  MediaTypeOptions?: { Images?: unknown };
}

// ————————————————————————————————————————————————————————————————
// Capability loaders (lazy-required; absent -> non-throwing fallback)
// ————————————————————————————————————————————————————————————————

let cachedDocumentPicker: DocumentPickerModule | null | undefined;

/**
 * Lazy-require `expo-document-picker` (invariant 7). Returns null when the
 * peer is unavailable (jest without it, or a consumer who has not installed
 * the batteries-included peer) — the caller then renders the disabled-choose
 * fallback. Memoized per module registry.
 */
export function loadDocumentPicker(): DocumentPickerModule | null {
  if (cachedDocumentPicker !== undefined) return cachedDocumentPicker;
  try {
    const mod = require('expo-document-picker') as Record<string, unknown>;
    cachedDocumentPicker =
      typeof mod.getDocumentAsync === 'function'
        ? (mod as unknown as DocumentPickerModule)
        : null;
  } catch {
    cachedDocumentPicker = null;
  }
  return cachedDocumentPicker;
}

let cachedImagePicker: ImagePickerModule | null | undefined;

/**
 * Lazy-require `expo-image-picker` (invariant 7). Returns null when the peer
 * is unavailable — the caller then renders the disabled-camera fallback.
 * Memoized per module registry.
 */
export function loadImagePicker(): ImagePickerModule | null {
  if (cachedImagePicker !== undefined) return cachedImagePicker;
  try {
    const mod = require('expo-image-picker') as Record<string, unknown>;
    cachedImagePicker =
      typeof mod.launchCameraAsync === 'function'
        ? (mod as unknown as ImagePickerModule)
        : null;
  } catch {
    cachedImagePicker = null;
  }
  return cachedImagePicker;
}

// ————————————————————————————————————————————————————————————————
// Asset -> File conversion (device gate: fetch(file://).blob())
// ————————————————————————————————————————————————————————————————

/**
 * Turn a picked asset into a real `File` so core's `storeDataAsText`
 * `FileReader` path reads the true bytes (and `file.size` feeds `maxSize`).
 * `fetch(uri).blob()` is the standard RN idiom for reading a local `file://`
 * (or `content://`/`data:`) resource into a Blob; a `File` is preferred when
 * the runtime provides the constructor, else a name-annotated Blob.
 */
async function assetToFile(asset: PickedAsset): Promise<unknown> {
  const name = asset.name ?? asset.fileName ?? 'file';
  const res = await fetch(asset.uri);
  const blob = await res.blob();
  const type = asset.mimeType ?? blob.type ?? '';
  if (typeof File === 'function') {
    return new File([blob], name, { type });
  }
  return Object.assign(blob, { name });
}

// ————————————————————————————————————————————————————————————————
// Preview item (function child — consumes UriPolicyContext, invariant 8)
// ————————————————————————————————————————————————————————————————

function FilePreviewItem(props: {
  question: FileModel;
  item: FileValueItem;
  recipe: FileRecipe;
  slots: FileStyleOverrides | undefined;
  readOnly: boolean;
  uriConfig: UriPolicyConfig | undefined;
}): React.JSX.Element {
  const { question, item, recipe, slots, readOnly, uriConfig } = props;
  const contextPolicy = React.useContext(UriPolicyContext);
  const policy = uriConfig ?? contextPolicy;

  const canImage = question.canPreviewImage(item);
  const raw = item.content ?? '';
  const result = canImage ? validateUri(raw, 'image', policy) : null;
  const showThumb = canImage && result?.ok === true;
  const blockedReason =
    canImage && result && !result.ok ? result.reason : undefined;

  React.useEffect(() => {
    if (blockedReason !== undefined) {
      reportDiagnostic({
        code: 'image-uri-blocked',
        source: 'file-question',
        uri: raw,
        reason: blockedReason,
      });
    }
  }, [raw, blockedReason, policy]);

  const width = numericSize(question.imageWidth) ?? recipe.defaultImageWidth;
  const height = numericSize(question.imageHeight) ?? recipe.defaultImageHeight;
  const qName = question.name;

  return (
    <View
      testID={`sv-file-item-${qName}-${item.name}`}
      style={composeStyles(recipe.fragments.item, { override: slots?.item })}
    >
      {showThumb && result?.ok ? (
        <Image
          testID={`sv-file-thumb-${qName}-${item.name}`}
          source={{ uri: result.canonical }}
          resizeMode="contain"
          accessibilityLabel={item.name}
          style={[
            recipe.fragments.thumbnail,
            { width, height },
            slots?.thumbnail,
          ]}
        />
      ) : (
        <View
          testID={`sv-file-decorator-${qName}-${item.name}`}
          style={composeStyles(recipe.fragments.decorator, {
            override: slots?.decorator,
          })}
        >
          <Text
            style={composeStyles(recipe.fragments.fileName, {
              override: slots?.fileName,
            })}
          >
            {item.name}
          </Text>
        </View>
      )}
      {showThumb ? (
        <Text
          style={composeStyles(recipe.fragments.fileName, {
            override: slots?.fileName,
          })}
        >
          {item.name}
        </Text>
      ) : null}
      {!readOnly ? (
        <Pressable
          testID={`sv-file-remove-${qName}-${item.name}`}
          accessibilityRole="button"
          accessibilityLabel={question.removeFileCaption}
          onPress={() => question.removeFile(item.name)}
          style={composeStyles(recipe.fragments.removeButton, {
            override: slots?.removeButton,
          })}
        >
          <Text style={recipe.fragments.removeButtonText}>
            {question.removeFileCaption}
          </Text>
        </Pressable>
      ) : null}
    </View>
  );
}

/** Parse a core `imageWidth`/`imageHeight` string (e.g. "80", "80px") to a
 * plain number of px; undefined when unset/non-numeric (recipe default used). */
function numericSize(value: string | undefined): number | undefined {
  if (!value) return undefined;
  const n = Number.parseFloat(value);
  return Number.isFinite(n) ? n : undefined;
}

// ————————————————————————————————————————————————————————————————
// The class-reactive question renderer
// ————————————————————————————————————————————————————————————————

export interface FileQuestionProps extends QuestionElementBaseProps {
  /** Explicit override; otherwise the survey-scoped context applies (previews). */
  uriConfig?: UriPolicyConfig;
}

export class FileQuestion extends QuestionElementBase<FileQuestionProps> {
  private reportedPickerModes = new Set<string>();

  protected getStateElement(): Base {
    return this.questionBase;
  }

  private get file(): FileModel {
    return this.questionBase as unknown as FileModel;
  }

  componentDidMount(): void {
    super.componentDidMount();
    this.flushPickerDiagnostic();
  }

  componentDidUpdate(): void {
    super.componentDidUpdate();
    this.flushPickerDiagnostic();
  }

  /** Commit-phase (never render-phase) diagnostic: when an EDITABLE question
   * would need a picker the peer for its sourceType cannot provide. Deduped
   * per sourceType per instance. */
  private flushPickerDiagnostic(): void {
    const q = this.file;
    if (q.isInputReadOnly || this.isDisplayMode) return;
    const sourceType = q.sourceType || 'file';
    if (this.reportedPickerModes.has(sourceType)) return;
    const needsFile = sourceType !== 'camera';
    const needsCamera = sourceType === 'camera' || sourceType === 'file-camera';
    const missing =
      (needsFile && !loadDocumentPicker()) ||
      (needsCamera && !loadImagePicker());
    if (!missing) return;
    this.reportedPickerModes.add(sourceType);
    reportDiagnostic({
      code: 'file-picker-lib-unavailable',
      questionName: q.name,
      sourceType,
    });
  }

  private chooseFile = async (): Promise<void> => {
    const q = this.file;
    if (q.isInputReadOnly || this.isDisplayMode) return;
    const picker = loadDocumentPicker();
    if (!picker) return;
    try {
      const acceptedTypes = q.renderedAcceptedTypes;
      const result = await picker.getDocumentAsync({
        type: acceptedTypes
          ? acceptedTypes
              .split(',')
              .map((t) => t.trim())
              .filter(Boolean)
          : '*/*',
        multiple: q.allowMultiple,
        copyToCacheDirectory: true,
      });
      await this.ingest(result, 'file');
    } catch {
      // Non-throwing: a picker/convert failure must never break the survey.
    }
  };

  private captureCamera = async (): Promise<void> => {
    const q = this.file;
    if (q.isInputReadOnly || this.isDisplayMode) return;
    const picker = loadImagePicker();
    if (!picker) return;
    try {
      if (typeof picker.requestCameraPermissionsAsync === 'function') {
        const perm = await picker.requestCameraPermissionsAsync();
        if (perm && perm.granted === false) return;
      }
      const mediaTypes = picker.MediaTypeOptions?.Images ?? ['images'];
      const result = await picker.launchCameraAsync({ mediaTypes, quality: 1 });
      await this.ingest(result, 'camera');
    } catch {
      // Non-throwing.
    }
  };

  private async ingest(
    result: PickerResult | undefined,
    sourceType: 'file' | 'camera'
  ): Promise<void> {
    if (!result || result.canceled) return;
    const assets = result.assets ?? [];
    if (assets.length === 0) return;
    const files: unknown[] = [];
    for (const asset of assets) {
      files.push(await assetToFile(asset));
    }
    this.file.loadFiles(files, sourceType);
  }

  protected renderElement(): React.JSX.Element {
    const q = this.file;
    const { recipes, styles: overrides } = this.themeContext;
    const recipe = recipes.file;
    const slots = overrides.file;
    const readOnly = q.isInputReadOnly || this.isDisplayMode;

    const showFileAction = q.sourceType !== 'camera';
    const showCameraAction =
      q.sourceType === 'camera' || q.sourceType === 'file-camera';
    const fileEnabled = !!loadDocumentPicker();
    const cameraEnabled = !!loadImagePicker();

    const items = q.renderedPages.flatMap((page) => page.items ?? []);
    const hasPreview = q.allowShowPreview && q.showPreviewContainer;

    return (
      <View
        testID={`sv-file-${q.name}`}
        accessibilityLabel={q.title}
        style={composeStyles(recipe.fragments.root, { override: slots?.root })}
      >
        {q.showLoadingIndicator ? (
          <View
            testID={`sv-file-loading-${q.name}`}
            style={recipe.fragments.loading}
          >
            <ActivityIndicator color={recipe.loadingColor} />
          </View>
        ) : null}

        {!readOnly ? (
          <View
            style={composeStyles(recipe.fragments.actions, {
              override: slots?.actions,
            })}
          >
            {showFileAction
              ? this.renderChooseButton(
                  'file',
                  `sv-file-choose-${q.name}`,
                  q.chooseButtonText,
                  fileEnabled,
                  this.chooseFile,
                  recipe,
                  slots
                )
              : null}
            {showCameraAction
              ? this.renderChooseButton(
                  'camera',
                  `sv-file-camera-${q.name}`,
                  q.chooseButtonText,
                  cameraEnabled,
                  this.captureCamera,
                  recipe,
                  slots
                )
              : null}
          </View>
        ) : null}

        {hasPreview
          ? items.map((item) => (
              <FilePreviewItem
                key={item.name}
                question={q}
                item={item}
                recipe={recipe}
                slots={slots}
                readOnly={readOnly}
                uriConfig={this.props.uriConfig}
              />
            ))
          : null}

        {hasPreview && q.fileNavigatorVisible
          ? this.renderNavigator(q, recipe, slots)
          : null}

        {readOnly && !q.showPreviewContainer ? (
          <View
            testID={`sv-file-placeholder-${q.name}`}
            style={composeStyles(recipe.fragments.placeholder, {
              override: slots?.placeholder,
            })}
          >
            <Text style={recipe.fragments.placeholderText}>
              {q.noFileChosenCaption}
            </Text>
          </View>
        ) : null}
      </View>
    );
  }

  private renderChooseButton(
    mode: 'file' | 'camera',
    testID: string,
    caption: string,
    enabled: boolean,
    onPress: () => void,
    recipe: FileRecipe,
    slots: FileStyleOverrides | undefined
  ): React.JSX.Element {
    return (
      <Pressable
        key={mode}
        testID={testID}
        accessibilityRole="button"
        accessibilityLabel={caption}
        accessibilityState={{ disabled: !enabled }}
        disabled={!enabled}
        onPress={() => {
          if (enabled) onPress();
        }}
        style={composeStyles(recipe.fragments.chooseButton, {
          theme: enabled ? undefined : recipe.fragments.chooseButtonDisabled,
          override: slots?.chooseButton,
        })}
      >
        <Text
          style={composeStyles(recipe.fragments.chooseButtonText, {
            override: slots?.chooseButtonText,
          })}
        >
          {caption}
        </Text>
      </Pressable>
    );
  }

  private renderNavigator(
    q: FileModel,
    recipe: FileRecipe,
    slots: FileStyleOverrides | undefined
  ): React.JSX.Element {
    const actions = q.fileNavigator.actions;
    const prev = actions.find((a) => a.id === 'prevPage');
    const next = actions.find((a) => a.id === 'nextPage');
    const index = actions.find((a) => a.id === 'fileIndex');
    return (
      <View
        testID={`sv-file-nav-${q.name}`}
        style={composeStyles(recipe.fragments.navigator, {
          override: slots?.navigator,
        })}
      >
        <Pressable
          testID={`sv-file-nav-prev-${q.name}`}
          accessibilityRole="button"
          onPress={() => prev?.action?.()}
          style={recipe.fragments.navButton}
        >
          <Text style={recipe.fragments.navButtonText}>‹</Text>
        </Pressable>
        <Text
          testID={`sv-file-nav-index-${q.name}`}
          style={recipe.fragments.navIndexText}
        >
          {index?.title ?? ''}
        </Text>
        <Pressable
          testID={`sv-file-nav-next-${q.name}`}
          accessibilityRole="button"
          onPress={() => next?.action?.()}
          style={recipe.fragments.navButton}
        >
          <Text style={recipe.fragments.navButtonText}>›</Text>
        </Pressable>
      </View>
    );
  }
}
