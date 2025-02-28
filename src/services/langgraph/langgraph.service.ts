import {
  Annotation,
  Command,
  END,
  messagesStateReducer,
  START,
  StateGraph,
} from "@langchain/langgraph";
import {
  AIMessage,
  type BaseMessage,
  HumanMessage,
} from "@langchain/core/messages";
import { ChatOpenAI } from "@langchain/openai";
import { ChatPromptTemplate } from "@langchain/core/prompts";
import { StringOutputParser } from "@langchain/core/output_parsers";
import { extractPreferencesPrompt } from "./prompts/extractPreferences.prompt";
import { suggestMoviesPrompt } from "./prompts/suggestMovies.prompt";
import { thinkingMessages, welcomeMessages } from "./messages";
import { investigatePreferencesPrompt } from "./prompts/investigatePreferences.prompt";

const LLM_API_URL = process.env.LLM_API_URL || "http://localhost:1234";
const LLM_ENDPOINT = `${LLM_API_URL}/v1`;

export type SendDataType = {
  type: "chat" | "end" | "error";
  text?: string;
};

// define graphstate which will be used to store messages along with movie preferences
const graphState = Annotation.Root({
  messages: Annotation<BaseMessage[]>({
    reducer: messagesStateReducer,
    default: () => [],
  }),
  preferences: Annotation<string>({
    reducer: (left: string, right: string) => right,
    default: () => "",
  }),
  isFirstMessage: Annotation<boolean>({
    reducer: (left: boolean | undefined, right: boolean) => right,
    default: () => true,
  }),
});
const model = new ChatOpenAI({
  configuration: {
    baseURL: LLM_ENDPOINT,
    apiKey: "dummy",
  },
  temperature: 0.7,
});
// In-memory store
const memory = new Map<string, typeof graphState.State>();

// Early response to user input
async function earlyResponse(state: typeof graphState.State) {
  const { isFirstMessage } = state;
  let message: string;
  if (isFirstMessage) {
    const randomIndex = Math.floor(Math.random() * welcomeMessages.length);
    message = welcomeMessages[randomIndex];
  } else {
    const randomIndex = Math.floor(Math.random() * thinkingMessages.length);
    message = thinkingMessages[randomIndex];
  }

  if (globalSendData) {
    globalSendData({ type: "chat", text: message });
    globalSendData({ type: "chat", text: "\n\n" });
  }
  return {
    isFirstMessage: false,
  };
}

async function extractPreferences(state: typeof graphState.State) {
  console.log("[extractPreferences] called");
  const { messages, preferences } = state;
  const prompt = ChatPromptTemplate.fromMessages([
    ["system", extractPreferencesPrompt()],
    [
      "human",
      `User Preferences: {preferences}
       User Message: {message}`,
    ],
  ]);
  const chain = prompt.pipe(model).pipe(new StringOutputParser());

  const humanMessages = messages.filter((msg) => msg.getType() === "human");
  const response = await chain.invoke({
    message: humanMessages[humanMessages.length - 1].content,
    preferences,
  });

  console.log("Extracted preferences - ", response);
  const [updatedPreferences, sufficiency] = response.split("|");

  const isSufficient = !sufficiency.includes("INSUFFICIENT");
  return new Command({
    update: {
      preferences: isSufficient ? updatedPreferences : preferences,
    },
    goto: isSufficient ? "suggestMovies" : "investigatePreferences",
  });
}

async function investigatePreferences(state: typeof graphState.State) {
  console.log("[investigatePreferences] called");
  const messages = state.messages;
  const preferences = state.preferences;
  const prompt = ChatPromptTemplate.fromMessages([
    ["system", investigatePreferencesPrompt()],
    [
      "human",
      `User Preferences: {preferences}
       User Message: {message}`,
    ],
  ]);
  const chain = prompt.pipe(model).pipe(new StringOutputParser());

  let fullResponse = "";
  const humanMessages = messages.filter((msg) => msg.getType() === "human");
  for await (const chunk of await chain.stream({
    message: humanMessages[humanMessages.length - 1].content,
    preferences,
  })) {
    fullResponse += chunk;
    if (globalSendData) globalSendData({ type: "chat", text: chunk });
  }
  if (globalSendData) globalSendData({ type: "end" });
  return { messages: [...state.messages, new AIMessage(fullResponse)] };
}

// Suggest movies based on user preferences
async function suggestMovies(state: typeof graphState.State) {
  console.log("[suggestMovies] called");
  const messages = state.messages;
  const preferences = state.preferences;
  const prompt = ChatPromptTemplate.fromMessages([
    ["system", suggestMoviesPrompt()],
    [
      "human",
      `User Preferences: {preferences}
      User Message: {message}`,
    ],
  ]);
  const chain = prompt.pipe(model).pipe(new StringOutputParser());

  let fullResponse = "";
  const humanMessages = messages.filter((msg) => msg.getType() === "human");
  for await (const chunk of await chain.stream({
    message: humanMessages[humanMessages.length - 1].content,
    preferences,
  })) {
    fullResponse += chunk;
    if (globalSendData) globalSendData({ type: "chat", text: chunk });
  }
  if (globalSendData) globalSendData({ type: "end" });
  return { messages: [...state.messages, new AIMessage(fullResponse)] };
}

const graph = new StateGraph(graphState)
  .addNode("earlyResponse", earlyResponse)
  .addNode("extractPreferences", extractPreferences, {
    ends: ["suggestMovies", "investigatePreferences"],
  })
  .addNode("investigatePreferences", investigatePreferences)
  .addNode("suggestMovies", suggestMovies)
  .addEdge(START, "earlyResponse")
  .addEdge("earlyResponse", "extractPreferences")
  .compile();

let globalSendData: (data: SendDataType) => void = () => {};
export const invokeGraph = async (
  prompt: string,
  sendData: (data: SendDataType) => void
) => {
  globalSendData = sendData;
  const currentState = memory.get("sessionId") || {
    messages: [],
    preferences: "",
    isFirstMessage: true,
  };

  currentState.messages.push(new HumanMessage(prompt));

  const updatedState = await graph.invoke(currentState);

  memory.set("sessionId", updatedState);
  // console.log("Updated state", updatedState);
};
