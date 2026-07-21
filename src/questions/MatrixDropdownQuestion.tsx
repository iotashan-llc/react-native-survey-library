/**
 * `matrixdropdown` (static rows) question — task M3 3.3a (design:
 * docs/design/M3-matrix-family-plan.md §2, §2b, §4, §6, phasing row 3.3a).
 * The whole rendering core lives in the shared `MatrixTableBase` (OUTER
 * stable-question subscriber + monotonic resetToken) / `MatrixTable`
 * (INNER renderedTable holder, no-undefined-commit) pair — matrixdropdown
 * adds NOTHING on top of the base: its rows are static, so there are no
 * add/remove affordances (those are 3.4 `MatrixDynamicQuestion`).
 *
 * The element wrapper is a thin pass-through (family shape, like
 * `MatrixQuestionElement`): the OverlayContext a cell dropdown needs flows
 * through the per-cell dispatch to the registered `DropdownQuestionElement`
 * wrapper (§2 — "OverlayContext flows for free"), so this wrapper binds
 * no overlay stack itself.
 */
import * as React from 'react';
import { MatrixTableBase } from '../components/matrix/MatrixTableBase';
import type { MatrixTableBaseProps } from '../components/matrix/MatrixTableBase';

export type MatrixDropdownQuestionProps = MatrixTableBaseProps;

export class MatrixDropdownQuestion extends MatrixTableBase<MatrixDropdownQuestionProps> {}

export function MatrixDropdownQuestionElement(
  props: MatrixDropdownQuestionProps
): React.JSX.Element {
  return <MatrixDropdownQuestion {...props} />;
}
