import { initNavigation } from "./ui/nav";
import { HomeScreen } from "./screens/home";

const root = document.getElementById("app");
if (!root) throw new Error("#app root element missing");

const screens = initNavigation(root);
screens.show(new HomeScreen());
