import { initNavigation } from "./ui/nav";
import { LobbyScreen } from "./screens/lobby";

const root = document.getElementById("app");
if (!root) throw new Error("#app root element missing");

const screens = initNavigation(root);
screens.show(new LobbyScreen());
