import { Outlet, ScrollRestoration } from "react-router";
import { ToastProvider } from "../shared/ui/Toast";
import "./app.css";

export function Shell() {
  return (
    <ToastProvider>
      <Outlet />
      <ScrollRestoration />
    </ToastProvider>
  );
}
