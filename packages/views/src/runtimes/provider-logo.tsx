import * as React from "react";
import { cn } from "@sparstrow/ui/lib/utils";
import { Terminal } from "lucide-react";

export const ANTIGRAVITY_ICON =
  "data:image/webp;base64,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";

export const HERMES_ICON =
  "data:image/webp;base64,UklGRuYDAABXRUJQVlA4INoDAADQEwCdASowADAAPm0uk0ckIiGhKrqpWIANiWkAEyQea/fD8IewvGL5V7Nb3H8u/MA8G9rT+4flL+UfIe42/23GB8zPqF/o3E0UAP5h/h/+F6ZX+x5evnX/r+4T/K/67/u/zg7znogfrusMANZLkn1gvlY/vNsKubtj/9xLSzxTsLr7K9GLdFNs5rwtISRcPXvH4z57n2fg0XR3aQ2D+pPpycwyl7TwAAD+/2DbjivnePzfyHCsdOgJXKlUR/OgAkofD7K4AdmsPKyP5Ml4/4HBYmIm5/efn/H+X3IZtngyaUOvwbFuRS/1yODFYO3vf3qeXGgPdfgIROXd/EPT7K2jysfvY9N71+w6g2gBPs+P6lxYkPf6S9QfpvH/7Pp7i8xRh0nVDBTEQyczSz7V9hoqo4nDJuii+SfibZRR/d5zB+9jkcb1DNN7YnC5Y7+WfGrE3eseXt3hSm+NS5++m1MHbjsrd9z/Q4HPRP/C85Po41XObalGyIUcFUL2j2n3uI/Yh6U8r6trCUJFB4kT3fsv6+8ylX/d96y2hq869FCXLjq4YqEO8vs5BtT52sf7KyDxPAWkH/b06YbfVXf4/7y5THL6Sr/4mOrrY9P2LW81f05HHFN8n0jcyqKOH7AluMm0AHPgFyz8RVrfBdmnPiC2FLMQfNDte5yGFzGC3fMlDed/tS/PO3Q/hjsNLvAXUUjqHyCo3JeN69jyNgWjjf8iUqoBsXT+lJyp2r8p60ad1jxhNyTblyJwda8aWEw1hFDeGjpMGguDF66RL4c+ZO+PhculC6WxvCsZ7IPAsdD7/ywx3w3AowJ66hAAK7k+m6X2QV06OVOCwyIGERex/AUyuBbLUK93X58+M+Si7YfYjVYGpoJ7JvSgD8ExaA21z9OY+si+1wreacDanKnFDmhwBQC3t6MLeXCOGp3VURDKl10K7tdKHQcb4hr48ba+1x/MrMRwHfq3IQrDIXPYCg4b0OLnVN9JyXttKGM63B5imIdKuU0r6hhSslT10lGLjnIJuwO5WKR0RHs+BX5vs6H63y3K7IuuZ1eRN+Aczvbs4QuDs6ZRuzjJ/1DJ5R/3ZrFPrtxvMwT06vAXIgcbhLGNLhOQUYRPdUN5MgyCtL5NH71ArTPLRRkIjhGwoCYXKKqlqIKKT9NX3vwp/nlh4SX71dlYg/mPXbJ9bMeVugyjqFahjFTJ/rT3HtBCWG8h+OvvbOFDFKurCG9BOhO9B719OS7zsP0KPqoymnv7hVvoJyZp0iziCbBvaJpmF9Cvfs8/vWqWr7TUo616WfMW+X9nkgpuqtnfAAAAAA==";

export const CLAUDE_SVG_PATH =
  "m3.127 10.604 3.135-1.76.053-.153-.053-.085H6.11l-.525-.032-1.791-.048-1.554-.065-1.505-.08-.38-.081L0 7.832l.036-.234.32-.214.455.04 1.009.069 1.513.105 1.097.064 1.626.17h.259l.036-.105-.089-.065-.068-.064-1.566-1.062-1.695-1.121-.887-.646-.48-.327-.243-.306-.104-.67.435-.48.585.04.15.04.593.456 1.267.981 1.654 1.218.242.202.097-.068.012-.049-.109-.181-.9-1.626-.96-1.655-.428-.686-.113-.411a2 2 0 0 1-.068-.484l.496-.674L4.446 0l.662.089.279.242.411.94.666 1.48 1.033 2.014.302.597.162.553.06.17h.105v-.097l.085-1.134.157-1.392.154-1.792.052-.504.25-.605.497-.327.387.186.319.456-.045.294-.19 1.23-.37 1.93-.243 1.29h.142l.161-.16.654-.868 1.097-1.372.484-.545.565-.601.363-.287h.686l.505.751-.226.775-.707.895-.585.759-.839 1.13-.524.904.048.072.125-.012 1.897-.403 1.024-.186 1.223-.21.553.258.06.263-.218.536-1.307.323-1.533.307-2.284.54-.028.02.032.04 1.029.098.44.024h1.077l2.005.15.525.346.315.424-.053.323-.807.411-3.631-.863-.872-.218h-.12v.073l.726.71 1.331 1.202 1.667 1.55.084.383-.214.302-.226-.032-1.464-1.101-.565-.497-1.28-1.077h-.084v.113l.295.432 1.557 2.34.08.718-.112.234-.404.141-.444-.08-.911-1.28-.94-1.44-.759-1.291-.093.053-.448 4.821-.21.246-.484.186-.403-.307-.214-.496.214-.98.258-1.28.21-1.016.19-1.263.112-.42-.008-.028-.092.012-.953 1.307-1.448 1.957-1.146 1.227-.274.109-.477-.247.045-.44.266-.39 1.586-2.018.956-1.25.617-.723-.004-.105h-.036l-4.212 2.736-.75.096-.324-.302.04-.496.154-.162 1.267-.871z";

export interface ProviderLogoProps {
  providerId: string | null | undefined;
  className?: string;
}

export function ProviderLogo({ providerId, className }: ProviderLogoProps) {
  const id = (providerId ?? "").toLowerCase().trim();

  // Antigravity (Google / AGY runtime)
  if (id.includes("antigravity") || id === "agy") {
    return (
      <img
        src={ANTIGRAVITY_ICON}
        alt="Antigravity"
        className={cn("size-4 rounded-sm object-contain", className)}
      />
    );
  }

  // Claude (Anthropic Claude Code)
  if (id.includes("claude") || id.includes("anthropic")) {
    return (
      <svg
        viewBox="0 0 16 16"
        fill="#D97757"
        className={cn("size-4", className)}
        aria-hidden="true"
      >
        <path d={CLAUDE_SVG_PATH} />
      </svg>
    );
  }

  // Hermes (Nous Research / Anime Mascot)
  if (id.includes("hermes")) {
    return (
      <img
        src={HERMES_ICON}
        alt="Hermes"
        className={cn("size-4 rounded-sm object-contain", className)}
      />
    );
  }

  // Codex / OpenAI
  if (id.includes("codex") || id.includes("openai") || id.includes("gpt")) {
    return (
      <svg
        viewBox="0 0 16 16"
        fill="currentColor"
        className={cn("size-4 text-stone-200", className)}
        aria-hidden="true"
      >
        <path d="M14.949 6.547a3.94 3.94 0 0 0-.348-3.273 4.11 4.11 0 0 0-4.4-1.934A4.1 4.1 0 0 0 8.423.2 4.15 4.15 0 0 0 6.305.086a4.1 4.1 0 0 0-1.891.948 4.04 4.04 0 0 0-1.158 1.753 4.1 4.1 0 0 0-1.563.679A4 4 0 0 0 .554 4.72a3.99 3.99 0 0 0 .502 4.731 3.94 3.94 0 0 0 .346 3.274 4.11 4.11 0 0 0 4.402 1.933c.382.425.852.764 1.377.995.526.231 1.095.35 1.67.346 1.78.002 3.358-1.132 3.901-2.804a4.1 4.1 0 0 0 1.563-.68 4 4 0 0 0 1.14-1.253 3.99 3.99 0 0 0-.506-4.716m-6.097 8.406a3.05 3.05 0 0 1-1.945-.694l.096-.054 3.23-1.838a.53.53 0 0 0 .265-.455v-4.49l1.366.778q.02.011.025.035v3.722c-.003 1.653-1.361 2.992-3.037 2.996m-6.53-2.75a2.95 2.95 0 0 1-.36-2.01l.095.057L5.29 12.09a.53.53 0 0 0 .527 0l3.949-2.246v1.555a.05.05 0 0 1-.022.041L6.473 13.3c-1.454.826-3.311.335-4.15-1.098m-.85-6.94A3.02 3.02 0 0 1 3.07 3.949v3.785a.51.51 0 0 0 .262.451l3.93 2.237-1.366.779a.05.05 0 0 1-.048 0L2.585 9.342a2.98 2.98 0 0 1-1.113-4.094zm11.216 2.571L8.747 5.576l1.362-.776a.05.05 0 0 1 .048 0l3.265 1.86a3 3 0 0 1 1.173 1.207 2.96 2.96 0 0 1-.27 3.2 3.05 3.05 0 0 1-1.36.997V8.279a.52.52 0 0 0-.276-.445m1.36-2.015-.097-.057-3.226-1.855a.53.53 0 0 0-.53 0L6.249 6.153V4.598a.04.04 0 0 1 .019-.04L9.533 2.7a3.07 3.07 0 0 1 3.257.139c.474.325.843.778 1.066 1.303.223.526.289 1.103.191 1.664zM5.503 8.575 4.139 7.8a.05.05 0 0 1-.026-.037V4.049c0-.57.166-1.127.476-1.607s.752-.864 1.275-1.105a3.08 3.08 0 0 1 3.234.41l-.096.054-3.23 1.838a.53.53 0 0 0-.265.455zm.742-1.577 1.758-1 1.762 1v2l-1.755 1-1.762-1z" />
      </svg>
    );
  }

  // Cursor
  if (id.includes("cursor")) {
    return (
      <svg
        viewBox="600 300 400 400"
        fill="none"
        className={cn("size-4", className)}
        aria-hidden="true"
      >
        <path
          fill="#D6D5D2"
          d="M915.156 433.518C915.857 434.728 915.954 436.281 915.156 437.663L802.764 632.323C802.008 633.641 800 633.1 800 631.584V503.311C800 502.287 799.727 501.302 799.229 500.44L915.15 433.512H915.156V433.518Z"
        />
        <path
          fill="white"
          d="M915.155 433.518L799.233 500.445C798.741 499.588 798.023 498.86 797.134 498.345L686.049 434.209C684.731 433.453 685.272 431.445 686.788 431.445H911.566C913.162 431.445 914.459 432.307 915.155 433.518Z"
        />
      </svg>
    );
  }

  // OpenClaw
  if (id.includes("openclaw")) {
    return (
      <svg
        viewBox="0 0 16 16"
        fill="none"
        className={cn("size-4", className)}
        aria-hidden="true"
      >
        <path
          d="M8 2C5.5 2 3.5 4 3.5 6.5S5 10.5 6.5 11v1.5H8V11c.3.1.7.1 1 0v1.5h1.5V11c1.5-.5 3-2.5 3-4.5S10.5 2 8 2Z"
          fill="#E8453A"
        />
        <path d="M3.5 5.5C2 5 1 6 1.5 7s2 .5 2.2-.7" fill="#FF6B5A" />
        <path d="M12.5 5.5c1.5-.5 2.5.5 2 1.5s-2 .5-2.2-.7" fill="#FF6B5A" />
        <circle cx="6.2" cy="5.2" r="0.9" fill="#050810" />
        <circle cx="9.8" cy="5.2" r="0.9" fill="#050810" />
      </svg>
    );
  }

  // OpenCode
  if (id.includes("opencode")) {
    return (
      <svg
        viewBox="0 0 24 24"
        fill="none"
        className={cn("size-4", className)}
        aria-hidden="true"
      >
        <path d="M18 18H6V6H18V18Z" fill="#CFCECD" />
        <path d="M18 3H6V18H18V3ZM24 24H0V0H24V24Z" fill="#656363" />
      </svg>
    );
  }

  return <Terminal className={cn("size-4 text-muted-foreground", className)} aria-hidden="true" />;
}
