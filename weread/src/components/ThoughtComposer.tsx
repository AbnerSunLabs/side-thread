import { Button, Input, Select, Space } from "antd";
import { useState } from "react";
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
    <div style={{ marginTop: 8 }}>
      <Input.TextArea
        value={content}
        onChange={e => setContent(e.target.value)}
        placeholder="写想法"
        autoSize={{ minRows: 2, maxRows: 4 }}
        disabled={submitting}
      />
      <Space style={{ marginTop: 8 }} wrap>
        <Select
          value={visibility}
          onChange={setVisibility}
          style={{ minWidth: 120 }}
          options={OPTIONS.map(value => ({
            value,
            label: THOUGHT_VISIBILITY_LABEL[value],
          }))}
          disabled={submitting}
        />
        <span>{THOUGHT_VISIBILITY_LABEL[visibility]}</span>
        <Button
          type="primary"
          size="small"
          disabled={!trimmed || submitting}
          loading={submitting}
          onClick={() => onSubmit(trimmed, visibility)}
        >
          发送
        </Button>
      </Space>
    </div>
  );
}
