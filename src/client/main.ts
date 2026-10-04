import { initNavigation } from "./ui/nav";
import { GameScreen } from "./screens/game";

const root = document.getElementById("app");
if (!root) throw new Error("#app root element missing");

const screens = initNavigation(root);
screens.show(new GameScreen());
