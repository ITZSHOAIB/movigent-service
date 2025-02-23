import express from "express";
import chatRoute from "./chat.route";

const router = express.Router();

router.use("/chat", chatRoute);

export default router;
