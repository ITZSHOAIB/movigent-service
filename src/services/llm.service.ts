import axios from "axios";

const LLM_API_URL = process.env.LLM_API_URL || "http://localhost:1234";
const LLM_ENDPOINT = `${LLM_API_URL}/v1/chat/completions`;

export type SendDataType = {
  type: "chat" | "end" | "error";
  text?: string;
};

export async function getLLMResponse(
  prompt: string,
  sendData: (data: SendDataType) => void
) {
  try {
    const systemPrompt = `
You are MoviGent, an AI exclusively designed to provide movie recommendations.
Your sole purpose is to assist users in finding movies they will enjoy.
You will ask clarifying questions to understand their preferences (genres, actors, directors, moods, etc.).
You will provide detailed movie recommendations, including genre, release year, and a brief description.
If a user asks a question that is NOT related to movie recommendations, you MUST respond with:
"I am MoviGent, a movie recommendation agent. I can only assist with movie-related inquiries."
You will NOT answer questions outside of this scope.
Speak in a friendly, conversational, and helpful tone.
`;

    const response = await axios.post(
      LLM_ENDPOINT,
      {
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: prompt },
        ],
        temperature: 0.7,
        stream: true,
      },
      {
        headers: {
          "Content-Type": "application/json",
          Accept: "text/event-stream",
        },
        responseType: "stream",
      }
    );

    const stream = response.data;

    stream.on("data", (chunk: Buffer) => {
      const lines = chunk
        .toString()
        .split("\n")
        .filter((line) => line.trim() !== "");

      for (const line of lines) {
        if (line.startsWith("data:")) {
          if (line.substring(6).trim() === "[DONE]") {
            return;
          }
          const message = JSON.parse(line.substring(6));
          if (
            message.choices &&
            message.choices.length > 0 &&
            message.choices[0].delta
          ) {
            const textChunk = message.choices[0].delta.content || "";
            sendData({ type: "chat", text: textChunk });
          }
        }
      }
    });

    stream.on("end", () => {
      sendData({ type: "end" });
    });

    stream.on("error", (error: Error) => {
      console.error("LM Studio stream error:", error);
      sendData({ type: "error", text: "An error occurred during streaming." });
      sendData({ type: "end" });
    });
  } catch (error) {
    if (axios.isAxiosError(error)) {
      console.error(
        "LM Studio API error:",
        error.response ? error.response.data : error.message
      );
    } else {
      console.error("LM Studio error:", error);
    }
    sendData({ type: "error", text: "An error occurred." });
    sendData({ type: "end" });
  }
}
