import express from "express";
import cors from "cors";
import v1 from "./routes/v1";

const app = express();
app.use(cors());
app.use(express.json());

app.get("/ping", (_, res) => {
  res.send("pong");
});

app.use("/v1", v1);

const port = process.env.PORT || 3030;

app.listen(port, () => {
  console.log(`Server is running on port ${port}`);
});
