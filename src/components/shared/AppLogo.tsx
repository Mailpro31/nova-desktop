import React from "react";

import type { Connection } from "@/lib/bubble/connections";

/** Le logo officiel, ou une pastille à l'initiale dans la couleur de la marque. */
export const AppLogo: React.FC<{ connection: Connection; size: number }> = ({
  connection,
  size,
}) =>
  connection.logo ? (
    <img
      src={connection.logo}
      alt=""
      width={size}
      height={size}
      className="shrink-0 rounded-[4px] object-contain"
    />
  ) : (
    <span
      aria-hidden="true"
      style={{
        width: size,
        height: size,
        background: connection.color,
        fontSize: size * 0.62,
      }}
      className="flex shrink-0 items-center justify-center rounded-[4px] font-semibold leading-none text-white"
    >
      {connection.name.charAt(0)}
    </span>
  );
