import React from "react";
import ReactDOM from "react-dom/client";
import "../index.css";
import { FriendsWindow } from "./FriendsWindow";

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <FriendsWindow />
  </React.StrictMode>,
);
