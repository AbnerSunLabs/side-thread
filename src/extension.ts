/*
 * @Author: YangLiwei
 * @Date: 2022-05-18 10:26:57
 * @LastEditTime: 2026-08-06 09:47:00
 * @LastEditors: YangLiwei 1280426581@qq.com
 * @FilePath: \touchfish\src\extension.ts
 * @Description:
 */

import * as vscode from "vscode";
import {
  openSetting,
  setXiaoyuzhouTokenCommand,
} from "./commands/commands";
import { XiaoyuzhouProvider } from "./Providers/xiaoyuzhouProvider";
import { WereadProvider } from "./Providers/wereadProvider";

import ContextManager from "./utils/extensionContext";
import { Uri } from "vscode";
import * as fs from "fs";
import { setConfigByKey } from "./core/config";

function createLazyWebviewProvider<T extends vscode.WebviewViewProvider>(
  factory: () => T,
) {
  let instance: T | undefined;
  const getInstance = () => {
    if (!instance) {
      instance = factory();
    }
    return instance;
  };

  const provider: vscode.WebviewViewProvider = {
    resolveWebviewView(webviewView, context, token) {
      return getInstance().resolveWebviewView(webviewView, context, token);
    },
  };

  return { provider, getInstance };
}

export function activate(context: vscode.ExtensionContext) {
  ContextManager.initialize(context);

  const xiaoyuzhouProvider = createLazyWebviewProvider(
    () => new XiaoyuzhouProvider(context),
  );
  const wereadProvider = createLazyWebviewProvider(
    () => new WereadProvider(context),
  );

  vscode.window.registerWebviewViewProvider(
    "xiaoyuzhou",
    xiaoyuzhouProvider.provider,
    {
      webviewOptions: {
        retainContextWhenHidden: true,
      },
    },
  );
  vscode.window.registerWebviewViewProvider(
    "weread",
    wereadProvider.provider,
    {
      webviewOptions: {
        retainContextWhenHidden: true,
      },
    },
  );

  context.subscriptions.push(openSetting);
  context.subscriptions.push(setXiaoyuzhouTokenCommand());
  context.subscriptions.push(
    vscode.commands.registerCommand("touchfish.setWereadCookie", async () => {
      const cookie = await vscode.window.showInputBox({
        prompt: "请输入微信读书 Cookie",
        placeHolder: "wr_skey=...; wr_vid=...;",
        ignoreFocusOut: true,
      });
      if (cookie) {
        await setConfigByKey("wereadCookie", cookie);
        vscode.window.showInformationMessage("微信读书 Cookie 设置成功");
      }
    }),
  );

  context.subscriptions.push(
    vscode.commands.registerCommand("touchfish.openXiaoyuzhou", async () => {
      await vscode.commands.executeCommand("xiaoyuzhou.focus");
    }),
  );

  context.subscriptions.push(
    vscode.commands.registerCommand("touchfish.music.openActive", async () => {
      await vscode.commands.executeCommand("xiaoyuzhou.focus");
    }),
  );

  context.subscriptions.push(
    vscode.commands.registerCommand("touchfish.music.playPause", async () => {
      xiaoyuzhouProvider.getInstance()["sendPlayPauseCommand"]?.();
    }),
  );

  context.subscriptions.push(
    vscode.commands.registerCommand("touchfish.music.next", async () => {
      xiaoyuzhouProvider.getInstance()["sendNextEpisodeCommand"]?.();
    }),
  );

  context.subscriptions.push(
    vscode.commands.registerCommand("touchfish.xiaoyuzhou.playPause", async () => {
      xiaoyuzhouProvider.getInstance()["sendPlayPauseCommand"]?.();
    }),
  );

  context.subscriptions.push(
    vscode.commands.registerCommand("touchfish.xiaoyuzhou.nextEpisode", async () => {
      xiaoyuzhouProvider.getInstance()["sendNextEpisodeCommand"]?.();
    }),
  );
}

export function deactivate() {
  const tempDir = Uri.joinPath(ContextManager.context.extensionUri, "temp");
  if (fs.existsSync(tempDir.fsPath)) {
    fs.rmSync(tempDir.fsPath, { recursive: true, force: true });
  }
}
