import React from "react";
import { Minus, Square, X } from "@phosphor-icons/react";
import { useRouter } from "@tanstack/react-router";
import t from "@shared/config";

type LayoutProps = {
  children?: React.ReactNode;
};

interface TopBarProps extends React.HTMLAttributes<HTMLDivElement> {}

const TopBar = ({ className, ...props }: TopBarProps) => {
  const { data: appVer } = t.version.useQuery();
  const { mutate: minimizeWindow } = t.window.minimize.useMutation();
  const { mutate: maximizeWindow } = t.window.maximize.useMutation();
  const { mutate: closeWindow } = t.window.closeWindow.useMutation();

  return (
    <div {...props} className="app-topbar">
      <div id="drag-region" className="app-topbar__drag">
        <div>
          <span className="app-topbar__title">Electron Projects</span>
          <span className="app-topbar__version">v{appVer}</span>
        </div>
      </div>
      <div className="window-controls">
        <button type="button" className="window-control" onClick={() => minimizeWindow()}>
          <Minus />
        </button>
        <button type="button" className="window-control" onClick={() => maximizeWindow()}>
          <Square />
        </button>
        <button
          type="button"
          className="window-control window-control--close"
          onClick={() => closeWindow()}
        >
          <X />
        </button>
      </div>
    </div>
  );
};

export default function Layout({ children }: LayoutProps) {
  const router = useRouter();

  React.useEffect(() => {
    if (
      router.state.location.pathname.toString().includes("renderer/index.html")
    ) {
      router.navigate({ to: "/" });
    }
  }, [router.navigate, router.state.location.pathname]);

  return (
    <div className="app-shell">
      <TopBar />
      <main className="app-content">{children}</main>
    </div>
  );
}
