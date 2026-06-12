export type ChatMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
};

export type DemoTopic = {
  id: string;
  title: string;
  messages: ChatMessage[];
  draft: string;
  createdAt: number;
  updatedAt: number;
};

const DEFAULT_DRAFT = "1+2=?";
const MAX_TITLE_LENGTH = 42;

export function createTopic(now = Date.now()): DemoTopic {
  return {
    id: `topic-${now}`,
    title: "New topic",
    messages: [],
    draft: DEFAULT_DRAFT,
    createdAt: now,
    updatedAt: now
  };
}

export function getTopicTitle(messages: ChatMessage[]) {
  const firstUserMessage = messages.find((message) => message.role === "user" && message.content.trim().length > 0);
  if (!firstUserMessage) {
    return "New topic";
  }

  const normalized = firstUserMessage.content.trim().replace(/\s+/g, " ");
  return normalized.length > MAX_TITLE_LENGTH ? `${normalized.slice(0, MAX_TITLE_LENGTH - 3).trimEnd()}...` : normalized;
}

export function updateTopicMessages(topic: DemoTopic, messages: ChatMessage[], now = Date.now()): DemoTopic {
  return {
    ...topic,
    title: getTopicTitle(messages),
    messages,
    updatedAt: now
  };
}

export function updateTopicDraft(topic: DemoTopic, draft: string, now = Date.now()): DemoTopic {
  return {
    ...topic,
    draft,
    updatedAt: now
  };
}

export function sortTopics(topics: DemoTopic[]) {
  return [...topics].sort((first, second) => second.updatedAt - first.updatedAt);
}

export function deleteTopic(topics: DemoTopic[], topicId: string): { topics: DemoTopic[]; activeTopicId: string } {
  const remainingTopics = sortTopics(topics.filter((topic) => topic.id !== topicId));
  const nextTopics = remainingTopics.length > 0 ? remainingTopics : [createTopic()];
  return { topics: nextTopics, activeTopicId: nextTopics[0].id };
}
