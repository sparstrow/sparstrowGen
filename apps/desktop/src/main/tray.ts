import { Menu, Tray, nativeImage } from "electron";
import { coreFetch } from "./core-client";

/** 16x16 solid indigo rounded square drawn as a raw BGRA bitmap — no asset file. */
function trayIcon(): Electron.NativeImage {
  const size = 16;
  const buf = Buffer.alloc(size * size * 4);
  const [b, g, r] = [246, 92, 99]; // #635CF6 indigo, BGRA order
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const corner =
        (x < 3 && y < 3 && (3 - x) + (3 - y) > 3) ||
        (x > 12 && y < 3 && (x - 12) + (3 - y) > 3) ||
        (x < 3 && y > 12 && (3 - x) + (y - 12) > 3) ||
        (x > 12 && y > 12 && (x - 12) + (y - 12) > 3);
      const i = (y * size + x) * 4;
      buf[i] = b;
      buf[i + 1] = g;
      buf[i + 2] = r;
      buf[i + 3] = corner ? 0 : 255;
    }
  }
  return nativeImage.createFromBitmap(buf, { width: size, height: size });
}

export interface TrayDeps {
  openWindow: () => void;
  quit: () => void;
}

export function createTray(deps: TrayDeps): Tray {
  const tray = new Tray(trayIcon());
  tray.setToolTip("Sparstrowgen");

  let schedulerEnabled = true;
  void coreFetch("/system/scheduler")
    .then((r) => r.json() as Promise<{ enabled: boolean }>)
    .then(({ enabled }) => {
      schedulerEnabled = enabled;
      rebuild();
    })
    .catch(() => undefined);

  const rebuild = () => {
    tray.setContextMenu(
      Menu.buildFromTemplate([
        { label: "Open Sparstrowgen", click: deps.openWindow },
        {
          label: schedulerEnabled ? "Pause scheduler" : "Resume scheduler",
          click: () => {
            void coreFetch("/system/scheduler", {
              method: "POST",
              body: { enabled: !schedulerEnabled },
            })
              .then((r) => r.json() as Promise<{ enabled: boolean }>)
              .then(({ enabled }) => {
                schedulerEnabled = enabled;
                rebuild();
              })
              .catch(() => undefined);
          },
        },
        { type: "separator" },
        { label: "Quit", click: deps.quit },
      ]),
    );
  };
  rebuild();

  tray.on("double-click", deps.openWindow);
  return tray;
}
