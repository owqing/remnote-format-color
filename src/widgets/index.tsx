import {
  AppEvents,
  declareIndexPlugin,
  RemColor,
  type ReactRNPlugin,
  type RichTextElementTextInterface,
  type RichTextInterface,
} from '@remnote/plugin-sdk';

/* ============================================================
 * Types & Settings Definitions
 * ============================================================
 */

type ColorOption =
  | 'none'
  | 'red'
  | 'orange'
  | 'yellow'
  | 'green'
  | 'blue'
  | 'purple'
  | 'gray';

type FormatStyleConfig = {
  textColor: ColorOption;
  highlightColor: ColorOption;
};

type PluginStyleSettings = {
  chinese: FormatStyleConfig;
  italic: FormatStyleConfig;
  bold: FormatStyleConfig;
  underline: FormatStyleConfig;
};

const COLOR_OPTIONS: ColorOption[] = [
  'none',
  'gray',
  'red',
  'orange',
  'yellow',
  'green',
  'blue',
  'purple',
];

const COLOR_LABEL_MAP: Record<ColorOption, string> = {
  none: '⚪ None',
  gray: '🔘 Gray',
  red: '🔴 Red',
  orange: '🟠 Orange',
  yellow: '🟡 Yellow',
  green: '🟢 Green',
  blue: '🔵 Blue',
  purple: '🟣 Purple',
};

const COLOR_MAP: Record<ColorOption, number | string | undefined> = {
  none: undefined,
  red: RemColor.Red,
  orange: RemColor.Orange,
  yellow: RemColor.Yellow,
  green: RemColor.Green,
  blue: RemColor.Blue,
  purple: RemColor.Purple,
  gray: RemColor.Gray,
};

const processing = new Set<string>();
const pendingTimers = new Map<string, ReturnType<typeof setTimeout>>();

/* ============================================================
 * Helpers
 * ============================================================
 */

function isChineseChar(char: string): boolean {
  return /[\p{Script=Han}\u3000-\u303f\uff01-\uff5e]/u.test(char);
}

function isDefaultColor(color: number | string | undefined): boolean {
  return (
    color == null ||
    color === 0 ||
    color === RemColor['undefined'] ||
    color === 'undefined'
  );
}

async function loadSettings(plugin: ReactRNPlugin): Promise<PluginStyleSettings> {
  const getOpt = async (key: string, fallback: ColorOption): Promise<ColorOption> => {
    const val = (await plugin.settings.getSetting<string>(key)) as ColorOption;
    return COLOR_OPTIONS.includes(val) ? val : fallback;
  };

  return {
    chinese: {
      textColor: await getOpt('chinese-text-color', 'gray'),
      highlightColor: await getOpt('chinese-highlight-color', 'none'),
    },
    italic: {
      textColor: await getOpt('italic-text-color', 'green'),
      highlightColor: await getOpt('italic-highlight-color', 'none'),
    },
    bold: {
      textColor: await getOpt('bold-text-color', 'none'),
      highlightColor: await getOpt('bold-highlight-color', 'none'),
    },
    underline: {
      textColor: await getOpt('underline-text-color', 'none'),
      highlightColor: await getOpt('underline-highlight-color', 'none'),
    },
  };
}

function resolveColors(
  char: string,
  formats: { isItalic: boolean; isBold: boolean; isUnderline: boolean },
  current: { tc: number | string | undefined; h: number | string | undefined },
  settings: PluginStyleSettings
): { targetTc: number | string | undefined; targetH: number | string | undefined } {
  let targetTcOption: ColorOption = 'none';
  let targetHOption: ColorOption = 'none';

  if (isChineseChar(char)) {
    targetTcOption = settings.chinese.textColor;
    targetHOption = settings.chinese.highlightColor;
  } else if (formats.isBold && (settings.bold.textColor !== 'none' || settings.bold.highlightColor !== 'none')) {
    targetTcOption = settings.bold.textColor;
    targetHOption = settings.bold.highlightColor;
  } else if (formats.isItalic && (settings.italic.textColor !== 'none' || settings.italic.highlightColor !== 'none')) {
    targetTcOption = settings.italic.textColor;
    targetHOption = settings.italic.highlightColor;
  } else if (formats.isUnderline && (settings.underline.textColor !== 'none' || settings.underline.highlightColor !== 'none')) {
    targetTcOption = settings.underline.textColor;
    targetHOption = settings.underline.highlightColor;
  }

  let nextTc = current.tc;
  if (targetTcOption !== 'none') {
    const assignedTc = COLOR_MAP[targetTcOption];
    if (isDefaultColor(current.tc) || current.tc === assignedTc) {
      nextTc = assignedTc;
    }
  }

  let nextH = current.h;
  if (targetHOption !== 'none') {
    const assignedH = COLOR_MAP[targetHOption];
    if (isDefaultColor(current.h) || current.h === assignedH) {
      nextH = assignedH;
    }
  }

  return { targetTc: nextTc, targetH: nextH };
}

function formatRichText(
  richText: RichTextInterface | undefined,
  settings: PluginStyleSettings
): { richText: RichTextInterface | undefined; changed: boolean } {
  if (!richText) return { richText, changed: false };

  const output: RichTextInterface = [];
  let changed = false;

  for (const element of richText) {
    if (typeof element === 'string') {
      const runText = element;
      let runStart = 0;
      while (runStart < runText.length) {
        const { targetTc, targetH } = resolveColors(
          runText[runStart],
          { isItalic: false, isBold: false, isUnderline: false },
          { tc: undefined, h: undefined },
          settings
        );

        let runEnd = runStart + 1;
        while (runEnd < runText.length) {
          const next = resolveColors(
            runText[runEnd],
            { isItalic: false, isBold: false, isUnderline: false },
            { tc: undefined, h: undefined },
            settings
          );
          if (next.targetTc !== targetTc || next.targetH !== targetH) break;
          runEnd++;
        }

        const sub = runText.slice(runStart, runEnd);
        if (targetTc !== undefined || targetH !== undefined) {
          output.push({
            i: 'm',
            text: sub,
            tc: targetTc,
            h: targetH,
          } as RichTextElementTextInterface);
          changed = true;
        } else {
          output.push(sub);
        }
        runStart = runEnd;
      }
      continue;
    }

    if (element.i !== 'm') {
      output.push(element);
      continue;
    }

    const item = element as RichTextElementTextInterface;
    const itemText = item.text;
    const formats = {
      isItalic: item.l === true,
      isBold: item.b === true,
      isUnderline: (item as any).u === true,
    };

    let runStart = 0;
    while (runStart < itemText.length) {
      const { targetTc, targetH } = resolveColors(
        itemText[runStart],
        formats,
        { tc: item.tc, h: item.h },
        settings
      );

      let runEnd = runStart + 1;
      while (runEnd < itemText.length) {
        const next = resolveColors(
          itemText[runEnd],
          formats,
          { tc: item.tc, h: item.h },
          settings
        );
        if (next.targetTc !== targetTc || next.targetH !== targetH) break;
        runEnd++;
      }

      const substring = itemText.slice(runStart, runEnd);

      if (targetTc !== item.tc || targetH !== item.h) {
        output.push({
          ...item,
          text: substring,
          tc: targetTc,
          h: targetH,
        });
        changed = true;
      } else {
        output.push({
          ...item,
          text: substring,
        });
      }

      runStart = runEnd;
    }
  }

  return { richText: output, changed };
}

async function processRem(plugin: ReactRNPlugin, remId: string) {
  if (processing.has(remId)) return;
  processing.add(remId);

  try {
    const rem = await plugin.rem.findOne(remId);
    if (!rem) return;

    const settings = await loadSettings(plugin);

    const frontResult = formatRichText(rem.text, settings);
    if (frontResult.changed && frontResult.richText) {
      await rem.setText(frontResult.richText);
    }

    const backResult = formatRichText(rem.backText, settings);
    if (backResult.changed && backResult.richText) {
      await rem.setBackText(backResult.richText);
    }
  } catch (error) {
    console.error('[Format Color] Processing error:', error);
  } finally {
    processing.delete(remId);
  }
}

function scheduleEditProcessing(plugin: ReactRNPlugin, remId: string, delay = 200) {
  const previousTimer = pendingTimers.get(remId);
  if (previousTimer) clearTimeout(previousTimer);

  const timer = setTimeout(async () => {
    pendingTimers.delete(remId);
    await processRem(plugin, remId);
  }, delay);

  pendingTimers.set(remId, timer);
}

async function getRemIdFromEvent(plugin: ReactRNPlugin, event: any): Promise<string | undefined> {
  const candidate =
    event?.remId ?? event?._id ?? event?.id ?? event?.rem?._id ?? event?.rem?.id;
  if (typeof candidate === 'string' && candidate.length > 0) return candidate;
  const focused = await plugin.focus.getFocusedRem();
  return focused?._id;
}

async function getTargetRemIds(plugin: ReactRNPlugin): Promise<string[]> {
  const selected = await plugin.editor.getSelectedRem();
  if (selected?.remIds?.length) return selected.remIds;
  const focused = await plugin.focus.getFocusedRem();
  return focused ? [focused._id] : [];
}

/* ============================================================
 * Settings Registration Helper
 * ============================================================
 */

async function registerFormatSettings(plugin: ReactRNPlugin) {
  const dropdownOptions = COLOR_OPTIONS.map((c) => ({
    key: c,
    label: COLOR_LABEL_MAP[c],
    value: c,
  }));

  const registerPair = async (
    prefix: string,
    label: string,
    defaultTc: ColorOption,
    defaultH: ColorOption
  ) => {
    await plugin.settings.registerDropdownSetting({
      id: `${prefix}-text-color`,
      title: `${label} - Text Color`,
      defaultValue: defaultTc,
      options: dropdownOptions,
    });

    await plugin.settings.registerDropdownSetting({
      id: `${prefix}-highlight-color`,
      title: `${label} - Highlight`,
      defaultValue: defaultH,
      options: dropdownOptions,
    });
  };

  await registerPair('chinese', 'Chinese', 'gray', 'none');
  await registerPair('italic', 'Italic', 'green', 'none');
  await registerPair('bold', 'Bold', 'none', 'none');
  await registerPair('underline', 'Underline', 'none', 'none');
}

/* ============================================================
 * Lifecycle
 * ============================================================
 */

async function onActivate(plugin: ReactRNPlugin) {
  await registerFormatSettings(plugin);

  await plugin.app.registerCommand({
    id: 'format-color-sync',
    name: 'Format Color: Sync Formatting Colors in Current/Selected Rems',
    action: async () => {
      try {
        const ids = await getTargetRemIds(plugin);
        if (!ids.length) {
          await plugin.app.toast('Please select Rems or place the cursor inside a Rem.');
          return;
        }

        for (const id of ids) {
          await processRem(plugin, id);
        }

        await plugin.app.toast(`Completed: Synced formatting colors in ${ids.length} Rem(s).`);
      } catch (error) {
        console.error('[Format Color] Manual sync failed:', error);
      }
    },
  });

  plugin.event.addListener(
    AppEvents.EditorTextEdited,
    undefined,
    async (event) => {
      const remId = await getRemIdFromEvent(plugin, event);
      if (!remId) return;
      scheduleEditProcessing(plugin, remId, 200);
    }
  );
}

async function onDeactivate(_plugin: ReactRNPlugin) {
  for (const timer of pendingTimers.values()) clearTimeout(timer);
  pendingTimers.clear();
  processing.clear();
}

declareIndexPlugin(onActivate, onDeactivate);