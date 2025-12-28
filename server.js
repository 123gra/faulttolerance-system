const express = require("express");
const bodyParser = require("body-parser");
const routes = require("./routes");

const app = express();
app.use(bodyParser.json());
const cors = require("cors");
app.use(cors());

app.use("/api", routes);

app.listen(3000, () => {
  console.log("Server running on http://localhost:3000");
});
