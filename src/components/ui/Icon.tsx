import Image from "next/image";
import { assets } from "@/lib/assets";
import type { CSSProperties } from "react";

type AssetKey = keyof typeof assets;

interface IconProps {
  name: AssetKey;
  size?: number;
  className?: string;
  style?: CSSProperties;
}

export function Icon({ name, size = 18, className = "", style }: IconProps) {
  return (
    <span
      className={`relative inline-flex shrink-0 items-center justify-center overflow-hidden ${className}`}
      style={{ width: size, height: size, ...style }}
    >
      <Image
        src={assets[name]}
        alt=""
        width={size}
        height={size}
        className="size-full object-contain"
      />
    </span>
  );
}
