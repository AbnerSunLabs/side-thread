import { ExtensionContext, WebviewView, workspace, window } from "vscode";
import { BaseWebviewProvider, IncomingMessage } from "./baseWebviewProvider";
import { WeReadClient } from "../api/weread/client";
import { web_shelf_sync } from "../api/weread/api/shelf";
import {
  web_book_chapter_e,
  web_book_chapterInfos,
  web_book_getProgress,
  web_book_read_init,
  web_book_read,
  web_book_underlines,
  web_book_readReviews,
} from "../api/weread/api/book";
import { setConfigByKey } from "../core/config";
import { WereadReadReporter } from "../api/weread/readSession";

export class WereadProvider extends BaseWebviewProvider {
  private client: WeReadClient;
  private readReporter: WereadReadReporter;
  private webviewView: WebviewView | null = null;

  constructor(context: ExtensionContext) {
    super(context, {
      distPath: "weread/dist",
      devPort: 5183,
      title: "微信读书",
      scrollKey: "wereadScrollPosition",
      restoreCommand: "WEREAD_RESTORE_SCROLL_POSITION",
      saveCommand: "WEREAD_SAVE_SCROLL_POSITION",
    });

    const cookie =
      workspace.getConfiguration("touchfish").get<string>("wereadCookie") || "";

    this.client = new WeReadClient({ cookie }, async (newCookie) => {
      await setConfigByKey("wereadCookie", newCookie);
    });

    this.readReporter = new WereadReadReporter({
      init: async (bookId, chapterUid, format) => {
        const now = Math.floor(Date.now() / 1000);
        const pc = now - 10;
        const ps = pc - Math.floor(Math.random() * 5) - 5;
        return this.client.execute(
          web_book_read_init,
          bookId,
          chapterUid,
          0,
          0,
          pc,
          ps,
          format,
        );
      },
      report: async ({ bookId, chapterUid, format, readerToken, rt }) => {
        const now = Math.floor(Date.now() / 1000);
        const pc = now - 10;
        const ps = pc - Math.floor(Math.random() * 5) - 5;
        return this.client.execute(
          web_book_read,
          bookId,
          chapterUid,
          0,
          0,
          pc,
          ps,
          format,
          readerToken,
          rt,
        );
      },
    });

    context.subscriptions.push(
      workspace.onDidChangeConfiguration((event) => {
        if (!event.affectsConfiguration("touchfish.wereadCookie")) return;
        const configuredCookie =
          workspace.getConfiguration("touchfish").get<string>("wereadCookie") || "";
        this.client.setCookie(configuredCookie);
      }),
    );
  }

  public override resolveWebviewView(webviewView: WebviewView) {
    this.webviewView = webviewView;
    const resolved = super.resolveWebviewView(webviewView);
    webviewView.onDidChangeVisibility(() => {
      if (webviewView.visible) {
        this.readReporter.resume();
        return;
      }
      void this.readReporter.pause();
    });
    webviewView.onDidDispose(() => {
      void this.readReporter.stop();
      this.webviewView = null;
    });
    return resolved;
  }

  protected async handleCustomMessage(
    message: IncomingMessage,
    webviewView: WebviewView,
  ) {
    const { command, payload } = message;

    try {
      switch (command) {
        case "WEREAD_GET_SHELF": {
          const result = await this.client.execute(web_shelf_sync, {});
          webviewView.webview.postMessage({
            command: "WEREAD_SHELF_DATA",
            payload: result,
          });
          break;
        }

        case "WEREAD_OPEN_BOOK": {
          const { title } = payload;
          window.showInformationMessage(`正在打开: ${title}`);
          break;
        }

        case "WEREAD_GET_CHAPTER": {
          const { bookId, chapterUid } = payload;
          const result = await this.client.execute(
            web_book_chapter_e,
            bookId,
            chapterUid,
          );

          webviewView.webview.postMessage({
            command: "WEREAD_CHAPTER_DATA",
            payload: result,
          });
          break;
        }

        case "WEREAD_GET_CATALOG": {
          const { bookId } = payload;
          // 注意：chapterInfos 接收数组
          const result = await this.client.execute(web_book_chapterInfos, [
            bookId,
          ]);
          webviewView.webview.postMessage({
            command: "WEREAD_CATALOG_DATA",
            payload: result,
          });
          break;
        }

        case "WEREAD_GET_PROGRESS": {
          const { bookId } = payload;
          const result = await this.client.execute(
            web_book_getProgress,
            bookId,
          );
          webviewView.webview.postMessage({
            command: "WEREAD_PROGRESS_DATA",
            payload: result,
          });
          break;
        }

        case "WEREAD_GET_UNDERLINES": {
          const { bookId, chapterUid } = payload;
          const result = await this.client.execute(
            web_book_underlines,
            bookId,
            chapterUid,
          );
          webviewView.webview.postMessage({
            command: "WEREAD_UNDERLINES_DATA",
            // 带回请求时的 chapterUid，便于前端丢弃过期响应
            payload: { ...result, chapterUid },
          });
          break;
        }

        case "WEREAD_GET_BEST_THOUGHTS": {
          const { bookId, chapterUid, range } = payload;
          const result = await this.client.execute(
            web_book_readReviews,
            bookId,
            chapterUid,
            range,
          );
          webviewView.webview.postMessage({
            command: "WEREAD_BEST_THOUGHTS_DATA",
            payload: result,
          });
          break;
        }

        case "WEREAD_READ_SESSION_START": {
          const { bookId, chapterUid, format } = payload || {};
          if (!bookId || chapterUid == null) break;
          await this.readReporter.start(bookId, chapterUid, format || "epub");
          break;
        }
        case "WEREAD_READ_SESSION_STOP": {
          await this.readReporter.stop();
          break;
        }
        case "WEREAD_READ_ACTIVITY": {
          this.readReporter.markActivity();
          break;
        }

        default:
          break;
      }
    } catch (error: any) {
      console.error("[Weread] 处理消息失败:", error);
      webviewView.webview.postMessage({
        command: "WEREAD_ERROR",
        payload: { message: error.message || "请求失败" },
      });
    }
  }
}
