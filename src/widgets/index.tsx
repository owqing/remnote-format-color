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

const SETTING_AUTO_FORMAT_PASTE_RELATIVES = 'auto-format-paste-relatives';

interface FormattedChar {
  char: string;
  b: boolean;
  l: boolean;
  u: boolean;
  tc: number | string | undefined;
  h: number | string | undefined;
  extraProps?: Record<string, any>;
  rawElement?: any;
}

interface RemCharSnapshot {
  front: FormattedChar[];
  back: FormattedChar[];
}

const MAX_SNAPSHOT_ENTRIES = 200;
const remSnapshots = new Map<string, RemCharSnapshot>();
const remTextLengthMap = new Map<string, number>();

function setSnapshot(id: string, snapshot: RemCharSnapshot) {
  if (remSnapshots.size >= MAX_SNAPSHOT_ENTRIES) {
    const firstKey = remSnapshots.keys().next().value;
    if (firstKey) remSnapshots.delete(firstKey);
  }
  remSnapshots.set(id, snapshot);
}

const processing = new Set<string>();
const pendingTimers = new Map<string, ReturnType<typeof setTimeout>>();

// 菜单批量处理执行锁：执行菜单命令期间阻断 EditorTextEdited 重入调度
let isBulkMenuRunning = false;

/* ============================================================
 * Helpers & Token Engine
 * ============================================================
 */

function isChineseChar(char: string): boolean {
  return /[\p{Script=Han}\u3000-\u303f\uff01-\uff5e]/u.test(char);
}

function isDefaultColor(color: unknown): boolean {
  return (
    color === undefined ||
    color === null ||
    color === 0 ||
    color === 'undefined' ||
    color === 'default' ||
    color === RemColor['undefined']
  );
}

function isRecentlyCreated(rem: any, windowMs = 4500): boolean {
  if (!rem) return false;
  const rawTime = rem.createdAt;
  if (!rawTime) return false;
  const time = typeof rawTime === 'number' ? rawTime : new Date(rawTime).getTime();
  if (isNaN(time)) return false;
  return Math.abs(Date.now() - time) < windowMs;
}

function unpackRichText(richText: RichTextInterface | undefined): FormattedChar[] {
  if (!richText || !Array.isArray(richText)) return [];
  const chars: FormattedChar[] = [];

  for (const el of richText) {
    if (typeof el === 'string') {
      const codePoints = Array.from(el);
      for (const char of codePoints) {
        chars.push({ char, b: false, l: false, u: false, tc: undefined, h: undefined });
      }
    } else if (el && typeof el === 'object') {
      if ((el as any).i === 'm') {
        const item = el as RichTextElementTextInterface;
        const text = item.text || '';
        const b = item.b === true;
        const l = item.l === true;
        const u = (item as any).u === true;
        const tc = item.tc;
        const h = item.h;

        const { i, text: _t, b: _b, l: _l, u: _u, tc: _tc, h: _h, ...extraProps } = item as any;
        const hasExtra = Object.keys(extraProps).length > 0;

        const codePoints = Array.from(text);
        for (const char of codePoints) {
          chars.push({
            char,
            b,
            l,
            u,
            tc,
            h,
            extraProps: hasExtra ? extraProps : undefined,
          });
        }
      } else {
        chars.push({
          char: '',
          b: false,
          l: false,
          u: false,
          tc: undefined,
          h: undefined,
          rawElement: el,
        });
      }
    }
  }

  return chars;
}

function packRichText(chars: FormattedChar[]): RichTextInterface {
  const result: RichTextInterface = [];
  let i = 0;

  while (i < chars.length) {
    const item = chars[i];
    if (item.rawElement) {
      result.push(item.rawElement);
      i++;
      continue;
    }

    const isPlain =
      !item.b &&
      !item.l &&
      !item.u &&
      item.tc === undefined &&
      item.h === undefined &&
      !item.extraProps;

    let runEnd = i + 1;
    while (runEnd < chars.length) {
      const next = chars[runEnd];
      if (next.rawElement) break;
      const nextIsPlain =
        !next.b &&
        !next.l &&
        !next.u &&
        next.tc === undefined &&
        next.h === undefined &&
        !next.extraProps;

      if (isPlain !== nextIsPlain) break;

      if (!isPlain) {
        const extraMatch = JSON.stringify(item.extraProps) === JSON.stringify(next.extraProps);
        if (
          next.b !== item.b ||
          next.l !== item.l ||
          next.u !== item.u ||
          next.tc !== item.tc ||
          next.h !== item.h ||
          !extraMatch
        ) {
          break;
        }
      }
      runEnd++;
    }

    let runText = '';
    for (let j = i; j < runEnd; j++) {
      runText += chars[j].char;
    }

    if (isPlain) {
      result.push(runText);
    } else {
      const element: any = {
        i: 'm',
        text: runText,
        ...(item.extraProps || {}),
      };
      if (item.b) element.b = true;
      if (item.l) element.l = true;
      if (item.u) element.u = true;
      if (item.tc !== undefined) element.tc = item.tc;
      if (item.h !== undefined) element.h = item.h;
      result.push(element as RichTextElementTextInterface);
    }

    i = runEnd;
  }

  return result;
}

function areTokensEqual(a: FormattedChar, b: FormattedChar): boolean {
  if (a.rawElement || b.rawElement) {
    return JSON.stringify(a.rawElement) === JSON.stringify(b.rawElement);
  }
  return (
    a.char === b.char &&
    a.b === b.b &&
    a.l === b.l &&
    a.u === b.u &&
    a.tc === b.tc &&
    a.h === b.h &&
    JSON.stringify(a.extraProps) === JSON.stringify(b.extraProps)
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
  current: { tc: unknown; h: unknown },
  settings: PluginStyleSettings,
  forceOverwrite = false
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

  let nextTc = current.tc as number | string | undefined;
  if (targetTcOption !== 'none') {
    const assignedTc = COLOR_MAP[targetTcOption];
    if (forceOverwrite || isDefaultColor(current.tc) || current.tc === assignedTc) {
      nextTc = assignedTc;
    }
  }

  let nextH = current.h as number | string | undefined;
  if (targetHOption !== 'none') {
    const assignedH = COLOR_MAP[targetHOption];
    if (forceOverwrite || isDefaultColor(current.h) || current.h === assignedH) {
      nextH = assignedH;
    }
  }

  return { targetTc: nextTc, targetH: nextH };
}

/* ============================================================
 * Formatting Engines
 * ============================================================
 */

function formatRichTextIncremental(
  currentRichText: RichTextInterface | undefined,
  baseChars: FormattedChar[] | undefined,
  settings: PluginStyleSettings
): { richText: RichTextInterface | undefined; newChars: FormattedChar[]; changed: boolean } {
  const currentChars = unpackRichText(currentRichText);
  if (currentChars.length === 0) {
    return { richText: currentRichText, newChars: currentChars, changed: false };
  }

  const safeBase = baseChars || [];
  let prefixLen = 0;
  while (
    prefixLen < safeBase.length &&
    prefixLen < currentChars.length &&
    areTokensEqual(safeBase[prefixLen], currentChars[prefixLen])
  ) {
    prefixLen++;
  }

  let suffixLen = 0;
  while (
    suffixLen < (safeBase.length - prefixLen) &&
    suffixLen < (currentChars.length - prefixLen) &&
    areTokensEqual(
      safeBase[safeBase.length - 1 - suffixLen],
      currentChars[currentChars.length - 1 - suffixLen]
    )
  ) {
    suffixLen++;
  }

  if (safeBase.length > 0 && prefixLen + suffixLen === currentChars.length && currentChars.length === safeBase.length) {
    return { richText: currentRichText, newChars: currentChars, changed: false };
  }

  const editEnd = currentChars.length - suffixLen;
  const baseEditEnd = safeBase.length - suffixLen;
  const currentRangeLen = editEnd - prefixLen;
  const baseRangeLen = baseEditEnd - prefixLen;

  let hasModified = false;

  const charBefore = prefixLen > 0 ? safeBase[prefixLen - 1] : undefined;
  const isInsideBlackItalic = charBefore && charBefore.l && isDefaultColor(charBefore.tc);
  const isInsideBlackBold = charBefore && charBefore.b && isDefaultColor(charBefore.tc);
  const isInsideBlackUnderline = charBefore && charBefore.u && isDefaultColor(charBefore.tc);

  for (let i = prefixLen; i < editEnd; i++) {
    const token = currentChars[i];
    if (token.rawElement && !token.char) continue;

    let baseToken: FormattedChar | undefined;
    if (currentRangeLen === baseRangeLen) {
      baseToken = safeBase[i];
    } else if (safeBase.length > 0 && i < safeBase.length) {
      const candidate = safeBase[i];
      if (candidate && candidate.char === token.char) {
        baseToken = candidate;
      }
    }

    if (baseToken) {
      const tcWasCleared = !isDefaultColor(baseToken.tc) && isDefaultColor(token.tc);
      const hWasCleared = !isDefaultColor(baseToken.h) && isDefaultColor(token.h);

      const italicNewlyAdded = token.l && !baseToken.l;
      const boldNewlyAdded = token.b && !baseToken.b;
      const underlineNewlyAdded = token.u && !baseToken.u;

      const effectiveFormats = {
        isItalic: italicNewlyAdded,
        isBold: boldNewlyAdded,
        isUnderline: underlineNewlyAdded,
      };

      const { targetTc, targetH } = resolveColors(
        token.char,
        effectiveFormats,
        { tc: token.tc, h: token.h },
        settings,
        false
      );

      let finalTc = token.tc;
      if (!tcWasCleared && targetTc !== undefined) {
        finalTc = targetTc;
      }

      let finalH = token.h;
      if (!hWasCleared && targetH !== undefined) {
        finalH = targetH;
      }

      if (finalTc !== token.tc || finalH !== token.h) {
        token.tc = finalTc;
        token.h = finalH;
        hasModified = true;
      }
    } else {
      const formats = {
        isItalic: token.l && !isInsideBlackItalic,
        isBold: token.b && !isInsideBlackBold,
        isUnderline: token.u && !isInsideBlackUnderline,
      };

      const { targetTc, targetH } = resolveColors(
        token.char,
        formats,
        { tc: token.tc, h: token.h },
        settings,
        false
      );

      if (targetTc !== token.tc || targetH !== token.h) {
        token.tc = targetTc;
        token.h = targetH;
        hasModified = true;
      }
    }
  }

  if (!hasModified) {
    return { richText: currentRichText, newChars: currentChars, changed: false };
  }

  return { richText: packRichText(currentChars), newChars: currentChars, changed: true };
}

function formatRichTextFull(
  richText: RichTextInterface | undefined,
  settings: PluginStyleSettings,
  forceOverwrite: boolean
): { richText: RichTextInterface | undefined; newChars: FormattedChar[]; changed: boolean } {
  const chars = unpackRichText(richText);
  let hasModified = false;

  for (const token of chars) {
    if (token.rawElement && !token.char) continue;
    const { targetTc, targetH } = resolveColors(
      token.char,
      { isItalic: token.l, isBold: token.b, isUnderline: token.u },
      { tc: token.tc, h: token.h },
      settings,
      forceOverwrite
    );
    if (targetTc !== token.tc || targetH !== token.h) {
      token.tc = targetTc;
      token.h = targetH;
      hasModified = true;
    }
  }

  if (!hasModified) {
    return { richText, newChars: chars, changed: false };
  }
  return { richText: packRichText(chars), newChars: chars, changed: true };
}

/* ============================================================
 * Execution Controllers
 * ============================================================
 */

async function processRemSingleIncremental(plugin: ReactRNPlugin, remId: string) {
  if (processing.has(remId)) return;
  processing.add(remId);

  try {
    const rem = await plugin.rem.findOne(remId);
    if (!rem) return;

    const settings = await loadSettings(plugin);
    let snap = remSnapshots.get(remId);

    if (!snap) {
      snap = { front: [], back: [] };
    }

    let nextFrontChars = snap.front;
    let nextBackChars = snap.back;

    const frontResult = formatRichTextIncremental(rem.text, snap.front, settings);
    if (frontResult.changed && frontResult.richText) {
      await rem.setText(frontResult.richText);
      nextFrontChars = frontResult.newChars;
    } else {
      nextFrontChars = unpackRichText(rem.text);
    }

    const backResult = formatRichTextIncremental(rem.backText, snap.back, settings);
    if (backResult.changed && backResult.richText) {
      await rem.setBackText(backResult.richText);
      nextBackChars = backResult.newChars;
    } else {
      nextBackChars = unpackRichText(rem.backText);
    }

    setSnapshot(remId, {
      front: nextFrontChars,
      back: nextBackChars,
    });
  } catch (err) {
    console.error('[Format Color] Incremental error:', err);
  } finally {
    processing.delete(remId);
  }
}

async function processRemFull(plugin: ReactRNPlugin, remId: string, forceOverwrite: boolean) {
  if (processing.has(remId)) return;
  processing.add(remId);

  try {
    const rem = await plugin.rem.findOne(remId);
    if (!rem) return;

    const settings = await loadSettings(plugin);

    const frontResult = formatRichTextFull(rem.text, settings, forceOverwrite);
    if (frontResult.changed && frontResult.richText) {
      await rem.setText(frontResult.richText);
    }

    const backResult = formatRichTextFull(rem.backText, settings, forceOverwrite);
    if (backResult.changed && backResult.richText) {
      await rem.setBackText(backResult.richText);
    }

    const updated = await plugin.rem.findOne(remId);
    if (updated) {
      setSnapshot(remId, {
        front: unpackRichText(updated.text),
        back: unpackRichText(updated.backText),
      });
    }
  } catch (err) {
    console.error('[Format Color] Full format error:', err);
  } finally {
    processing.delete(remId);
  }
}

async function processRemHierarchy(plugin: ReactRNPlugin, rootId: string, forceOverwrite: boolean) {
  await processRemFull(plugin, rootId, forceOverwrite);
  const rem = await plugin.rem.findOne(rootId);
  if (!rem) return;
  const children = await rem.getChildrenRem();
  if (children && children.length > 0) {
    for (const child of children) {
      await processRemHierarchy(plugin, child._id, forceOverwrite);
    }
  }
}

function scheduleSingleIncremental(plugin: ReactRNPlugin, remId: string, delay = 180) {
  const previousTimer = pendingTimers.get(remId);
  if (previousTimer) clearTimeout(previousTimer);

  const timer = setTimeout(async () => {
    pendingTimers.delete(remId);
    await processRemSingleIncremental(plugin, remId);
  }, delay);

  pendingTimers.set(remId, timer);
}

async function formatPastedDescendants(plugin: ReactRNPlugin, rootId: string) {
  const rem = await plugin.rem.findOne(rootId);
  if (!rem) return;

  const children = await rem.getChildrenRem();
  if (children && children.length > 0) {
    for (const child of children) {
      if (isRecentlyCreated(child)) {
        await processRemFull(plugin, child._id, false);
        await formatPastedDescendants(plugin, child._id);
      }
    }
  }
}

// 扫描并格式化粘贴产生的新子代与兄弟节点
// 绝不对 startRemId 本身执行 processRemFull，以保护单 Rem 增量 Diff 结果
async function formatPastedContent(plugin: ReactRNPlugin, startRemId: string) {
  try {
    const startRem = await plugin.rem.findOne(startRemId);
    if (!startRem) return;

    // 仅处理新创建的子孙节点
    await formatPastedDescendants(plugin, startRemId);

    // 仅处理同级新创建的兄弟节点
    const parent = await startRem.getParentRem();
    if (parent) {
      const freshParent = await plugin.rem.findOne(parent._id);
      const siblings = (freshParent ? await freshParent.getChildrenRem() : await parent.getChildrenRem()) || [];
      const startIndex = siblings.findIndex((s) => s._id === startRemId);

      if (startIndex !== -1) {
        // 向后扫描新增兄弟节点
        for (let i = startIndex + 1; i < siblings.length; i++) {
          const sibling = siblings[i];
          if (!isRecentlyCreated(sibling)) {
            break;
          }
          await processRemFull(plugin, sibling._id, false);
          await formatPastedDescendants(plugin, sibling._id);
        }

        // 向前扫描新增兄弟节点
        for (let i = startIndex - 1; i >= 0; i--) {
          const sibling = siblings[i];
          if (!isRecentlyCreated(sibling)) {
            break;
          }
          await processRemFull(plugin, sibling._id, false);
          await formatPastedDescendants(plugin, sibling._id);
        }
      }
    }
  } catch (err) {
    console.error('[Format Color] Paste scanning error:', err);
  }
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

// 抓取快照：force 为 true 时无条件刷新基准（用于光标移入聚焦场景）
async function captureSnapshot(plugin: ReactRNPlugin, remId: string, force = false) {
  if (!force && remSnapshots.has(remId)) return;
  const rem = await plugin.rem.findOne(remId);
  if (rem) {
    setSnapshot(remId, {
      front: unpackRichText(rem.text),
      back: unpackRichText(rem.backText),
    });
  }
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

  await plugin.settings.registerBooleanSetting({
    id: SETTING_AUTO_FORMAT_PASTE_RELATIVES,
    title: 'Auto-format pasted multi-line notes',
    description: 
      'Automatically format newly created notes when pasting multi-line text. (Ordinary edits only affect the active note.)', // 优化后
    defaultValue: true,
  });
}

/* ============================================================
 * Lifecycle
 * ============================================================
 */

async function onActivate(plugin: ReactRNPlugin) {
  await registerFormatSettings(plugin);

  // 光标聚焦时强制刷新快照，捕获用户在失焦期间可能进行的颜色调整
  plugin.event.addListener(AppEvents.RemFocused, undefined, async (event) => {
    const remId = event?.remId || (await plugin.focus.getFocusedRem())?._id;
    if (remId) await captureSnapshot(plugin, remId, true);
  });

  plugin.event.addListener(AppEvents.EditorSelectionChanged, undefined, async () => {
    const focusedRem = await plugin.focus.getFocusedRem();
    if (focusedRem) await captureSnapshot(plugin, focusedRem._id, false);
  });

  // 菜单 1：递归安全格式化选中 Rem 及其所有子孙节点
  await plugin.app.registerCommand({
    id: 'format-color-sync-safe',
    name: 'Format Color: Format Uncolored Text (Selected & Children)',
    action: async () => {
      try {
        const ids = await getTargetRemIds(plugin);
        if (!ids.length) {
          await plugin.app.toast('Please select Rems or place cursor inside a Rem.');
          return;
        }

        isBulkMenuRunning = true;
        for (const id of ids) {
          await processRemHierarchy(plugin, id, false);
        }

        await plugin.app.toast(`Completed: Formatted uncolored text in selected Rem(s) and their children.`);
      } catch (error) {
        console.error('[Format Color] Safe sync error:', error);
      } finally {
        isBulkMenuRunning = false;
      }
    },
  });

  // 菜单 2：强制递归全量格式化选中 Rem 及其所有子孙节点
  await plugin.app.registerCommand({
    id: 'format-color-sync-force',
    name: 'Format Color: Force Format All Text (Selected & Children)',
    action: async () => {
      try {
        const ids = await getTargetRemIds(plugin);
        if (!ids.length) {
          await plugin.app.toast('Please select Rems or place cursor inside a Rem.');
          return;
        }

        isBulkMenuRunning = true;
        for (const id of ids) {
          await processRemHierarchy(plugin, id, true);
        }

        await plugin.app.toast(`Completed: Force-formatted all text in selected Rem(s) and their children.`);
      } catch (error) {
        console.error('[Format Color] Force sync error:', error);
      } finally {
        isBulkMenuRunning = false;
      }
    },
  });

  plugin.event.addListener(
    AppEvents.EditorTextEdited,
    undefined,
    async (event) => {
      // 批量菜单命令执行期间直接跳过
      if (isBulkMenuRunning) return;

      const remId = await getRemIdFromEvent(plugin, event);
      if (!remId) return;

      const rem = await plugin.rem.findOne(remId);
      if (!rem) return;

      // 单 Rem 严格增量格式化
      scheduleSingleIncremental(plugin, remId, 180);

      const allowPasteRelatives =
        (await plugin.settings.getSetting<boolean>(SETTING_AUTO_FORMAT_PASTE_RELATIVES)) ?? true;

      if (allowPasteRelatives) {
        const currentLen = (rem.text ? unpackRichText(rem.text).length : 0) +
                           (rem.backText ? unpackRichText(rem.backText).length : 0);
        const prevLen = remTextLengthMap.get(remId);
        remTextLengthMap.set(remId, currentLen);

        // 普通打字/删除（长度单次变动 <= 2）不触发粘贴扫描
        // 仅在文本出现较大变动或初次录入时检测伴生节点
        const isPotentialPaste = prevLen !== undefined ? Math.abs(currentLen - prevLen) > 2 : true;

        if (isPotentialPaste) {
          setTimeout(() => formatPastedContent(plugin, remId), 250);
          setTimeout(() => formatPastedContent(plugin, remId), 700);
        }
      }
    }
  );
}

async function onDeactivate(_plugin: ReactRNPlugin) {
  for (const timer of pendingTimers.values()) clearTimeout(timer);
  pendingTimers.clear();
  processing.clear();
  remSnapshots.clear();
  remTextLengthMap.clear();
}

declareIndexPlugin(onActivate, onDeactivate);