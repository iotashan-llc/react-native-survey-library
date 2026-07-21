/**
 * 5.7b — TOC wired into the `<Survey>` shell. Verifies the shell places
 * the table-of-contents side column beside the body when `survey.showTOC`
 * is set (wide/default layout), renders one nav row per page, navigates
 * through the core Action on a row tap, and renders NO TOC when showTOC
 * is off. (The mobile hamburger + popup path is covered as a unit in
 * components/__tests__/SurveyTOC.test.tsx.)
 */
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { Model } from '../../core/facade';
import '../../factories/register-all';
import { Survey } from '../Survey';

async function flush(): Promise<void> {
  await act(async () => {
    await Promise.resolve();
  });
}

function tocJson(showTOC: boolean): object {
  return {
    showTOC,
    pages: [
      {
        name: 'p1',
        title: 'Page One',
        elements: [{ type: 'text', name: 'q1' }],
      },
      {
        name: 'p2',
        title: 'Page Two',
        elements: [{ type: 'text', name: 'q2' }],
      },
      {
        name: 'p3',
        title: 'Page Three',
        elements: [{ type: 'text', name: 'q3' }],
      },
    ],
  };
}

describe('Survey shell — table of contents (5.7b)', () => {
  it('renders the TOC side column with one row per page when showTOC is set', async () => {
    const model = new Model(tocJson(true));
    render(<Survey model={model as never} />);
    await flush();
    expect(screen.getByTestId('survey-toc-row')).toBeTruthy();
    expect(screen.getByTestId('survey-toc-left')).toBeTruthy();
    expect(screen.getByTestId('sv-list-item-p1')).toBeTruthy();
    expect(screen.getByTestId('sv-list-item-p2')).toBeTruthy();
    expect(screen.getByTestId('sv-list-item-p3')).toBeTruthy();
  });

  it('a TOC row tap navigates the survey (core Action → currentPage)', async () => {
    const model = new Model(tocJson(true));
    render(<Survey model={model as never} />);
    await flush();
    expect(model.currentPage.name).toBe('p1');
    fireEvent.press(screen.getByTestId('sv-list-item-p2'));
    expect(model.currentPage.name).toBe('p2');
  });

  it('renders no TOC when showTOC is false', async () => {
    const model = new Model(tocJson(false));
    render(<Survey model={model as never} />);
    await flush();
    expect(screen.queryByTestId('survey-toc-row')).toBeNull();
    expect(screen.queryByTestId('survey-toc-left')).toBeNull();
    expect(screen.queryByTestId('sv-list')).toBeNull();
  });

  // NOTE: the shell's `mobileToc = showToc && survey.isMobile` branch is
  // not driven from <Survey> here: the responsive effect defers
  // `setIsMobile(narrow)` a macrotask after mount with the default
  // narrow=false, so any pre-set isMobile is raced back to false — a
  // shell test would be timer-flaky. The mobile hamburger + popup path is
  // fully covered as a unit in components/__tests__/SurveyTOC.test.tsx.
});
