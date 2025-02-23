import express from "express";
import {
  handleEvents,
  handlePostMessage,
} from "../../controllers/chat.controller";

const router = express.Router();

router.get("/events", (req, res) => {
  const { handleMessage } = handleEvents(req, res);
  req.app.locals.handleMessage = handleMessage;
});

router.post("/message", (req, res) => {
  const handleMessage = req.app.locals.handleMessage;
  if (handleMessage) {
    handlePostMessage(req, res, handleMessage);
  } else {
    res.status(500).send("Event stream not initialized.");
  }
});

export default router;
