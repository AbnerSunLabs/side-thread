import { Button, ConfigProvider, Input, Select } from "antd";
import { ReactNode, useState } from "react";
import {
  DEFAULT_THOUGHT_VISIBILITY,
  THOUGHT_VISIBILITY_LABEL,
  ThoughtVisibility,
} from "core-weread/wereadThoughts";

const OPTIONS: ThoughtVisibility[] = [
  "hideFromFriends",
  "public",
  "friends",
  "private",
];

const thoughtAntdTheme = {
  token: {
    borderRadius: 6,
    colorPrimary: "var(--vscode-button-background)",
    colorPrimaryHover: "var(--vscode-button-hoverBackground)",
    colorPrimaryActive: "var(--vscode-button-hoverBackground)",
    colorTextLightSolid: "var(--vscode-button-foreground)",
  },
  components: {
    Button: {
      primaryShadow: "none",
    },
    Input: {
      // 部分主题 focusBorder 与编辑器背景同色，描边改用按钮色
      activeBorderColor: "var(--vscode-button-background)",
      hoverBorderColor: "var(--vscode-button-hoverBackground)",
      activeShadow: "0 0 0 1px var(--vscode-button-background)",
    },
    Select: {
      activeBorderColor: "var(--vscode-button-background)",
      hoverBorderColor: "var(--vscode-button-hoverBackground)",
    },
  },
};

export function ThoughtTheme({ children }: { children: ReactNode }) {
  return <ConfigProvider theme={thoughtAntdTheme}>{children}</ConfigProvider>;
}

export function ThoughtComposer({
  submitting,
  onSubmit,
}: {
  submitting: boolean;
  onSubmit: (content: string, visibility: ThoughtVisibility) => void;
}) {
  const [content, setContent] = useState("");
  const [visibility, setVisibility] = useState<ThoughtVisibility>(
    DEFAULT_THOUGHT_VISIBILITY,
  );
  const trimmed = content.trim();
  return (
    <ThoughtTheme>
      <div className="thought-composer">
        <Input.TextArea
          value={content}
          onChange={e => setContent(e.target.value)}
          placeholder="写想法"
          autoSize={{ minRows: 2, maxRows: 4 }}
          disabled={submitting}
        />
        <div className="thought-composer-bar">
          <Select
            size="small"
            value={visibility}
            onChange={setVisibility}
            style={{ minWidth: 108 }}
            popupClassName="thought-select-dropdown"
            options={OPTIONS.map(value => ({
              value,
              label: THOUGHT_VISIBILITY_LABEL[value],
            }))}
            disabled={submitting}
          />
          <span className="thought-composer-vis">
            {THOUGHT_VISIBILITY_LABEL[visibility]}
          </span>
          <Button
            className="thought-composer-send"
            type="primary"
            size="small"
            disabled={!trimmed || submitting}
            loading={submitting}
            onClick={() => onSubmit(trimmed, visibility)}
          >
            发送
          </Button>
        </div>
      </div>
    </ThoughtTheme>
  );
}
