import * as vscode from 'vscode';

const CONFIG_SECTION = 'sidethread';
const LEGACY_CONFIG_SECTION = 'touchfish';

const MIGRATE_KEYS = [
  'showImg',
  'fontSize',
  'xiaoyuzhouAccessToken',
  'xiaoyuzhouRefreshToken',
  'xiaoyuzhouUserInfo',
  'xiaoyuzhouDeviceId',
  'xiaoyuzhouStatusBarShowLyric',
  'enableXiaoyuzhou',
  'enableWeread',
  'wereadCookie',
] as const;

export const setConfigByKey = async (key: string, value: string) => {
  const cfg = vscode.workspace.getConfiguration(CONFIG_SECTION);
  // 使用全局配置 (true = 全局)
  await cfg.update(key, value, true);
};

export const getConfigByKey = (key: string): string | undefined => {
  const cfg = vscode.workspace.getConfiguration(CONFIG_SECTION);
  // 优先检查工作区配置，如果没有则使用全局配置
  return cfg.get(key) as string | undefined;
};

/** 将旧版 touchfish.* 全局配置拷到 sidethread.*，已有新值则不覆盖 */
export const migrateLegacyTouchfishSettings = async () => {
  const oldCfg = vscode.workspace.getConfiguration(LEGACY_CONFIG_SECTION);
  const newCfg = vscode.workspace.getConfiguration(CONFIG_SECTION);
  for (const key of MIGRATE_KEYS) {
    const oldInspect = oldCfg.inspect(key);
    const newInspect = newCfg.inspect(key);
    const oldVal = oldInspect?.globalValue;
    if (oldVal === undefined) continue;
    if (newInspect?.globalValue !== undefined) continue;
    await newCfg.update(key, oldVal, true);
  }
};

