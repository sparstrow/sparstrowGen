"use client";

import dynamic from "next/dynamic";

// TerminalsPage pulls in @xterm/addon-fit, a browser-only UMD bundle that
// references `self` at module scope — evaluating it during prerendering throws
// "self is not defined". Loading it client-side only keeps the build green;
// `ssr: false` is legal here because this file is a Client Component.
const TerminalsPage = dynamic(
  () => import("./terminals").then((m) => m.TerminalsPage),
  { ssr: false },
);

export default function Page() {
  return <TerminalsPage />;
}
