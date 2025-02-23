import type { Request, Response } from "express";
import { sendEvent, setupSSE } from "../utils/sse.util";
import { getLLMResponse } from "../services/llm.service";

export const handleEvents = (req: Request, res: Response) => {
  setupSSE(res);

  const handleMessage = async (message: { text: string }) => {
    await getLLMResponse(message.text, (data) => {
      sendEvent(res, data);
    });
  };

  req.on("close", () => {
    console.log("Client closed connection");
  });

  return { handleMessage };
};

export const handlePostMessage = (
  req: Request,
  res: Response,
  handleMessage: (message: { text: string }) => Promise<void>
) => {
  handleMessage(req.body);
  res.sendStatus(200);
};
