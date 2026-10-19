import { createBrowserRouter } from "react-router";
import { tools } from "../tools/registry";
import { ErrorPage } from "./ErrorPage";
import { Home } from "./Home";
import { NotFound } from "./NotFound";
import { Shell } from "./Shell";
import { ToolFrame } from "./ToolFrame";

/** Routes come from the registry: "/" lists tools, each tool lives at its own route. */
export const router = createBrowserRouter(
  [
    {
      element: <Shell />,
      errorElement: <ErrorPage />,
      children: [
        { index: true, element: <Home /> },
        ...tools.map((tool) => ({ path: tool.route, element: <ToolFrame tool={tool} /> })),
        { path: "*", element: <NotFound /> },
      ],
    },
  ],
  { basename: import.meta.env.BASE_URL },
);
