import { describe, expect, test } from "vitest";

import { createTopic, deleteTopic, getTopicTitle, updateTopicMessages, type ChatMessage } from "./topics";

describe("topics", () => {
  test("creates a new topic with default draft", () => {
    expect(createTopic(100)).toEqual({
      id: "topic-100",
      title: "New topic",
      messages: [],
      draft: "1+2=?",
      createdAt: 100,
      updatedAt: 100
    });
  });

  test("uses first user message as topic title", () => {
    const messages: ChatMessage[] = [
      { id: "assistant-1", role: "assistant", content: "Hi" },
      { id: "user-1", role: "user", content: "Explain AIPocket in one sentence" }
    ];

    expect(getTopicTitle(messages)).toBe("Explain AIPocket in one sentence");
  });

  test("truncates long topic titles", () => {
    const messages: ChatMessage[] = [{ id: "user-1", role: "user", content: "This is a very long first message that should become shorter" }];

    expect(getTopicTitle(messages)).toBe("This is a very long first message that...");
  });

  test("updates messages and title", () => {
    const topic = createTopic(100);
    const messages: ChatMessage[] = [{ id: "user-1", role: "user", content: "Hello" }];

    expect(updateTopicMessages(topic, messages, 200)).toEqual({
      ...topic,
      title: "Hello",
      messages,
      updatedAt: 200
    });
  });

  test("deletes topic and selects latest remaining topic", () => {
    const first = { ...createTopic(100), id: "first", updatedAt: 100 };
    const second = { ...createTopic(200), id: "second", updatedAt: 300 };
    const result = deleteTopic([first, second], "second");

    expect(result).toEqual({ topics: [first], activeTopicId: "first" });
  });
});
