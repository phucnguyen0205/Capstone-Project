import Link from "next/link";
import { Icon } from "@/components/ui/Icon";

/**
 * The "PuLo" wordmark + gradient logo block used by both the global
 * Navbar and the /groups sub-page header. Centralising the markup keeps
 * the two headers pixel-identical on the left edge.
 */
export function HeaderLogo() {
  return (
    <Link href="/" className="flex items-center gap-2">
      <div
        className="flex size-9 items-center justify-center rounded-[18px]"
        style={{
          backgroundImage:
            "linear-gradient(45deg, rgb(255, 46, 147) 25%, rgb(255, 138, 86) 75%)",
        }}
      >
        <Icon name="zap" size={20} />
      </div>
      <p className="text-[22px] font-extrabold text-white">
        Pu
        <span
          className="bg-clip-text text-transparent"
          style={{
            backgroundImage:
              "linear-gradient(14deg, rgb(255, 46, 147) 25%, rgb(255, 138, 86) 75%)",
          }}
        >
          Lo
        </span>
      </p>
    </Link>
  );
}