import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: ["@sparstrow/ui", "@sparstrow/shared"],
  turbopack: {
    resolveAlias: {
      // @sparstrow/ui pages still import TanStack Router hooks. tsconfig `paths`
      // points those at the Next adapter for typechecking only — the bundler
      // would otherwise resolve the real package (present in
      // packages/ui/node_modules) and blow up without a RouterProvider.
      "@tanstack/react-router": "./src/lib/react-router-mock.tsx",
    },
  },
};

export default nextConfig;
