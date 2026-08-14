import {
  window,
  StatusBarAlignment,
  StatusBarItem,
  Disposable,
} from "vscode";

export type MusicModule = "xiaoyuzhou";

export interface PlaybackStatus {
  title: string;
  artist?: string;
  isPlaying: boolean;
  module: MusicModule;
}

export class MusicStatusBar implements Disposable {
  private static instance: MusicStatusBar;
  private statusBarItem: StatusBarItem;
  private playPauseButton: StatusBarItem;
  private nextButton: StatusBarItem;

  private activeModule: MusicModule | null = null;
  private isPlaying = false;
  private title = "";

  private constructor() {
    this.statusBarItem = window.createStatusBarItem(StatusBarAlignment.Left, 100);
    this.playPauseButton = window.createStatusBarItem(StatusBarAlignment.Left, 99);
    this.nextButton = window.createStatusBarItem(StatusBarAlignment.Left, 98);

    this.statusBarItem.command = "sidethread.music.openActive";
    this.playPauseButton.command = "sidethread.music.playPause";
    this.nextButton.command = "sidethread.music.next";

    this.statusBarItem.text = "$(music) 小宇宙";
    this.playPauseButton.text = "$(debug-start)";
    this.nextButton.text = "$(chevron-right)";

    this.hide();
  }

  public static getInstance(): MusicStatusBar {
    if (!MusicStatusBar.instance) {
      MusicStatusBar.instance = new MusicStatusBar();
    }
    return MusicStatusBar.instance;
  }

  public update(status: PlaybackStatus) {
    if (status.isPlaying) {
      this.activeModule = status.module;
      this.title = status.title;
      this.isPlaying = true;
    } else {
      if (this.activeModule !== status.module) {
        return;
      }
      this.isPlaying = false;
    }

    this.statusBarItem.text = `$(music) ${this.title}`;
    this.statusBarItem.tooltip = `正在播放 (小宇宙): ${this.title}${status.artist ? ` - ${status.artist}` : ""}\n点击: 打开播放器面板`;

    this.playPauseButton.text = this.isPlaying
      ? "$(debug-pause)"
      : "$(debug-start)";
    this.playPauseButton.tooltip = this.isPlaying ? "暂停" : "播放";

    this.statusBarItem.show();
    this.playPauseButton.show();
    this.nextButton.show();
  }

  public hide() {
    this.statusBarItem.hide();
    this.playPauseButton.hide();
    this.nextButton.hide();
  }

  public getActiveModule(): MusicModule | null {
    return this.activeModule;
  }

  public dispose() {
    this.statusBarItem.dispose();
    this.playPauseButton.dispose();
    this.nextButton.dispose();
  }
}
