/*
 * @Author: YangLiwei
 * @Date: 2022-05-24 16:18:31
 * @LastEditTime: 2026-08-06 09:47:00
 * @LastEditors: YangLiwei 1280426581@qq.com
 * @FilePath: \touchfish\src\commands\commands.ts
 * @Description:
 */
import { commands } from "vscode";
import { setConfigByKey } from "../core/config";
import * as vscode from "vscode";
import { showInfo } from "../utils/errorMessage";

// 打开设置
export const openSetting = commands.registerCommand(
  "touchfish.openConfigPage",
  () => {
    commands.executeCommand(
      "workbench.action.openSettings",
      "@ext:ylw.touchfish",
    );
  },
);

export const setXiaoyuzhouTokenCommand = () => {
  return vscode.commands.registerCommand(
    "touchfish.setXiaoyuzhouToken",
    async () => {
      const accessToken = await vscode.window.showInputBox({
        prompt: "请输入小宇宙 Access Token",
        placeHolder: "x-jike-access-token",
        password: true,
        ignoreFocusOut: true,
      });
      if (accessToken === undefined) return;

      const refreshToken = await vscode.window.showInputBox({
        prompt: "请输入小宇宙 Refresh Token",
        placeHolder: "x-jike-refresh-token",
        password: true,
        ignoreFocusOut: true,
      });
      if (refreshToken === undefined) return;

      await setConfigByKey("xiaoyuzhouAccessToken", accessToken.trim());
      await setConfigByKey("xiaoyuzhouRefreshToken", refreshToken.trim());
      await showInfo("小宇宙 Token 设置成功，打开视图即可使用");
    },
  );
};
