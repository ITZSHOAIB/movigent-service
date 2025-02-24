import {
  Annotation,
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

const LLM_API_URL = process.env.LLM_API_URL || "http://localhost:1234";
const LLM_ENDPOINT = `${LLM_API_URL}/v1`;

export type SendDataType = {
  type: "chat" | "end" | "error";
  text?: string;
};
export interface MoviePreferences {
  genres: string[];
  actors: string[];
  directors: string[];
  moods: string[];
}

// define graphstate which will be used to store messages along with movie preferences
const graphState = Annotation.Root({
  messages: Annotation<BaseMessage[]>({
    reducer: messagesStateReducer,
    default: () => [],
  }),
  likes: Annotation<MoviePreferences>({
    reducer: (left: MoviePreferences | undefined, right: MoviePreferences) => {
      if (!left) {
        return right;
      }
      return {
        genres: [...new Set([...(left.genres || []), ...(right.genres || [])])],
        actors: [...new Set([...(left.actors || []), ...(right.actors || [])])],
        directors: [
          ...new Set([...(left.directors || []), ...(right.directors || [])]),
        ],
        moods: [...new Set([...(left.moods || []), ...(right.moods || [])])],
      };
    },
    default: () => ({
      genres: [],
      actors: [],
      directors: [],
      moods: [],
    }),
  }),
  dislikes: Annotation<MoviePreferences>({
    reducer: (left: MoviePreferences | undefined, right: MoviePreferences) => {
      if (!left) {
        return right;
      }
      return {
        genres: [...new Set([...(left.genres || []), ...(right.genres || [])])],
        actors: [...new Set([...(left.actors || []), ...(right.actors || [])])],
        directors: [
          ...new Set([...(left.directors || []), ...(right.directors || [])]),
        ],
        moods: [...new Set([...(left.moods || []), ...(right.moods || [])])],
      };
    },
    default: () => ({
      genres: [],
      actors: [],
      directors: [],
      moods: [],
    }),
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
    messages: [...state.messages, new AIMessage(message)],
  };
}

// Extract preferences from user input
async function extractPreferences(state: typeof graphState.State) {
  const { messages, likes, dislikes } = state;
  const prompt = ChatPromptTemplate.fromMessages([
    ["system", extractPreferencesPrompt()],
    [
      "human",
      `Input: {messages}
      
      Current Preferences: 
      likes: {likes}, 
      dislikes: {dislikes}`,
    ],
  ]);
  const chain = prompt.pipe(model).pipe(new StringOutputParser());
  const response = await chain.invoke({
    messages,
    likes: likes,
    dislikes: dislikes,
  });

  try {
    const preferences: {
      likes: MoviePreferences;
      dislikes: MoviePreferences;
    } = JSON.parse(response.trim());
    const { likes, dislikes } = preferences;

    return { likes, dislikes };
  } catch (error) {
    console.log("Error parsing preferences", error);
    return state;
  }
}

// Suggest movies based on user preferences
async function suggestMovies(state: typeof graphState.State) {
  const likes = state.likes;
  const dislikes = state.dislikes;
  const messages = state.messages;
  const prompt = ChatPromptTemplate.fromMessages([
    ["system", suggestMoviesPrompt()],
    ["human", "{messages}"],
  ]);
  const chain = prompt.pipe(model).pipe(new StringOutputParser());

  let fullResponse = "";
  for await (const chunk of await chain.stream({
    likes,
    dislikes,
    messages,
  })) {
    fullResponse += chunk;
    if (globalSendData) globalSendData({ type: "chat", text: chunk });
  }
  if (globalSendData) globalSendData({ type: "end" });
  return { messages: [...state.messages, new AIMessage(fullResponse)] };
}

const graph = new StateGraph(graphState)
  .addNode("earlyResponse", earlyResponse)
  .addNode("extractPreferences", extractPreferences)
  .addNode("suggestMovies", suggestMovies)
  .addEdge(START, "earlyResponse")
  .addEdge("earlyResponse", "extractPreferences")
  .addEdge("extractPreferences", "suggestMovies")
  .addEdge("suggestMovies", END)
  .compile();

let globalSendData: (data: SendDataType) => void = () => {};
export const invokeGraph = async (
  prompt: string,
  sendData: (data: SendDataType) => void
) => {
  globalSendData = sendData;
  const currentState = memory.get("sessionId") || {
    messages: [],
    likes: { genres: [], actors: [], directors: [], moods: [] },
    dislikes: { genres: [], actors: [], directors: [], moods: [] },
    isFirstMessage: true,
  };

  // currentState.messages.push(new SystemMessage(systemPrompt));
  currentState.messages.push(new HumanMessage(prompt));

  const updatedState = await graph.invoke(currentState);

  memory.set("sessionId", updatedState);
  console.log("Updated state", updatedState);
};
